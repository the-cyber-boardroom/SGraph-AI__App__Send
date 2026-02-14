# ===============================================================================
# Tests for Service__Tokens
# Token lifecycle: create, lookup, use, exhaust, revoke
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Tokens                  import Service__Tokens


class test_Service__Tokens(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client = create_send_cache_client()
        cls.service      = Service__Tokens(send_cache_client=cls.cache_client)

    def test__create_token(self):
        result = self.service.create('svc-demo', usage_limit=50, created_by='test')
        assert result is not None
        assert result.get('token_name') == 'svc-demo'
        assert 'cache_id' in result

    def test__create_duplicate_token(self):
        self.service.create('svc-dup', usage_limit=10, created_by='test')
        result = self.service.create('svc-dup', usage_limit=10, created_by='test')
        assert result is None                                                      # Duplicate rejected

    def test__lookup_token(self):
        self.service.create('svc-lookup', usage_limit=20, created_by='test')
        result = self.service.lookup('svc-lookup')
        assert result is not None
        assert result.get('token_name')  == 'svc-lookup'
        assert result.get('usage_limit') == 20
        assert result.get('usage_count') == 0
        assert result.get('status')      == 'active'

    def test__lookup_not_found(self):
        result = self.service.lookup('nonexistent-svc')
        assert result is None

    def test__use_token(self):
        self.service.create('svc-use', usage_limit=10, created_by='test')
        result = self.service.use('svc-use', ip_hash='hash1', action='page_opened')
        assert result.get('success')     is True
        assert result.get('usage_count') == 1
        assert result.get('remaining')   == 9

    def test__use_token__increments_count(self):
        self.service.create('svc-inc', usage_limit=100, created_by='test')
        self.service.use('svc-inc')
        self.service.use('svc-inc')
        result = self.service.use('svc-inc')
        assert result.get('success')     is True
        assert result.get('usage_count') == 3
        assert result.get('remaining')   == 97

    def test__use_token__exhaust(self):
        self.service.create('svc-exhaust', usage_limit=2, created_by='test')
        self.service.use('svc-exhaust')
        result = self.service.use('svc-exhaust')                                   # Second use hits limit
        assert result.get('success') is True
        assert result.get('remaining') == 0

        result = self.service.use('svc-exhaust')                                   # Third use rejected
        assert result.get('success') is False
        assert result.get('reason')  == 'exhausted'

    def test__use_token__not_found(self):
        result = self.service.use('nonexistent-svc-use')
        assert result.get('success') is False
        assert result.get('reason')  == 'not_found'

    def test__revoke_token(self):
        self.service.create('svc-revoke', usage_limit=10, created_by='test')
        success = self.service.revoke('svc-revoke')
        assert success is True

        token = self.service.lookup('svc-revoke')
        assert token.get('status') == 'revoked'

    def test__use_revoked_token(self):
        self.service.create('svc-rev-use', usage_limit=10, created_by='test')
        self.service.revoke('svc-rev-use')
        result = self.service.use('svc-rev-use')
        assert result.get('success') is False
        assert result.get('reason')  == 'revoked'

    def test__list_tokens(self):
        files = self.service.list_tokens()
        assert files is not None
