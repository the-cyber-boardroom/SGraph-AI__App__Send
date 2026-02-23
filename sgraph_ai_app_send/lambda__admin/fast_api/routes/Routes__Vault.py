# ===============================================================================
# SGraph Send - Vault Routes
# REST endpoints for vault operations (admin Lambda)
# ===============================================================================

import base64
from   fastapi                                                                      import HTTPException
from   osbot_fast_api.api.routes.Fast_API__Routes                                  import Fast_API__Routes
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id  import Safe_Str__Id
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__Create__Request     import Schema__Vault__Create__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__Folder__Request     import Schema__Vault__Folder__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__File__Request       import Schema__Vault__File__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__File__Chunk__Request import Schema__Vault__File__Chunk__Request, Schema__Vault__File__Assemble__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__Index__Request      import Schema__Vault__Index__Request
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__Share__Request     import Schema__Vault__Share__Request
from   sgraph_ai_app_send.lambda__admin.service.Service__Vault                     import Service__Vault
from   sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL               import Service__Vault__ACL

TAG__ROUTES_VAULT = 'vault'

ROUTES_PATHS__VAULT = [f'/{TAG__ROUTES_VAULT}/create'                         ,
                       f'/{TAG__ROUTES_VAULT}/lookup/{{vault_cache_key}}'      ,
                       f'/{TAG__ROUTES_VAULT}/exists/{{vault_cache_key}}'      ,
                       f'/{TAG__ROUTES_VAULT}/folder'                          ,
                       f'/{TAG__ROUTES_VAULT}/folder/{{vault_cache_key}}/{{folder_guid}}' ,
                       f'/{TAG__ROUTES_VAULT}/folders/{{vault_cache_key}}'     ,
                       f'/{TAG__ROUTES_VAULT}/file'                            ,
                       f'/{TAG__ROUTES_VAULT}/file/{{vault_cache_key}}/{{file_guid}}'     ,
                       f'/{TAG__ROUTES_VAULT}/files/{{vault_cache_key}}'       ,
                       f'/{TAG__ROUTES_VAULT}/file-chunk'                      ,
                       f'/{TAG__ROUTES_VAULT}/file-assemble'                   ,
                       f'/{TAG__ROUTES_VAULT}/index'                           ,
                       f'/{TAG__ROUTES_VAULT}/index/{{vault_cache_key}}'       ,
                       f'/{TAG__ROUTES_VAULT}/list-all/{{vault_cache_key}}'    ,
                       f'/{TAG__ROUTES_VAULT}/share/{{vault_cache_key}}'       ,
                       f'/{TAG__ROUTES_VAULT}/unshare/{{vault_cache_key}}/{{user_id}}' ,
                       f'/{TAG__ROUTES_VAULT}/permissions/{{vault_cache_key}}' ]


