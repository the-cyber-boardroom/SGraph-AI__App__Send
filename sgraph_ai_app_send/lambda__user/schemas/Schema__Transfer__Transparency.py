# ===============================================================================
# SGraph Send - Transfer Transparency Schema
# Data shared with sender about what the server stores
# ===============================================================================

from typing                                                                     import List
from osbot_utils.type_safe.Type_Safe                                            import Type_Safe


class Schema__Transfer__Transparency(Type_Safe):                                # Transparency data for sender
    ip             : str                                                        # Hashed IP of sender
    timestamp      : str                                                        # Creation timestamp
    file_size_bytes: int                                                        # Size of encrypted payload
    stored_fields  : List[str]                                                  # Fields the server stores
    not_stored     : List[str]                                                  # Fields the server never sees
