# ===============================================================================
# SGraph Send - User Lambda Test Server
# Starts the User Lambda as a real HTTP server on a random port
# for integration testing from external projects (e.g. sg-send-cli)
#
# Usage (in-process TestClient — fast, no real HTTP):
#   with setup__send_user_lambda__test_client() as test_objs:
#       client     = test_objs.fast_api__client
#       token      = test_objs.access_token
#       response   = client.get('/info/health')
#
# Usage (real HTTP server on random port — for CLI tests):
#   with setup__send_user_lambda__test_server() as test_objs:
#       base_url   = test_objs.server_url        # e.g. http://127.0.0.1:54321
#       token      = test_objs.access_token
#       write_key  = test_objs.write_key          # pre-generated for convenience
#       requests.get(f'{base_url}/info/health')
#
# Both modes use in-memory storage (no S3, no external dependencies).
# The server starts in ~100ms and is fully functional.
# ===============================================================================

from fastapi                                                                     import FastAPI
from osbot_fast_api.utils.Fast_API_Server                                        import Fast_API_Server
from osbot_utils.type_safe.Type_Safe                                             import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.Random_Guid            import Random_Guid
from osbot_utils.type_safe.primitives.domains.web.safe_str.Safe_Str__Url         import Safe_Str__Url
from osbot_utils.utils.Env                                                       import set_env
from starlette.testclient                                                        import TestClient
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User  import Fast_API__SGraph__App__Send__User
from sgraph_ai_app_send.lambda__user.user__config                                import (ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN ,
                                                                                          HEADER__SGRAPH_SEND__ACCESS_TOKEN  ,
                                                                                          HEADER__SGRAPH_VAULT__WRITE_KEY    )

# -------------------------------------------------------------------------------
# Test objects returned to callers
# -------------------------------------------------------------------------------

class Send__User_Lambda__Test_Objs(Type_Safe):
    fast_api        : Fast_API__SGraph__App__Send__User = None
    fast_api__app   : FastAPI                           = None
    fast_api__client: TestClient                        = None                   # In-process client (no real HTTP)
    fast_api_server : Fast_API_Server                   = None                   # Real HTTP server (random port)
    server_url      : str                               = ''                     # e.g. http://127.0.0.1:54321
    access_token    : str                               = ''                     # Pre-generated access token
    write_key       : str                               = ''                     # Pre-generated write key for vault tests

# -------------------------------------------------------------------------------
# Singleton for in-process TestClient (same as existing test setup)
# -------------------------------------------------------------------------------

_test_client_singleton = None

def setup__send_user_lambda__test_client():
    """Return test objects with an in-process TestClient (no real HTTP).
    Singleton — first call creates the server, subsequent calls reuse it."""
    global _test_client_singleton
    if _test_client_singleton is None:
        access_token = str(Random_Guid())
        write_key    = str(Random_Guid())
        fast_api     = Fast_API__SGraph__App__Send__User().setup()
        app          = fast_api.app()
        client       = fast_api.client()

        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, access_token)
        client.headers = {HEADER__SGRAPH_SEND__ACCESS_TOKEN: access_token}

        _test_client_singleton = Send__User_Lambda__Test_Objs(
            fast_api         = fast_api      ,
            fast_api__app    = app           ,
            fast_api__client = client        ,
            access_token     = access_token  ,
            write_key        = write_key     )

    return _test_client_singleton

# -------------------------------------------------------------------------------
# Real HTTP server on random port (for CLI integration tests)
# -------------------------------------------------------------------------------

class Send__User_Lambda__Http_Server:
    """Context manager that starts the User Lambda as a real HTTP server.

    Usage:
        with Send__User_Lambda__Http_Server() as test_objs:
            base_url = test_objs.server_url
            token    = test_objs.access_token
            requests.get(f'{base_url}/info/health')
    """

    def __init__(self):
        self.test_objs = None

    def __enter__(self):
        access_token = str(Random_Guid())
        write_key    = str(Random_Guid())
        set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, access_token)

        fast_api     = Fast_API__SGraph__App__Send__User().setup()
        app          = fast_api.app()
        server       = Fast_API_Server(app=app)
        server_url   = server.url().rstrip('/')

        self.test_objs = Send__User_Lambda__Test_Objs(
            fast_api         = fast_api      ,
            fast_api__app    = app           ,
            fast_api_server  = server        ,
            server_url       = server_url    ,
            access_token     = access_token  ,
            write_key        = write_key     )

        server.start()
        return self.test_objs

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.test_objs and self.test_objs.fast_api_server:
            self.test_objs.fast_api_server.stop()


def setup__send_user_lambda__test_server():
    """Return a context manager that starts a real HTTP server.

    Usage:
        with setup__send_user_lambda__test_server() as test_objs:
            base_url = test_objs.server_url
            token    = test_objs.access_token
    """
    return Send__User_Lambda__Http_Server()
