from fastapi                                                                        import FastAPI
from osbot_utils.type_safe.Type_Safe                                                import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.Random_Guid               import Random_Guid
from osbot_utils.utils.Env                                                          import set_env
from starlette.testclient                                                           import TestClient
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User     import Fast_API__SGraph__App__Send__User
from sgraph_ai_app_send.lambda__user.user__config                                   import ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_SEND__ACCESS_TOKEN

TEST_ACCESS_TOKEN = Random_Guid()

class Fast_API__Test_Objs__SGraph__App__Send__User(Type_Safe):
    fast_api        : Fast_API__SGraph__App__Send__User = None
    fast_api__app   : FastAPI                           = None
    fast_api__client: TestClient                        = None
    setup_completed : bool                              = False

fast_api__test_objs__sgraph_app_send_user = Fast_API__Test_Objs__SGraph__App__Send__User()

def setup__fast_api__user__test_objs():
        with fast_api__test_objs__sgraph_app_send_user as _:
            if _.setup_completed is False:
                _.fast_api         = Fast_API__SGraph__App__Send__User().setup()
                _.fast_api__app    = _.fast_api.app()
                _.fast_api__client = _.fast_api.client()
                _.setup_completed  = True

                set_env(ENV_VAR__SGRAPH_SEND__ACCESS_TOKEN, TEST_ACCESS_TOKEN)
                _.fast_api__client.headers = {HEADER__SGRAPH_SEND__ACCESS_TOKEN: TEST_ACCESS_TOKEN}
            return _
