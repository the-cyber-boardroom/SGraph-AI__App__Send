# ===============================================================================
# Tests — Routes__Vault__Inbox
# HTTP-level tests for all 6 inbox endpoints via TestClient
# Uses real in-memory stack (no mocks, no patches)
# ===============================================================================

import base64
import hashlib
import json
import time
from   unittest                                                                     import TestCase
from   tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs
from   sgraph_ai_app_send.lambda__user.user__config                                import (HEADER__SGRAPH_VAULT__WRITE_KEY ,
                                                                                           HEADER__SGRAPH_VAULT__ENUM_KEY  )
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import path__vault_manifest


VAULT_ID     = 'inboxrt00001'
WRITE_KEY    = 'route_test_write_key_1234'
APPEND_TOKEN = 'route_test_append_token'
ENUM_KEY     = 'route_test_enum_key'
PAYLOAD      = b'\x00\x01\x02encrypted-route-test'


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


class test_Routes__Vault__Inbox(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client       = _.fast_api__client
            cls.inbox_service = _.fast_api.inbox_service

    def _create_vault(self, vault_id=VAULT_ID):
        manifest = dict(vault_id       = vault_id                  ,
                        write_key_hash = _hash(WRITE_KEY)          ,
                        append_anchors = [_hash(APPEND_TOKEN)]     ,
                        enum_key_hash  = _hash(ENUM_KEY)           ,
                        created_at     = int(time.time() * 1000)   )
        path = path__vault_manifest(vault_id)
        self.inbox_service.storage_fs.file__save(path, json.dumps(manifest).encode())
        self.inbox_service._manifest_cache.pop(vault_id, None)

    def _append(self, vault_id=VAULT_ID, token=APPEND_TOKEN, payload=PAYLOAD):
        return self.client.post(
            f'/api/vault/inbox/append/{vault_id}',
            content = json.dumps({
                'append_token': token,
                'payload'     : base64.b64encode(payload).decode('ascii')
            }),
            headers = {'content-type': 'application/json'})

    def _list(self, vault_id=VAULT_ID, enum_key=ENUM_KEY, **body_kwargs):
        return self.client.post(
            f'/api/vault/inbox/list/{vault_id}',
            content = json.dumps(body_kwargs),
            headers = {'content-type'                 : 'application/json',
                       HEADER__SGRAPH_VAULT__ENUM_KEY : enum_key          })

    def _fetch(self, vault_id=VAULT_ID, enum_key=ENUM_KEY, inbox='', file_ids=None):
        return self.client.post(
            f'/api/vault/inbox/fetch/{vault_id}',
            content = json.dumps({'inbox': inbox, 'file_ids': file_ids or []}),
            headers = {'content-type'                 : 'application/json',
                       HEADER__SGRAPH_VAULT__ENUM_KEY : enum_key          })

    def _mark_processed(self, vault_id=VAULT_ID, enum_key=ENUM_KEY, inbox='', file_ids=None):
        return self.client.post(
            f'/api/vault/inbox/mark-processed/{vault_id}',
            content = json.dumps({'inbox': inbox, 'file_ids': file_ids or []}),
            headers = {'content-type'                 : 'application/json',
                       HEADER__SGRAPH_VAULT__ENUM_KEY : enum_key          })

    def _purge(self, vault_id=VAULT_ID, write_key=WRITE_KEY, folder='processed',
               inbox='', file_ids=None):
        body = {'folder': folder, 'inbox': inbox}
        if file_ids is not None:
            body['file_ids'] = file_ids
        return self.client.post(
            f'/api/vault/inbox/purge/{vault_id}',
            content = json.dumps(body),
            headers = {'content-type'                  : 'application/json',
                       HEADER__SGRAPH_VAULT__WRITE_KEY : write_key         })

    def _configure(self, vault_id=VAULT_ID, write_key=WRITE_KEY, **body_kwargs):
        return self.client.post(
            f'/api/vault/inbox/configure/{vault_id}',
            content = json.dumps(body_kwargs),
            headers = {'content-type'                  : 'application/json',
                       HEADER__SGRAPH_VAULT__WRITE_KEY : write_key         })

    # =========================================================================
    # Configure endpoint
    # =========================================================================

    def test__configure__success(self):
        vault = 'cfgrt0000001'
        manifest = dict(vault_id       = vault              ,
                        write_key_hash = _hash(WRITE_KEY)   ,
                        created_at     = int(time.time() * 1000))
        self.inbox_service.storage_fs.file__save(
            path__vault_manifest(vault), json.dumps(manifest).encode())
        self.inbox_service._manifest_cache.pop(vault, None)
        response = self._configure(vault,
                                    append_anchors=[_hash(APPEND_TOKEN)],
                                    enum_key_hash=_hash(ENUM_KEY))
        assert response.status_code == 200
        assert response.json()['status'] == 'configured'

    def test__configure__wrong_write_key(self):
        vault = 'cfgrt0000002'
        manifest = dict(vault_id       = vault              ,
                        write_key_hash = _hash(WRITE_KEY)   ,
                        created_at     = int(time.time() * 1000))
        self.inbox_service.storage_fs.file__save(
            path__vault_manifest(vault), json.dumps(manifest).encode())
        self.inbox_service._manifest_cache.pop(vault, None)
        response = self._configure(vault, write_key='wrongkey',
                                    append_anchors=[_hash('t')])
        assert response.status_code == 403

    def test__configure__missing_write_key(self):
        response = self.client.post(
            f'/api/vault/inbox/configure/{VAULT_ID}',
            content = json.dumps({'append_anchors': []}),
            headers = {'content-type': 'application/json'})
        assert response.status_code == 400

    def test__configure__invalid_vault_id(self):
        response = self._configure('tools-patches')
        assert response.status_code == 400

    # =========================================================================
    # Append endpoint
    # =========================================================================

    def test__append__success(self):
        self._create_vault('appendrt0001')
        response = self._append('appendrt0001')
        assert response.status_code == 200
        assert response.json() == {'ok': True}

    def test__append__wrong_token(self):
        self._create_vault('appendrt0002')
        response = self._append('appendrt0002', token='wrong')
        assert response.status_code == 403

    def test__append__missing_token(self):
        self._create_vault('appendrt0003')
        response = self.client.post(
            '/api/vault/inbox/append/appendrt0003',
            content = json.dumps({'payload': base64.b64encode(b'x').decode()}),
            headers = {'content-type': 'application/json'})
        assert response.status_code == 400

    def test__append__missing_payload(self):
        self._create_vault('appendrt0004')
        response = self.client.post(
            '/api/vault/inbox/append/appendrt0004',
            content = json.dumps({'append_token': APPEND_TOKEN}),
            headers = {'content-type': 'application/json'})
        assert response.status_code == 400

    def test__append__invalid_vault_id(self):
        response = self._append('tools-patches')
        assert response.status_code == 400

    def test__append__response_is_blind(self):
        self._create_vault('appendrt0005')
        response = self._append('appendrt0005')
        data = response.json()
        assert data == {'ok': True}
        assert 'file_id' not in data
        assert 'inbox'   not in data

    def test__append__no_auth_token_required(self):
        self._create_vault('appendrt0006')
        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        response = unauthenticated.post(
            '/api/vault/inbox/append/appendrt0006',
            content = json.dumps({
                'append_token': APPEND_TOKEN,
                'payload'     : base64.b64encode(PAYLOAD).decode('ascii')
            }),
            headers = {'content-type': 'application/json'})
        assert response.status_code == 200

    # =========================================================================
    # List endpoint
    # =========================================================================

    def test__list__success(self):
        vault = 'listrt000001'
        self._create_vault(vault)
        self._append(vault)
        response = self._list(vault)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'ok'
        assert len(data['entries']) == 1
        assert data['truncated'] is False

    def test__list__wrong_enum_key(self):
        vault = 'listrt000002'
        self._create_vault(vault)
        response = self._list(vault, enum_key='wrong')
        assert response.status_code == 403

    def test__list__missing_enum_key(self):
        vault = 'listrt000003'
        self._create_vault(vault)
        response = self.client.post(
            f'/api/vault/inbox/list/{vault}',
            content = json.dumps({}),
            headers = {'content-type': 'application/json'})
        assert response.status_code == 403

    def test__list__with_content(self):
        vault = 'listrt000004'
        self._create_vault(vault)
        self._append(vault)
        response = self._list(vault, include_content=True)
        assert response.status_code == 200
        entry = response.json()['entries'][0]
        assert 'content' in entry
        assert base64.b64decode(entry['content']) == PAYLOAD

    def test__list__pagination(self):
        vault = 'listrt000005'
        self._create_vault(vault)
        for i in range(5):
            self._append(vault, payload=f'msg-{i}'.encode())
        page1 = self._list(vault, limit=2).json()
        assert len(page1['entries']) == 2
        assert page1['truncated'] is True
        cursor = page1['entries'][-1]['file_id']
        page2 = self._list(vault, limit=2, after_file_id=cursor).json()
        assert len(page2['entries']) == 2
        page1_ids = {e['file_id'] for e in page1['entries']}
        page2_ids = {e['file_id'] for e in page2['entries']}
        assert len(page1_ids & page2_ids) == 0

    def test__list__invalid_vault_id(self):
        response = self._list('tools-patches')
        assert response.status_code == 400

    # =========================================================================
    # Fetch endpoint
    # =========================================================================

    def test__fetch__success(self):
        vault = 'fetchrt00001'
        self._create_vault(vault)
        self._append(vault)
        listing  = self._list(vault).json()
        file_id  = listing['entries'][0]['file_id']
        inbox    = listing['entries'][0]['inbox']
        response = self._fetch(vault, inbox=inbox, file_ids=[file_id])
        assert response.status_code == 200
        data = response.json()
        assert len(data['files']) == 1
        assert base64.b64decode(data['files'][0]['content']) == PAYLOAD

    def test__fetch__wrong_enum_key(self):
        vault = 'fetchrt00002'
        self._create_vault(vault)
        response = self._fetch(vault, enum_key='wrong', inbox=APPEND_TOKEN,
                                file_ids=['x.enc'])
        assert response.status_code == 403

    def test__fetch__missing_inbox(self):
        vault = 'fetchrt00003'
        self._create_vault(vault)
        response = self._fetch(vault, inbox='', file_ids=['x.enc'])
        assert response.status_code == 400

    def test__fetch__missing_file_ids(self):
        vault = 'fetchrt00004'
        self._create_vault(vault)
        response = self._fetch(vault, inbox=APPEND_TOKEN, file_ids=[])
        assert response.status_code == 400

    def test__fetch__missing_files_reported(self):
        vault = 'fetchrt00005'
        self._create_vault(vault)
        response = self._fetch(vault, inbox=APPEND_TOKEN,
                                file_ids=['nonexistent.enc'])
        assert response.status_code == 200
        data = response.json()
        assert len(data['files'])   == 0
        assert len(data['missing']) == 1

    # =========================================================================
    # Mark-processed endpoint
    # =========================================================================

    def test__mark_processed__success(self):
        vault = 'markrt000001'
        self._create_vault(vault)
        self._append(vault)
        listing = self._list(vault).json()
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        response = self._mark_processed(vault, inbox=inbox, file_ids=[file_id])
        assert response.status_code == 200
        data = response.json()
        assert file_id in data['moved']
        after = self._list(vault).json()
        assert len(after['entries']) == 0

    def test__mark_processed__wrong_enum_key(self):
        vault = 'markrt000002'
        self._create_vault(vault)
        response = self._mark_processed(vault, enum_key='wrong',
                                          inbox=APPEND_TOKEN, file_ids=['x.enc'])
        assert response.status_code == 403

    def test__mark_processed__idempotent(self):
        vault = 'markrt000003'
        self._create_vault(vault)
        self._append(vault)
        listing = self._list(vault).json()
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self._mark_processed(vault, inbox=inbox, file_ids=[file_id])
        response = self._mark_processed(vault, inbox=inbox, file_ids=[file_id])
        assert response.status_code == 200
        assert file_id in response.json()['missing']

    def test__mark_processed__missing_inbox(self):
        vault = 'markrt000004'
        self._create_vault(vault)
        response = self._mark_processed(vault, inbox='', file_ids=['x.enc'])
        assert response.status_code == 400

    # =========================================================================
    # Purge endpoint
    # =========================================================================

    def test__purge__processed_files(self):
        vault = 'purgert00001'
        self._create_vault(vault)
        self._append(vault)
        listing = self._list(vault).json()
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self._mark_processed(vault, inbox=inbox, file_ids=[file_id])
        response = self._purge(vault, inbox=inbox, file_ids=[file_id])
        assert response.status_code == 200
        assert file_id in response.json()['purged']

    def test__purge__wrong_write_key(self):
        vault = 'purgert00002'
        self._create_vault(vault)
        response = self._purge(vault, write_key='wrongkey', inbox=APPEND_TOKEN)
        assert response.status_code == 403

    def test__purge__missing_write_key(self):
        vault = 'purgert00003'
        self._create_vault(vault)
        response = self.client.post(
            f'/api/vault/inbox/purge/{vault}',
            content = json.dumps({'folder': 'processed', 'inbox': APPEND_TOKEN}),
            headers = {'content-type': 'application/json'})
        assert response.status_code == 400

    def test__purge__invalid_folder(self):
        vault = 'purgert00004'
        self._create_vault(vault)
        response = self._purge(vault, folder='invalid', inbox=APPEND_TOKEN)
        assert response.status_code == 400

    def test__purge__all_processed(self):
        vault = 'purgert00005'
        self._create_vault(vault)
        for i in range(3):
            self._append(vault, payload=f'msg-{i}'.encode())
        listing  = self._list(vault).json()
        file_ids = [e['file_id'] for e in listing['entries']]
        inbox    = listing['entries'][0]['inbox']
        self._mark_processed(vault, inbox=inbox, file_ids=file_ids)
        response = self._purge(vault, inbox=inbox)
        assert response.status_code == 200
        assert len(response.json()['purged']) == 3

    def test__purge__idempotent(self):
        vault = 'purgert00006'
        self._create_vault(vault)
        self._append(vault)
        listing = self._list(vault).json()
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self._mark_processed(vault, inbox=inbox, file_ids=[file_id])
        self._purge(vault, inbox=inbox, file_ids=[file_id])
        response = self._purge(vault, inbox=inbox, file_ids=[file_id])
        assert response.status_code == 200
        assert file_id in response.json()['missing']

    # =========================================================================
    # Full drain cycle (end-to-end HTTP)
    # =========================================================================

    def test__full_drain_cycle__http(self):
        vault = 'drainrt00001'
        self._create_vault(vault)
        for i in range(5):
            resp = self._append(vault, payload=f'encrypted-msg-{i}'.encode())
            assert resp.status_code == 200
        listing = self._list(vault).json()
        assert len(listing['entries']) == 5
        file_ids = [e['file_id'] for e in listing['entries']]
        inbox    = listing['entries'][0]['inbox']
        for file_id in file_ids:
            fetch_resp = self._fetch(vault, inbox=inbox, file_ids=[file_id])
            assert fetch_resp.status_code == 200
            assert len(fetch_resp.json()['files']) == 1
        mark_resp = self._mark_processed(vault, inbox=inbox, file_ids=file_ids)
        assert mark_resp.status_code == 200
        assert len(mark_resp.json()['moved']) == 5
        empty = self._list(vault).json()
        assert len(empty['entries']) == 0
        purge_resp = self._purge(vault, inbox=inbox)
        assert purge_resp.status_code == 200
        assert len(purge_resp.json()['purged']) == 5

    def test__drain_with_pagination__http(self):
        vault = 'drainrt00002'
        self._create_vault(vault)
        for i in range(7):
            self._append(vault, payload=f'msg-{i}'.encode())
        all_ids = []
        cursor  = None
        inbox   = None
        while True:
            kwargs = dict(limit=3)
            if cursor:
                kwargs['after_file_id'] = cursor
            page = self._list(vault, **kwargs).json()
            if not page['entries']:
                break
            for e in page['entries']:
                all_ids.append(e['file_id'])
                if inbox is None:
                    inbox = e['inbox']
            cursor = page['entries'][-1]['file_id']
            if not page['truncated']:
                break
        assert len(all_ids) == 7
        mark_resp = self._mark_processed(vault, inbox=inbox, file_ids=all_ids)
        assert len(mark_resp.json()['moved']) == 7

    # =========================================================================
    # Capability tier separation (HTTP-level security tests)
    # =========================================================================

    def test__tier__append_token_cannot_list(self):
        vault = 'tiersec00001'
        self._create_vault(vault)
        response = self._list(vault, enum_key=APPEND_TOKEN)
        assert response.status_code == 403

    def test__tier__enum_key_cannot_append(self):
        vault = 'tiersec00002'
        self._create_vault(vault)
        response = self._append(vault, token=ENUM_KEY)
        assert response.status_code == 403

    def test__tier__enum_key_cannot_purge(self):
        vault = 'tiersec00003'
        self._create_vault(vault)
        response = self._purge(vault, write_key=ENUM_KEY, inbox=APPEND_TOKEN)
        assert response.status_code == 403

    def test__tier__different_vaults_isolated(self):
        vault_a = 'tiersec00004'
        vault_b = 'tiersec00005'
        self._create_vault(vault_a)
        self._create_vault(vault_b)
        self._append(vault_a, payload=b'secret-for-a')
        self._append(vault_b, payload=b'secret-for-b')
        listing_a = self._list(vault_a).json()
        listing_b = self._list(vault_b).json()
        assert len(listing_a['entries']) == 1
        assert len(listing_b['entries']) == 1
        ids_a = {e['file_id'] for e in listing_a['entries']}
        ids_b = {e['file_id'] for e in listing_b['entries']}
        assert len(ids_a & ids_b) == 0

    # =========================================================================
    # Multi-correspondent test
    # =========================================================================

    def test__multiple_correspondents(self):
        vault = 'multicor0001'
        token_a = 'correspondent_alpha'
        token_b = 'correspondent_beta'
        manifest = dict(vault_id       = vault                                ,
                        write_key_hash = _hash(WRITE_KEY)                     ,
                        append_anchors = [_hash(token_a), _hash(token_b)]     ,
                        enum_key_hash  = _hash(ENUM_KEY)                      ,
                        created_at     = int(time.time() * 1000)              )
        self.inbox_service.storage_fs.file__save(
            path__vault_manifest(vault), json.dumps(manifest).encode())
        self.inbox_service._manifest_cache.pop(vault, None)
        self._append(vault, token=token_a, payload=b'from-alpha-1')
        self._append(vault, token=token_a, payload=b'from-alpha-2')
        self._append(vault, token=token_b, payload=b'from-beta-1')
        listing = self._list(vault).json()
        assert len(listing['entries']) == 3
        listing_a = self._list(vault, inbox=token_a).json()
        listing_b = self._list(vault, inbox=token_b).json()
        assert len(listing_a['entries']) == 2
        assert len(listing_b['entries']) == 1
