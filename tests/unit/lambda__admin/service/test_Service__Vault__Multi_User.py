# ===============================================================================
# Tests for Multi-User Vault Workflow (Phase 1 Integration)
# End-to-end: create users → create vault with owner → share → access check
# Two independent in-memory clients (no mocks)
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault       import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                   import Service__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL             import Service__Vault__ACL
from sgraph_ai_app_send.lambda__admin.service.Service__Users                   import Service__Users


class test_Service__Vault__Multi_User(TestCase):

    @classmethod
    def setUpClass(cls):
        send_cache_client  = create_send_cache_client()
        vault_cache_client = Send__Cache__Client__Vault(
            cache_client   = send_cache_client.cache_client   ,
            hash_generator = send_cache_client.hash_generator )

        cls.vault_acl     = Service__Vault__ACL(vault_cache_client=vault_cache_client)
        cls.vault_service = Service__Vault(vault_cache_client=vault_cache_client,
                                            vault_acl=cls.vault_acl)
        cls.user_service  = Service__Users(send_cache_client=send_cache_client)

    # ═══════════════════════════════════════════════════════════════════════
    # Step 1: Create users
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__create_alice(self):
        result = self.user_service.create('Alice', 'sha256:alice000')
        assert result is not None
        self.__class__.alice_id = result['user_id']

    def test__02__create_bob(self):
        result = self.user_service.create('Bob', 'sha256:bob00000')
        assert result is not None
        self.__class__.bob_id = result['user_id']

    def test__03__create_charlie(self):
        result = self.user_service.create('Charlie', 'sha256:charlie0')
        assert result is not None
        self.__class__.charlie_id = result['user_id']

    # ═══════════════════════════════════════════════════════════════════════
    # Step 2: Alice creates a vault (auto-becomes owner)
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__alice_creates_vault(self):
        result = self.vault_service.create(
            'multi-user-test-vault',
            key_fingerprint='sha256:alice000',
            owner_user_id=self.alice_id)
        assert result is not None
        assert result.get('owner_user_id') == self.alice_id
        self.__class__.cache_id  = result['cache_id']
        self.__class__.vault_key = 'multi-user-test-vault'

    def test__11__alice_is_owner(self):
        assert self.vault_acl.is_owner(self.cache_id, self.alice_id) is True

    def test__12__bob_has_no_access(self):
        assert self.vault_acl.can_view(self.cache_id, self.bob_id) is False

    # ═══════════════════════════════════════════════════════════════════════
    # Step 3: Alice shares vault with Bob (editor) and Charlie (viewer)
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__share_with_bob_as_editor(self):
        result = self.vault_acl.grant_access(
            self.cache_id, self.bob_id, 'editor', self.alice_id)
        assert result.get('success') is True

    def test__21__share_with_charlie_as_viewer(self):
        result = self.vault_acl.grant_access(
            self.cache_id, self.charlie_id, 'viewer', self.alice_id)
        assert result.get('success') is True

    # ═══════════════════════════════════════════════════════════════════════
    # Step 4: Verify permission matrix
    # ═══════════════════════════════════════════════════════════════════════

    def test__30__alice_can_do_everything(self):
        assert self.vault_acl.is_owner(self.cache_id, self.alice_id) is True
        assert self.vault_acl.can_edit(self.cache_id, self.alice_id)  is True
        assert self.vault_acl.can_view(self.cache_id, self.alice_id)  is True

    def test__31__bob_can_edit_and_view(self):
        assert self.vault_acl.is_owner(self.cache_id, self.bob_id) is False
        assert self.vault_acl.can_edit(self.cache_id, self.bob_id)  is True
        assert self.vault_acl.can_view(self.cache_id, self.bob_id)  is True

    def test__32__charlie_can_only_view(self):
        assert self.vault_acl.is_owner(self.cache_id, self.charlie_id) is False
        assert self.vault_acl.can_edit(self.cache_id, self.charlie_id)  is False
        assert self.vault_acl.can_view(self.cache_id, self.charlie_id)  is True

    # ═══════════════════════════════════════════════════════════════════════
    # Step 5: Bob stores a file (editor can write)
    # ═══════════════════════════════════════════════════════════════════════

    def test__40__bob_stores_file_after_permission_check(self):
        assert self.vault_acl.can_edit(self.cache_id, self.bob_id) is True
        encrypted = b'\xaa\xbb\xcc bob-encrypted-data'
        result = self.vault_service.store_file(self.vault_key, 'bob-file-001', encrypted)
        assert result is not None

    def test__41__charlie_can_read_file_after_permission_check(self):
        assert self.vault_acl.can_view(self.cache_id, self.charlie_id) is True
        result = self.vault_service.get_file(self.vault_key, 'bob-file-001')
        assert result is not None

    # ═══════════════════════════════════════════════════════════════════════
    # Step 6: Revoke Bob's access
    # ═══════════════════════════════════════════════════════════════════════

    def test__50__revoke_bob(self):
        result = self.vault_acl.revoke_access(self.cache_id, self.bob_id)
        assert result.get('success') is True

    def test__51__bob_can_no_longer_access(self):
        assert self.vault_acl.can_view(self.cache_id, self.bob_id) is False
        assert self.vault_acl.can_edit(self.cache_id, self.bob_id) is False

    def test__52__charlie_still_has_access(self):
        assert self.vault_acl.can_view(self.cache_id, self.charlie_id) is True

    # ═══════════════════════════════════════════════════════════════════════
    # Step 7: Vault lookup includes owner_user_id
    # ═══════════════════════════════════════════════════════════════════════

    def test__60__vault_manifest_includes_owner(self):
        manifest = self.vault_service.lookup(self.vault_key)
        assert manifest is not None
        assert manifest.get('owner_user_id') == self.alice_id
