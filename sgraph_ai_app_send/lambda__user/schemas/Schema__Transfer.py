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


class Schema__Transfer__Initiated(Type_Safe):                                    # Response: transfer created
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id extending Random_Guid)
    upload_url        : Safe_Str__File__Path                                     # Upload endpoint URL (todo: should be Safe_Str__Url)


class Schema__Transfer__Complete_Response(Type_Safe):                            # Response: transfer completed
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id)
    download_url      : Safe_Str__File__Path                                     # Download endpoint URL (todo: should be Safe_Str__Url)
    transparency      : dict                                                     # todo: should be Schema__Transfer__Transparency (Type_Safe class)


class Schema__Transfer__Info(Type_Safe):                                         # Response: transfer metadata
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id)
    status            : Safe_Str__Id                                             # Transfer status (todo: should be Enum__Transfer__Status)
    file_size_bytes   : Safe_UInt__FileSize                                      # File size in bytes
    created_at        : str                                                      # Creation timestamp (todo: needs Safe_Str__Iso_Timestamp — Timestamp_Now is int, ISO string has ':')
    download_count    : Safe_UInt                                                # Number of downloads


class Schema__Transfer__Download_Response(Type_Safe):                            # Response: download metadata
    transfer_id       : Safe_Str__Id                                             # Transfer identifier (todo: should be Transfer_Id)
    file_size_bytes   : Safe_UInt__FileSize                                      # File size in bytes
    transparency      : dict                                                     # todo: should be Schema__Transfer__Transparency (Type_Safe class)
