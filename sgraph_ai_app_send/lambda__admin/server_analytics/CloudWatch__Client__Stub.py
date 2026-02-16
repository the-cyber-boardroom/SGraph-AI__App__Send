# ===============================================================================
# SGraph Send - CloudWatch Client Stub
# Test stub with canned data — same interface as CloudWatch__Client
# Follows project rule: no mocks, no patches — real Type_Safe class
# ===============================================================================

import time
from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Label                           import Safe_Str__Label
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series                        import Schema__Metric__Series


class CloudWatch__Client__Stub(Type_Safe):                               # Test stub with canned CloudWatch data
    region : Safe_Str__Id = 'eu-west-2'                                  # Configured region (not used)

    def setup(self):                                                     # No boto3 needed
        return self

    # ═══════════════════════════════════════════════════════════════════════
    # Same interface as CloudWatch__Client — returns canned data
    # ═══════════════════════════════════════════════════════════════════════

    def get_metric_data(self, namespace        : str                 ,
                              metric_name      : Safe_Str__Label    ,
                              dimensions       : list               ,
                              statistic        : Safe_Str__Label = 'Sum' ,
                              unit             : Safe_Str__Label = 'Count' ,
                              lookback_minutes : Safe_UInt       = 60   ,
                              period_seconds   : Safe_UInt       = 300  ,
                        ) -> Schema__Metric__Series:
        return self._build_sample_series(metric_name, namespace, dimensions, unit, statistic, lookback_minutes, period_seconds)

    def get_metric_data_extended(self, namespace        : str                 ,
                                      metric_name      : Safe_Str__Label    ,
                                      dimensions       : list               ,
                                      statistic_label  : Safe_Str__Label    ,
                                      unit             : Safe_Str__Label = 'Milliseconds',
                                      lookback_minutes : Safe_UInt       = 60   ,
                                      period_seconds   : Safe_UInt       = 300  ,
                                ) -> Schema__Metric__Series:
        return self._build_sample_series(metric_name, namespace, dimensions, unit, statistic_label, lookback_minutes, period_seconds)

    def get_lambda_metric(self, function_name    : Safe_Str__Id             ,
                                metric_name      : Safe_Str__Label          ,
                                statistic        : Safe_Str__Label = 'Sum'  ,
                                unit             : Safe_Str__Label = 'Count',
                                lookback_minutes : Safe_UInt       = 60     ,
                                period_seconds   : Safe_UInt       = 300    ,
                          ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'FunctionName', 'Value': str(function_name)}]
        return self._build_sample_series(metric_name, 'AWS/Lambda', dimensions, unit, statistic, lookback_minutes, period_seconds)

    def get_lambda_metric_percentile(self, function_name    : Safe_Str__Id              ,
                                          metric_name      : Safe_Str__Label            ,
                                          percentile       : Safe_Str__Label = 'p95'    ,
                                          unit             : Safe_Str__Label = 'Milliseconds',
                                          lookback_minutes : Safe_UInt       = 60       ,
                                          period_seconds   : Safe_UInt       = 300      ,
                                    ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'FunctionName', 'Value': str(function_name)}]
        return self._build_sample_series(metric_name, 'AWS/Lambda', dimensions, unit, percentile, lookback_minutes, period_seconds)

    def get_s3_metric(self, bucket_name      : Safe_Str__Id             ,
                            filter_id        : Safe_Str__Id             ,
                            metric_name      : Safe_Str__Label          ,
                            statistic        : Safe_Str__Label = 'Sum'  ,
                            unit             : Safe_Str__Label = 'Count',
                            lookback_minutes : Safe_UInt       = 60     ,
                            period_seconds   : Safe_UInt       = 300    ,
                      ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'BucketName', 'Value': str(bucket_name)},
                      {'Name': 'FilterId' , 'Value': str(filter_id)  }]
        return self._build_sample_series(metric_name, 'AWS/S3', dimensions, unit, statistic, lookback_minutes, period_seconds)

    def get_cloudfront_metric(self, distribution_id  : Safe_Str__Id             ,
                                    metric_name      : Safe_Str__Label          ,
                                    statistic        : Safe_Str__Label = 'Sum'  ,
                                    unit             : Safe_Str__Label = 'None' ,
                                    lookback_minutes : Safe_UInt       = 60     ,
                                    period_seconds   : Safe_UInt       = 300    ,
                              ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'DistributionId', 'Value': str(distribution_id)},
                      {'Name': 'Region'        , 'Value': 'Global'            }]
        return self._build_sample_series(metric_name, 'AWS/CloudFront', dimensions, unit, statistic, lookback_minutes, period_seconds)

    # ═══════════════════════════════════════════════════════════════════════
    # Sample Data Generation
    # ═══════════════════════════════════════════════════════════════════════

    def _build_sample_series(self, metric_name, namespace, dimensions, unit, statistic, lookback_minutes, period_seconds):
        now         = int(time.time())
        num_points  = max(1, int(int(lookback_minutes) * 60 / int(period_seconds)))
        timestamps  = [now - (num_points - i) * int(period_seconds) for i in range(num_points)]
        values      = [float(10 + i) for i in range(num_points)]                                # Simple ascending sample data

        return Schema__Metric__Series(
            metric_name = metric_name                                    ,
            namespace   = namespace                                      ,
            dimensions  = dimensions                                     ,
            unit        = unit                                           ,
            statistic   = statistic                                      ,
            timestamps  = timestamps                                     ,
            values      = values                                         )
