# ===============================================================================
# SGraph Send - Vault ACL Route Tests
# Tests vault share/unshare/permissions endpoints via shared test client
#
# Route patterns:
#   POST   /vault/share/{vault_cache_key}
#   DELETE /vault/unshare/{vault_cache_key}/{user_id}
#   GET    /vault/permissions/{vault_cache_key}
# ===============================================================================

import unittest
from unittest                                                                        import TestCase
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User            import setup__fast_api__user__test_objs


@unittest.skip("Vault routes removed from User Lambda for v0.2.0 CloudFront separation — re-enable when vault moves to admin Lambda")
class test_Routes__Vault__ACL(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client   = _.fast_api__client
            cls.fast_api = _.fast_api

    def _create_vault(self):
        """Helper: create a vault and return the cache key."""
        import secrets
        vault_cache_key = secrets.token_hex(16)
        response = self.client.post('/vault/create',
                                    json=dict(vault_cache_key  = vault_cache_key,
                                              key_fingerprint  = 'sha256:test1234'))
        assert response.status_code == 200
        return vault_cache_key

    # =========================================================================
    # POST /vault/share/{vault_cache_key}
    # =========================================================================

    def test__share__grants_access(self):
        vck = self._create_vault()
        response = self.client.post(f'/vault/share/{vck}',
                                    json=dict(user_id    = 'user-alice-fp',
                                              permission = 'viewer'))
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True

    def test__share__editor_permission(self):
        vck = self._create_vault()
        response = self.client.post(f'/vault/share/{vck}',
                                    json=dict(user_id    = 'user-bob-fp',
                                              permission = 'editor'))
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True

    def test__share__vault_not_found(self):
        response = self.client.post('/vault/share/nonexistent0000',
                                    json=dict(user_id    = 'user-x',
                                              permission = 'viewer'))
        assert response.status_code == 404

    # =========================================================================
    # GET /vault/permissions/{vault_cache_key}
    # =========================================================================

    def test__permissions__lists_grantees(self):
        vck = self._create_vault()
        # Share with two users
        self.client.post(f'/vault/share/{vck}',
                         json=dict(user_id='alice', permission='viewer'))
        self.client.post(f'/vault/share/{vck}',
                         json=dict(user_id='bob', permission='editor'))

        response = self.client.get(f'/vault/permissions/{vck}')
        assert response.status_code == 200
        data = response.json()
        assert data['vault_cache_key']   == vck
        assert len(data['permissions'])  >= 2

        user_ids = [p['user_id'] for p in data['permissions']]
        assert 'alice' in user_ids
        assert 'bob'   in user_ids

    def test__permissions__empty_vault(self):
        vck = self._create_vault()
        response = self.client.get(f'/vault/permissions/{vck}')
        assert response.status_code == 200
        data = response.json()
        assert data['permissions'] is not None

    def test__permissions__vault_not_found(self):
        response = self.client.get('/vault/permissions/nonexistent0000')
        assert response.status_code == 404

    # =========================================================================
    # DELETE /vault/unshare/{vault_cache_key}/{user_id}
    # =========================================================================

    def test__unshare__revokes_access(self):
        vck = self._create_vault()
        self.client.post(f'/vault/share/{vck}',
                         json=dict(user_id='carol', permission='viewer'))

        response = self.client.delete(f'/vault/unshare/{vck}/carol')
        assert response.status_code == 200
        data = response.json()
        assert data.get('success') is True

    def test__unshare__vault_not_found(self):
        response = self.client.delete('/vault/unshare/nonexistent0000/someone')
        assert response.status_code == 404

    # =========================================================================
    # Full sharing lifecycle
    # =========================================================================

    def test__full_share_lifecycle(self):
        # Create vault
        vck = self._create_vault()

        # Share with alice (viewer)
        resp = self.client.post(f'/vault/share/{vck}',
                                json=dict(user_id='alice', permission='viewer'))
        assert resp.status_code == 200

        # Share with bob (editor)
        resp = self.client.post(f'/vault/share/{vck}',
                                json=dict(user_id='bob', permission='editor'))
        assert resp.status_code == 200

        # List permissions — should have both
        resp = self.client.get(f'/vault/permissions/{vck}')
        assert resp.status_code == 200
        perms = resp.json()['permissions']
        user_ids = [p['user_id'] for p in perms]
        assert 'alice' in user_ids
        assert 'bob'   in user_ids

        # Unshare alice
        resp = self.client.delete(f'/vault/unshare/{vck}/alice')
        assert resp.status_code == 200

        # List permissions — only bob remains
        resp = self.client.get(f'/vault/permissions/{vck}')
        perms = resp.json()['permissions']
        user_ids = [p['user_id'] for p in perms]
        assert 'alice' not in user_ids
        assert 'bob'        in user_ids
