# ===============================================================================
# SGraph Send - Vault Pointer Routes
# Opaque blob endpoints: write, read, read-base64, delete, batch, list
# ===============================================================================

import base64
from fastapi                                                                     import HTTPException, Request, Response
from osbot_fast_api.api.decorators.route_path                                    import route_path
from osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer             import Service__Vault__Pointer
from sgraph_ai_app_send.lambda__user.user__config                                import HEADER__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_VAULT__WRITE_KEY

TAG__ROUTES_VAULT = 'api/vault'

ROUTES_PATHS__VAULT = [f'/{TAG__ROUTES_VAULT}/write/{{vault_id}}/{{file_id:path}}'        ,
                       f'/{TAG__ROUTES_VAULT}/read/{{vault_id}}/{{file_id:path}}'         ,
                       f'/{TAG__ROUTES_VAULT}/read-base64/{{vault_id}}/{{file_id:path}}'  ,
                       f'/{TAG__ROUTES_VAULT}/delete/{{vault_id}}/{{file_id:path}}'       ,
                       f'/{TAG__ROUTES_VAULT}/batch/{{vault_id}}'                         ,
                       f'/{TAG__ROUTES_VAULT}/list/{{vault_id}}'                          ,
                       f'/{TAG__ROUTES_VAULT}/health/{{vault_id}}'                        ,
                       f'/{TAG__ROUTES_VAULT}/write/{{vault_id}}'                         ,
                       f'/{TAG__ROUTES_VAULT}/read/{{vault_id}}'                          ,
                       f'/{TAG__ROUTES_VAULT}/read-base64/{{vault_id}}'                   ,
                       f'/{TAG__ROUTES_VAULT}/delete/{{vault_id}}'                        ]


LAMBDA_BASE64_LIMIT = 3750000                                                    # ~3.75MB (base64 adds ~33%, must stay under Lambda 5MB response limit)
BATCH_MAX_OPERATIONS = 100                                                       # Max operations per batch request

