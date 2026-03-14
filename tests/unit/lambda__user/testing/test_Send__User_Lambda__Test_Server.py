# ===============================================================================
# SGraph Send - Test the User Lambda Test Server helpers
# Verifies both in-process TestClient and real HTTP server modes
# ===============================================================================

import base64
import json
import requests
from unittest                                                                                    import TestCase
from sgraph_ai_app_send.lambda__user.testing.Send__User_Lambda__Test_Server                      import (setup__send_user_lambda__test_client ,
                                                                                                          setup__send_user_lambda__test_server )
from sgraph_ai_app_send.lambda__user.user__config                                                import (HEADER__SGRAPH_SEND__ACCESS_TOKEN   ,
                                                                                                          HEADER__SGRAPH_VAULT__WRITE_KEY     )


class test_Send__User_Lambda__Test_Client(TestCase):
    """Test in-process TestClient mode (no real HTTP)."""

    @classmethod
    def setUpClass(cls):
        cls.test_objs = setup__send_user_lambda__test_client()
        cls.client    = cls.test_objs.fast_api__client

    def test__health(self):
        response = self.client.get('/info/health')
        assert response.status_code == 200

    def test__vault_write_read(self):
        headers  = {HEADER__SGRAPH_VAULT__WRITE_KEY: self.test_objs.write_key}
        response = self.client.put('/api/vault/write/test-vault/test-file',
                                   content = b'encrypted-blob',
                                   headers = {**headers, 'content-type': 'application/octet-stream'})
        assert response.status_code == 200
        assert response.json()['status'] == 'completed'

        read = self.client.get('/api/vault/read/test-vault/test-file')
        assert read.content == b'encrypted-blob'

    def test__vault_batch(self):
        headers = {HEADER__SGRAPH_VAULT__WRITE_KEY : self.test_objs.write_key,
                   'content-type'                  : 'application/json'      }
        ops = [
            dict(op='write', file_id='bare/data/obj-tc1', data=base64.b64encode(b'blob-1').decode()),
            dict(op='write', file_id='bare/data/obj-tc2', data=base64.b64encode(b'blob-2').decode()),
        ]
        response = self.client.post('/api/vault/batch/batch-tc-vault',
                                    content = json.dumps({'operations': ops}),
                                    headers = headers)
        assert response.status_code == 200
        assert len(response.json()['results']) == 2

    def test__vault_list(self):
        # Write via batch first
        headers = {HEADER__SGRAPH_VAULT__WRITE_KEY : self.test_objs.write_key,
                   'content-type'                  : 'application/json'      }
        ops = [dict(op='write', file_id='bare/data/obj-list-tc', data=base64.b64encode(b'data').decode())]
        self.client.post('/api/vault/batch/list-tc-vault',
                         content = json.dumps({'operations': ops}),
                         headers = headers)

        response = self.client.get('/api/vault/list/list-tc-vault', params={'prefix': 'bare/data/'})
        assert response.status_code == 200
        assert 'bare/data/obj-list-tc' in response.json()['files']


