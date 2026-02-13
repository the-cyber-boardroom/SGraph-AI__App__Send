# ===============================================================================
# SGraph Send - Cache Service Setup
# Configures MGraph-AI Cache Service in IN_MEMORY mode for use within Lambda
# ===============================================================================

from mgraph_ai_service_cache.fast_api.Cache_Service__Fast_API                                                   import Cache_Service__Fast_API
from mgraph_ai_service_cache_client.client.cache_client.Cache__Service__Client                                  import Cache__Service__Client
from osbot_fast_api.services.registry.Fast_API__Service__Registry                                               import Fast_API__Service__Registry__Client__Config
from osbot_fast_api.services.registry.Fast_API__Service__Registry                                               import fast_api__service__registry
from osbot_fast_api.services.schemas.registry.enums.Enum__Fast_API__Service__Registry__Client__Mode             import Enum__Fast_API__Service__Registry__Client__Mode
from osbot_utils.helpers.cache.Cache__Hash__Generator                                                           import Cache__Hash__Generator
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client                                               import Send__Cache__Client


def create_send_cache_client():                                            # Factory: create Send__Cache__Client with IN_MEMORY cache service
    cache_service = Cache_Service__Fast_API()
    cache_service.config.enable_api_key = False                            # No auth needed for in-process cache
    cache_service.setup()

    config = Fast_API__Service__Registry__Client__Config(
        mode         = Enum__Fast_API__Service__Registry__Client__Mode.IN_MEMORY ,
        fast_api     = cache_service                                             ,
        fast_api_app = cache_service.app()                                       )
    fast_api__service__registry.register(
        client_type = Cache__Service__Client ,
        config      = config                 )

    client         = Cache__Service__Client()
    hash_generator = Cache__Hash__Generator()

    return Send__Cache__Client(cache_client   = client         ,
                               hash_generator = hash_generator )
