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
import time
import zipfile


def _deps_hash(packages):                                                        # Stable hash of a package list — changes only when deps change
    canonical = '|'.join(sorted(packages))
    return hashlib.sha256(canonical.encode()).hexdigest()[:12]


def versioned_name(base_name, packages):                                         # Combined zip name: base + hash of package list
    return f'{base_name}-{_deps_hash(packages)}'


def _ms(start):                                                                  # Milliseconds since start (for cold-start profiling)
    return f'{(time.time() - start) * 1000:.0f}ms'


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

        t0          = time.time()
        temp_folder = self._temp_folder()

        if temp_folder in sys.path:                                              # Already loaded in this container
            return f'{self.combined_name} (already in path)'

        if os.path.exists(temp_folder):                                          # Extracted in /tmp — warm container reuse
            sys.path.insert(0, temp_folder)
            print(f'[deps] /tmp cache hit — {_ms(t0)}')
            return f'{self.combined_name} (loaded from /tmp cache)'

        import boto3                                                             # Single STS call — not per package
        t_sts      = time.time()
        account_id = boto3.client('sts').get_caller_identity()['Account']
        region     = boto3.session.Session().region_name
        bucket     = f'{account_id}--osbot-lambdas--{region}'
        print(f'[deps] STS get_caller_identity — {_ms(t_sts)}')

        t_s3      = time.time()
        s3        = boto3.client('s3')
        response  = s3.get_object(Bucket=bucket, Key=self._s3_key())             # Single S3 download
        zip_bytes = response['Body'].read()
        print(f'[deps] S3 download ({len(zip_bytes)//1024}KB) — {_ms(t_s3)}')

        t_unzip = time.time()
        os.makedirs(temp_folder, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zip_ref:            # Single extraction
            zip_ref.extractall(temp_folder)
        print(f'[deps] zip extraction — {_ms(t_unzip)}')

        sys.path.insert(0, temp_folder)
        print(f'[deps] total load — {_ms(t0)}')
        return f'{self.combined_name} (loaded from S3)'


def load_combined_dependency(base_name, packages):                               # Drop-in replacement entry point for lambda_handler__user.py
    name = versioned_name(base_name, packages)
    return Lambda__Dependencies__Loader(name).load()
