# ===============================================================================
# SGraph Send - S3 Metrics Collector
# Collects all CloudWatch request metrics for one S3 bucket
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__S3__Metrics                           import Schema__S3__Metrics


class S3__Metrics__Collector(Type_Safe):                                 # Collects metrics for one S3 bucket
    cloudwatch_client : object                                           # CloudWatch__Client or CloudWatch__Client__Stub
    bucket_name       : Safe_Str__Id                                     # S3 bucket name
    filter_id         : Safe_Str__Id                                     # Request metrics filter ID (e.g., 'all-requests')
    lookback_minutes  : Safe_UInt = 60                                   # Time range to collect
    period_seconds    : Safe_UInt = 300                                  # CloudWatch resolution

    def collect(self) -> Schema__S3__Metrics:                            # Collect all S3 metrics
        return Schema__S3__Metrics(
            bucket_name           = self.bucket_name                      ,
            filter_id             = self.filter_id                        ,
            get_requests          = self._metric('GetRequests'         , 'Sum'    , 'Count'       ),
            put_requests          = self._metric('PutRequests'         , 'Sum'    , 'Count'       ),
            first_byte_latency    = self._metric('FirstByteLatency'    , 'Average', 'Milliseconds'),
            total_request_latency = self._metric('TotalRequestLatency' , 'Average', 'Milliseconds'),
            errors_4xx            = self._metric('4xxErrors'           , 'Sum'    , 'Count'       ),
            errors_5xx            = self._metric('5xxErrors'           , 'Sum'    , 'Count'       ),
            bytes_downloaded      = self._metric('BytesDownloaded'     , 'Sum'    , 'Bytes'       ),
            bytes_uploaded        = self._metric('BytesUploaded'       , 'Sum'    , 'Bytes'       ))

    def _metric(self, metric_name, statistic, unit):                     # Helper to call CloudWatch with bucket dimensions
        return self.cloudwatch_client.get_s3_metric(
            bucket_name      = self.bucket_name      ,
            filter_id        = self.filter_id        ,
            metric_name      = metric_name           ,
            statistic        = statistic             ,
            unit             = unit                  ,
            lookback_minutes = self.lookback_minutes ,
            period_seconds   = self.period_seconds   )
