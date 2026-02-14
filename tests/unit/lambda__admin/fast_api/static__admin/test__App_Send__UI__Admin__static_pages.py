import sgraph_ai_app_send__ui__admin
from unittest                                                                   import TestCase
from osbot_utils.utils.Files                                                    import path_combine, file_contents, file_exists
from sgraph_ai_app_send.lambda__admin.admin__config                             import APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE, APP_SEND__UI__ADMIN__MAJOR__VERSION, APP_SEND__UI__ADMIN__LATEST__VERSION, APP_SEND__UI__ADMIN__START_PAGE
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin     import setup__html_graph_service__fast_api_test_objs


class test__App_Send__UI__Admin__static_pages(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__html_graph_service__fast_api_test_objs() as _:
            cls.service_fast_api_test_objs = _
            cls.client                     = cls.service_fast_api_test_objs.fast_api__client

    def test__root(self):
        assert self.client.get('/'                                       ).status_code == 404          # not wired in
        assert self.client.get('/docs'                                   ).status_code == 200          # default swagger page
        assert self.client.get('/openapi.json'                           ).status_code == 200          # openapi.json spec
        assert self.client.get('/admin/index.html'                       ).status_code == 200          # confirm static route is working
        assert self.client.get('/admin'         , follow_redirects=False ).status_code == 307          # confirm redirect is working
        assert self.client.get('/admin'         , follow_redirects=True  ).status_code == 200          # confirm base page is there

    def test__admin(self):
        response__no_redirects     = self.client.get('/admin', follow_redirects=False )
        response__redirects        = self.client.get('/admin', follow_redirects=True  )
        expected_file_virtual_path = f'{APP_SEND__UI__ADMIN__MAJOR__VERSION}/{APP_SEND__UI__ADMIN__LATEST__VERSION}/{APP_SEND__UI__ADMIN__START_PAGE}.html'
        expected_file_path         = path_combine(sgraph_ai_app_send__ui__admin.path, expected_file_virtual_path)
        expected_redirect          = f'/{APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE}/{expected_file_virtual_path}'

        assert response__no_redirects.headers['location'] == '/admin/v0/v0.1/v0.1.0/index.html'     # remove once we have more versions, but good to see what the path looks like
        assert response__no_redirects.headers['location'] == expected_redirect
        assert response__redirects.request.url            == f'http://testserver{expected_redirect}'

        assert file_exists(expected_file_path) is True                                              # confirm file exists in disk
        assert response__redirects.text        == file_contents(expected_file_path)                 # confirm contents match
        assert 'SGraph Send'                   in response__redirects.text                           # confirm admin console content is present
        assert '<admin-shell>'                 in response__redirects.text                           # confirm Web Components are used
