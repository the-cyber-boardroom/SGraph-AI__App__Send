# ===============================================================================
# SGraph Send - Transfer Routes
# REST endpoints for encrypted file transfer workflow
# ===============================================================================

from fastapi                                                                     import HTTPException, Request, Response
from osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from osbot_utils.utils.Env                                                       import get_env
from sgraph_ai_app_send.lambda__user.schemas.Schema__Transfer                    import Schema__Transfer__Create
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                   import Transfer__Service
from sgraph_ai_app_send.lambda__user.user__config                                import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_SEND__ACCESS_TOKEN

TAG__ROUTES_TRANSFERS = 'transfers'

ROUTES_PATHS__TRANSFERS = [f'/{TAG__ROUTES_TRANSFERS}/create'                  ,
                           f'/{TAG__ROUTES_TRANSFERS}/upload/{{transfer_id}}'  ,
                           f'/{TAG__ROUTES_TRANSFERS}/complete/{{transfer_id}}',
                           f'/{TAG__ROUTES_TRANSFERS}/info/{{transfer_id}}'    ,
                           f'/{TAG__ROUTES_TRANSFERS}/download/{{transfer_id}}']


def check_access_token(request: Request):                                          # Validate access token on protected routes
    expected_token = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
    if not expected_token:                                                         # No token configured — allow all (local dev)
        return
    provided_token = request.headers.get(HEADER__SGRAPH_SEND__ACCESS_TOKEN, '')
    if provided_token != expected_token:
        raise HTTPException(status_code = 401,
                            detail      = 'Access token required')


class Routes__Transfers(Fast_API__Routes):                                       # Transfer workflow endpoints
    tag              : str = TAG__ROUTES_TRANSFERS
    transfer_service : Transfer__Service                                         # Auto-initialized by Type_Safe

    # todo: return type should be Schema__Transfer__Initiated (not raw dict)
    # todo: sender_ip should be extracted from Request object, not hardcoded empty string
    def create(self, request: Schema__Transfer__Create,                           # POST /transfers/create
                     raw_request: Request
              ) -> dict:                                                         # todo: -> Schema__Transfer__Initiated
        check_access_token(raw_request)
        result = self.transfer_service.create_transfer(file_size_bytes   = request.file_size_bytes  ,
                                                       content_type_hint = request.content_type_hint,
                                                       sender_ip        = ''                        )
        return dict(transfer_id = result['transfer_id'],                         # todo: return Type_Safe class from service
                    upload_url  = result['upload_url'] )

    async def upload__transfer_id(self, transfer_id : Safe_Str__Id ,             # POST /transfers/upload/{transfer_id} (todo: transfer_id should be Transfer_Id)
                                        request     : Request
                                 ) -> dict:
        check_access_token(request)
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
        check_access_token(request)
        result = self.transfer_service.complete_transfer(transfer_id)
        if result is None:
            raise HTTPException(status_code = 404,
                                detail      = 'Transfer not found or payload not uploaded')
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

    def setup_routes(self):                                                      # Register all endpoints
        self.add_route_post(self.create                    )
        self.add_route_post(self.upload__transfer_id       )
        self.add_route_post(self.complete__transfer_id     )
        self.add_route_get (self.info__transfer_id         )
        self.add_route_get (self.download__transfer_id     )
        return self
