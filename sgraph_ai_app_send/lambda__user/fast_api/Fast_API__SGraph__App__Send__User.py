from osbot_fast_api_serverless.fast_api.routes.Routes__Info import Routes__Info

from osbot_fast_api_serverless.fast_api.Serverless__Fast_API                        import Serverless__Fast_API
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Transfers              import Routes__Transfers
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Presigned             import Routes__Presigned
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Early_Access          import Routes__Early_Access
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Vault__Pointer        import Routes__Vault__Pointer
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Vault__Presigned      import Routes__Vault__Presigned
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                      import Transfer__Service
from sgraph_ai_app_send.lambda__user.service.Service__Presigned_Urls               import Service__Presigned_Urls
from sgraph_ai_app_send.lambda__user.service.Service__Early_Access                 import Service__Early_Access
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer               import Service__Vault__Pointer
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Presigned             import Service__Vault__Presigned
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Zip                  import Service__Vault__Zip
from sgraph_ai_app_send.lambda__user.storage.Send__Config                           import Send__Config
from sgraph_ai_app_send.lambda__user.user__config                                   import APP__SEND__USER__FAST_API__TITLE, APP__SEND__USER__FAST_API__DESCRIPTION
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client                 import Admin__Service__Client
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup          import setup_admin_service_client__remote
from sgraph_ai_app_send.lambda__user.user__config                                   import HEADER__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_VAULT__WRITE_KEY, ENV_VAR__N8N_WEBHOOK_URL, ENV_VAR__N8N_WEBHOOK_SECRET
from sgraph_ai_app_send.utils.MCP__Setup                                            import MCP__Setup
from sgraph_ai_app_send.utils.Version                                               import version__sgraph_ai_app_send

ROUTES_PATHS__API_DOCS                = ['/api/docs', '/api/openapi.json', '/api/redoc']

