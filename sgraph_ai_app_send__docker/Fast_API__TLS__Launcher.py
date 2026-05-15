# Native TLS launch path for the sg-send-vault container.
#
# Contract (from brief v0.2.6 — "Native TLS support in the sg-send-vault container",
# §8.2 of v0.2.6__vault-app-tls-poc-fastapi-sidecar.md):
#
#   FAST_API__TLS__ENABLED    false           master switch
#   FAST_API__TLS__CERT_FILE  /certs/cert.pem  cert path
#   FAST_API__TLS__KEY_FILE   /certs/key.pem   key path
#   FAST_API__TLS__PORT       443              bind port when TLS is on
#
#   off → uvicorn.run(app, host='0.0.0.0', port=<http_port>)   — plain HTTP, the default
#   on  → uvicorn.run(app, host='0.0.0.0', port=<PORT>, ssl_certfile=..., ssl_keyfile=...)
#   on but cert/key missing → fail loud (assert, non-zero exit). Never silent HTTP fallback.
#
# This is a vendored copy of the reference launcher from
# SGraph-AI__Service__Playwright; it is destined to be upstreamed into OSBot__Fast_API.
# Keep it single-file and dependency-light so the eventual de-dupe is mechanical.

import os

from osbot_utils.type_safe.Type_Safe                                import Type_Safe
from sgraph_ai_app_send__docker.Schema__Fast_API__TLS__Config       import Schema__Fast_API__TLS__Config

ENV_VAR__TLS__ENABLED   = 'FAST_API__TLS__ENABLED'
ENV_VAR__TLS__CERT_FILE = 'FAST_API__TLS__CERT_FILE'
ENV_VAR__TLS__KEY_FILE  = 'FAST_API__TLS__KEY_FILE'
ENV_VAR__TLS__PORT      = 'FAST_API__TLS__PORT'

TLS__DEFAULT__CERT_FILE = '/certs/cert.pem'
TLS__DEFAULT__KEY_FILE  = '/certs/key.pem'
TLS__DEFAULT__PORT      = 443

_TRUTHY = ('true', '1', 'yes')


class Fast_API__TLS__Launcher(Type_Safe):

    def config_from_env(self) -> Schema__Fast_API__TLS__Config:                     # Read the FAST_API__TLS__* env vars into a config object
        enabled_raw = os.environ.get(ENV_VAR__TLS__ENABLED, '').strip().lower()
        return Schema__Fast_API__TLS__Config(
            enabled   = enabled_raw in _TRUTHY                                        ,
            cert_file = os.environ.get(ENV_VAR__TLS__CERT_FILE, TLS__DEFAULT__CERT_FILE),
            key_file  = os.environ.get(ENV_VAR__TLS__KEY_FILE , TLS__DEFAULT__KEY_FILE ),
            tls_port  = int(os.environ.get(ENV_VAR__TLS__PORT , TLS__DEFAULT__PORT    )),
        )

    def assert_ready(self, config: Schema__Fast_API__TLS__Config):                  # Fail loud if TLS is on but cert/key files are missing
        assert os.path.isfile(config.cert_file), (
            f"{ENV_VAR__TLS__ENABLED} is set but cert file not found: {config.cert_file}")
        assert os.path.isfile(config.key_file), (
            f"{ENV_VAR__TLS__ENABLED} is set but key file not found: {config.key_file}")

    def uvicorn_kwargs(self, config: Schema__Fast_API__TLS__Config,                 # Build the uvicorn.run kwargs for the active mode
                             http_port : int
                       ) -> dict:
        if config.enabled:
            self.assert_ready(config)
            return dict(host         = '0.0.0.0'        ,
                        port         = config.tls_port  ,
                        ssl_certfile = config.cert_file ,
                        ssl_keyfile  = config.key_file  )
        return dict(host = '0.0.0.0', port = http_port)

    def serve(self, app, http_port: int = 8080):                                    # Launch uvicorn — TLS on :tls_port, or plain HTTP on :http_port
        import uvicorn                                                              # lazy import: keeps config/assert/kwargs unit-testable without uvicorn
        config = self.config_from_env()
        kwargs = self.uvicorn_kwargs(config, http_port=http_port)
        uvicorn.run(app, **kwargs)