class Routes__Vault__Pointer(Fast_API__Routes):                                  # Vault file endpoints (write, read, delete, batch, list)
    tag                  : str = TAG__ROUTES_VAULT
    vault_service        : Service__Vault__Pointer                               # Auto-initialized by Type_Safe
    admin_service_client : object = None                                         # Optional Admin__Service__Client

    def check_access_token(self, request: Request):                              # Validate access token from header
        from osbot_utils.utils.Env import get_env
        from sgraph_ai_app_send.lambda__user.user__config import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN
        provided_token = request.headers.get(HEADER__SGRAPH_SEND__ACCESS_TOKEN, '')

        if self.admin_service_client is not None:                                # Admin service available — validate via token_lookup
            if not provided_token:
                raise HTTPException(status_code = 401,
                                    detail      = 'Access token required')
            try:
                response = self.admin_service_client.token_lookup(provided_token)
                if response.status_code == 404:
                    raise HTTPException(status_code = 401,
                                        detail      = 'Invalid access token')
                data = response.json()
                if data.get('status') != 'active':
                    raise HTTPException(status_code = 401,
                                        detail      = f'Access token {data.get("status", "invalid")}')
                return provided_token
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code = 503,
                                    detail      = 'Token validation service unavailable')

        # Fallback to env-var check (no admin service configured)
        expected_token = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        if not expected_token:                                                   # No token configured — allow all (local dev)
            return provided_token or None
        if provided_token != expected_token:
            raise HTTPException(status_code = 401,
                                detail      = 'Access token required')
        return provided_token

    @route_path('/write/{vault_id}/{file_id:path}')
    async def write__vault_id__file_id(self, vault_id : Safe_Str__Id,            # PUT /vault/{vault_id}/write/{file_id:path}
                                             file_id  : str,
                                             request  : Request
                                       ) -> dict:
        self.check_access_token(request)
        write_key = request.headers.get(HEADER__SGRAPH_VAULT__WRITE_KEY, '')
        if not write_key:
            raise HTTPException(status_code = 400,
                                detail      = 'Missing write key')
        payload = await request.body()
        if not payload:
            raise HTTPException(status_code = 400,
                                detail      = 'Empty payload')
        result = self.vault_service.write(vault_id      = str(vault_id)  ,
                                          file_id       = str(file_id)   ,
                                          write_key_hex = write_key      ,
                                          payload_bytes = payload        )
        if result is None:
            raise HTTPException(status_code = 403,
                                detail      = 'Write key mismatch')
        return result

    @route_path('/read/{vault_id}/{file_id:path}')
    def read__vault_id__file_id(self, vault_id : Safe_Str__Id,                   # GET /vault/{vault_id}/read/{file_id:path}
                                      file_id  : str
                               ) -> Response:
        payload = self.vault_service.read(vault_id = str(vault_id),
                                          file_id  = str(file_id) )
        if payload is None:
            raise HTTPException(status_code = 404,
                                detail      = 'Vault file not found')
        return Response(content    = payload                    ,
                        media_type = 'application/octet-stream')

    @route_path('/read-base64/{vault_id}/{file_id:path}')
    def read_base64__vault_id__file_id(self, vault_id : Safe_Str__Id,           # GET /vault/{vault_id}/read-base64/{file_id:path} — JSON-safe base64 read
                                             file_id  : str
                                       ) -> dict:
        payload = self.vault_service.read(vault_id = str(vault_id),
                                          file_id  = str(file_id) )
        if payload is None:
            raise HTTPException(status_code = 404,
                                detail      = 'Vault file not found')
        if len(payload) > LAMBDA_BASE64_LIMIT:
            raise HTTPException(status_code = 413,
                                detail      = 'File too large for base64 download. Use /api/vault/read/{vault_id}/{file_id} instead.')
        return dict(vault_id = str(vault_id)                          ,
                    file_id  = str(file_id)                           ,
                    data     = base64.b64encode(payload).decode('ascii'),
                    size     = len(payload)                           )

    @route_path('/delete/{vault_id}/{file_id:path}')
    async def delete__vault_id__file_id(self, vault_id : Safe_Str__Id,           # DELETE /vault/{vault_id}/delete/{file_id:path}
                                              file_id  : str,
                                              request  : Request
                                        ) -> dict:
        self.check_access_token(request)
        write_key = request.headers.get(HEADER__SGRAPH_VAULT__WRITE_KEY, '')
        if not write_key:
            raise HTTPException(status_code = 400,
                                detail      = 'Missing write key')
        result = self.vault_service.delete(vault_id      = str(vault_id) ,
                                           file_id       = str(file_id)  ,
                                           write_key_hex = write_key     )
        if result is None:
            raise HTTPException(status_code = 403,
                                detail      = 'Write key mismatch or file not found')
        return result

    async def batch__vault_id(self, vault_id : Safe_Str__Id,                     # POST /vault/batch/{vault_id}
                                    request  : Request
                              ) -> dict:
        body = await request.json()
        operations = body.get('operations', [])
        if not operations:
            raise HTTPException(status_code = 400,
                                detail      = 'No operations provided')
        if len(operations) > BATCH_MAX_OPERATIONS:
            raise HTTPException(status_code = 400,
                                detail      = f'Too many operations (max {BATCH_MAX_OPERATIONS})')

        read_only = all(op.get('op') == 'read' for op in operations)

        if read_only:                                                            # Read-only batch — no auth required (data is encrypted)
            return self.vault_service.batch_read(vault_id   = str(vault_id) ,
                                                  operations = operations    )

        self.check_access_token(request)                                         # Mixed/write batch — require auth
        write_key = request.headers.get(HEADER__SGRAPH_VAULT__WRITE_KEY, '')
        if not write_key:
            raise HTTPException(status_code = 400,
                                detail      = 'Missing write key')
        result = self.vault_service.batch(vault_id      = str(vault_id)  ,
                                          operations    = operations      ,
                                          write_key_hex = write_key      )
        if result is None:
            raise HTTPException(status_code = 403,
                                detail      = 'Write key mismatch')
        return result

    def list__vault_id(self, vault_id : Safe_Str__Id,                            # GET /vault/list/{vault_id}?prefix=bare/data/
                             prefix   : str = ''                                 # Query param: filter by file_id prefix
                       ) -> dict:
        return self.vault_service.list_files(vault_id = str(vault_id) ,
                                             prefix   = prefix        )

    @route_path('/health/{vault_id}')
    def health__vault_id(self, vault_id : Safe_Str__Id) -> dict:                # GET /vault/health/{vault_id} — unauthenticated existence check + Lambda warm-up
        manifest_path = self.vault_service.vault_manifest_path(str(vault_id))
        exists        = self.vault_service.storage_fs.file__exists(manifest_path)
        if exists:
            return dict(status = 'ok', vault_id = str(vault_id))
        raise HTTPException(status_code = 404,
                            detail      = 'Vault not found')

    # --- Catch routes: prevent redirect loops when file_id is missing ----------

    @route_path('/write/{vault_id}')
    async def write__vault_id(self, vault_id: str):                              # PUT /vault/write/{vault_id} — missing file_id
        raise HTTPException(status_code=400, detail='Missing file_id in path')

    @route_path('/read/{vault_id}')
    def read__vault_id(self, vault_id: str):                                     # GET /vault/read/{vault_id} — missing file_id
        raise HTTPException(status_code=400, detail='Missing file_id in path')

    @route_path('/read-base64/{vault_id}')
    def read_base64__vault_id(self, vault_id: str):                              # GET /vault/read-base64/{vault_id} — missing file_id
        raise HTTPException(status_code=400, detail='Missing file_id in path')

    @route_path('/delete/{vault_id}')
    async def delete__vault_id(self, vault_id: str):                             # DELETE /vault/delete/{vault_id} — missing file_id
        raise HTTPException(status_code=400, detail='Missing file_id in path')

    def setup_routes(self):                                                      # Register all endpoints
        self.add_route_put   (self.write__vault_id__file_id       )
        self.add_route_get   (self.read__vault_id__file_id        )
        self.add_route_get   (self.read_base64__vault_id__file_id )
        self.add_route_delete(self.delete__vault_id__file_id      )
        self.add_route_post  (self.batch__vault_id                )
        self.add_route_get   (self.list__vault_id                 )
        self.add_route_get   (self.health__vault_id               )
        self.add_route_put   (self.write__vault_id                )              # Catch: missing file_id
        self.add_route_get   (self.read__vault_id                 )              # Catch: missing file_id
        self.add_route_get   (self.read_base64__vault_id          )              # Catch: missing file_id
        self.add_route_delete(self.delete__vault_id               )              # Catch: missing file_id
        return self
