# ===============================================================================
# SGraph Send - Token Routes
# REST endpoints for token management (admin Lambda)
# ===============================================================================

from fastapi                                                                    import HTTPException
from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.schemas.Schema__Token__Create__Request   import Schema__Token__Create__Request
from sgraph_ai_app_send.lambda__admin.schemas.Schema__Token__Use__Request      import Schema__Token__Use__Request
from sgraph_ai_app_send.lambda__admin.service.Service__Tokens                  import Service__Tokens

TAG__ROUTES_TOKENS = 'tokens'

ROUTES_PATHS__TOKENS = [f'/{TAG__ROUTES_TOKENS}/create'               ,
                        f'/{TAG__ROUTES_TOKENS}/lookup/{{token_name}}' ,
                        f'/{TAG__ROUTES_TOKENS}/use/{{token_name}}'    ,
                        f'/{TAG__ROUTES_TOKENS}/revoke/{{token_name}}' ,
                        f'/{TAG__ROUTES_TOKENS}/list'                  ,
                        f'/{TAG__ROUTES_TOKENS}/list-details'          ]


class Routes__Tokens(Fast_API__Routes):                                    # Token management endpoints
    tag             : str = TAG__ROUTES_TOKENS
    service_tokens  : Service__Tokens                                      # Injected token service

    def create(self, body: Schema__Token__Create__Request) -> dict:        # POST /tokens/create (Type_Safe body)
        token_name  = body.token_name
        usage_limit = body.usage_limit
        created_by  = body.created_by
        metadata    = body.metadata

        if not token_name:
            raise HTTPException(status_code=400, detail='token_name is required')

        result = self.service_tokens.create(
            token_name  = token_name  ,
            usage_limit = usage_limit ,
            created_by  = created_by  ,
            metadata    = metadata    )

        if result is None:
            raise HTTPException(status_code=409, detail='Token name already exists')
        return result

    def lookup__token_name(self, token_name: Safe_Str__Id) -> dict:        # GET /tokens/lookup/{token_name}
        result = self.service_tokens.lookup(token_name)
        if result is None:
            raise HTTPException(status_code=404, detail='Token not found')
        return result

    def use__token_name(self, token_name : Safe_Str__Id                ,   # POST /tokens/use/{token_name}
                              body       : Schema__Token__Use__Request = None
                        ) -> dict:
        ip_hash     = body.ip_hash     if body else ''
        action      = body.action      if body else 'page_opened'
        transfer_id = body.transfer_id if body else ''
        return self.service_tokens.use(
            token_name  = token_name  ,
            ip_hash     = ip_hash     ,
            action      = action      ,
            transfer_id = transfer_id )

    def revoke__token_name(self, token_name: Safe_Str__Id) -> dict:        # POST /tokens/revoke/{token_name}
        success = self.service_tokens.revoke(token_name)
        if not success:
            raise HTTPException(status_code=404, detail='Token not found')
        return dict(status='revoked', token_name=token_name)

    def list(self) -> dict:                                                # GET /tokens/list
        token_names = self.service_tokens.list_tokens()
        return dict(token_names=token_names)

    def list_details(self) -> dict:                                        # GET /tokens/list-details
        tokens = self.service_tokens.list_tokens_with_details()            # Single call returns all token data
        return dict(tokens=tokens)

    def setup_routes(self):                                                # Register all token endpoints
        self.add_route_post(self.create              )
        self.add_route_get (self.lookup__token_name  )
        self.add_route_post(self.use__token_name     )
        self.add_route_post(self.revoke__token_name  )
        self.add_route_get (self.list                )
        self.add_route_get (self.list_details        )
        return self
