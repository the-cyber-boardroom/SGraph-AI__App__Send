import os
import tempfile

from starlette.testclient                                                       import TestClient
from sgraph_ai_app_send__docker.Fast_API__SGraph__Send__Container               import Fast_API__SGraph__Send__Container
from sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                import Enum__Storage__Mode
from unittest                                                                   import TestCase


class test_Container__App(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.container_app = Fast_API__SGraph__Send__Container()
        cls.container_app.setup()
        cls.client = TestClient(cls.container_app.app())

    def test__health(self):
        response = self.client.get('/info/health')
        assert response.status_code == 200

    def test__info_status(self):
        response = self.client.get('/info/status')
        assert response.status_code == 200

    def test__root_redirects_to_ui(self):
        response = self.client.get('/', follow_redirects=False)
        assert response.status_code == 307
        assert '/send/' in response.headers['location']

    def test__static_ui_served(self):
        response = self.client.get('/send/v0/v0.2/v0.2.0/index.html')
        assert response.status_code == 200
        assert 'text/html' in response.headers['content-type']

    def test__api_transfers_create(self):
        response = self.client.post('/api/transfers/create', json={'size': 1024})
        assert response.status_code == 200
        data = response.json()
        assert 'transfer_id' in data

    def test__api_vault_write_read(self):
        vault_id = 'testvault1234'
        file_id  = 'test-file.bin'
        payload  = b'encrypted-content-here'
        headers  = {'x-sgraph-vault-write-key': 'test-write-key'}
        response = self.client.put(f'/api/vault/write/{vault_id}/{file_id}', content=payload, headers=headers)
        assert response.status_code == 200

        response = self.client.get(f'/api/vault/read/{vault_id}/{file_id}')
        assert response.status_code == 200
        assert response.content == payload

    def test__auth_cookie_form_available(self):
        response = self.client.get('/auth/set-cookie-form')
        assert response.status_code == 200
        assert 'Auth Cookie Editor' in response.text

    def test__openapi_docs(self):
        response = self.client.get('/api/docs')
        assert response.status_code == 200



class test_Container__App__Disk_Storage(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp_dir = tempfile.mkdtemp()
        os.environ['SEND__STORAGE_MODE'] = 'disk'
        os.environ['SEND__DISK_PATH'] = cls.tmp_dir
        cls.container_app = Fast_API__SGraph__Send__Container()
        cls.container_app.setup()
        cls.client = TestClient(cls.container_app.app())

    @classmethod
    def tearDownClass(cls):
        del os.environ['SEND__STORAGE_MODE']
        del os.environ['SEND__DISK_PATH']

    def test__storage_mode_is_disk(self):
        assert self.container_app.send_config.storage_mode == Enum__Storage__Mode.DISK

    def test__vault_persists_to_disk(self):
        vault_id = 'diskvault123'
        file_id  = 'persist.bin'
        payload  = b'persistent-data'
        headers  = {'x-sgraph-vault-write-key': 'test-write-key'}
        self.client.put(f'/api/vault/write/{vault_id}/{file_id}', content=payload, headers=headers)

        response = self.client.get(f'/api/vault/read/{vault_id}/{file_id}')
        assert response.status_code == 200
        assert response.content == payload
