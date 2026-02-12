# ===============================================================================
# SGraph Send - Transfer Schemas
# Pure data containers for transfer-related API request/response models
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe

# todo: one schema class per file and refactor all use of raw primitives

class Schema__Transfer__Create(Type_Safe):                                       # Request: create a new transfer
    file_size_bytes   : int
    content_type_hint : str  = ""                                               # todo: with Type_Safe this is not needed


class Schema__Transfer__Initiated(Type_Safe):                                    # Response: transfer created
    transfer_id       : str
    upload_url        : str                                                      # URL path like /transfers/upload/{id}


class Schema__Transfer__Complete_Response(Type_Safe):                            # Response: transfer completed
    transfer_id       : str
    download_url      : str                                                      # URL path like /d/{id}
    transparency      : dict                                                     # {ip, timestamp, file_size_bytes, stored_fields, not_stored}


class Schema__Transfer__Info(Type_Safe):                                         # Response: transfer metadata
    transfer_id       : str
    status            : str                                                      # pending, completed, expired
    file_size_bytes   : int
    created_at        : str
    download_count    : int


class Schema__Transfer__Download_Response(Type_Safe):                            # Response: download metadata
    transfer_id       : str
    file_size_bytes   : int
    transparency      : dict
