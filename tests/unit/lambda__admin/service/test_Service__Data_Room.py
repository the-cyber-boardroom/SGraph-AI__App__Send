# ===============================================================================
# Tests for Service__Data_Room
# Room lifecycle: create, get, list, archive, member management
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault       import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                   import Service__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL             import Service__Vault__ACL
from sgraph_ai_app_send.lambda__admin.service.Service__Data_Room              import Service__Data_Room


class test_Service__Data_Room(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client       = create_send_cache_client()
        vault_cache_client     = Send__Cache__Client__Vault(
            cache_client   = cls.cache_client.cache_client   ,
            hash_generator = cls.cache_client.hash_generator )
        cls.vault_acl          = Service__Vault__ACL(vault_cache_client=vault_cache_client)
        cls.vault_service      = Service__Vault(vault_cache_client=vault_cache_client,
                                                 vault_acl=cls.vault_acl)
        cls.service            = Service__Data_Room(
            send_cache_client = cls.cache_client    ,
            service_vault     = cls.vault_service   ,
            service_vault_acl = cls.vault_acl       )

    # ═══════════════════════════════════════════════════════════════════════
    # Room Creation
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__create_room(self):
        result = self.service.create_room('Test Room', 'owner-001', 'A test data room')
        assert result is not None
        assert 'room_id'         in result
        assert 'vault_cache_key' in result
        assert result['name']            == 'Test Room'
        assert result['description']     == 'A test data room'
        assert result['owner_user_id']   == 'owner-001'
        assert result['status']          == 'active'
        assert result['member_count']    == 1
        assert len(result['room_id'])    == 12                               # 12-hex room ID
        self.__class__.room_id         = result['room_id']
        self.__class__.vault_cache_key = result['vault_cache_key']

    def test__02__create_room__empty_name_rejected(self):
        result = self.service.create_room('', 'owner-001')
        assert result is None

    def test__03__create_room__empty_owner_rejected(self):
        result = self.service.create_room('Room X', '')
        assert result is None

    # ═══════════════════════════════════════════════════════════════════════
    # Room Lookup
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__get_room(self):
        result = self.service.get_room(self.room_id)
        assert result is not None
        assert result.get('name')          == 'Test Room'
        assert result.get('owner_user_id') == 'owner-001'
        assert result.get('status')        == 'active'

    def test__11__get_room__not_found(self):
        result = self.service.get_room('nonexistent-room')
        assert result is None

    # ═══════════════════════════════════════════════════════════════════════
    # Room Listing
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__list_rooms(self):
        rooms = self.service.list_rooms()
        assert len(rooms) >= 1
        room_ids = [r.get('room_id') for r in rooms]
        assert self.room_id in room_ids

    def test__21__list_rooms__filtered_by_user(self):
        rooms = self.service.list_rooms(user_id='owner-001')
        assert len(rooms) >= 1
        room_ids = [r.get('room_id') for r in rooms]
        assert self.room_id in room_ids

    def test__22__list_rooms__filtered_by_nonmember(self):
        rooms = self.service.list_rooms(user_id='stranger-999')
        room_ids = [r.get('room_id') for r in rooms]
        assert self.room_id not in room_ids

    # ═══════════════════════════════════════════════════════════════════════
    # Member Management
    # ═══════════════════════════════════════════════════════════════════════

    def test__30__get_members(self):
        members = self.service.get_members(self.room_id)
        assert members is not None
        assert len(members) >= 1                                             # At least the owner
        user_ids = [m.get('user_id') for m in members]
        assert 'owner-001' in user_ids

    def test__31__add_member__editor(self):
        result = self.service.add_member(self.room_id, 'editor-001', 'editor', 'owner-001')
        assert result.get('success') is True

    def test__32__add_member__viewer(self):
        result = self.service.add_member(self.room_id, 'viewer-001', 'viewer', 'owner-001')
        assert result.get('success') is True

    def test__33__add_member__not_owner_denied(self):
        result = self.service.add_member(self.room_id, 'viewer-002', 'viewer', 'editor-001')
        assert result.get('success') is False
        assert result.get('reason')  == 'not_owner'

    def test__34__get_members__all_present(self):
        members = self.service.get_members(self.room_id)
        assert len(members) >= 3
        user_ids = [m.get('user_id') for m in members]
        assert 'owner-001'  in user_ids
        assert 'editor-001' in user_ids
        assert 'viewer-001' in user_ids

    def test__35__remove_member(self):
        result = self.service.remove_member(self.room_id, 'viewer-001', 'owner-001')
        assert result.get('success') is True

    def test__36__removed_member__no_longer_listed(self):
        members = self.service.get_members(self.room_id)
        user_ids = [m.get('user_id') for m in members]
        assert 'viewer-001' not in user_ids

    def test__37__remove_member__not_owner_denied(self):
        result = self.service.remove_member(self.room_id, 'editor-001', 'editor-001')
        assert result.get('success') is False

    # ═══════════════════════════════════════════════════════════════════════
    # Archive
    # ═══════════════════════════════════════════════════════════════════════

    def test__40__archive_room__not_owner_denied(self):
        result = self.service.archive_room(self.room_id, 'editor-001')
        assert result.get('success') is False
        assert result.get('reason')  == 'not_owner'

    def test__41__archive_room(self):
        result = self.service.archive_room(self.room_id, 'owner-001')
        assert result.get('success') is True
        assert result.get('status')  == 'archived'

    def test__42__archived_room__still_gettable(self):
        result = self.service.get_room(self.room_id)
        assert result is not None
        assert result.get('status') == 'archived'

    def test__43__archived_room__not_in_list(self):
        rooms    = self.service.list_rooms()
        room_ids = [r.get('room_id') for r in rooms]
        assert self.room_id not in room_ids
