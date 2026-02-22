# ===============================================================================
# SGraph Send - Vault Create Request Schema
# Type_Safe request body for POST /vault/create
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__Create__Request(Type_Safe):                               # POST /vault/create request body
    vault_cache_key : str                                                      # Derived from sha256(public_key_hash + "/filesystem")
    key_fingerprint : str = ''                                                 # PKI key fingerprint for audit
