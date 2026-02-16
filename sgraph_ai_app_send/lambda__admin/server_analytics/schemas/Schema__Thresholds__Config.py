# ===============================================================================
# SGraph Send - Thresholds Config Schema
# Configurable thresholds for health evaluation
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                    import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_Float                   import Safe_Float
from osbot_utils.type_safe.primitives.core.Safe_UInt                    import Safe_UInt


class Schema__Thresholds__Config(Type_Safe):                             # Health evaluation thresholds
    lambda_error_rate_warning   : Safe_Float = 1.0                       # % error rate -> warning
    lambda_error_rate_critical  : Safe_Float = 5.0                       # % error rate -> critical
    lambda_duration_p95_warning : Safe_UInt  = 5000                      # ms -> warning
    s3_error_5xx_threshold      : Safe_UInt  = 0                         # Any 5xx -> warning
    cloudfront_5xx_rate_warning : Safe_Float = 1.0                       # % -> warning
    cloudfront_cache_hit_low    : Safe_Float = 50.0                      # Below this % -> warning
