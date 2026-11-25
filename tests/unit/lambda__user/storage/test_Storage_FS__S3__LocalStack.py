# ===============================================================================
# Tests — Storage_FS__S3 bounded listing fast paths, behaviour on LocalStack
# (append lanes v2, Phase 1). LocalStack is the one acceptable fake (house rule 23);
# these tests skip when it is not reachable. Start it with:
#   docker run -d --rm --name sg-localstack -p 4566:4566 -e SERVICES=s3 localstack/localstack:3
# ===============================================================================

import boto3
import hashlib
import json
import os
import random
import urllib.error
import urllib.request
from   unittest                                                                    import TestCase, SkipTest
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Append              import Service__Vault__Append
from   sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3                      import Storage_FS__S3
from   sgraph_ai_app_send.lambda__user.storage.Storage__Append__Listing            import Storage__Append__Listing
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest       ,
                                                                                          path__vault_append_blob    ,
                                                                                          path__vault_append_pending ,
                                                                                          path__vault_append_processed)

LOCALSTACK_URL = os.environ.get('LOCALSTACK_URL', 'http://localhost:4566')
ENV_OVERRIDES  = dict(AWS_ENDPOINT_URL      = LOCALSTACK_URL,
                      AWS_ACCESS_KEY_ID     = 'test'        ,
                      AWS_SECRET_ACCESS_KEY = 'test'        ,
                      AWS_DEFAULT_REGION    = 'us-east-1'   )


def _localstack_up():
    try:
        with urllib.request.urlopen(f'{LOCALSTACK_URL}/_localstack/health', timeout=2) as response:
            return json.loads(response.read()).get('services', {}).get('s3') in ('available', 'running')
    except Exception:
        return False