class Routes__Vault(Fast_API__Routes):                                         # Vault management endpoints
    tag              : str = TAG__ROUTES_VAULT
    service_vault    : Service__Vault                                          # Injected vault service
    service_vault_acl: Service__Vault__ACL = None                              # Injected ACL service (Phase 1)

    # ═══════════════════════════════════════════════════════════════════════
    # Vault Lifecycle
    # ═══════════════════════════════════════════════════════════════════════

    def create(self, body: Schema__Vault__Create__Request) -> dict:            # POST /vault/create
        if not body.vault_cache_key:
            raise HTTPException(status_code=400, detail='vault_cache_key is required')
        result = self.service_vault.create(body.vault_cache_key, body.key_fingerprint)
        if result is None:
            raise HTTPException(status_code=409, detail='Vault already exists')
        return result

    def lookup__vault_cache_key(self, vault_cache_key: Safe_Str__Id) -> dict:  # GET /vault/lookup/{vault_cache_key}
        result = self.service_vault.lookup(vault_cache_key)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return result

    def exists__vault_cache_key(self, vault_cache_key: Safe_Str__Id) -> dict:  # GET /vault/exists/{vault_cache_key}
        found = self.service_vault.exists(vault_cache_key)
        return dict(exists = found, vault_cache_key = vault_cache_key)

    # ═══════════════════════════════════════════════════════════════════════
    # Folder Operations
    # ═══════════════════════════════════════════════════════════════════════

    def folder(self, body: Schema__Vault__Folder__Request) -> dict:            # POST /vault/folder
        result = self.service_vault.store_folder(
            body.vault_cache_key, body.folder_guid, body.folder_data)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return dict(status='stored', folder_guid=body.folder_guid)

    def folder__vault_cache_key__folder_guid(self,                             # GET /vault/folder/{vault_cache_key}/{folder_guid}
                                             vault_cache_key: Safe_Str__Id,
                                             folder_guid: Safe_Str__Id) -> dict:
        result = self.service_vault.get_folder(vault_cache_key, folder_guid)
        if result is None:
            raise HTTPException(status_code=404, detail='Folder not found')
        return dict(data=result)

    def folders__vault_cache_key(self, vault_cache_key: Safe_Str__Id) -> dict: # GET /vault/folders/{vault_cache_key}
        result = self.service_vault.list_folders(vault_cache_key)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # File Operations
    # ═══════════════════════════════════════════════════════════════════════

    def file(self, body: Schema__Vault__File__Request) -> dict:                # POST /vault/file
        encrypted_bytes = base64.b64decode(body.encrypted_data)
        result = self.service_vault.store_file(
            body.vault_cache_key, body.file_guid, encrypted_bytes)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return dict(status='stored', file_guid=body.file_guid)

    def file__vault_cache_key__file_guid(self,                                 # GET /vault/file/{vault_cache_key}/{file_guid}
                                         vault_cache_key: Safe_Str__Id,
                                         file_guid: Safe_Str__Id) -> dict:
        result = self.service_vault.get_file(vault_cache_key, file_guid)
        if result is None:
            raise HTTPException(status_code=404, detail='File not found')
        if isinstance(result, (bytes, bytearray)):
            return dict(data=base64.b64encode(result).decode('ascii'))
        return dict(data=result)

    def files__vault_cache_key(self, vault_cache_key: Safe_Str__Id) -> dict:   # GET /vault/files/{vault_cache_key}
        result = self.service_vault.list_files(vault_cache_key)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Chunked File Upload — for files exceeding Lambda 6MB payload limit
    # ═══════════════════════════════════════════════════════════════════════

    def file_chunk(self, body: Schema__Vault__File__Chunk__Request) -> dict: # POST /vault/file-chunk
        if body.chunk_index < 0 or body.chunk_index >= body.total_chunks:
            raise HTTPException(status_code=400, detail='Invalid chunk_index')
        encrypted_chunk = base64.b64decode(body.chunk_data)
        result = self.service_vault.store_file_chunk(
            body.vault_cache_key, body.file_guid, body.chunk_index, encrypted_chunk)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return dict(status='stored', file_guid=body.file_guid,
                    chunk_index=body.chunk_index, total_chunks=body.total_chunks)

    def file_assemble(self, body: Schema__Vault__File__Assemble__Request) -> dict:  # POST /vault/file-assemble
        if body.total_chunks <= 0:
            raise HTTPException(status_code=400, detail='total_chunks must be > 0')
        result = self.service_vault.assemble_file(
            body.vault_cache_key, body.file_guid, body.total_chunks)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        if 'error' in result:
            raise HTTPException(status_code=400, detail=f'Missing chunk {result.get("chunk_index")}')
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # Index Operations
    # ═══════════════════════════════════════════════════════════════════════

    def index(self, body: Schema__Vault__Index__Request) -> dict:              # POST /vault/index
        encrypted_bytes = base64.b64decode(body.encrypted_index)
        result = self.service_vault.store_index(
            body.vault_cache_key, encrypted_bytes)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return dict(status='stored')

    def index__vault_cache_key(self, vault_cache_key: Safe_Str__Id) -> dict:   # GET /vault/index/{vault_cache_key}
        result = self.service_vault.get_index(vault_cache_key)
        if result is None:
            raise HTTPException(status_code=404, detail='Index not found')
        if isinstance(result, (bytes, bytearray)):
            return dict(data=base64.b64encode(result).decode('ascii'))
        return dict(data=result)

    # ═══════════════════════════════════════════════════════════════════════
    # Bulk Operations
    # ═══════════════════════════════════════════════════════════════════════

    def list_all__vault_cache_key(self, vault_cache_key: Safe_Str__Id) -> dict:  # GET /vault/list-all/{vault_cache_key}
        result = self.service_vault.list_all(vault_cache_key)
        if result is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # ACL Operations (Phase 1)
    # ═══════════════════════════════════════════════════════════════════════

    def _resolve_cache_id(self, vault_cache_key):                              # Helper: resolve vault_cache_key → cache_id
        cache_id = self.service_vault.vault_cache_client.vault__lookup_cache_id(vault_cache_key)
        if cache_id is None:
            raise HTTPException(status_code=404, detail='Vault not found')
        return cache_id

    def share__vault_cache_key(self,                                           # POST /vault/{vault_cache_key}/share
                               vault_cache_key: Safe_Str__Id,
                               body: Schema__Vault__Share__Request) -> dict:
        if self.service_vault_acl is None:
            raise HTTPException(status_code=501, detail='ACL not configured')
        cache_id = self._resolve_cache_id(vault_cache_key)
        result = self.service_vault_acl.grant_access(
            cache_id, body.user_id, body.permission, granted_by='admin')
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('reason', 'Failed'))
        return result

    def unshare__vault_cache_key__user_id(self,                                # DELETE /vault/{vault_cache_key}/unshare/{user_id}
                                           vault_cache_key: Safe_Str__Id,
                                           user_id: Safe_Str__Id) -> dict:
        if self.service_vault_acl is None:
            raise HTTPException(status_code=501, detail='ACL not configured')
        cache_id = self._resolve_cache_id(vault_cache_key)
        result = self.service_vault_acl.revoke_access(cache_id, user_id)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('reason', 'Failed'))
        return result

    def permissions__vault_cache_key(self,                                     # GET /vault/{vault_cache_key}/permissions
                                     vault_cache_key: Safe_Str__Id) -> dict:
        if self.service_vault_acl is None:
            raise HTTPException(status_code=501, detail='ACL not configured')
        cache_id = self._resolve_cache_id(vault_cache_key)
        entries = self.service_vault_acl.list_permissions(cache_id)
        return dict(vault_cache_key = vault_cache_key ,
                    permissions     = entries          )

    # ═══════════════════════════════════════════════════════════════════════
    # Route Registration
    # ═══════════════════════════════════════════════════════════════════════

    def setup_routes(self):                                                    # Register all vault endpoints
        self.add_route_post  (self.create                                   )
        self.add_route_get   (self.lookup__vault_cache_key                  )
        self.add_route_get   (self.exists__vault_cache_key                  )
        self.add_route_post  (self.folder                                   )
        self.add_route_get   (self.folder__vault_cache_key__folder_guid     )
        self.add_route_get   (self.folders__vault_cache_key                 )
        self.add_route_post  (self.file                                     )
        self.add_route_get   (self.file__vault_cache_key__file_guid         )
        self.add_route_get   (self.files__vault_cache_key                   )
        self.add_route_post  (self.file_chunk                               )
        self.add_route_post  (self.file_assemble                            )
        self.add_route_post  (self.index                                    )
        self.add_route_get   (self.index__vault_cache_key                   )
        self.add_route_get   (self.list_all__vault_cache_key                )
        self.add_route_post  (self.share__vault_cache_key                   )
        self.add_route_delete(self.unshare__vault_cache_key__user_id        )
        self.add_route_get   (self.permissions__vault_cache_key             )
        return self
