# ===============================================================================
# SGraph Send - Metrics Pipeline Setup
# Factory function to build the full metrics pipeline from environment config
# Returns None if required env vars are not set or if setup fails
# Logs diagnostics so deployment issues are visible in CloudWatch Logs
# ===============================================================================

import os

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
        _log('[metrics] METRICS__ENABLED=False — missing env vars:'
             f' CLOUDFRONT_DISTRIBUTION_ID={bool(METRICS__CLOUDFRONT_DISTRIBUTION_ID)}'
             f' LAMBDA_USER_NAME={bool(METRICS__LAMBDA_USER_NAME)}'
             f' LAMBDA_ADMIN_NAME={bool(METRICS__LAMBDA_ADMIN_NAME)}'
             f' S3_TRANSFERS_BUCKET={bool(METRICS__S3_TRANSFERS_BUCKET)}'
             f' S3_CACHE_BUCKET={bool(METRICS__S3_CACHE_BUCKET)}')
        return None

    try:
        cloudwatch_client = _create_cloudwatch_client()
        metrics_collector = _create_metrics_collector(cloudwatch_client)
        metrics_cache     = _create_metrics_cache_service(send_cache_client, metrics_collector)

        _log(f'[metrics] Pipeline enabled — region={METRICS__AWS_REGION}'
             f' distribution={METRICS__CLOUDFRONT_DISTRIBUTION_ID}'
             f' lambda_user={METRICS__LAMBDA_USER_NAME}'
             f' lambda_admin={METRICS__LAMBDA_ADMIN_NAME}')

        return metrics_cache

    except Exception as e:
        _log(f'[metrics] Pipeline setup FAILED: {type(e).__name__}: {e}')
        return None


def create_metrics_cache_with_stub(send_cache_client):                     # Build pipeline with stub (for local dev / testing)
    from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client__Stub    import CloudWatch__Client__Stub
    from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Collector import Service__Metrics__Collector
    from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Cache     import Service__Metrics__Cache
    from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config import Schema__Thresholds__Config

    stub = CloudWatch__Client__Stub().setup()

    metrics_collector = Service__Metrics__Collector(
        cloudwatch_client   = stub                                         ,
        region              = METRICS__AWS_REGION or 'eu-west-2'            ,
        distribution_id     = METRICS__CLOUDFRONT_DISTRIBUTION_ID or 'STUB',
        lambda_user_name    = METRICS__LAMBDA_USER_NAME  or 'stub-user'    ,
        lambda_admin_name   = METRICS__LAMBDA_ADMIN_NAME or 'stub-admin'   ,
        s3_transfers_bucket = METRICS__S3_TRANSFERS_BUCKET or 'stub-xfers' ,
        s3_cache_bucket     = METRICS__S3_CACHE_BUCKET or 'stub-cache'     ,
        s3_filter_id        = METRICS__S3_FILTER_ID or 'all-requests'      ,
        thresholds          = Schema__Thresholds__Config()                  )

    metrics_cache = Service__Metrics__Cache(
        send_cache_client = send_cache_client                              ,
        metrics_collector = metrics_collector                               )

    _log('[metrics] Pipeline enabled with STUB data (no AWS calls)')
    return metrics_cache


# ═══════════════════════════════════════════════════════════════════════════════
# Internal — Pipeline Construction
# ═══════════════════════════════════════════════════════════════════════════════

def _create_cloudwatch_client():
    from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client import CloudWatch__Client
    client = CloudWatch__Client(region = METRICS__AWS_REGION)
    client.setup()
    return client


def _create_metrics_collector(cloudwatch_client):
    from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Collector import Service__Metrics__Collector
    from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config import Schema__Thresholds__Config

    return Service__Metrics__Collector(
        cloudwatch_client   = cloudwatch_client                            ,
        region              = METRICS__AWS_REGION                           ,
        distribution_id     = METRICS__CLOUDFRONT_DISTRIBUTION_ID           ,
        lambda_user_name    = METRICS__LAMBDA_USER_NAME                     ,
        lambda_admin_name   = METRICS__LAMBDA_ADMIN_NAME                    ,
        s3_transfers_bucket = METRICS__S3_TRANSFERS_BUCKET                  ,
        s3_cache_bucket     = METRICS__S3_CACHE_BUCKET                      ,
        s3_filter_id        = METRICS__S3_FILTER_ID                         ,
        thresholds          = Schema__Thresholds__Config()                  )


def _create_metrics_cache_service(send_cache_client, metrics_collector):
    from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Cache import Service__Metrics__Cache

    return Service__Metrics__Cache(
        send_cache_client = send_cache_client                              ,
        metrics_collector = metrics_collector                               )


def _log(message):                                                         # Print to stdout (Lambda CloudWatch Logs picks this up)
    print(message)
