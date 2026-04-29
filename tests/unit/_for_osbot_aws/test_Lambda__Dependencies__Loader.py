from unittest                                                                    import TestCase
from sgraph_ai_app_send._for_osbot_aws.Lambda__Dependencies__Loader             import (Lambda__Dependencies__Loader,
                                                                                         load_combined_dependency  ,
                                                                                         versioned_name            ,
                                                                                         _deps_hash                )


class test_Lambda__Dependencies__Loader(TestCase):

    PACKAGES = ['fastapi-mcp==0.4.0'                     ,
                'httpx==0.28.1'                          ,
                'memory-fs==v0.40.0'                     ,
                'osbot-fast-api-serverless==v1.33.0'     ]

    def test__deps_hash__is_deterministic(self):
        h1 = _deps_hash(self.PACKAGES)
        h2 = _deps_hash(self.PACKAGES)
        assert h1 == h2
        assert len(h1) == 12                                                     # First 12 chars of SHA-256

    def test__deps_hash__changes_with_packages(self):
        h1 = _deps_hash(self.PACKAGES)
        h2 = _deps_hash(self.PACKAGES + ['new-package==1.0'])
        assert h1 != h2

    def test__deps_hash__order_independent(self):
        h1 = _deps_hash(['a==1', 'b==2', 'c==3'])
        h2 = _deps_hash(['c==3', 'a==1', 'b==2'])
        assert h1 == h2                                                          # Sorted before hashing

    def test__versioned_name__format(self):
        name = versioned_name('sgraph-send-user', self.PACKAGES)
        assert name.startswith('sgraph-send-user-')
        suffix = name[len('sgraph-send-user-'):]
        assert len(suffix) == 12
        assert all(c in '0123456789abcdef' for c in suffix)

    def test__loader__s3_key_format(self):
        name   = versioned_name('sgraph-send-user', self.PACKAGES)
        loader = Lambda__Dependencies__Loader(name)
        assert loader._s3_key() == f'lambdas-dependencies-combined/{name}.zip'

    def test__loader__temp_folder_format(self):
        loader = Lambda__Dependencies__Loader('my-combined-zip')
        assert loader._temp_folder() == '/tmp/lambdas-dependencies-combined/my-combined-zip'

    def test__load__skips_outside_lambda(self):
        # AWS_REGION is not set in unit tests — load() must return None silently
        result = load_combined_dependency('sgraph-send-user', self.PACKAGES)
        assert result is None
