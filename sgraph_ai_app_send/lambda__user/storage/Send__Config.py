# ===============================================================================
# SGraph Send - Storage Configuration
# Auto-detects storage mode and creates the appropriate Storage_FS backend
# ===============================================================================

from memory_fs.storage_fs.Storage_FS                                            import Storage_FS
from memory_fs.storage_fs.providers.Storage_FS__Memory                          import Storage_FS__Memory
from osbot_aws.AWS_Config                                                       import aws_config
from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.utils.Env                                                      import get_env
from sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                import Enum__Storage__Mode
from sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3                     import Storage_FS__S3

ENV_VAR__SEND__STORAGE_MODE    = 'SEND__STORAGE_MODE'                           # Explicit mode override
ENV_VAR__SEND__S3_BUCKET       = 'SEND__S3_BUCKET'                             # S3 bucket name override
SEND__S3_BUCKET__INFIX         = 'sgraph-send-transfers'                       # Bucket name infix (used between account-id and region)

# todo: s3_bucket should not be an str (it should be type safe primitive)
class Send__Config(Type_Safe):                                                  # Storage configuration for Send
    storage_mode : Enum__Storage__Mode = None                                   # Active storage mode
    s3_bucket    : str                 = None                                   # S3 bucket (for S3 mode)

    # todo: add an issue to have a conversation about this, since we really shouldn't be doing any state actions in __init__
    #       there are multiple ways to achieved this, including the powerful Service Registry that osbot supports
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_mode is None:
            self.storage_mode = self.determine_storage_mode()
        self.configure_for_storage_mode()

    def determine_storage_mode(self) -> Enum__Storage__Mode:                    # Auto-detect best storage mode
        explicit = get_env(ENV_VAR__SEND__STORAGE_MODE)                         # todo: we shouldn't be reading env vars in locations like this (should be in a separate class) — add to Service Registry discussion
        if explicit:
            values_map = {mode.value: mode for mode in Enum__Storage__Mode}     # Map enum values to members for safe lookup (no try/except needed)
            if explicit.lower() in values_map:
                return values_map[explicit.lower()]
        if self.has_aws_credentials():
            return Enum__Storage__Mode.S3
        return Enum__Storage__Mode.MEMORY

    def has_aws_credentials(self) -> bool:                                      # Check if AWS credentials available via AWS_Config
        return aws_config.aws_configured()

    def configure_for_storage_mode(self):                                       # Set defaults based on mode
        if self.storage_mode == Enum__Storage__Mode.S3:
            if self.s3_bucket is None:
                self.s3_bucket = self.resolve_s3_bucket_name()

    def resolve_s3_bucket_name(self) -> str:                                   # Resolve S3 bucket name: env var override or {account_id}--{infix}--{region}
        explicit_bucket = get_env(ENV_VAR__SEND__S3_BUCKET)                    # todo: env var reading should be centralised (see Service Registry discussion)
        if explicit_bucket:
            return explicit_bucket
        account_id = aws_config.account_id()
        region     = aws_config.region_name()
        return f'{account_id}--{SEND__S3_BUCKET__INFIX}--{region}'

    def create_storage_backend(self) -> Storage_FS:                             # Factory: create appropriate backend
        if self.storage_mode == Enum__Storage__Mode.S3:
            if self.s3_bucket is None:
                raise ValueError("S3 bucket name required for S3 storage mode")
            return Storage_FS__S3(s3_bucket=self.s3_bucket).setup()
        return Storage_FS__Memory()
