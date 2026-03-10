# ===============================================================================
# SGraph Send - Routes__Vault__Pointer Tests
# Full vault file API lifecycle via the shared FastAPI test client
# ===============================================================================

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

    # --- Write endpoint ---

    def test__write__first_time(self):
        response = self._write(file_id='write-test-1')
        assert response.status_code == 200
        data = response.json()
        assert data['file_id']     == 'write-test-1'
        assert data['vault_id']    == VAULT_ID
        assert data['status']      == 'completed'
        assert data['write_count'] == 1

    def test__write__overwrite(self):
        self._write(file_id='write-test-2', payload=b'v1')
        response = self._write(file_id='write-test-2', payload=b'v2')
        assert response.status_code == 200
        assert response.json()['write_count'] == 2

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
        import base64
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
        assert write1.json()['write_count'] == 1

        # Read v1
        read1 = self._read(file_id=fid)
        assert read1.content == payload_v1

        # Overwrite with v2
        write2 = self._write(file_id=fid, payload=payload_v2)
        assert write2.json()['write_count'] == 2

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
        self._write(vault_id='vault-aaa', file_id='shared-id', payload=b'vault-a')
        self._write(vault_id='vault-bbb', file_id='shared-id', payload=b'vault-b')

        assert self._read(vault_id='vault-aaa', file_id='shared-id').content == b'vault-a'
        assert self._read(vault_id='vault-bbb', file_id='shared-id').content == b'vault-b'

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
