# ===============================================================================
# Tests for CloudWatch__Client__Stub
# Verifies stub returns well-formed metric series with canned data
# ===============================================================================

from unittest                                                                                     import TestCase
from sgraph_ai_app_send.lambda__admin.server_analytics.CloudWatch__Client__Stub                  import CloudWatch__Client__Stub
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series            import Schema__Metric__Series


class test_CloudWatch__Client__Stub(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.stub = CloudWatch__Client__Stub().setup()

    def test__setup(self):
        assert type(self.stub) is CloudWatch__Client__Stub

    def test__get_lambda_metric(self):
        result = self.stub.get_lambda_metric(function_name = 'test-fn'    ,
                                              metric_name   = 'Invocations',
                                              statistic     = 'Sum'        ,
                                              unit          = 'Count'      )
        assert type(result) is Schema__Metric__Series
        assert str(result.metric_name) == 'Invocations'
        assert str(result.namespace)   == 'AWS/Lambda'
        assert len(result.timestamps)   > 0
        assert len(result.values)       > 0
        assert len(result.timestamps)  == len(result.values)

    def test__get_lambda_metric_percentile(self):
        result = self.stub.get_lambda_metric_percentile(function_name = 'test-fn'      ,
                                                         metric_name   = 'Duration'     ,
                                                         percentile    = 'p95'          ,
                                                         unit          = 'Milliseconds' )
        assert type(result) is Schema__Metric__Series
        assert str(result.statistic) == 'p95'
        assert len(result.values)     > 0

    def test__get_s3_metric(self):
        result = self.stub.get_s3_metric(bucket_name = 'test-bucket'  ,
                                          filter_id   = 'all-requests' ,
                                          metric_name = 'GetRequests'  ,
                                          statistic   = 'Sum'          ,
                                          unit        = 'Count'        )
        assert type(result) is Schema__Metric__Series
        assert str(result.namespace) == 'AWS/S3'
        assert len(result.dimensions) == 2
        assert result.dimensions[0]['Name']  == 'BucketName'
        assert result.dimensions[0]['Value'] == 'test-bucket'

    def test__get_cloudfront_metric(self):
        result = self.stub.get_cloudfront_metric(distribution_id = 'E1ABC2DEF' ,
                                                   metric_name     = 'Requests'  ,
                                                   statistic       = 'Sum'       ,
                                                   unit            = 'None'      )
        assert type(result) is Schema__Metric__Series
        assert str(result.namespace) == 'AWS/CloudFront'
        assert len(result.dimensions) == 2
        assert result.dimensions[0]['Name']  == 'DistributionId'
        assert result.dimensions[1]['Value'] == 'Global'

    def test__series_data_ascending(self):
        result = self.stub.get_lambda_metric(function_name = 'test-fn'     ,
                                              metric_name   = 'Invocations' ,
                                              lookback_minutes = 60         ,
                                              period_seconds   = 300        )
        assert len(result.values) == 12                                       # 60*60/300 = 12
        assert result.values[0] < result.values[-1]                           # Ascending
        assert result.timestamps[0] < result.timestamps[-1]                   # Chronological

    def test__get_metric_data(self):
        result = self.stub.get_metric_data(namespace   = 'AWS/Lambda'                          ,
                                            metric_name = 'Invocations'                         ,
                                            dimensions  = [{'Name': 'FunctionName', 'Value': 'x'}],
                                            statistic   = 'Sum'                                 ,
                                            unit        = 'Count'                               )
        assert type(result) is Schema__Metric__Series
