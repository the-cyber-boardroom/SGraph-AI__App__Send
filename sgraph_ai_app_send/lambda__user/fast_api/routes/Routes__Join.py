# ===============================================================================
# SGraph Send - Join Routes (User Lambda)
# Recipient-facing endpoints for data room entry via invite code
# Flow: validate → accept → session → room access
# ===============================================================================

from   fastapi                                                                      import HTTPException
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Invite__Accept__Request    import Schema__Invite__Accept__Request
from   sgraph_ai_app_send.lambda__admin.service.Service__Invites                   import Service__Invites
from   sgraph_ai_app_send.lambda__admin.service.Service__Room__Session             import Service__Room__Session
from   sgraph_ai_app_send.lambda__admin.service.Service__Audit                     import Service__Audit

TAG__ROUTES_JOIN = 'join'

ROUTES_PATHS__JOIN = [f'/{TAG__ROUTES_JOIN}/validate/{{invite_code}}'  ,
                      f'/{TAG__ROUTES_JOIN}/accept/{{invite_code}}'    ,
                      f'/{TAG__ROUTES_JOIN}/session-validate'          ]


class Routes__Join(Fast_API__Routes):                                              # Room join endpoints (user-facing)
    tag              : str = TAG__ROUTES_JOIN
    service_invites  : Service__Invites                                            # Injected invite service
    service_session  : Service__Room__Session                                      # Injected session service
    service_audit    : Service__Audit                                              # Injected audit service

    # ═══════════════════════════════════════════════════════════════════════
    # Validate invite (no side effects)
    # ═══════════════════════════════════════════════════════════════════════

    def validate__invite_code(self, invite_code: Safe_Str__Id) -> dict:            # GET /join/validate/{invite_code}
        return self.service_invites.validate_invite(invite_code)

    # ═══════════════════════════════════════════════════════════════════════
    # Accept invite + create session (single call)
    # Returns session_token + room metadata so UI can redirect to room
    # ═══════════════════════════════════════════════════════════════════════

    def accept__invite_code(self, invite_code: Safe_Str__Id,                       # POST /join/accept/{invite_code}
                            body: Schema__Invite__Accept__Request) -> dict:
        if not body.user_id:
            raise HTTPException(status_code=400, detail='user_id is required')

        # 1. Accept invite (adds user as room member)
        accept_result = self.service_invites.accept_invite(invite_code, body.user_id)
        if not accept_result.get('success'):
            reason = accept_result.get('reason', 'Failed')
            status = 404 if reason == 'not_found' else 400
            raise HTTPException(status_code=status, detail=reason)

        room_id    = accept_result.get('room_id', '')
        permission = accept_result.get('permission', 'viewer')

        # 2. Create session token for immediate room access
        session = self.service_session.create_session(room_id, body.user_id, permission)

        # 3. Look up room metadata for the UI
        room_data = self.service_invites.service_data_room.get_room(room_id)
        room_name      = room_data.get('name', '')           if room_data else ''
        vault_cache_key = room_data.get('vault_cache_key', '') if room_data else ''

        # 4. Audit
        self.service_audit.log(room_id, body.user_id, 'invite.accepted',
                               target_guid=invite_code)

        return dict(success         = True            ,
                    room_id         = room_id         ,
                    room_name       = room_name       ,
                    vault_cache_key = vault_cache_key  ,
                    permission      = permission       ,
                    session_token   = session.get('session_token', '') if session else '' ,
                    expires         = session.get('expires', '')       if session else '' )

    # ═══════════════════════════════════════════════════════════════════════
    # Validate session (for room page to check access on load)
    # ═══════════════════════════════════════════════════════════════════════

    def session_validate(self, session_token: str = '') -> dict:                   # GET /join/session/validate?session_token=...
        if not session_token:
            raise HTTPException(status_code=400, detail='session_token is required')
        result = self.service_session.validate_session(session_token)

        if result.get('valid'):
            room_id   = result.get('room_id', '')
            room_data = self.service_invites.service_data_room.get_room(room_id)
            result['room_name']       = room_data.get('name', '')            if room_data else ''
            result['vault_cache_key'] = room_data.get('vault_cache_key', '') if room_data else ''

        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Route Registration
    # ═══════════════════════════════════════════════════════════════════════

    def setup_routes(self):                                                        # Register all join endpoints
        self.add_route_get  (self.validate__invite_code )
        self.add_route_post (self.accept__invite_code   )
        self.add_route_get  (self.session_validate      )
        return self
