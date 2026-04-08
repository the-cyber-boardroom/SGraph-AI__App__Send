# ===============================================================================
# SGraph Send - Service__Vault__Zip Tests
# Content hash determinism, cache hit/miss, auth, empty vault, zip contents
# ===============================================================================

import zipfile
import io
from   unittest                                                                  import TestCase
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer           import Service__Vault__Pointer
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Zip              import Service__Vault__Zip


class test_Service__Vault__Zip(TestCase):

    def setUp(self):
        self.vault_service = Service__Vault__Pointer()
        self.zip_service   = Service__Vault__Zip(vault_service = self.vault_service,
                                                  storage_fs    = self.vault_service.storage_fs)
        self.vault_id  = 'zipvault0001'
        self.write_key = 'deadbeef1234567890abcdef'

    def _write(self, vault_id=None, file_id='file-1', payload=b'data'):
        vault_id = vault_id or self.vault_id
        self.vault_service.write(vault_id      = vault_id   ,
                                  file_id       = file_id    ,
                                  write_key_hex = self.write_key,
                                  payload_bytes = payload    )

    # --- Content hash ---

    def test__content_hash__deterministic(self):
        self._write(file_id='file-a', payload=b'aaa')
        self._write(file_id='file-b', payload=b'bbb')
        hash_1 = self.zip_service.vault_content_hash(self.vault_id)
        hash_2 = self.zip_service.vault_content_hash(self.vault_id)
        assert hash_1 == hash_2
        assert len(hash_1) == 64                                               # SHA-256 hex digest

    def test__content_hash__changes_on_add(self):
        self._write(file_id='file-a', payload=b'aaa')
        hash_before = self.zip_service.vault_content_hash(self.vault_id)

        self._write(file_id='file-b', payload=b'bbb')
        hash_after = self.zip_service.vault_content_hash(self.vault_id)
        assert hash_before != hash_after

    def test__content_hash__changes_on_size_change(self):
        self._write(file_id='file-a', payload=b'short')
        hash_before = self.zip_service.vault_content_hash(self.vault_id)

        self._write(file_id='file-a', payload=b'much-longer-payload')
        hash_after = self.zip_service.vault_content_hash(self.vault_id)
        assert hash_before != hash_after

    def test__content_hash__none_for_empty_vault(self):
        assert self.zip_service.vault_content_hash(self.vault_id) is None

    # --- Build zip ---

    def test__build_zip__contains_files(self):
        self._write(file_id='doc/readme.txt', payload=b'hello world')
        self._write(file_id='doc/notes.txt',  payload=b'some notes')

        zip_bytes = self.zip_service.build_zip(self.vault_id)
        assert len(zip_bytes) > 0

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = sorted(zf.namelist())
            assert names == ['doc/notes.txt', 'doc/readme.txt']
            assert zf.read('doc/readme.txt') == b'hello world'
            assert zf.read('doc/notes.txt')  == b'some notes'

    def test__build_zip__empty_vault(self):
        zip_bytes = self.zip_service.build_zip(self.vault_id)
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            assert zf.namelist() == []

    # --- Cache ---

    def test__cache_miss_then_hit(self):
        self._write(file_id='file-1', payload=b'data-1')

        result_1 = self.zip_service.get_or_create_zip(self.vault_id, self.write_key)
        assert result_1['status']  == 'ok'
        assert result_1['cached']  is False
        assert result_1['file_count'] == 1

        result_2 = self.zip_service.get_or_create_zip(self.vault_id, self.write_key)
        assert result_2['status']  == 'ok'
        assert result_2['cached']  is True
        assert result_2['content_hash'] == result_1['content_hash']

    def test__cache_invalidated_on_new_file(self):
        self._write(file_id='file-1', payload=b'data-1')
        result_1 = self.zip_service.get_or_create_zip(self.vault_id, self.write_key)

        self._write(file_id='file-2', payload=b'data-2')
        result_2 = self.zip_service.get_or_create_zip(self.vault_id, self.write_key)

        assert result_2['cached'] is False
        assert result_2['content_hash'] != result_1['content_hash']
        assert result_2['file_count'] == 2

    # --- Auth ---

    def test__auth_failure(self):
        self._write(file_id='file-1', payload=b'data')
        result = self.zip_service.get_or_create_zip(self.vault_id, 'wrong-key')
        assert result is None

    # --- Vault not found ---

    def test__vault_not_found(self):
        result = self.zip_service.get_or_create_zip('nonexistent', self.write_key)
        assert result['status'] == 'error'
        assert 'not found' in result['detail'].lower()

    # --- Empty vault ---

    def test__empty_vault(self):
        # Create vault with manifest but no files (write + delete)
        self._write(file_id='temp', payload=b'temp')
        self.vault_service.delete(self.vault_id, 'temp', self.write_key)

        result = self.zip_service.get_or_create_zip(self.vault_id, self.write_key)
        assert result['status']     == 'ok'
        assert result['file_count'] == 0

    # --- Zip storage path ---

    def test__zip_storage_path(self):
        path = self.zip_service.zip_storage_path('v1', 'abc123')
        assert path == 'vault-zips/v1/abc123.zip'

    # --- Zip contents match vault ---

    def test__zip_contents_match_vault(self):
        files = {'bare/data/obj-aaa': b'blob-a', 'bare/data/obj-bbb': b'blob-b', 'config.json': b'{}'}
        for fid, data in files.items():
            self._write(file_id=fid, payload=data)

        result    = self.zip_service.get_or_create_zip(self.vault_id, self.write_key)
        zip_path  = result['zip_path']
        zip_bytes = self.zip_service.storage_fs.file__bytes(zip_path)

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for fid, data in files.items():
                assert zf.read(fid) == data
            assert len(zf.namelist()) == 3
