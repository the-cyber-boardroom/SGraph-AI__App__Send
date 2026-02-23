# ===============================================================================
# Tests for Routes__Tokens
# Integration tests: admin FastAPI app with token endpoints
# ===============================================================================

from unittest                                                                       import TestCase
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin        import setup__html_graph_service__fast_api_test_objs


class test_Routes__Tokens(TestCase):

    @classmethod
    def setUpClass(cls):
        test_objs       = setup__html_graph_service__fast_api_test_objs()
        cls.client      = test_objs.fast_api__client
        cls.fast_api    = test_objs.fast_api

    def test__create_token(self):
        response = self.client.post('/tokens/create',
                                    json=dict(token_name='route-test-1', usage_limit=25))
        assert response.status_code == 200
        data = response.json()
        assert data.get('token_name') == 'route-test-1'
        assert 'cache_id' in data

    def test__create_token__duplicate(self):
        self.client.post('/tokens/create', json=dict(token_name='route-dup', usage_limit=10))
        response = self.client.post('/tokens/create', json=dict(token_name='route-dup', usage_limit=10))
        assert response.status_code == 409

    def test__create_token__missing_name(self):
        response = self.client.post('/tokens/create', json=dict(usage_limit=10))
        assert response.status_code == 400

    def test__lookup_token(self):
        self.client.post('/tokens/create', json=dict(token_name='route-lookup', usage_limit=50))
        response = self.client.get('/tokens/lookup/route-lookup')
        assert response.status_code == 200
        data = response.json()
        assert data.get('token_name')  == 'route-lookup'
        assert data.get('usage_limit') == 50

    def test__lookup_token__not_found(self):
        response = self.client.get('/tokens/lookup/nonexistent-route-token')
        assert response.status_code == 404

    def test__use_token(self):
        self.client.post('/tokens/create', json=dict(token_name='route-use', usage_limit=10))
        response = self.client.post('/tokens/use/route-use', json=dict(action='page_opened'))
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True

    def test__revoke_token(self):
        self.client.post('/tokens/create', json=dict(token_name='route-revoke', usage_limit=10))
        response = self.client.post('/tokens/revoke/route-revoke')
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'revoked'

    def test__list_tokens(self):
        response = self.client.get('/tokens/list')
        assert response.status_code == 200
        data = response.json()
        assert 'token_names' in data
        assert isinstance(data['token_names'], list)

    def test__list_details(self):
        self.client.post('/tokens/create', json=dict(token_name='route-detail-1', usage_limit=10))
        response = self.client.get('/tokens/list-details')
        assert response.status_code == 200
        data = response.json()
        assert 'tokens' in data
        assert isinstance(data['tokens'], list)
        assert len(data['tokens']) > 0
        token_names = [t['token_name'] for t in data['tokens']]
        assert 'route-detail-1' in token_names
