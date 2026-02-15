# ===============================================================================
# SGraph Send - Lambda Metrics Schema
# All metrics for one Lambda function
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series                        import Schema__Metric__Series


class Schema__Lambda__Metrics(Type_Safe):                                # All metrics for one Lambda function
    function_name          : Safe_Str__Id                                # Lambda function name (e.g., 'user-dev')
    invocations            : Schema__Metric__Series                      # Total invocations
    errors                 : Schema__Metric__Series                      # Total errors
    duration_avg           : Schema__Metric__Series                      # Average duration (ms)
    duration_p50           : Schema__Metric__Series                      # Median duration
    duration_p95           : Schema__Metric__Series                      # 95th percentile
    duration_p99           : Schema__Metric__Series                      # 99th percentile
    duration_max           : Schema__Metric__Series                      # Maximum duration
    throttles              : Schema__Metric__Series                      # Throttle count
    concurrent_executions  : Schema__Metric__Series                      # Concurrent execution count
