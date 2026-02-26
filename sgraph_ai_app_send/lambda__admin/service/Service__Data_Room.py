# ===============================================================================
# SGraph Send - Data Room Service
# Room lifecycle: create, lookup, list, archive
# Data Room = vault with metadata overlay (Decision 1)
# Uses Service__Vault for storage, Service__Vault__ACL for permissions
# ===============================================================================

import secrets
from   datetime                                                              import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                      import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client         import Send__Cache__Client
from   sgraph_ai_app_send.lambda__admin.service.Service__Vault              import Service__Vault
from   sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL         import Service__Vault__ACL


class Service__Data_Room(Type_Safe):                                         # Data room lifecycle management
    send_cache_client : Send__Cache__Client                                  # Cache client for room metadata
    service_vault     : Service__Vault                                       # Vault service for file storage
    service_vault_acl : Service__Vault__ACL                                  # ACL service for permissions

    # ═══════════════════════════════════════════════════════════════════════
    # Room Lifecycle
    # ═══════════════════════════════════════════════════════════════════════

    def create_room(self, name, owner_user_id, description=''):              # Create a new data room
        if not name or not name.strip():
            return None
        if not owner_user_id or not owner_user_id.strip():
            return None

        room_id         = secrets.token_hex(6)                               # 12-hex room ID
        vault_cache_key = f'room-{room_id}'                                  # Vault keyed by room ID
        now             = datetime.now(timezone.utc).isoformat()

        # Create the underlying vault
        vault_result = self.service_vault.create(
            vault_cache_key  = vault_cache_key  ,
            key_fingerprint  = ''               ,
            owner_user_id    = owner_user_id    )

        if vault_result is None:
            return None

        # Store room metadata
        room_data = dict(room_id         = room_id                   ,
                         name            = name.strip()              ,
                         description     = description.strip()       ,
                         owner_user_id   = owner_user_id.strip()     ,
                         vault_cache_key = vault_cache_key           ,
                         vault_cache_id  = vault_result['cache_id']  ,
                         status          = 'active'                  ,
                         created         = now                       ,
                         member_count    = 1                         )

        result = self.send_cache_client.room__create(room_data)
        if result is None:
            return None

        return dict(room_id         = room_id                   ,
                    name            = room_data['name']         ,
                    description     = room_data['description']  ,
                    owner_user_id   = owner_user_id             ,
                    vault_cache_key = vault_cache_key           ,
                    status          = 'active'                  ,
                    created         = now                       ,
                    member_count    = 1                         )

    def get_room(self, room_id):                                             # Lookup room by room_id
        room_data = self.send_cache_client.room__lookup(room_id)
        if room_data is None:
            return None
        if room_data.get('status') == 'archived':
            return room_data                                                 # Return archived rooms (caller decides what to do)
        return room_data

    def list_rooms(self, user_id=None):                                      # List rooms, optionally filtered by user access
        room_ids = self.send_cache_client.room__list_all()
        rooms    = []
        for room_id in room_ids:
            if room_id:
                room_data = self.send_cache_client.room__lookup(room_id)
                if room_data and room_data.get('status') != 'archived':
                    if user_id is None:
                        rooms.append(room_data)
                    else:
                        vault_cache_id = room_data.get('vault_cache_id', '')
                        if vault_cache_id and self.service_vault_acl.can_view(vault_cache_id, user_id):
                            rooms.append(room_data)
        return rooms

    def archive_room(self, room_id, user_id):                                # Soft-archive a room (owner only)
        room_data = self.send_cache_client.room__lookup(room_id)
        if room_data is None:
            return dict(success=False, reason='not_found')

        vault_cache_id = room_data.get('vault_cache_id', '')
        if not self.service_vault_acl.is_owner(vault_cache_id, user_id):
            return dict(success=False, reason='not_owner')

        room_data['status']   = 'archived'
        room_data['archived'] = datetime.now(timezone.utc).isoformat()
        cache_id = self.send_cache_client.room__lookup_cache_id(room_id)
        if cache_id:
            self.send_cache_client.room__update(cache_id, room_data)

        return dict(success = True      ,
                    room_id = room_id   ,
                    status  = 'archived')

    # ═══════════════════════════════════════════════════════════════════════
    # Member Management (delegates to ACL)
    # ═══════════════════════════════════════════════════════════════════════

    def get_members(self, room_id):                                          # List members of a room
        room_data = self.send_cache_client.room__lookup(room_id)
        if room_data is None:
            return None
        vault_cache_id = room_data.get('vault_cache_id', '')
        return self.service_vault_acl.list_permissions(vault_cache_id)

    def add_member(self, room_id, user_id, permission, granted_by):          # Add a member to a room
        room_data = self.send_cache_client.room__lookup(room_id)
        if room_data is None:
            return dict(success=False, reason='room_not_found')

        vault_cache_id = room_data.get('vault_cache_id', '')

        # Only owner can add members
        if not self.service_vault_acl.is_owner(vault_cache_id, granted_by):
            return dict(success=False, reason='not_owner')

        result = self.service_vault_acl.grant_access(vault_cache_id, user_id, permission, granted_by)

        # Update member count
        if result.get('success') and result.get('action') == 'granted':
            room_data['member_count'] = room_data.get('member_count', 1) + 1
            cache_id = self.send_cache_client.room__lookup_cache_id(room_id)
            if cache_id:
                self.send_cache_client.room__update(cache_id, room_data)

        return result

    def remove_member(self, room_id, user_id, removed_by):                   # Remove a member from a room
        room_data = self.send_cache_client.room__lookup(room_id)
        if room_data is None:
            return dict(success=False, reason='room_not_found')

        vault_cache_id = room_data.get('vault_cache_id', '')

        # Only owner can remove members
        if not self.service_vault_acl.is_owner(vault_cache_id, removed_by):
            return dict(success=False, reason='not_owner')

        result = self.service_vault_acl.revoke_access(vault_cache_id, user_id)

        # Update member count
        if result.get('success'):
            room_data['member_count'] = max(1, room_data.get('member_count', 1) - 1)
            cache_id = self.send_cache_client.room__lookup_cache_id(room_id)
            if cache_id:
                self.send_cache_client.room__update(cache_id, room_data)

        return result
