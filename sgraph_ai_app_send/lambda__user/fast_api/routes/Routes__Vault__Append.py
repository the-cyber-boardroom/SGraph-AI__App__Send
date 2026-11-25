import base64
import json
from   fastapi                                                                     import HTTPException, Request
from   fastapi.responses                                                           import JSONResponse
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Append              import Service__Vault__Append
from   sgraph_ai_app_send.lambda__user.service.Vault__Append__Config               import CONFIGURE_MAX_BODY
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer             import VAULT_ID_PATTERN
from   sgraph_ai_app_send.lambda__user.user__config                                import (HEADER__SGRAPH_SEND__ACCESS_TOKEN ,
                                                                                           HEADER__SGRAPH_VAULT__WRITE_KEY  ,
                                                                                           HEADER__SGRAPH_VAULT__ENUM_KEY   )

TAG__ROUTES_VAULT_APPEND = 'api/vault/append'

ROUTES_PATHS__VAULT_APPEND = [f'/{TAG__ROUTES_VAULT_APPEND}/limits'                       ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/write/{{vault_id}}'           ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/list/{{vault_id}}'            ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/fetch/{{vault_id}}'           ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/mark-processed/{{vault_id}}'  ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/unmark/{{vault_id}}'          ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/stats/{{vault_id}}'           ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/purge/{{vault_id}}'           ,
                              f'/{TAG__ROUTES_VAULT_APPEND}/configure/{{vault_id}}'       ]


def _reject_json_constant(name):                                                # NaN / Infinity are not JSON; json.loads would accept them
    raise ValueError(f'invalid JSON constant: {name}')


async def _json_body(request: Request) -> dict:                                  # every append body: empty = {}, anything but a JSON object = 400 (never a 500)
    raw = await request.body()
    if not raw or not raw.strip():
        return {}
    try:
        body = json.loads(raw, parse_constant=_reject_json_constant)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code = 400, detail = 'Request body must be a JSON object')
    if not isinstance(body, dict):
        raise HTTPException(status_code = 400, detail = 'Request body must be a JSON object')
    return body


