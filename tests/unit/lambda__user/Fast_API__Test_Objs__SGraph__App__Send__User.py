from fastapi                                                                        import FastAPI
from osbot_fast_api.api.schemas.consts.consts__Fast_API                             import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_utils.type_safe.Type_Safe                                                import Type_Safe
from osbot_utils.utils.Env                                                          import set_env
from starlette.testclient                                                           import TestClient
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User     import Fast_API__SGraph__App__Send__User
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin         import TEST_API_KEY__NAME, TEST_API_KEY__VALUE


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

                set_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME , TEST_API_KEY__NAME)
                set_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE, TEST_API_KEY__VALUE)
                _.fast_api__client.headers = {TEST_API_KEY__NAME: TEST_API_KEY__VALUE}
            return _
