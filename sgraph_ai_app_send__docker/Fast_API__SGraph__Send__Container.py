import sgraph_ai_app_send__ui__user

from osbot_fast_api.api.routes.Routes__Set_Cookie                               import Routes__Set_Cookie
from osbot_utils.utils.Env                                                      import get_env
from starlette.responses                                                        import RedirectResponse
from starlette.staticfiles                                                      import StaticFiles
from osbot_fast_api.api.decorators.route_path                                   import route_path
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User  import Fast_API__SGraph__App__Send__User
from sgraph_ai_app_send.lambda__user.user__config                               import APP_SEND__UI__USER__ROUTE__PATH__CONSOLE, APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__START_PAGE, ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN

ENV_VAR__SEND__ENABLE_AUTH = 'SEND__ENABLE_AUTH'


class Fast_API__SGraph__Send__Container(Fast_API__SGraph__App__Send__User):

    def setup(self):
        result = super().setup()
        if self.should_enable_global_auth():
            self.enable_global_auth()
        return result

    def enable_global_auth(self):
        import os
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
        self.setup_static_routes()
        self.add_routes(Routes__Set_Cookie)

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
        def redirect_to_send():
            return RedirectResponse(url=path_latest_version)

        self.add_route_get(redirect_to_send)

