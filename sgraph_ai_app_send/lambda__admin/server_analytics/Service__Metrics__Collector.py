# ===============================================================================
# SGraph Send - Metrics Collector Service
# Orchestrates collection from all infrastructure components
# Produces a complete Schema__Metrics__Snapshot
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.CloudFront__Logs__Collector                import CloudFront__Logs__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.CloudFront__Metrics__Collector             import CloudFront__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.Lambda__Metrics__Collector                 import Lambda__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.S3__Metrics__Collector                     import S3__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Health__Status                        import Schema__Health__Status
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metrics__Snapshot                     import Schema__Metrics__Snapshot
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config                    import Schema__Thresholds__Config


class Service__Metrics__Collector(Type_Safe):                              # Orchestrates metrics collection across all components
    cloudwatch_client   : object                                           # CloudWatch__Client or CloudWatch__Client__Stub
    region              : Safe_Str__Id   = 'eu-west-2'                     # Primary AWS region
    lookback_minutes    : Safe_UInt      = 60                              # Default lookback
    period_seconds      : Safe_UInt      = 300                             # Default CloudWatch resolution

    # Infrastructure identifiers
    distribution_id     : Safe_Str__Id                                     # CloudFront distribution ID
    lambda_user_name    : Safe_Str__Id                                     # User Lambda function name
    lambda_admin_name   : Safe_Str__Id                                     # Admin Lambda function name
    s3_transfers_bucket : Safe_Str__Id                                     # Transfers S3 bucket name
    s3_cache_bucket     : Safe_Str__Id                                     # Cache S3 bucket name
    s3_filter_id        : Safe_Str__Id   = 'all-requests'                  # S3 request metrics filter ID
    thresholds          : Schema__Thresholds__Config                        # Health evaluation thresholds

    def collect_snapshot(self) -> Schema__Metrics__Snapshot:                # Collect full metrics snapshot
        cloudfront   = self._collect_cloudfront()
        lambda_user  = self._collect_lambda(self.lambda_user_name)
        lambda_admin = self._collect_lambda(self.lambda_admin_name)
        s3_transfers = self._collect_s3(self.s3_transfers_bucket)
        s3_cache     = self._collect_s3(self.s3_cache_bucket)

        health_status = self._evaluate_health(cloudfront   = cloudfront   ,
                                               lambda_user  = lambda_user  ,
                                               lambda_admin = lambda_admin ,
                                               s3_transfers = s3_transfers ,
                                               s3_cache     = s3_cache     )

        return Schema__Metrics__Snapshot(
            region           = self.region                                  ,
            lookback_minutes = self.lookback_minutes                        ,
            period_seconds   = self.period_seconds                          ,
            cloudfront       = cloudfront                                   ,
            lambda_user      = lambda_user                                  ,
            lambda_admin     = lambda_admin                                 ,
            s3_transfers     = s3_transfers                                 ,
            s3_cache         = s3_cache                                     ,
            health_status    = [h.json() for h in health_status]           )

    def collect_cloudfront_logs_summary(self, logs_bucket, lookback_hours=24) -> dict:  # Collect CF real-time logs summary
        collector = CloudFront__Logs__Collector(logs_bucket    = logs_bucket    ,
                                                lookback_hours = lookback_hours )
        collector.setup()
        return collector.collect_summary()

    # ═══════════════════════════════════════════════════════════════════════
    # Internal — Collection
    # ═══════════════════════════════════════════════════════════════════════

    def _collect_cloudfront(self):                                          # Collect CloudFront metrics
        collector = CloudFront__Metrics__Collector(
            cloudwatch_client = self.cloudwatch_client                      ,
            distribution_id   = self.distribution_id                        ,
            lookback_minutes  = self.lookback_minutes                       ,
            period_seconds    = self.period_seconds                         )
        return collector.collect()

    def _collect_lambda(self, function_name):                              # Collect Lambda metrics for one function
        collector = Lambda__Metrics__Collector(
            cloudwatch_client = self.cloudwatch_client                      ,
            function_name     = function_name                               ,
            lookback_minutes  = self.lookback_minutes                       ,
            period_seconds    = self.period_seconds                         )
        return collector.collect()

    def _collect_s3(self, bucket_name):                                    # Collect S3 metrics for one bucket
        collector = S3__Metrics__Collector(
            cloudwatch_client = self.cloudwatch_client                      ,
            bucket_name       = bucket_name                                 ,
            filter_id         = self.s3_filter_id                           ,
            lookback_minutes  = self.lookback_minutes                       ,
            period_seconds    = self.period_seconds                         )
        return collector.collect()

    # ═══════════════════════════════════════════════════════════════════════
    # Internal — Health Evaluation
    # ═══════════════════════════════════════════════════════════════════════

    def _evaluate_health(self, cloudfront, lambda_user, lambda_admin, s3_transfers, s3_cache) -> list:
        results = []
        results.append(self._evaluate_lambda_health('Lambda: user'  , lambda_user ))
        results.append(self._evaluate_lambda_health('Lambda: admin' , lambda_admin))
        results.append(self._evaluate_s3_health    ('S3: transfers' , s3_transfers))
        results.append(self._evaluate_s3_health    ('S3: cache'     , s3_cache    ))
        results.append(self._evaluate_cf_health    ('CloudFront'    , cloudfront  ))
        return results

    def _evaluate_lambda_health(self, component_name, metrics) -> Schema__Health__Status:
        invocations = self._sum_values(metrics.invocations)
        errors      = self._sum_values(metrics.errors)
        error_rate  = (errors / invocations * 100) if invocations > 0 else 0.0

        if error_rate >= float(self.thresholds.lambda_error_rate_critical):
            return Schema__Health__Status(component    = component_name                               ,
                                          status       = 'critical'                                    ,
                                          status_emoji = '!'                                           ,
                                          message      = f'Error rate {error_rate:.1f}% is critical'   ,
                                          metrics      = dict(invocations=invocations, errors=errors, error_rate=round(error_rate, 2)))
        if error_rate >= float(self.thresholds.lambda_error_rate_warning):
            return Schema__Health__Status(component    = component_name                               ,
                                          status       = 'warning'                                     ,
                                          status_emoji = '?'                                           ,
                                          message      = f'Error rate {error_rate:.1f}% elevated'      ,
                                          metrics      = dict(invocations=invocations, errors=errors, error_rate=round(error_rate, 2)))
        return Schema__Health__Status(component    = component_name                                   ,
                                      status       = 'healthy'                                         ,
                                      status_emoji = 'ok'                                              ,
                                      message      = f'{int(invocations)} invocations, {error_rate:.1f}% errors',
                                      metrics      = dict(invocations=invocations, errors=errors, error_rate=round(error_rate, 2)))

    def _evaluate_s3_health(self, component_name, metrics) -> Schema__Health__Status:
        errors_5xx = self._sum_values(metrics.errors_5xx)
        gets       = self._sum_values(metrics.get_requests)
        puts       = self._sum_values(metrics.put_requests)

        if errors_5xx > int(self.thresholds.s3_error_5xx_threshold):
            return Schema__Health__Status(component    = component_name                               ,
                                          status       = 'warning'                                     ,
                                          status_emoji = '?'                                           ,
                                          message      = f'{int(errors_5xx)} 5xx errors detected'      ,
                                          metrics      = dict(get_requests=gets, put_requests=puts, errors_5xx=errors_5xx))
        return Schema__Health__Status(component    = component_name                                   ,
                                      status       = 'healthy'                                         ,
                                      status_emoji = 'ok'                                              ,
                                      message      = f'{int(gets)} GETs, {int(puts)} PUTs'             ,
                                      metrics      = dict(get_requests=gets, put_requests=puts, errors_5xx=errors_5xx))

    def _evaluate_cf_health(self, component_name, metrics) -> Schema__Health__Status:
        error_5xx_values = metrics.error_rate_5xx.values
        avg_5xx = sum(error_5xx_values) / len(error_5xx_values) if error_5xx_values else 0.0

        cache_values  = metrics.cache_hit_rate.values
        avg_cache_hit = sum(cache_values) / len(cache_values) if cache_values else 0.0

        if avg_5xx >= float(self.thresholds.cloudfront_5xx_rate_warning):
            return Schema__Health__Status(component    = component_name                               ,
                                          status       = 'warning'                                     ,
                                          status_emoji = '?'                                           ,
                                          message      = f'5xx error rate {avg_5xx:.1f}% elevated'     ,
                                          metrics      = dict(error_rate_5xx=round(avg_5xx, 2), cache_hit_rate=round(avg_cache_hit, 2)))
        if avg_cache_hit < float(self.thresholds.cloudfront_cache_hit_low):
            return Schema__Health__Status(component    = component_name                               ,
                                          status       = 'warning'                                     ,
                                          status_emoji = '?'                                           ,
                                          message      = f'Cache hit rate {avg_cache_hit:.1f}% is low' ,
                                          metrics      = dict(error_rate_5xx=round(avg_5xx, 2), cache_hit_rate=round(avg_cache_hit, 2)))
        return Schema__Health__Status(component    = component_name                                   ,
                                      status       = 'healthy'                                         ,
                                      status_emoji = 'ok'                                              ,
                                      message      = f'Cache hit {avg_cache_hit:.1f}%, 5xx {avg_5xx:.1f}%',
                                      metrics      = dict(error_rate_5xx=round(avg_5xx, 2), cache_hit_rate=round(avg_cache_hit, 2)))

    def _sum_values(self, series):                                         # Sum all values in a metric series
        return sum(series.values) if series.values else 0.0
