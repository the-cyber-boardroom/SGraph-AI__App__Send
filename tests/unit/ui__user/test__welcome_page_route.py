import sgraph_ai_app_send__ui__user
from unittest                                                                   import TestCase
from osbot_utils.utils.Files                                                    import path_combine, file_contents, file_exists
from sgraph_ai_app_send.lambda__user.user__config                               import APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__LOCALE


class test__welcome_page_route(TestCase):
    """Tests that welcome page files exist on disk.

    The FastAPI app no longer serves static files. These tests verify
    the UI package contains the expected welcome page files.
    """

    @classmethod
    def setUpClass(cls):
        cls.ui_root = sgraph_ai_app_send__ui__user.path

    def test__welcome_page_file_exists(self):
        expected_file_path = path_combine(self.ui_root,
                                          f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/welcome/index.html')
        assert file_exists(expected_file_path) is True

    def test__welcome_page_content(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/welcome/index.html')
        content = file_contents(path)
        assert '<send-welcome>'     in content
        assert 'js/crypto.js'       in content
        assert 'js/api-client.js'   in content
        assert 'send-welcome.js'    in content

    def test__welcome_page__no_access_gate(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/welcome/index.html')
        content = file_contents(path)
        assert '<send-access-gate>' not in content

    def test__welcome_component_js_exists(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/_common/js/components/send-welcome/send-welcome.js')
        assert file_exists(path) is True
        content = file_contents(path)
        assert 'SendWelcome'               in content
        assert 'send-welcome'              in content
        assert 'SendCrypto.importKey'      in content
        assert 'ApiClient.downloadPayload' in content
        assert 'ApiClient.setAccessToken'  in content
        assert 'SGMETA_MAGIC'             in content

    def test__welcome_component_css_exists(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/_common/js/components/send-welcome/send-welcome.css')
        assert file_exists(path) is True
        content = file_contents(path)
        assert 'welcome-spinner'    in content
        assert 'welcome-success'    in content
        assert 'welcome-error'      in content