class Fast_API__SGraph__App__Send__User(Serverless__Fast_API):

    send_config          : Send__Config          = None                              # Storage configuration (auto-detects mode)
    transfer_service     : Transfer__Service      = None                            # Shared transfer service instance
    presigned_service    : Service__Presigned_Urls = None                           # Presigned URL service (S3 mode only)
    admin_service_client : Admin__Service__Client = None                            # Admin Lambda client (REMOTE in prod, IN_MEMORY in tests)
    early_access_service : Service__Early_Access  = None                            # Early Access signup (n8n webhook)
    vault_service        : Service__Vault__Pointer = None                            # Vault pointer service (mutable files)
    vault_zip_service    : Service__Vault__Zip      = None                            # Vault zip builder with content-addressable caching
    vault_presigned_service : Service__Vault__Presigned = None                       # Vault presigned URL service (S3 mode only)

    def app_kwargs(self, **kwargs):                                                   # Override: move docs under /api/ so CloudFront routes them to Lambda
        kwargs = super().app_kwargs(**kwargs)
        kwargs['docs_url'   ] = '/api/docs'
        kwargs['redoc_url'  ] = '/api/redoc'
        kwargs['openapi_url'] = '/api/openapi.json'
        return kwargs

    def setup(self):
        with self.config as _:
            _.name           = APP__SEND__USER__FAST_API__TITLE
            _.version        = version__sgraph_ai_app_send
            _.description    = APP__SEND__USER__FAST_API__DESCRIPTION
            _.enable_api_key = False                                                  # Per-route access token replaces global middleware

        if self.send_config is None:                                                # Auto-create config if not provided
            self.send_config = Send__Config()

        storage_fs = self.send_config.create_storage_backend()                      # Create storage backend (memory or S3)

        if self.transfer_service is None:                                           # Auto-create transfer service if not provided
            self.transfer_service = Transfer__Service(storage_fs=storage_fs)

        if self.presigned_service is None:                                           # Auto-create presigned URL service
            from sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3 import Storage_FS__S3
            presigned_kwargs = dict(transfer_service = self.transfer_service,
                                    storage_mode     = self.send_config.storage_mode)
            if isinstance(storage_fs, Storage_FS__S3):                               # Wire S3 client from storage backend
                presigned_kwargs['s3']        = storage_fs.s3
                presigned_kwargs['s3_bucket'] = storage_fs.s3_bucket
            self.presigned_service = Service__Presigned_Urls(**presigned_kwargs)

        if self.admin_service_client is None:                                      # Auto-create admin client (REMOTE mode via env vars)
            try:
                self.admin_service_client = setup_admin_service_client__remote()
            except Exception:                                                       # Admin client setup failure must not block user Lambda
                self.admin_service_client = None

        if self.early_access_service is None:                                      # Auto-create early access service from env vars
            from osbot_utils.utils.Env import get_env
            self.early_access_service = Service__Early_Access(
                n8n_webhook_url    = get_env(ENV_VAR__N8N_WEBHOOK_URL   , ''),
                n8n_webhook_secret = get_env(ENV_VAR__N8N_WEBHOOK_SECRET, ''))

        if self.vault_service is None:                                           # Auto-create vault pointer service (shares storage backend)
            self.vault_service = Service__Vault__Pointer(storage_fs=storage_fs)

        if self.vault_zip_service is None:                                     # Auto-create vault zip service (shares storage backend for cache)
            self.vault_zip_service = Service__Vault__Zip(vault_service = self.vault_service,
                                                          storage_fs    = storage_fs       )

        if self.vault_presigned_service is None:                                 # Auto-create vault presigned URL service
            from sgraph_ai_app_send.lambda__user.storage.Storage_FS__S3 import Storage_FS__S3
            vault_presigned_kwargs = dict(vault_service = self.vault_service      ,
                                          storage_mode  = self.send_config.storage_mode)
            if isinstance(storage_fs, Storage_FS__S3):                           # Wire S3 client from storage backend
                vault_presigned_kwargs['s3']        = storage_fs.s3
                vault_presigned_kwargs['s3_bucket'] = storage_fs.s3_bucket
            self.vault_presigned_service = Service__Vault__Presigned(**vault_presigned_kwargs)

        return super().setup()


    def setup_middleware__cors(self):                                                # Override: add x-sgraph-access-token to allowed CORS headers
        from starlette.middleware.cors import CORSMiddleware                          # so cross-origin requests from admin.send.sgraph.ai succeed
        if self.config.enable_cors:
            self.app().add_middleware(CORSMiddleware,
                                      allow_origins     = ["*"]                                                                                                      ,
                                      allow_credentials = True                                                                                                       ,
                                      allow_methods     = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]                                                          ,
                                      allow_headers     = ["Content-Type", "X-Requested-With", "Origin", "Accept", "Authorization", HEADER__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_VAULT__WRITE_KEY],
                                      expose_headers    = ["Content-Type", "X-Requested-With", "Origin", "Accept", "Authorization"]                                  )

    def setup_routes(self):
        self.add_routes(Routes__Info             )
        self.add_routes(Routes__Transfers        ,
                        transfer_service     = self.transfer_service     ,
                        admin_service_client = self.admin_service_client )
        self.add_routes(Routes__Presigned        ,
                        presigned_service    = self.presigned_service    ,
                        admin_service_client = self.admin_service_client )
        self.add_routes(Routes__Early_Access   ,
                        service_early_access = self.early_access_service )
        self.add_routes(Routes__Vault__Pointer ,
                        vault_service        = self.vault_service        ,
                        vault_zip_service    = self.vault_zip_service    ,
                        admin_service_client = self.admin_service_client )
        self.add_routes(Routes__Vault__Presigned,
                        vault_presigned_service = self.vault_presigned_service,
                        admin_service_client    = self.admin_service_client   )

        self.setup_mcp()                                                              # Mount MCP server (after all routes registered)

    def setup_mcp(self):                                                              # Mount MCP server on /mcp endpoint
        from sgraph_ai_app_send.lambda__user.user__config import HEADER__SGRAPH_SEND__ACCESS_TOKEN
        mcp_setup = MCP__Setup(name            = 'sgraph-send-user'                              ,
                               include_tags    = ['api/transfers', 'api/presigned', 'api/early-access', 'api/vault', 'api/vault/presigned'],
                               forward_headers = ['authorization', HEADER__SGRAPH_SEND__ACCESS_TOKEN],
                               stateless       = True                                            )  # Lambda-compatible: no session state, authless discovery
        self.mcp = mcp_setup.mount_mcp(self.app())

