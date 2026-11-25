# ===============================================================================
# Tests — append lanes v2, Phase 3: blob routes (HTTP level, in-memory stack, no mocks)
# Status codes the CDN passes through as JSON: 400, 401, 413, 501, 507.
# The presigned flow itself runs on LocalStack (test_Storage_FS__S3__LocalStack.py).
# ===============================================================================

import hashlib
import json
from   unittest                                                                     import TestCase
from   tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs
from   sgraph_ai_app_send.lambda__user.user__config                                import (HEADER__SGRAPH_VAULT__WRITE_KEY ,
                                                                                           HEADER__SGRAPH_VAULT__ENUM_KEY  )
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest      ,
                                                                                          path__vault_append_base   ,
                                                                                          path__vault_append_config ,
                                                                                          path__vault_append_blob   )

VAULT_ID     = 'phase3route01'
WRITE_KEY    = 'phase3-route-write-key'
ENUM_KEY     = hashlib.sha256(b'phase3-route-enum').hexdigest()
APPEND_TOKEN = hashlib.sha256(b'phase3-route-token').hexdigest()
BLOB_ID      = hashlib.sha256(b'phase3-ciphertext').hexdigest()
BAD_IDS      = ('a' * 63, 'A' * 64, 'a' * 64 + '\n', '../' + 'a' * 61, 'a' * 32 + '/' + 'a' * 31)
JSON         = {'content-type': 'application/json'}


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


class test_Routes__Vault__Append__v2_Phase3(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client         = _.fast_api__client
            cls.append_service = _.fast_api.append_service

    def setUp(self):
        storage = self.append_service.storage_fs
        for path in storage.folder__files__all(path__vault_append_base(VAULT_ID)):
            storage.file__delete(path)
        storage.file__save(path__vault_manifest(VAULT_ID), json.dumps(dict(write_key_hash=_hash(WRITE_KEY))).encode())
        storage.file__save(path__vault_append_config(VAULT_ID),
                           json.dumps(dict(append_anchors=[_hash(APPEND_TOKEN)], enum_key_hash=_hash(ENUM_KEY))).encode())
        for cache in (self.append_service._manifest_cache, self.append_service._config_cache,
                      self.append_service._count_cache,    self.append_service._stats_cache):
            cache.clear()

    def _post(self, verb, body, enum_key=ENUM_KEY, write_key=None):
        headers = {**JSON}
        if enum_key:
            headers[HEADER__SGRAPH_VAULT__ENUM_KEY] = enum_key
        if write_key:
            headers[HEADER__SGRAPH_VAULT__WRITE_KEY] = write_key
        return self.client.post(f'/api/vault/append/{verb}/{VAULT_ID}', content=json.dumps(body), headers=headers)

    def _blobs_on(self, **lane):
        response = self._post('configure', {'lanes': {_hash(APPEND_TOKEN): dict(blobs=True, blob_retention_days=0, **lane)}},
                              enum_key=None, write_key=WRITE_KEY)
        assert response.status_code == 200, response.text

    def _upload(self, size=1024, sha256=BLOB_ID, token=APPEND_TOKEN):
        return self._post('blob-upload', {'append_token': token, 'size': size, 'sha256': sha256}, enum_key=None)

    def test__blob_upload__status_codes(self):
        assert self._upload(token=_hash('nope')).status_code == 401
        disabled = self._upload()
        assert disabled.status_code == 400 and disabled.json()['detail'] == {'error': 'blobs_disabled'}
        self._blobs_on(max_blob_bytes=2048)
        too_big = self._upload(size=2049)
        assert too_big.status_code == 413 and too_big.json()['detail'] == {'error': 'blob_too_large', 'limit': 2048, 'received': 2049}
        memory = self._upload()
        assert memory.status_code == 501 and memory.json()['detail'] == {'error': 'presigned_not_available'}
        for bad in BAD_IDS:
            assert self._upload(sha256=bad).status_code == 400, repr(bad)

    def test__blob_upload__full_lane_is_507(self):
        self._blobs_on(max_pending_bytes=10 * 1024 * 1024, max_blob_bytes=4 * 1024 * 1024)
        storage = self.append_service.storage_fs
        storage.file__save(path__vault_append_blob(VAULT_ID, _hash(APPEND_TOKEN), BLOB_ID), b'x' * (6 * 1024 * 1024 + 1))
        response = self._upload()
        assert response.status_code == 507 and response.json()['detail'] == {'error': 'at_capacity'}

    def test__blob_url_and_delete__status_codes(self):
        for verb in ('blob-url', 'blob-delete'):
            body = {'inbox': APPEND_TOKEN, 'blob_ids': [BLOB_ID]}
            assert self._post(verb, body, enum_key=None       ).status_code == 401
            assert self._post(verb, body, enum_key='wrong-key').status_code == 401
            for bad in BAD_IDS:
                assert self._post(verb, {'inbox': APPEND_TOKEN, 'blob_ids': [bad]}).status_code == 400, (verb, repr(bad))
            assert self._post(verb, {'inbox': APPEND_TOKEN, 'blob_ids': []}).status_code == 400
        assert self._post('blob-url', {'inbox': APPEND_TOKEN, 'blob_ids': [BLOB_ID]}).status_code == 501

    def test__blob_delete_and_purge(self):
        storage = self.append_service.storage_fs
        path    = path__vault_append_blob(VAULT_ID, _hash(APPEND_TOKEN), BLOB_ID)
        storage.file__save(path, b'ciphertext')
        deleted = self._post('blob-delete', {'inbox': APPEND_TOKEN, 'blob_ids': [BLOB_ID]})
        assert deleted.status_code == 200 and deleted.json()['deleted'] == [BLOB_ID]
        storage.file__save(path, b'ciphertext')
        purged = self._post('purge', {'folder': 'blobs', 'inbox': APPEND_TOKEN}, enum_key=None, write_key=WRITE_KEY)
        assert purged.status_code == 200 and purged.json()['purged'] == [BLOB_ID]
        assert storage.file__exists(path) is False

    def test__configure__blob_settings_are_validated(self):
        missing_retention = self._post('configure', {'lanes': {_hash(APPEND_TOKEN): {'blobs': True}}}, enum_key=None, write_key=WRITE_KEY)
        assert missing_retention.status_code == 400 and 'blob_retention_days' in missing_retention.json()['detail']
        not_a_bool = self._post('configure', {'lanes': {_hash(APPEND_TOKEN): {'blobs': 1, 'blob_retention_days': 0}}}, enum_key=None, write_key=WRITE_KEY)
        assert not_a_bool.status_code == 400

    def test__limits_advertise_blobs(self):
        body = self.client.get('/api/vault/append/limits').json()
        assert 'blobs' in body['features'] and body['presigned_blobs'] is False and body['token_lane_blob_ceiling'] == 25 * 1024 * 1024
