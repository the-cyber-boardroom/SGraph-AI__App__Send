# ===============================================================================
# SGraph Send - Lambda Metrics Collector
# Collects all CloudWatch metrics for one Lambda function
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Lambda__Metrics                       import Schema__Lambda__Metrics


class Lambda__Metrics__Collector(Type_Safe):                             # Collects metrics for one Lambda function
    cloudwatch_client : object                                           # CloudWatch__Client or CloudWatch__Client__Stub
    function_name     : Safe_Str__Id                                     # Lambda function name (e.g., 'user-dev')
    lookback_minutes  : Safe_UInt = 60                                   # Time range to collect
    period_seconds    : Safe_UInt = 300                                  # CloudWatch resolution

    def collect(self) -> Schema__Lambda__Metrics:                        # Collect all Lambda metrics
        return Schema__Lambda__Metrics(
            function_name         = self.function_name                    ,
            invocations           = self.collect_invocations()            ,
            errors                = self.collect_errors()                 ,
            duration_avg          = self.collect_duration_avg()           ,
            duration_p50          = self.collect_duration_percentile('p50'),
            duration_p95          = self.collect_duration_percentile('p95'),
            duration_p99          = self.collect_duration_percentile('p99'),
            duration_max          = self.collect_duration_max()           ,
            throttles             = self.collect_throttles()              ,
            concurrent_executions = self.collect_concurrent_executions()  )

    def collect_invocations(self):
        return self.cloudwatch_client.get_lambda_metric(
            function_name = self.function_name, metric_name = 'Invocations',
            statistic = 'Sum', unit = 'Count', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)

    def collect_errors(self):
        return self.cloudwatch_client.get_lambda_metric(
            function_name = self.function_name, metric_name = 'Errors',
            statistic = 'Sum', unit = 'Count', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)

    def collect_duration_avg(self):
        return self.cloudwatch_client.get_lambda_metric(
            function_name = self.function_name, metric_name = 'Duration',
            statistic = 'Average', unit = 'Milliseconds', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)

    def collect_duration_percentile(self, percentile):
        return self.cloudwatch_client.get_lambda_metric_percentile(
            function_name = self.function_name, metric_name = 'Duration',
            percentile = percentile, unit = 'Milliseconds', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)

    def collect_duration_max(self):
        return self.cloudwatch_client.get_lambda_metric(
            function_name = self.function_name, metric_name = 'Duration',
            statistic = 'Maximum', unit = 'Milliseconds', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)

    def collect_throttles(self):
        return self.cloudwatch_client.get_lambda_metric(
            function_name = self.function_name, metric_name = 'Throttles',
            statistic = 'Sum', unit = 'Count', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)

    def collect_concurrent_executions(self):
        return self.cloudwatch_client.get_lambda_metric(
            function_name = self.function_name, metric_name = 'ConcurrentExecutions',
            statistic = 'Maximum', unit = 'Count', lookback_minutes = self.lookback_minutes, period_seconds = self.period_seconds)
