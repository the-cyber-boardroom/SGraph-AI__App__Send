from osbot_fast_api_serverless.fast_api.routes.Routes__Info import Routes__Info

import sgraph_ai_app_send__ui__admin
from osbot_fast_api.api.decorators.route_path                                       import route_path
from osbot_utils.type_safe.primitives.core.Safe_UInt                                import Safe_UInt
from osbot_fast_api.api.routes.Routes__Set_Cookie                                   import Routes__Set_Cookie
from osbot_fast_api_serverless.fast_api.Serverless__Fast_API                        import Serverless__Fast_API
from starlette.responses                                                            import RedirectResponse
from starlette.staticfiles                                                          import StaticFiles
from sgraph_ai_app_send.lambda__admin.admin__config                                 import APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE, APP__SEND__ADMIN__FAST_API__TITLE, APP__SEND__ADMIN__FAST_API__DESCRIPTION, APP_SEND__UI__ADMIN__MAJOR__VERSION, APP_SEND__UI__ADMIN__LATEST__VERSION, APP_SEND__UI__ADMIN__START_PAGE
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client                   import Send__Cache__Client
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup                    import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Tokens                       import Service__Tokens
from sgraph_ai_app_send.lambda__admin.service.Service__Keys                         import Service__Keys
from sgraph_ai_app_send.lambda__admin.service.Service__Vault                        import Service__Vault
from sgraph_ai_app_send.lambda__admin.service.Service__Vault__ACL                   import Service__Vault__ACL
from sgraph_ai_app_send.lambda__admin.service.Service__Users                        import Service__Users
from sgraph_ai_app_send.lambda__admin.service.Service__Data_Room                    import Service__Data_Room
from sgraph_ai_app_send.lambda__admin.service.Service__Invites                      import Service__Invites
from sgraph_ai_app_send.lambda__admin.service.Service__Room__Session                import Service__Room__Session
from sgraph_ai_app_send.lambda__admin.service.Service__Audit                        import Service__Audit
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client__Vault            import Send__Cache__Client__Vault
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Tokens                import Routes__Tokens
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Keys                  import Routes__Keys
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Vault                 import Routes__Vault
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Users                 import Routes__Users
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Data_Room             import Routes__Data_Room
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Invites               import Routes__Invites
from sgraph_ai_app_send.lambda__admin.fast_api.routes.Routes__Cache__Browser        import Routes__Cache__Browser
from sgraph_ai_app_send.lambda__admin.service.Middleware__Analytics                 import Middleware__Analytics
from sgraph_ai_app_send.lambda__admin.service.Service__Analytics__Pulse             import compute_pulse
from sgraph_ai_app_send.lambda__admin.admin__config                                 import METRICS__USE_STUB
from sgraph_ai_app_send.lambda__admin.server_analytics.Routes__Metrics              import Routes__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Cache      import Service__Metrics__Cache
from sgraph_ai_app_send.lambda__admin.server_analytics.Metrics__Pipeline__Setup     import create_metrics_cache, create_metrics_cache_with_stub
from sgraph_ai_app_send.utils.MCP__Setup                                            import MCP__Setup
from sgraph_ai_app_send.utils.Version                                               import version__sgraph_ai_app_send

ROUTES_PATHS__ANALYTICS = ['/health/pulse']

ROUTES_PATHS__APP_SEND__STATIC__ADMIN  = [f'/{APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE}']

ROUTES_PATHS__API_DOCS                 = ['/api/docs', '/api/openapi.json', '/api/redoc']

