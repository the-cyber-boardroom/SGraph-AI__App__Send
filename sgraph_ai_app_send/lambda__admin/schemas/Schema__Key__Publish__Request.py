# ===============================================================================
# SGraph Send - Key Publish Request Schema
# Type_Safe request body for POST /keys/publish
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Key__Publish__Request(Type_Safe):                             # POST /keys/publish request body
    public_key_pem  : str                                                   # PEM-encoded public key (RSA-OAEP or ECDH)
    signing_key_pem : str = ''                                              # Optional PEM-encoded signing public key (ECDSA)
