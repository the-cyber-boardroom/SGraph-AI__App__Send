# ===============================================================================
# SGraph Send - Token Create Request Schema
# Type_Safe request body for POST /tokens/create
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id
from osbot_utils.type_safe.primitives.core.Safe_UInt                            import Safe_UInt


class Schema__Token__Create__Request(Type_Safe):                             # POST /tokens/create request body
    token_name  : Safe_Str__Id                                               # Human-friendly token name: 'community-x'
    usage_limit : Safe_UInt    = 50                                          # Max uses (0 = unlimited)
    created_by  : Safe_Str__Id  = 'admin'                                    # Admin identifier
    metadata    : dict                                                       # todo: should be Dict[Safe_Str__Key, Safe_Str__Text]
