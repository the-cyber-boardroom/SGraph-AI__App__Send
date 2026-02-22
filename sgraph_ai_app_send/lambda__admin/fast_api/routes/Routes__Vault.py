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
from   sgraph_ai_app_send.lambda__admin.schemas.Schema__Vault__Index__Request      import Schema__Vault__Index__Request
from   sgraph_ai_app_send.lambda__admin.service.Service__Vault                     import Service__Vault

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
                       f'/{TAG__ROUTES_VAULT}/index'                           ,
                       f'/{TAG__ROUTES_VAULT}/index/{{vault_cache_key}}'       ,
                       f'/{TAG__ROUTES_VAULT}/list-all/{{vault_cache_key}}'    ]


class Routes__Vault(Fast_API__Routes):                                         # Vault management endpoints
    tag           : str = TAG__ROUTES_VAULT
    service_vault : Service__Vault                                             # Injected vault service

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
    # Route Registration
    # ═══════════════════════════════════════════════════════════════════════

    def setup_routes(self):                                                    # Register all vault endpoints
        self.add_route_post(self.create                                   )
        self.add_route_get (self.lookup__vault_cache_key                  )
        self.add_route_get (self.exists__vault_cache_key                  )
        self.add_route_post(self.folder                                   )
        self.add_route_get (self.folder__vault_cache_key__folder_guid     )
        self.add_route_get (self.folders__vault_cache_key                 )
        self.add_route_post(self.file                                     )
        self.add_route_get (self.file__vault_cache_key__file_guid         )
        self.add_route_get (self.files__vault_cache_key                   )
        self.add_route_post(self.index                                    )
        self.add_route_get (self.index__vault_cache_key                   )
        self.add_route_get (self.list_all__vault_cache_key                )
        return self
