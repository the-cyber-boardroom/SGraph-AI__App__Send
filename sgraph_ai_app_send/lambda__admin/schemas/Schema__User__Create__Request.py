# ===============================================================================
# SGraph Send - User Create Request Schema
# Type_Safe request body for POST /users/create
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__User__Create__Request(Type_Safe):                               # POST /users/create request body
    display_name    : str                                                     # Human-friendly display name
    key_fingerprint : str                                                     # PKI key fingerprint (sha256:xxxx)
