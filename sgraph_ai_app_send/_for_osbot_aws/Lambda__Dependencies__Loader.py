# ===============================================================================
# _for_osbot_aws — Lambda__Dependencies__Loader
#
# Replaces osbot_aws.aws.lambda_.boto3__lambda.load_dependencies().
#
# Problems with the original:
#   1. boto3.client('sts').get_caller_identity() called ONCE PER PACKAGE
#      → 6 STS network calls for 6 packages (~900ms wasted)
#   2. One S3 download + one zip extraction per package (serial, undeduped)
#   3. sys.path.append() — no /tmp reuse check across warm invocations
#
# This class downloads ONE combined zip that was built by Lambda__Dependencies__Builder.
# Single STS call. Single S3 download. Single extraction.
#
# To be contributed to osbot_aws once validated in production.
# ===============================================================================

import hashlib
import io
import os
import sys
import zipfile


def _deps_hash(packages):                                                        # Stable hash of a package list — changes only when deps change
    canonical = '|'.join(sorted(packages))
    return hashlib.sha256(canonical.encode()).hexdigest()[:12]


def versioned_name(base_name, packages):                                         # Combined zip name: base + hash of package list
    return f'{base_name}-{_deps_hash(packages)}'


class Lambda__Dependencies__Loader:
    """
    Download and load a single combined dependency zip from S3.
    Fixes the per-package STS + S3 call pattern in osbot_aws.load_dependencies().
    """

    def __init__(self, combined_name):
        self.combined_name = combined_name                                        # e.g. 'sgraph-send-user-abc123def456'

    def _account_id(self):
        import boto3
        return boto3.client('sts').get_caller_identity()['Account']

    def _region(self):
        import boto3
        return boto3.session.Session().region_name

    def _bucket_name(self):
        return f'{self._account_id()}--osbot-lambdas--{self._region()}'

    def _s3_key(self):
        return f'lambdas-dependencies-combined/{self.combined_name}.zip'

    def _temp_folder(self):
        return f'/tmp/lambdas-dependencies-combined/{self.combined_name}'

    def load(self):
        if os.getenv('AWS_REGION') is None:                                      # Not inside Lambda — skip
            return None

        temp_folder = self._temp_folder()

        if temp_folder in sys.path:                                              # Already loaded in this container
            return f'{self.combined_name} (already in path)'

        if os.path.exists(temp_folder):                                          # Extracted in /tmp — warm container reuse
            sys.path.insert(0, temp_folder)
            return f'{self.combined_name} (loaded from /tmp cache)'

        import boto3                                                             # Single STS call — not per package
        account_id = boto3.client('sts').get_caller_identity()['Account']
        region     = boto3.session.Session().region_name
        bucket     = f'{account_id}--osbot-lambdas--{region}'
        s3_key     = self._s3_key()

        s3        = boto3.client('s3')
        response  = s3.get_object(Bucket=bucket, Key=s3_key)                     # Single S3 download
        zip_bytes = response['Body'].read()

        os.makedirs(temp_folder, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zip_ref:            # Single extraction
            zip_ref.extractall(temp_folder)

        sys.path.insert(0, temp_folder)
        return f'{self.combined_name} (loaded from S3)'


def load_combined_dependency(base_name, packages):                               # Drop-in replacement entry point for lambda_handler__user.py
    name = versioned_name(base_name, packages)
    return Lambda__Dependencies__Loader(name).load()
