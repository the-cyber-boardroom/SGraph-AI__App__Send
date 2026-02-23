# ===============================================================================
# SGraph Send - Vault Share Request Schema
# Type_Safe request body for POST /vault/{vault_cache_key}/share
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__Share__Request(Type_Safe):                               # POST /vault/{vault_cache_key}/share request body
    user_id    : str                                                          # User to grant access to
    permission : str = 'viewer'                                               # Permission level: owner, editor, viewer
