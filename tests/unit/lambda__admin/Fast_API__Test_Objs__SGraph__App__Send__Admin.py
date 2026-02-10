from fastapi                                                                        import FastAPI
from osbot_fast_api.api.schemas.consts.consts__Fast_API                             import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_utils.type_safe.Type_Safe                                                import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.Random_Guid               import Random_Guid
from starlette.testclient                                                           import TestClient
from osbot_utils.utils.Env                                                          import set_env
from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin   import Fast_API__SGraph__App__Send__Admin

TEST_API_KEY__NAME = 'key-used-in-pytest'
TEST_API_KEY__VALUE = Random_Guid()

class Fast_API__Test_Objs__SGraph__App__Send__Admin(Type_Safe):
    fast_api        : Fast_API__SGraph__App__Send__Admin = None
    fast_api__app   : FastAPI                            = None
    fast_api__client: TestClient                         = None
    setup_completed : bool                               = False

fast_api__test_objs__sgraph_app_send_admin = Fast_API__Test_Objs__SGraph__App__Send__Admin()

def setup__html_graph_service__fast_api_test_objs():
        with fast_api__test_objs__sgraph_app_send_admin as _:
            if _.setup_completed is False:
                _.fast_api         = Fast_API__SGraph__App__Send__Admin().setup()
                _.fast_api__app    = _.fast_api.app()
                _.fast_api__client = _.fast_api.client()
                _.setup_completed  = True

                set_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME , TEST_API_KEY__NAME)
                set_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE, TEST_API_KEY__VALUE)
                _.fast_api__client.headers = {TEST_API_KEY__NAME: TEST_API_KEY__VALUE}
            return _