# ===============================================================================
# SGraph Send - Service__Vault__Pointer Tests
# Vault file lifecycle: write, read, overwrite, delete with write-key auth
# Including vault manifest protection tests
# ===============================================================================

from unittest                                                                    import TestCase
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer             import Service__Vault__Pointer


class test_Service__Vault__Pointer(TestCase):

    def setUp(self):
        self.service   = Service__Vault__Pointer()
        self.vault_id  = 'a1b2c3d4'
        self.file_id   = 'f5e6d7c8b9a0'
        self.write_key = 'deadbeef1234567890abcdef'
        self.payload   = b'\x00\x01\x02\x03encrypted'

    # --- Write ---

    def test__write__first_time(self):
        result = self.service.write(vault_id      = self.vault_id  ,
                                    file_id       = self.file_id   ,
                                    write_key_hex = self.write_key ,
                                    payload_bytes = self.payload   )
        assert result is not None
        assert result['file_id']     == self.file_id
        assert result['vault_id']    == self.vault_id
        assert result['status']      == 'completed'
        assert result['write_count'] == 1

    def test__write__creates_payload(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )
        stored = self.service.read(vault_id = self.vault_id,
                                   file_id  = self.file_id )
        assert stored == self.payload

    def test__write__overwrite_same_key(self):
        self.service.write(vault_id      = self.vault_id     ,
                           file_id       = self.file_id      ,
                           write_key_hex = self.write_key    ,
                           payload_bytes = b'version-1'      )

        result = self.service.write(vault_id      = self.vault_id     ,
                                    file_id       = self.file_id      ,
                                    write_key_hex = self.write_key    ,
                                    payload_bytes = b'version-2'      )
        assert result['write_count'] == 2
        assert self.service.read(self.vault_id, self.file_id) == b'version-2'

    def test__write__overwrite_wrong_key(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = b'original'    )

        result = self.service.write(vault_id      = self.vault_id     ,
                                    file_id       = self.file_id      ,
                                    write_key_hex = 'wrongkey1234'    ,
                                    payload_bytes = b'tampered'       )
        assert result is None                                                    # Auth failure
        assert self.service.read(self.vault_id, self.file_id) == b'original'     # Payload unchanged

    def test__write__stores_metadata(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )
        meta = self.service.storage_fs.file__json(
            self.service.vault_meta_path(self.vault_id, self.file_id))
        assert meta['file_id']        == self.file_id
        assert meta['vault_id']       == self.vault_id
        assert meta['mutable']        is True
        assert meta['status']         == 'completed'
        assert meta['write_count']    == 1
        assert 'write_key_hash'       in meta
        assert 'created_at'           in meta
        assert 'updated_at'           in meta

    # --- Read ---

    def test__read__existing(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )
        result = self.service.read(vault_id = self.vault_id,
                                   file_id  = self.file_id )
        assert result == self.payload

    def test__read__not_found(self):
        result = self.service.read(vault_id = 'nonexist',
                                   file_id  = 'nonexist')
        assert result is None

    # --- Delete ---

    def test__delete__correct_key(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )

        result = self.service.delete(vault_id      = self.vault_id  ,
                                     file_id       = self.file_id   ,
                                     write_key_hex = self.write_key )
        assert result is not None
        assert result['file_id']  == self.file_id
        assert result['vault_id'] == self.vault_id
        assert result['status']   == 'deleted'

        # Confirm both meta and payload are gone
        assert self.service.read(self.vault_id, self.file_id) is None

    def test__delete__wrong_key(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )

        result = self.service.delete(vault_id      = self.vault_id  ,
                                     file_id       = self.file_id   ,
                                     write_key_hex = 'wrongkey1234' )
        assert result is None                                                    # Auth failure
        assert self.service.read(self.vault_id, self.file_id) == self.payload    # Still accessible

    def test__delete__not_found(self):
        result = self.service.delete(vault_id      = 'nonexist' ,
                                     file_id       = 'nonexist' ,
                                     write_key_hex = 'anykey'   )
        assert result is None

    # --- Multiple files in one vault ---

    def test__multiple_files_in_vault(self):
        self.service.write(self.vault_id, 'file-aaa', self.write_key, b'data-a')
        self.service.write(self.vault_id, 'file-bbb', self.write_key, b'data-b')

        assert self.service.read(self.vault_id, 'file-aaa') == b'data-a'
        assert self.service.read(self.vault_id, 'file-bbb') == b'data-b'

        # Delete one doesn't affect the other
        self.service.delete(self.vault_id, 'file-aaa', self.write_key)
        assert self.service.read(self.vault_id, 'file-aaa') is None
        assert self.service.read(self.vault_id, 'file-bbb') == b'data-b'

    # --- Multiple vaults with same write key ---

    def test__separate_vaults_isolated(self):
        self.service.write('vault-1', 'file-001', self.write_key, b'vault-1-data')
        self.service.write('vault-2', 'file-001', self.write_key, b'vault-2-data')

        assert self.service.read('vault-1', 'file-001') == b'vault-1-data'
        assert self.service.read('vault-2', 'file-001') == b'vault-2-data'

    # --- Storage paths ---

    def test__storage_paths(self):
        assert self.service.vault_meta_path('v1', 'f1')     == 'transfers/vault/v1/f1/meta.json'
        assert self.service.vault_payload_path('v1', 'f1')   == 'transfers/vault/v1/f1/payload'
        assert self.service.vault_manifest_path('v1')        == 'transfers/vault/v1/manifest.json'

    # --- Full lifecycle ---

    def test__full_lifecycle(self):
        # Create
        result = self.service.write(self.vault_id, self.file_id, self.write_key, b'v1')
        assert result['write_count'] == 1

        # Read
        assert self.service.read(self.vault_id, self.file_id) == b'v1'

        # Overwrite
        result = self.service.write(self.vault_id, self.file_id, self.write_key, b'v2')
        assert result['write_count'] == 2
        assert self.service.read(self.vault_id, self.file_id) == b'v2'

        # Overwrite again
        result = self.service.write(self.vault_id, self.file_id, self.write_key, b'v3')
        assert result['write_count'] == 3
        assert self.service.read(self.vault_id, self.file_id) == b'v3'

        # Reject wrong key
        assert self.service.write(self.vault_id, self.file_id, 'bad-key', b'v4') is None
        assert self.service.read(self.vault_id, self.file_id) == b'v3'          # Unchanged

        # Delete
        result = self.service.delete(self.vault_id, self.file_id, self.write_key)
        assert result['status'] == 'deleted'
        assert self.service.read(self.vault_id, self.file_id) is None

    # --- Write key is hashed (not stored in plaintext) ---

    def test__write_key_not_stored_plaintext(self):
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )
        meta = self.service.storage_fs.file__json(
            self.service.vault_meta_path(self.vault_id, self.file_id))
        assert self.write_key not in str(meta)                                   # Raw key not in metadata
        assert len(meta['write_key_hash']) == 64                                 # SHA-256 hex digest

    # === Vault Manifest Protection ===

    def test__manifest__created_on_first_write(self):
        self.service.write(self.vault_id, 'first-file', self.write_key, b'data')
        manifest_path = self.service.vault_manifest_path(self.vault_id)
        assert self.service.storage_fs.file__exists(manifest_path)
        manifest = self.service.storage_fs.file__json(manifest_path)
        assert manifest['vault_id'] == self.vault_id
        assert 'write_key_hash'     in manifest
        assert 'created_at'         in manifest

    def test__manifest__not_created_before_write(self):
        manifest_path = self.service.vault_manifest_path(self.vault_id)
        assert not self.service.storage_fs.file__exists(manifest_path)

    def test__manifest__second_file_same_key_allowed(self):
        self.service.write(self.vault_id, 'file-1', self.write_key, b'data-1')
        result = self.service.write(self.vault_id, 'file-2', self.write_key, b'data-2')
        assert result is not None
        assert result['file_id'] == 'file-2'
        assert self.service.read(self.vault_id, 'file-2') == b'data-2'

    def test__manifest__second_file_wrong_key_rejected(self):
        """Core manifest protection: attacker can't create files in an owned vault."""
        self.service.write(self.vault_id, 'file-1', self.write_key, b'data-1')
        result = self.service.write(self.vault_id, 'file-2', 'attacker-key', b'malicious')
        assert result is None                                                    # Rejected by manifest
        assert self.service.read(self.vault_id, 'file-2') is None               # File was NOT created

    def test__manifest__delete_wrong_key_rejected_by_manifest(self):
        """Attacker can't delete files even if they guess a file_id."""
        self.service.write(self.vault_id, 'file-1', self.write_key, b'data-1')
        result = self.service.delete(self.vault_id, 'file-1', 'attacker-key')
        assert result is None
        assert self.service.read(self.vault_id, 'file-1') == b'data-1'          # Still intact

    def test__manifest__delete_nonexistent_file_wrong_key(self):
        """Even deleting a nonexistent file is rejected if manifest key doesn't match."""
        self.service.write(self.vault_id, 'file-1', self.write_key, b'data-1')
        result = self.service.delete(self.vault_id, 'ghost-file', 'attacker-key')
        assert result is None

    def test__manifest__different_vaults_different_owners(self):
        """Two vaults can have different write keys."""
        self.service.write('vault-aaa', 'file-1', 'key-alice', b'alice-data')
        self.service.write('vault-bbb', 'file-1', 'key-bob',   b'bob-data')

        # Each owner can write to their own vault
        assert self.service.write('vault-aaa', 'file-2', 'key-alice', b'alice-2') is not None
        assert self.service.write('vault-bbb', 'file-2', 'key-bob',   b'bob-2')   is not None

        # Cross-vault writes rejected
        assert self.service.write('vault-aaa', 'file-3', 'key-bob',   b'intruder') is None
        assert self.service.write('vault-bbb', 'file-3', 'key-alice', b'intruder') is None

    def test__manifest__write_key_hash_matches_file_meta(self):
        """Manifest and file meta store the same write_key_hash."""
        self.service.write(self.vault_id, self.file_id, self.write_key, self.payload)
        manifest = self.service.storage_fs.file__json(
            self.service.vault_manifest_path(self.vault_id))
        file_meta = self.service.storage_fs.file__json(
            self.service.vault_meta_path(self.vault_id, self.file_id))
        assert manifest['write_key_hash'] == file_meta['write_key_hash']

    def test__manifest__raw_write_key_not_in_manifest(self):
        self.service.write(self.vault_id, self.file_id, self.write_key, self.payload)
        manifest = self.service.storage_fs.file__json(
            self.service.vault_manifest_path(self.vault_id))
        assert self.write_key not in str(manifest)                               # Only hash stored
