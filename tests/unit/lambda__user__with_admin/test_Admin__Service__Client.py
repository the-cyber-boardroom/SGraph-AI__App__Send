# ===============================================================================
# Tests for Admin__Service__Client
# Verifies user Lambda → admin Lambda communication via Service Registry
# Uses IN_MEMORY mode: real admin FastAPI app, no network
# ===============================================================================

from unittest                                                                          import TestCase
from osbot_fast_api.api.schemas.consts.consts__Fast_API                               import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_utils.utils.Env                                                             import set_env
from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin      import Fast_API__SGraph__App__Send__Admin
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client                    import Admin__Service__Client
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup             import setup_admin_service_client__in_memory

TEST_API_KEY__NAME  = 'key-used-in-admin-client-test'
TEST_API_KEY__VALUE = 'test-api-key-value-for-admin-client'


class test_Admin__Service__Client(TestCase):

    @classmethod
    def setUpClass(cls):
        set_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME , TEST_API_KEY__NAME )    # Admin Lambda reads these for auth
        set_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE, TEST_API_KEY__VALUE)

        cls.admin_fast_api = Fast_API__SGraph__App__Send__Admin().setup()        # Real admin app, in-memory
        cls.client         = setup_admin_service_client__in_memory(cls.admin_fast_api)

    # --- registration ---

    def test__client_is_registered(self):
        from osbot_fast_api.services.registry.Fast_API__Service__Registry import fast_api__service__registry
        assert fast_api__service__registry.is_registered(Admin__Service__Client) is True

    def test__requests_resolves_config(self):
        requests = self.client.requests()
        config   = requests.config()
        assert config is not None
        assert config.fast_api_app is not None

    # --- token_create ---

    def test__token_create(self):
        response = self.client.token_create('admin-client-test-token-1', usage_limit=10, created_by='test')
        assert response.status_code == 200
        data = response.json()
        assert data.get('token_name') == 'admin-client-test-token-1'
        assert 'cache_id'             in data

    def test__token_create__duplicate(self):
        self.client.token_create('admin-client-dup-token', usage_limit=5)
        response = self.client.token_create('admin-client-dup-token', usage_limit=5)
        assert response.status_code == 409                                      # Conflict

    # --- token_lookup ---

    def test__token_lookup(self):
        self.client.token_create('admin-client-lookup-token', usage_limit=20)
        response = self.client.token_lookup('admin-client-lookup-token')
        assert response.status_code == 200
        data = response.json()
        assert data.get('token_name')  == 'admin-client-lookup-token'
        assert data.get('usage_limit') == 20
        assert data.get('status')      == 'active'

    def test__token_lookup__not_found(self):
        response = self.client.token_lookup('nonexistent-token-xyz')
        assert response.status_code == 404

    # --- token_use ---

    def test__token_use(self):
        self.client.token_create('admin-client-use-token', usage_limit=100)
        response = self.client.token_use('admin-client-use-token',
                                          ip_hash     = 'abc123'    ,
                                          action      = 'page_opened',
                                          transfer_id = ''           )
        assert response.status_code == 200
        data = response.json()
        assert data.get('success')     is True
        assert data.get('usage_count') == 1
        assert data.get('remaining')   == 99

    def test__token_use__not_found(self):
        response = self.client.token_use('nonexistent-for-use')
        assert response.status_code == 200                                      # Route returns 200 with success=False
        data = response.json()
        assert data.get('success') is False
        assert data.get('reason')  == 'not_found'

    def test__token_use__increments_count(self):
        self.client.token_create('admin-client-count-token', usage_limit=5)
        self.client.token_use('admin-client-count-token')
        self.client.token_use('admin-client-count-token')
        response = self.client.token_use('admin-client-count-token')
        data     = response.json()
        assert data.get('usage_count') == 3
        assert data.get('remaining')   == 2

    # --- full flow ---

    def test__full_flow__create_use_lookup(self):
        # Create
        create_resp = self.client.token_create('admin-client-flow-token', usage_limit=3)
        assert create_resp.status_code == 200

        # Use twice
        self.client.token_use('admin-client-flow-token', ip_hash='hash1', action='page_opened')
        use_resp = self.client.token_use('admin-client-flow-token', ip_hash='hash2', action='download')
        use_data = use_resp.json()
        assert use_data.get('usage_count') == 2
        assert use_data.get('remaining')   == 1

        # Lookup reflects updated count
        lookup_resp = self.client.token_lookup('admin-client-flow-token')
        lookup_data = lookup_resp.json()
        assert lookup_data.get('usage_count') == 2
        assert lookup_data.get('status')      == 'active'
