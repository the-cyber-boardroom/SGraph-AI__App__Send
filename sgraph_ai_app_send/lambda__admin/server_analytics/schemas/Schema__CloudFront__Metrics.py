# ===============================================================================
# SGraph Send - CloudFront Metrics Schema
# All metrics for one CloudFront distribution
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series                        import Schema__Metric__Series


class Schema__CloudFront__Metrics(Type_Safe):                            # CloudFront distribution metrics
    distribution_id  : Safe_Str__Id                                      # CloudFront distribution ID
    requests         : Schema__Metric__Series                            # Total requests
    bytes_downloaded : Schema__Metric__Series                            # Bytes to viewers
    bytes_uploaded   : Schema__Metric__Series                            # Bytes from viewers
    error_rate_4xx   : Schema__Metric__Series                            # 4xx error rate (%)
    error_rate_5xx   : Schema__Metric__Series                            # 5xx error rate (%)
    cache_hit_rate   : Schema__Metric__Series                            # Cache hit ratio (%)
