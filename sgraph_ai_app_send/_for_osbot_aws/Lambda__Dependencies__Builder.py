# ===============================================================================
# _for_osbot_aws — Lambda__Dependencies__Builder
#
# Build-time counterpart to Lambda__Dependencies__Loader.
# Installs ALL Lambda dependencies into one directory, zips it, and uploads
# the single zip to S3. Replaces per-package zip uploads.
#
# Key properties:
#   - Content-addressable: S3 key includes a hash of the package list.
#     Same deps → same key → upload is idempotent (skip if exists).
#   - Single zip: no duplication of shared libraries (fastapi, boto3, etc.)
#
# To be contributed to osbot_aws once validated in production.
# ===============================================================================

import hashlib
import io
import os
import shutil
import subprocess
import zipfile

from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Loader import versioned_name


class Lambda__Dependencies__Builder:
    """
    Build and upload a single combined dependency zip.
    Called from Deploy__Service.upload_combined_dependencies_to_s3().
    """

    BASE_BUCKET_INFIX   = 'osbot-lambdas'                                        # Matches osbot_aws bucket naming convention
    LAMBDA_PLATFORM     = 'manylinux2014_x86_64'                                 # Lambda default is x86_64; manylinux2014 = glibc 2.17 (needed for pydantic-core)
    LAMBDA_PYTHON       = '3.13'                                                 # Must match Lambda runtime
    LAMBDA_ABI          = 'cp313'                                                # cpython 3.13

    # Top-level package dirs provided by the Lambda Python 3.13 runtime — safe to exclude from the zip
    LAMBDA_RUNTIME_PACKAGES = {'boto3', 'botocore', 's3transfer', 'jmespath', 'dateutil', 'six', 'urllib3'}

    def __init__(self, base_name, packages):
        self.base_name      = base_name                                          # e.g. 'sgraph-send-user'
        self.packages       = list(packages)                                     # full package list from user__config.py

    def combined_name(self):                                                     # Versioned name: base + hash of package list
        return versioned_name(self.base_name, self.packages)

    def s3_key(self):
        return f'lambdas-dependencies-combined/{self.combined_name()}.zip'

    def _bucket_name(self):
        import boto3
        account_id = boto3.client('sts').get_caller_identity()['Account']
        region     = boto3.session.Session().region_name
        return f'{account_id}--{self.BASE_BUCKET_INFIX}--{region}'

    def _s3_exists(self, s3_client, bucket):                                     # Check if the combined zip already exists in S3
        try:
            s3_client.head_object(Bucket=bucket, Key=self.s3_key())
            return True
        except Exception:
            return False

    def _build(self):                                                            # pip install targeting Lambda arm64/Python 3.13 platform
        target_dir = f'/tmp/combined-deps-build/{self.combined_name()}'
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
        os.makedirs(target_dir)

        subprocess.run(
            ['pip', 'install',
             '--target'        , target_dir            ,
             '--platform'      , self.LAMBDA_PLATFORM  ,
             '--python-version', self.LAMBDA_PYTHON    ,
             '--implementation', 'cp'                  ,
             '--abi'           , self.LAMBDA_ABI       ,
             '--only-binary=:all:'                     ,
             '--quiet'                                 ,
             ] + self.packages,
            check=True
        )
        return target_dir

    def _strip(self, directory):                                                  # Remove clutter and runtime-provided packages before zipping
        for root, dirs, files in os.walk(directory, topdown=True):
            to_delete = []
            for d in dirs:
                if d.endswith('.dist-info') or d == '__pycache__':               # metadata and bytecode cache — never needed at runtime
                    to_delete.append(d)
                elif root == directory and d in self.LAMBDA_RUNTIME_PACKAGES:    # already provided by Lambda runtime
                    to_delete.append(d)
            for d in to_delete:
                shutil.rmtree(os.path.join(root, d), ignore_errors=True)
            dirs[:] = [d for d in dirs if d not in to_delete]                   # don't descend into deleted dirs

            for f in files:
                if f.endswith(('.pyc', '.pyo', '.pyi')):                         # compiled bytecode and type stubs
                    os.remove(os.path.join(root, f))

        bin_dir = os.path.join(directory, 'bin')                                 # CLI entry-point scripts, not useful in Lambda
        if os.path.isdir(bin_dir):
            shutil.rmtree(bin_dir)

    def _zip_dir(self, directory):                                               # Zip directory contents into bytes
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(directory):
                for filename in files:
                    filepath = os.path.join(root, filename)
                    arcname  = os.path.relpath(filepath, directory)
                    zf.write(filepath, arcname)
        return buf.getvalue()

    def upload(self, force=False):                                               # Build and upload; skip if already in S3 (unless force=True)
        import boto3
        bucket = self._bucket_name()
        s3     = boto3.client('s3')

        if not force and self._s3_exists(s3, bucket):
            return dict(status       = 'skipped'          ,
                        combined_name = self.combined_name(),
                        s3_key        = self.s3_key()       ,
                        reason        = 'already exists in S3')

        target_dir = self._build()
        self._strip(target_dir)
        zip_bytes  = self._zip_dir(target_dir)
        shutil.rmtree(target_dir, ignore_errors=True)

        s3.put_object(Bucket=bucket, Key=self.s3_key(), Body=zip_bytes)

        return dict(status        = 'uploaded'          ,
                    combined_name = self.combined_name() ,
                    s3_key        = self.s3_key()        ,
                    size_bytes    = len(zip_bytes)       )
