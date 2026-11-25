# ===============================================================================
# Tests — append lanes v2, Phase 1 (HTTP level, full in-memory stack, no mocks)
# Every malformed input is a 400 (never a 500); GET /limits; the 413 detail;
# configure before the vault's first commit.
# ===============================================================================

import base64
import hashlib
import json
import time
from   unittest                                                                     import TestCase
from   tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Append              import APPEND_MAX_PAYLOAD
from   sgraph_ai_app_send.lambda__user.user__config                                import (HEADER__SGRAPH_VAULT__WRITE_KEY ,
                                                                                           HEADER__SGRAPH_VAULT__ENUM_KEY  )
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest      ,
                                                                                          path__vault_append_config )

VAULT_ID     = 'phase1route01'
WRITE_KEY    = 'phase1-route-write-key'
ENUM_KEY     = hashlib.sha256(b'phase1-route-enum').hexdigest()
APPEND_TOKEN = hashlib.sha256(b'phase1-route-token').hexdigest()
JSON         = {'content-type': 'application/json'}


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


class test_Routes__Vault__Append__v2_Phase1(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client         = _.fast_api__client
            cls.append_service = _.fast_api.append_service

    def setUp(self):
        storage = self.append_service.storage_fs
        storage.file__save(path__vault_manifest(VAULT_ID), json.dumps(dict(write_key_hash=_hash(WRITE_KEY))).encode())
        storage.file__save(path__vault_append_config(VAULT_ID),
                           json.dumps(dict(append_anchors=[_hash(APPEND_TOKEN)], enum_key_hash=_hash(ENUM_KEY))).encode())
        self.append_service._manifest_cache.pop(VAULT_ID, None)
        self.append_service._config_cache  .pop(VAULT_ID, None)

    def _post(self, verb, content, vault_id=VAULT_ID, headers=None):
        return self.client.post(f'/api/vault/append/{verb}/{vault_id}', content=content,
                                headers={**JSON, HEADER__SGRAPH_VAULT__ENUM_KEY: ENUM_KEY, **(headers or {})})

    # --- 1.8: request bodies ----------------------------------------------------------

    def test__list__with_no_body_is_an_empty_query(self):                      # was an unhandled JSONDecodeError → 500
        response = self.client.post(f'/api/vault/append/list/{VAULT_ID}', headers={HEADER__SGRAPH_VAULT__ENUM_KEY: ENUM_KEY})
        assert response.status_code == 200
        assert response.json()['status'] == 'ok'

    def test__bodies_that_are_not_json_objects_are_400(self):
        for verb in ('list', 'fetch', 'mark-processed', 'write', 'configure', 'purge'):
            for content in ('[]', '"text"', '42', '{not json', '{"limit": NaN}', '{"a": Infinity}'):
                response = self._post(verb, content, headers={HEADER__SGRAPH_VAULT__WRITE_KEY: WRITE_KEY})
                assert response.status_code == 400, (verb, content, response.status_code)

    def test__badly_typed_fields_are_400_not_500(self):
        cases = [('list'          , {'after_file_id': 123}),
                 ('list'          , {'limit': True}),
                 ('list'          , {'include_content': 'yes'}),
                 ('fetch'         , {'inbox': APPEND_TOKEN, 'file_ids': 123}),
                 ('mark-processed', {'inbox': APPEND_TOKEN, 'file_ids': {'a': 1}}),
                 ('write'         , {'append_token': APPEND_TOKEN, 'payload': 12345})]
        for verb, body in cases:
            assert self._post(verb, json.dumps(body)).status_code == 400, (verb, body)

    # --- 1.3 / 1.11: GET /limits ------------------------------------------------------

    def test__limits(self):
        response = self.client.get('/api/vault/append/limits')
        assert response.status_code == 200
        assert response.headers.get('cache-control') == 'no-store'
        body = response.json()
        assert body['max_pending'] == 1000 and body['max_batch_ids'] == 100
        assert abs(body['now_ms'] - int(time.time() * 1000)) < 5_000
        assert 'fetch-deferred' in body['features']

    def test__payload_too_large__413_states_limit_and_size(self):
        payload  = base64.b64encode(b'x' * (APPEND_MAX_PAYLOAD + 1)).decode()
        response = self._post('write', json.dumps({'append_token': APPEND_TOKEN, 'payload': payload}))
        assert response.status_code == 413
        assert response.json()['detail'] == dict(error='payload_too_large', limit=APPEND_MAX_PAYLOAD, received=APPEND_MAX_PAYLOAD + 1)

    # --- 1.2: fetch carries deferred ----------------------------------------------------

    def test__fetch__returns_deferred(self):
        assert self._post('write', json.dumps({'append_token': APPEND_TOKEN, 'payload': base64.b64encode(b'hi').decode()})).status_code == 200
        file_id  = self._post('list', json.dumps({'inbox': APPEND_TOKEN})).json()['entries'][0]['file_id']
        response = self._post('fetch', json.dumps({'inbox': APPEND_TOKEN, 'file_ids': [file_id]}))
        assert response.status_code == 200
        assert response.json()['deferred'] == []

    # --- 1.7: configure before the vault's first commit -----------------------------

    def test__configure__before_first_commit_creates_the_vault(self):          # was 403 "Write key mismatch" (shown as an HTML 404 by the CDN)
        new_vault = 'phase1fresh01'
        response  = self._post('configure', json.dumps({'append_anchors': [_hash(APPEND_TOKEN)], 'enum_key_hash': _hash(ENUM_KEY)}),
                               vault_id=new_vault, headers={HEADER__SGRAPH_VAULT__WRITE_KEY: WRITE_KEY})
        assert response.status_code == 200
        assert response.json() == dict(vault_id=new_vault, status='configured')
        write = self._post('write', json.dumps({'append_token': APPEND_TOKEN, 'payload': base64.b64encode(b'x').decode()}), vault_id=new_vault)
        assert write.status_code == 200

    def test__configure__badly_typed_fields_are_400(self):
        response = self._post('configure', json.dumps({'append_anchors': 'not-a-list'}), headers={HEADER__SGRAPH_VAULT__WRITE_KEY: WRITE_KEY})
        assert response.status_code == 400
