# ===============================================================================
# SGraph Send - S3 Storage Backend
# Storage_FS implementation backed by AWS S3 via osbot-aws
# ===============================================================================

from typing                                                                     import List
from botocore.exceptions                                                        import ClientError
from osbot_aws.AWS_Config                                                       import aws_config
from osbot_aws.aws.s3.S3                                                        import S3

S3_NOT_FOUND_CODES = ('NoSuchKey', 'NoSuchBucket', 'NotFound', '404')           # ClientError codes that mean "key absent", not a real failure
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path import Safe_Str__File__Path
from osbot_utils.type_safe.type_safe_core.decorators.type_safe                  import type_safe
from osbot_utils.utils.Json                                                     import bytes_to_json
from memory_fs.storage_fs.Storage_FS                                            import Storage_FS


class Storage_FS__S3(Storage_FS):                                               # S3-backed Storage_FS implementation
    s3_bucket : str                                                             # S3 bucket name
    s3_prefix : str = ""                                                        # Optional key prefix
    s3        : S3  = None                                                      # S3 client (lazy — created on first use, not at Lambda init)

    def setup(self) -> 'Storage_FS__S3':                                        # Register bucket name — does NOT create boto3 client or make S3 calls
        return self                                                              # SnapStart-safe: boto3 client created on first request, not during snapshot

    def _s3(self) -> S3:                                                        # Lazy S3 client — created after SnapStart restore on first actual request
        if self.s3 is None:
            self.s3 = S3()
        return self.s3

    def _ensure_bucket(self):                                                   # Call explicitly when bucket creation is needed (local dev / first deploy)
        s3 = self._s3()
        if s3.bucket_exists(self.s3_bucket) is False:
            region = aws_config.region_name()
            result = s3.bucket_create(bucket=self.s3_bucket, region=region)
            if result.get('status') != 'ok':
                raise Exception(f"Failed to create S3 bucket: {result}")

    def s3_key(self, path: Safe_Str__File__Path) -> str:                        # Convert path to S3 key with prefix
        key = str(path)
        if self.s3_prefix:
            prefix = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"
            key    = f"{prefix}{key}"
        return key

    @staticmethod
    def _is_not_found(error: ClientError) -> bool:                              # True when a boto ClientError signals an absent key (vs a real failure)
        code = (getattr(error, 'response', None) or {}).get('Error', {}).get('Code', '')
        return code in S3_NOT_FOUND_CODES

    @type_safe
    def file__bytes(self, path: Safe_Str__File__Path) -> bytes:                 # Read file bytes from S3
        key = self.s3_key(path)
        try:                                                                    # Single GetObject; catch the missing-key error instead of a pre-HeadObject
            return self._s3().file_bytes(bucket=self.s3_bucket, key=key)        # (saves 1 S3 call on every read; matches Memory backend's None-on-miss)
        except ClientError as error:
            if self._is_not_found(error):
                return None
            raise

    @type_safe
    def file__delete(self, path: Safe_Str__File__Path) -> bool:                 # Delete file from S3
        key = self.s3_key(path)
        if self.file__exists(path) is True:
            return self._s3().file_delete(bucket=self.s3_bucket, key=key)
        return False

    @type_safe
    def file__exists(self, path: Safe_Str__File__Path) -> bool:                 # Check file existence in S3
        key = self.s3_key(path)
        return self._s3().file_exists(bucket=self.s3_bucket, key=key)

    @type_safe
    def file__json(self, path: Safe_Str__File__Path):                           # Read file as JSON from S3
        file_bytes = self.file__bytes(path)
        if file_bytes:
            return bytes_to_json(file_bytes)
        return None

    @type_safe
    def file__save(self, path: Safe_Str__File__Path,                            # Save bytes to S3
                         data: bytes
                   ) -> bool:
        key = self.s3_key(path)
        return self._s3().file_create_from_bytes(file_bytes = data            ,
                                                 bucket     = self.s3_bucket  ,
                                                 key        = key             )

    @type_safe
    def file__str(self, path: Safe_Str__File__Path) -> str:                     # Read file as string from S3
        key = self.s3_key(path)
        try:                                                                    # Single GetObject; catch missing-key instead of a pre-HeadObject (see file__bytes)
            return self._s3().file_contents(bucket=self.s3_bucket, key=key)
        except ClientError as error:
            if self._is_not_found(error):
                return None
            raise

    def folder__files__all(self, parent_folder) -> List[Safe_Str__File__Path]:   # List files under a specific prefix (scoped S3 list)
        s3_prefix = self.s3_key(parent_folder)
        if not s3_prefix.endswith('/'):
            s3_prefix += '/'
        s3_keys = self._s3().find_files(bucket=self.s3_bucket, prefix=s3_prefix)
        paths   = []
        for s3_key in s3_keys:
            if self.s3_prefix:
                pfx = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"
                if s3_key.startswith(pfx):
                    s3_key = s3_key[len(pfx):]
            paths.append(Safe_Str__File__Path(s3_key))
        return sorted(paths)

    def folder__folders(self, parent_folder,                                     # List immediate subfolder names under a prefix (derived from keys)
                              return_full_path: bool = True
                       ) -> List[Safe_Str__File__Path]:
        scoped     = str(parent_folder)                                          # base path (no s3_prefix) used to strip the remainder
        if scoped and not scoped.endswith('/'):
            scoped += '/'
        s3_prefix  = self.s3_key(parent_folder)                                  # full S3 prefix (with optional s3_prefix) for the list call
        if not s3_prefix.endswith('/'):
            s3_prefix += '/'
        s3_keys    = self._s3().find_files(bucket=self.s3_bucket, prefix=s3_prefix)
        subfolders = set()
        for s3_key in s3_keys:
            key = s3_key
            if self.s3_prefix:                                                   # strip optional s3_prefix to get the application-relative key
                pfx = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"
                if key.startswith(pfx):
                    key = key[len(pfx):]
            if not key.startswith(scoped):
                continue
            remainder = key[len(scoped):]
            parts     = remainder.split('/')
            if len(parts) <= 1:                                                  # a file directly in the folder, not a subfolder
                continue
            first = parts[0]
            if not first:
                continue
            if return_full_path:
                subfolders.add(Safe_Str__File__Path(f'{scoped}{first}'))
            else:
                subfolders.add(Safe_Str__File__Path(first))
        return sorted(subfolders)

    def files__paths(self) -> List[Safe_Str__File__Path]:                       # List all file paths in bucket
        prefix  = self.s3_prefix if self.s3_prefix else ''
        s3_keys = self._s3().find_files(bucket=self.s3_bucket, prefix=prefix)
        paths   = []
        for s3_key in s3_keys:
            if self.s3_prefix:
                pfx = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"
                if s3_key.startswith(pfx):
                    s3_key = s3_key[len(pfx):]
            paths.append(Safe_Str__File__Path(s3_key))
        return sorted(paths)

    def clear(self) -> bool:                                                    # Clear all files within prefix
        prefix  = self.s3_prefix if self.s3_prefix else ''
        s3_keys = self._s3().find_files(bucket=self.s3_bucket, prefix=prefix)
        if s3_keys:
            return self._s3().files_delete(bucket=self.s3_bucket, keys=s3_keys)
        return True
