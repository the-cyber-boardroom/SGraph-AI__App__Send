# ===============================================================================
# SGraph Send - Key Registry Routes
# REST endpoints for public key discovery (admin Lambda)
# ===============================================================================

from fastapi                                                                    import HTTPException
from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.schemas.Schema__Key__Publish__Request    import Schema__Key__Publish__Request
from sgraph_ai_app_send.lambda__admin.service.Service__Keys                    import Service__Keys

TAG__ROUTES_KEYS = 'keys'

ROUTES_PATHS__KEYS = [f'/{TAG__ROUTES_KEYS}/publish'                ,
                      f'/{TAG__ROUTES_KEYS}/lookup/{{code}}'        ,
                      f'/{TAG__ROUTES_KEYS}/unpublish/{{code}}'     ,
                      f'/{TAG__ROUTES_KEYS}/list'                   ,
                      f'/{TAG__ROUTES_KEYS}/log'                    ]


class Routes__Keys(Fast_API__Routes):                                        # Key registry endpoints
    tag          : str = TAG__ROUTES_KEYS
    service_keys : Service__Keys                                             # Injected key service

    def publish(self, body: Schema__Key__Publish__Request) -> dict:          # POST /keys/publish
        public_key_pem  = body.public_key_pem
        signing_key_pem = body.signing_key_pem

        if not public_key_pem:
            raise HTTPException(status_code=400, detail='public_key_pem is required')

        if '-----BEGIN PUBLIC KEY-----' not in public_key_pem:
            raise HTTPException(status_code=400, detail='Invalid PEM format')

        result = self.service_keys.publish(
            public_key_pem  = public_key_pem  ,
            signing_key_pem = signing_key_pem )

        if result is None:
            raise HTTPException(status_code=500, detail='Failed to publish key')

        if result.get('error') == 'duplicate':
            raise HTTPException(status_code=409,
                                detail=f'Key with fingerprint {result["fingerprint"]} already published')

        return result

    def lookup__code(self, code: Safe_Str__Id) -> dict:                      # GET /keys/lookup/{code}
        result = self.service_keys.lookup(code)
        if result is None:
            raise HTTPException(status_code=404, detail='Key not found')
        return result

    def unpublish__code(self, code: Safe_Str__Id) -> dict:                   # DELETE /keys/unpublish/{code}
        result = self.service_keys.unpublish(code)
        if result is None:
            raise HTTPException(status_code=404, detail='Key not found')
        return result

    def list(self) -> dict:                                                  # GET /keys/list
        keys = self.service_keys.list_keys()
        return dict(keys  = keys       ,
                    count = len(keys)  )

    def log(self) -> dict:                                                   # GET /keys/log
        entries = self.service_keys.get_log()
        head    = entries[-1] if entries else None
        return dict(entries = entries ,
                    head    = head    )

    def setup_routes(self):                                                  # Register all key endpoints
        self.add_route_post  (self.publish           )
        self.add_route_get   (self.lookup__code       )
        self.add_route_delete(self.unpublish__code    )
        self.add_route_get   (self.list               )
        self.add_route_get   (self.log                )
        return self
