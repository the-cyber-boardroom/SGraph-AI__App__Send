# ===============================================================================
# SGraph Send - Transfer Event Schema
# Records individual events in a transfer's lifecycle
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now


class Schema__Transfer__Event(Type_Safe):                                       # Single transfer event record
    action    : str                                                             # Event type: upload, complete, download
    timestamp : Timestamp_Now                                                   # When event occurred
    ip_hash   : str                                                             # SHA-256 hash of IP (if applicable)
    user_agent: str                                                             # Browser user-agent (if applicable)
