# ===============================================================================
# SGraph Send - Invite Routes
# REST endpoints for invite validation and acceptance
# Separated from Routes__Data_Room because recipients use these without room context
# ===============================================================================

from   fastapi                                                                      import HTTPException
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Invite__Accept__Request    import Schema__Invite__Accept__Request
from   sgraph_ai_app_send.lambda__admin.service.Service__Invites                   import Service__Invites
from   sgraph_ai_app_send.lambda__admin.service.Service__Audit                     import Service__Audit

TAG__ROUTES_INVITES = 'invites'

ROUTES_PATHS__INVITES = [f'/{TAG__ROUTES_INVITES}/validate/{{invite_code}}'  ,
                         f'/{TAG__ROUTES_INVITES}/accept/{{invite_code}}'    ,
                         f'/{TAG__ROUTES_INVITES}/expire/{{invite_code}}'    ]


class Routes__Invites(Fast_API__Routes):                                     # Invite endpoints (recipient-facing)
    tag             : str = TAG__ROUTES_INVITES
    service_invites : Service__Invites                                       # Injected invite service
    service_audit   : Service__Audit                                         # Injected audit service

    # ═══════════════════════════════════════════════════════════════════════
    # Validate / Accept / Expire
    # ═══════════════════════════════════════════════════════════════════════

    def validate__invite_code(self, invite_code: Safe_Str__Id) -> dict:     # GET /invites/validate/{invite_code}
        result = self.service_invites.validate_invite(invite_code)
        return result

    def accept__invite_code(self, invite_code: Safe_Str__Id,                # POST /invites/accept/{invite_code}
                            body: Schema__Invite__Accept__Request) -> dict:
        if not body.user_id:
            raise HTTPException(status_code=400, detail='user_id is required')
        result = self.service_invites.accept_invite(invite_code, body.user_id)
        if not result.get('success'):
            reason = result.get('reason', 'Failed')
            status = 404 if reason == 'not_found' else 400
            raise HTTPException(status_code=status, detail=reason)
        self.service_audit.log(result.get('room_id', ''), body.user_id,
                               'invite.accepted', target_guid=invite_code)
        return result

    def expire__invite_code(self, invite_code: Safe_Str__Id) -> dict:       # POST /invites/expire/{invite_code}
        result = self.service_invites.expire_invite(invite_code)
        if not result.get('success'):
            raise HTTPException(status_code=404, detail=result.get('reason', 'Failed'))
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Route Registration
    # ═══════════════════════════════════════════════════════════════════════

    def setup_routes(self):                                                  # Register all invite endpoints
        self.add_route_get  (self.validate__invite_code )
        self.add_route_post (self.accept__invite_code   )
        self.add_route_post (self.expire__invite_code   )
        return self
