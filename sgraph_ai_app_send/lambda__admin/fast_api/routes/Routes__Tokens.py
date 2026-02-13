# ===============================================================================
# SGraph Send - Token Routes
# REST endpoints for token management (admin Lambda)
# ===============================================================================

from fastapi                                                                    import HTTPException
from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from sgraph_ai_app_send.lambda__admin.service.Service__Tokens                  import Service__Tokens

TAG__ROUTES_TOKENS = 'tokens'

ROUTES_PATHS__TOKENS = [f'/{TAG__ROUTES_TOKENS}/create'               ,
                        f'/{TAG__ROUTES_TOKENS}/lookup/{{token_name}}' ,
                        f'/{TAG__ROUTES_TOKENS}/use/{{token_name}}'    ,
                        f'/{TAG__ROUTES_TOKENS}/revoke/{{token_name}}' ,
                        f'/{TAG__ROUTES_TOKENS}/list'                  ]


class Routes__Tokens(Fast_API__Routes):                                    # Token management endpoints
    tag             : str = TAG__ROUTES_TOKENS
    service_tokens  : Service__Tokens                                      # Injected token service

    def create(self, body: dict) -> dict:                                   # POST /tokens/create (JSON body)
        token_name  = body.get('token_name' , '')
        usage_limit = body.get('usage_limit', 0)
        created_by  = body.get('created_by' , 'admin')
        metadata    = body.get('metadata'   , {})

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

    def lookup__token_name(self, token_name: str) -> dict:                 # GET /tokens/lookup/{token_name}
        result = self.service_tokens.lookup(token_name)
        if result is None:
            raise HTTPException(status_code=404, detail='Token not found')
        return result

    def use__token_name(self, token_name: str, body: dict = None) -> dict: # POST /tokens/use/{token_name}
        ip_hash     = body.get('ip_hash'    , '') if body else ''
        action      = body.get('action'     , 'page_opened') if body else 'page_opened'
        transfer_id = body.get('transfer_id', '') if body else ''
        return self.service_tokens.use(
            token_name  = token_name  ,
            ip_hash     = ip_hash     ,
            action      = action      ,
            transfer_id = transfer_id )

    def revoke__token_name(self, token_name: str) -> dict:                 # POST /tokens/revoke/{token_name}
        success = self.service_tokens.revoke(token_name)
        if not success:
            raise HTTPException(status_code=404, detail='Token not found')
        return dict(status='revoked', token_name=token_name)

    def list(self) -> dict:                                                # GET /tokens/list
        files = self.service_tokens.list_tokens()
        return dict(files=files)

    def setup_routes(self):                                                # Register all token endpoints
        self.add_route_post(self.create              )
        self.add_route_get (self.lookup__token_name  )
        self.add_route_post(self.use__token_name     )
        self.add_route_post(self.revoke__token_name  )
        self.add_route_get (self.list                )
        return self
