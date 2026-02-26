# ===============================================================================
# SGraph Send - Presigned URL Schemas
# Data containers for large-file transfer via S3 presigned URLs
# ===============================================================================

from typing                                                                          import List
from osbot_utils.type_safe.Type_Safe                                                 import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                 import Safe_UInt
from osbot_utils.type_safe.primitives.domains.files.safe_uint.Safe_UInt__FileSize    import Safe_UInt__FileSize
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id      import Safe_Str__Id


class Schema__Presigned__Initiate(Type_Safe):                                        # Request: initiate multipart upload
    transfer_id       : Safe_Str__Id                                                 # Existing transfer ID (from /transfers/create)
    num_parts         : Safe_UInt                                                    # Number of parts to upload
    file_size_bytes   : Safe_UInt__FileSize                                          # Total file size


class Schema__Presigned__Part_Url(Type_Safe):                                        # Response item: one part's presigned URL
    part_number       : Safe_UInt                                                    # 1-indexed part number
    upload_url        : str                                                          # Presigned PUT URL


class Schema__Presigned__Initiate_Response(Type_Safe):                               # Response: multipart upload initiated
    transfer_id       : Safe_Str__Id                                                 # Transfer ID
    upload_id         : str                                                          # S3 multipart upload ID
    part_urls         : list                                                          # List of {part_number, upload_url}
    part_size         : Safe_UInt                                                    # Recommended bytes per part


class Schema__Presigned__Complete_Part(Type_Safe):                                    # Request item: completed part info
    part_number       : Safe_UInt                                                    # 1-indexed part number
    etag              : str                                                          # ETag returned by S3 PUT


class Schema__Presigned__Complete(Type_Safe):                                         # Request: complete multipart upload
    transfer_id       : Safe_Str__Id                                                 # Transfer ID
    upload_id         : str                                                          # S3 multipart upload ID
    parts             : list                                                          # List of {part_number, etag}


class Schema__Presigned__Download_Url(Type_Safe):                                    # Response: presigned download URL
    transfer_id       : Safe_Str__Id                                                 # Transfer ID
    download_url      : str                                                          # Presigned GET URL
    expires_in        : Safe_UInt                                                    # URL expiry in seconds
