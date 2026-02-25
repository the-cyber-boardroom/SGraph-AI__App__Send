# ===============================================================================
# Tests for Routes__Data_Room and Routes__Invites
# Integration tests: admin FastAPI app with data room + invite endpoints
# URL convention: method__param → /tag/method/{param}
# ===============================================================================

from unittest                                                                       import TestCase
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin        import setup__html_graph_service__fast_api_test_objs


class test_Routes__Data_Room(TestCase):

    @classmethod
    def setUpClass(cls):
        test_objs    = setup__html_graph_service__fast_api_test_objs()
        cls.client   = test_objs.fast_api__client
        cls.fast_api = test_objs.fast_api

    # ═══════════════════════════════════════════════════════════════════════
    # Room CRUD
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__create_room(self):
        response = self.client.post('/rooms/create',
                                     json=dict(name='Route Test Room',
                                               owner_user_id='route-owner-001',
                                               description='Created via route test'))
        assert response.status_code == 200
        data = response.json()
        assert data.get('name')          == 'Route Test Room'
        assert data.get('owner_user_id') == 'route-owner-001'
        assert data.get('status')        == 'active'
        assert 'room_id' in data
        self.__class__.room_id = data['room_id']

    def test__02__create_room__missing_name(self):
        response = self.client.post('/rooms/create',
                                     json=dict(owner_user_id='route-owner-001'))
        assert response.status_code == 400

    def test__03__create_room__missing_owner(self):
        response = self.client.post('/rooms/create',
                                     json=dict(name='No Owner Room'))
        assert response.status_code == 400

    def test__04__get_room(self):
        response = self.client.get(f'/rooms/lookup/{self.room_id}')
        assert response.status_code == 200
        data = response.json()
        assert data.get('name')   == 'Route Test Room'
        assert data.get('status') == 'active'

    def test__05__get_room__not_found(self):
        response = self.client.get('/rooms/lookup/nonexistent-room-id')
        assert response.status_code == 404

    def test__06__list_rooms(self):
        response = self.client.get('/rooms/list')
        assert response.status_code == 200
        data = response.json()
        assert 'rooms' in data
        assert 'count' in data
        assert data['count'] >= 1

    # ═══════════════════════════════════════════════════════════════════════
    # Members
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__get_members(self):
        response = self.client.get(f'/rooms/members/{self.room_id}')
        assert response.status_code == 200
        data = response.json()
        assert data.get('count') >= 1

    def test__11__add_member(self):
        response = self.client.post(f'/rooms/members-add/{self.room_id}',
                                     json=dict(user_id='route-viewer-001',
                                               permission='viewer',
                                               granted_by='route-owner-001'))
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True

    def test__12__remove_member(self):
        self.client.post(f'/rooms/members-add/{self.room_id}',
                          json=dict(user_id='route-remove-001',
                                    permission='viewer',
                                    granted_by='route-owner-001'))
        response = self.client.delete(f'/rooms/members-remove/{self.room_id}/route-remove-001')
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True

    # ═══════════════════════════════════════════════════════════════════════
    # Invites (via room routes)
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__create_invite(self):
        response = self.client.post(f'/rooms/invite/{self.room_id}',
                                     json=dict(permission='viewer',
                                               created_by='route-owner-001',
                                               max_uses=5))
        assert response.status_code == 200
        data = response.json()
        assert 'invite_code' in data
        assert data.get('room_id') == self.room_id
        self.__class__.invite_code = data['invite_code']

    # ═══════════════════════════════════════════════════════════════════════
    # Invite Routes (standalone)
    # ═══════════════════════════════════════════════════════════════════════

    def test__21__validate_invite(self):
        response = self.client.get(f'/invites/validate/{self.invite_code}')
        assert response.status_code == 200
        data = response.json()
        assert data.get('valid')   is True
        assert data.get('room_id') == self.room_id

    def test__22__accept_invite(self):
        response = self.client.post(f'/invites/accept/{self.invite_code}',
                                     json=dict(user_id='route-recipient-001'))
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True
        assert data.get('room_id') == self.room_id

    def test__23__expire_invite(self):
        create_resp = self.client.post(f'/rooms/invite/{self.room_id}',
                                        json=dict(permission='viewer',
                                                  created_by='route-owner-001',
                                                  max_uses=1))
        code = create_resp.json()['invite_code']
        response = self.client.post(f'/invites/expire/{code}')
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'expired'

    # ═══════════════════════════════════════════════════════════════════════
    # Audit Trail
    # ═══════════════════════════════════════════════════════════════════════

    def test__30__get_audit(self):
        response = self.client.get(f'/rooms/audit/{self.room_id}')
        assert response.status_code == 200
        data = response.json()
        assert data.get('room_id') == self.room_id
        assert 'events' in data
        assert data.get('count') >= 1

    # ═══════════════════════════════════════════════════════════════════════
    # Archive
    # ═══════════════════════════════════════════════════════════════════════

    def test__40__archive_room(self):
        create_resp = self.client.post('/rooms/create',
                                        json=dict(name='Archive Test',
                                                  owner_user_id='route-owner-001'))
        archive_room_id = create_resp.json()['room_id']
        response = self.client.post(f'/rooms/archive/{archive_room_id}')
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'archived'
