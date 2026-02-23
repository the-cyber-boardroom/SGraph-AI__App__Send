# ===============================================================================
# SGraph Send - Vault Access Control Service
# Permission management: grant, revoke, check, list
# ACL entries stored as child data under the vault cache entry
# Permission levels: owner, editor, viewer
# ===============================================================================

import secrets
from   datetime                                                                    import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault        import Send__Cache__Client__Vault

VALID_PERMISSIONS = ('owner', 'editor', 'viewer')

# Permission hierarchy: owner > editor > viewer
PERMISSION_RANK = dict(owner  = 3 ,
                       editor = 2 ,
                       viewer = 1 )


class Service__Vault__ACL(Type_Safe):                                        # Vault access control management
    vault_cache_client : Send__Cache__Client__Vault                          # Dedicated vault cache client

    # ═══════════════════════════════════════════════════════════════════════
    # Grant / Revoke
    # ═══════════════════════════════════════════════════════════════════════

    def grant_access(self, cache_id, user_id, permission, granted_by):       # Grant a user access to a vault
        if permission not in VALID_PERMISSIONS:
            return dict(success=False, reason=f'Invalid permission: {permission}')

        # Check if user already has access
        existing = self.vault_cache_client.acl__get(cache_id, user_id)
        if existing is not None:
            # Update existing permission
            existing['permission'] = permission
            existing['granted_by'] = granted_by
            existing['updated']    = datetime.now(timezone.utc).isoformat()
            self.vault_cache_client.acl__update(cache_id, user_id, existing)
            return dict(success    = True        ,
                        user_id    = user_id     ,
                        permission = permission  ,
                        action     = 'updated'   )

        acl_entry = dict(user_id    = user_id                                        ,
                         permission = permission                                     ,
                         granted_by = granted_by                                     ,
                         granted_at = datetime.now(timezone.utc).isoformat()         ,
                         active     = True                                           )

        result = self.vault_cache_client.acl__store(cache_id, user_id, acl_entry)
        if result is None:
            return dict(success=False, reason='Failed to store ACL entry')

        return dict(success    = True        ,
                    user_id    = user_id     ,
                    permission = permission  ,
                    action     = 'granted'   )

    def revoke_access(self, cache_id, user_id):                              # Revoke a user's access to a vault
        existing = self.vault_cache_client.acl__get(cache_id, user_id)
        if existing is None:
            return dict(success=False, reason='No access entry found')

        if existing.get('permission') == 'owner':
            return dict(success=False, reason='Cannot revoke owner access')

        self.vault_cache_client.acl__delete(cache_id, user_id)

        return dict(success = True          ,
                    user_id = user_id       ,
                    action  = 'revoked'     )

    # ═══════════════════════════════════════════════════════════════════════
    # Check / Query
    # ═══════════════════════════════════════════════════════════════════════

    def check_permission(self, cache_id, user_id, required_permission):      # Check if user has at least the required permission
        entry = self.vault_cache_client.acl__get(cache_id, user_id)
        if entry is None:
            return False
        if not entry.get('active', True):
            return False

        user_rank     = PERMISSION_RANK.get(entry.get('permission'), 0)
        required_rank = PERMISSION_RANK.get(required_permission, 0)
        return user_rank >= required_rank

    def get_permission(self, cache_id, user_id):                             # Get a user's permission level for a vault
        entry = self.vault_cache_client.acl__get(cache_id, user_id)
        if entry is None:
            return None
        if not entry.get('active', True):
            return None
        return entry.get('permission')

    def list_permissions(self, cache_id):                                    # List all ACL entries for a vault
        response = self.vault_cache_client.acl__list(cache_id)
        if response is None:
            return []

        # Extract file IDs from the list response
        file_ids = []
        if hasattr(response, 'files'):                                       # Schema__Cache__Data__List__Response
            for f in response.files:
                fid = f.data_file_id if hasattr(f, 'data_file_id') else None
                if fid:
                    file_ids.append(str(fid))
        elif isinstance(response, dict):
            file_ids = response.get('data_files', [])
        elif isinstance(response, list):
            file_ids = response

        # Resolve each ACL entry by user_id
        acl_list = []
        for file_id in file_ids:
            entry = self.vault_cache_client.acl__get(cache_id, file_id)
            if entry and entry.get('active', True):
                acl_list.append(entry)
        return acl_list

    def is_owner(self, cache_id, user_id):                                   # Check if user is the vault owner
        return self.check_permission(cache_id, user_id, 'owner')

    def can_edit(self, cache_id, user_id):                                   # Check if user can edit (editor or owner)
        return self.check_permission(cache_id, user_id, 'editor')

    def can_view(self, cache_id, user_id):                                   # Check if user can view (viewer, editor, or owner)
        return self.check_permission(cache_id, user_id, 'viewer')
