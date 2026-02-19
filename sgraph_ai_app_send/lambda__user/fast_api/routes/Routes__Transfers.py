# ===============================================================================
# SGraph Send - Transfer Routes
# REST endpoints for encrypted file transfer workflow
# ===============================================================================

import hashlib
from fastapi                                                                     import HTTPException, Request, Response
from osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from osbot_utils.utils.Env                                                       import get_env
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Create
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                   import Transfer__Service
from sgraph_ai_app_send.lambda__user.user__config                                import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_SEND__ACCESS_TOKEN

TAG__ROUTES_TRANSFERS = 'transfers'

ROUTES_PATHS__TRANSFERS = [f'/{TAG__ROUTES_TRANSFERS}/create'                          ,
                           f'/{TAG__ROUTES_TRANSFERS}/upload/{{transfer_id}}'          ,
                           f'/{TAG__ROUTES_TRANSFERS}/complete/{{transfer_id}}'        ,
                           f'/{TAG__ROUTES_TRANSFERS}/info/{{transfer_id}}'            ,
                           f'/{TAG__ROUTES_TRANSFERS}/download/{{transfer_id}}'        ,
                           f'/{TAG__ROUTES_TRANSFERS}/check-token/{{token_name}}'      ,
                           f'/{TAG__ROUTES_TRANSFERS}/validate-token/{{token_name}}'   ]


class Routes__Transfers(Fast_API__Routes):                                       # Transfer workflow endpoints
    tag                  : str = TAG__ROUTES_TRANSFERS
    transfer_service     : Transfer__Service                                     # Auto-initialized by Type_Safe
    admin_service_client : object = None                                         # Optional Admin__Service__Client (typed as object to avoid circular import)

    def check_access_token(self, request: Request):                              # Validate access token — admin service or env-var fallback
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
                return provided_token                                            # Return token name for downstream use
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

    # todo: return type should be Schema__Transfer__Initiated (not raw dict)
    # todo: sender_ip should be extracted from Request object, not hardcoded empty string
    def create(self, request: Schema__Transfer__Create,                           # POST /transfers/create
                     raw_request: Request
              ) -> dict:                                                         # todo: -> Schema__Transfer__Initiated
        self.check_access_token(raw_request)
        result = self.transfer_service.create_transfer(file_size_bytes   = request.file_size_bytes  ,
                                                       content_type_hint = request.content_type_hint,
                                                       sender_ip        = ''                        )
        return dict(transfer_id = result['transfer_id'],                         # todo: return Type_Safe class from service
                    upload_url  = result['upload_url'] )

    async def upload__transfer_id(self, transfer_id : Safe_Str__Id ,             # POST /transfers/upload/{transfer_id} (todo: transfer_id should be Transfer_Id)
                                        request     : Request
                                 ) -> dict:
        self.check_access_token(request)
        body    = await request.body()
        success = self.transfer_service.upload_payload(transfer_id  = transfer_id,
                                                       payload_bytes = body      )
        if success is False:
            raise HTTPException(status_code = 404,
                                detail      = 'Transfer not found or not in pending state')
        return dict(status      = 'uploaded'   ,                                # todo: we shouldn't be creating new objects here
                    transfer_id = transfer_id  ,                                # ideally the service should give us the objects to return
                    size        = len(body)    )

    def complete__transfer_id(self, transfer_id: Safe_Str__Id,                    # POST /transfers/complete/{transfer_id} (todo: should be Transfer_Id)
                                    request: Request
                             ) -> dict:                                          # todo: -> Schema__Transfer__Complete_Response
        token_name = self.check_access_token(request)
        result     = self.transfer_service.complete_transfer(transfer_id)
        if result is None:
            raise HTTPException(status_code = 404,
                                detail      = 'Transfer not found or payload not uploaded')
        # SECURITY FIX: token_name intentionally NOT returned to client (was leaking into shareable URLs)

        # Record token usage on successful upload (the logical "send" event)
        if token_name and self.admin_service_client is not None:
            try:
                ip_hash = hashlib.sha256((request.client.host if request.client else '').encode()).hexdigest()
                self.admin_service_client.token_use(token_name  = token_name              ,
                                                    ip_hash     = ip_hash                  ,
                                                    action      = 'upload_completed'       ,
                                                    transfer_id = str(transfer_id)         )
            except Exception:
                pass                                                             # Non-critical — don't fail the upload if usage tracking fails

        return result

    def info__transfer_id(self, transfer_id: Safe_Str__Id                         # GET /transfers/info/{transfer_id} (todo: should be Transfer_Id)
                         ) -> dict:                                              # todo: -> Schema__Transfer__Info
        result = self.transfer_service.get_transfer_info(transfer_id)
        if result is None:
            raise HTTPException(status_code = 404,
                                detail      = 'Transfer not found')
        return result

    def download__transfer_id(self, transfer_id : Safe_Str__Id,                  # GET /transfers/download/{transfer_id} (todo: should be Transfer_Id)
                                    request     : Request
                             ) -> Response:
        payload = self.transfer_service.get_download_payload(transfer_id  = transfer_id                    ,
                                                             downloader_ip = request.client.host if request.client else '',
                                                             user_agent    = request.headers.get('user-agent', ''))
        if payload is None:
            raise HTTPException(status_code = 404,
                                detail      = 'Transfer not found or not available for download')
        return Response(content    = payload                    ,
                        media_type = 'application/octet-stream')

    def check_token__token_name(self, token_name: str) -> dict:                  # GET /transfers/check_token/{token_name} — lookup only (no usage consumed)
        if self.admin_service_client is None:
            return dict(valid = True, status = 'active')                         # No admin service → always valid (dev mode)
        try:
            response = self.admin_service_client.token_lookup(token_name)
            if response.status_code == 404:
                return dict(valid = False, reason = 'not_found')
            data = response.json()
            remaining = data.get('usage_limit', 0) - data.get('usage_count', 0)
            return dict(valid     = data.get('status') == 'active' ,
                        status    = data.get('status', 'unknown')  ,
                        remaining = remaining                      )
        except Exception:
            raise HTTPException(status_code = 503,
                                detail      = 'Token validation service unavailable')

    def validate_token__token_name(self, token_name : str   ,                    # POST /transfers/validate_token/{token_name} — consume a use (for download page)
                                         request    : Request
                                  ) -> dict:
        if self.admin_service_client is None:
            return dict(success = True)                                          # No admin service → always valid (dev mode)
        try:
            ip_hash = hashlib.sha256((request.client.host if request.client else '').encode()).hexdigest()
            response = self.admin_service_client.token_use(token_name  = token_name    ,
                                                            ip_hash     = ip_hash       ,
                                                            action      = 'page_opened' )
            return response.json()
        except Exception:
            raise HTTPException(status_code = 503,
                                detail      = 'Token validation service unavailable')

    def setup_routes(self):                                                      # Register all endpoints
        self.add_route_post(self.create                    )
        self.add_route_post(self.upload__transfer_id       )
        self.add_route_post(self.complete__transfer_id     )
        self.add_route_get (self.info__transfer_id         )
        self.add_route_get (self.download__transfer_id     )
        self.add_route_get (self.check_token__token_name   )
        self.add_route_post(self.validate_token__token_name)
        return self
