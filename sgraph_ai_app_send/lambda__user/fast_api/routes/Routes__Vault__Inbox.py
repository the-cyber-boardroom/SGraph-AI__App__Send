# ===============================================================================
# SGraph Send - Vault Inbox Routes
# Append-only inbox: append, list, fetch, mark-processed, purge, configure
# ===============================================================================

import base64
from   fastapi                                                                     import HTTPException, Request
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Inbox               import Service__Vault__Inbox
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer             import VAULT_ID_PATTERN
from   sgraph_ai_app_send.lambda__user.user__config                                import (HEADER__SGRAPH_SEND__ACCESS_TOKEN ,
                                                                                           HEADER__SGRAPH_VAULT__WRITE_KEY  ,
                                                                                           HEADER__SGRAPH_VAULT__ENUM_KEY   )

TAG__ROUTES_VAULT_INBOX = 'api/vault/inbox'

ROUTES_PATHS__VAULT_INBOX = [f'/{TAG__ROUTES_VAULT_INBOX}/append/{{vault_id}}'          ,
                             f'/{TAG__ROUTES_VAULT_INBOX}/list/{{vault_id}}'            ,
                             f'/{TAG__ROUTES_VAULT_INBOX}/fetch/{{vault_id}}'           ,
                             f'/{TAG__ROUTES_VAULT_INBOX}/mark-processed/{{vault_id}}'  ,
                             f'/{TAG__ROUTES_VAULT_INBOX}/purge/{{vault_id}}'           ,
                             f'/{TAG__ROUTES_VAULT_INBOX}/configure/{{vault_id}}'       ]


class Routes__Vault__Inbox(Fast_API__Routes):
    tag           : str = TAG__ROUTES_VAULT_INBOX
    inbox_service : Service__Vault__Inbox
    admin_service_client : object = None

    @staticmethod
    def _validate_vault_id(vault_id):
        if not VAULT_ID_PATTERN.match(str(vault_id)):
            raise HTTPException(status_code = 400,
                                detail      = 'vault_id must be an opaque lowercase alphanumeric string (8-24 chars, no hyphens)')

    def _check_access_token(self, request: Request):
        from osbot_utils.utils.Env import get_env
        from sgraph_ai_app_send.lambda__user.user__config import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN
        provided_token = request.headers.get(HEADER__SGRAPH_SEND__ACCESS_TOKEN, '')
        if self.admin_service_client is not None:
            if not provided_token:
                raise HTTPException(status_code = 401, detail = 'Access token required')
            try:
                response = self.admin_service_client.token_lookup(provided_token)
                if response.status_code == 404:
                    raise HTTPException(status_code = 401, detail = 'Invalid access token')
                data = response.json()
                if data.get('status') != 'active':
                    raise HTTPException(status_code = 401, detail = f'Access token {data.get("status", "invalid")}')
                return provided_token
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code = 503, detail = 'Token validation service unavailable')
        expected_token = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        if not expected_token:
            return provided_token or None
        if provided_token != expected_token:
            raise HTTPException(status_code = 401, detail = 'Access token required')
        return provided_token

    async def append__vault_id(self, vault_id: Safe_Str__Id,
                                     request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        body = await request.json()
        append_token = body.get('append_token', '')
        if not append_token:
            raise HTTPException(status_code = 400, detail = 'Missing append_token')
        payload_b64 = body.get('payload', '')
        if not payload_b64:
            raise HTTPException(status_code = 400, detail = 'Missing payload')
        try:
            payload_bytes = base64.b64decode(payload_b64)
        except Exception:
            raise HTTPException(status_code = 400, detail = 'Invalid base64 payload')
        result = self.inbox_service.append(vault_id      = str(vault_id)  ,
                                            append_token  = append_token  ,
                                            payload_bytes = payload_bytes )
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid append_token')
        if result['status'] == 'gate_failed':
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        if result['status'] == 'payload_too_large':
            raise HTTPException(status_code = 413, detail = 'Payload too large')
        if result['status'] == 'at_capacity':
            raise HTTPException(status_code = 507, detail = 'Insufficient Storage')
        return dict(ok=True)

    async def list__vault_id(self, vault_id: Safe_Str__Id,
                                   request : Request      ) -> dict:
        self._validate_vault_id(vault_id)
        enum_key = request.headers.get(HEADER__SGRAPH_VAULT__ENUM_KEY, '')
        if not enum_key:
            raise HTTPException(status_code = 403, detail = 'Forbidden')
        body = await request.json()
        result = self.inbox_service.inbox_list(
            vault_id        = str(vault_id)                     ,
            enum_key        = enum_key                          ,
            inbox           = body.get('inbox')                 ,
            after_file_id   = body.get('after_file_id')         ,
            limit           = body.get('limit')                 ,
            include_content = body.get('include_content', False))
        if result['status'] == 'invalid_input':
            raise HTTPException(status_code = 400, detail = 'Invalid inbox or limit')
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
        body = await request.json()
        inbox    = body.get('inbox', '')
        file_ids = body.get('file_ids', [])
        if not inbox or not file_ids:
            raise HTTPException(status_code = 400, detail = 'Missing inbox or file_ids')
        result = self.inbox_service.inbox_fetch(vault_id = str(vault_id),
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
        body = await request.json()
        inbox    = body.get('inbox', '')
        file_ids = body.get('file_ids', [])
        if not inbox or not file_ids:
            raise HTTPException(status_code = 400, detail = 'Missing inbox or file_ids')
        result = self.inbox_service.mark_processed(vault_id = str(vault_id),
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
        body = await request.json()
        folder   = body.get('folder', 'processed')
        inbox    = body.get('inbox', '')
        file_ids = body.get('file_ids')
        if not inbox:
            raise HTTPException(status_code = 400, detail = 'Missing inbox')
        if folder not in ('inbox', 'processed'):
            raise HTTPException(status_code = 400, detail = 'folder must be "inbox" or "processed"')
        result = self.inbox_service.purge(vault_id      = str(vault_id),
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
        body = await request.json()
        result = self.inbox_service.configure(
            vault_id       = str(vault_id)                ,
            write_key_hex  = write_key                    ,
            append_anchors = body.get('append_anchors')   ,
            enum_key_hash  = body.get('enum_key_hash')    )
        if result is None:
            raise HTTPException(status_code = 403, detail = 'Write key mismatch')
        return result

    def setup_routes(self):
        self.add_route_post(self.append__vault_id         )
        self.add_route_post(self.list__vault_id           )
        self.add_route_post(self.fetch__vault_id          )
        self.add_route_post(self.mark_processed__vault_id )
        self.add_route_post(self.purge__vault_id          )
        self.add_route_post(self.configure__vault_id      )
        return self
