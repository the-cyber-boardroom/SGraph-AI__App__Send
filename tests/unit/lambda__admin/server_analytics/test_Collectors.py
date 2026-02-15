# ===============================================================================
# Tests for Metric Collectors
# Verifies Lambda, S3, and CloudFront collectors produce correct schemas
# Uses CloudWatch__Client__Stub (no mocks, no patches)
# ===============================================================================

from unittest                                                                                     import TestCase
from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client__Stub                  import CloudWatch__Client__Stub
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.Lambda__Metrics__Collector      import Lambda__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.S3__Metrics__Collector          import S3__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.collectors.CloudFront__Metrics__Collector  import CloudFront__Metrics__Collector
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Lambda__Metrics            import Schema__Lambda__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__S3__Metrics                import Schema__S3__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__CloudFront__Metrics        import Schema__CloudFront__Metrics


class test_Lambda__Metrics__Collector(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.stub = CloudWatch__Client__Stub().setup()
        cls.collector = Lambda__Metrics__Collector(cloudwatch_client = cls.stub        ,
                                                    function_name     = 'user-dev'      ,
                                                    lookback_minutes  = 60              ,
                                                    period_seconds    = 300             )

    def test__collect(self):
        result = self.collector.collect()
        assert type(result) is Schema__Lambda__Metrics
        assert str(result.function_name) == 'user-dev'

    def test__collect__has_all_metrics(self):
        result = self.collector.collect()
        assert len(result.invocations.values)           > 0
        assert len(result.errors.values)                > 0
        assert len(result.duration_avg.values)          > 0
        assert len(result.duration_p50.values)          > 0
        assert len(result.duration_p95.values)          > 0
        assert len(result.duration_p99.values)          > 0
        assert len(result.duration_max.values)          > 0
        assert len(result.throttles.values)             > 0
        assert len(result.concurrent_executions.values) > 0


class test_S3__Metrics__Collector(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.stub = CloudWatch__Client__Stub().setup()
        cls.collector = S3__Metrics__Collector(cloudwatch_client = cls.stub          ,
                                                bucket_name       = 'test-bucket'     ,
                                                filter_id         = 'all-requests'    ,
                                                lookback_minutes  = 60                ,
                                                period_seconds    = 300               )

    def test__collect(self):
        result = self.collector.collect()
        assert type(result) is Schema__S3__Metrics
        assert str(result.bucket_name) == 'test-bucket'
        assert str(result.filter_id)   == 'all-requests'

    def test__collect__has_all_metrics(self):
        result = self.collector.collect()
        assert len(result.get_requests.values)          > 0
        assert len(result.put_requests.values)          > 0
        assert len(result.first_byte_latency.values)    > 0
        assert len(result.total_request_latency.values) > 0
        assert len(result.errors_4xx.values)            > 0
        assert len(result.errors_5xx.values)            > 0
        assert len(result.bytes_downloaded.values)      > 0
        assert len(result.bytes_uploaded.values)        > 0


class test_CloudFront__Metrics__Collector(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.stub = CloudWatch__Client__Stub().setup()
        cls.collector = CloudFront__Metrics__Collector(cloudwatch_client = cls.stub       ,
                                                        distribution_id   = 'E1ABC2DEF'   ,
                                                        lookback_minutes  = 60             ,
                                                        period_seconds    = 300            )

    def test__collect(self):
        result = self.collector.collect()
        assert type(result) is Schema__CloudFront__Metrics
        assert str(result.distribution_id) == 'E1ABC2DEF'

    def test__collect__has_all_metrics(self):
        result = self.collector.collect()
        assert len(result.requests.values)         > 0
        assert len(result.bytes_downloaded.values) > 0
        assert len(result.bytes_uploaded.values)   > 0
        assert len(result.error_rate_4xx.values)   > 0
        assert len(result.error_rate_5xx.values)   > 0
        assert len(result.cache_hit_rate.values)   > 0
