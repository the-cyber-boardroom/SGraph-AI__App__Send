# ===============================================================================
# SGraph Send - Health Status Schema
# Health evaluation result for one infrastructure component
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                    import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id         import Safe_Str__Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Label      import Safe_Str__Label


class Schema__Health__Status(Type_Safe):                                 # Health evaluation for one component
    component    : Safe_Str__Label                                       # Component name (e.g., 'Lambda: user-dev')
    status       : Safe_Str__Id                                          # 'healthy', 'warning', 'critical'
    status_emoji : Safe_Str__Label                                       # Visual indicator
    message      : str                                                   # Human-readable description
    metrics      : dict                                                  # Key metric values for this evaluation
