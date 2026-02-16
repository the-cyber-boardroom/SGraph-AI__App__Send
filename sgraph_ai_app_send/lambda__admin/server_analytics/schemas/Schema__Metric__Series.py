# ===============================================================================
# SGraph Send - Metric Series Schema
# Time-series data returned from CloudWatch (backbone data structure)
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                    import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Label      import Safe_Str__Label


class Schema__Metric__Series(Type_Safe):                                 # Time-series data from CloudWatch
    metric_name : Safe_Str__Label                                        # Metric name (e.g., 'Invocations')
    namespace   : str                                                    # AWS namespace (e.g., 'AWS/Lambda') — raw str to preserve /
    dimensions  : list                                                   # List of {name, value} dicts
    unit        : Safe_Str__Label                                        # Unit (e.g., 'Count', 'Milliseconds')
    statistic   : Safe_Str__Label                                        # Statistic type (e.g., 'Sum', 'Average')
    timestamps  : list                                                   # List of epoch-second timestamps
    values      : list                                                   # List of float values (aligned with timestamps)
