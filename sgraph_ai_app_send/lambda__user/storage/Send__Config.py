# ===============================================================================
# SGraph Send - Storage Configuration
# Auto-detects storage mode and creates the appropriate Storage_FS backend
# ===============================================================================

from memory_fs.storage_fs.Storage_FS                                            import Storage_FS
from memory_fs.storage_fs.providers.Storage_FS__Memory                          import Storage_FS__Memory
from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.utils.Env                                                      import get_env
from sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                import Enum__Storage__Mode
from sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3                     import Storage_FS__S3

ENV_VAR__SEND__STORAGE_MODE  = 'SEND__STORAGE_MODE'                             # Explicit mode override
ENV_VAR__SEND__S3_BUCKET     = 'SEND__S3_BUCKET'                               # S3 bucket name
DEFAULT__SEND__S3_BUCKET     = 'sgraph-send-transfers'                          # Default bucket


class Send__Config(Type_Safe):                                                  # Storage configuration for Send
    storage_mode : Enum__Storage__Mode = None                                   # Active storage mode
    s3_bucket    : str                 = None                                   # S3 bucket (for S3 mode)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_mode is None:
            self.storage_mode = self.determine_storage_mode()
        self.configure_for_storage_mode()

    def determine_storage_mode(self) -> Enum__Storage__Mode:                    # Auto-detect best storage mode
        explicit = get_env(ENV_VAR__SEND__STORAGE_MODE)
        if explicit:
            try:
                return Enum__Storage__Mode(explicit.lower())
            except ValueError:
                pass
        if self.has_aws_credentials():
            return Enum__Storage__Mode.S3
        return Enum__Storage__Mode.MEMORY

    def has_aws_credentials(self) -> bool:                                      # Check if AWS credentials available
        if get_env('AWS_ACCESS_KEY_ID') and get_env('AWS_SECRET_ACCESS_KEY'):
            return True
        if get_env('AWS_PROFILE'):
            return True
        if get_env('AWS_REGION') and get_env('AWS_LAMBDA_FUNCTION_NAME'):
            return True
        return False

    def configure_for_storage_mode(self):                                       # Set defaults based on mode
        if self.storage_mode == Enum__Storage__Mode.S3:
            if self.s3_bucket is None:
                self.s3_bucket = get_env(ENV_VAR__SEND__S3_BUCKET, DEFAULT__SEND__S3_BUCKET)

    def create_storage_backend(self) -> Storage_FS:                             # Factory: create appropriate backend
        if self.storage_mode == Enum__Storage__Mode.S3:
            if self.s3_bucket is None:
                raise ValueError("S3 bucket name required for S3 storage mode")
            return Storage_FS__S3(s3_bucket=self.s3_bucket).setup()
        return Storage_FS__Memory()
