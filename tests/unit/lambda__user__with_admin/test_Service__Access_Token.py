# ===============================================================================
# Tests — Service__Access_Token
# Token validation + Lambda-lifetime TTL cache in front of the Admin token_lookup.
# Uses a real in-memory Admin app (no mocks/patches). The cache "hit skips the
# Admin round-trip" property is proven by seeding a warm entry for a token the
# Admin does NOT know: if the lookup ran it would 401, so a passing check can
# only mean the cache short-circuited.
# ===============================================================================

import time
from unittest                                                                          import TestCase
from fastapi                                                                            import HTTPException
from osbot_fast_api.api.schemas.consts.consts__Fast_API                                import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_utils.utils.Env                                                              import set_env
from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin       import Fast_API__SGraph__App__Send__Admin
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Setup              import setup_admin_service_client__in_memory
from sgraph_ai_app_send.lambda__user.service.Service__Access_Token                      import Service__Access_Token
from sgraph_ai_app_send.lambda__user.user__config                                       import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN


class test_Service__Access_Token(TestCase):

    @classmethod
    def setUpClass(cls):
        set_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME , 'test-key-name' )
        set_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE, 'test-key-value')
        cls.admin_fast_api = Fast_API__SGraph__App__Send__Admin().setup()
        cls.client         = setup_admin_service_client__in_memory(cls.admin_fast_api)
        cls.token_name     = 'access-token-cache-test'
        assert cls.client.token_create(cls.token_name, usage_limit=50).status_code == 200
        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')                          # force the admin path (not the env-var fallback)

    # --- admin path ---------------------------------------------------------------

    def test__valid_token__validated_and_cached(self):
        svc = Service__Access_Token(admin_service_client=self.client, ttl_seconds=300)
        assert svc.check(self.token_name) == self.token_name
        assert self.token_name in svc._cache
        assert svc._cache[self.token_name][0] == 'active'
        assert svc.check(self.token_name) == self.token_name                     # second call also passes (served from cache)

    def test__invalid_token__raises_401_and_not_cached(self):
        svc = Service__Access_Token(admin_service_client=self.client, ttl_seconds=300)
        with self.assertRaises(HTTPException) as ctx:
            svc.check('this-token-does-not-exist')
        assert ctx.exception.status_code == 401
        assert 'this-token-does-not-exist' not in svc._cache                     # negatives are never cached

    def test__missing_token__raises_401(self):
        svc = Service__Access_Token(admin_service_client=self.client, ttl_seconds=300)
        with self.assertRaises(HTTPException) as ctx:
            svc.check('')
        assert ctx.exception.status_code == 401

    def test__cache_hit__skips_admin_lookup(self):
        svc   = Service__Access_Token(admin_service_client=self.client, ttl_seconds=300)
        token = 'unknown-to-admin'                                               # admin would 401 this
        svc._cache[token] = ('active', time.time())                             # seed a warm positive
        assert svc.check(token) == token                                         # passes → cache short-circuited the lookup

    def test__expired_cache__forces_revalidation(self):
        svc   = Service__Access_Token(admin_service_client=self.client, ttl_seconds=0)   # everything immediately stale
        token = 'unknown-to-admin'
        svc._cache[token] = ('active', time.time() - 10)
        with self.assertRaises(HTTPException) as ctx:                            # re-validates → admin rejects
            svc.check(token)
        assert ctx.exception.status_code == 401
        assert token not in svc._cache                                          # expired entry dropped

    # --- env-var fallback path (no admin client) ----------------------------------

    def test__no_admin_client__env_var_fallback(self):
        svc = Service__Access_Token(admin_service_client=None, ttl_seconds=60)
        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, 'env-secret')
        try:
            assert svc.check('env-secret') == 'env-secret'
            with self.assertRaises(HTTPException):
                svc.check('wrong')
        finally:
            set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, '')                      # restore open/local-dev for other tests
        assert svc.check('anything') == 'anything'                              # no token configured → allow all (local dev)
