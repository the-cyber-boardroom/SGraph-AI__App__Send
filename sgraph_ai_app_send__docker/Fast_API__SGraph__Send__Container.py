import os

from osbot_fast_api.api.routes.Routes__Set_Cookie                               import Routes__Set_Cookie
from osbot_utils.utils.Env                                                      import get_env
from starlette.responses                                                        import FileResponse
from starlette.staticfiles                                                      import StaticFiles
from osbot_fast_api.api.decorators.route_path                                   import route_path
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User  import Fast_API__SGraph__App__Send__User
from sgraph_ai_app_send.lambda__user.user__config                               import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, ENV_VAR__SEND__VAULT_STATIC_DIR, SEND__VAULT_STATIC_DIR__DEFAULT

ENV_VAR__SEND__ENABLE_AUTH = 'SEND__ENABLE_AUTH'


class Fast_API__SGraph__Send__Container(Fast_API__SGraph__App__Send__User):

    def setup(self):
        result = super().setup()
        if self.should_enable_global_auth():
            self.enable_global_auth()
        return result

    def enable_global_auth(self):
        from osbot_fast_api.api.schemas.consts.consts__Fast_API  import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
        from osbot_fast_api.api.middlewares.Middleware__Check_API_Key import Middleware__Check_API_Key
        os.environ[ENV_VAR__FAST_API__AUTH__API_KEY__NAME ] = 'x-sgraph-access-token'
        os.environ[ENV_VAR__FAST_API__AUTH__API_KEY__VALUE] = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        self.app().add_middleware(Middleware__Check_API_Key,
                                  env_var__api_key__name  = ENV_VAR__FAST_API__AUTH__API_KEY__NAME  ,
                                  env_var__api_key__value = ENV_VAR__FAST_API__AUTH__API_KEY__VALUE ,
                                  allow_cors              = True                                    )

    def should_enable_global_auth(self) -> bool:
        enable_auth = get_env(ENV_VAR__SEND__ENABLE_AUTH, '')
        if enable_auth.lower() in ('true', '1', 'yes'):
            return True
        return bool(get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, ''))

    def setup_routes(self):
        super().setup_routes()
        self.add_routes(Routes__Set_Cookie)
        self.setup_static_routes()         # must register after API routes

    def setup_static_routes(self):
        vault_static_dir = get_env(ENV_VAR__SEND__VAULT_STATIC_DIR, SEND__VAULT_STATIC_DIR__DEFAULT)

        # Mount specific sub-paths so /api/* and /info/* routes are not shadowed.
        # A catch-all Mount('/') would intercept everything including FastAPI routes.
        for sub_path in ('_common', 'en-gb', 'i18n'):
            sub_dir = os.path.join(vault_static_dir, sub_path)
            if os.path.isdir(sub_dir):
                self.app().mount(f'/{sub_path}', StaticFiles(directory=sub_dir, html=True), name=f'vault-{sub_path}')

        # Root: serve the vault index.html directly
        index_html = os.path.join(vault_static_dir, 'index.html')

        @route_path(path='/')
        def serve_vault_root():
            return FileResponse(index_html)

        self.add_route_get(serve_vault_root)
