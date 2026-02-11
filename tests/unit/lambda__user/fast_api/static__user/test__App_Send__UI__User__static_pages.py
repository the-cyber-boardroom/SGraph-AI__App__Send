import sgraph_ai_app_send__ui__user
from unittest                                                                   import TestCase
from osbot_utils.utils.Files                                                    import path_combine, file_contents, file_exists
from sgraph_ai_app_send.lambda__user.user__config                               import APP_SEND__UI__USER__ROUTE__PATH__CONSOLE, APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__START_PAGE
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User       import setup__fast_api__user__test_objs


class test__App_Send__UI__User__static_pages(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.service_fast_api_test_objs = _
            cls.client                     = cls.service_fast_api_test_objs.fast_api__client

    def test__root(self):
        assert self.client.get('/'                                       ).status_code == 404          # not wired in
        assert self.client.get('/docs'                                   ).status_code == 200          # default swagger page
        assert self.client.get('/openapi.json'                           ).status_code == 200          # openapi.json spec
        assert self.client.get('/send/index.html'                        ).status_code == 200          # confirm static route is working
        assert self.client.get('/send'          , follow_redirects=False ).status_code == 307          # confirm redirect is working
        assert self.client.get('/send'          , follow_redirects=True  ).status_code == 200          # confirm base page is there

    def test__send(self):
        response__no_redirects     = self.client.get('/send', follow_redirects=False )
        response__redirects        = self.client.get('/send', follow_redirects=True  )
        expected_file_virtual_path = f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__START_PAGE}.html'
        expected_file_path         = path_combine(sgraph_ai_app_send__ui__user.path, expected_file_virtual_path)
        expected_redirect          = f'/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}/{expected_file_virtual_path}'

        assert response__no_redirects.headers['location'] == '/send/v0/v0.1/v0.1.0/index.html'      # remove once we have more versions, but good to see what the path looks like
        assert response__no_redirects.headers['location'] == expected_redirect
        assert response__redirects.request.url            == f'http://testserver{expected_redirect}'

        assert file_exists(expected_file_path) is True                                              # confirm file exists in disk
        assert response__redirects.text        == file_contents(expected_file_path)                 # confirm contents match
        assert response__redirects.text        == 'IFD version v0.1.0 will go here'                 # remove once we have the real content in there
