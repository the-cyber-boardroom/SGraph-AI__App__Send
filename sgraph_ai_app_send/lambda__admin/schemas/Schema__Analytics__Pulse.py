# ===============================================================================
# SGraph Send - Analytics Pulse Schema
# Real-time rolling window traffic snapshot
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                            import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now


class Schema__Analytics__Pulse(Type_Safe):                                  # Real-time traffic pulse
    computed_at      : Timestamp_Now                                        # When pulse was computed
    window_minutes   : Safe_UInt     = 5                                    # Rolling window size
    active_requests  : Safe_UInt                                            # Requests in last N minutes
    active_visitors  : Safe_UInt                                            # Unique ip_hashes in last N minutes
    active_transfers : Safe_UInt                                            # Transfers in progress
