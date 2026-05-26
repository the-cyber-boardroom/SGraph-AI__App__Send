# ===============================================================================
# SGraph Send - Service__Vault__Pointer: Public Vault Tests
# ensure_public_vault_json and path__vault_public_vault_json
# ===============================================================================

import json
from unittest                                                                    import TestCase
from memory_fs.storage_fs.providers.Storage_FS__Memory                          import Storage_FS__Memory
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer            import Service__Vault__Pointer
from sgraph_ai_app_send.lambda__user.storage.Storage__Paths                     import path__vault_public_vault_json

VAULT_ID  = 'ab12cd34'
WRITE_KEY = 'deadbeef1234567890abcdef'
READ_KEY  = 'dGVzdC1yZWFkLWtleS0zMmJ5dGVzLXBhZGRlZA=='   # base64(32 bytes)


class test_Service__Vault__Public(TestCase):

    def setUp(self):
        self.storage = Storage_FS__Memory()
        self.service = Service__Vault__Pointer(storage_fs=self.storage)

    # ── path helper ─────────────────────────────────────────────────────────

    def test__path__vault_public_vault_json(self):
        path = path__vault_public_vault_json(VAULT_ID)
        assert path.endswith(f'/{VAULT_ID}/public-vault.json')
        assert '/payload' not in path                        # not an encrypted vault object

    # ── ensure_public_vault_json ─────────────────────────────────────────────

    def test__ensure_public_vault_json__creates_file(self):
        self.service.ensure_public_vault_json(VAULT_ID, READ_KEY)
        path = path__vault_public_vault_json(VAULT_ID)
        assert self.storage.file__exists(path)

    def test__ensure_public_vault_json__content(self):
        self.service.ensure_public_vault_json(VAULT_ID, READ_KEY)
        path = path__vault_public_vault_json(VAULT_ID)
        data = json.loads(self.storage.file__bytes(path).decode())
        assert data['schema']   == 'sgit-public-vault/1'
        assert data['vault_id'] == VAULT_ID
        assert data['read_key'] == READ_KEY
        assert 'created_at'     in data
        assert 'description'    not in data                  # must not be present

    def test__ensure_public_vault_json__idempotent(self):
        self.service.ensure_public_vault_json(VAULT_ID, READ_KEY)
        path      = path__vault_public_vault_json(VAULT_ID)
        first_ts  = json.loads(self.storage.file__bytes(path).decode())['created_at']

        self.service.ensure_public_vault_json(VAULT_ID, 'different-key')        # second call must not overwrite
        second_ts = json.loads(self.storage.file__bytes(path).decode())['created_at']
        assert first_ts == second_ts

    def test__ensure_public_vault_json__read_key_unchanged_after_repeat(self):
        self.service.ensure_public_vault_json(VAULT_ID, READ_KEY)
        self.service.ensure_public_vault_json(VAULT_ID, 'other-key')
        path = path__vault_public_vault_json(VAULT_ID)
        data = json.loads(self.storage.file__bytes(path).decode())
        assert data['read_key'] == READ_KEY                  # original key preserved

    def test__ensure_public_vault_json__valid_json(self):
        self.service.ensure_public_vault_json(VAULT_ID, READ_KEY)
        path  = path__vault_public_vault_json(VAULT_ID)
        raw   = self.storage.file__bytes(path)
        data  = json.loads(raw.decode('utf-8'))              # must parse as UTF-8 JSON
        assert isinstance(data, dict)

    def test__ensure_public_vault_json__independent_of_vault_write(self):
        # public-vault.json can be written before any vault object exists
        self.service.ensure_public_vault_json(VAULT_ID, READ_KEY)
        path = path__vault_public_vault_json(VAULT_ID)
        assert self.storage.file__exists(path)
        # normal write still works after
        result = self.service.write(VAULT_ID, 'bare/refs/main', WRITE_KEY, b'encrypted')
        assert result['status'] == 'completed'
