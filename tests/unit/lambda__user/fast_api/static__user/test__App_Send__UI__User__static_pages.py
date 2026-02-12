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
        assert 'SGraph Send'                    in response__redirects.text                          # confirm real content is there
        assert '<send-upload>'                  in response__redirects.text                          # confirm Web Component is there

    def test__upload_page__crypto_availability_check(self):
        response = self.client.get('/send', follow_redirects=True)
        assert response.status_code == 200
        # Upload page must include the crypto.js script
        assert 'js/crypto.js' in response.text

        # Verify crypto.js itself contains the availability check
        crypto_response = self.client.get('/send/v0/v0.1/v0.1.0/js/crypto.js')
        assert crypto_response.status_code      == 200
        assert 'isAvailable'                     in crypto_response.text                              # availability check method exists
        assert 'requireSecureContext'             in crypto_response.text                              # guard method exists
        assert 'crypto.subtle'                   in crypto_response.text                              # checks for crypto.subtle
        assert 'secure context'                  in crypto_response.text.lower()                      # error message mentions secure context

    def test__upload_page__send_upload_checks_crypto(self):
        upload_js = self.client.get('/send/v0/v0.1/v0.1.0/components/send-upload/send-upload.js')
        assert upload_js.status_code == 200
        assert 'SendCrypto.isAvailable()'   in upload_js.text                                        # upload component checks availability before encryption
        assert 'secure context'             in upload_js.text.lower()                                 # user-facing error mentions secure context

    def test__download_page__send_download_checks_crypto(self):
        download_js = self.client.get('/send/v0/v0.1/v0.1.0/components/send-download/send-download.js')
        assert download_js.status_code == 200
        assert 'SendCrypto.isAvailable()'   in download_js.text                                      # download component checks availability before decryption
        assert 'secure context'             in download_js.text.lower()                               # user-facing error mentions secure context

    def test__download_page__loads(self):
        response = self.client.get('/send/v0/v0.1/v0.1.0/download.html')
        assert response.status_code         == 200
        assert '<send-download>'             in response.text                                         # download Web Component present
        assert 'js/crypto.js'               in response.text                                         # crypto.js included on download page

    def test__test_files__available(self):
        response_txt  = self.client.get('/send/v0/v0.1/v0.1.0/test-files/test-text.txt')
        response_json = self.client.get('/send/v0/v0.1/v0.1.0/test-files/test-data.json')

        assert response_txt.status_code  == 200                                                      # text test file is served
        assert 'SGraph Send'              in response_txt.text                                        # text file has expected content

        assert response_json.status_code == 200                                                      # JSON test file is served
        assert 'test_file'               in response_json.text                                       # JSON file has expected content

    def test__upload_page__test_files_section(self):
        response = self.client.get('/send', follow_redirects=True)
        assert response.status_code == 200
        assert 'Test Files'               in response.text                                           # test files section is present
        assert 'test-text.txt'            in response.text                                           # text file link present
        assert 'test-data.json'           in response.text                                           # JSON file link present
