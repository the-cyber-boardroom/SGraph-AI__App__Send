import os
import tempfile
from unittest                                                                   import TestCase

from sgraph_ai_app_send__docker.Fast_API__TLS__Launcher                         import (
    Fast_API__TLS__Launcher,
    ENV_VAR__TLS__ENABLED, ENV_VAR__TLS__CERT_FILE, ENV_VAR__TLS__KEY_FILE, ENV_VAR__TLS__PORT,
)


class test_Fast_API__TLS__Launcher(TestCase):

    def setUp(self):
        self._env_keys = (ENV_VAR__TLS__ENABLED, ENV_VAR__TLS__CERT_FILE,
                          ENV_VAR__TLS__KEY_FILE, ENV_VAR__TLS__PORT)
        self._saved    = {k: os.environ.get(k) for k in self._env_keys}
        for k in self._env_keys:
            os.environ.pop(k, None)
        self.launcher = Fast_API__TLS__Launcher()

    def tearDown(self):
        for k, v in self._saved.items():
            if v is None: os.environ.pop(k, None)
            else        : os.environ[k] = v

    # --- config_from_env -------------------------------------------------------

    def test__config_from_env__defaults_to_disabled(self):
        config = self.launcher.config_from_env()
        assert config.enabled   is False
        assert config.cert_file == '/certs/cert.pem'
        assert config.key_file  == '/certs/key.pem'
        assert config.tls_port  == 443

    def test__config_from_env__enabled_truthy_values(self):
        for value in ('true', 'True', 'TRUE', '1', 'yes', 'YES'):
            os.environ[ENV_VAR__TLS__ENABLED] = value
            assert self.launcher.config_from_env().enabled is True, value

    def test__config_from_env__disabled_falsy_values(self):
        for value in ('false', '0', 'no', '', 'off', 'anything-else'):
            os.environ[ENV_VAR__TLS__ENABLED] = value
            assert self.launcher.config_from_env().enabled is False, value

    def test__config_from_env__custom_paths_and_port(self):
        os.environ[ENV_VAR__TLS__ENABLED]   = 'true'
        os.environ[ENV_VAR__TLS__CERT_FILE] = '/custom/cert.pem'
        os.environ[ENV_VAR__TLS__KEY_FILE]  = '/custom/key.pem'
        os.environ[ENV_VAR__TLS__PORT]      = '8443'
        config = self.launcher.config_from_env()
        assert config.enabled   is True
        assert config.cert_file == '/custom/cert.pem'
        assert config.key_file  == '/custom/key.pem'
        assert config.tls_port  == 8443

    # --- uvicorn_kwargs --------------------------------------------------------

    def test__uvicorn_kwargs__disabled_is_plain_http(self):
        config = self.launcher.config_from_env()                                    # disabled
        kwargs = self.launcher.uvicorn_kwargs(config, http_port=8080)
        assert kwargs == dict(host='0.0.0.0', port=8080)
        assert 'ssl_certfile' not in kwargs
        assert 'ssl_keyfile'  not in kwargs

    def test__uvicorn_kwargs__enabled_with_files_present(self):
        with tempfile.TemporaryDirectory() as tmp:
            cert = os.path.join(tmp, 'cert.pem'); open(cert, 'w').write('x')
            key  = os.path.join(tmp, 'key.pem');  open(key,  'w').write('x')
            os.environ[ENV_VAR__TLS__ENABLED]   = 'true'
            os.environ[ENV_VAR__TLS__CERT_FILE] = cert
            os.environ[ENV_VAR__TLS__KEY_FILE]  = key
            os.environ[ENV_VAR__TLS__PORT]      = '443'
            config = self.launcher.config_from_env()
            kwargs = self.launcher.uvicorn_kwargs(config, http_port=8080)
            assert kwargs == dict(host='0.0.0.0', port=443,
                                  ssl_certfile=cert, ssl_keyfile=key)

    # --- assert_ready — fail loud ----------------------------------------------

    def test__assert_ready__missing_cert_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = os.path.join(tmp, 'key.pem'); open(key, 'w').write('x')
            os.environ[ENV_VAR__TLS__ENABLED]   = 'true'
            os.environ[ENV_VAR__TLS__CERT_FILE] = os.path.join(tmp, 'missing-cert.pem')
            os.environ[ENV_VAR__TLS__KEY_FILE]  = key
            config = self.launcher.config_from_env()
            with self.assertRaises(AssertionError) as ctx:
                self.launcher.uvicorn_kwargs(config, http_port=8080)
            assert 'cert file not found' in str(ctx.exception)

    def test__assert_ready__missing_key_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            cert = os.path.join(tmp, 'cert.pem'); open(cert, 'w').write('x')
            os.environ[ENV_VAR__TLS__ENABLED]   = 'true'
            os.environ[ENV_VAR__TLS__CERT_FILE] = cert
            os.environ[ENV_VAR__TLS__KEY_FILE]  = os.path.join(tmp, 'missing-key.pem')
            config = self.launcher.config_from_env()
            with self.assertRaises(AssertionError) as ctx:
                self.launcher.uvicorn_kwargs(config, http_port=8080)
            assert 'key file not found' in str(ctx.exception)

    def test__assert_ready__not_called_when_disabled(self):
        # TLS off → uvicorn_kwargs must not touch the filesystem even with bogus paths
        os.environ[ENV_VAR__TLS__CERT_FILE] = '/nonexistent/cert.pem'
        os.environ[ENV_VAR__TLS__KEY_FILE]  = '/nonexistent/key.pem'
        config = self.launcher.config_from_env()                                    # disabled (ENABLED unset)
        kwargs = self.launcher.uvicorn_kwargs(config, http_port=9000)
        assert kwargs == dict(host='0.0.0.0', port=9000)
