# ===============================================================================
# SGraph Send - Token Update Limit Request Schema
# Type_Safe request body for POST /tokens/update-limit/{token_name}
# ===============================================================================

from osbot_utils.type_safe.Type_Safe            import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt import Safe_UInt


class Schema__Token__Update_Limit__Request(Type_Safe):                     # POST /tokens/update-limit/{token_name}
    usage_limit : Safe_UInt = 50                                           # New usage limit (0 = unlimited)
