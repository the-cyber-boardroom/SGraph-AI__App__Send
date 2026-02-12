from unittest                                                                       import TestCase
from fastapi                                                                        import FastAPI
from starlette.testclient                                                           import TestClient
from osbot_fast_api_serverless.fast_api.routes.Routes__Info                         import ROUTES_INFO__HEALTH__RETURN_VALUE, ROUTES_PATHS__INFO
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User     import Fast_API__SGraph__App__Send__User, ROUTES_PATHS__APP_SEND__STATIC__USER
from sgraph_ai_app_send.lambda__user.fast_api.routes.Routes__Transfers              import ROUTES_PATHS__TRANSFERS
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User           import Fast_API__Test_Objs__SGraph__App__Send__User, \
    setup__fast_api__user__test_objs


class test_Fast_API__SGraph__App__Send__User(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.service_fast_api_test_objs         = _
            cls.fast_api                           = cls.service_fast_api_test_objs.fast_api
            cls.client                             = cls.service_fast_api_test_objs.fast_api__client

    def test__init__(self):
        with self.service_fast_api_test_objs as _:
            assert type(_)                  is Fast_API__Test_Objs__SGraph__App__Send__User
            assert type(_.fast_api        ) is Fast_API__SGraph__App__Send__User
            assert type(_.fast_api__app   ) is FastAPI
            assert type(_.fast_api__client) is TestClient
            assert self.fast_api            == _.fast_api
            assert self.client              == _.fast_api__client

    def test__client__no_auth_required(self):
        path     = '/info/health'
        response = self.client.get(url=path)
        assert response.status_code == 200
        assert response.json()      == ROUTES_INFO__HEALTH__RETURN_VALUE

    def test__config_fast_api_routes(self):
        fast_api_paths = []

        raw_paths      = sorted(ROUTES_PATHS__INFO                    +
                                ROUTES_PATHS__TRANSFERS               +
                                ROUTES_PATHS__APP_SEND__STATIC__USER  )

        for fast_api_path in self.fast_api.routes_paths():
            fast_api_paths.append(str(fast_api_path))               # cast to str to make it easier compare

        assert sorted(fast_api_paths)       == sorted(raw_paths)                        # this creates a better diff
        assert self.fast_api.routes_paths() == sorted(raw_paths   )                     # but this also works :)