class test_Send__User_Lambda__Http_Server(TestCase):
    """Test real HTTP server mode (actual TCP connections)."""

    @classmethod
    def setUpClass(cls):
        cls.server_ctx = setup__send_user_lambda__test_server()
        cls.test_objs  = cls.server_ctx.__enter__()
        cls.base_url   = cls.test_objs.server_url

    @classmethod
    def tearDownClass(cls):
        cls.server_ctx.__exit__(None, None, None)

    def auth_headers(self):
        return {HEADER__SGRAPH_SEND__ACCESS_TOKEN : self.test_objs.access_token,
                HEADER__SGRAPH_VAULT__WRITE_KEY   : self.test_objs.write_key   }

    def test__health(self):
        response = requests.get(f'{self.base_url}/info/health')
        assert response.status_code == 200

    def test__vault_write_read_via_http(self):
        headers = {**self.auth_headers(), 'content-type': 'application/octet-stream'}
        write = requests.put(f'{self.base_url}/api/vault/write/http-vault/http-file',
                             data    = b'encrypted-via-http',
                             headers = headers)
        assert write.status_code == 200
        assert write.json()['status'] == 'completed'

        read = requests.get(f'{self.base_url}/api/vault/read/http-vault/http-file')
        assert read.status_code == 200
        assert read.content     == b'encrypted-via-http'

    def test__vault_batch_via_http(self):
        headers = {**self.auth_headers(), 'content-type': 'application/json'}
        ops = [
            dict(op='write', file_id='bare/data/obj-h1', data=base64.b64encode(b'http-blob-1').decode()),
            dict(op='write', file_id='bare/data/obj-h2', data=base64.b64encode(b'http-blob-2').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-current',
                 match=None,
                 data=base64.b64encode(b'obj-commit-1').decode()),
        ]
        response = requests.post(f'{self.base_url}/api/vault/batch/http-batch-vault',
                                 json    = {'operations': ops},
                                 headers = headers)
        assert response.status_code == 200
        results = response.json()['results']
        assert len(results) == 3
        assert all(r['status'] == 'ok' for r in results)

    def test__vault_list_via_http(self):
        # Write via batch
        headers = {**self.auth_headers(), 'content-type': 'application/json'}
        ops = [
            dict(op='write', file_id='bare/data/obj-list1', data=base64.b64encode(b'd1').decode()),
            dict(op='write', file_id='bare/refs/ref-001',   data=base64.b64encode(b'r1').decode()),
        ]
        requests.post(f'{self.base_url}/api/vault/batch/http-list-vault',
                      json=dict(operations=ops), headers=headers)

        # List with prefix (no auth required)
        response = requests.get(f'{self.base_url}/api/vault/list/http-list-vault',
                                params={'prefix': 'bare/data/'})
        assert response.status_code == 200
        assert 'bare/data/obj-list1' in response.json()['files']

    def test__vault_push_simulation_via_http(self):
        """Full push simulation: write objects + CAS ref, verify via list."""
        headers = {**self.auth_headers(), 'content-type': 'application/json'}
        vault   = 'http-push-vault'

        # Push: write blob + tree + commit + CAS ref
        ops = [
            dict(op='write', file_id='bare/data/obj-blob-ps',   data=base64.b64encode(b'file-bytes').decode()),
            dict(op='write', file_id='bare/data/obj-tree-ps',   data=base64.b64encode(b'tree-json').decode()),
            dict(op='write', file_id='bare/data/obj-commit-ps', data=base64.b64encode(b'commit-json').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-current',
                 match=None, data=base64.b64encode(b'obj-commit-ps').decode()),
        ]
        push = requests.post(f'{self.base_url}/api/vault/batch/{vault}',
                             json=dict(operations=ops), headers=headers)
        assert push.status_code == 200
        assert all(r['status'] == 'ok' for r in push.json()['results'])

        # Verify: list all objects
        list_resp = requests.get(f'{self.base_url}/api/vault/list/{vault}')
        files = sorted(list_resp.json()['files'])
        assert len(files) == 4
        assert 'bare/data/obj-blob-ps'   in files
        assert 'bare/refs/ref-current'   in files

        # Second push: CAS succeeds with correct match
        ops2 = [
            dict(op='write', file_id='bare/data/obj-commit-ps2', data=base64.b64encode(b'commit-2').decode()),
            dict(op='write-if-match', file_id='bare/refs/ref-current',
                 match=base64.b64encode(b'obj-commit-ps').decode(),
                 data=base64.b64encode(b'obj-commit-ps2').decode()),
        ]
        push2 = requests.post(f'{self.base_url}/api/vault/batch/{vault}',
                              json=dict(operations=ops2), headers=headers)
        assert push2.status_code == 200
        assert all(r['status'] == 'ok' for r in push2.json()['results'])

        # Third push with stale ref: CAS fails
        ops3 = [
            dict(op='write-if-match', file_id='bare/refs/ref-current',
                 match=base64.b64encode(b'obj-commit-ps').decode(),     # stale!
                 data=base64.b64encode(b'obj-commit-ps3').decode()),
        ]
        push3 = requests.post(f'{self.base_url}/api/vault/batch/{vault}',
                              json=dict(operations=ops3), headers=headers)
        assert push3.status_code == 200
        assert push3.json()['results'][0]['status'] == 'conflict'
        assert push3.json()['results'][0]['current'] == base64.b64encode(b'obj-commit-ps2').decode()
