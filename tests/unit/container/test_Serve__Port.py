import os

from unittest                           import TestCase
from sgraph_ai_app_send__docker.serve   import resolve_http_port, APP__HTTP_PORT__DEFAULT


class test_Serve__Port(TestCase):                                                # ADR-2: $PORT contract (Cloud Run / Heroku inject it)

    def tearDown(self):
        os.environ.pop('PORT', None)

    def test__default_port_is_8080(self):
        os.environ.pop('PORT', None)
        assert resolve_http_port() == APP__HTTP_PORT__DEFAULT == 8080

    def test__port_env_var_honoured(self):
        os.environ['PORT'] = '9999'
        assert resolve_http_port() == 9999

    def test__port_env_var_coerced_to_int(self):
        os.environ['PORT'] = '8081'
        result = resolve_http_port()
        assert result == 8081
        assert type(result) is int
