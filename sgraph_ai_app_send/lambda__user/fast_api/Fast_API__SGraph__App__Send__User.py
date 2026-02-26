from osbot_fast_api.api.routes.Routes__Set_Cookie import Routes__Set_Cookie
from osbot_fast_api_serverless.fast_api.routes.Routes__Info import Routes__Info

import sgraph_ai_app_send__ui__user
from osbot_fast_api.api.decorators.route_path                                       import route_path
from osbot_fast_api_serverless.fast_api.Serverless__Fast_API                        import Serverless__Fast_API
from starlette.responses                                                            import RedirectResponse
from starlette.staticfiles                                                          import StaticFiles
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Transfers              import Routes__Transfers
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Presigned             import Routes__Presigned
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                      import Transfer__Service
from sgraph_ai_app_send.lambda__user.service.Service__Presigned_Urls               import Service__Presigned_Urls
from sgraph_ai_app_send.lambda__user.storage.Send__Config                           import Send__Config
from sgraph_ai_app_send.lambda__user.user__config                                   import APP_SEND__UI__USER__ROUTE__PATH__CONSOLE, APP__SEND__USER__FAST_API__TITLE, APP__SEND__USER__FAST_API__DESCRIPTION, APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__START_PAGE
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client                   import Send__Cache__Client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup                    import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault            import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.service.Middleware__Analytics                  import Middleware__Analytics
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                        import Service__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL                  import Service__Vault__ACL
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Vault                 import Routes__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Data_Room                   import Service__Data_Room
from sgraph_ai_app_send.lambda__admin.service.Service__Invites                     import Service__Invites
from sgraph_ai_app_send.lambda__admin.service.Service__Room__Session               import Service__Room__Session
from sgraph_ai_app_send.lambda__admin.service.Service__Audit                       import Service__Audit
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Join                  import Routes__Join
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client                 import Admin__Service__Client
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup          import setup_admin_service_client__remote
from sgraph_ai_app_send.lambda__user.user__config                                   import HEADER__SGRAPH_SEND__ACCESS_TOKEN
from sgraph_ai_app_send.utils.MCP__Setup                                            import MCP__Setup
from sgraph_ai_app_send.utils.Version                                               import version__sgraph_ai_app_send

ROUTES_PATHS__APP_SEND__STATIC__USER  = ['/',
                                         f'/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}',
                                         '/tools/ssh-keygen'                            ]

