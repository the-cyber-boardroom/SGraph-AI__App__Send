# Container entrypoint — invoked by the Dockerfile CMD.
#
# Replaces the previous `uvicorn ... --factory` CMD so the TLS contract
# (FAST_API__TLS__* env vars) can be honoured. With TLS off (the default)
# this is behaviourally identical to the old CMD: plain HTTP on :8080.

from sgraph_ai_app_send__docker.app                       import create_app
from sgraph_ai_app_send__docker.Fast_API__TLS__Launcher   import Fast_API__TLS__Launcher

APP__HTTP_PORT = 8080                                                               # Plain-HTTP port when TLS is off (sg-send-vault default)


def main():
    app = create_app()
    Fast_API__TLS__Launcher().serve(app, http_port=APP__HTTP_PORT)


if __name__ == '__main__':
    main()
