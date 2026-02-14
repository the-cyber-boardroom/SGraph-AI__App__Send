# ===============================================================================
# SGraph Send - Transfer Event Schema
# Records individual events in a transfer's lifecycle
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                        import Type_Safe
from osbot_utils.type_safe.primitives.domains.cryptography.safe_str.Safe_Str__Cache_Hash    import Safe_Str__Cache_Hash
from osbot_utils.type_safe.primitives.domains.http.safe_str.Safe_Str__Http__User_Agent      import Safe_Str__Http__User_Agent
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now            import Timestamp_Now
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id             import Safe_Str__Id


class Schema__Transfer__Event(Type_Safe):                                       # Single transfer event record
    action    : Safe_Str__Id                                                    # Event type: upload, complete, download (todo: should be Enum)
    timestamp : Timestamp_Now                                                   # When event occurred
    ip_hash   : Safe_Str__Cache_Hash                                            # SHA-256 hash of IP (64 hex chars)
    user_agent: Safe_Str__Http__User_Agent                                      # Browser user-agent string
