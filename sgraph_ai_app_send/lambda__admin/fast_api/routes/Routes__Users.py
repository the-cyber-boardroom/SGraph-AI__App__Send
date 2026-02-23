# ===============================================================================
# SGraph Send - User Routes
# REST endpoints for user identity management (admin Lambda)
# ===============================================================================

from   fastapi                                                                      import HTTPException
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__User__Create__Request      import Schema__User__Create__Request
from   sgraph_ai_app_send.lambda__admin.service.Service__Users                     import Service__Users

TAG__ROUTES_USERS = 'users'

ROUTES_PATHS__USERS = [f'/{TAG__ROUTES_USERS}/create'                         ,
                       f'/{TAG__ROUTES_USERS}/lookup/{{user_id}}'             ,
                       f'/{TAG__ROUTES_USERS}/fingerprint/{{key_fingerprint}}',
                       f'/{TAG__ROUTES_USERS}/list'                           ]


class Routes__Users(Fast_API__Routes):                                         # User identity endpoints
    tag           : str = TAG__ROUTES_USERS
    service_users : Service__Users                                             # Injected user service

    # ═══════════════════════════════════════════════════════════════════════
    # User Lifecycle
    # ═══════════════════════════════════════════════════════════════════════

    def create(self, body: Schema__User__Create__Request) -> dict:            # POST /users/create
        if not body.display_name:
            raise HTTPException(status_code=400, detail='display_name is required')
        if not body.key_fingerprint:
            raise HTTPException(status_code=400, detail='key_fingerprint is required')
        result = self.service_users.create(body.display_name, body.key_fingerprint)
        if result is None:
            raise HTTPException(status_code=409, detail='User with this key already exists')
        return result

    def lookup__user_id(self, user_id: Safe_Str__Id) -> dict:                # GET /users/lookup/{user_id}
        result = self.service_users.lookup(user_id)
        if result is None:
            raise HTTPException(status_code=404, detail='User not found')
        return result

    def fingerprint__key_fingerprint(self, key_fingerprint: str) -> dict:    # GET /users/fingerprint/{key_fingerprint}
        result = self.service_users.lookup_by_fingerprint(key_fingerprint)
        if result is None:
            raise HTTPException(status_code=404, detail='User not found for this fingerprint')
        return result

    def list(self) -> dict:                                                   # GET /users/list
        return dict(users=self.service_users.list_users())

    # ═══════════════════════════════════════════════════════════════════════
    # Route Registration
    # ═══════════════════════════════════════════════════════════════════════

    def setup_routes(self):                                                   # Register all user endpoints
        self.add_route_post(self.create                            )
        self.add_route_get (self.lookup__user_id                   )
        self.add_route_get (self.fingerprint__key_fingerprint      )
        self.add_route_get (self.list                              )
        return self
