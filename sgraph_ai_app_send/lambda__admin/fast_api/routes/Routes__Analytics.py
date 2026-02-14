# ===============================================================================
# SGraph Send - Analytics Routes
# REST endpoints for analytics pulse (admin Lambda)
# ===============================================================================

from osbot_fast_api.api.decorators.route_path                                  import route_path
from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client              import Send__Cache__Client
from sgraph_ai_app_send.lambda__admin.service.Service__Analytics__Pulse        import compute_pulse

TAG__ROUTES_ANALYTICS = 'analytics'

ROUTES_PATHS__ANALYTICS = [f'/health/pulse']


class Routes__Analytics(Fast_API__Routes):                                 # Analytics endpoints
    tag               : str = TAG__ROUTES_ANALYTICS
    send_cache_client : Send__Cache__Client                                # Injected cache client

    @route_path(path='/health/pulse')
    def pulse(self, window_minutes: int = 5) -> dict:                      # GET /health/pulse
        return compute_pulse(
            send_cache_client = self.send_cache_client ,
            window_minutes    = window_minutes         )

    def setup_routes(self):                                                # Register analytics endpoints
        self.add_route_get(self.pulse)
        return self
