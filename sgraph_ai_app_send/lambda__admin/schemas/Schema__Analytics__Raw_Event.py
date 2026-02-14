# ===============================================================================
# SGraph Send - Analytics Raw Event Schema
# One file per server-side HTTP request, stored via TEMPORAL strategy
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now


class Schema__Analytics__Raw_Event(Type_Safe):                              # One event per HTTP request
    event_id               : str                                            # Unique event identifier
    event_type             : str                                            # 'page_view', 'api_call', 'file_upload', 'file_download', 'token_use'
    timestamp              : Timestamp_Now                                  # When event occurred
    path                   : str                                            # Request path
    method                 : str                                            # HTTP method (GET, POST, etc.)
    status_code            : int                                            # Response status code
    duration_ms            : int                                            # Request duration in milliseconds
    ip_hash                : str                                            # SHA-256 hash of IP
    user_agent_normalised  : str                                            # Browser family + OS
    content_bytes          : int                                            # Response size in bytes
    transfer_id            : str                                            # If applicable (empty for non-transfer requests)
    token_id               : str                                            # If applicable (empty for non-token requests)
