# ===============================================================================
# SGraph Send - Access Token Validation Service
# Centralises the access-token check used by vault write/batch/inbox routes and
# adds a Lambda-lifetime TTL cache in front of the Admin-Lambda token_lookup.
#
# Why: check_access_token previously called admin_service_client.token_lookup
# (an HTTP round-trip to the Admin Lambda) on EVERY authenticated write/batch.
# A vault app sending one message issues several writes back-to-back, so the same
# token was re-validated several times per second. This mirrors the existing
# _manifest_cache pattern (Service__Vault__Pointer): positive results are cached
# for a short TTL; negatives are never cached so a freshly-created token works on
# the next request. Behaviour (status codes, env-var fallback) is unchanged.
# ===============================================================================

import time
from fastapi                                    import HTTPException
from osbot_utils.type_safe.Type_Safe            import Type_Safe


class Service__Access_Token(Type_Safe):                                          # Token validation with a Lambda-lifetime positive-result cache
    admin_service_client : object = None                                         # Admin__Service__Client (None → env-var fallback / local dev)
    ttl_seconds          : int    = 60                                           # How long a positive validation is trusted before re-checking
    _cache               : dict   = None                                         # token → (status, cached_at_epoch); positives only

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self._cache is None:
            self._cache = {}

    def check(self, provided_token):                                             # Validate token; return it (or None for open local dev), else raise HTTPException
        from osbot_utils.utils.Env                                  import get_env
        from sgraph_ai_app_send.lambda__user.user__config           import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN

        if self.admin_service_client is not None:                                # Admin service available — validate via token_lookup (cached)
            if not provided_token:
                raise HTTPException(status_code = 401, detail = 'Access token required')
            if self._cache_hit(provided_token):                                  # Warm positive — skip the Admin round-trip entirely
                return provided_token
            try:
                response = self.admin_service_client.token_lookup(provided_token)
                if response.status_code == 404:
                    raise HTTPException(status_code = 401, detail = 'Invalid access token')
                data = response.json()
                if data.get('status') != 'active':
                    raise HTTPException(status_code = 401,
                                        detail      = f'Access token {data.get("status", "invalid")}')
                self._cache[provided_token] = ('active', time.time())            # Cache positives only
                return provided_token
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code = 503,
                                    detail      = 'Token validation service unavailable')

        # Fallback to env-var check (no admin service configured — local dev / tests)
        expected_token = get_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')
        if not expected_token:                                                   # No token configured — allow all (local dev)
            return provided_token or None
        if provided_token != expected_token:
            raise HTTPException(status_code = 401, detail = 'Access token required')
        return provided_token

    def _cache_hit(self, token):                                                 # True only for a non-expired cached 'active' validation
        entry = self._cache.get(token)
        if not entry:
            return False
        status, cached_at = entry
        if status != 'active':
            return False
        if (time.time() - cached_at) >= self.ttl_seconds:                        # Expired — drop and force re-validation
            self._cache.pop(token, None)
            return False
        return True
