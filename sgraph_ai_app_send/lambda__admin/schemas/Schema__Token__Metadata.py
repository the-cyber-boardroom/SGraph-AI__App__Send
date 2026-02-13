# ===============================================================================
# SGraph Send - Token Metadata Schema
# Token configuration stored via KEY_BASED strategy
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe


class Schema__Token__Metadata(Type_Safe):                                   # Token metadata
    token_name       : str                                                  # Human-friendly name: 'community-x'
    usage_limit      : int                                                  # Max uses (0 = unlimited)
    usage_count      : int                                                  # Current usage count
    status           : str           = 'active'                             # 'active', 'exhausted', 'revoked', 'expired'
    created_by       : str                                                  # Admin identifier
    metadata         : dict                                                 # Flexible: batch_id, notes, community_name
