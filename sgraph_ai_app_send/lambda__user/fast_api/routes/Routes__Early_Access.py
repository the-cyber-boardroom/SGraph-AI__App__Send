# ===============================================================================
# SGraph Send - Early Access Signup Routes
# POST /api/early-access/signup — replaces LaunchList form submission
# ===============================================================================

from fastapi                                                                      import HTTPException, Request
from osbot_fast_api.api.routes.Fast_API__Routes                                   import Fast_API__Routes
from sgraph_ai_app_send.lambda__user.schemas.Schema__Early_Access                 import Schema__Early_Access__Signup
from sgraph_ai_app_send.lambda__user.service.Service__Early_Access                import Service__Early_Access

TAG__ROUTES_EARLY_ACCESS = 'api/early-access'

ROUTES_PATHS__EARLY_ACCESS = [f'/{TAG__ROUTES_EARLY_ACCESS}/signup']


class Routes__Early_Access(Fast_API__Routes):                                      # Early Access signup endpoint
    tag                  : str = TAG__ROUTES_EARLY_ACCESS
    service_early_access : Service__Early_Access

    def signup(self, body    : Schema__Early_Access__Signup,                        # POST /api/early-access/signup
                     request : Request
              ) -> dict:
        name  = body.name.strip()
        email = body.email.strip()

        # Validate input
        validation = self.service_early_access.validate_signup(name, email)
        if not validation['valid']:
            raise HTTPException(status_code = 422,
                                detail      = validation['errors'])

        # Detect locale from Accept-Language header or Referer URL
        locale = self._detect_locale(request)

        # Send notification emails
        result = self.service_early_access.send_notification(name   = name  ,
                                                              email  = email ,
                                                              locale = locale)
        return dict(success   = True                ,
                    email     = email                ,
                    timestamp = result['timestamp'] )

    def _detect_locale(self, request: Request) -> str:                              # Best-effort locale detection
        referer = request.headers.get('referer', '')
        if '/en-gb/' in referer: return 'en-gb'
        if '/en-us/' in referer: return 'en-us'
        if '/pt-pt/' in referer: return 'pt-pt'
        if '/pt-br/' in referer: return 'pt-br'
        if '/de-de/' in referer: return 'de-de'
        if '/es-es/' in referer: return 'es-es'
        if '/fr-fr/' in referer: return 'fr-fr'

        accept_lang = request.headers.get('accept-language', '')
        if accept_lang:
            return accept_lang.split(',')[0].strip().lower()
        return ''

    def setup_routes(self):                                                        # Register endpoints
        self.add_route_post(self.signup)
        return self
