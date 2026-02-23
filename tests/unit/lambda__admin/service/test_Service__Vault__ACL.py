# ===============================================================================
# Tests for Service__Vault__ACL
# Permission management: grant, revoke, check, list for multi-user vault access
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault       import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                   import Service__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL             import Service__Vault__ACL


class test_Service__Vault__ACL(TestCase):

    @classmethod
    def setUpClass(cls):
        send_cache_client  = create_send_cache_client()
        vault_cache_client = Send__Cache__Client__Vault(
            cache_client   = send_cache_client.cache_client   ,
            hash_generator = send_cache_client.hash_generator )

        cls.vault_acl = Service__Vault__ACL(vault_cache_client=vault_cache_client)
        cls.service   = Service__Vault(vault_cache_client=vault_cache_client,
                                       vault_acl=cls.vault_acl)

        # Create a vault with owner
        result = cls.service.create('acl-test-vault-001',
                                     key_fingerprint='sha256:owner1234',
                                     owner_user_id='user-owner-001')
        cls.cache_id = result['cache_id']

    # ═══════════════════════════════════════════════════════════════════════
    # Vault creation auto-grants owner
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__owner_auto_granted(self):
        perm = self.vault_acl.get_permission(self.cache_id, 'user-owner-001')
        assert perm == 'owner'

    def test__02__owner_is_owner(self):
        assert self.vault_acl.is_owner(self.cache_id, 'user-owner-001') is True

    def test__03__owner_can_edit(self):
        assert self.vault_acl.can_edit(self.cache_id, 'user-owner-001') is True

    def test__04__owner_can_view(self):
        assert self.vault_acl.can_view(self.cache_id, 'user-owner-001') is True

    # ═══════════════════════════════════════════════════════════════════════
    # Grant access
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__grant_editor(self):
        result = self.vault_acl.grant_access(
            self.cache_id, 'user-editor-001', 'editor', 'user-owner-001')
        assert result.get('success')    is True
        assert result.get('permission') == 'editor'
        assert result.get('action')     == 'granted'

    def test__11__grant_viewer(self):
        result = self.vault_acl.grant_access(
            self.cache_id, 'user-viewer-001', 'viewer', 'user-owner-001')
        assert result.get('success')    is True
        assert result.get('permission') == 'viewer'

    def test__12__grant_invalid_permission(self):
        result = self.vault_acl.grant_access(
            self.cache_id, 'user-bad-001', 'superadmin', 'user-owner-001')
        assert result.get('success') is False
        assert 'Invalid permission' in result.get('reason', '')

    # ═══════════════════════════════════════════════════════════════════════
    # Permission checks
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__editor_can_edit(self):
        assert self.vault_acl.can_edit(self.cache_id, 'user-editor-001') is True

    def test__21__editor_can_view(self):
        assert self.vault_acl.can_view(self.cache_id, 'user-editor-001') is True

    def test__22__editor_cannot_own(self):
        assert self.vault_acl.is_owner(self.cache_id, 'user-editor-001') is False

    def test__23__viewer_can_view(self):
        assert self.vault_acl.can_view(self.cache_id, 'user-viewer-001') is True

    def test__24__viewer_cannot_edit(self):
        assert self.vault_acl.can_edit(self.cache_id, 'user-viewer-001') is False

    def test__25__viewer_cannot_own(self):
        assert self.vault_acl.is_owner(self.cache_id, 'user-viewer-001') is False

    def test__26__unknown_user_denied(self):
        assert self.vault_acl.can_view(self.cache_id, 'user-unknown-999') is False

    # ═══════════════════════════════════════════════════════════════════════
    # Update permission (re-grant with different level)
    # ═══════════════════════════════════════════════════════════════════════

    def test__30__upgrade_viewer_to_editor(self):
        result = self.vault_acl.grant_access(
            self.cache_id, 'user-viewer-001', 'editor', 'user-owner-001')
        assert result.get('success')    is True
        assert result.get('action')     == 'updated'
        assert result.get('permission') == 'editor'

    def test__31__upgraded_user_can_edit(self):
        assert self.vault_acl.can_edit(self.cache_id, 'user-viewer-001') is True

    # ═══════════════════════════════════════════════════════════════════════
    # List permissions
    # ═══════════════════════════════════════════════════════════════════════

    def test__40__list_permissions(self):
        entries = self.vault_acl.list_permissions(self.cache_id)
        assert len(entries) >= 3                                               # owner + editor + upgraded viewer
        user_ids = [e.get('user_id') for e in entries]
        assert 'user-owner-001'  in user_ids
        assert 'user-editor-001' in user_ids

    # ═══════════════════════════════════════════════════════════════════════
    # Revoke access
    # ═══════════════════════════════════════════════════════════════════════

    def test__50__revoke_editor(self):
        result = self.vault_acl.revoke_access(self.cache_id, 'user-editor-001')
        assert result.get('success') is True
        assert result.get('action')  == 'revoked'

    def test__51__revoked_user_denied(self):
        assert self.vault_acl.can_view(self.cache_id, 'user-editor-001') is False

    def test__52__revoke_owner_blocked(self):
        result = self.vault_acl.revoke_access(self.cache_id, 'user-owner-001')
        assert result.get('success') is False
        assert 'Cannot revoke owner' in result.get('reason', '')

    def test__53__revoke_nonexistent_user(self):
        result = self.vault_acl.revoke_access(self.cache_id, 'user-ghost-999')
        assert result.get('success') is False
