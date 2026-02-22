# ===============================================================================
# SGraph Send - Vault Folder Request Schema
# Type_Safe request body for POST /vault/folder
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__Folder__Request(Type_Safe):                               # POST /vault/folder request body
    vault_cache_key : str                                                      # Vault identifier (derived from PKI key)
    folder_guid     : str                                                      # GUID for the folder
    folder_data     : dict                                                     # Folder manifest: { type, id, children }
