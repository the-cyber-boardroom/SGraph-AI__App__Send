# ===============================================================================
# Tests — append lanes v2, Phase 2 (HTTP level, full in-memory stack, no mocks)
# ===============================================================================

import base64
import hashlib
import json
from   unittest                                                                     import TestCase
from   tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs
from   sgraph_ai_app_send.lambda__user.user__config                                import (HEADER__SGRAPH_VAULT__WRITE_KEY ,
                                                                                           HEADER__SGRAPH_VAULT__ENUM_KEY  )
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest      ,
                                                                                          path__vault_append_base   ,
                                                                                          path__vault_append_config )

VAULT_ID     = 'phase2route01'
WRITE_KEY    = 'phase2-route-write-key'
ENUM_KEY     = hashlib.sha256(b'phase2-route-enum').hexdigest()
APPEND_TOKEN = hashlib.sha256(b'phase2-route-token').hexdigest()
JSON         = {'content-type': 'application/json'}


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


class test_Routes__Vault__Append__v2_Phase2(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client         = _.fast_api__client
            cls.append_service = _.fast_api.append_service

    def setUp(self):
        storage = self.append_service.storage_fs
        for path in storage.folder__files__all(path__vault_append_base(VAULT_ID)):    # the store is shared by the class: start each test with an empty lane
            storage.file__delete(path)
        storage.file__save(path__vault_manifest(VAULT_ID), json.dumps(dict(write_key_hash=_hash(WRITE_KEY))).encode())
        storage.file__save(path__vault_append_config(VAULT_ID),
                           json.dumps(dict(append_anchors=[_hash(APPEND_TOKEN)], enum_key_hash=_hash(ENUM_KEY))).encode())
        self.append_service._manifest_cache.clear(); self.append_service._config_cache.clear()
        self.append_service._count_cache.clear();    self.append_service._stats_cache.clear()

    def _post(self, verb, body, enum_key=ENUM_KEY, write_key=None):
        headers = {**JSON}
        if enum_key:
            headers[HEADER__SGRAPH_VAULT__ENUM_KEY] = enum_key
        if write_key:
            headers[HEADER__SGRAPH_VAULT__WRITE_KEY] = write_key
        return self.client.post(f'/api/vault/append/{verb}/{VAULT_ID}', content=body if isinstance(body, str) else json.dumps(body), headers=headers)

    def _write_one(self):
        assert self._post('write', {'append_token': APPEND_TOKEN, 'payload': base64.b64encode(b'p2').decode()}).status_code == 200
        return self._post('list', {'inbox': APPEND_TOKEN}).json()['entries'][-1]['file_id']

    def test__unmark_and_stats__answer_401_without_a_valid_key(self):           # 401 passes the CDN as JSON (403 does not)
        for verb, body in (('unmark', {'inbox': APPEND_TOKEN, 'file_ids': [f'1700000000000_{"0" * 24}.enc']}), ('stats', {'inbox': APPEND_TOKEN})):
            assert self._post(verb, body, enum_key=None       ).status_code == 401
            assert self._post(verb, body, enum_key='wrong-key').status_code == 401

    def test__mark_list_processed_unmark_round_trip(self):
        file_id = self._write_one()
        assert self._post('mark-processed', {'inbox': APPEND_TOKEN, 'file_ids': [file_id]}).json()['moved'] == [file_id]
        processed = self._post('list', {'inbox': APPEND_TOKEN, 'folder': 'processed'})
        assert processed.status_code == 200 and [e['file_id'] for e in processed.json()['entries']] == [file_id]
        unmarked = self._post('unmark', {'inbox': APPEND_TOKEN, 'file_ids': [file_id]})
        assert unmarked.status_code == 200 and unmarked.json()['moved'] == [file_id]
        for folder in ('archive', [], {}, 1, True):                               # unhashable or wrong-typed folder: 400, never 500
            assert self._post('list', {'inbox': APPEND_TOKEN, 'folder': folder}).status_code == 400, folder

    def test__stats(self):
        self._write_one()
        response = self._post('stats', {'inbox': APPEND_TOKEN})
        assert response.status_code == 200
        assert response.json()['pending'] == 1 and response.json()['hard_pending'] == 1000
        assert self._post('stats', {}).status_code == 400

    def test__configure__lane_settings_and_errors(self):
        ok = self._post('configure', {'lanes': {_hash(APPEND_TOKEN): {'hard_pending': 2, 'retention_days': 7}}}, enum_key=None, write_key=WRITE_KEY)
        assert ok.status_code == 200 and ok.json()['status'] == 'configured'
        assert [self._post('write', {'append_token': APPEND_TOKEN, 'payload': 'eA=='}).status_code for _ in range(3)] == [200, 200, 507]
        bad = self._post('configure', {'webhook_url': 'https://example.com'}, enum_key=None, write_key=WRITE_KEY)
        assert bad.status_code == 400 and 'webhook_url' in bad.json()['detail']
        big = self._post('configure', {'append_anchors': ['a' * 64] * 2000}, enum_key=None, write_key=WRITE_KEY)
        assert big.status_code == 413

    def test__write_to_a_lane_with_an_unknown_mode_is_401(self):
        storage = self.append_service.storage_fs
        config  = json.loads(storage.file__bytes(path__vault_append_config(VAULT_ID)))
        config['lanes'] = {_hash(APPEND_TOKEN): {'mode': 'signed'}}
        storage.file__save(path__vault_append_config(VAULT_ID), json.dumps(config).encode())
        self.append_service._config_cache.clear()
        response = self._post('write', {'append_token': APPEND_TOKEN, 'payload': 'eA=='})
        assert response.status_code == 401 and response.json()['detail'] == {'error': 'lane_mode_unsupported'}

    def test__limits_lists_the_phase_2_features(self):
        body = self.client.get('/api/vault/append/limits').json()
        assert {'unmark', 'stats', 'list-processed', 'scoped-read-keys', 'retention', 'lane-limits'} <= set(body['features'])
        assert body['retention_classes'] == [1, 3, 7, 30, 90, 365] and body['token_lane_hard_ceiling'] == 5000

    def test__configure__body_keys_never_collide_with_parameters(self):          # a body key named like a parameter is an unknown field (400), never a TypeError (500)
        for body in ({'vault_id': 'x'}, {'write_key_hex': 'x'}, {'request': {}}, {'webhook_url': None}):
            response = self._post('configure', body, enum_key=None, write_key=WRITE_KEY)
            assert response.status_code == 400, body
        legacy = self._post('configure', {'append_anchors': None, 'enum_key_hash': None}, enum_key=None, write_key=WRITE_KEY)
        assert legacy.status_code == 200                                          # null legacy fields still mean "not sent"
