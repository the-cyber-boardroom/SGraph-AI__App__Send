# ===============================================================================
# SGraph Send - Token Usage Event Schema
# Single token usage event, stored as child data under token's cache_id
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id


class Schema__Token__Usage_Event(Type_Safe):                                # Single token usage event
    event_id         : Safe_Str__Id                                         # Unique event ID
    ip_hash          : Safe_Str__Id                                         # SHA-256 hash of user IP (todo: should be Safe_Str__Hash)
    action           : Safe_Str__Id                                         # 'page_opened', 'upload_initiated', 'upload_completed' (todo: should be Enum)
    transfer_id      : Safe_Str__Id                                         # If a transfer was created, its ID (todo: should be Transfer_Id)
    success          : bool                                                 # Whether the action succeeded
    rejection_reason : Safe_Str__Id                                         # If failed: 'exhausted', 'expired', 'revoked' (todo: should be Enum)
