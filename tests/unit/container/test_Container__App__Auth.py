import os

from starlette.testclient                                                       import TestClient
from sgraph_ai_app_send__docker.Fast_API__SGraph__Send__Container               import Fast_API__SGraph__Send__Container
from unittest                                                                   import TestCase


class test_Container__App__Auth(TestCase):

    @classmethod
    def setUpClass(cls):
        os.environ['SGRAPH_SEND__ACCESS_TOKEN'] = 'test-secret-token'
        cls.container_app = Fast_API__SGraph__Send__Container()
        cls.container_app.setup()
        cls.client = TestClient(cls.container_app.app())

    @classmethod
    def tearDownClass(cls):
        os.environ.pop('SGRAPH_SEND__ACCESS_TOKEN', None)
        os.environ.pop('FAST_API__AUTH__API_KEY__NAME', None)
        os.environ.pop('FAST_API__AUTH__API_KEY__VALUE', None)

    def test__1__unauthenticated_blocked(self):
        response = self.client.get('/info/health')
        assert response.status_code == 401

    def test__2__static_ui_blocked_without_token(self):
        response = self.client.get('/send/v0/v0.2/v0.2.0/index.html')
        assert response.status_code == 401

    def test__3__invalid_token_rejected(self):
        headers = {'x-sgraph-access-token': 'wrong-token'}
        response = self.client.get('/info/health', headers=headers)
        assert response.status_code == 401

    def test__4__auth_cookie_form_excluded(self):
        response = self.client.get('/auth/set-cookie-form')
        assert response.status_code == 200

    def test__5__authenticated_via_header(self):
        headers = {'x-sgraph-access-token': 'test-secret-token'}
        response = self.client.get('/info/health', headers=headers)
        assert response.status_code == 200

    def test__6__authenticated_static_ui(self):
        headers = {'x-sgraph-access-token': 'test-secret-token'}
        response = self.client.get('/send/v0/v0.2/v0.2.0/index.html', headers=headers)
        assert response.status_code == 200

    def test__7__cookie_auth_works(self):
        self.client.post('/auth/set-auth-cookie',
                         json={'cookie_value': 'test-secret-token'})
        response = self.client.get('/info/health')
        assert response.status_code == 200
