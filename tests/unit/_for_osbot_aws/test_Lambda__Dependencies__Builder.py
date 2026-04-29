from unittest                                                                    import TestCase
from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Builder             import Lambda__Dependencies__Builder
from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Loader              import versioned_name


class test_Lambda__Dependencies__Builder(TestCase):

    PACKAGES = ['fastapi-mcp==0.4.0'                     ,
                'httpx==0.28.1'                          ,
                'memory-fs==v0.40.0'                     ,
                'osbot-fast-api-serverless==v1.33.0'     ]

    def setUp(self):
        self.builder = Lambda__Dependencies__Builder('sgraph-send-user', self.PACKAGES)

    def test__combined_name__matches_loader(self):
        assert self.builder.combined_name() == versioned_name('sgraph-send-user', self.PACKAGES)

    def test__s3_key__format(self):
        key = self.builder.s3_key()
        assert key.startswith('lambdas-dependencies-combined/')
        assert key.endswith('.zip')
        assert 'sgraph-send-user-' in key

    def test__s3_key__stable_for_same_packages(self):
        b1 = Lambda__Dependencies__Builder('sgraph-send-user', self.PACKAGES)
        b2 = Lambda__Dependencies__Builder('sgraph-send-user', self.PACKAGES)
        assert b1.s3_key() == b2.s3_key()

    def test__s3_key__changes_when_packages_change(self):
        b1 = Lambda__Dependencies__Builder('sgraph-send-user', self.PACKAGES)
        b2 = Lambda__Dependencies__Builder('sgraph-send-user', self.PACKAGES + ['new-dep==2.0'])
        assert b1.s3_key() != b2.s3_key()

    def test__different_base_names__produce_different_keys(self):
        b1 = Lambda__Dependencies__Builder('sgraph-send-user' , self.PACKAGES)
        b2 = Lambda__Dependencies__Builder('sgraph-send-admin', self.PACKAGES)
        assert b1.s3_key() != b2.s3_key()