class Fast_API__SGraph__App__Send__Admin(Serverless__Fast_API):

    send_cache_client    : Send__Cache__Client      = None                             # Cache service client (IN_MEMORY mode)
    service_tokens       : Service__Tokens           = None                             # Token lifecycle service
    service_keys         : Service__Keys             = None                             # Key registry service
    service_vault        : Service__Vault            = None                             # Vault lifecycle service
    service_vault_acl    : Service__Vault__ACL       = None                             # Vault ACL service (Phase 1)
    service_users        : Service__Users            = None                             # User identity service (Phase 1)
    service_data_room    : Service__Data_Room        = None                             # Data room service (Phase 3)
    service_invites      : Service__Invites          = None                             # Invite service (Phase 3)
    service_room_session : Service__Room__Session    = None                             # Room session service (Phase 3)
    service_audit        : Service__Audit            = None                             # Audit trail service (Phase 3)
    metrics_cache        : Service__Metrics__Cache   = None                             # Metrics cache service

    def app_kwargs(self, **kwargs):                                                      # Override: move docs under /api/ so CloudFront routes them to Lambda
        kwargs = super().app_kwargs(**kwargs)
        kwargs['docs_url'   ] = '/api/docs'
        kwargs['redoc_url'  ] = '/api/redoc'
        kwargs['openapi_url'] = '/api/openapi.json'
        return kwargs

    def setup(self):
        with self.config as _:
            _.name           = APP__SEND__ADMIN__FAST_API__TITLE
            _.version        = version__sgraph_ai_app_send
            _.description    = APP__SEND__ADMIN__FAST_API__DESCRIPTION
            # Admin Lambda keeps default auth (enable_api_key is True by default)

        if self.send_cache_client is None:                                          # Auto-create cache client
            self.send_cache_client = create_send_cache_client()

        if self.service_tokens is None:                                             # Auto-create token service
            self.service_tokens = Service__Tokens(send_cache_client=self.send_cache_client)

        if self.service_keys is None:                                                # Auto-create key registry service
            self.service_keys = Service__Keys(send_cache_client=self.send_cache_client)

        if self.service_vault is None:                                                # Auto-create vault service
            vault_cache_client = Send__Cache__Client__Vault(
                cache_client   = self.send_cache_client.cache_client   ,
                hash_generator = self.send_cache_client.hash_generator )
            self.service_vault = Service__Vault(vault_cache_client=vault_cache_client)

        if self.service_vault_acl is None:                                            # Auto-create vault ACL service (Phase 1)
            vault_cache_client = self.service_vault.vault_cache_client
            self.service_vault_acl = Service__Vault__ACL(vault_cache_client=vault_cache_client)
            self.service_vault.vault_acl = self.service_vault_acl                     # Wire ACL into vault service

        if self.service_users is None:                                                # Auto-create user identity service (Phase 1)
            self.service_users = Service__Users(send_cache_client=self.send_cache_client)

        if self.service_audit is None:                                                  # Auto-create audit service (Phase 3)
            self.service_audit = Service__Audit(send_cache_client=self.send_cache_client)

        if self.service_data_room is None:                                              # Auto-create data room service (Phase 3)
            self.service_data_room = Service__Data_Room(
                send_cache_client = self.send_cache_client ,
                service_vault     = self.service_vault     ,
                service_vault_acl = self.service_vault_acl )

        if self.service_invites is None:                                                # Auto-create invite service (Phase 3)
            self.service_invites = Service__Invites(
                send_cache_client = self.send_cache_client  ,
                service_data_room = self.service_data_room  )

        if self.service_room_session is None:                                           # Auto-create room session service (Phase 3)
            self.service_room_session = Service__Room__Session(
                send_cache_client = self.send_cache_client)

        if self.metrics_cache is None:                                              # Auto-create metrics pipeline
            if METRICS__USE_STUB:                                                      # Local dev: stub data, no AWS calls
                self.metrics_cache = create_metrics_cache_with_stub(self.send_cache_client)
            else:                                                                      # Production: real CloudWatch (if env vars set)
                self.metrics_cache = create_metrics_cache(self.send_cache_client)

        return super().setup()


    def setup_routes(self):
        self.setup_static_routes()
        self.setup_pulse_route()
        self.add_routes(Routes__Info             )
        self.add_routes(Routes__Tokens           ,
                        service_tokens = self.service_tokens)
        self.add_routes(Routes__Keys             ,
                        service_keys   = self.service_keys  )
        self.add_routes(Routes__Vault            ,
                        service_vault     = self.service_vault     ,
                        service_vault_acl = self.service_vault_acl )
        self.add_routes(Routes__Users            ,
                        service_users  = self.service_users  )
        self.add_routes(Routes__Data_Room         ,
                        service_data_room = self.service_data_room ,
                        service_invites   = self.service_invites   ,
                        service_audit     = self.service_audit     )
        self.add_routes(Routes__Invites          ,
                        service_invites   = self.service_invites   ,
                        service_audit     = self.service_audit     )
        self.add_routes(Routes__Set_Cookie       )
        self.add_routes(Routes__Cache__Browser  ,
                        send_cache_client = self.send_cache_client)
        if self.metrics_cache is not None:                                          # Only add metrics routes if configured
            self.add_routes(Routes__Metrics      ,
                            metrics_cache = self.metrics_cache)

        # if self.send_cache_client is not None:                                      # Record admin traffic for Analytics Pulse  # disabled: creates 5 files per request, caused 65k+ file buildup — redesign needed
        #     self.app().add_middleware(Middleware__Analytics,
        #                              send_cache_client = self.send_cache_client)

        self.setup_mcp()                                                              # Mount MCP server (after all routes registered)

    def setup_mcp(self):                                                              # Mount MCP server on /mcp endpoint
        mcp_setup = MCP__Setup(name         = 'sgraph-send-admin'                         ,
                               include_tags = ['tokens', 'keys', 'vault', 'users']        ,
                               stateless    = True                                        )  # Lambda-compatible: no session state, authless discovery
        self.mcp = mcp_setup.mount_mcp(self.app())

    def setup_pulse_route(self):                                                  # Register /health/pulse directly (no tag prefix)
        send_cache_client = self.send_cache_client

        @route_path(path='/health/pulse')
        def pulse(window_minutes: Safe_UInt = 5):
            return compute_pulse(
                send_cache_client = send_cache_client ,
                window_minutes    = window_minutes    )

        self.add_route_get(pulse)


    # todo: refactor to separate class (focused on setting up this static route)
    #       also these values should all be defined in a Type_Safe class
    def setup_static_routes(self):


        path_static_folder  = sgraph_ai_app_send__ui__admin.path
        path_static         = f"/{APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE}"
        path_name           = APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE
        major_version       = APP_SEND__UI__ADMIN__MAJOR__VERSION
        latest_version      = APP_SEND__UI__ADMIN__LATEST__VERSION
        start_page          = APP_SEND__UI__ADMIN__START_PAGE
        path_latest_version = f"/{path_name}/{major_version}/{latest_version}/{start_page}.html"
        self.app().mount(path_static, StaticFiles(directory=path_static_folder), name=path_name)

        @route_path(path=f'/{APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE}')
        def redirect_to_latest():
            return RedirectResponse(url=path_latest_version)

        self.add_route_get(redirect_to_latest)