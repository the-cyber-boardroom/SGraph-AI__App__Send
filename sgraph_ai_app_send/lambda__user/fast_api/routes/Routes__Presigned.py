# ===============================================================================
# SGraph Send - Presigned URL Routes
# REST endpoints for large-file transfer via S3 presigned URLs
# ===============================================================================

from fastapi                                                                         import HTTPException, Request
from osbot_fast_api.api.routes.Fast_API__Routes                                      import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id      import Safe_Str__Id
from osbot_utils.utils.Env                                                           import get_env
from sgraph_ai_app_send.lambda__user.schemas.Schema__Presigned                       import Schema__Presigned__Initiate, Schema__Presigned__Complete
from sgraph_ai_app_send.lambda__user.service.Service__Presigned_Urls                 import Service__Presigned_Urls
from sgraph_ai_app_send.lambda__user.user__config                                    import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_SEND__ACCESS_TOKEN

TAG__ROUTES_PRESIGNED = 'api/presigned'

ROUTES_PATHS__PRESIGNED = [f'/{TAG__ROUTES_PRESIGNED}/capabilities'                        ,
                           f'/{TAG__ROUTES_PRESIGNED}/initiate'                            ,
                           f'/{TAG__ROUTES_PRESIGNED}/complete'                            ,
                           f'/{TAG__ROUTES_PRESIGNED}/abort/{{transfer_id}}/{{upload_id}}' ,
                           f'/{TAG__ROUTES_PRESIGNED}/upload-url/{{transfer_id}}'          ,
                           f'/{TAG__ROUTES_PRESIGNED}/download-url/{{transfer_id}}'        ]


class Routes__Presigned(Fast_API__Routes):                                           # Presigned URL endpoints
    tag                  : str = TAG__ROUTES_PRESIGNED
    presigned_service    : Service__Presigned_Urls                                   # Auto-initialized by Type_Safe
    admin_service_client : object = None                                             # Optional Admin__Service__Client

    def check_access_token(self, request: Request):                                  # Same token validation as Routes__Transfers
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

    # =========================================================================
    # GET /presigned/capabilities — check what upload modes are available
    # =========================================================================

    def capabilities(self) -> dict:                                                  # GET /presigned/capabilities
        return self.presigned_service.get_capabilities()

    # =========================================================================
    # POST /presigned/initiate — start multipart upload, get presigned URLs
    # =========================================================================

    def initiate(self, request_body: Schema__Presigned__Initiate,                    # POST /presigned/initiate
                       request: Request
                ) -> dict:
        self.check_access_token(request)
        result = self.presigned_service.initiate_multipart_upload(
            transfer_id     = str(request_body.transfer_id),
            file_size_bytes = int(request_body.file_size_bytes),
            num_parts       = int(request_body.num_parts) if request_body.num_parts else None
        )
        if 'error' in result:
            if result['error'] == 'transfer_not_found':
                raise HTTPException(status_code=404, detail='Transfer not found')
            if result['error'] == 'transfer_not_pending':
                raise HTTPException(status_code=409, detail='Transfer not in pending state')
            if result['error'] == 'presigned_not_available':
                raise HTTPException(status_code=400, detail=result.get('message', 'Presigned URLs not available'))
            if result['error'] == 'too_many_parts':
                raise HTTPException(status_code=400, detail=result.get('message', 'Too many parts'))
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # POST /presigned/complete — complete multipart upload with ETags
    # =========================================================================

    def complete(self, request_body: Schema__Presigned__Complete,                    # POST /presigned/complete
                       request: Request
                ) -> dict:
        self.check_access_token(request)
        result = self.presigned_service.complete_multipart_upload(
            transfer_id = str(request_body.transfer_id),
            upload_id   = request_body.upload_id,
            parts       = request_body.parts
        )
        if 'error' in result:
            if result['error'] == 'transfer_not_found':
                raise HTTPException(status_code=404, detail='Transfer not found')
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # POST /presigned/abort/{transfer_id}/{upload_id} — cancel multipart upload
    # =========================================================================

    def abort__transfer_id__upload_id(self, transfer_id: Safe_Str__Id,               # POST /presigned/abort/{transfer_id}/{upload_id}
                                            upload_id: str,
                                            request: Request
                                     ) -> dict:
        self.check_access_token(request)
        result = self.presigned_service.abort_multipart_upload(
            transfer_id = str(transfer_id),
            upload_id   = upload_id
        )
        if 'error' in result:
            raise HTTPException(status_code=400, detail=result['error'])
        return result

    # =========================================================================
    # GET /presigned/upload-url/{transfer_id} — single presigned PUT (< 5GB)
    # =========================================================================

    def upload_url__transfer_id(self, transfer_id: Safe_Str__Id,                     # GET /presigned/upload-url/{transfer_id}
                                      request: Request
                               ) -> dict:
        self.check_access_token(request)
        result = self.presigned_service.create_upload_url(transfer_id=str(transfer_id))
        if 'error' in result:
            if result['error'] == 'transfer_not_found':
                raise HTTPException(status_code=404, detail='Transfer not found')
            raise HTTPException(status_code=400, detail=result.get('message', result['error']))
        return result

    # =========================================================================
    # GET /presigned/download-url/{transfer_id} — presigned GET for download
    # =========================================================================

    def download_url__transfer_id(self, transfer_id: Safe_Str__Id,                   # GET /presigned/download-url/{transfer_id}
                                        request: Request
                                 ) -> dict:
        result = self.presigned_service.create_download_url(
            transfer_id   = str(transfer_id),
            downloader_ip = request.client.host if request.client else '',
            user_agent    = request.headers.get('user-agent', ''))
        if 'error' in result:
            if result['error'] == 'transfer_not_found':
                raise HTTPException(status_code=404, detail='Transfer not found')
            if result['error'] == 'transfer_not_completed':
                raise HTTPException(status_code=409, detail='Transfer not completed')
            raise HTTPException(status_code=400, detail=result.get('message', result['error']))
        return result

    # =========================================================================
    # Route registration
    # =========================================================================

    def setup_routes(self):
        self.add_route_get (self.capabilities                    )
        self.add_route_post(self.initiate                        )
        self.add_route_post(self.complete                        )
        self.add_route_post(self.abort__transfer_id__upload_id   )
        self.add_route_get (self.upload_url__transfer_id         )
        self.add_route_get (self.download_url__transfer_id       )
        return self
