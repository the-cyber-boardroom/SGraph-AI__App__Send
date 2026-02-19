# ===============================================================================
# SGraph Send - Routes__Transfers Token Integration Tests
# Full transfer API with admin token service wired via in-memory Service Registry
# ===============================================================================

from unittest                                                                          import TestCase
from osbot_fast_api.api.schemas.consts.consts__Fast_API                               import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_utils.type_safe.primitives.domains.identifiers.Random_Guid                 import Random_Guid
from osbot_utils.utils.Env                                                             import set_env
from starlette.testclient                                                              import TestClient
from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin      import Fast_API__SGraph__App__Send__Admin
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User        import Fast_API__SGraph__App__Send__User
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup             import setup_admin_service_client__in_memory
from sgraph_ai_app_send.lambda__user.user__config                                      import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_SEND__ACCESS_TOKEN


class test_Routes__Transfers__with_tokens(TestCase):

    @classmethod
    def setUpClass(cls):
        set_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME , 'test-key-name' )
        set_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE, 'test-key-value')

        # Set up admin service in-memory (real admin app, no network)
        cls.admin_fast_api      = Fast_API__SGraph__App__Send__Admin().setup()
        cls.admin_service_client = setup_admin_service_client__in_memory(cls.admin_fast_api)

        # Create a test token via admin service
        cls.test_token_name = 'test-upload-token'
        create_response     = cls.admin_service_client.token_create(cls.test_token_name, usage_limit=50)
        assert create_response.status_code == 200

        # Set up user Lambda with admin client wired in (no env-var fallback)
        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')                          # Clear env-var so admin service is used
        cls.user_fast_api = Fast_API__SGraph__App__Send__User(admin_service_client = cls.admin_service_client).setup()
        cls.client        = cls.user_fast_api.client()

    # --- check-token endpoint ---

    def test__check_token__valid(self):
        response = self.client.get(f'/transfers/check-token/{self.test_token_name}')
        assert response.status_code == 200
        data = response.json()
        assert data['valid']  is True
        assert data['status'] == 'active'

    def test__check_token__not_found(self):
        response = self.client.get('/transfers/check-token/nonexistent-token')
        assert response.status_code == 200
        data = response.json()
        assert data['valid'] is False
        assert data['reason'] == 'not_found'

    # --- validate-token endpoint ---

    def test__validate_token__valid(self):
        # Create a dedicated token for this test
        self.admin_service_client.token_create('validate-test-token', usage_limit=10)
        response = self.client.post('/transfers/validate-token/validate-test-token')
        assert response.status_code == 200
        data = response.json()
        assert data['success']     is True
        assert data['usage_count'] == 1
        assert data['remaining']   == 9

    def test__validate_token__not_found(self):
        response = self.client.post('/transfers/validate-token/nonexistent-for-validate')
        assert response.status_code == 200
        data = response.json()
        assert data['success'] is False
        assert data['reason']  == 'not_found'

    def test__validate_token__exhausted(self):
        # Create a token with limit of 1, use it, then try again
        self.admin_service_client.token_create('exhaust-test-token', usage_limit=1)
        self.client.post('/transfers/validate-token/exhaust-test-token')          # First use (succeeds)
        response = self.client.post('/transfers/validate-token/exhaust-test-token')  # Second use (exhausted)
        data = response.json()
        assert data['success'] is False
        assert data['reason']  == 'exhausted'

    # --- upload with admin token validation ---

    def test__create_transfer__with_valid_token(self):
        response = self.client.post('/transfers/create',
                                    json    = dict(file_size_bytes=1024, content_type_hint='text/plain'),
                                    headers = {HEADER__SGRAPH_SEND__ACCESS_TOKEN: self.test_token_name})
        assert response.status_code == 200
        data = response.json()
        assert 'transfer_id' in data

    def test__create_transfer__with_invalid_token(self):
        response = self.client.post('/transfers/create',
                                    json    = dict(file_size_bytes=1024),
                                    headers = {HEADER__SGRAPH_SEND__ACCESS_TOKEN: 'bad-token-name'})
        assert response.status_code == 401

    def test__create_transfer__no_token(self):
        response = self.client.post('/transfers/create',
                                    json = dict(file_size_bytes=1024))
        assert response.status_code == 401

    # --- complete must NOT return token_name (security fix: token leak in shareable URLs) ---

    def test__complete_does_not_return_token_name(self):
        headers = {HEADER__SGRAPH_SEND__ACCESS_TOKEN: self.test_token_name}

        create  = self.client.post('/transfers/create',
                                   json    = dict(file_size_bytes=4),
                                   headers = headers).json()
        tid = create['transfer_id']

        self.client.post(f'/transfers/upload/{tid}',
                         content = b'\x00\x01\x02\x03',
                         headers = {**headers, 'content-type': 'application/octet-stream'})

        response = self.client.post(f'/transfers/complete/{tid}', headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert 'token_name' not in data

    # --- full flow with token ---

    def test__full_flow_with_token(self):
        # Create a token for this flow
        flow_token = 'full-flow-test-token'
        self.admin_service_client.token_create(flow_token, usage_limit=10)
        headers = {HEADER__SGRAPH_SEND__ACCESS_TOKEN: flow_token}

        payload = b'encrypted-content-for-token-flow'

        # Upload with token
        create   = self.client.post('/transfers/create',
                                    json    = dict(file_size_bytes=len(payload), content_type_hint='application/pdf'),
                                    headers = headers).json()
        tid = create['transfer_id']

        self.client.post(f'/transfers/upload/{tid}',
                         content = payload,
                         headers = {**headers, 'content-type': 'application/octet-stream'})

        complete = self.client.post(f'/transfers/complete/{tid}', headers=headers).json()
        assert 'token_name' not in complete

        # Validate token (simulates download page visit)
        validate = self.client.post(f'/transfers/validate-token/{flow_token}').json()
        assert validate['success'] is True

        # Download payload (public endpoint)
        download = self.client.get(f'/transfers/download/{tid}')
        assert download.content == payload
