# ===============================================================================
# SGraph Send - Vault Presigned URL Routes
# REST endpoints for vault large-blob transfer via S3 presigned URLs
# ===============================================================================

from fastapi                                                                         import HTTPException, Request
from osbot_fast_api.api.decorators.route_path                                        import route_path
from osbot_fast_api.api.routes.Fast_API__Routes                                      import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id      import Safe_Str__Id
from osbot_utils.utils.Env                                                           import get_env
from sgraph_ai_app_send.lambda__user.schemas.Schema__Vault__Presigned                import Schema__Vault__Presigned__Initiate, Schema__Vault__Presigned__Complete, Schema__Vault__Presigned__Cancel
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Presigned               import Service__Vault__Presigned
from sgraph_ai_app_send.lambda__user.user__config                                    import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_VAULT__WRITE_KEY

TAG__ROUTES_VAULT_PRESIGNED = 'api/vault/presigned'

ROUTES_PATHS__VAULT_PRESIGNED = [f'/{TAG__ROUTES_VAULT_PRESIGNED}/initiate/{{vault_id}}'                ,
                                 f'/{TAG__ROUTES_VAULT_PRESIGNED}/complete/{{vault_id}}'                ,
                                 f'/{TAG__ROUTES_VAULT_PRESIGNED}/cancel/{{vault_id}}'                  ,
                                 f'/{TAG__ROUTES_VAULT_PRESIGNED}/read-url/{{vault_id}}/{{file_id:path}}']


class Routes__Vault__Presigned(Fast_API__Routes):                                    # Vault presigned URL endpoints
    tag                        : str = TAG__ROUTES_VAULT_PRESIGNED
    vault_presigned_service    : Service__Vault__Presigned                            # Auto-initialized by Type_Safe
    admin_service_client       : object = None                                       # Optional Admin__Service__Client

    def check_access_token(self, request: Request):                                  # Same token validation as Routes__Vault__Pointer
        provided_token = request.headers.get(HEADER__SGRAPH_SEND__ACCESS_TOKEN, '')

        if self.admin_service_client is not None:
            if not provided_token:
                raise HTTPException(status_code=401, detail='Access token required')
            try:
                response = self.admin_service_client.token_lookup(provided_token)
                if response.status_code == 404:
                    raise HTTPException(status_code=401, detail='Invalid access token')
                data = response.json()
                if data.get('status') != 'active':
                    raise HTTPException(status_code=401, detail=f'Access token {data.get("status", "invalid")}')
                return provided_token
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=503, detail='Token validation service unavailable')

        expected_token = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        if not expected_token:
            return provided_token or None
        if provided_token != expected_token:
            raise HTTPException(status_code=401, detail='Access token required')
        return provided_token

    def _get_write_key(self, request: Request):                                      # Extract and validate write-key header presence
        write_key = request.headers.get(HEADER__SGRAPH_VAULT__WRITE_KEY, '')
        if not write_key:
            raise HTTPException(status_code=400, detail='Missing write key')
        return write_key

    # =========================================================================
    # POST /vault/presigned/initiate/{vault_id} — start multipart upload
    # =========================================================================

    def initiate__vault_id(self, vault_id    : Safe_Str__Id,                         # POST /vault/presigned/initiate/{vault_id}
                                 request_body: Schema__Vault__Presigned__Initiate,
                                 request     : Request
                          ) -> dict:
        self.check_access_token(request)
        write_key = self._get_write_key(request)
        result = self.vault_presigned_service.initiate_upload(
            vault_id        = str(vault_id)                   ,
            file_id         = request_body.file_id            ,
            file_size_bytes = int(request_body.file_size_bytes),
            write_key_hex   = write_key                       ,
            num_parts       = int(request_body.num_parts) if request_body.num_parts else None
        )
        if 'error' in result:
            if result['error'] == 'write_key_mismatch':
                raise HTTPException(status_code=403, detail='Write key mismatch')
            if result['error'] == 'presigned_not_available':
                raise HTTPException(status_code=400, detail=result.get('message', 'Presigned URLs not available'))
            if result['error'] == 'too_many_parts':
                raise HTTPException(status_code=400, detail=result.get('message', 'Too many parts'))
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # POST /vault/presigned/complete/{vault_id} — complete multipart upload
    # =========================================================================

    def complete__vault_id(self, vault_id    : Safe_Str__Id,                         # POST /vault/presigned/complete/{vault_id}
                                 request_body: Schema__Vault__Presigned__Complete,
                                 request     : Request
                           ) -> dict:
        self.check_access_token(request)
        write_key = self._get_write_key(request)
        result = self.vault_presigned_service.complete_upload(
            vault_id      = str(vault_id)         ,
            file_id       = request_body.file_id  ,
            upload_id     = request_body.upload_id,
            parts         = request_body.parts    ,
            write_key_hex = write_key
        )
        if 'error' in result:
            if result['error'] == 'write_key_mismatch':
                raise HTTPException(status_code=403, detail='Write key mismatch')
            if result['error'] == 'presigned_not_available':
                raise HTTPException(status_code=400, detail=result.get('message', 'Presigned URLs not available'))
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # POST /vault/presigned/cancel/{vault_id} — cancel multipart upload
    # =========================================================================

    def cancel__vault_id(self, vault_id    : Safe_Str__Id,                           # POST /vault/presigned/cancel/{vault_id}
                               request_body: Schema__Vault__Presigned__Cancel,
                               request     : Request
                         ) -> dict:
        self.check_access_token(request)
        write_key = self._get_write_key(request)
        result = self.vault_presigned_service.cancel_upload(
            vault_id      = str(vault_id)           ,
            file_id       = request_body.file_id    ,
            upload_id     = request_body.upload_id  ,
            write_key_hex = write_key
        )
        if 'error' in result:
            if result['error'] == 'write_key_mismatch':
                raise HTTPException(status_code=403, detail='Write key mismatch')
            if result['error'] == 'presigned_not_available':
                raise HTTPException(status_code=400, detail=result.get('message', 'Presigned URLs not available'))
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # GET /vault/presigned/read-url/{vault_id}/{file_id} — presigned download
    # =========================================================================

    @route_path('/read-url/{vault_id}/{file_id:path}')
    def read_url__vault_id__file_id(self, vault_id: Safe_Str__Id,                    # GET /vault/presigned/read-url/{vault_id}/{file_id:path}
                                          file_id : str
                                    ) -> dict:                                       # No auth required (same as /api/vault/read/)
        result = self.vault_presigned_service.create_read_url(
            vault_id = str(vault_id),
            file_id  = str(file_id)
        )
        if 'error' in result:
            if result['error'] == 'presigned_not_available':
                raise HTTPException(status_code=400, detail=result.get('message', 'Presigned URLs not available'))
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # Route registration
    # =========================================================================

    def setup_routes(self):
        self.add_route_post(self.initiate__vault_id             )
        self.add_route_post(self.complete__vault_id             )
        self.add_route_post(self.cancel__vault_id               )
        self.add_route_get (self.read_url__vault_id__file_id    )
        return self
