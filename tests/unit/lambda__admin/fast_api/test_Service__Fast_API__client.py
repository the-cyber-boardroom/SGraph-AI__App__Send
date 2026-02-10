from unittest                                                                       import TestCase
from fastapi                                                                        import FastAPI
from osbot_utils.utils.Env                                                          import get_env
from starlette.testclient                                                           import TestClient
from osbot_fast_api.api.Fast_API                                                    import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from osbot_fast_api.api.schemas.consts.consts__Fast_API                             import EXPECTED_ROUTES__SET_COOKIE
from osbot_fast_api_serverless.fast_api.routes.Routes__Info                         import ROUTES_INFO__HEALTH__RETURN_VALUE, ROUTES_PATHS__INFO
from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin   import Fast_API__SGraph__App__Send__Admin, ROUTES_PATHS__APP_SEND__STATIC__ADMIN
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin         import TEST_API_KEY__NAME, Fast_API__Test_Objs__SGraph__App__Send__Admin, \
    setup__html_graph_service__fast_api_test_objs


class test_Service__Fast_API__client(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__html_graph_service__fast_api_test_objs() as _:
            cls.service_fast_api_test_objs         = _
            cls.fast_api                           = cls.service_fast_api_test_objs.fast_api
            cls.client                             = cls.service_fast_api_test_objs.fast_api__client
            cls.client.headers[TEST_API_KEY__NAME] = ''

    def test__init__(self):
        with self.service_fast_api_test_objs as _:
            assert type(_)                  is Fast_API__Test_Objs__SGraph__App__Send__Admin
            assert type(_.fast_api        ) is Fast_API__SGraph__App__Send__Admin
            assert type(_.fast_api__app   ) is FastAPI
            assert type(_.fast_api__client) is TestClient
            assert self.fast_api            == _.fast_api
            assert self.client              == _.fast_api__client

    def test__client__auth(self):
        path                = '/info/health'
        auth_key_name       = get_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME )
        auth_key_value      = get_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE)
        headers             = {auth_key_name: auth_key_value}

        response__no_auth   = self.client.get(url=path, headers={})
        response__with_auth = self.client.get(url=path, headers=headers)

        assert response__no_auth.status_code == 401
        assert response__no_auth.json()      == { 'data'   : None,
                                                  'error'  : None,
                                                  'message': 'Client API key is missing, you need to set it on a header or cookie',
                                                  'status' : 'error'}

        assert auth_key_name                 is not None
        assert auth_key_value                is not None
        assert response__with_auth.json()    == ROUTES_INFO__HEALTH__RETURN_VALUE

    def test__config_fast_api_routes(self):
        fast_api_paths = []

        raw_paths      = sorted(ROUTES_PATHS__INFO                    +
                                EXPECTED_ROUTES__SET_COOKIE           +
                                ROUTES_PATHS__APP_SEND__STATIC__ADMIN )

        for fast_api_path in self.fast_api.routes_paths():
            fast_api_paths.append(str(fast_api_path))               # cast to str to make it easier compare

        assert sorted(fast_api_paths)       == sorted(raw_paths)                        # this creates a better diff
        assert self.fast_api.routes_paths() == sorted(raw_paths   )                     # but this also works :)