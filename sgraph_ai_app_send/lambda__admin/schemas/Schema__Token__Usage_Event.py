# ===============================================================================
# SGraph Send - Token Usage Event Schema
# Single token usage event, stored as child data under token's cache_id
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe


class Schema__Token__Usage_Event(Type_Safe):                                # Single token usage event
    event_id         : str                                                  # Unique event ID
    ip_hash          : str                                                  # SHA-256 hash of user IP
    action           : str                                                  # 'page_opened', 'upload_initiated', 'upload_completed'
    transfer_id      : str                                                  # If a transfer was created, its ID
    success          : bool                                                 # Whether the action succeeded
    rejection_reason : str                                                  # If failed: 'exhausted', 'expired', 'revoked'
