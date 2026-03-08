import sgraph_ai_app_send__ui__user
from unittest                                                                   import TestCase
from osbot_utils.utils.Files                                                    import path_combine, file_exists
from sgraph_ai_app_send.lambda__user.user__config                               import APP_SEND__UI__USER__ROUTE__PATH__CONSOLE, APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__LOCALE
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User       import setup__fast_api__user__test_objs


class test__welcome_page_route(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.service_fast_api_test_objs = _
            cls.client                     = cls.service_fast_api_test_objs.fast_api__client

    def test__welcome_redirect(self):
        response_no_redirect = self.client.get('/welcome', follow_redirects=False)
        response_redirect    = self.client.get('/welcome', follow_redirects=True )

        expected_path = f'/{APP_SEND__UI__USER__ROUTE__PATH__CONSOLE}/{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/welcome/index.html'

        assert response_no_redirect.status_code              == 307                        # /welcome redirects
        assert response_no_redirect.headers['location']      == expected_path              # redirect target is correct
        assert response_redirect.status_code                 == 200                        # redirected page loads

    def test__welcome_page_content(self):
        response = self.client.get('/welcome', follow_redirects=True)

        assert '<send-welcome>'     in response.text                                       # welcome Web Component present
        assert 'js/crypto.js'       in response.text                                       # crypto.js included
        assert 'js/api-client.js'   in response.text                                       # api-client.js included
        assert 'send-welcome.js'    in response.text                                       # welcome component script included

    def test__welcome_page_file_exists(self):
        expected_file_path = path_combine(sgraph_ai_app_send__ui__user.path,
                                          f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/welcome/index.html')
        assert file_exists(expected_file_path) is True

    def test__welcome_component_js_exists(self):
        response = self.client.get(f'/send/{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/_common/js/components/send-welcome/send-welcome.js')
        assert response.status_code == 200
        assert 'SendWelcome'               in response.text                                 # class defined
        assert 'send-welcome'              in response.text                                 # custom element registered
        assert 'SendCrypto.importKey'      in response.text                                 # uses crypto for decryption
        assert 'ApiClient.downloadPayload' in response.text                                 # uses API client for fetch
        assert 'ApiClient.setAccessToken'  in response.text                                 # saves token to localStorage
        assert 'SGMETA_MAGIC'             in response.text                                 # handles SGMETA envelope

    def test__welcome_component_css_exists(self):
        response = self.client.get(f'/send/{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/_common/js/components/send-welcome/send-welcome.css')
        assert response.status_code == 200
        assert 'welcome-spinner'    in response.text
        assert 'welcome-success'    in response.text
        assert 'welcome-error'      in response.text

    def test__welcome_page__no_access_gate(self):
        response = self.client.get('/welcome', follow_redirects=True)
        assert '<send-access-gate>' not in response.text                                   # welcome page must NOT have access gate
