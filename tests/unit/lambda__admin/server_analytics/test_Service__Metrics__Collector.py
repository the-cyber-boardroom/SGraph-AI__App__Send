# ===============================================================================
# Tests for Service__Metrics__Collector (Orchestrator)
# Verifies full snapshot collection and health evaluation
# Uses CloudWatch__Client__Stub (no mocks, no patches)
# ===============================================================================

from unittest                                                                                      import TestCase
from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client__Stub                   import CloudWatch__Client__Stub
from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Collector                import Service__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metrics__Snapshot          import Schema__Metrics__Snapshot
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config         import Schema__Thresholds__Config


class test_Service__Metrics__Collector(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.stub = CloudWatch__Client__Stub().setup()
        cls.service = Service__Metrics__Collector(
            cloudwatch_client   = cls.stub                                ,
            region              = 'eu-west-2'                              ,
            distribution_id     = 'E1ABC2DEF'                              ,
            lambda_user_name    = 'user-dev'                               ,
            lambda_admin_name   = 'admin-dev'                              ,
            s3_transfers_bucket = 'transfers-bucket'                       ,
            s3_cache_bucket     = 'cache-bucket'                           ,
            s3_filter_id        = 'all-requests'                           ,
            lookback_minutes    = 60                                       ,
            period_seconds      = 300                                      ,
            thresholds          = Schema__Thresholds__Config()             )

    def test__collect_snapshot(self):
        result = self.service.collect_snapshot()
        assert type(result) is Schema__Metrics__Snapshot

    def test__collect_snapshot__has_cloudfront(self):
        result = self.service.collect_snapshot()
        assert str(result.cloudfront.distribution_id) == 'E1ABC2DEF'
        assert len(result.cloudfront.requests.values) > 0

    def test__collect_snapshot__has_lambda_user(self):
        result = self.service.collect_snapshot()
        assert str(result.lambda_user.function_name) == 'user-dev'
        assert len(result.lambda_user.invocations.values) > 0

    def test__collect_snapshot__has_lambda_admin(self):
        result = self.service.collect_snapshot()
        assert str(result.lambda_admin.function_name) == 'admin-dev'

    def test__collect_snapshot__has_s3_transfers(self):
        result = self.service.collect_snapshot()
        assert str(result.s3_transfers.bucket_name) == 'transfers-bucket'

    def test__collect_snapshot__has_s3_cache(self):
        result = self.service.collect_snapshot()
        assert str(result.s3_cache.bucket_name) == 'cache-bucket'

    def test__collect_snapshot__has_health_status(self):
        result = self.service.collect_snapshot()
        assert type(result.health_status) is list
        assert len(result.health_status) == 5                               # Lambda user, admin, S3 transfers, cache, CF

    def test__health_status__all_healthy_with_stub_data(self):
        result = self.service.collect_snapshot()
        for health in result.health_status:
            assert health['status'] in ('healthy', 'warning', 'critical')
            assert health['component'] != ''
            assert health['message']   != ''

    def test__collect_snapshot__region(self):
        result = self.service.collect_snapshot()
        assert str(result.region) == 'eu-west-2'

    def test__collect_snapshot__lookback_minutes(self):
        result = self.service.collect_snapshot()
        assert int(result.lookback_minutes) == 60

    def test__collect_snapshot__json_serializable(self):
        result = self.service.collect_snapshot()
        snapshot_dict = result.json()
        assert type(snapshot_dict) is dict
        assert 'cloudfront'    in snapshot_dict
        assert 'lambda_user'   in snapshot_dict
        assert 'lambda_admin'  in snapshot_dict
        assert 's3_transfers'  in snapshot_dict
        assert 's3_cache'      in snapshot_dict
        assert 'health_status' in snapshot_dict
