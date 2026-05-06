# ===============================================================================
# SGraph Send - Routes__Vault__Pointer Tests
# Full vault file API lifecycle via the shared FastAPI test client
# Including batch and list endpoint tests
# ===============================================================================

import base64
import json
from unittest                                                                    import TestCase
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs

VAULT_ID  = 'a1b2c3d4'
FILE_ID   = 'f5e6d7c8b9a0'
WRITE_KEY = 'deadbeef1234567890abcdef'


class test_Routes__Vault__Pointer(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    def _write(self, vault_id=VAULT_ID, file_id=FILE_ID, write_key=WRITE_KEY, payload=b'encrypted-data'):
        return self.client.put(f'/api/vault/write/{vault_id}/{file_id}',
                               content = payload,
                               headers = {'content-type'              : 'application/octet-stream',
                                          'x-sgraph-vault-write-key'  : write_key                 })

    def _read(self, vault_id=VAULT_ID, file_id=FILE_ID):
        return self.client.get(f'/api/vault/read/{vault_id}/{file_id}')

    def _read_base64(self, vault_id=VAULT_ID, file_id=FILE_ID):
        return self.client.get(f'/api/vault/read-base64/{vault_id}/{file_id}')

    def _delete(self, vault_id=VAULT_ID, file_id=FILE_ID, write_key=WRITE_KEY):
        return self.client.delete(f'/api/vault/delete/{vault_id}/{file_id}',
                                  headers = {'x-sgraph-vault-write-key': write_key})

    def _batch(self, vault_id=VAULT_ID, operations=None, write_key=WRITE_KEY):
        return self.client.post(f'/api/vault/batch/{vault_id}',
                                content = json.dumps({'operations': operations or []}),
                                headers = {'content-type'             : 'application/json'     ,
                                           'x-sgraph-vault-write-key' : write_key              })

    def _list(self, vault_id=VAULT_ID, prefix=''):
        params = {'prefix': prefix} if prefix else {}
        return self.client.get(f'/api/vault/list/{vault_id}', params=params)

    # --- Write endpoint ---

    def test__write__first_time(self):
        response = self._write(file_id='write-test-1')
        assert response.status_code == 200
        data = response.json()
        assert data['file_id']     == 'write-test-1'
        assert data['vault_id']    == VAULT_ID
        assert data['status']      == 'completed'

    def test__write__overwrite(self):
        self._write(file_id='write-test-2', payload=b'v1')
        response = self._write(file_id='write-test-2', payload=b'v2')
        assert response.status_code == 200
        assert response.json()['status'] == 'completed'

        # Verify content was updated
        read = self._read(file_id='write-test-2')
        assert read.content == b'v2'

    def test__write__wrong_key_rejects(self):
        self._write(file_id='write-test-3')
        response = self._write(file_id='write-test-3', write_key='wrongkey')
        assert response.status_code == 403

    def test__write__missing_write_key(self):
        response = self.client.put(f'/api/vault/write/{VAULT_ID}/test-no-key',
                                   content = b'data',
                                   headers = {'content-type': 'application/octet-stream'})
        assert response.status_code == 400

    def test__write__empty_payload(self):
        response = self.client.put(f'/api/vault/write/{VAULT_ID}/test-empty',
                                   content = b'',
                                   headers = {'content-type'             : 'application/octet-stream',
                                              'x-sgraph-vault-write-key' : WRITE_KEY                 })
        assert response.status_code == 400

    # --- Read endpoint ---

    def test__read__existing(self):
        payload = b'\x89PNG\x00\x01\x02\x03'
        self._write(file_id='read-test-1', payload=payload)
        response = self._read(file_id='read-test-1')
        assert response.status_code           == 200
        assert response.content               == payload
        assert response.headers['content-type'] == 'application/octet-stream'

    def test__read__not_found(self):
        response = self._read(file_id='nonexistent')
        assert response.status_code == 404

    # --- Read-base64 endpoint (MCP-compatible) ---

    def test__read_base64__existing(self):
        payload = b'\x89PNG\x00\x01\x02\x03'
        self._write(file_id='read-b64-1', payload=payload)
        response = self._read_base64(file_id='read-b64-1')
        assert response.status_code == 200
        data = response.json()
        assert data['vault_id']        == VAULT_ID
        assert data['file_id']         == 'read-b64-1'
        assert data['size'] == len(payload)
        assert base64.b64decode(data['data']) == payload

    def test__read_base64__not_found(self):
        response = self._read_base64(file_id='nonexistent-b64')
        assert response.status_code == 404

    def test__read_base64__no_auth_required(self):
        self._write(file_id='read-b64-noauth')
        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        response = unauthenticated.get(f'/api/vault/read-base64/{VAULT_ID}/read-b64-noauth')
        assert response.status_code == 200
        assert response.json()['size'] > 0

    def test__read__no_auth_required(self):
        """Read endpoint requires no access token (zero-knowledge model)."""
        self._write(file_id='read-noauth')
        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        response = unauthenticated.get(f'/api/vault/read/{VAULT_ID}/read-noauth')
        assert response.status_code == 200
        assert response.content     == b'encrypted-data'

    # --- Delete endpoint ---

    def test__delete__correct_key(self):
        self._write(file_id='del-test-1')
        response = self._delete(file_id='del-test-1')
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'deleted'

        # Confirm file is gone
        assert self._read(file_id='del-test-1').status_code == 404

    def test__delete__wrong_key(self):
        self._write(file_id='del-test-2')
        response = self._delete(file_id='del-test-2', write_key='wrongkey')
        assert response.status_code == 403

        # File still accessible
        assert self._read(file_id='del-test-2').status_code == 200

    def test__delete__not_found(self):
        response = self._delete(file_id='nonexistent')
        assert response.status_code == 403                                       # Returns 403 (not 404) to avoid vault enumeration

    def test__delete__missing_write_key(self):
        self._write(file_id='del-test-3')
        response = self.client.delete(f'/api/vault/delete/{VAULT_ID}/del-test-3')
        assert response.status_code == 400

    # --- Full lifecycle ---

    def test__full_lifecycle(self):
        fid = 'lifecycle-test'
        payload_v1 = b'encrypted-tree-v1'
        payload_v2 = b'encrypted-tree-v2'

        # Write v1
        write1 = self._write(file_id=fid, payload=payload_v1)
        assert write1.status_code == 200
        assert write1.json()['status'] == 'completed'

        # Read v1
        read1 = self._read(file_id=fid)
        assert read1.content == payload_v1

        # Overwrite with v2
        write2 = self._write(file_id=fid, payload=payload_v2)
        assert write2.json()['status'] == 'completed'

        # Read v2
        read2 = self._read(file_id=fid)
        assert read2.content == payload_v2

        # Reject overwrite with wrong key
        bad_write = self._write(file_id=fid, write_key='badkey', payload=b'tampered')
        assert bad_write.status_code == 403

        # Content unchanged after bad write
        assert self._read(file_id=fid).content == payload_v2

        # Delete
        delete = self._delete(file_id=fid)
        assert delete.status_code == 200
        assert delete.json()['status'] == 'deleted'

        # Gone
        assert self._read(file_id=fid).status_code == 404

    # --- Vault isolation ---

    def test__vault_isolation(self):
        """Files in different vaults are independent."""
        self._write(vault_id='vaultaaaa0001', file_id='shared-id', payload=b'vault-a')
        self._write(vault_id='vaultbbbb0001', file_id='shared-id', payload=b'vault-b')

        assert self._read(vault_id='vaultaaaa0001', file_id='shared-id').content == b'vault-a'
        assert self._read(vault_id='vaultbbbb0001', file_id='shared-id').content == b'vault-b'

    # --- Multiple files in vault ---

    def test__multiple_files(self):
        self._write(file_id='multi-1', payload=b'file-1')
        self._write(file_id='multi-2', payload=b'file-2')
        self._write(file_id='multi-3', payload=b'file-3')

        assert self._read(file_id='multi-1').content == b'file-1'
        assert self._read(file_id='multi-2').content == b'file-2'
        assert self._read(file_id='multi-3').content == b'file-3'

        # Delete one doesn't affect others
        self._delete(file_id='multi-2')
        assert self._read(file_id='multi-1').status_code == 200
        assert self._read(file_id='multi-2').status_code == 404
        assert self._read(file_id='multi-3').status_code == 200

    # --- Security: write key not leaked in responses ---

    def test__write_key_not_in_response(self):
        response = self._write(file_id='sec-test')
        data = response.json()
        assert 'write_key'      not in data
        assert 'write_key_hash' not in data
        assert WRITE_KEY        not in str(data)

    # --- Large payload (binary) ---

    def test__binary_payload_roundtrip(self):
        """Verify raw binary (simulating AES-256-GCM ciphertext) survives roundtrip."""
        payload = bytes(range(256)) * 100                                        # 25.6KB of all byte values
        self._write(file_id='binary-test', payload=payload)
        read = self._read(file_id='binary-test')
        assert read.content == payload

    # === Batch endpoint ===

    def test__batch__write_objects(self):
        ops = [
            dict(op='write', file_id='bare/data/obj-r1', data=base64.b64encode(b'blob-1').decode()),
            dict(op='write', file_id='bare/data/obj-r2', data=base64.b64encode(b'blob-2').decode()),
        ]
        response = self._batch(vault_id='batchvault001', operations=ops)
        assert response.status_code == 200
        data = response.json()
        assert len(data['results']) == 2
        assert all(r['status'] == 'ok' for r in data['results'])

    def test__batch__write_if_match_success(self):
        # Set up initial ref via batch (slashed file_ids require batch, not individual PUT)
        vault = 'batchvault002'
        setup_ops = [dict(op='write', file_id='bare/refs/ref-001',
                          data=base64.b64encode(b'commit-aaa').decode())]
        self._batch(vault_id=vault, operations=setup_ops)

        ops = [
            dict(op='write-if-match', file_id='bare/refs/ref-001',
                 match=base64.b64encode(b'commit-aaa').decode(),
                 data=base64.b64encode(b'commit-bbb').decode()),
        ]
        response = self._batch(vault_id=vault, operations=ops)
        assert response.status_code == 200
        assert response.json()['results'][0]['status'] == 'ok'

    def test__batch__write_if_match_conflict(self):
        vault = 'batchvault003'
        setup_ops = [dict(op='write', file_id='bare/refs/ref-001',
                          data=base64.b64encode(b'commit-aaa').decode())]
        self._batch(vault_id=vault, operations=setup_ops)

        ops = [
            dict(op='write-if-match', file_id='bare/refs/ref-001',
                 match=base64.b64encode(b'stale').decode(),
                 data=base64.b64encode(b'new').decode()),
        ]
        response = self._batch(vault_id=vault, operations=ops)
        assert response.status_code == 200
        data = response.json()
        assert data['results'][0]['status']  == 'conflict'
        assert data['results'][0]['current'] == base64.b64encode(b'commit-aaa').decode()

    def test__batch__missing_write_key(self):
        response = self.client.post(f'/api/vault/batch/{VAULT_ID}',
                                    content = json.dumps({'operations': []}),
                                    headers = {'content-type': 'application/json'})
        assert response.status_code == 400

    def test__batch__no_operations(self):
        response = self._batch(operations=[])
        assert response.status_code == 400

    def test__batch__wrong_key(self):
        # First create the vault with correct key
        self._write(vault_id='batchvault004', file_id='setup', payload=b'setup')
        ops = [dict(op='write', file_id='file-1', data=base64.b64encode(b'data').decode())]
        response = self._batch(vault_id='batchvault004', operations=ops, write_key='wrong-key')
        assert response.status_code == 403

    def test__batch__push_simulation(self):
        """Simulate a full push: write blobs + tree + commit, CAS the ref."""
        vault = 'pushsimvault1'
        ops = [
            dict(op='write', file_id='bare/data/obj-blob1',   data=base64.b64encode(b'file-content').decode()),
            dict(op='write', file_id='bare/data/obj-tree1',   data=base64.b64encode(b'tree-json').decode()),
            dict(op='write', file_id='bare/data/obj-commit1', data=base64.b64encode(b'commit-json').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-current',
                 match=None,
                 data=base64.b64encode(b'obj-commit1').decode()),
        ]
        response = self._batch(vault_id=vault, operations=ops)
        assert response.status_code == 200
        results = response.json()['results']
        assert len(results) == 4
        assert all(r['status'] == 'ok' for r in results)

        # Verify via list endpoint (slashed file_ids can't be read via individual GET)
        list_response = self._list(vault_id=vault, prefix='bare/data/')
        files = sorted(list_response.json()['files'])
        assert 'bare/data/obj-blob1'   in files
        assert 'bare/data/obj-tree1'   in files
        assert 'bare/data/obj-commit1' in files

        ref_response = self._list(vault_id=vault, prefix='bare/refs/')
        assert 'bare/refs/ref-current' in ref_response.json()['files']

    # === List endpoint ===

    def test__list__empty_vault(self):
        response = self._list(vault_id='listemptyvlt1')
        assert response.status_code == 200
        data = response.json()
        assert data['vault_id'] == 'listemptyvlt1'
        assert data['files']    == []

    def test__list__returns_files(self):
        vault = 'listvault0001'
        # Write files via batch (slashed file_ids require batch)
        ops = [
            dict(op='write', file_id='bare/data/obj-aaa', data=base64.b64encode(b'a').decode()),
            dict(op='write', file_id='bare/data/obj-bbb', data=base64.b64encode(b'b').decode()),
            dict(op='write', file_id='bare/refs/ref-001', data=base64.b64encode(b'r').decode()),
        ]
        self._batch(vault_id=vault, operations=ops)

        response = self._list(vault_id=vault)
        assert response.status_code == 200
        files = sorted(response.json()['files'])
        assert len(files) == 3
        assert 'bare/data/obj-aaa' in files
        assert 'bare/refs/ref-001' in files

    def test__list__with_prefix(self):
        vault = 'listvault0002'
        ops = [
            dict(op='write', file_id='bare/data/obj-aaa', data=base64.b64encode(b'a').decode()),
            dict(op='write', file_id='bare/refs/ref-001', data=base64.b64encode(b'r').decode()),
        ]
        self._batch(vault_id=vault, operations=ops)

        response = self._list(vault_id=vault, prefix='bare/data/')
        assert response.status_code == 200
        assert response.json()['files'] == ['bare/data/obj-aaa']

    def test__list__no_auth_required(self):
        """List endpoint is unauthenticated (consistent with read)."""
        vault = 'listvault0003'
        ops = [dict(op='write', file_id='bare/data/obj-xxx', data=base64.b64encode(b'x').decode())]
        self._batch(vault_id=vault, operations=ops)

        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        response = unauthenticated.get(f'/api/vault/list/{vault}')
        assert response.status_code == 200
        assert 'bare/data/obj-xxx' in response.json()['files']

    # === Batch read (no auth required) ===

    def test__batch_read__no_auth_required(self):
        """Read-only batch does not require write-key or access token."""
        vault = 'batchrdvault1'
        # Write some files first (with auth)
        ops = [dict(op='write', file_id='bare/refs/ref-main',  data=base64.b64encode(b'commit1').decode()),
               dict(op='write', file_id='bare/data/obj-aaa',   data=base64.b64encode(b'blob-a').decode()),
               dict(op='write', file_id='bare/data/obj-bbb',   data=base64.b64encode(b'blob-b').decode())]
        self._batch(vault_id=vault, operations=ops)

        # Read-only batch — no write-key, no access token
        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        read_ops = [dict(op='read', file_id='bare/refs/ref-main'),
                    dict(op='read', file_id='bare/data/obj-aaa'),
                    dict(op='read', file_id='bare/data/obj-bbb')]
        response = unauthenticated.post(f'/api/vault/batch/{vault}',
                                         content = json.dumps({'operations': read_ops}),
                                         headers = {'content-type': 'application/json'})
        assert response.status_code == 200
        results = response.json()['results']
        assert len(results) == 3
        assert all(r['status'] == 'ok' for r in results)
        assert base64.b64decode(results[0]['data']) == b'commit1'
        assert base64.b64decode(results[1]['data']) == b'blob-a'
        assert base64.b64decode(results[2]['data']) == b'blob-b'

    def test__batch_read__not_found(self):
        """Batch read of nonexistent file returns not_found status."""
        read_ops = [dict(op='read', file_id='bare/data/ghost')]
        response = self.client.post('/api/vault/batch/batchrdvault2',
                                     content = json.dumps({'operations': read_ops}),
                                     headers = {'content-type': 'application/json'})
        assert response.status_code          == 200
        assert response.json()['results'][0]['status'] == 'not_found'

    def test__batch_mixed_read_write__requires_auth(self):
        """Mixed batch with reads and writes still requires write-key."""
        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        ops = [dict(op='read',  file_id='bare/data/obj-aaa'),
               dict(op='write', file_id='bare/data/obj-bbb', data=base64.b64encode(b'x').decode())]
        response = unauthenticated.post('/api/vault/batch/batchrdvault3',
                                         content = json.dumps({'operations': ops}),
                                         headers = {'content-type': 'application/json'})
        assert response.status_code in (400, 401)                                # Missing write-key or access token

    # === Health check endpoint ===

    def test__health__existing_vault(self):
        """Health check returns ok for a vault that has been written to."""
        vault = 'healthvault01'
        self._write(vault_id=vault, file_id='setup-file', payload=b'data')       # Creates manifest
        response = self.client.get(f'/api/vault/health/{vault}')
        assert response.status_code == 200
        assert response.json()     == dict(status='ok', vault_id=vault)

    def test__health__nonexistent_vault(self):
        """Health check returns 404 for a vault that doesn't exist."""
        response = self.client.get('/api/vault/health/nosuchvault01')
        assert response.status_code == 404

    def test__health__no_auth_required(self):
        """Health check is unauthenticated — serves as Lambda warm-up."""
        vault = 'healthvault02'
        self._write(vault_id=vault, file_id='setup-file', payload=b'data')
        from starlette.testclient import TestClient
        unauthenticated = TestClient(self.client.app)
        response = unauthenticated.get(f'/api/vault/health/{vault}')
        assert response.status_code == 200

    # === Slashed file_id via individual endpoints (path converter) ===

    def test__write_read_delete__slashed_file_id(self):
        """Individual PUT/GET/DELETE endpoints support slashed file_ids via :path converter."""
        vault   = 'slashvault001'
        file_id = 'bare/data/obj-abc123'
        payload = b'content-addressed-blob'

        # Write via individual PUT
        response = self._write(vault_id=vault, file_id=file_id, payload=payload)
        assert response.status_code == 200
        assert response.json()['file_id'] == file_id

        # Read via individual GET
        response = self._read(vault_id=vault, file_id=file_id)
        assert response.status_code == 200
        assert response.content     == payload

        # Read base64 via individual GET
        response = self._read_base64(vault_id=vault, file_id=file_id)
        assert response.status_code == 200
        assert response.json()['file_id'] == file_id

        # Delete via individual DELETE
        response = self._delete(vault_id=vault, file_id=file_id)
        assert response.status_code == 200

        # Confirm deleted
        response = self._read(vault_id=vault, file_id=file_id)
        assert response.status_code == 404

    def test__read__missing_file_id__returns_400(self):
        """GET /api/vault/read/{vault_id} (no file_id) returns 400, not a redirect loop."""
        response = self.client.get('/api/vault/read/aaaabbp1')
        assert response.status_code == 400
        assert 'file_id' in response.json()['detail'].lower()

    def test__write__missing_file_id__returns_400(self):
        """PUT /api/vault/write/{vault_id} (no file_id) returns 400."""
        response = self.client.put('/api/vault/write/aaaabbp1',
                                   content = b'data',
                                   headers = {'x-sgraph-vault-write-key': 'key'})
        assert response.status_code == 400

    def test__delete__missing_file_id__returns_400(self):
        """DELETE /api/vault/delete/{vault_id} (no file_id) returns 400."""
        response = self.client.delete('/api/vault/delete/aaaabbp1',
                                      headers = {'x-sgraph-vault-write-key': 'key'})
        assert response.status_code == 400

    # === Vault ID format validation ===

    def test__write__rejects_hyphenated_vault_id(self):
        """Server rejects vault IDs containing hyphens (prevents leaking project names)."""
        response = self._write(vault_id='tools-patches', file_id='test', payload=b'data')
        assert response.status_code == 400
        assert 'opaque' in response.json()['detail'].lower()

    def test__write__rejects_uppercase_vault_id(self):
        """Server rejects vault IDs containing uppercase letters."""
        response = self._write(vault_id='MyVaultABC', file_id='test', payload=b'data')
        assert response.status_code == 400

    def test__write__rejects_short_vault_id(self):
        """Server rejects vault IDs shorter than 8 characters."""
        response = self._write(vault_id='abc1234', file_id='test', payload=b'data')
        assert response.status_code == 400

    def test__write__rejects_long_vault_id(self):
        """Server rejects vault IDs longer than 24 characters."""
        response = self._write(vault_id='a' * 25, file_id='test', payload=b'data')
        assert response.status_code == 400

    def test__read__rejects_invalid_vault_id(self):
        """Read endpoint also validates vault_id format."""
        response = self._read(vault_id='tools-patches', file_id='test')
        assert response.status_code == 400

    def test__list__rejects_invalid_vault_id(self):
        """List endpoint also validates vault_id format."""
        response = self._list(vault_id='my-project-vault')
        assert response.status_code == 400

    def test__batch__rejects_invalid_vault_id(self):
        """Batch endpoint also validates vault_id format."""
        ops = [dict(op='read', file_id='test')]
        response = self._batch(vault_id='tools-patches', operations=ops)
        assert response.status_code == 400

    def test__health__rejects_invalid_vault_id(self):
        """Health endpoint also validates vault_id format."""
        response = self.client.get('/api/vault/health/tools-patches')
        assert response.status_code == 400

    def test__write_read__deeply_nested_file_id(self):
        """File IDs with multiple slashes (e.g. bare/refs/heads/main) work."""
        vault   = 'slashvault002'
        file_id = 'bare/refs/heads/main'
        payload = b'commit-hash-ref'

        response = self._write(vault_id=vault, file_id=file_id, payload=payload)
        assert response.status_code == 200

        response = self._read(vault_id=vault, file_id=file_id)
        assert response.status_code == 200
        assert response.content == payload

    # === Vault destroy endpoint ===

    def _destroy(self, vault_id=VAULT_ID, write_key=WRITE_KEY, body_vault_id=None):
        payload = {'vault_id': body_vault_id if body_vault_id is not None else vault_id}
        return self.client.request('DELETE', f'/api/vault/destroy/{vault_id}',
                                   content = json.dumps(payload),
                                   headers = {'content-type'             : 'application/json',
                                              'x-sgraph-vault-write-key' : write_key         })

    def test__destroy__success(self):
        vault = 'destroyvlt01'
        self._write(vault_id=vault, file_id='bare/data/obj-a', payload=b'blob-a')
        self._write(vault_id=vault, file_id='bare/refs/ref-1', payload=b'ref')
        response = self._destroy(vault_id=vault)
        assert response.status_code          == 200
        data = response.json()
        assert data['status']        == 'deleted'
        assert data['vault_id']      == vault
        assert data['files_deleted'] > 0
        assert self._read(vault_id=vault, file_id='bare/data/obj-a').status_code == 404
        assert self._read(vault_id=vault, file_id='bare/refs/ref-1').status_code == 404

    def test__destroy__already_deleted_blocked_by_tombstone(self):
        vault = 'destroyvlt02'
        self._write(vault_id=vault, file_id='bare/data/obj-a', payload=b'blob')
        self._destroy(vault_id=vault)
        response = self._destroy(vault_id=vault)
        assert response.status_code == 403                               # Tombstone blocks second delete

    def test__destroy__never_existed_returns_success(self):
        response = self._destroy(vault_id='destroyvlt03')
        assert response.status_code              == 200
        assert response.json()['status']         == 'deleted'
        assert response.json()['files_deleted']  == 0

    def test__destroy__wrong_key_rejected(self):
        vault = 'destroyvlt04'
        self._write(vault_id=vault, file_id='bare/data/obj-a', payload=b'blob')
        response = self._destroy(vault_id=vault, write_key='wrongkey')
        assert response.status_code == 403
        assert self._read(vault_id=vault, file_id='bare/data/obj-a').status_code == 200

    def test__destroy__missing_write_key(self):
        vault = 'destroyvlt05'
        self._write(vault_id=vault, file_id='file', payload=b'data')
        response = self.client.request('DELETE', f'/api/vault/destroy/{vault}',
                                       content = json.dumps({'vault_id': vault}),
                                       headers = {'content-type': 'application/json'})
        assert response.status_code == 400

    def test__destroy__body_vault_id_mismatch(self):
        vault = 'destroyvlt06'
        self._write(vault_id=vault, file_id='file', payload=b'data')
        response = self._destroy(vault_id=vault, body_vault_id='destroyvlt07')
        assert response.status_code == 409
        assert self._read(vault_id=vault, file_id='file').status_code == 200

    def test__destroy__missing_body(self):
        response = self.client.request('DELETE', f'/api/vault/destroy/{VAULT_ID}',
                                       headers = {'x-sgraph-vault-write-key': WRITE_KEY})
        assert response.status_code in (400, 422)

    def test__destroy__invalid_vault_id(self):
        response = self.client.request('DELETE', '/api/vault/destroy/tools-patches',
                                       content = json.dumps({'vault_id': 'tools-patches'}),
                                       headers = {'content-type'             : 'application/json',
                                                  'x-sgraph-vault-write-key' : WRITE_KEY         })
        assert response.status_code == 400

    def test__destroy__files_gone_after_delete(self):
        vault = 'destroyvlt08'
        file_ids = ['bare/data/obj-1', 'bare/refs/ref-main', 'bare/keys/key-001']
        for fid in file_ids:
            self._write(vault_id=vault, file_id=fid, payload=b'data')
        self._destroy(vault_id=vault)
        for fid in file_ids:
            assert self._read(vault_id=vault, file_id=fid).status_code == 404

    def test__destroy__vault_not_reusable_after_delete(self):
        vault = 'destroyvlt09'
        self._write(vault_id=vault, file_id='old-file', payload=b'old')
        self._destroy(vault_id=vault)
        response = self._write(vault_id=vault, file_id='new-file', write_key='newkey456789', payload=b'new')
        assert response.status_code == 403                               # Tombstone blocks re-creation with any key