class Routes__Vault__Append(Fast_API__Routes):
    tag            : str = TAG__ROUTES_VAULT_APPEND
    append_service : Service__Vault__Append
    admin_service_client : object = None
    access_token_service : object = None                                         # Lazily-built Service__Access_Token (token-validation cache)

    @staticmethod
    def _validate_vault_id(vault_id):
        if not VAULT_ID_PATTERN.match(str(vault_id)):
            raise HTTPException(status_code = 400,
                                detail      = 'vault_id must be an opaque lowercase alphanumeric string (8-24 chars, no hyphens)')

    def _access_token_service(self):                                            # Lazy singleton — cache persists for the Lambda lifetime (like _manifest_cache)
        if self.access_token_service is None:
            from osbot_utils.utils.Env                                 import get_env
            from sgraph_ai_app_send.lambda__user.service.Service__Access_Token import Service__Access_Token
            from sgraph_ai_app_send.lambda__user.user__config          import (ENV_VAR__SGRAPH_SEND__TOKEN_CACHE_TTL ,
                                                                               DEFAULT__SGRAPH_SEND__TOKEN_CACHE_TTL )
            ttl = int(get_env(ENV_VAR__SGRAPH_SEND__TOKEN_CACHE_TTL, DEFAULT__SGRAPH_SEND__TOKEN_CACHE_TTL))
            self.access_token_service = Service__Access_Token(admin_service_client = self.admin_service_client,
                                                              ttl_seconds          = ttl                      )
        return self.access_token_service

    def _check_access_token(self, request: Request):                            # Validate access token from header (cached — see Service__Access_Token)
        provided_token = request.headers.get(HEADER__SGRAPH_SEND__ACCESS_TOKEN, '')
        return self._access_token_service().check(provided_token)

    async def write__vault_id(self, vault_id: Safe_Str__Id,
                                    request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        body = await _json_body(request)
        append_token = body.get('append_token', '')
        if not append_token:
            raise HTTPException(status_code = 400, detail = 'Missing append_token')
        payload_b64 = body.get('payload', '')
        if not payload_b64:
            raise HTTPException(status_code = 400, detail = 'Missing payload')
        if not isinstance(append_token, str) or not isinstance(payload_b64, str):
            raise HTTPException(status_code = 400, detail = 'append_token and payload must be strings')
        try:
            payload_bytes = base64.b64decode(payload_b64)
        except Exception:
            raise HTTPException(status_code = 400, detail = 'Invalid base64 payload')
        result = self.append_service.append(vault_id      = str(vault_id)  ,
                                            append_token  = append_token  ,
                                            payload_bytes = payload_bytes )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid append_token')
        if result['status'] == 'gate_failed':
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        if result['status'] == 'lane_mode_unsupported':                          # fail closed: a lane mode this build does not know (401: passes the CDN as JSON)
            raise HTTPException(status_code = 401, detail = dict(error='lane_mode_unsupported'))
        if result['status'] == 'payload_too_large':
            raise HTTPException(status_code = 413, detail = dict(error    = 'payload_too_large' ,
                                                                  limit    = result['limit']     ,
                                                                  received = result['received']  ))
        if result['status'] == 'at_capacity':
            raise HTTPException(status_code = 507, detail = 'Insufficient Storage')
        return dict(ok=True)

    async def list__vault_id(self, vault_id: Safe_Str__Id,
                                   request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        enum_key = request.headers.get(HEADER__SGRAPH_VAULT__ENUM_KEY, '')
        if not enum_key:
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        body = await _json_body(request)
        result = self.append_service.list_entries(
            vault_id        = str(vault_id)                     ,
            enum_key        = enum_key                          ,
            inbox           = body.get('inbox')                 ,
            after_file_id   = body.get('after_file_id')         ,
            limit           = body.get('limit')                 ,
            include_content = body.get('include_content', False),
            folder          = body.get('folder', 'pending')     )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid inbox, after_file_id, limit, include_content or folder')
        if result['status'] == 'gate_failed':
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        if result['status'] == 'content_too_large':
            raise HTTPException(status_code = 413, detail = 'Content exceeds inline ceiling')
        return result

    async def fetch__vault_id(self, vault_id: Safe_Str__Id,
                                    request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        enum_key = request.headers.get(HEADER__SGRAPH_VAULT__ENUM_KEY, '')
        if not enum_key:
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        body = await _json_body(request)
        inbox    = body.get('inbox', '')
        file_ids = body.get('file_ids', [])
        if not inbox or not file_ids:
            raise HTTPException(status_code = 400, detail = 'Missing inbox or file_ids')
        result = self.append_service.fetch(vault_id = str(vault_id),
                                           enum_key = enum_key    ,
                                           inbox    = inbox       ,
                                           file_ids = file_ids    )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid inbox or file_ids')
        if result['status'] == 'gate_failed':
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        return result

    async def mark_processed__vault_id(self, vault_id: Safe_Str__Id,
                                              request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        enum_key = request.headers.get(HEADER__SGRAPH_VAULT__ENUM_KEY, '')
        if not enum_key:
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        body = await _json_body(request)
        inbox    = body.get('inbox', '')
        file_ids = body.get('file_ids', [])
        if not inbox or not file_ids:
            raise HTTPException(status_code = 400, detail = 'Missing inbox or file_ids')
        result = self.append_service.mark_processed(vault_id = str(vault_id),
                                                    enum_key = enum_key    ,
                                                    inbox    = inbox       ,
                                                    file_ids = file_ids    )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid inbox or file_ids')
        if result['status'] == 'gate_failed':
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        return result

    async def purge__vault_id(self, vault_id: Safe_Str__Id,
                                    request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        self._check_access_token(request)
        write_key = request.headers.get(HEADER__SGRAPH_VAULT__WRITE_KEY, '')
        if not write_key:
            raise HTTPException(status_code = 400, detail = 'Missing write key')
        body = await _json_body(request)
        folder   = body.get('folder', 'processed')
        inbox    = body.get('inbox', '')
        file_ids = body.get('file_ids')
        if not inbox:
            raise HTTPException(status_code = 400, detail = 'Missing inbox')
        if folder not in ('pending', 'processed'):
            raise HTTPException(status_code = 400, detail = 'folder must be "pending" or "processed"')
        result = self.append_service.purge(vault_id      = str(vault_id),
                                           write_key_hex = write_key   ,
                                           folder        = folder      ,
                                           inbox         = inbox       ,
                                           file_ids      = file_ids    )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid inbox or file_ids')
        if result['status'] == 'gate_failed':
            raise HTTPException(status_code = 403, detail = 'Write key mismatch')
        return result

    async def configure__vault_id(self, vault_id: Safe_Str__Id,
                                        request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        self._check_access_token(request)
        write_key = request.headers.get(HEADER__SGRAPH_VAULT__WRITE_KEY, '')
        if not write_key:
            raise HTTPException(status_code = 400, detail = 'Missing write key')
        if len(await request.body()) > CONFIGURE_MAX_BODY:
            raise HTTPException(status_code = 413, detail = dict(error='configure_body_too_large', limit=CONFIGURE_MAX_BODY))
        body = await _json_body(request)
        result = self.append_service.configure_request(vault_id      = str(vault_id),
                                                       write_key_hex = write_key    ,
                                                       request       = body         )
        if result is None:
            raise HTTPException(status_code = 403, detail = 'Write key mismatch')
        if result.get('status') == 'invalid_input':
            raise HTTPException(status_code = 400, detail = result.get('detail') or 'Invalid configure body')
        if result.get('status') == 'conflict':
            raise HTTPException(status_code = 409, detail = 'Config changed concurrently; retry')
        return result

    def _enum_key(self, request: Request):                                      # new enum-key endpoints answer 401, not 403 (the CDN rewrites 403 into an HTML 404)
        enum_key = request.headers.get(HEADER__SGRAPH_VAULT__ENUM_KEY, '')
        if not enum_key:
            raise HTTPException(status_code = 401, detail = 'Missing enum key')
        return enum_key

    async def unmark__vault_id(self, vault_id: Safe_Str__Id,                     # processed → pending (undo a mark)
                                     request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        enum_key = self._enum_key(request)
        body     = await _json_body(request)
        result   = self.append_service.unmark(vault_id = str(vault_id)          ,
                                              enum_key = enum_key               ,
                                              inbox    = body.get('inbox')      ,
                                              file_ids = body.get('file_ids')   )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid inbox or file_ids')
        if result['status'] == 'unauthorized':
            raise HTTPException(status_code = 401, detail = 'Unauthorized')
        if result['status'] == 'lane_mode_unsupported':
            raise HTTPException(status_code = 401, detail = dict(error='lane_mode_unsupported'))
        return result

    async def stats__vault_id(self, vault_id: Safe_Str__Id,                      # one lane's counts, bytes and times
                                    request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        enum_key = self._enum_key(request)
        body     = await _json_body(request)
        result   = self.append_service.stats(vault_id = str(vault_id)       ,
                                             enum_key = enum_key            ,
                                             inbox    = body.get('inbox')   )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'inbox (the lane token) is required')
        if result['status'] == 'unauthorized':
            raise HTTPException(status_code = 401, detail = 'Unauthorized')
        return result

    def limits(self):                                                            # public: server limits, server time and feature flags (no vault or lane input)
        return JSONResponse(content = self.append_service.limits(),
                            headers = {'cache-control': 'no-store'})            # now_ms must never come from a cache

    def setup_routes(self):
        self.add_route_get (self.limits                   )
        self.add_route_post(self.write__vault_id          )
        self.add_route_post(self.list__vault_id           )
        self.add_route_post(self.fetch__vault_id          )
        self.add_route_post(self.mark_processed__vault_id )
        self.add_route_post(self.unmark__vault_id         )
        self.add_route_post(self.stats__vault_id          )
        self.add_route_post(self.purge__vault_id          )
        self.add_route_post(self.configure__vault_id      )
        return self
