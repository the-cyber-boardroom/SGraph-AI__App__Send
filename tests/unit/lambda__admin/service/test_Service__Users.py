# ===============================================================================
# Tests for Service__Users
# User lifecycle: create, lookup by ID, lookup by fingerprint, deactivate, list
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Users                   import Service__Users


class test_Service__Users(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client = create_send_cache_client()
        cls.service      = Service__Users(send_cache_client=cls.cache_client)

    def test__01__create_user(self):
        result = self.service.create('Alice', 'sha256:aaaa1111bbbb2222')
        assert result is not None
        assert 'user_id'         in result
        assert 'display_name'    in result
        assert 'key_fingerprint' in result
        assert 'created'         in result
        assert result['display_name']    == 'Alice'
        assert result['key_fingerprint'] == 'sha256:aaaa1111bbbb2222'
        assert len(result['user_id'])    == 12                                 # 12-hex user ID
        self.__class__.alice_id = result['user_id']

    def test__02__create_user__duplicate_fingerprint_rejected(self):
        result = self.service.create('Alice Clone', 'sha256:aaaa1111bbbb2222')
        assert result is None                                                  # Same fingerprint → rejected

    def test__03__create_user__empty_name_rejected(self):
        result = self.service.create('', 'sha256:cccc3333dddd4444')
        assert result is None

    def test__04__create_user__empty_fingerprint_rejected(self):
        result = self.service.create('Bob', '')
        assert result is None

    def test__05__create_second_user(self):
        result = self.service.create('Bob', 'sha256:cccc3333dddd4444')
        assert result is not None
        assert result['display_name'] == 'Bob'
        self.__class__.bob_id = result['user_id']

    def test__10__lookup_user(self):
        result = self.service.lookup(self.alice_id)
        assert result is not None
        assert result.get('display_name')    == 'Alice'
        assert result.get('key_fingerprint') == 'sha256:aaaa1111bbbb2222'

    def test__11__lookup_user__not_found(self):
        result = self.service.lookup('nonexistent-id')
        assert result is None

    def test__12__lookup_by_fingerprint(self):
        result = self.service.lookup_by_fingerprint('sha256:aaaa1111bbbb2222')
        assert result is not None
        assert result.get('user_id') == self.alice_id

    def test__13__lookup_by_fingerprint__not_found(self):
        result = self.service.lookup_by_fingerprint('sha256:0000000000000000')
        assert result is None

    def test__20__list_users(self):
        users = self.service.list_users()
        assert len(users) >= 2
        user_ids = [u.get('user_id') for u in users]
        assert self.alice_id in user_ids
        assert self.bob_id   in user_ids

    def test__30__deactivate_user(self):
        result = self.service.deactivate(self.bob_id)
        assert result is not None
        assert result.get('status') == 'deactivated'

    def test__31__deactivated_user__not_in_lookup(self):
        result = self.service.lookup(self.bob_id)
        assert result is None                                                  # Deactivated → not found

    def test__32__deactivated_user__not_in_list(self):
        users    = self.service.list_users()
        user_ids = [u.get('user_id') for u in users]
        assert self.bob_id not in user_ids
