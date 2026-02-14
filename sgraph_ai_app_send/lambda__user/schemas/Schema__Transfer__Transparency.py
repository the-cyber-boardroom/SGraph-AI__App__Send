# ===============================================================================
# SGraph Send - Transfer Transparency Schema
# Data shared with sender about what the server stores
# ===============================================================================

from typing                                                                                  import List
from osbot_utils.type_safe.Type_Safe                                                         import Type_Safe
from osbot_utils.type_safe.primitives.domains.cryptography.safe_str.Safe_Str__Cache_Hash     import Safe_Str__Cache_Hash
from osbot_utils.type_safe.primitives.domains.files.safe_uint.Safe_UInt__FileSize            import Safe_UInt__FileSize


class Schema__Transfer__Transparency(Type_Safe):                                # Transparency data for sender
    ip             : Safe_Str__Cache_Hash                                       # Hashed IP of sender (SHA-256, 64 hex chars)
    timestamp      : str                                                        # Creation timestamp (todo: needs Safe_Str__Iso_Timestamp — ':' and '+' stripped by Safe_Str)
    file_size_bytes: Safe_UInt__FileSize                                        # Size of encrypted payload
    stored_fields  : List[str]                                                  # Fields the server stores
    not_stored     : List[str]                                                  # Fields the server never sees
