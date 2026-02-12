# ===============================================================================
# SGraph Send - S3 Storage Backend
# Storage_FS implementation backed by AWS S3 via osbot-aws
# ===============================================================================

from typing                                                                     import List
from osbot_aws.AWS_Config                                                       import aws_config
from osbot_aws.aws.s3.S3                                                        import S3
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path import Safe_Str__File__Path
from osbot_utils.type_safe.type_safe_core.decorators.type_safe                  import type_safe
from osbot_utils.utils.Json                                                     import bytes_to_json
from memory_fs.storage_fs.Storage_FS                                            import Storage_FS


class Storage_FS__S3(Storage_FS):                                               # S3-backed Storage_FS implementation
    s3_bucket : str                                                             # S3 bucket name
    s3_prefix : str = ""                                                        # Optional key prefix
    s3        : S3  = None                                                      # S3 client (created on setup)

    def setup(self) -> 'Storage_FS__S3':                                        # Initialize S3 client and ensure bucket
        if self.s3 is None:
            self.s3 = S3()
        if self.s3.bucket_exists(self.s3_bucket) is False:
            region = aws_config.region_name()
            result = self.s3.bucket_create(bucket=self.s3_bucket, region=region)
            if result.get('status') != 'ok':
                raise Exception(f"Failed to create S3 bucket: {result}")
        return self

    def s3_key(self, path: Safe_Str__File__Path) -> str:                        # Convert path to S3 key with prefix
        key = str(path)
        if self.s3_prefix:
            prefix = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"
            key    = f"{prefix}{key}"
        return key

    @type_safe
    def file__bytes(self, path: Safe_Str__File__Path) -> bytes:                 # Read file bytes from S3
        key = self.s3_key(path)
        if self.file__exists(path):
            return self.s3.file_bytes(bucket=self.s3_bucket, key=key)
        return None

    @type_safe
    def file__delete(self, path: Safe_Str__File__Path) -> bool:                 # Delete file from S3
        key = self.s3_key(path)
        if self.file__exists(path) is True:
            return self.s3.file_delete(bucket=self.s3_bucket, key=key)
        return False

    @type_safe
    def file__exists(self, path: Safe_Str__File__Path) -> bool:                 # Check file existence in S3
        key = self.s3_key(path)
        return self.s3.file_exists(bucket=self.s3_bucket, key=key)

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
        return self.s3.file_create_from_bytes(file_bytes = data            ,
                                              bucket     = self.s3_bucket  ,
                                              key        = key             )

    @type_safe
    def file__str(self, path: Safe_Str__File__Path) -> str:                     # Read file as string from S3
        key = self.s3_key(path)
        if self.file__exists(path):
            return self.s3.file_contents(bucket=self.s3_bucket, key=key)
        return None

    def files__paths(self) -> List[Safe_Str__File__Path]:                       # List all file paths in bucket
        prefix  = self.s3_prefix if self.s3_prefix else ''
        s3_keys = self.s3.find_files(bucket=self.s3_bucket, prefix=prefix)
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
        s3_keys = self.s3.find_files(bucket=self.s3_bucket, prefix=prefix)
        if s3_keys:
            return self.s3.files_delete(bucket=self.s3_bucket, keys=s3_keys)
        return True