class Fast_API__SGraph__App__Send__User(Serverless__Fast_API):

    send_config          : Send__Config          = None                              # Storage configuration (auto-detects mode)
    transfer_service     : Transfer__Service      = None                            # Shared transfer service instance
    presigned_service    : Service__Presigned_Urls = None                           # Presigned URL service (S3 mode only)
    send_cache_client    : Send__Cache__Client    = None                            # Cache service client (IN_MEMORY mode)
    admin_service_client : Admin__Service__Client = None                            # Admin Lambda client (REMOTE in prod, IN_MEMORY in tests)
    service_vault        : Service__Vault         = None                            # Vault lifecycle service

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
                presigned_kwargs['s3_prefix'] = storage_fs.s3_prefix
            self.presigned_service = Service__Presigned_Urls(**presigned_kwargs)

        if self.send_cache_client is None:                                          # Auto-create cache client in IN_MEMORY mode
            try:
                self.send_cache_client = create_send_cache_client()
            except Exception:                                                       # Cache setup failure must not block the user Lambda
                self.send_cache_client = None

        if self.admin_service_client is None:                                      # Auto-create admin client (REMOTE mode via env vars)
            try:
                self.admin_service_client = setup_admin_service_client__remote()
            except Exception:                                                       # Admin client setup failure must not block user Lambda
                self.admin_service_client = None

        if self.service_vault is None and self.send_cache_client is not None:      # Auto-create vault service
            try:
                vault_cache_client = Send__Cache__Client__Vault(
                    cache_client   = self.send_cache_client.cache_client   ,
                    hash_generator = self.send_cache_client.hash_generator )
                self.service_vault = Service__Vault(vault_cache_client=vault_cache_client)
            except Exception:                                                       # Vault setup failure must not block user Lambda
                self.service_vault = None

        self.service_vault_acl = None                                              # ACL service (auto-created if vault available)
        if self.service_vault is not None and self.send_cache_client is not None:
            try:
                vault_cache_client_acl = Send__Cache__Client__Vault(
                    cache_client   = self.send_cache_client.cache_client   ,
                    hash_generator = self.send_cache_client.hash_generator )
                self.service_vault_acl = Service__Vault__ACL(
                    vault_cache_client = vault_cache_client_acl )
            except Exception:
                self.service_vault_acl = None

        # Data room services (invites, sessions, audit — for join flow)
        self.service_data_room  = None
        self.service_invites    = None
        self.service_session    = None
        self.service_audit      = None
        if self.send_cache_client is not None:
            try:
                self.service_data_room = Service__Data_Room(send_cache_client=self.send_cache_client)
                self.service_invites   = Service__Invites(send_cache_client=self.send_cache_client,
                                                          service_data_room=self.service_data_room)
                self.service_session   = Service__Room__Session(send_cache_client=self.send_cache_client)
                self.service_audit     = Service__Audit(send_cache_client=self.send_cache_client)
            except Exception:
                self.service_invites = None
                self.service_session = None
                self.service_audit   = None

        return super().setup()


    def setup_middleware__cors(self):                                                # Override: add x-sgraph-access-token to allowed CORS headers
        from starlette.middleware.cors import CORSMiddleware                          # so cross-origin requests from admin.send.sgraph.ai succeed
        if self.config.enable_cors:
            self.app().add_middleware(CORSMiddleware,
                                      allow_origins     = ["*"]                                                                                                      ,
                                      allow_credentials = True                                                                                                       ,
                                      allow_methods     = ["GET", "POST", "HEAD", "OPTIONS"]                                                                         ,
                                      allow_headers     = ["Content-Type", "X-Requested-With", "Origin", "Accept", "Authorization", HEADER__SGRAPH_SEND__ACCESS_TOKEN],
                                      expose_headers    = ["Content-Type", "X-Requested-With", "Origin", "Accept", "Authorization"]                                  )

    def setup_routes(self):
        self.setup_static_routes()
        self.add_routes(Routes__Info             )
        self.add_routes(Routes__Transfers        ,
                        transfer_service     = self.transfer_service     ,
                        admin_service_client = self.admin_service_client )
        self.add_routes(Routes__Presigned        ,
                        presigned_service    = self.presigned_service    ,
                        admin_service_client = self.admin_service_client )
        if self.service_vault is not None:                                          # Add vault routes if vault service available
            self.add_routes(Routes__Vault          ,
                            service_vault     = self.service_vault     ,
                            service_vault_acl = self.service_vault_acl )
        if self.service_invites is not None:                                     # Add join routes if invite service available
            self.add_routes(Routes__Join           ,
                            service_invites = self.service_invites ,
                            service_session = self.service_session ,
                            service_audit   = self.service_audit   )
        self.add_routes(Routes__Set_Cookie)

        # if self.send_cache_client is not None:                                      # Add analytics middleware if cache client available  # disabled: creates 5 files per request, caused 65k+ file buildup — redesign needed
        #     self.app().add_middleware(Middleware__Analytics,
        #                              send_cache_client = self.send_cache_client)

        self.setup_mcp()                                                              # Mount MCP server (after all routes registered)

    def setup_mcp(self):                                                              # Mount MCP server on /mcp endpoint
        from sgraph_ai_app_send.lambda__user.user__config import HEADER__SGRAPH_SEND__ACCESS_TOKEN
        mcp_setup = MCP__Setup(name            = 'sgraph-send-user'                              ,
                               include_tags    = ['transfers', 'presigned', 'vault']             ,
                               forward_headers = ['authorization', HEADER__SGRAPH_SEND__ACCESS_TOKEN],
                               stateless       = True                                            )  # Lambda-compatible: no session state, authless discovery
        self.mcp = mcp_setup.mount_mcp(self.app())


    # todo: refactor to separate class (focused on setting up this static route)
    #       also these values should all be defined in a Type_Safe class
    def setup_static_routes(self):


        path_static_folder  = sgraph_ai_app_send__ui__user.path
        path_static         = f"/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}"
        path_name           = APP_SEND__UI__USER__ROUTE__PATH__CONSOLE
        major_version       = APP_SEND__UI__USER__MAJOR__VERSION
        latest_version      = APP_SEND__UI__USER__LATEST__VERSION
        start_page          = APP_SEND__UI__USER__START_PAGE
        path_latest_version = f"/{path_name}/{major_version}/{latest_version}/{start_page}.html"
        self.app().mount(path_static, StaticFiles(directory=path_static_folder), name=path_name)

        @route_path(path='/')
        def redirect_root():
            return RedirectResponse(url=path_latest_version)

        @route_path(path=f'/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}')
        def redirect_to_latest():
            return RedirectResponse(url=path_latest_version)

        @route_path(path='/tools/ssh-keygen')
        def redirect_to_ssh_keygen():
            return RedirectResponse(url=f'/{path_name}/tools/ssh-keygen/v0/v0.1/v0.1.0/index.html')

        self.add_route_get(redirect_root)
        self.add_route_get(redirect_to_latest)
        self.add_route_get(redirect_to_ssh_keygen)
