import sgraph_ai_app_send__ui__user
from unittest                                                                   import TestCase
from osbot_utils.utils.Files                                                    import path_combine, file_contents, file_exists
from sgraph_ai_app_send.lambda__user.user__config                               import APP_SEND__UI__USER__MAJOR__VERSION, APP_SEND__UI__USER__LATEST__VERSION, APP_SEND__UI__USER__START_PAGE, APP_SEND__UI__USER__LOCALE
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User       import setup__fast_api__user__test_objs


class test__App_Send__UI__User__static_pages(TestCase):
    """Tests that UI static files exist on disk.

    The FastAPI app no longer serves static files (CloudFront handles that in
    production, and user__run-locally.sh provides a pure static server for
    local dev). These tests verify the UI package contains the expected files.
    """

    @classmethod
    def setUpClass(cls):
        cls.ui_root = sgraph_ai_app_send__ui__user.path
        with setup__fast_api__user__test_objs() as _:
            cls.service_fast_api_test_objs = _
            cls.client                     = cls.service_fast_api_test_objs.fast_api__client

    def test__api_docs_still_served(self):
        assert self.client.get('/api/docs'        ).status_code == 200
        assert self.client.get('/api/openapi.json').status_code == 200

    def test__upload_page_exists(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/{APP_SEND__UI__USER__START_PAGE}.html')
        assert file_exists(path) is True
        content = file_contents(path)
        assert '<send-upload>'   in content
        assert 'js/crypto.js'   in content
        assert 'api-client.js'  in content

    def test__download_page_exists(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/{APP_SEND__UI__USER__LOCALE}/download/index.html')
        assert file_exists(path) is True
        content = file_contents(path)
        assert '<send-download>' in content
        assert 'js/crypto.js'   in content

    def test__download_page_v022_exists(self):
        path = path_combine(self.ui_root, 'v0/v0.2/v0.2.2/en-gb/download/index.html')
        assert file_exists(path) is True
        content = file_contents(path)
        assert '<send-download>'         in content
        assert 'send-download-v022.js'   in content

    def test__crypto_js_exists(self):
        path = path_combine(self.ui_root,
                            f'{APP_SEND__UI__USER__MAJOR__VERSION}/{APP_SEND__UI__USER__LATEST__VERSION}/_common/js/crypto.js')
        assert file_exists(path) is True
        content = file_contents(path)
        assert 'isAvailable'          in content
        assert 'requireSecureContext' in content
        assert 'crypto.subtle'        in content

    def test__api_client_v022_has_configurable_endpoint(self):
        path = path_combine(self.ui_root, 'v0/v0.2/v0.2.2/_common/js/api-client.js')
        assert file_exists(path) is True
        content = file_contents(path)
        assert 'apiEndpoint'   in content
        assert 'baseUrl'       in content
        assert '_corsMode'     in content

    def test__test_files_exist(self):
        txt_path  = path_combine(self.ui_root, 'v0/v0.1/v0.1.0/test-files/test-text.txt')
        json_path = path_combine(self.ui_root, 'v0/v0.1/v0.1.0/test-files/test-data.json')
        assert file_exists(txt_path)  is True
        assert file_exists(json_path) is True
