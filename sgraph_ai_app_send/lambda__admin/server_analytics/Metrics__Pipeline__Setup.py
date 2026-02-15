# ===============================================================================
# SGraph Send - Metrics Pipeline Setup
# Factory function to build the full metrics pipeline from environment config
# Returns None if required env vars are not set (graceful degradation)
# ===============================================================================

from sgraph_ai_app_send.lambda__admin.admin__config import (METRICS__ENABLED                    ,
                                                             METRICS__CLOUDFRONT_DISTRIBUTION_ID  ,
                                                             METRICS__LAMBDA_USER_NAME            ,
                                                             METRICS__LAMBDA_ADMIN_NAME           ,
                                                             METRICS__S3_TRANSFERS_BUCKET         ,
                                                             METRICS__S3_CACHE_BUCKET             ,
                                                             METRICS__S3_FILTER_ID                ,
                                                             METRICS__AWS_REGION                  )


def create_metrics_cache(send_cache_client):                               # Build metrics pipeline or return None
    if not METRICS__ENABLED:
        return None

    from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client          import CloudWatch__Client
    from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Collector import Service__Metrics__Collector
    from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Cache     import Service__Metrics__Cache
    from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config import Schema__Thresholds__Config

    cloudwatch_client = CloudWatch__Client(region = METRICS__AWS_REGION)
    cloudwatch_client.setup()

    metrics_collector = Service__Metrics__Collector(
        cloudwatch_client   = cloudwatch_client                            ,
        region              = METRICS__AWS_REGION                           ,
        distribution_id     = METRICS__CLOUDFRONT_DISTRIBUTION_ID           ,
        lambda_user_name    = METRICS__LAMBDA_USER_NAME                     ,
        lambda_admin_name   = METRICS__LAMBDA_ADMIN_NAME                    ,
        s3_transfers_bucket = METRICS__S3_TRANSFERS_BUCKET                  ,
        s3_cache_bucket     = METRICS__S3_CACHE_BUCKET                      ,
        s3_filter_id        = METRICS__S3_FILTER_ID                         ,
        thresholds          = Schema__Thresholds__Config()                  )

    metrics_cache = Service__Metrics__Cache(
        send_cache_client = send_cache_client                              ,
        metrics_collector = metrics_collector                               )

    return metrics_cache
