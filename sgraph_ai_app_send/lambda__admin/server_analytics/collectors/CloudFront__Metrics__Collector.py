# ===============================================================================
# SGraph Send - CloudFront Metrics Collector
# Collects all CloudWatch metrics for one CloudFront distribution
# Note: CloudFront metrics are only available in us-east-1
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__CloudFront__Metrics                   import Schema__CloudFront__Metrics


class CloudFront__Metrics__Collector(Type_Safe):                         # Collects metrics for one CloudFront distribution
    cloudwatch_client : object                                           # CloudWatch__Client or CloudWatch__Client__Stub
    distribution_id   : Safe_Str__Id                                     # CloudFront distribution ID (e.g., 'E1ABC2DEF3GHIJ')
    lookback_minutes  : Safe_UInt = 60                                   # Time range to collect
    period_seconds    : Safe_UInt = 300                                  # CloudWatch resolution

    def collect(self) -> Schema__CloudFront__Metrics:                    # Collect all CloudFront metrics
        return Schema__CloudFront__Metrics(
            distribution_id  = self.distribution_id                      ,
            requests         = self._metric('Requests'       , 'Sum'    , 'None'   ),
            bytes_downloaded = self._metric('BytesDownloaded', 'Sum'    , 'None'   ),
            bytes_uploaded   = self._metric('BytesUploaded'  , 'Sum'    , 'None'   ),
            error_rate_4xx   = self._metric('4xxErrorRate'   , 'Average', 'Percent'),
            error_rate_5xx   = self._metric('5xxErrorRate'   , 'Average', 'Percent'),
            cache_hit_rate   = self._metric('CacheHitRate'   , 'Average', 'Percent'))

    def _metric(self, metric_name, statistic, unit):                     # Helper to call CloudWatch with distribution dimensions
        return self.cloudwatch_client.get_cloudfront_metric(
            distribution_id  = self.distribution_id  ,
            metric_name      = metric_name           ,
            statistic        = statistic             ,
            unit             = unit                  ,
            lookback_minutes = self.lookback_minutes ,
            period_seconds   = self.period_seconds   )
