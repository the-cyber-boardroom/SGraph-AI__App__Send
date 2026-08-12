# Container entrypoint — invoked by the Dockerfile CMD.
#
# Replaces the previous `uvicorn ... --factory` CMD so the TLS contract
# (FAST_API__TLS__* env vars) can be honoured. With TLS off (the default)
# this is behaviourally identical to the old CMD: plain HTTP on :8080.
#
# The plain-HTTP port honours $PORT (Cloud Run / Heroku inject it) and
# falls back to 8080 (Docker / Lambda-Web-Adapter default). ADR-2.

import os

from sgraph_ai_app_send__docker.app                       import create_app
from sgraph_ai_app_send__docker.Fast_API__TLS__Launcher   import Fast_API__TLS__Launcher

APP__HTTP_PORT__DEFAULT = 8080                                                   # Plain-HTTP port when TLS is off and no $PORT injected


def resolve_http_port():                                                         # $PORT (Cloud Run/Heroku) → default 8080
    return int(os.environ.get('PORT', APP__HTTP_PORT__DEFAULT))


def main():
    app = create_app()
    Fast_API__TLS__Launcher().serve(app, http_port=resolve_http_port())


if __name__ == '__main__':
    main()
