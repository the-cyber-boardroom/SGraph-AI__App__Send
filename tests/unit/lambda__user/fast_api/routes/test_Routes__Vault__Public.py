# ===============================================================================
# SGraph Send - Public Vault Route Tests
# Tests for X-Vault-Public routing and GET /api/vault/public-info/{vault_id}
# ===============================================================================

import json
from unittest                                                                    import TestCase
from fastapi                                                                     import FastAPI
from memory_fs.storage_fs.providers.Storage_FS__Memory                          import Storage_FS__Memory
from starlette.testclient                                                        import TestClient
from osbot_utils.utils.Env                                                       import get_env, set_env
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User import Fast_API__SGraph__App__Send__User
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer            import Service__Vault__Pointer
from sgraph_ai_app_send.lambda__user.user__config                               import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN

VAULT_ID  = 'pub1c0de'
FILE_ID   = 'bare/refs/main'
WRITE_KEY = 'cafebabe1234567890abcdef'
READ_KEY  = 'dGVzdC1yZWFkLWtleS0zMmJ5dGVzLXBhZGRlZA=='


def _make_client_with_public_vault():
    private_storage = Storage_FS__Memory()
    public_storage  = Storage_FS__Memory()
    private_service = Service__Vault__Pointer(storage_fs=private_storage)
    public_service  = Service__Vault__Pointer(storage_fs=public_storage)
    fast_api = Fast_API__SGraph__App__Send__User(vault_service        = private_service,
                                                 public_vault_service = public_service  ).setup()
    return TestClient(fast_api.app()), private_service, public_service


class test_Routes__Vault__Public(TestCase):

    @classmethod
    def setUpClass(cls):                                                          # Clear access-token env so these tests run in open local-dev mode regardless of suite order
        cls._saved_access_token = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        cls.client, cls.private_svc, cls.public_svc = _make_client_with_public_vault()

    @classmethod
    def tearDownClass(cls):
        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, cls._saved_access_token)

    def _write_public(self, vault_id=VAULT_ID, file_id=FILE_ID, write_key=WRITE_KEY,
                      read_key=READ_KEY, payload=b'encrypted-data'):
        headers = {'content-type'              : 'application/octet-stream',
                   'x-sgraph-vault-write-key'  : write_key                 ,
                   'x-vault-public'            : 'true'                    }
        if read_key:
            headers['x-vault-read-key'] = read_key
        return self.client.put(f'/api/vault/write/{vault_id}/{file_id}',
                               content = payload, headers = headers)

    def _read_public(self, vault_id=VAULT_ID, file_id=FILE_ID):
        return self.client.get(f'/api/vault/read/{vault_id}/{file_id}',
                               headers={'x-vault-public': 'true'})

    def _read_private(self, vault_id=VAULT_ID, file_id=FILE_ID):
        return self.client.get(f'/api/vault/read/{vault_id}/{file_id}')

    # ── bucket isolation ────────────────────────────────────────────────────

    def test__write_public__goes_to_public_storage(self):
        response = self._write_public(vault_id='pub00001')
        assert response.status_code == 200
        # visible in public service, not in private
        result = self.public_svc.read('pub00001', FILE_ID)
        assert result == b'encrypted-data'
        assert self.private_svc.read('pub00001', FILE_ID) is None

    def test__write_private__goes_to_private_storage(self):
        self.client.put(f'/api/vault/write/prv00001/{FILE_ID}',
                        content = b'private-data',
                        headers = {'content-type'            : 'application/octet-stream',
                                   'x-sgraph-vault-write-key': WRITE_KEY                 })
        assert self.private_svc.read('prv00001', FILE_ID) == b'private-data'
        assert self.public_svc.read('prv00001',  FILE_ID) is None

    def test__read_public__reads_from_public_storage(self):
        self._write_public(vault_id='pub00002', payload=b'pub-content')
        response = self._read_public(vault_id='pub00002')
        assert response.status_code == 200
        assert response.content == b'pub-content'

    def test__read_private__does_not_see_public_data(self):
        self._write_public(vault_id='pub00003', payload=b'pub-only')
        response = self._read_private(vault_id='pub00003')
        assert response.status_code == 404                   # not in private bucket

    # ── public-vault.json creation ───────────────────────────────────────────

    def test__write_public__creates_public_vault_json(self):
        self._write_public(vault_id='pub00004')
        response = self.client.get('/api/vault/public-info/pub00004')
        assert response.status_code == 200
        data = response.json()
        assert data['schema']   == 'sgit-public-vault/1'
        assert data['vault_id'] == 'pub00004'
        assert data['read_key'] == READ_KEY

    def test__write_public__no_read_key_header__still_succeeds(self):
        response = self._write_public(vault_id='pub00005', read_key=None)
        assert response.status_code == 200                   # write succeeds
        # but no public-vault.json (no read_key provided)
        info = self.client.get('/api/vault/public-info/pub00005')
        assert info.status_code == 404

    def test__write_public__json_idempotent_on_repeat_push(self):
        self._write_public(vault_id='pub00006', read_key=READ_KEY)
        self._write_public(vault_id='pub00006', read_key='different-key')
        data = self.client.get('/api/vault/public-info/pub00006').json()
        assert data['read_key'] == READ_KEY                  # first write wins

    # ── public-info endpoint ────────────────────────────────────────────────

    def test__public_info__not_found_returns_404(self):
        response = self.client.get('/api/vault/public-info/notfound')
        assert response.status_code == 404

    def test__public_info__no_auth_required(self):
        self._write_public(vault_id='pub00007')
        response = self.client.get('/api/vault/public-info/pub00007')  # no headers at all
        assert response.status_code == 200

    def test__public_info__returns_json_content_type(self):
        self._write_public(vault_id='pub00008')
        response = self.client.get('/api/vault/public-info/pub00008')
        assert 'application/json' in response.headers.get('content-type', '')

    def test__public_info__no_description_field(self):
        self._write_public(vault_id='pub00009')
        data = self.client.get('/api/vault/public-info/pub00009').json()
        assert 'description' not in data

    # ── public-info when public_vault_service not configured ─────────────────

    def test__public_info__not_configured_returns_501(self):
        no_public = Fast_API__SGraph__App__Send__User().setup()
        client    = TestClient(no_public.app())
        response  = client.get(f'/api/vault/public-info/{VAULT_ID}')
        assert response.status_code == 501
