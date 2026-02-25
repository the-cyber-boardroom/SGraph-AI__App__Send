# ===============================================================================
# Tests for Service__Invites
# Invite lifecycle: create, validate, accept, expire, constraints
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault       import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                   import Service__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL             import Service__Vault__ACL
from sgraph_ai_app_send.lambda__admin.service.Service__Data_Room              import Service__Data_Room
from sgraph_ai_app_send.lambda__admin.service.Service__Invites                import Service__Invites


class test_Service__Invites(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client       = create_send_cache_client()
        vault_cache_client     = Send__Cache__Client__Vault(
            cache_client   = cls.cache_client.cache_client   ,
            hash_generator = cls.cache_client.hash_generator )
        cls.vault_acl          = Service__Vault__ACL(vault_cache_client=vault_cache_client)
        cls.vault_service      = Service__Vault(vault_cache_client=vault_cache_client,
                                                 vault_acl=cls.vault_acl)
        cls.data_room_service  = Service__Data_Room(
            send_cache_client = cls.cache_client    ,
            service_vault     = cls.vault_service   ,
            service_vault_acl = cls.vault_acl       )
        cls.service            = Service__Invites(
            send_cache_client = cls.cache_client       ,
            service_data_room = cls.data_room_service  )

        # Create a room for invite tests
        room = cls.data_room_service.create_room('Invite Test Room', 'owner-inv-001')
        cls.room_id = room['room_id']

    # ═══════════════════════════════════════════════════════════════════════
    # Create Invite
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__create_invite(self):
        result = self.service.create_invite(self.room_id, 'viewer', 'owner-inv-001', max_uses=3)
        assert result is not None
        assert 'invite_code' in result
        assert result['room_id']    == self.room_id
        assert result['permission'] == 'viewer'
        assert result['max_uses']   == 3
        assert result['status']     == 'active'
        assert len(result['invite_code']) == 12                              # 12-char hex code
        self.__class__.invite_code = result['invite_code']

    def test__02__create_invite__room_not_found(self):
        result = self.service.create_invite('nonexistent-room', 'viewer', 'admin')
        assert result is None

    # ═══════════════════════════════════════════════════════════════════════
    # Validate Invite
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__validate_invite(self):
        result = self.service.validate_invite(self.invite_code)
        assert result.get('valid')      is True
        assert result.get('room_id')    == self.room_id
        assert result.get('room_name')  == 'Invite Test Room'
        assert result.get('permission') == 'viewer'

    def test__11__validate_invite__not_found(self):
        result = self.service.validate_invite('DEADBEEF0000')
        assert result.get('valid')  is False
        assert result.get('reason') == 'not_found'

    # ═══════════════════════════════════════════════════════════════════════
    # Accept Invite
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__accept_invite__first_use(self):
        result = self.service.accept_invite(self.invite_code, 'recipient-001')
        assert result.get('success')    is True
        assert result.get('room_id')    == self.room_id
        assert result.get('permission') == 'viewer'
        assert result.get('user_id')    == 'recipient-001'

    def test__21__accept_invite__duplicate_rejected(self):
        result = self.service.accept_invite(self.invite_code, 'recipient-001')
        assert result.get('success') is False
        assert result.get('reason')  == 'already_accepted'

    def test__22__accept_invite__second_user(self):
        result = self.service.accept_invite(self.invite_code, 'recipient-002')
        assert result.get('success') is True

    def test__23__accept_invite__third_user_exhausts(self):
        result = self.service.accept_invite(self.invite_code, 'recipient-003')
        assert result.get('success') is True

    def test__24__accept_invite__fourth_user_blocked(self):
        result = self.service.accept_invite(self.invite_code, 'recipient-004')
        assert result.get('success') is False
        assert result.get('reason')  == 'exhausted'

    def test__25__members_added_via_invite(self):
        members = self.data_room_service.get_members(self.room_id)
        user_ids = [m.get('user_id') for m in members]
        assert 'recipient-001' in user_ids
        assert 'recipient-002' in user_ids
        assert 'recipient-003' in user_ids

    # ═══════════════════════════════════════════════════════════════════════
    # Expire Invite
    # ═══════════════════════════════════════════════════════════════════════

    def test__30__expire_invite(self):
        # Create a fresh invite to expire
        invite = self.service.create_invite(self.room_id, 'editor', 'owner-inv-001', max_uses=10)
        code   = invite['invite_code']
        result = self.service.expire_invite(code)
        assert result.get('success') is True
        assert result.get('status')  == 'expired'
        self.__class__.expired_code = code

    def test__31__expired_invite__cannot_validate(self):
        result = self.service.validate_invite(self.expired_code)
        assert result.get('valid')  is False
        assert result.get('reason') == 'expired'

    def test__32__expired_invite__cannot_accept(self):
        result = self.service.accept_invite(self.expired_code, 'recipient-005')
        assert result.get('success') is False
        assert result.get('reason')  == 'expired'

    # ═══════════════════════════════════════════════════════════════════════
    # List Invites
    # ═══════════════════════════════════════════════════════════════════════

    def test__40__list_invites__all(self):
        invites = self.service.list_invites()
        assert len(invites) >= 2

    def test__41__list_invites__filtered_by_room(self):
        invites = self.service.list_invites(room_id=self.room_id)
        assert len(invites) >= 2
        for inv in invites:
            assert inv.get('room_id') == self.room_id
