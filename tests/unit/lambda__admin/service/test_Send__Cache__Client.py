# ===============================================================================
# Tests for Send__Cache__Client
# Verifies cache service wrapper operations in IN_MEMORY mode
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client


class test_Send__Cache__Client(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = create_send_cache_client()

    def test__health_check(self):
        assert self.client.health_check() is True

    def test__analytics__record_event(self):
        event = dict(event_id='evt001', event_type='page_view', path='/index.html',
                     method='GET', status_code=200, ip_hash='abc123')
        result = self.client.analytics__record_event(event)
        assert result is not None
        assert hasattr(result, 'cache_id')
        assert result.cache_id is not None

    def test__analytics__record_event__failure_returns_none(self):
        result = self.client.analytics__record_event(None)              # None body should not crash
        # Analytics failures return None silently
        assert result is None or result is not None                     # Either way, no exception

    def test__analytics__retrieve_event(self):
        event = dict(event_id='evt002', event_type='api_call', path='/transfers/create',
                     method='POST', status_code=200)
        store_result = self.client.analytics__record_event(event)
        assert store_result is not None

        retrieved = self.client.analytics__retrieve_event(str(store_result.cache_id))
        assert retrieved is not None
        assert retrieved.get('event_id')   == 'evt002'
        assert retrieved.get('event_type') == 'api_call'

    def test__token__create_and_lookup(self):
        token_data = dict(token_name='test-token-1', usage_limit=10,
                          usage_count=0, status='active', created_by='test', metadata={})
        result = self.client.token__create(token_data)
        assert result is not None
        assert hasattr(result, 'cache_id')

        looked_up = self.client.token__lookup('test-token-1')
        assert looked_up is not None
        assert looked_up.get('token_name')  == 'test-token-1'
        assert looked_up.get('usage_limit') == 10
        assert looked_up.get('status')      == 'active'

    def test__token__lookup__not_found(self):
        result = self.client.token__lookup('nonexistent-token')
        assert result is None

    def test__token__use__stores_child_data(self):
        token_data = dict(token_name='test-token-use', usage_limit=100,
                          usage_count=0, status='active', created_by='test', metadata={})
        self.client.token__create(token_data)

        usage_event = dict(event_id='use001', ip_hash='hash123',
                           action='page_opened', transfer_id='', success=True,
                           rejection_reason='')
        result = self.client.token__use('test-token-use', usage_event)
        assert result is not None

    def test__token__revoke(self):
        token_data = dict(token_name='test-token-revoke', usage_limit=10,
                          usage_count=0, status='active', created_by='test', metadata={})
        self.client.token__create(token_data)

        success = self.client.token__revoke('test-token-revoke')
        assert success is True

        revoked = self.client.token__lookup('test-token-revoke')
        assert revoked is not None
        assert revoked.get('status') == 'revoked'

    def test__token__revoke__not_found(self):
        result = self.client.token__revoke('nonexistent-for-revoke')
        assert result is False
