# ===============================================================================
# SGraph Send - Vault File Request Schema
# Type_Safe request body for POST /vault/file
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__File__Request(Type_Safe):                                 # POST /vault/file request body
    vault_cache_key : str                                                      # Vault identifier (derived from PKI key)
    file_guid       : str                                                      # GUID for the file
    encrypted_data  : str                                                      # Base64-encoded encrypted file bytes
