# ===============================================================================
# Tests for Service__Vault
# Vault lifecycle: create, lookup, folder/file/index CRUD, bulk operations
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault       import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                   import Service__Vault


class test_Service__Vault(TestCase):

    @classmethod
    def setUpClass(cls):
        send_cache_client  = create_send_cache_client()
        vault_cache_client = Send__Cache__Client__Vault(
            cache_client   = send_cache_client.cache_client   ,
            hash_generator = send_cache_client.hash_generator )
        cls.service   = Service__Vault(vault_cache_client=vault_cache_client)
        cls.vault_key = 'svc-vault-test-001'

    def test__01__create_vault(self):
        result = self.service.create(self.vault_key, key_fingerprint='sha256:test1234')
        assert result is not None
        assert 'cache_id'    in result
        assert 'root_folder' in result
        assert 'created'     in result
        assert len(result['root_folder']) == 8                                 # 8-hex GUID

    def test__02__create_vault__duplicate_rejected(self):
        result = self.service.create(self.vault_key)
        assert result is None                                                  # Already exists

    def test__03__lookup_vault(self):
        result = self.service.lookup(self.vault_key)
        assert result is not None
        assert result.get('type')            == 'vault_root'
        assert result.get('key_fingerprint') == 'sha256:test1234'

    def test__04__vault_exists(self):
        assert self.service.exists(self.vault_key) is True

    def test__05__vault_exists__not_found(self):
        assert self.service.exists('nonexistent-vault') is False

    def test__10__store_folder(self):
        folder = dict(type='folder', id='subfolder-001', children=[])
        result = self.service.store_folder(self.vault_key, 'subfolder-001', folder)
        assert result is not None

    def test__11__get_folder(self):
        result = self.service.get_folder(self.vault_key, 'subfolder-001')
        assert result is not None

    def test__12__update_folder(self):
        updated = dict(type='folder', id='subfolder-001', children=['file-aaa'])
        result  = self.service.update_folder(self.vault_key, 'subfolder-001', updated)
        assert result is not None

    def test__13__list_folders(self):
        result = self.service.list_folders(self.vault_key)
        assert result is not None

    def test__14__store_folder__vault_not_found(self):
        result = self.service.store_folder('bad-key', 'f001', dict(type='folder'))
        assert result is None

    def test__20__store_file(self):
        encrypted = b'\xaa\xbb\xcc\xdd encrypted-file-data'
        result    = self.service.store_file(self.vault_key, 'file-aaa', encrypted)
        assert result is not None

    def test__21__get_file(self):
        result = self.service.get_file(self.vault_key, 'file-aaa')
        assert result is not None

    def test__22__list_files(self):
        result = self.service.list_files(self.vault_key)
        assert result is not None

    def test__23__store_file__vault_not_found(self):
        result = self.service.store_file('bad-key', 'f001', b'data')
        assert result is None

    def test__30__store_index(self):
        encrypted_index = b'\x11\x22\x33 encrypted-vault-index'
        result = self.service.store_index(self.vault_key, encrypted_index)
        assert result is not None

    def test__31__get_index(self):
        result = self.service.get_index(self.vault_key)
        assert result is not None

    def test__32__update_index(self):
        updated_index = b'\x44\x55\x66 updated-encrypted-index'
        result = self.service.update_index(self.vault_key, updated_index)
        assert result is not None

    def test__33__get_index__vault_not_found(self):
        result = self.service.get_index('bad-key')
        assert result is None

    def test__40__list_all(self):
        result = self.service.list_all(self.vault_key)
        assert result is not None

    def test__41__list_all__vault_not_found(self):
        result = self.service.list_all('bad-key')
        assert result is None
