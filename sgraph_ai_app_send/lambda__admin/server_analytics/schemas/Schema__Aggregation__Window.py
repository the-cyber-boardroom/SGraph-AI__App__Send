# ===============================================================================
# SGraph Send - Aggregation Window Schema
# Computed analytics aggregation for a time window (LETS pattern)
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                    import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                    import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id         import Safe_Str__Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Label      import Safe_Str__Label
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now        import Timestamp_Now


class Schema__Aggregation__Window(Type_Safe):                            # Computed analytics aggregation
    window_label       : Safe_Str__Label                                 # '30min', 'hourly', 'daily'
    window_minutes     : Safe_UInt                                       # 30, 60, 1440
    time_key           : Safe_Str__Id                                    # '2026-02-15T14:00' or '2026-02-15'
    computed_at        : Timestamp_Now                                   # When aggregation was computed
    event_count        : Safe_UInt                                       # Raw events processed
    total_requests     : Safe_UInt                                       # Total HTTP requests
    unique_visitors    : Safe_UInt                                       # Distinct ip_hashes
    total_bytes        : Safe_UInt                                       # Total content bytes
    avg_duration_ms    : Safe_UInt                                       # Average request duration
    requests_by_type   : dict                                            # {page_view: N, api_call: N, ...}
    requests_by_status : dict                                            # {2xx: N, 3xx: N, 4xx: N, 5xx: N}
    top_paths          : list                                            # [{path: str, count: int}, ...] (top 20)
    active_transfers   : Safe_UInt                                       # File transfer operations
