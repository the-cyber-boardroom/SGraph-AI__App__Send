from memory_fs.storage_fs.Storage_FS                                                     import Storage_FS
from memory_fs.storage_fs.providers.Storage_FS__Local_Disk                               import Storage_FS__Local_Disk
from memory_fs.storage_fs.providers.Storage_FS__Memory                                   import Storage_FS__Memory
from memory_fs.storage_fs.providers.Storage_FS__Sqlite                                   import Storage_FS__Sqlite
from memory_fs.storage_fs.providers.Storage_FS__Zip                                      import Storage_FS__Zip
from mgraph_ai_service_cache_client.schemas.consts.const__Storage                        import ENV_VAR__CACHE__SERVICE__LOCAL_DISK_PATH, ENV_VAR__CACHE__SERVICE__SQLITE_PATH, ENV_VAR__CACHE__SERVICE__ZIP_PATH, ENV_VAR__CACHE__SERVICE__STORAGE_MODE
from mgraph_ai_service_cache.service.storage.Storage_FS__S3                              import Storage_FS__S3
from mgraph_ai_service_cache.utils.for_osbot_utils.Env                                   import get_env_enum
from osbot_utils.type_safe.Type_Safe                                                     import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                     import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id          import Safe_Str__Id
from osbot_utils.utils.Env                                                               import get_env
from mgraph_ai_service_cache_client.schemas.cache.enums.Enum__Cache__Storage_Mode        import Enum__Cache__Storage_Mode
from mgraph_ai_service_cache_client.schemas.consts.const__Fast_API                       import (ENV_VAR__CACHE__SERVICE__BUCKET_NAME,
                                                                                                 ENV_VAR__CACHE__SERVICE__DEFAULT_TTL_HOURS,
                                                                                                 DEFAULT__CACHE__SERVICE__BUCKET_NAME,
                                                                                                 DEFAULT__CACHE__SERVICE__DEFAULT_TTL_HOURS)


# todo: refactor all the parms below to an Schema__Cache__Config
class Cache__Config(Type_Safe):                                                             # Configuration for cache service
    storage_mode      : Enum__Cache__Storage_Mode     = None                                # Storage backend mode
    default_bucket    : Safe_Str__Id                  = None                                # S3 bucket (for S3 mode)
    default_ttl_hours : Safe_UInt                     = None                                # TTL for cache entries
    local_disk_path   : str                           = None                                # Path for local disk storage
    sqlite_path       : str                           = None                                # Path for SQLite storage
    zip_path          : str                           = None                                # Path for ZIP storage

    # todo: see if we can move this __init__ actions to a setup() class since it is never good to have any changes done on __init__
    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        if self.storage_mode is None:                                                       # Auto-configure if values not provided
            self.storage_mode = self.determine_storage_mode()

        self.configure_for_storage_mode()                                                   # Set defaults based on storage mode

    def determine_storage_mode(self) -> Enum__Cache__Storage_Mode:                                          # Auto-detect best storage mode
        explicit_mode = get_env_enum(ENV_VAR__CACHE__SERVICE__STORAGE_MODE, Enum__Cache__Storage_Mode)      # Check for explicit mode configuration
        if explicit_mode:
            return explicit_mode

        if self.has_aws_credentials():                                                                      # Check if AWS credentials are available for S3
            return Enum__Cache__Storage_Mode.S3

        return Enum__Cache__Storage_Mode.MEMORY                                                             # Default to memory mode

    # todo: refactor this with a check from osbot_aws
    def has_aws_credentials(self) -> bool:                                                  # Check if AWS credentials are available
        # Check for AWS credentials in various forms
        if get_env('AWS_ACCESS_KEY_ID') and get_env('AWS_SECRET_ACCESS_KEY'):
            return True
        if get_env('AWS_PROFILE'):
            return True
        if get_env('AWS_REGION') and get_env('AWS_LAMBDA_FUNCTION_NAME'):                   # In Lambda
            return True
        return False

    def configure_for_storage_mode(self):                                                   # Set configuration based on storage mode
        if self.default_ttl_hours is None:                                                  # Configure TTL (applies to all modes)
            self.default_ttl_hours = get_env(ENV_VAR__CACHE__SERVICE__DEFAULT_TTL_HOURS,
                                             DEFAULT__CACHE__SERVICE__DEFAULT_TTL_HOURS)

        if self.storage_mode == Enum__Cache__Storage_Mode.S3:                               # Mode-specific configuration
            if self.default_bucket is None:
                self.default_bucket = get_env(ENV_VAR__CACHE__SERVICE__BUCKET_NAME,
                                              DEFAULT__CACHE__SERVICE__BUCKET_NAME)

        elif self.storage_mode == Enum__Cache__Storage_Mode.LOCAL_DISK:
            if self.local_disk_path is None:
                self.local_disk_path = get_env(ENV_VAR__CACHE__SERVICE__LOCAL_DISK_PATH, '/tmp/cache')              # todo: refactor this value into a static config variable

        elif self.storage_mode == Enum__Cache__Storage_Mode.SQLITE:
            if self.sqlite_path is None:
                self.sqlite_path = get_env(ENV_VAR__CACHE__SERVICE__SQLITE_PATH, ':memory:')                        # todo: refactor this value into a static config variable

        elif self.storage_mode == Enum__Cache__Storage_Mode.ZIP:
            if self.zip_path is None:
                self.zip_path = get_env(ENV_VAR__CACHE__SERVICE__ZIP_PATH, '/tmp/cache.zip')                        # todo: refactor this value into a static config variable

    def create_storage_backend(self) -> Storage_FS:                                                                 # Create the appropriate storage backend
        if self.storage_mode == Enum__Cache__Storage_Mode.MEMORY:
            return Storage_FS__Memory()

        elif self.storage_mode == Enum__Cache__Storage_Mode.S3:
            if not self.default_bucket:
                raise ValueError("S3 bucket name required for S3 storage mode")
            return Storage_FS__S3(s3_bucket=self.default_bucket).setup()

        elif self.storage_mode == Enum__Cache__Storage_Mode.LOCAL_DISK:
            return Storage_FS__Local_Disk(root_path=self.local_disk_path)

        elif self.storage_mode == Enum__Cache__Storage_Mode.SQLITE:
            in_memory = self.sqlite_path == ':memory:'
            return Storage_FS__Sqlite(db_path=self.sqlite_path, in_memory=in_memory).setup()

        elif self.storage_mode == Enum__Cache__Storage_Mode.ZIP:
            return Storage_FS__Zip(zip_path=self.zip_path, in_memory=False).setup()

    # todo see if can reuse Schema__Cache__Config (or if we need a new schema class)
    def get_storage_info(self) -> dict:                                                     # Get information about current configuration
        info = { 'storage_mode' : self.storage_mode.value   ,
                 'ttl_hours'    : self.default_ttl_hours    }                               # todo: refactor to Type_Safe class

        if self.storage_mode == Enum__Cache__Storage_Mode.S3:
            info['s3_bucket'] = self.default_bucket
        elif self.storage_mode == Enum__Cache__Storage_Mode.LOCAL_DISK:
            info['local_disk_path'] = self.local_disk_path
        elif self.storage_mode == Enum__Cache__Storage_Mode.SQLITE:
            info['sqlite_path'] = self.sqlite_path
        elif self.storage_mode == Enum__Cache__Storage_Mode.ZIP:
            info['zip_path'] = self.zip_path

        return info                                                                          # todo: refactor to Type_Safe class