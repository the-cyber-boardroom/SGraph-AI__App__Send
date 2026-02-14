# ===============================================================================
# SGraph Send - Admin Service Client Setup
# Registers Admin__Service__Client in the Service Registry
# IN_MEMORY mode for tests, REMOTE mode for production (env-var driven)
# ===============================================================================

from osbot_fast_api.api.schemas.consts.consts__Fast_API                                                        import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_fast_api.services.registry.Fast_API__Service__Registry                                               import Fast_API__Service__Registry__Client__Config
from osbot_fast_api.services.registry.Fast_API__Service__Registry                                               import fast_api__service__registry
from osbot_fast_api.services.schemas.registry.enums.Enum__Fast_API__Service__Registry__Client__Mode             import Enum__Fast_API__Service__Registry__Client__Mode
from osbot_utils.utils.Env                                                                                      import get_env
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client                                             import Admin__Service__Client
from sgraph_ai_app_send.lambda__user.user__config                                                               import ENV_VAR__SGRAPH_SEND__ADMIN__BASE_URL, ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__NAME, ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__VALUE


def setup_admin_service_client__in_memory(admin_fast_api):                     # For tests: register with admin FastAPI app instance
    api_key_name  = get_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME , '')        # Admin Lambda auth keys (set by test or env)
    api_key_value = get_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE, '')

    config = Fast_API__Service__Registry__Client__Config(mode          = Enum__Fast_API__Service__Registry__Client__Mode.IN_MEMORY ,
                                                         fast_api      = admin_fast_api                                            ,
                                                         fast_api_app  = admin_fast_api.app()                                      ,
                                                         api_key_name  = api_key_name                                              ,
                                                         api_key_value = api_key_value                                             )
    fast_api__service__registry.register                (client_type   = Admin__Service__Client                                    ,
                                                         config        = config                                                    )
    return Admin__Service__Client()


def setup_admin_service_client__remote():                                      # For production: register with env-var URL + auth
    base_url      = get_env(ENV_VAR__SGRAPH_SEND__ADMIN__BASE_URL      , '')
    api_key_name  = get_env(ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__NAME , '')
    api_key_value = get_env(ENV_VAR__SGRAPH_SEND__ADMIN__API_KEY__VALUE, '')

    if not base_url:
        return None                                                            # No admin URL configured — skip

    config = Fast_API__Service__Registry__Client__Config(mode          = Enum__Fast_API__Service__Registry__Client__Mode.REMOTE ,
                                                         base_url      = base_url                                               ,
                                                         api_key_name  = api_key_name                                           ,
                                                         api_key_value = api_key_value                                          )
    fast_api__service__registry.register                (client_type   = Admin__Service__Client                                 ,
                                                         config        = config                                                 )
    return Admin__Service__Client()
