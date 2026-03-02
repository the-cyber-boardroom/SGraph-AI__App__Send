from osbot_fast_api_serverless.fast_api.routes.Routes__Info import Routes__Info

import sgraph_ai_app_send__ui__user
from osbot_fast_api.api.decorators.route_path                                       import route_path
from osbot_fast_api_serverless.fast_api.Serverless__Fast_API                        import Serverless__Fast_API
from starlette.responses                                                            import RedirectResponse
from starlette.staticfiles                                                          import StaticFiles
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Transfers              import Routes__Transfers
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Presigned             import Routes__Presigned
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Early_Access          import Routes__Early_Access
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                      import Transfer__Service
from sgraph_ai_app_send.lambda__user.service.Service__Presigned_Urls               import Service__Presigned_Urls
from sgraph_ai_app_send.lambda__user.service.Service__Early_Access                 import Service__Early_Access
from sgraph_ai_app_send.lambda__user.storage.Send__Config                           import Send__Config
from sgraph_ai_app_send.lambda__user.user__config                                   import APP_SEND__UI__USER__ROUTE__PATH__CONSOLE, APP__SEND__USER__FAST_API__TITLE, APP__SEND__USER__FAST_API__DESCRIPTION, APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__START_PAGE, APP_SEND__UI__USER__LOCALE
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client                 import Admin__Service__Client
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup          import setup_admin_service_client__remote
from sgraph_ai_app_send.lambda__user.user__config                                   import HEADER__SGRAPH_SEND__ACCESS_TOKEN, ENV_VAR__N8N_WEBHOOK_URL, ENV_VAR__N8N_WEBHOOK_SECRET
from sgraph_ai_app_send.utils.MCP__Setup                                            import MCP__Setup
from sgraph_ai_app_send.utils.Version                                               import version__sgraph_ai_app_send

ROUTES_PATHS__APP_SEND__STATIC__USER  = ['/',
                                         f'/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}',
                                         '/tools/ssh-keygen'                            ]

ROUTES_PATHS__API_DOCS                = ['/api/docs', '/api/openapi.json', '/api/redoc']

class Fast_API__SGraph__App__Send__User(Serverless__Fast_API):

    send_config          : Send__Config          = None                              # Storage configuration (auto-detects mode)
    transfer_service     : Transfer__Service      = None                            # Shared transfer service instance
    presigned_service    : Service__Presigned_Urls = None                           # Presigned URL service (S3 mode only)
    admin_service_client : Admin__Service__Client = None                            # Admin Lambda client (REMOTE in prod, IN_MEMORY in tests)
    early_access_service : Service__Early_Access  = None                            # Early Access signup (n8n webhook)

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
                presigned_kwargs['s3_prefix'] = storage_fs.s3_prefix
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
        self.add_routes(Routes__Early_Access   ,
                        service_early_access = self.early_access_service )

        # Vault, Join, Set-Cookie routes removed from User Lambda for v0.2.0
        # CloudFront separation: /api/* → Lambda, /* → S3 static files
        # Vault and Join are auxiliary features — re-add when needed via admin Lambda

        self.setup_mcp()                                                              # Mount MCP server (after all routes registered)

    def setup_mcp(self):                                                              # Mount MCP server on /mcp endpoint
        from sgraph_ai_app_send.lambda__user.user__config import HEADER__SGRAPH_SEND__ACCESS_TOKEN
        mcp_setup = MCP__Setup(name            = 'sgraph-send-user'                              ,
                               include_tags    = ['api/transfers', 'api/presigned', 'api/early-access'],
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
        locale              = APP_SEND__UI__USER__LOCALE
        path_latest_version = f"/{path_name}/{major_version}/{latest_version}/{locale}/{start_page}.html"
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
