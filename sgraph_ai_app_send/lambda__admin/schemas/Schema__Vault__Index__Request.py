# ===============================================================================
# SGraph Send - Vault Index Request Schema
# Type_Safe request body for POST /vault/index
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__Index__Request(Type_Safe):                                # POST /vault/index request body
    vault_cache_key    : str                                                   # Vault identifier (derived from PKI key)
    encrypted_index    : str                                                   # Base64-encoded encrypted index bytes
