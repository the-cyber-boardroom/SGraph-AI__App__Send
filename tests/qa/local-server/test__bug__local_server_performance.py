import requests
from unittest                   import TestCase
from osbot_utils.testing.Pytest import skip_pytest
from osbot_utils.utils.Env      import get_env, load_dotenv
from osbot_utils.utils.Files    import path_combine, file_not_exists
from osbot_utils.utils.Http     import url_join_safe

FILE_NAME__LOCAL_SERVER__ENV = ".local-server.env"
URL__TARGET_SERVER           = "http://localhost:10061"

class test__bug__local_server_performance(TestCase):

    @classmethod
    def setUpClass(cls):
        path_dotenv = path_combine(__file__, f'../{FILE_NAME__LOCAL_SERVER__ENV}')
        if file_not_exists(path_dotenv):
            skip_pytest("Tests need .env file")
        load_dotenv(path_dotenv, override=True)
        auth_name  = get_env('FAST_API__AUTH__API_KEY__NAME')
        auth_value = get_env('FAST_API__AUTH__API_KEY__VALUE')
        if auth_name and auth_value:
            cls.auth_headers = { auth_name:auth_value }
        else:
            skip_pytest("Could not find auth keys")

    def request(self, path):
        url = url_join_safe(URL__TARGET_SERVER, path)
        return requests.get(url, headers=self.auth_headers, allow_redirects=False)


    # normal Fast_API calls

    def test__request__docs(self):
        path = "/docs"
        response = self.request(path)
        assert response.status_code == 200

    def test__request__info__status(self):
        path = "/info/status"
        response = self.request(path)
        assert response.status_code == 200

    def test__request__open_api_json(self):
        path = "/openapi.json"
        response = self.request(path)
        assert response.status_code == 200

    def test__request__404(self):
        path = "/404"
        response = self.request(path)
        assert response.status_code == 404

    # SG/Send Admin UI files

    def test__admin(self):
        path = "/admin"
        response = self.request(path)
        assert response.status_code == 307

    def test__admin__v_1_4__index(self):
        path = "/admin/v0/v0.1/v0.1.4/index.html"
        response = self.request(path)
        assert response.status_code == 200

    def test__admin__v_1_4__js__metrics_dashboard_js(self):
        path = "/admin/v0/v0.1/v0.1.1/components/metrics-dashboard/metrics-dashboard.js"
        response = self.request(path)
        assert response.status_code == 200

    def test__admin__v_1_4__js__admin_api_cache_js(self):
        path = "/admin/v0/v0.1/v0.1.1/js/admin-api-cache.js"
        response = self.request(path)
        assert response.status_code == 200

    def test__admin__v_1_4__js__pki_contacts_js(self):
        path = "/admin/v0/v0.1/v0.1.3/components/pki-contacts/pki-contacts.js"
        response = self.request(path)
        assert response.status_code == 200


    # SG/Send Admin API methods
    def test__tokens__list(self):
        path = "/tokens/list"
        response = self.request(path)
        assert response.status_code == 200

    def test__tokens__list_details(self):
        path = "/tokens/list-details"
        response = self.request(path)
        assert response.status_code == 200


