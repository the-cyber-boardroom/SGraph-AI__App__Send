# ===============================================================================
# Tests — append blob presigning (v2 Phase 3, AS-9)
# Presigning is a local computation (no network), so this runs everywhere, CI
# included: dummy credentials and a region are enough to sign. It pins the exact
# X-Amz-SignedHeaders list, so size, hash, create-only, type and tag can never
# silently drop out of the signature (osbot's helper signs `host` only).
# ===============================================================================

import base64
import hashlib
import os
import boto3
from   unittest                                                                    import TestCase
from   urllib.parse                                                                import urlsplit, parse_qs
from   sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3                      import Storage_FS__S3

ENV_OVERRIDES = dict(AWS_ACCESS_KEY_ID     = 'presign-test-key-id' ,             # not a credential: presigning never calls AWS
                     AWS_SECRET_ACCESS_KEY = 'presign-test-only'   ,
                     AWS_DEFAULT_REGION    = 'eu-west-2'           )
ENV_REMOVED   = ('AWS_ENDPOINT_URL', 'AWS_SESSION_TOKEN', 'AWS_PROFILE')
BLOB_ID       = hashlib.sha256(b'ciphertext').hexdigest()
CHECKSUM      = base64.b64encode(bytes.fromhex(BLOB_ID)).decode()


class test_Storage_FS__S3__Presign(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.saved_env = {name: os.environ.get(name) for name in (*ENV_OVERRIDES, *ENV_REMOVED)}
        for name in ENV_REMOVED:
            os.environ.pop(name, None)
        os.environ.update(ENV_OVERRIDES)
        boto3.DEFAULT_SESSION = None
        cls.storage = Storage_FS__S3(s3_bucket='sg-presign-test', s3_prefix='root').setup()

    @classmethod
    def tearDownClass(cls):
        boto3.DEFAULT_SESSION = None                                             # later tests must not inherit these dummy credentials
        for name, value in cls.saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    @staticmethod
    def _query(url):
        return {key: values[0] for key, values in parse_qs(urlsplit(url).query).items()}

    def test__put__signs_every_condition(self):
        upload = self.storage.presigned__put('vault/ab/abcd/bare/append/blobs/lane/' + BLOB_ID, 1234, CHECKSUM, {'sg-retention': '7d'}, 300)
        query  = self._query(upload['url'])
        assert query['X-Amz-SignedHeaders'] == 'content-length;content-type;host;if-none-match;x-amz-checksum-sha256;x-amz-tagging'
        assert query['X-Amz-Expires']       == '300'
        assert urlsplit(upload['url']).path.endswith('/root/vault/ab/abcd/bare/append/blobs/lane/' + BLOB_ID)
        assert upload['headers'] == {'Content-Length'       : '1234'                    ,
                                     'Content-Type'         : 'application/octet-stream',
                                     'If-None-Match'        : '*'                       ,
                                     'x-amz-checksum-sha256': CHECKSUM                  ,
                                     'x-amz-tagging'        : 'sg-retention=7d'         }

    def test__put__without_retention_has_no_tag(self):                          # blob_retention_days 0: kept until purged
        upload = self.storage.presigned__put('k/' + BLOB_ID, 10, CHECKSUM, None, 300)
        assert self._query(upload['url'])['X-Amz-SignedHeaders'] == 'content-length;content-type;host;if-none-match;x-amz-checksum-sha256'
        assert 'x-amz-tagging' not in upload['headers']

    def test__get__is_served_as_an_opaque_download(self):                       # I-3: a token writer can upload any bytes, HTML included
        query = self._query(self.storage.presigned__get('k/' + BLOB_ID, 300))
        assert (query['response-content-type'], query['response-content-disposition'], query['X-Amz-Expires']) == ('application/octet-stream', 'attachment', '300')

    def test__conditional_headers_never_leak_to_other_requests(self):           # the hook is on the shared client; only the call that set the header sees it
        self.storage.presigned__put('k/' + BLOB_ID, 10, CHECKSUM, None, 300)
        client = self.storage._s3().s3()
        plain  = client.generate_presigned_url('put_object', Params=dict(Bucket='sg-presign-test', Key='other'), ExpiresIn=60)
        assert self._query(plain)['X-Amz-SignedHeaders'] == 'host'

    def test__works_without_IfNoneMatch_in_the_botocore_model(self):            # CI and older Lambda runtimes ship botocore 1.34.x (no IfNoneMatch/IfMatch params)
        import botocore
        upload = self.storage.presigned__put('k/' + BLOB_ID, 10, CHECKSUM, None, 300)
        assert 'if-none-match' in self._query(upload['url'])['X-Amz-SignedHeaders'], botocore.__version__
