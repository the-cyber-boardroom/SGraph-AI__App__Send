# ===============================================================================
# Tests for Service__Room__Session
# Session lifecycle: create, validate, expire, revoke
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Room__Session           import Service__Room__Session


class test_Service__Room__Session(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client = create_send_cache_client()
        cls.service      = Service__Room__Session(send_cache_client=cls.cache_client)

    # ═══════════════════════════════════════════════════════════════════════
    # Create Session
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__create_session(self):
        result = self.service.create_session('room-sess-001', 'user-sess-001', 'viewer')
        assert result is not None
        assert 'session_token' in result
        assert result['room_id']    == 'room-sess-001'
        assert result['user_id']    == 'user-sess-001'
        assert result['permission'] == 'viewer'
        assert 'expires'            in result
        assert len(result['session_token']) == 32                            # 32-char hex token
        self.__class__.session_token = result['session_token']

    def test__02__create_session__empty_room_rejected(self):
        result = self.service.create_session('', 'user-001', 'viewer')
        assert result is None

    def test__03__create_session__empty_user_rejected(self):
        result = self.service.create_session('room-001', '', 'viewer')
        assert result is None

    # ═══════════════════════════════════════════════════════════════════════
    # Validate Session
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__validate_session(self):
        result = self.service.validate_session(self.session_token)
        assert result.get('valid')      is True
        assert result.get('room_id')    == 'room-sess-001'
        assert result.get('user_id')    == 'user-sess-001'
        assert result.get('permission') == 'viewer'

    def test__11__validate_session__not_found(self):
        result = self.service.validate_session('nonexistent-token-000000000000')
        assert result.get('valid')  is False
        assert result.get('reason') == 'not_found'

    # ═══════════════════════════════════════════════════════════════════════
    # Revoke Session
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__revoke_session(self):
        result = self.service.revoke_session(self.session_token)
        assert result.get('success') is True
        assert result.get('status')  == 'revoked'

    def test__21__revoked_session__validation_fails(self):
        result = self.service.validate_session(self.session_token)
        assert result.get('valid')  is False
        assert result.get('reason') == 'revoked'

    def test__22__revoke_session__not_found(self):
        result = self.service.revoke_session('nonexistent-token-000000000000')
        assert result.get('success') is False
        assert result.get('reason')  == 'not_found'

    # ═══════════════════════════════════════════════════════════════════════
    # Expired Session
    # ═══════════════════════════════════════════════════════════════════════

    def test__30__expired_session(self):
        result = self.service.create_session('room-exp-001', 'user-exp-001', 'viewer', hours=0)
        assert result is not None
        token = result['session_token']

        # Session with 0 hours should be immediately expired
        validation = self.service.validate_session(token)
        assert validation.get('valid')  is False
        assert validation.get('reason') == 'expired'
