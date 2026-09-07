# Real SGraph Send API server for browser / live tests.
#
# Starts the User Lambda as a real HTTP server (in-memory storage, random port), prints ONE
# JSON line {"url": ..., "token": ...} on stdout, then blocks until stdin closes — so the Node
# process that spawned it owns its lifetime (kill the child, or just exit, and the server dies).
#
#   .venv/bin/python3 tests/e2e/vault_ui/fixtures/api-server.py
#
# No mocks: the same FastAPI app + Memory-FS storage the deployed Lambda runs.
import json, os, sys

os.environ.setdefault('SEND__STORAGE_MODE', 'memory')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')))

from sgraph_ai_app_send.lambda__user.testing.Send__User_Lambda__Test_Server import Send__User_Lambda__Http_Server

with Send__User_Lambda__Http_Server() as t:
    sys.stdout.write(json.dumps({'url': t.server_url, 'token': t.access_token}) + '\n')
    sys.stdout.flush()
    try:
        for _line in sys.stdin:                                   # block until the parent closes stdin
            pass
    except KeyboardInterrupt:
        pass