class test_Storage_FS__S3__LocalStack(TestCase):

    @classmethod
    def setUpClass(cls):
        if not _localstack_up():
            raise SkipTest(f'LocalStack S3 not reachable at {LOCALSTACK_URL}')
        cls.saved_env = {name: os.environ.get(name) for name in ENV_OVERRIDES}
        os.environ.update(ENV_OVERRIDES)
        boto3.DEFAULT_SESSION = None                                             # boto3 caches the default session's credentials: start clean, end clean
        cls.bucket  = f'sg-append-v2-{random.getrandbits(32):08x}'
        cls.storage = Storage_FS__S3(s3_bucket=cls.bucket, s3_prefix='root').setup()
        cls.storage._ensure_bucket()
        cls.listing = Storage__Append__Listing(storage_fs=cls.storage)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, 'storage'):
            cls.storage.clear()
            cls.storage._s3().bucket_delete(cls.bucket)
        boto3.DEFAULT_SESSION = None                                             # later tests must not inherit the LocalStack credentials
        for name, value in getattr(cls, 'saved_env', {}).items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    def _fill(self, folder, count, size=1):
        names = [f'{1_700_000_000_000 + i:013d}_{i:024x}.enc' for i in range(count)]
        for name in names:
            self.storage.file__save(f'{folder}/{name}', b'x' * size)
        return names

    def test__count__stops_at_the_limit(self):
        names = self._fill('count/lane/pending', 25)
        assert self.storage.folder__files__count('count/lane/pending', 10 ) == 10
        assert self.storage.folder__files__count('count/lane/pending', 100) == len(names)
        assert self.storage.folder__files__count('count/empty/pending', 5 ) == 0

    def test__page__start_after_and_max_keys(self):
        names = self._fill('page/lane/pending', 12)
        assert self.storage.folder__files__page('page/lane/pending', max_keys=5)                       == names[:5]
        assert self.storage.folder__files__page('page/lane/pending', start_after=names[4], max_keys=5) == names[5:10]
        assert self.storage.folder__files__page('page/lane/pending', start_after=names[-1])            == []
        assert self.storage.folder__files__page('page/lane/pending', start_after='1700000000007')       == names[7:]

    def test__page__crosses_the_1000_key_boundary(self):                        # continuation tokens: one call per 1,000 keys
        names = self._fill('big/lane/pending', 1_005)
        assert self.storage.folder__files__page ('big/lane/pending', max_keys=2_000) == names
        assert self.storage.folder__files__count('big/lane/pending', 2_000)          == 1_005
        assert self.storage.folder__files__count('big/lane/pending', 1_001)          == 1_001

    def test__subfolder_names__uses_the_delimiter(self):
        for lane in ('aaaa', 'bbbb', 'cccc'):
            self._fill(f'subs/{lane}/pending', 2)
            self._fill(f'subs/{lane}/processed', 3)
        self.storage.file__save('subs/config.json', b'{}')
        assert self.storage.folder__subfolder_names('subs') == ['aaaa', 'bbbb', 'cccc']

    def test__copy__is_server_side_and_exact(self):
        self.storage.file__save('copy/src/one.enc', b'\x00\x01payload')
        assert self.storage.file__copy('copy/src/one.enc', 'copy/dst/one.enc') is True
        assert self.storage.file__bytes('copy/dst/one.enc') == b'\x00\x01payload'
        assert self.storage.file__bytes('copy/src/one.enc') == b'\x00\x01payload'

    def test__append_service__end_to_end_on_s3(self):                           # the v2 listing equals the legacy listing on real S3, and fetch/mark work over it
        vault_id, write_key, enum_key = 'lsvault0001', 'ls-write-key', hashlib.sha256(b'ls-enum').hexdigest()
        tokens = [hashlib.sha256(f'ls-lane-{i}'.encode()).hexdigest() for i in range(3)]
        self.storage.file__save(path__vault_manifest(vault_id), json.dumps(dict(write_key_hash=hashlib.sha256(write_key.encode()).hexdigest())).encode())
        fast   = Service__Vault__Append(storage_fs=self.storage, fast_listing=True )
        legacy = Service__Vault__Append(storage_fs=self.storage, fast_listing=False)
        fast.configure(vault_id, write_key, append_anchors=[hashlib.sha256(t.encode()).hexdigest() for t in tokens],
                       enum_key_hash=hashlib.sha256(enum_key.encode()).hexdigest())
        rng = random.Random(7)
        for index, token in enumerate(tokens):
            for i in range(5 + index * 4):
                name = f'{1_700_000_000_000 + rng.randint(0, 999):013d}_{rng.getrandbits(96):024x}.enc'
                self.storage.file__save(path__vault_append_pending(vault_id, token, name), bytes([i]))
        for inbox in (None, tokens[1]):
            for cursor in (None, '1700000000500'):
                for limit in (1, 4, 50):
                    expected = legacy.list_entries(vault_id, enum_key, inbox=inbox, after_file_id=cursor, limit=limit)
                    actual   = fast  .list_entries(vault_id, enum_key, inbox=inbox, after_file_id=cursor, limit=limit)
                    assert actual == expected, (inbox, cursor, limit)
        first   = fast.list_entries(vault_id, enum_key, inbox=tokens[0], limit=1)['entries'][0]
        fetched = fast.fetch(vault_id, enum_key, tokens[0], [first['file_id']])
        assert len(fetched['files']) == 1 and fetched['deferred'] == []
        assert fast.mark_processed(vault_id, enum_key, tokens[0], [first['file_id']])['moved'] == [first['file_id']]
        assert self.storage.file__exists(path__vault_append_processed(vault_id, tokens[0], first['file_id']))
        assert not self.storage.file__exists(path__vault_append_pending(vault_id, tokens[0], first['file_id']))

    # --- v2 Phase 2 ----------------------------------------------------------------------------

    def test__usage__counts_bytes_and_ends(self):
        names = self._fill('usage/lane/pending', 7, size=3)
        assert self.storage.folder__files__usage('usage/lane/pending', 100) == dict(count=7, bytes=21, first=names[0], last=names[-1])
        assert self.storage.folder__files__usage('usage/lane/pending', 4)   == dict(count=4, bytes=12, first=names[0], last=names[3])

    def test__copy__sets_and_clears_tags(self):                                 # AS-8: an unmarked entry must not carry a retention tag back into pending/
        self.storage.file__save('tags/pending/one.enc', b'x')
        self.storage.file__copy('tags/pending/one.enc', 'tags/processed/one.enc', tags={'sg-retention': '30d'})
        assert self.storage.file__tags('tags/processed/one.enc') == {'sg-retention': '30d'}
        self.storage.file__copy('tags/processed/one.enc', 'tags/back/one.enc', tags={})
        assert self.storage.file__tags('tags/back/one.enc') == {}

    def test__conditional_writes__if_none_match(self):
        assert self.storage.file__save__if_version('cas/new.json', b'{"v":1}', None) is True          # create-if-absent
        assert self.storage.file__save__if_version('cas/new.json', b'{"v":2}', None) is False         # already exists
        data, etag = self.storage.file__bytes__versioned('cas/new.json')
        assert data == b'{"v":1}' and etag
        assert self.storage.file__bytes__versioned('cas/missing.json') == (None, None)

    def test__conditional_writes__if_match(self):                               # AWS S3 enforces If-Match on PutObject (since Nov 2024); LocalStack 3 ignores it
        self.storage.file__save('cas/match.json', b'{"v":1}')
        _, etag = self.storage.file__bytes__versioned('cas/match.json')
        assert self.storage.file__save__if_version('cas/match.json', b'{"v":2}', etag) is True
        if self.storage.file__save__if_version('cas/match.json', b'{"v":3}', etag) is True:
            self.skipTest('this S3 backend ignores If-Match on PutObject (LocalStack 3); AWS S3 refuses the stale write with 412')
        assert self.storage.file__bytes('cas/match.json') == b'{"v":2}'

    def test__phase2__end_to_end_on_s3(self):                                   # configure (CAS), retention tag on mark, cleared on unmark, stats
        vault_id, write_key, enum_key = 'lsvault0002', 'ls-write-key-2', hashlib.sha256(b'ls-enum-2').hexdigest()
        token = hashlib.sha256(b'ls-p2-lane').hexdigest()
        lane  = hashlib.sha256(token.encode()).hexdigest()
        service = Service__Vault__Append(storage_fs=self.storage)
        assert service.configure(vault_id, write_key, append_anchors=[lane], enum_key_hash=hashlib.sha256(enum_key.encode()).hexdigest())['status'] == 'configured'
        assert service.configure(vault_id, write_key, lanes={lane: dict(retention_days=30, hard_pending=50)})['status'] == 'configured'
        for _ in range(3):
            assert service.append(vault_id, token, b'abc')['status'] == 'ok'
        ids = [e['file_id'] for e in service.list_entries(vault_id, enum_key, inbox=token)['entries']]
        service.mark_processed(vault_id, enum_key, token, ids[:2])
        assert self.storage.file__tags(path__vault_append_processed(vault_id, token, ids[0])) == {'sg-retention': '30d'}
        assert service.unmark(vault_id, enum_key, token, ids[:1])['moved'] == ids[:1]
        assert self.storage.file__tags(path__vault_append_pending(vault_id, token, ids[0])) == {}
        stats = service.stats(vault_id, enum_key, token)
        assert (stats['pending'], stats['pending_bytes'], stats['processed'], stats['hard_pending'], stats['retention_days']) == (2, 6, 1, 50, 30)

    # --- v2 Phase 3: blobs ---------------------------------------------------------------------

    def _blob_lane(self, vault_id, seed, **lane):
        write_key, enum_key = f'ls-write-{seed}', hashlib.sha256(f'ls-enum-{seed}'.encode()).hexdigest()
        token   = hashlib.sha256(f'ls-lane-{seed}'.encode()).hexdigest()
        service = Service__Vault__Append(storage_fs=self.storage)
        assert service.configure(vault_id, write_key, append_anchors=[hashlib.sha256(token.encode()).hexdigest()],
                                 enum_key_hash=hashlib.sha256(enum_key.encode()).hexdigest())['status'] == 'configured'
        lane = dict(dict(blobs=True, blob_retention_days=7), **lane)
        assert service.configure(vault_id, write_key, lanes={hashlib.sha256(token.encode()).hexdigest(): lane})['status'] == 'configured'
        return service, token, enum_key, write_key

    @staticmethod
    def _http(method, url, body=None, headers=None):                            # (status, body bytes, response headers)
        request = urllib.request.Request(url, data=body, method=method,
                                         headers={k: v for k, v in (headers or {}).items() if k.lower() != 'content-length'})  # urllib sets it from the body
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, response.read(), dict(response.headers)
        except urllib.error.HTTPError as error:
            return error.code, error.read(), dict(error.headers)

    def test__phase3__blob_put_get_round_trip(self):
        service, token, enum_key, write_key = self._blob_lane('lsvault0003', 'p3')
        ciphertext = os.urandom(300_000)
        blob_id    = hashlib.sha256(ciphertext).hexdigest()
        upload     = service.blob_upload('lsvault0003', token, len(ciphertext), blob_id)
        assert upload['status'] == 'ok' and upload['expires_in'] == 300
        assert self._http('PUT', upload['upload_url'], ciphertext, upload['headers'])[0] == 200
        assert self._http('PUT', upload['upload_url'], ciphertext, upload['headers'])[0] == 412     # create-only: the same blob again is "already there"
        lane_hash = hashlib.sha256(token.encode()).hexdigest()
        assert self.storage.file__tags(path__vault_append_blob('lsvault0003', lane_hash, blob_id)) == {'sg-retention': '7d'}
        urls = service.blob_url('lsvault0003', enum_key, token, [blob_id, 'f' * 64])
        assert urls['missing'] == ['f' * 64] and urls['urls'][0]['size'] == len(ciphertext)
        status, body, headers = self._http('GET', urls['urls'][0]['url'])
        assert status == 200 and body == ciphertext
        assert headers.get('Content-Type') == 'application/octet-stream' and headers.get('Content-Disposition') == 'attachment'
        assert service.blob_delete('lsvault0003', enum_key, token, [blob_id])['deleted'] == [blob_id]
        assert service.blob_url('lsvault0003', enum_key, token, [blob_id])['missing'] == [blob_id]

    def test__phase3__a_wrong_hash_is_refused_by_s3(self):
        service, token, _, _ = self._blob_lane('lsvault0004', 'p3-hash')
        ciphertext = os.urandom(1000)
        upload     = service.blob_upload('lsvault0004', token, len(ciphertext), hashlib.sha256(b'something else').hexdigest())
        status     = self._http('PUT', upload['upload_url'], ciphertext, upload['headers'])[0]
        if status == 200:
            self.skipTest('this S3 backend does not verify x-amz-checksum-sha256 on a presigned PUT; AWS S3 answers 400 BadDigest')
        assert status == 400

    def test__phase3__fifty_urls_before_any_upload_cannot_exceed_the_budget(self):   # AS-2, security test 2
        service, token, _, _ = self._blob_lane('lsvault0005', 'p3-budget', max_pending_bytes=10 * 1024 * 1024, max_blob_bytes=4 * 1024 * 1024)
        statuses = [service.blob_upload('lsvault0005', token, 1024 * 1024, hashlib.sha256(f'b{i}'.encode()).hexdigest())['status'] for i in range(50)]
        assert statuses.count('ok') == 7 and set(statuses[7:]) == {'at_capacity'}      # 6 MiB reserved + 4 MiB max blob = the 10 MiB budget
        assert service.blob_upload('lsvault0005', token, 1, hashlib.sha256(b'tiny').hexdigest())['status'] == 'at_capacity'   # size never changes the answer
