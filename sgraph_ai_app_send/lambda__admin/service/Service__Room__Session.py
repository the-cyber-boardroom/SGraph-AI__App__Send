# ===============================================================================
# SGraph Send - Room Session Service
# Room-scoped session tokens (Decision 4)
# Lightweight auth: short code → session → access
# No JWT, no OAuth — opaque token scoped to room + permission + expiry
# ===============================================================================

import secrets
from   datetime                                                              import datetime, timezone, timedelta
from   osbot_utils.type_safe.Type_Safe                                      import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client         import Send__Cache__Client

DEFAULT_SESSION_HOURS = 24                                                   # Default session duration


class Service__Room__Session(Type_Safe):                                     # Room session management
    send_cache_client : Send__Cache__Client                                  # Cache client for session storage

    # ═══════════════════════════════════════════════════════════════════════
    # Create / Validate / Revoke
    # ═══════════════════════════════════════════════════════════════════════

    def create_session(self, room_id, user_id, permission,                   # Create a room-scoped session token
                       hours=DEFAULT_SESSION_HOURS):
        if not room_id or not user_id:
            return None

        session_token = secrets.token_hex(16)                                # 32-char opaque token
        now           = datetime.now(timezone.utc)
        expires       = now + timedelta(hours=hours)

        session_data = dict(session_token = session_token          ,
                            room_id       = room_id                ,
                            user_id       = user_id                ,
                            permission    = permission             ,
                            created       = now.isoformat()        ,
                            expires       = expires.isoformat()    ,
                            status        = 'active'               )

        result = self.send_cache_client.session__create(session_data)
        if result is None:
            return None

        return dict(session_token = session_token          ,
                    room_id       = room_id                ,
                    user_id       = user_id                ,
                    permission    = permission             ,
                    expires       = expires.isoformat()    )

    def validate_session(self, session_token):                               # Validate a session token
        session_data = self.send_cache_client.session__lookup(session_token)
        if session_data is None:
            return dict(valid=False, reason='not_found')

        if session_data.get('status') != 'active':
            return dict(valid=False, reason='revoked')

        # Check expiry
        expires_str = session_data.get('expires', '')
        if expires_str:
            expires = datetime.fromisoformat(expires_str)
            if datetime.now(timezone.utc) > expires:
                return dict(valid=False, reason='expired')

        return dict(valid      = True                                    ,
                    room_id    = session_data.get('room_id', '')         ,
                    user_id    = session_data.get('user_id', '')         ,
                    permission = session_data.get('permission', '')      )

    def revoke_session(self, session_token):                                 # Revoke a session token
        session_data = self.send_cache_client.session__lookup(session_token)
        if session_data is None:
            return dict(success=False, reason='not_found')

        session_data['status']  = 'revoked'
        session_data['revoked'] = datetime.now(timezone.utc).isoformat()

        cache_id = self.send_cache_client.session__lookup_cache_id(session_token)
        if cache_id:
            self.send_cache_client.session__update(cache_id, session_data)

        return dict(success       = True          ,
                    session_token = session_token  ,
                    status        = 'revoked'      )
