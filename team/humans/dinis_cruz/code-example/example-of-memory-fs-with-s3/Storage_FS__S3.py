from typing                                                                       import List, Optional
from osbot_aws.AWS_Config                                                         import aws_config
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path import Safe_Str__File__Path
from osbot_utils.type_safe.type_safe_core.decorators.type_safe                    import type_safe
from osbot_utils.utils.Http                                                       import url_join_safe
from osbot_utils.utils.Json                                                       import bytes_to_json
from osbot_aws.aws.s3.S3                                                          import S3
from memory_fs.storage_fs.Storage_FS                                              import Storage_FS

# todo: see if we should move this to the boto3-fs project
class Storage_FS__S3(Storage_FS):
    s3_bucket    : str                                                                  # S3 bucket name for storage
    s3_prefix    : str = ""                                                             # Optional prefix for all keys
    s3           : S3  = None                                                           # S3 instance (will be created if not provided)
    
    def setup(self) -> 'Storage_FS__S3':                                                # Initialize S3 client if not provided
        if self.s3 is None:
            self.s3 = S3()

        if not self.s3.bucket_exists(self.s3_bucket):                                   # Ensure bucket exists
            region = aws_config.region_name()                                           # Get region from AWS config
            result = self.s3.bucket_create(bucket=self.s3_bucket, region=region)
            if result.get('status') != 'ok':
                raise Exception(f"Failed to create S3 bucket {self.s3_bucket}: {result}")
        
        return self
    
    def _get_s3_key(self, path: Safe_Str__File__Path) -> str:                                       # Convert file path to S3 key with optional prefix
        key = str(path)
        if self.s3_prefix:
            prefix = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"       # Ensure prefix ends with / if it's not empty
            key = f"{prefix}{key}"
        return key
    
    def _get_path_from_key(self, s3_key: str) -> Safe_Str__File__Path:                              # Convert S3 key back to path
        if self.s3_prefix:
            prefix = self.s3_prefix if self.s3_prefix.endswith('/') else f"{self.s3_prefix}/"
            if s3_key.startswith(prefix):
                s3_key = s3_key[len(prefix):]
        return Safe_Str__File__Path(s3_key)
    
    @type_safe
    def file__bytes(self, path: Safe_Str__File__Path                                                # Read file content as bytes from S3
                    ) -> Optional[bytes]:
        s3_key = self._get_s3_key(path)
        if self.file__exists(path):
            return self.s3.file_bytes(bucket=self.s3_bucket, key=s3_key)
        return None
    
    @type_safe
    def file__delete(self, path: Safe_Str__File__Path                                  # Delete a file from S3
                     ) -> bool:
        s3_key = self._get_s3_key(path)
        if self.file__exists(path) is True:
            return self.s3.file_delete(bucket=self.s3_bucket, key=s3_key)
        return False
    
    @type_safe
    def file__exists(self, path: Safe_Str__File__Path                                  # Check if file exists in S3
                     ) -> bool:
        s3_key = self._get_s3_key(path)
        return self.s3.file_exists(bucket=self.s3_bucket, key=s3_key)

    # todo: review why we are having issues with the return type
    @type_safe
    def file__json(self, path: Safe_Str__File__Path                                                 # Read file content as bytes from S3
                    ):     # : -> Optional[bytes]:          #   todo: review this usafe since it was cause some exceptions on the fast_api service
        file_bytes = self.file__bytes(path)
        if file_bytes:
            return bytes_to_json(file_bytes)
        return None
    
    @type_safe
    def file__save(self, path: Safe_Str__File__Path,                                   # Save bytes to S3
                         data: bytes
                   ) -> bool:
        s3_key = self._get_s3_key(path)
        return self.s3.file_create_from_bytes(
            file_bytes=data,
            bucket=self.s3_bucket,
            key=s3_key
        )
    
    @type_safe
    def file__str(self, path: Safe_Str__File__Path                                     # Read file content as string from S3
                  ) -> Optional[str]:
        s3_key = self._get_s3_key(path)
        if self.file__exists(path):
            return self.s3.file_contents(bucket=self.s3_bucket, key=s3_key)
        return None
    
    def files__paths(self) -> List[Safe_Str__File__Path]:                              # List all file paths in S3 bucket
        # Use find_files to get all keys with the prefix
        prefix = self.s3_prefix if self.s3_prefix else ''
        s3_keys = self.s3.find_files(bucket=self.s3_bucket, prefix=prefix)
        
        # Convert S3 keys back to paths
        paths = []
        for s3_key in s3_keys:
            path = self._get_path_from_key(s3_key)
            paths.append(path)
        
        return sorted(paths)
    
    def clear(self) -> bool:                                                           # Clear all files in the storage (within prefix)
        # Get all files with the current prefix
        prefix = self.s3_prefix if self.s3_prefix else ''
        s3_keys = self.s3.find_files(bucket=self.s3_bucket, prefix=prefix)
        
        if s3_keys:
            # Use files_delete for batch deletion
            return self.s3.files_delete(bucket=self.s3_bucket, keys=s3_keys)
        
        return True
    
    # Additional S3-specific methods
    
    def file__metadata(self, path: Safe_Str__File__Path) -> Optional[dict]:            # Get S3 file metadata
        s3_key = self._get_s3_key(path)
        if self.file__exists(path):
            return self.s3.file_metadata(bucket=self.s3_bucket, key=s3_key)
        return None
    
    def file__metadata_update(self, path: Safe_Str__File__Path,                        # Update S3 file metadata
                              metadata: dict
                              ) -> bool:
        s3_key = self._get_s3_key(path)
        if self.file__exists(path):
            result = self.s3.file_metadata_update(
                bucket=self.s3_bucket,
                key=s3_key,
                metadata=metadata
            )
            return result is not None
        return False
    
    def file__copy(self, source_path: Safe_Str__File__Path,                            # Copy file within S3
                         dest_path: Safe_Str__File__Path
                   ) -> bool:
        source_key = self._get_s3_key(source_path)
        dest_key = self._get_s3_key(dest_path)
        
        if self.file__exists(source_path):
            result = self.s3.file_copy(
                bucket_source=self.s3_bucket,
                key_source=source_key,
                bucket_destination=self.s3_bucket,
                key_destination=dest_key
            )
            return result is not None
        return False
    
    def file__move(self, source_path: Safe_Str__File__Path,                            # Move file within S3
                         dest_path: Safe_Str__File__Path
                   ) -> bool:
        source_key = self._get_s3_key(source_path)
        dest_key = self._get_s3_key(dest_path)
        
        if self.file__exists(source_path):
            return self.s3.file_move(src_bucket=self.s3_bucket,
                                     src_key=source_key,
                                     dest_bucket=self.s3_bucket,
                                     dest_key=dest_key )
        return False
    
    def file__size(self, path: Safe_Str__File__Path) -> Optional[int]:                 # Get file size in bytes
        s3_key = self._get_s3_key(path)
        if self.file__exists(path):
            details = self.s3.file_details(bucket=self.s3_bucket, key=s3_key)
            if details:
                return details.get('ContentLength')
        return None
    
    def file__last_modified(self, path: Safe_Str__File__Path) -> Optional[str]:        # Get last modified time
        s3_key = self._get_s3_key(path)
        if self.file__exists(path):
            details = self.s3.file_details(bucket=self.s3_bucket, key=s3_key)
            if details:
                last_modified = details.get('LastModified')
                if last_modified:
                    return last_modified.isoformat()
        return None

    def folder__folders(self, parent_folder='', return_full_path=False):
        kwargs = dict(s3_bucket        = self.s3_bucket  ,
                      parent_folder    = parent_folder   ,
                      return_full_path = return_full_path)
        return self.s3.folder_list(**kwargs)

    def folder__files__all(self, parent_folder: str):
        kwargs = dict(bucket    = self.s3_bucket  ,
                      prefix    = parent_folder   )
        return self.s3.find_files(**kwargs)

    def folder__files(self, folder_path: str,                                          # List files in a specific folder
                            return_full_path: bool = False
                      ) -> List[Safe_Str__File__Path]:
        # Combine prefix with folder path
        if self.s3_prefix:
            full_prefix = url_join_safe(str(self.s3_prefix), str(folder_path))
        else:
            full_prefix = folder_path
        
        # Use S3's folder_files method
        files = self.s3.folder_files(s3_bucket        =  self.s3_bucket,
                                     parent_folder    = full_prefix    ,
                                     return_full_path = True           ) # Always get full path from S3
        
        # Convert to Safe_Str__File__Path objects
        paths = []
        for file_key in files:
            if return_full_path:
                path = Safe_Str__File__Path(file_key)
            else:
                path = self._get_path_from_key(file_key)
            paths.append(path)
        
        return sorted(paths)
    
    def pre_signed_url(self, path: Safe_Str__File__Path,                               # Generate pre-signed URL for file access
                             operation: str = 'get_object',
                             expiration: int = 3600
                       ) -> Optional[str]:
        s3_key = self._get_s3_key(path)
        return self.s3.create_pre_signed_url(
            bucket_name=self.s3_bucket,
            object_name=s3_key,
            operation=operation,
            expiration=expiration
        )
    
    def bucket_versioning_enabled(self) -> bool:                                       # Check if versioning is enabled
        return self.s3.bucket_versioning__enabled(self.s3_bucket)
    
    def file__versions(self, path: Safe_Str__File__Path) -> Optional[list]:            # Get file versions (if versioning enabled)
        s3_key = self._get_s3_key(path)
        return self.s3.file_versions(bucket=self.s3_bucket, key=s3_key)