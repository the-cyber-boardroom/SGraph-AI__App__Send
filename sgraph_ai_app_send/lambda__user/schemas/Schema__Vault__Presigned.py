# ===============================================================================
# SGraph Send - Vault Presigned URL Schemas
# Data containers for vault large-blob transfer via S3 presigned URLs
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                 import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                 import Safe_UInt
from osbot_utils.type_safe.primitives.domains.files.safe_uint.Safe_UInt__FileSize    import Safe_UInt__FileSize
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id      import Safe_Str__Id


class Schema__Vault__Presigned__Initiate(Type_Safe):                                 # Request: initiate vault multipart upload
    file_id           : str                                                          # Vault file path (e.g. "bare/data/{blob_id}")
    num_parts         : Safe_UInt                                                    # Number of parts (0 = auto-calculate)
    file_size_bytes   : Safe_UInt__FileSize                                          # Total file size in bytes


class Schema__Vault__Presigned__Complete(Type_Safe):                                 # Request: complete vault multipart upload
    file_id           : str                                                          # Vault file path (must match initiate)
    upload_id         : str                                                          # S3 multipart upload ID
    parts             : list                                                          # List of {part_number, etag}


class Schema__Vault__Presigned__Cancel(Type_Safe):                                   # Request: cancel vault multipart upload
    upload_id         : str                                                          # S3 multipart upload ID
    file_id           : str                                                          # Vault file path (for S3 key resolution)
