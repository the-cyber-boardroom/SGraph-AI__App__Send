# ===============================================================================
# Tests for Server Analytics Schemas
# Verifies all Type_Safe schemas can be instantiated with defaults
# ===============================================================================

from unittest                                                                                      import TestCase
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Dimension          import Schema__Metric__Dimension
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series             import Schema__Metric__Series
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Lambda__Metrics            import Schema__Lambda__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__S3__Metrics                import Schema__S3__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__CloudFront__Metrics        import Schema__CloudFront__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Health__Status             import Schema__Health__Status
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Thresholds__Config         import Schema__Thresholds__Config
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metrics__Snapshot          import Schema__Metrics__Snapshot
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Aggregation__Window        import Schema__Aggregation__Window


class test_Schemas(TestCase):

    def test__Schema__Metric__Dimension(self):
        obj = Schema__Metric__Dimension(name='FunctionName', value='test-fn')
        assert str(obj.name)  == 'FunctionName'
        assert str(obj.value) == 'test-fn'

    def test__Schema__Metric__Series(self):
        obj = Schema__Metric__Series(metric_name='Invocations', namespace='AWS/Lambda',
                                      dimensions=[], unit='Count', statistic='Sum',
                                      timestamps=[1000, 2000], values=[10.0, 20.0])
        assert str(obj.metric_name) == 'Invocations'
        assert len(obj.timestamps)  == 2
        assert len(obj.values)      == 2

    def test__Schema__Metric__Series__json(self):
        obj = Schema__Metric__Series(metric_name='Test', namespace='Test',
                                      dimensions=[], unit='Count', statistic='Sum',
                                      timestamps=[], values=[])
        result = obj.json()
        assert type(result) is dict
        assert 'metric_name' in result
        assert 'values'      in result

    def test__Schema__Lambda__Metrics__default(self):
        obj = Schema__Lambda__Metrics()
        assert str(obj.function_name) == ''

    def test__Schema__S3__Metrics__default(self):
        obj = Schema__S3__Metrics()
        assert str(obj.bucket_name) == ''

    def test__Schema__CloudFront__Metrics__default(self):
        obj = Schema__CloudFront__Metrics()
        assert str(obj.distribution_id) == ''

    def test__Schema__Health__Status(self):
        obj = Schema__Health__Status(component='Lambda: user', status='healthy',
                                      status_emoji='ok', message='All good', metrics={})
        assert str(obj.component) == 'Lambda: user'
        assert str(obj.status)    == 'healthy'

    def test__Schema__Thresholds__Config__defaults(self):
        obj = Schema__Thresholds__Config()
        assert float(obj.lambda_error_rate_warning)  == 1.0
        assert float(obj.lambda_error_rate_critical) == 5.0
        assert int(obj.lambda_duration_p95_warning)  == 5000
        assert int(obj.s3_error_5xx_threshold)       == 0
        assert float(obj.cloudfront_5xx_rate_warning) == 1.0
        assert float(obj.cloudfront_cache_hit_low)    == 50.0

    def test__Schema__Metrics__Snapshot__default(self):
        obj = Schema__Metrics__Snapshot()
        assert str(obj.region) == ''

    def test__Schema__Aggregation__Window__default(self):
        obj = Schema__Aggregation__Window()
        assert str(obj.window_label) == ''
        assert int(obj.event_count)  == 0
