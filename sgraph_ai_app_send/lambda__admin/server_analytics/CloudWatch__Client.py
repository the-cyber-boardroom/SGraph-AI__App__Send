# ===============================================================================
# SGraph Send - CloudWatch Client
# Type_Safe wrapper for AWS CloudWatch metric collection
# Uses lazy boto3 import (available in Lambda runtime, not in package deps)
# ===============================================================================

from datetime                                                                                                import datetime, timezone, timedelta
from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Label                           import Safe_Str__Label
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series                        import Schema__Metric__Series


class CloudWatch__Client(Type_Safe):                                     # CloudWatch metric collection client
    region : Safe_Str__Id = 'eu-west-2'                                  # Primary AWS region

    def setup(self):                                                     # Initialise boto3 clients (lazy import)
        import boto3
        self._boto3_client    = boto3.client('cloudwatch', region_name=str(self.region))
        self._boto3_client_cf = boto3.client('cloudwatch', region_name='us-east-1')      # CloudFront metrics only in us-east-1
        return self

    # ═══════════════════════════════════════════════════════════════════════
    # Core Metric Retrieval
    # ═══════════════════════════════════════════════════════════════════════

    def get_metric_data(self, namespace        : str                 ,   # Standard statistics (Sum, Average, Max)
                              metric_name      : Safe_Str__Label    ,
                              dimensions       : list               ,
                              statistic        : Safe_Str__Label = 'Sum' ,
                              unit             : Safe_Str__Label = 'Count' ,
                              lookback_minutes : Safe_UInt       = 60   ,
                              period_seconds   : Safe_UInt       = 300  ,
                        ) -> Schema__Metric__Series:
        client   = self._client_for_namespace(str(namespace))
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(minutes=int(lookback_minutes))

        try:
            response = client.get_metric_statistics(
                Namespace  = str(namespace)                                  ,
                MetricName = str(metric_name)                                ,
                Dimensions = [{'Name': d['Name'], 'Value': d['Value']} for d in dimensions],
                StartTime  = start_time                                      ,
                EndTime    = end_time                                        ,
                Period     = int(period_seconds)                              ,
                Statistics = [str(statistic)]                                 ,
                Unit       = str(unit)                                       )

            datapoints = sorted(response.get('Datapoints', []), key=lambda d: d['Timestamp'])
            timestamps = [int(d['Timestamp'].timestamp()) for d in datapoints]
            values     = [d.get(str(statistic), 0.0)       for d in datapoints]
        except Exception:
            timestamps = []
            values     = []

        return Schema__Metric__Series(
            metric_name = metric_name                                        ,
            namespace   = namespace                                          ,
            dimensions  = dimensions                                         ,
            unit        = unit                                               ,
            statistic   = statistic                                          ,
            timestamps  = timestamps                                         ,
            values      = values                                             )

    def get_metric_data_extended(self, namespace        : str                 ,  # Percentile statistics (p50, p95, p99)
                                      metric_name      : Safe_Str__Label    ,
                                      dimensions       : list               ,
                                      statistic_label  : Safe_Str__Label    ,   # e.g., 'p95'
                                      unit             : Safe_Str__Label = 'Milliseconds',
                                      lookback_minutes : Safe_UInt       = 60   ,
                                      period_seconds   : Safe_UInt       = 300  ,
                                ) -> Schema__Metric__Series:
        client   = self._client_for_namespace(str(namespace))
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(minutes=int(lookback_minutes))

        metric_data_query = dict(
            Id         = 'metric_query'                                      ,
            MetricStat = dict(
                Metric = dict(
                    Namespace  = str(namespace)                              ,
                    MetricName = str(metric_name)                            ,
                    Dimensions = [{'Name': d['Name'], 'Value': d['Value']} for d in dimensions]),
                Period = int(period_seconds)                                  ,
                Stat   = str(statistic_label)                                ,
                Unit   = str(unit)                                           ))

        try:
            response = client.get_metric_data(
                MetricDataQueries = [metric_data_query]                      ,
                StartTime         = start_time                               ,
                EndTime           = end_time                                 )

            results    = response.get('MetricDataResults', [{}])[0] if response.get('MetricDataResults') else {}
            timestamps = [int(t.timestamp()) for t in results.get('Timestamps', [])]
            values     = list(results.get('Values', []))

            paired     = sorted(zip(timestamps, values), key=lambda p: p[0])
            timestamps = [p[0] for p in paired]
            values     = [p[1] for p in paired]
        except Exception:
            timestamps = []
            values     = []

        return Schema__Metric__Series(
            metric_name = metric_name                                        ,
            namespace   = namespace                                          ,
            dimensions  = dimensions                                         ,
            unit        = unit                                               ,
            statistic   = statistic_label                                    ,
            timestamps  = timestamps                                         ,
            values      = values                                             )

    # ═══════════════════════════════════════════════════════════════════════
    # Convenience Methods
    # ═══════════════════════════════════════════════════════════════════════

    def get_lambda_metric(self, function_name    : Safe_Str__Id             ,  # AWS/Lambda standard metric
                                metric_name      : Safe_Str__Label          ,
                                statistic        : Safe_Str__Label = 'Sum'  ,
                                unit             : Safe_Str__Label = 'Count',
                                lookback_minutes : Safe_UInt       = 60     ,
                                period_seconds   : Safe_UInt       = 300    ,
                          ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'FunctionName', 'Value': str(function_name)}]
        return self.get_metric_data(namespace        = 'AWS/Lambda'      ,
                                    metric_name      = metric_name       ,
                                    dimensions       = dimensions        ,
                                    statistic        = statistic         ,
                                    unit             = unit              ,
                                    lookback_minutes = lookback_minutes  ,
                                    period_seconds   = period_seconds    )

    def get_lambda_metric_percentile(self, function_name    : Safe_Str__Id              ,  # AWS/Lambda percentile
                                          metric_name      : Safe_Str__Label            ,
                                          percentile       : Safe_Str__Label = 'p95'    ,
                                          unit             : Safe_Str__Label = 'Milliseconds',
                                          lookback_minutes : Safe_UInt       = 60       ,
                                          period_seconds   : Safe_UInt       = 300      ,
                                    ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'FunctionName', 'Value': str(function_name)}]
        return self.get_metric_data_extended(namespace        = 'AWS/Lambda'      ,
                                            metric_name      = metric_name       ,
                                            dimensions       = dimensions        ,
                                            statistic_label  = percentile        ,
                                            unit             = unit              ,
                                            lookback_minutes = lookback_minutes  ,
                                            period_seconds   = period_seconds    )

    def get_s3_metric(self, bucket_name      : Safe_Str__Id             ,  # AWS/S3 request metric
                            filter_id        : Safe_Str__Id             ,
                            metric_name      : Safe_Str__Label          ,
                            statistic        : Safe_Str__Label = 'Sum'  ,
                            unit             : Safe_Str__Label = 'Count',
                            lookback_minutes : Safe_UInt       = 60     ,
                            period_seconds   : Safe_UInt       = 300    ,
                      ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'BucketName', 'Value': str(bucket_name)},
                      {'Name': 'FilterId' , 'Value': str(filter_id)  }]
        return self.get_metric_data(namespace        = 'AWS/S3'          ,
                                    metric_name      = metric_name       ,
                                    dimensions       = dimensions        ,
                                    statistic        = statistic         ,
                                    unit             = unit              ,
                                    lookback_minutes = lookback_minutes  ,
                                    period_seconds   = period_seconds    )

    def get_cloudfront_metric(self, distribution_id  : Safe_Str__Id             ,  # AWS/CloudFront metric (us-east-1 only)
                                    metric_name      : Safe_Str__Label          ,
                                    statistic        : Safe_Str__Label = 'Sum'  ,
                                    unit             : Safe_Str__Label = 'None' ,
                                    lookback_minutes : Safe_UInt       = 60     ,
                                    period_seconds   : Safe_UInt       = 300    ,
                              ) -> Schema__Metric__Series:
        dimensions = [{'Name': 'DistributionId', 'Value': str(distribution_id)},
                      {'Name': 'Region'        , 'Value': 'Global'            }]
        return self.get_metric_data(namespace        = 'AWS/CloudFront'  ,
                                    metric_name      = metric_name       ,
                                    dimensions       = dimensions        ,
                                    statistic        = statistic         ,
                                    unit             = unit              ,
                                    lookback_minutes = lookback_minutes  ,
                                    period_seconds   = period_seconds    )

    # ═══════════════════════════════════════════════════════════════════════
    # Internal
    # ═══════════════════════════════════════════════════════════════════════

    def _client_for_namespace(self, namespace):                          # CloudFront metrics are us-east-1 only
        if namespace == 'AWS/CloudFront':
            return self._boto3_client_cf
        return self._boto3_client
