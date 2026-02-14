# ===============================================================================
# SGraph Send - Token Metadata Schema
# Token configuration stored via KEY_BASED strategy
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                            import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id


class Schema__Token__Metadata(Type_Safe):                                   # Token metadata
    token_name       : Safe_Str__Id                                         # Human-friendly name: 'community-x'
    usage_limit      : Safe_UInt     = 50                                   # Max uses (0 = unlimited)
    usage_count      : Safe_UInt                                            # Current usage count
    status           : Safe_Str__Id  = 'active'                             # 'active', 'exhausted', 'revoked', 'expired' (todo: should be Enum)
    created_by       : Safe_Str__Id                                         # Admin identifier
    metadata         : dict                                                 # Flexible: batch_id, notes, community_name (todo: should be typed dict)
