# ===============================================================================
# SGraph Send - Transfer Schemas
# Pure data containers for transfer-related API request/response models
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe

# todo: one schema class per file and refactor all use of raw primitives
# todo: each schema below should be moved to its own file under schemas/

class Schema__Transfer__Create(Type_Safe):                                       # Request: create a new transfer
    file_size_bytes   : int                                                      # todo: should be Safe_UInt__FileSize
    content_type_hint : str  = ""                                               # todo: with Type_Safe this is not needed, should be Safe_Str__Http__Content_Type


class Schema__Transfer__Initiated(Type_Safe):                                    # Response: transfer created
    transfer_id       : str                                                      # todo: should be Transfer_Id (extending Random_Guid)
    upload_url        : str                                                      # todo: should be Safe_Str__Url or a custom Safe_Str type


class Schema__Transfer__Complete_Response(Type_Safe):                            # Response: transfer completed
    transfer_id       : str                                                      # todo: should be Transfer_Id (extending Random_Guid)
    download_url      : str                                                      # todo: should be Safe_Str__Url or a custom Safe_Str type
    transparency      : dict                                                     # todo: should be Schema__Transfer__Transparency (Type_Safe class)


class Schema__Transfer__Info(Type_Safe):                                         # Response: transfer metadata
    transfer_id       : str                                                      # todo: should be Transfer_Id (extending Random_Guid)
    status            : str                                                      # todo: should be Enum__Transfer__Status (pending, completed, expired)
    file_size_bytes   : int                                                      # todo: should be Safe_UInt__FileSize
    created_at        : str                                                      # todo: should be Timestamp_Now
    download_count    : int                                                      # todo: should be Safe_UInt


class Schema__Transfer__Download_Response(Type_Safe):                            # Response: download metadata
    transfer_id       : str                                                      # todo: should be Transfer_Id (extending Random_Guid)
    file_size_bytes   : int                                                      # todo: should be Safe_UInt__FileSize
    transparency      : dict                                                     # todo: should be Schema__Transfer__Transparency (Type_Safe class)
