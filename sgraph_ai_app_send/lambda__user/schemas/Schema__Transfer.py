# ===============================================================================
# SGraph Send - Transfer Schemas
# Pure data containers for transfer-related API request/response models
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                          import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                          import Safe_UInt
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path             import Safe_Str__File__Path
from osbot_utils.type_safe.primitives.domains.files.safe_uint.Safe_UInt__FileSize             import Safe_UInt__FileSize
from osbot_utils.type_safe.primitives.domains.http.safe_str.Safe_Str__Http__Content_Type      import Safe_Str__Http__Content_Type
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id               import Safe_Str__Id

# todo: one schema class per file and refactor all use of raw primitives
# todo: each schema below should be moved to its own file under schemas/

class Schema__Transfer__Create(Type_Safe):                                       # Request: create a new transfer
    file_size_bytes   : Safe_UInt__FileSize                                      # File size in bytes
    content_type_hint : Safe_Str__Http__Content_Type                             # MIME type hint
    transfer_id       : Safe_Str__Id                                             # Optional client-provided transfer ID (PBKDF2 simple-token mode)
    max_downloads     : Safe_UInt                                                # Max downloads before exhausted (0 = unlimited)
    auto_delete       : bool                                                     # Wipe payload after last allowed download
    expires_at        : str                                                      # ISO-8601 UTC expiry timestamp, empty = no expiry
    delete_auth_hash  : Safe_Str__Id                                             # SHA-256(delete_auth), empty = delete disabled


class Schema__Transfer__Initiated(Type_Safe):                                    # Response: transfer created
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id extending Random_Guid)
    upload_url        : Safe_Str__File__Path                                     # Upload endpoint URL (todo: should be Safe_Str__Url)


class Schema__Transfer__Complete_Response(Type_Safe):                            # Response: transfer completed
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id)
    download_url      : Safe_Str__File__Path                                     # Download endpoint URL (todo: should be Safe_Str__Url)
    transparency      : dict                                                     # todo: should be Schema__Transfer__Transparency (Type_Safe class)


class Schema__Transfer__Info(Type_Safe):                                         # Response: transfer metadata
    transfer_id         : Safe_Str__Id                                           # Transfer identifier (todo: should be Transfer_Id)
    status              : Safe_Str__Id                                           # Transfer status (todo: should be Enum__Transfer__Status)
    file_size_bytes     : Safe_UInt__FileSize                                    # File size in bytes
    created_at          : str                                                    # Creation timestamp
    download_count      : Safe_UInt                                              # Number of downloads
    max_downloads       : Safe_UInt                                              # Limit (0 = unlimited)
    expires_at          : str                                                    # ISO-8601 UTC expiry, empty = none
    downloads_remaining : Safe_UInt                                              # Remaining downloads (0 = unlimited)
    is_expired          : bool                                                   # Computed: True if expires_at is set and passed


class Schema__Transfer__Download_Response(Type_Safe):                            # Response: download metadata
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id)
    file_size_bytes   : Safe_UInt__FileSize                                      # File size in bytes
    transparency      : dict                                                     # todo: should be Schema__Transfer__Transparency (Type_Safe class)
