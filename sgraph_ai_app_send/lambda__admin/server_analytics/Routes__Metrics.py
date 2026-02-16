# ===============================================================================
# SGraph Send - Metrics Routes
# REST endpoints for server metrics (admin Lambda)
# ===============================================================================

from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from sgraph_ai_app_send.lambda__admin.server_analytics.Service__Metrics__Cache import Service__Metrics__Cache

TAG__ROUTES_METRICS = 'metrics'

ROUTES_PATHS__METRICS = [f'/{TAG__ROUTES_METRICS}/snapshot'      ,
                         f'/{TAG__ROUTES_METRICS}/snapshot/refresh',
                         f'/{TAG__ROUTES_METRICS}/cache-status'   ,
                         f'/{TAG__ROUTES_METRICS}/health'         ]


class Routes__Metrics(Fast_API__Routes):                                  # Server metrics endpoints
    tag                : str = TAG__ROUTES_METRICS
    metrics_cache      : Service__Metrics__Cache                           # Injected metrics cache service

    def snapshot(self) -> dict:                                            # GET /metrics/snapshot — cached snapshot
        return self.metrics_cache.get_snapshot(force_refresh=False)

    def snapshot__refresh(self) -> dict:                                   # GET /metrics/snapshot/refresh — force fresh
        return self.metrics_cache.get_snapshot(force_refresh=True)

    def cache_status(self) -> dict:                                        # GET /metrics/cache-status
        return self.metrics_cache.get_cache_status()

    def health(self) -> dict:                                              # GET /metrics/health — health status only
        snapshot = self.metrics_cache.get_snapshot(force_refresh=False)
        return dict(health_status = snapshot.get('health_status', [])      ,
                    snapshot_time = snapshot.get('snapshot_time' , '')      ,
                    _cached_at   = snapshot.get('_cached_at'    , 0)       )

    def setup_routes(self):                                                # Register metrics endpoints
        self.add_route_get(self.snapshot         )
        self.add_route_get(self.snapshot__refresh )
        self.add_route_get(self.cache_status      )
        self.add_route_get(self.health            )
        return self
