from osbot_fast_api.api.routes.Routes__Set_Cookie import Routes__Set_Cookie
from osbot_fast_api_serverless.fast_api.routes.Routes__Info import Routes__Info

import sgraph_ai_app_send__ui__user
from osbot_fast_api.api.decorators.route_path                                       import route_path
from osbot_fast_api_serverless.fast_api.Serverless__Fast_API                        import Serverless__Fast_API
from starlette.responses                                                            import RedirectResponse
from starlette.staticfiles                                                          import StaticFiles
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Transfers              import Routes__Transfers
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                      import Transfer__Service
from sgraph_ai_app_send.lambda__user.storage.Send__Config                           import Send__Config
from sgraph_ai_app_send.lambda__user.user__config                                   import APP_SEND__UI__USER__ROUTE__PATH__CONSOLE, APP__SEND__USER__FAST_API__TITLE, APP__SEND__USER__FAST_API__DESCRIPTION, APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__START_PAGE
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client                   import Send__Cache__Client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup                    import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Middleware__Analytics                  import Middleware__Analytics
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client                 import Admin__Service__Client
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup          import setup_admin_service_client__remote
from sgraph_ai_app_send.utils.Version                                               import version__sgraph_ai_app_send

ROUTES_PATHS__APP_SEND__STATIC__USER  = ['/',
                                         f'/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}']

class Fast_API__SGraph__App__Send__User(Serverless__Fast_API):

    send_config          : Send__Config          = None                              # Storage configuration (auto-detects mode)
    transfer_service     : Transfer__Service      = None                            # Shared transfer service instance
    send_cache_client    : Send__Cache__Client    = None                            # Cache service client (IN_MEMORY mode)
    admin_service_client : Admin__Service__Client = None                            # Admin Lambda client (REMOTE in prod, IN_MEMORY in tests)

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

        return super().setup()


    def setup_routes(self):
        self.setup_static_routes()
        self.add_routes(Routes__Info             )
        self.add_routes(Routes__Transfers        ,
                        transfer_service     = self.transfer_service     ,
                        admin_service_client = self.admin_service_client )
        self.add_routes(Routes__Set_Cookie)

        if self.send_cache_client is not None:                                      # Add analytics middleware if cache client available
            self.app().add_middleware(Middleware__Analytics,
                                     send_cache_client = self.send_cache_client)


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

        self.add_route_get(redirect_root)
        self.add_route_get(redirect_to_latest)
