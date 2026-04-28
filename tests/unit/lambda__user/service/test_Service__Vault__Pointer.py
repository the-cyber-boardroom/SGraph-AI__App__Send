# ===============================================================================
# SGraph Send - Service__Vault__Pointer Tests
# Vault file lifecycle: write, read, overwrite, delete with write-key auth
# Including vault manifest protection, write-if-match, batch, and list tests
# ===============================================================================

import base64
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
        assert result['status'] == 'completed'
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

    def test__write__no_meta_json_created(self):
        """Verify meta.json is NOT created — removed in branch model architecture."""
        self.service.write(vault_id      = self.vault_id  ,
                           file_id       = self.file_id   ,
                           write_key_hex = self.write_key ,
                           payload_bytes = self.payload   )
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import _ROOT
        meta_path = f'{_ROOT}/vault/{self.vault_id[:2]}/{self.vault_id}/{self.file_id}/meta.json'
        assert not self.service.storage_fs.file__exists(meta_path)

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
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__vault_payload, path__vault_manifest
        assert self.service.vault_payload_path('v1', 'f1') == path__vault_payload('v1', 'f1')
        assert self.service.vault_manifest_path('v1')      == path__vault_manifest('v1')

    # --- Full lifecycle ---

    def test__full_lifecycle(self):
        # Create
        result = self.service.write(self.vault_id, self.file_id, self.write_key, b'v1')
        assert result['status'] == 'completed'

        # Read
        assert self.service.read(self.vault_id, self.file_id) == b'v1'

        # Overwrite
        result = self.service.write(self.vault_id, self.file_id, self.write_key, b'v2')
        assert result['status'] == 'completed'
        assert self.service.read(self.vault_id, self.file_id) == b'v2'

        # Overwrite again
        result = self.service.write(self.vault_id, self.file_id, self.write_key, b'v3')
        assert result['status'] == 'completed'
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
        manifest = self.service.storage_fs.file__json(
            self.service.vault_manifest_path(self.vault_id))
        assert self.write_key not in str(manifest)                               # Raw key not in manifest
        assert len(manifest['write_key_hash']) == 64                             # SHA-256 hex digest

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

    def test__manifest__raw_write_key_not_in_manifest(self):
        self.service.write(self.vault_id, self.file_id, self.write_key, self.payload)
        manifest = self.service.storage_fs.file__json(
            self.service.vault_manifest_path(self.vault_id))
        assert self.write_key not in str(manifest)                               # Only hash stored

    # === write-if-match (compare-and-swap) ===

    def test__write_if_match__succeeds_when_matching(self):
        """CAS write succeeds when current value matches expected."""
        self.service.write(self.vault_id, 'ref-001', self.write_key, b'commit-aaa')

        current_b64 = base64.b64encode(b'commit-aaa').decode()
        new_b64     = base64.b64encode(b'commit-bbb').decode()

        result = self.service.write_if_match(self.vault_id, 'ref-001',
                                             current_b64, new_b64, self.write_key)
        assert result['status']  == 'ok'
        assert result['file_id'] == 'ref-001'
        assert self.service.read(self.vault_id, 'ref-001') == b'commit-bbb'

    def test__write_if_match__conflict_when_mismatched(self):
        """CAS write returns conflict with current value when mismatch."""
        self.service.write(self.vault_id, 'ref-001', self.write_key, b'commit-aaa')

        stale_b64 = base64.b64encode(b'commit-old').decode()
        new_b64   = base64.b64encode(b'commit-bbb').decode()

        result = self.service.write_if_match(self.vault_id, 'ref-001',
                                             stale_b64, new_b64, self.write_key)
        assert result['status']  == 'conflict'
        assert result['current'] == base64.b64encode(b'commit-aaa').decode()
        assert self.service.read(self.vault_id, 'ref-001') == b'commit-aaa'      # Unchanged

    def test__write_if_match__first_write_with_no_existing(self):
        """CAS write to nonexistent file with match=None succeeds."""
        new_b64 = base64.b64encode(b'first-commit').decode()

        result = self.service.write_if_match(self.vault_id, 'ref-new',
                                             None, new_b64, self.write_key)
        assert result['status'] == 'ok'
        assert self.service.read(self.vault_id, 'ref-new') == b'first-commit'

    def test__write_if_match__conflict_when_file_exists_but_match_is_none(self):
        """CAS write fails when file exists but match=None (expects no file)."""
        self.service.write(self.vault_id, 'ref-001', self.write_key, b'existing')

        new_b64 = base64.b64encode(b'overwrite').decode()
        result  = self.service.write_if_match(self.vault_id, 'ref-001',
                                              None, new_b64, self.write_key)
        assert result['status'] == 'conflict'

    def test__write_if_match__wrong_key_rejected(self):
        """CAS write rejected when write key doesn't match vault."""
        self.service.write(self.vault_id, 'ref-001', self.write_key, b'data')

        result = self.service.write_if_match(self.vault_id, 'ref-001',
                                             base64.b64encode(b'data').decode(),
                                             base64.b64encode(b'new').decode(),
                                             'wrong-key')
        assert result is None

    # === list_files ===

    def test__list_files__empty_vault(self):
        result = self.service.list_files(self.vault_id)
        assert result['vault_id'] == self.vault_id
        assert result['prefix']   == ''
        assert result['files']    == []

    def test__list_files__returns_file_ids(self):
        self.service.write(self.vault_id, 'bare/data/obj-aaa', self.write_key, b'blob-a')
        self.service.write(self.vault_id, 'bare/data/obj-bbb', self.write_key, b'blob-b')
        self.service.write(self.vault_id, 'bare/refs/ref-001', self.write_key, b'ref-data')

        result = self.service.list_files(self.vault_id)
        files  = sorted(result['files'])
        assert 'bare/data/obj-aaa' in files
        assert 'bare/data/obj-bbb' in files
        assert 'bare/refs/ref-001' in files
        assert len(files) == 3

    def test__list_files__with_prefix(self):
        self.service.write(self.vault_id, 'bare/data/obj-aaa', self.write_key, b'blob')
        self.service.write(self.vault_id, 'bare/refs/ref-001', self.write_key, b'ref')
        self.service.write(self.vault_id, 'bare/keys/key-001', self.write_key, b'key')

        result = self.service.list_files(self.vault_id, prefix='bare/data/')
        assert result['files'] == ['bare/data/obj-aaa']

        result = self.service.list_files(self.vault_id, prefix='bare/refs/')
        assert result['files'] == ['bare/refs/ref-001']

    def test__list_files__no_matches(self):
        self.service.write(self.vault_id, 'bare/data/obj-aaa', self.write_key, b'blob')
        result = self.service.list_files(self.vault_id, prefix='bare/pending/')
        assert result['files'] == []

    def test__list_files__excludes_manifest(self):
        self.service.write(self.vault_id, 'some-file', self.write_key, b'data')
        result = self.service.list_files(self.vault_id)
        assert 'manifest.json' not in result['files']

    def test__list_files__vault_isolation(self):
        self.service.write('vault-a', 'file-1', self.write_key, b'a')
        self.service.write('vault-b', 'file-1', self.write_key, b'b')
        result = self.service.list_files('vault-a')
        assert result['files'] == ['file-1']

    # === batch ===

    def test__batch__write_multiple(self):
        operations = [
            dict(op='write', file_id='bare/data/obj-aaa', data=base64.b64encode(b'blob-a').decode()),
            dict(op='write', file_id='bare/data/obj-bbb', data=base64.b64encode(b'blob-b').decode()),
            dict(op='write', file_id='bare/refs/ref-001', data=base64.b64encode(b'ref-data').decode()),
        ]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert result is not None
        assert result['vault_id'] == self.vault_id
        assert len(result['results']) == 3
        assert all(r['status'] == 'ok' for r in result['results'])

        # Verify data was written
        assert self.service.read(self.vault_id, 'bare/data/obj-aaa') == b'blob-a'
        assert self.service.read(self.vault_id, 'bare/data/obj-bbb') == b'blob-b'
        assert self.service.read(self.vault_id, 'bare/refs/ref-001') == b'ref-data'

    def test__batch__write_if_match_success(self):
        """Batch with write-if-match succeeds when ref matches."""
        self.service.write(self.vault_id, 'bare/refs/ref-001', self.write_key, b'commit-aaa')

        operations = [
            dict(op='write', file_id='bare/data/obj-new', data=base64.b64encode(b'new-blob').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-001',
                 match=base64.b64encode(b'commit-aaa').decode(),
                 data=base64.b64encode(b'commit-bbb').decode()),
        ]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert len(result['results']) == 2
        assert result['results'][0]['status'] == 'ok'
        assert result['results'][1]['status'] == 'ok'
        assert self.service.read(self.vault_id, 'bare/refs/ref-001') == b'commit-bbb'

    def test__batch__write_if_match_conflict_stops(self):
        """Batch stops on write-if-match conflict — subsequent ops not executed."""
        self.service.write(self.vault_id, 'bare/refs/ref-001', self.write_key, b'commit-aaa')

        operations = [
            dict(op='write', file_id='bare/data/obj-1', data=base64.b64encode(b'blob-1').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-001',
                 match=base64.b64encode(b'wrong-commit').decode(),
                 data=base64.b64encode(b'commit-bbb').decode()),
            dict(op='write', file_id='bare/data/obj-2', data=base64.b64encode(b'blob-2').decode()),
        ]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert len(result['results']) == 2                                       # Third op not executed
        assert result['results'][0]['status'] == 'ok'                            # First write succeeded
        assert result['results'][1]['status'] == 'conflict'                      # CAS failed
        assert self.service.read(self.vault_id, 'bare/data/obj-1') == b'blob-1' # First op committed
        assert self.service.read(self.vault_id, 'bare/data/obj-2') is None      # Third op skipped
        assert self.service.read(self.vault_id, 'bare/refs/ref-001') == b'commit-aaa'  # Ref unchanged

    def test__batch__delete(self):
        self.service.write(self.vault_id, 'bare/data/obj-old', self.write_key, b'old-blob')
        operations = [
            dict(op='delete', file_id='bare/data/obj-old'),
        ]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert result['results'][0]['status'] == 'ok'
        assert self.service.read(self.vault_id, 'bare/data/obj-old') is None

    def test__batch__wrong_key_rejected(self):
        """Batch rejected when vault manifest exists with different write key."""
        self.service.write(self.vault_id, 'setup', self.write_key, b'setup')     # Create manifest with correct key
        operations = [dict(op='write', file_id='file-1', data=base64.b64encode(b'data').decode())]
        result = self.service.batch(self.vault_id, operations, 'wrong-key')
        assert result is None

    def test__batch__mixed_operations(self):
        """Full push simulation: write blobs + trees + commit, then CAS the ref."""
        operations = [
            dict(op='write', file_id='bare/data/obj-blob1', data=base64.b64encode(b'file-content').decode()),
            dict(op='write', file_id='bare/data/obj-tree1', data=base64.b64encode(b'tree-data').decode()),
            dict(op='write', file_id='bare/data/obj-commit1', data=base64.b64encode(b'commit-data').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-current',
                 match=None,                                                     # No existing ref (first push)
                 data=base64.b64encode(b'obj-commit1').decode()),
        ]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert len(result['results']) == 4
        assert all(r['status'] == 'ok' for r in result['results'])
        assert self.service.read(self.vault_id, 'bare/refs/ref-current') == b'obj-commit1'

    def test__batch__delete_not_found(self):
        """Deleting a nonexistent file in batch returns not_found (not an error)."""
        self.service.write(self.vault_id, 'setup', self.write_key, b'setup')     # Create manifest
        operations = [dict(op='delete', file_id='bare/data/ghost')]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert result['results'][0]['status'] == 'not_found'

    # --- Batch read (no auth) ---

    def test__batch_read__single_file(self):
        """Read a single file via batch_read — returns base64 data."""
        self.service.write(self.vault_id, 'bare/data/obj-abc', self.write_key, b'\xde\xad')
        operations = [dict(op='read', file_id='bare/data/obj-abc')]
        result = self.service.batch_read(self.vault_id, operations)
        assert result['vault_id']             == self.vault_id
        assert len(result['results'])         == 1
        assert result['results'][0]['status'] == 'ok'
        assert result['results'][0]['data']   == base64.b64encode(b'\xde\xad').decode('ascii')

    def test__batch_read__multiple_files(self):
        """Read multiple files in one batch_read call."""
        files = {'bare/refs/ref-main': b'commit1', 'bare/data/obj-a': b'blob-a', 'bare/data/obj-b': b'blob-b'}
        for fid, data in files.items():
            self.service.write(self.vault_id, fid, self.write_key, data)
        operations = [dict(op='read', file_id=fid) for fid in files]
        result = self.service.batch_read(self.vault_id, operations)
        assert len(result['results']) == 3
        for i, (fid, data) in enumerate(files.items()):
            assert result['results'][i]['file_id'] == fid
            assert result['results'][i]['status']  == 'ok'
            assert result['results'][i]['data']    == base64.b64encode(data).decode('ascii')

    def test__batch_read__not_found(self):
        """Reading a nonexistent file in batch_read returns not_found."""
        operations = [dict(op='read', file_id='bare/data/ghost')]
        result = self.service.batch_read(self.vault_id, operations)
        assert result['results'][0]['status'] == 'not_found'
        assert 'data' not in result['results'][0]

    def test__batch__read_op_in_mixed_batch(self):
        """Read ops work inside authenticated mixed batch alongside writes."""
        self.service.write(self.vault_id, 'bare/data/existing', self.write_key, b'hello')
        operations = [dict(op='read', file_id='bare/data/existing'),
                      dict(op='write', file_id='bare/data/new-obj', data=base64.b64encode(b'world').decode())]
        result = self.service.batch(self.vault_id, operations, self.write_key)
        assert result['results'][0]['status'] == 'ok'
        assert result['results'][0]['data']   == base64.b64encode(b'hello').decode('ascii')
        assert result['results'][1]['status'] == 'ok'

    # === delete_vault ===

    def test__delete_vault__success(self):
        self.service.write(self.vault_id, 'bare/data/obj-a', self.write_key, b'blob-a')
        self.service.write(self.vault_id, 'bare/refs/ref-1', self.write_key, b'ref')
        result = self.service.delete_vault(self.vault_id, self.write_key)
        assert result is not None
        assert result['status']        == 'deleted'
        assert result['vault_id']      == self.vault_id
        assert result['files_deleted'] > 0
        assert self.service.read(self.vault_id, 'bare/data/obj-a') is None
        assert self.service.read(self.vault_id, 'bare/refs/ref-1') is None

    def test__delete_vault__wrong_key_rejected(self):
        self.service.write(self.vault_id, 'bare/data/obj-a', self.write_key, b'blob-a')
        result = self.service.delete_vault(self.vault_id, 'wrong-key')
        assert result is None
        assert self.service.read(self.vault_id, 'bare/data/obj-a') == b'blob-a'  # Untouched

    def test__delete_vault__never_existed_returns_success(self):
        result = self.service.delete_vault(self.vault_id, self.write_key)
        assert result is not None
        assert result['status']        == 'deleted'
        assert result['files_deleted'] == 0

    def test__delete_vault__clears_manifest_cache(self):
        self.service.write(self.vault_id, 'file-1', self.write_key, b'data')
        assert self.vault_id in self.service._manifest_cache              # Cache populated after write
        self.service.delete_vault(self.vault_id, self.write_key)
        assert self.vault_id not in self.service._manifest_cache          # Cache cleared after delete

    def test__delete_vault__vault_reusable_after_delete(self):
        self.service.write(self.vault_id, 'old-file', self.write_key, b'old')
        self.service.delete_vault(self.vault_id, self.write_key)
        result = self.service.write(self.vault_id, 'new-file', 'new-key', b'new')
        assert result is not None
        assert result['status'] == 'completed'
        assert self.service.read(self.vault_id, 'new-file') == b'new'

    def test__delete_vault__files_deleted_count(self):
        for i in range(5):
            self.service.write(self.vault_id, f'file-{i}', self.write_key, f'data-{i}'.encode())
        result = self.service.delete_vault(self.vault_id, self.write_key)
        assert result['files_deleted'] == 6                               # 5 payload files + manifest
