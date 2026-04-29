import os
import shutil
import tempfile
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

    def test__strip__slims_dist_info(self):
        with tempfile.TemporaryDirectory() as d:
            dist = os.path.join(d, 'requests-2.31.0.dist-info')
            os.makedirs(dist)
            for f in ('METADATA', 'RECORD', 'WHEEL', 'INSTALLER', 'entry_points.txt'):
                open(os.path.join(dist, f), 'w').close()
            os.makedirs(os.path.join(d, 'requests'))
            self.builder._strip(d)
            assert     os.path.exists(os.path.join(dist, 'METADATA'))          # kept — needed by importlib.metadata
            assert not os.path.exists(os.path.join(dist, 'RECORD'))            # deleted — large file listing, not needed
            assert not os.path.exists(os.path.join(dist, 'WHEEL'))
            assert not os.path.exists(os.path.join(dist, 'INSTALLER'))
            assert not os.path.exists(os.path.join(dist, 'entry_points.txt'))
            assert     os.path.exists(os.path.join(d, 'requests'))             # package folder kept

    def test__strip__removes_pycache_and_pyc(self):
        with tempfile.TemporaryDirectory() as d:
            pkg = os.path.join(d, 'mypkg')
            cache = os.path.join(pkg, '__pycache__')
            os.makedirs(cache)
            open(os.path.join(pkg, 'mod.py' ), 'w').close()
            open(os.path.join(pkg, 'mod.pyc'), 'w').close()
            open(os.path.join(pkg, 'mod.pyi'), 'w').close()
            self.builder._strip(d)
            assert not os.path.exists(cache)
            assert not os.path.exists(os.path.join(pkg, 'mod.pyc'))
            assert not os.path.exists(os.path.join(pkg, 'mod.pyi'))
            assert     os.path.exists(os.path.join(pkg, 'mod.py'))              # source kept

    def test__strip__removes_lambda_runtime_packages(self):
        with tempfile.TemporaryDirectory() as d:
            for pkg in ('boto3', 'botocore', 's3transfer', 'jmespath', 'dateutil', 'six', 'urllib3'):
                os.makedirs(os.path.join(d, pkg))
            os.makedirs(os.path.join(d, 'fastapi'))                             # non-runtime package — must survive
            self.builder._strip(d)
            for pkg in ('boto3', 'botocore', 's3transfer', 'jmespath', 'dateutil', 'six', 'urllib3'):
                assert not os.path.exists(os.path.join(d, pkg)), f'{pkg} should have been removed'
            assert os.path.exists(os.path.join(d, 'fastapi'))

    def test__strip__removes_bin_dir(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, 'bin'))
            open(os.path.join(d, 'bin', 'uvicorn'), 'w').close()
            self.builder._strip(d)
            assert not os.path.exists(os.path.join(d, 'bin'))
