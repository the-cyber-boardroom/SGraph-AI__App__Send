from fastapi                                                                        import FastAPI
from osbot_utils.type_safe.Type_Safe                                                import Type_Safe
from starlette.testclient                                                           import TestClient
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User     import Fast_API__SGraph__App__Send__User


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
            return _
