# ===============================================================================
# SGraph Send - Routes__Vault__Presigned Tests
# Vault presigned URL endpoints — memory mode returns 400 (not available)
# Write-key and access-token auth validation
# ===============================================================================

import json
from unittest                                                                        import TestCase
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User            import setup__fast_api__user__test_objs

VAULT_ID  = 'a1b2c3d4'
FILE_ID   = 'bare/data/abc123'
WRITE_KEY = 'deadbeef1234567890abcdef'


class test_Routes__Vault__Presigned(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    def _create_vault(self):
        """Create a vault so write-key auth can succeed."""
        self.client.put(f'/api/vault/write/{VAULT_ID}/{FILE_ID}',
                        content = b'encrypted-data',
                        headers = {'content-type'             : 'application/octet-stream',
                                   'x-sgraph-vault-write-key' : WRITE_KEY                 })

    # =========================================================================
    # POST /vault/presigned/initiate/{vault_id} — memory mode
    # =========================================================================

    def test__initiate__memory_mode(self):
        self._create_vault()
        response = self.client.post(f'/api/vault/presigned/initiate/{VAULT_ID}',
                                    content = json.dumps({'file_id'         : FILE_ID,
                                                          'file_size_bytes' : 5000000,
                                                          'num_parts'       : 1      }),
                                    headers = {'content-type'             : 'application/json',
                                               'x-sgraph-vault-write-key' : WRITE_KEY         })
        assert response.status_code == 400

    def test__initiate__missing_write_key(self):
        response = self.client.post(f'/api/vault/presigned/initiate/{VAULT_ID}',
                                    content = json.dumps({'file_id'         : FILE_ID,
                                                          'file_size_bytes' : 5000000,
                                                          'num_parts'       : 1      }),
                                    headers = {'content-type': 'application/json'})
        assert response.status_code == 400
        assert 'write key' in response.json()['detail'].lower()

    # =========================================================================
    # POST /vault/presigned/complete/{vault_id} — memory mode
    # =========================================================================

    def test__complete__memory_mode(self):
        self._create_vault()
        response = self.client.post(f'/api/vault/presigned/complete/{VAULT_ID}',
                                    content = json.dumps({'file_id'   : FILE_ID       ,
                                                          'upload_id' : 'fake-upload'  ,
                                                          'parts'     : []             }),
                                    headers = {'content-type'             : 'application/json',
                                               'x-sgraph-vault-write-key' : WRITE_KEY         })
        assert response.status_code == 400

    def test__complete__missing_write_key(self):
        response = self.client.post(f'/api/vault/presigned/complete/{VAULT_ID}',
                                    content = json.dumps({'file_id'   : FILE_ID       ,
                                                          'upload_id' : 'fake-upload'  ,
                                                          'parts'     : []             }),
                                    headers = {'content-type': 'application/json'})
        assert response.status_code == 400
        assert 'write key' in response.json()['detail'].lower()

    # =========================================================================
    # POST /vault/presigned/cancel/{vault_id} — memory mode
    # =========================================================================

    def test__cancel__memory_mode(self):
        self._create_vault()
        response = self.client.post(f'/api/vault/presigned/cancel/{VAULT_ID}',
                                    content = json.dumps({'upload_id' : 'fake-upload',
                                                          'file_id'   : FILE_ID      }),
                                    headers = {'content-type'             : 'application/json',
                                               'x-sgraph-vault-write-key' : WRITE_KEY         })
        assert response.status_code == 400

    def test__cancel__missing_write_key(self):
        response = self.client.post(f'/api/vault/presigned/cancel/{VAULT_ID}',
                                    content = json.dumps({'upload_id' : 'fake-upload',
                                                          'file_id'   : FILE_ID      }),
                                    headers = {'content-type': 'application/json'})
        assert response.status_code == 400
        assert 'write key' in response.json()['detail'].lower()

    # =========================================================================
    # GET /vault/presigned/read-url/{vault_id}/{file_id} — memory mode
    # =========================================================================

    def test__read_url__memory_mode(self):
        response = self.client.get(f'/api/vault/presigned/read-url/{VAULT_ID}/{FILE_ID}')
        assert response.status_code == 400

    def test__read_url__no_auth_required(self):
        """read-url should not require write-key or access-token (data is encrypted)."""
        response = self.client.get(f'/api/vault/presigned/read-url/{VAULT_ID}/{FILE_ID}')
        assert response.status_code != 401
        assert response.status_code != 403
