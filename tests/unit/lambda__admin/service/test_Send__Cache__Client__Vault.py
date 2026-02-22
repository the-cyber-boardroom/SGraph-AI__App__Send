# ===============================================================================
# Tests for Send__Cache__Client__Vault
# Verifies vault cache client operations: create, lookup, folder/file/index CRUD
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault       import Send__Cache__Client__Vault


def create_vault_cache_client():                                               # Factory: create vault cache client from shared setup
    send_cache_client = create_send_cache_client()
    return Send__Cache__Client__Vault(cache_client   = send_cache_client.cache_client   ,
                                      hash_generator = send_cache_client.hash_generator )


class test_Send__Cache__Client__Vault(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client         = create_vault_cache_client()
        cls.vault_key      = 'test-vault-key-001'
        cls.vault_cache_id = None

    def test__01__vault__create(self):
        manifest = dict(type            = 'vault_root'      ,
                        key_fingerprint = 'sha256:abcd1234' ,
                        root_folder     = 'root-guid-001'   )
        result = self.client.vault__create(self.vault_key, manifest)
        assert result is not None
        assert hasattr(result, 'cache_id')
        test_Send__Cache__Client__Vault.vault_cache_id = str(result.cache_id)

    def test__02__vault__lookup(self):
        result = self.client.vault__lookup(self.vault_key)
        assert result is not None
        assert result.get('type')            == 'vault_root'
        assert result.get('key_fingerprint') == 'sha256:abcd1234'
        assert result.get('root_folder')     == 'root-guid-001'

    def test__03__vault__lookup_cache_id(self):
        cache_id = self.client.vault__lookup_cache_id(self.vault_key)
        assert cache_id is not None
        assert cache_id == self.vault_cache_id

    def test__04__vault__lookup__not_found(self):
        result = self.client.vault__lookup('nonexistent-vault-key')
        assert result is None

    def test__05__vault__lookup_cache_id__not_found(self):
        result = self.client.vault__lookup_cache_id('nonexistent-vault-key')
        assert result is None

    def test__10__folder__store(self):
        folder_data = dict(type='folder', id='folder-001', children=[])
        result = self.client.folder__store(self.vault_cache_id, 'folder-001', folder_data)
        assert result is not None

    def test__11__folder__get(self):
        result = self.client.folder__get(self.vault_cache_id, 'folder-001')
        assert result is not None

    def test__12__folder__update(self):
        updated = dict(type='folder', id='folder-001', children=['file-001'])
        result  = self.client.folder__update(self.vault_cache_id, 'folder-001', updated)
        assert result is not None

    def test__13__folder__list(self):
        result = self.client.folder__list(self.vault_cache_id)
        assert result is not None

    def test__20__file__store(self):
        encrypted = b'\x00\x01\x02\x03encrypted-content'
        result    = self.client.file__store(self.vault_cache_id, 'file-001', encrypted)
        assert result is not None

    def test__21__file__get(self):
        result = self.client.file__get(self.vault_cache_id, 'file-001')
        assert result is not None

    def test__22__file__list(self):
        result = self.client.file__list(self.vault_cache_id)
        assert result is not None

    def test__30__index__store(self):
        encrypted_index = b'\x10\x20\x30encrypted-index'
        result = self.client.index__store(self.vault_cache_id, encrypted_index)
        assert result is not None

    def test__31__index__get(self):
        result = self.client.index__get(self.vault_cache_id)
        assert result is not None

    def test__32__index__update(self):
        updated_index = b'\x40\x50\x60updated-encrypted-index'
        result = self.client.index__update(self.vault_cache_id, updated_index)
        assert result is not None

    def test__40__vault__list_all(self):
        result = self.client.vault__list_all(self.vault_cache_id)
        assert result is not None
