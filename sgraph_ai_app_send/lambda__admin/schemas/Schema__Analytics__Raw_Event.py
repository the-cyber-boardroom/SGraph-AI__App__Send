# ===============================================================================
# SGraph Send - Analytics Raw Event Schema
# One file per server-side HTTP request, stored via TEMPORAL strategy
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.cryptography.safe_str.Safe_Str__Cache_Hash     import Safe_Str__Cache_Hash
from osbot_utils.type_safe.primitives.domains.files.safe_str.Safe_Str__File__Path            import Safe_Str__File__Path
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now             import Timestamp_Now
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id              import Safe_Str__Id


class Schema__Analytics__Raw_Event(Type_Safe):                              # One event per HTTP request
    event_id               : Safe_Str__Id                                   # Unique event identifier (hex token)
    event_type             : Safe_Str__Id                                   # 'page_view', 'api_call', 'file_upload', 'file_download', 'token_use' (todo: should be Enum)
    timestamp              : Timestamp_Now                                  # When event occurred
    path                   : Safe_Str__File__Path                           # Request path (preserves '/')
    method                 : Safe_Str__Id                                   # HTTP method (GET, POST, etc.) (todo: should be Enum__Http__Method)
    status_code            : Safe_UInt                                      # Response status code
    duration_ms            : Safe_UInt                                      # Request duration in milliseconds
    ip_hash                : Safe_Str__Cache_Hash                           # SHA-256 hash of IP (64 hex chars)
    user_agent_normalised  : Safe_Str__Id                                   # Browser family: Chrome, Firefox, Safari, Edge, Other
    content_bytes          : Safe_UInt                                      # Response size in bytes
    transfer_id            : Safe_Str__Id                                   # If applicable (empty for non-transfer requests) (todo: should be Transfer_Id)
    token_id               : Safe_Str__Id                                   # If applicable (empty for non-token requests)
