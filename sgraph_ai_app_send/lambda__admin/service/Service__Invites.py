# ===============================================================================
# SGraph Send - Invite Service
# Invite lifecycle: create, validate, accept, expire
# Composes Send__Cache__Client (not Service__Tokens — invites have room-scoped semantics)
# ===============================================================================

import secrets
from   datetime                                                              import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                      import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client         import Send__Cache__Client
from   sgraph_ai_app_send.lambda__admin.service.Service__Data_Room          import Service__Data_Room


class Service__Invites(Type_Safe):                                           # Invite lifecycle management
    send_cache_client  : Send__Cache__Client                                 # Cache client for invite storage
    service_data_room  : Service__Data_Room                                  # Room service for member addition

    # ═══════════════════════════════════════════════════════════════════════
    # Create / Validate / Accept / Expire
    # ═══════════════════════════════════════════════════════════════════════

    def create_invite(self, room_id, permission='viewer',                    # Create a new invite code
                      created_by='', max_uses=1):
        if not room_id:
            return None

        room_data = self.send_cache_client.room__lookup(room_id)
        if room_data is None:
            return None

        if room_data.get('status') == 'archived':
            return None

        invite_code = secrets.token_hex(6).upper()                           # 12-char hex code (e.g., "A1B2C3D4E5F6")
        now         = datetime.now(timezone.utc).isoformat()

        invite_data = dict(invite_code = invite_code    ,
                           room_id     = room_id        ,
                           permission  = permission     ,
                           created_by  = created_by     ,
                           created     = now            ,
                           max_uses    = max_uses       ,
                           used_count  = 0              ,
                           status      = 'active'       ,
                           accepted_by = []             )

        result = self.send_cache_client.invite__create(invite_data)
        if result is None:
            return None

        return dict(invite_code = invite_code ,
                    room_id     = room_id     ,
                    permission  = permission  ,
                    max_uses    = max_uses    ,
                    status      = 'active'    ,
                    created     = now         )

    def validate_invite(self, invite_code):                                  # Check if invite is valid (without consuming)
        invite_data = self.send_cache_client.invite__lookup(invite_code)
        if invite_data is None:
            return dict(valid=False, reason='not_found')

        if invite_data.get('status') != 'active':
            return dict(valid=False, reason=invite_data.get('status', 'unknown'))

        max_uses   = invite_data.get('max_uses', 0)
        used_count = invite_data.get('used_count', 0)
        if max_uses > 0 and used_count >= max_uses:
            return dict(valid=False, reason='exhausted')

        room_id   = invite_data.get('room_id', '')
        room_data = self.send_cache_client.room__lookup(room_id)
        room_name = room_data.get('name', '') if room_data else ''

        return dict(valid      = True       ,
                    room_id    = room_id    ,
                    room_name  = room_name  ,
                    permission = invite_data.get('permission', 'viewer'))

    def accept_invite(self, invite_code, user_id):                           # Accept an invite: add user to room
        invite_data = self.send_cache_client.invite__lookup(invite_code)
        if invite_data is None:
            return dict(success=False, reason='not_found')

        if invite_data.get('status') != 'active':
            return dict(success=False, reason=invite_data.get('status', 'unknown'))

        max_uses   = invite_data.get('max_uses', 0)
        used_count = invite_data.get('used_count', 0)
        if max_uses > 0 and used_count >= max_uses:
            return dict(success=False, reason='exhausted')

        # Check for duplicate acceptance
        accepted_by = invite_data.get('accepted_by', [])
        if user_id in accepted_by:
            return dict(success=False, reason='already_accepted')

        room_id    = invite_data.get('room_id', '')
        permission = invite_data.get('permission', 'viewer')
        created_by = invite_data.get('created_by', '')

        # Add user to room via Data Room service
        result = self.service_data_room.add_member(room_id, user_id, permission, created_by)
        if not result.get('success'):
            return result

        # Update invite usage
        invite_data['used_count'] = used_count + 1
        accepted_by.append(user_id)
        invite_data['accepted_by'] = accepted_by

        if max_uses > 0 and invite_data['used_count'] >= max_uses:
            invite_data['status'] = 'exhausted'

        cache_id = self.send_cache_client.invite__lookup_cache_id(invite_code)
        if cache_id:
            self.send_cache_client.invite__update(cache_id, invite_data)

        return dict(success    = True       ,
                    room_id    = room_id    ,
                    permission = permission ,
                    user_id    = user_id    )

    def expire_invite(self, invite_code):                                    # Manually expire an invite
        invite_data = self.send_cache_client.invite__lookup(invite_code)
        if invite_data is None:
            return dict(success=False, reason='not_found')

        invite_data['status']  = 'expired'
        invite_data['expired'] = datetime.now(timezone.utc).isoformat()

        cache_id = self.send_cache_client.invite__lookup_cache_id(invite_code)
        if cache_id:
            self.send_cache_client.invite__update(cache_id, invite_data)

        return dict(success     = True         ,
                    invite_code = invite_code  ,
                    status      = 'expired'    )

    def list_invites(self, room_id=None):                                    # List invites, optionally filtered by room
        invite_codes = self.send_cache_client.invite__list_all()
        invites      = []
        for code in invite_codes:
            if code:
                invite_data = self.send_cache_client.invite__lookup(code)
                if invite_data:
                    if room_id is None or invite_data.get('room_id') == room_id:
                        invites.append(invite_data)
        return invites
