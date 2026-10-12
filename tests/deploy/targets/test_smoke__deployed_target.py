# ===============================================================================
# Shared smoke suite for ANY deployed SG/Send target (ADR-16 / Phase C).
#
# Parametrised over environment variables — the same suite validates Lambda,
# Fargate, EC2, Cloud Run, Heroku, or a local container:
#
#   SG_BASE_URL       required  e.g. https://xyz.lambda-url.eu-west-2.on.aws/
#   SG_ACCESS_TOKEN   optional  when set, asserts the single-key gate (ADR-12)
#
# No mocks, no patches — real HTTP against a real deployment.
# ===============================================================================

import os
import pytest
import requests

BASE_URL     = (os.environ.get('SG_BASE_URL') or '').rstrip('/')
ACCESS_TOKEN = os.environ.get('SG_ACCESS_TOKEN') or ''
TIMEOUT      = 30


def _headers():
    return {'x-sgraph-access-token': ACCESS_TOKEN} if ACCESS_TOKEN else {}


pytestmark = pytest.mark.skipif(not BASE_URL, reason='SG_BASE_URL not set — smoke suite targets a live deployment')


class Test_Smoke__Deployed_Target:

    def test_1__health(self):
        response = requests.get(f'{BASE_URL}/api/info/health', headers=_headers(), timeout=TIMEOUT)
        assert response.status_code == 200
        assert response.json() == {'status': 'ok'}

    def test_2__versions_endpoint(self):
        response = requests.get(f'{BASE_URL}/api/info/versions', headers=_headers(), timeout=TIMEOUT)
        assert response.status_code == 200
        assert 'sgraph_ai_app_send' in response.text

    def test_3__vault_ui_root(self):
        response = requests.get(f'{BASE_URL}/', headers=_headers(), timeout=TIMEOUT)
        assert response.status_code == 200
        assert 'html' in response.headers.get('content-type', '')

    def test_4__openapi_docs(self):
        response = requests.get(f'{BASE_URL}/api/openapi.json', headers=_headers(), timeout=TIMEOUT)
        assert response.status_code == 200
        assert '/api/vault/' in response.text

    @pytest.mark.skipif(not ACCESS_TOKEN, reason='open instance — no gate to verify')
    def test_5__single_key_gate__all_routes_401_without_key(self):               # ADR-12: reads are gated too
        for path in ('/api/info/health', '/api/vault/read/testvault0001/somefile', '/en-gb/'):
            response = requests.get(f'{BASE_URL}{path}', timeout=TIMEOUT)
            assert response.status_code == 401, f'{path} should be 401 without the key, got {response.status_code}'

    @pytest.mark.skipif(not ACCESS_TOKEN, reason='open instance')
    def test_6__login_page_reachable_without_key(self):                          # the one deliberate exception
        response = requests.get(f'{BASE_URL}/auth/set-cookie-form', timeout=TIMEOUT)
        assert response.status_code == 200
        assert 'SG/SEND' in response.text

    def test_7__vault_write_read_roundtrip(self):                                # ciphertext in, same ciphertext out
        vault_id = 'smoketest0001'
        file_id  = 'smoke/probe.bin'
        payload  = b'\x00\x01smoke-cipher-probe\xff'
        write    = requests.put(f'{BASE_URL}/api/vault/write/{vault_id}/{file_id}',
                                data    = payload,
                                headers = {**_headers(), 'x-sgraph-vault-write-key': 'smoke-write-key',
                                           'content-type': 'application/octet-stream'},
                                timeout = TIMEOUT)
        assert write.status_code == 200, write.text
        read = requests.get(f'{BASE_URL}/api/vault/read/{vault_id}/{file_id}', headers=_headers(), timeout=TIMEOUT)
        assert read.status_code == 200
        assert read.content     == payload

    def test_8__cors_preflight(self):                                            # null-origin iframes must work
        response = requests.options(f'{BASE_URL}/api/info/health',
                                    headers={'Origin': 'null', 'Access-Control-Request-Method': 'GET',
                                             'Access-Control-Request-Headers': 'x-sgraph-access-token'},
                                    timeout=TIMEOUT)
        assert response.status_code in (200, 204)
        assert response.headers.get('access-control-allow-origin') in ('*', 'null')
