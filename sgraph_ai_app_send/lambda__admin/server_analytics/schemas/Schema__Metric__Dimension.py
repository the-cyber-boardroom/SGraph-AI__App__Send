# ===============================================================================
# SGraph Send - Metric Dimension Schema
# Single CloudWatch dimension (name + value pair)
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                    import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Label      import Safe_Str__Label
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id         import Safe_Str__Id


class Schema__Metric__Dimension(Type_Safe):                              # Single CloudWatch dimension
    name  : Safe_Str__Label                                              # Dimension name (e.g., 'FunctionName')
    value : Safe_Str__Id                                                 # Dimension value (e.g., 'user-dev')
