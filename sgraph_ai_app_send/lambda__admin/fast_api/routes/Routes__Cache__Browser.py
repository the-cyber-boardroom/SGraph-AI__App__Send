# ===============================================================================
# SGraph Send - Cache Browser Routes
# REST endpoints for browsing the cache service (admin Lambda)
# Provides namespace listing, folder browsing, and entry inspection
# ===============================================================================

from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client              import Send__Cache__Client

TAG__ROUTES_CACHE = 'cache'

ROUTES_PATHS__CACHE = [f'/{TAG__ROUTES_CACHE}/namespaces'         ,
                       f'/{TAG__ROUTES_CACHE}/folders/{{path:path}}',
                       f'/{TAG__ROUTES_CACHE}/files/{{path:path}}'  ,
                       f'/{TAG__ROUTES_CACHE}/entry/{{namespace}}/{{cache_id}}']


class Routes__Cache__Browser(Fast_API__Routes):                                # Cache browser endpoints
    tag                : str = TAG__ROUTES_CACHE
    send_cache_client  : Send__Cache__Client                                   # Injected cache client

    def namespaces(self) -> dict:                                              # GET /cache/namespaces
        return dict(namespaces=['analytics', 'tokens', 'costs', 'transfers'])

    def folders__path(self, path: str = '') -> dict:                           # GET /cache/folders/{path}
        folders = self.send_cache_client.cache_client.admin_storage().folders(
            path             = path   ,
            return_full_path = False  ,
            recursive        = False  ) or []
        return dict(path=path, folders=folders)

    def files__path(self, path: str = '') -> dict:                             # GET /cache/files/{path}
        result = self.send_cache_client.cache_client.admin_storage().files__all__path(path=path)
        files  = []
        if result and hasattr(result, 'files'):
            files = result.files
        elif isinstance(result, list):
            files = result
        return dict(path=path, files=files)

    def entry__namespace__cache_id(self, namespace: str, cache_id: str) -> dict:  # GET /cache/entry/{namespace}/{cache_id}
        data = self.send_cache_client.cache_client.retrieve().retrieve__cache_id__json(
            cache_id  = cache_id  ,
            namespace = namespace )
        if data is None:
            return dict(cache_id=cache_id, namespace=namespace, data=None, found=False)
        return dict(cache_id=cache_id, namespace=namespace, data=data, found=True)

    def setup_routes(self):                                                    # Register all cache browser endpoints
        self.add_route_get(self.namespaces                  )
        self.add_route_get(self.folders__path                )
        self.add_route_get(self.files__path                  )
        self.add_route_get(self.entry__namespace__cache_id   )
        return self
