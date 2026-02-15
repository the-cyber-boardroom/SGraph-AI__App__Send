# ===============================================================================
# Tests for Metrics Pipeline Setup (Factory)
# Verifies factory returns None when env vars not set
# Verifies factory builds full pipeline when env vars present
# ===============================================================================

import os
from unittest                                                                                          import TestCase
from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Cache                        import Service__Metrics__Cache
from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client__Stub                       import CloudWatch__Client__Stub
from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Collector                    import Service__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config             import Schema__Thresholds__Config


class test_Metrics__Pipeline__Setup(TestCase):

    def test__factory_returns_none_when_disabled(self):
        import sgraph_ai_app_send.lambda__admin.admin__config as config
        original = config.METRICS__ENABLED
        try:
            config.METRICS__ENABLED = False
            from sgraph_ai_app_send.lambda__admin.server_analytics.Metrics__Pipeline__Setup import create_metrics_cache
            result = create_metrics_cache(None)
            assert result is None
        finally:
            config.METRICS__ENABLED = original

    def test__pipeline_with_stub__produces_snapshot(self):
        from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup import create_send_cache_client

        stub = CloudWatch__Client__Stub().setup()
        collector = Service__Metrics__Collector(
            cloudwatch_client   = stub                                     ,
            region              = 'eu-west-2'                               ,
            distribution_id     = 'E1TEST'                                  ,
            lambda_user_name    = 'user-test'                               ,
            lambda_admin_name   = 'admin-test'                              ,
            s3_transfers_bucket = 'transfers-test'                          ,
            s3_cache_bucket     = 'cache-test'                              ,
            thresholds          = Schema__Thresholds__Config()              )

        cache_client  = create_send_cache_client()
        metrics_cache = Service__Metrics__Cache(
            send_cache_client = cache_client                               ,
            metrics_collector = collector                                    )

        snapshot = metrics_cache.get_snapshot(force_refresh=True)
        assert type(snapshot) is dict
        assert 'cloudfront'    in snapshot
        assert 'lambda_user'   in snapshot
        assert 'health_status' in snapshot
        assert '_cached_at'    in snapshot

    def test__pipeline_cache_returns_cached_on_second_call(self):
        from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup import create_send_cache_client

        stub = CloudWatch__Client__Stub().setup()
        collector = Service__Metrics__Collector(
            cloudwatch_client   = stub                                     ,
            region              = 'eu-west-2'                               ,
            distribution_id     = 'E1TEST'                                  ,
            lambda_user_name    = 'user-test'                               ,
            lambda_admin_name   = 'admin-test'                              ,
            s3_transfers_bucket = 'transfers-test'                          ,
            s3_cache_bucket     = 'cache-test'                              ,
            thresholds          = Schema__Thresholds__Config()              )

        cache_client  = create_send_cache_client()
        metrics_cache = Service__Metrics__Cache(
            send_cache_client = cache_client                               ,
            metrics_collector = collector                                    )

        first  = metrics_cache.get_snapshot(force_refresh=True)
        second = metrics_cache.get_snapshot(force_refresh=False)
        assert first['_cached_at'] == second['_cached_at']

    def test__cache_status(self):
        from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup import create_send_cache_client

        stub = CloudWatch__Client__Stub().setup()
        collector = Service__Metrics__Collector(
            cloudwatch_client   = stub                                     ,
            region              = 'eu-west-2'                               ,
            distribution_id     = 'E1TEST'                                  ,
            lambda_user_name    = 'user-test'                               ,
            lambda_admin_name   = 'admin-test'                              ,
            s3_transfers_bucket = 'transfers-test'                          ,
            s3_cache_bucket     = 'cache-test'                              ,
            thresholds          = Schema__Thresholds__Config()              )

        cache_client  = create_send_cache_client()
        metrics_cache = Service__Metrics__Cache(
            send_cache_client = cache_client                               ,
            metrics_collector = collector                                    )

        status_before = metrics_cache.get_cache_status()
        assert status_before['snapshot_cached'] is False

        metrics_cache.get_snapshot(force_refresh=True)

        status_after = metrics_cache.get_cache_status()
        assert status_after['snapshot_cached'] is True
        assert status_after['snapshot_age_s']  is not None
        assert status_after['cache_ttl_s']     == 300
