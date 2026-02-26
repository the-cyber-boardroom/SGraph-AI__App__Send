# ===============================================================================
# SGraph Send - Routes__Transfers Tests
# Full transfer API lifecycle via the shared FastAPI test client
# ===============================================================================

from unittest                                                                    import TestCase
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User        import setup__fast_api__user__test_objs, TEST_ACCESS_TOKEN

# todo: this should be test_Routes__Transfers__client
class test_Routes__Transfers(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    def test__create_transfer(self):
        response = self.client.post('/transfers/create',
                                    json=dict(file_size_bytes   = 2048,
                                              content_type_hint = 'text/plain'))
        assert response.status_code           == 200
        data = response.json()
        assert 'transfer_id'                   in data
        assert 'upload_url'                    in data
        assert len(data['transfer_id'])        == 12

    def test__upload_payload(self):
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = 4)).json()
        tid      = create['transfer_id']
        response = self.client.post(f'/transfers/upload/{tid}',
                                    content = b'\xde\xad\xbe\xef',
                                    headers = {'content-type': 'application/octet-stream'})
        assert response.status_code           == 200
        data = response.json()
        assert data['status']                  == 'uploaded'
        assert data['size']                    == 4

    def test__upload_payload__not_found(self):
        response = self.client.post('/transfers/upload/nonexistent',
                                    content = b'data',
                                    headers = {'content-type': 'application/octet-stream'})
        assert response.status_code           == 404

    def test__complete_transfer(self):
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = 8)).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = b'\x00' * 8,
                         headers = {'content-type': 'application/octet-stream'})
        response = self.client.post(f'/transfers/complete/{tid}')
        assert response.status_code           == 200
        data = response.json()
        assert data['transfer_id']             == tid
        assert 'download_url'                  in data
        assert 'transparency'                  in data

    def test__transfer_info(self):
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = 512)).json()
        tid      = create['transfer_id']
        response = self.client.get(f'/transfers/info/{tid}')
        assert response.status_code           == 200
        data = response.json()
        assert data['transfer_id']             == tid
        assert data['status']                  == 'pending'
        assert data['file_size_bytes']         == 512

    def test__transfer_info__not_found(self):
        response = self.client.get('/transfers/info/nonexistent')
        assert response.status_code           == 404

    def test__download_payload(self):
        payload = b'\x89PNG\x00\x01\x02\x03'
        create  = self.client.post('/transfers/create',
                                   json=dict(file_size_bytes = len(payload))).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = payload,
                         headers = {'content-type': 'application/octet-stream'})
        self.client.post(f'/transfers/complete/{tid}')

        response = self.client.get(f'/transfers/download/{tid}')
        assert response.status_code           == 200
        assert response.content               == payload
        assert response.headers['content-type'] == 'application/octet-stream'

    def test__download_payload__not_found(self):
        response = self.client.get('/transfers/download/nonexistent')
        assert response.status_code           == 404

    def test__download_base64(self):
        import base64
        payload = b'\x89PNG\x00\x01\x02\x03'
        create  = self.client.post('/transfers/create',
                                   json=dict(file_size_bytes = len(payload))).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = payload,
                         headers = {'content-type': 'application/octet-stream'})
        self.client.post(f'/transfers/complete/{tid}')

        response = self.client.get(f'/transfers/download-base64/{tid}')
        assert response.status_code           == 200
        data = response.json()
        assert data['transfer_id']             == tid
        assert data['file_size_bytes']         == len(payload)
        assert base64.b64decode(data['data'])  == payload

    def test__download_base64__not_found(self):
        response = self.client.get('/transfers/download-base64/nonexistent')
        assert response.status_code           == 404

    def test__create_with_access_token_query_param(self):
        from starlette.testclient import TestClient
        unauthenticated_client = TestClient(self.client.app)                    # No default auth header
        response = unauthenticated_client.post(f'/transfers/create?access_token={TEST_ACCESS_TOKEN}',
                                               json=dict(file_size_bytes   = 1024,
                                                         content_type_hint = 'text/plain'))
        assert response.status_code           == 200
        data = response.json()
        assert 'transfer_id'                   in data

    def test__full_flow(self):
        payload = b'encrypted_file_content_here'

        # Create
        create   = self.client.post('/transfers/create',
                                    json=dict(file_size_bytes   = len(payload),
                                              content_type_hint = 'application/pdf')).json()
        tid = create['transfer_id']
        assert len(tid) == 12

        # Upload
        upload   = self.client.post(f'/transfers/upload/{tid}',
                                    content = payload,
                                    headers = {'content-type': 'application/octet-stream'}).json()
        assert upload['status'] == 'uploaded'

        # Complete
        complete = self.client.post(f'/transfers/complete/{tid}').json()
        assert complete['transfer_id']           == tid
        assert 'raw_ip' in complete['transparency']['not_stored']

        # Info
        info     = self.client.get(f'/transfers/info/{tid}').json()
        assert info['status']                    == 'completed'
        assert info['download_count']            == 0

        # Download
        download = self.client.get(f'/transfers/download/{tid}')
        assert download.content                  == payload

        # Download count incremented
        info     = self.client.get(f'/transfers/info/{tid}').json()
        assert info['download_count']            == 1

    # --- MCP upload: JSON-wrapped base64 must be unwrapped ---

    def test__upload_payload__mcp_base64_unwrap(self):
        """MCP clients send encrypted bytes as JSON {"data": "<base64>"}.
        The upload handler must unwrap this so the download returns raw bytes."""
        import base64
        raw_payload = b'\xde\xad\xbe\xef\x01\x02\x03\x04'
        mcp_body    = b'{"data": "' + base64.b64encode(raw_payload) + b'"}'

        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = len(raw_payload))).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = mcp_body,
                         headers = {'content-type': 'application/json'})
        self.client.post(f'/transfers/complete/{tid}')

        # Download must return raw bytes, not the JSON wrapper
        response = self.client.get(f'/transfers/download/{tid}')
        assert response.status_code  == 200
        assert response.content      == raw_payload

    def test__upload_payload__raw_bytes_unchanged(self):
        """Browser uploads send raw bytes — these must NOT be altered by unwrap logic."""
        raw_payload = b'\x7b\x00\x01\x02'                                     # starts with '{' but is NOT valid JSON

        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = len(raw_payload))).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = raw_payload,
                         headers = {'content-type': 'application/octet-stream'})
        self.client.post(f'/transfers/complete/{tid}')

        response = self.client.get(f'/transfers/download/{tid}')
        assert response.status_code  == 200
        assert response.content      == raw_payload

    def test__upload_payload__mcp_full_round_trip(self):
        """Full MCP round-trip: upload via JSON base64, download raw, download-base64."""
        import base64
        raw_payload = b'hello from claude.ai web!'
        mcp_body    = b'{"data": "' + base64.b64encode(raw_payload) + b'"}'

        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes   = len(raw_payload),
                                            content_type_hint = 'text/plain')).json()
        tid = create['transfer_id']
        upload = self.client.post(f'/transfers/upload/{tid}',
                                  content = mcp_body,
                                  headers = {'content-type': 'application/json'})
        assert upload.json()['size'] == len(raw_payload)                       # size reflects unwrapped payload

        self.client.post(f'/transfers/complete/{tid}')

        # Direct download returns raw bytes
        download = self.client.get(f'/transfers/download/{tid}')
        assert download.content == raw_payload

        # Base64 download returns base64 of raw bytes (not base64 of JSON)
        b64_download = self.client.get(f'/transfers/download-base64/{tid}')
        b64_data     = b64_download.json()
        assert base64.b64decode(b64_data['data']) == raw_payload

    # --- MCP upload: data parameter (explicit base64 tool argument) ---

    def test__upload_payload__mcp_data_parameter(self):
        """MCP clients pass encrypted payload via the `data` tool parameter (base64-encoded).
        This is the primary upload path for MCP — the `data` parameter is an explicit tool argument
        that fastapi-mcp can expose, unlike the raw request body which MCP tools cannot pass."""
        import base64
        raw_payload = b'\xde\xad\xbe\xef\x01\x02\x03\x04'
        b64_payload = base64.b64encode(raw_payload).decode('ascii')

        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes = len(raw_payload))).json()
        tid = create['transfer_id']
        upload = self.client.post(f'/transfers/upload/{tid}',
                                  json=dict(data = b64_payload))
        assert upload.status_code    == 200
        assert upload.json()['size'] == len(raw_payload)

        self.client.post(f'/transfers/complete/{tid}')

        # Download must return the decoded raw bytes
        response = self.client.get(f'/transfers/download/{tid}')
        assert response.status_code == 200
        assert response.content     == raw_payload

    def test__upload_payload__mcp_data_parameter__with_sgmeta(self):
        """MCP clients should wrap file content in SGMETA envelope before encryption,
        matching the browser workflow. The SGMETA envelope preserves the original filename.

        Browser format: encrypt(SGMETA_MAGIC + len(metadata) + metadata_json + file_content)
        MCP must do the same: SGMETA wrap → encrypt → base64 encode → pass as `data` param."""
        import base64, struct, json as json_mod

        # Build SGMETA envelope (same format as browser's packageWithMetadata)
        file_content = b'%PDF-1.4 fake pdf content here'
        filename     = 'quarterly-report.pdf'
        magic        = b'SGMETA\x00'
        metadata     = json_mod.dumps({'filename': filename}).encode('utf-8')
        meta_len     = struct.pack('>I', len(metadata))
        sgmeta_payload = magic + meta_len + metadata + file_content

        # In real usage, this would be encrypted first. For this test, we store the
        # SGMETA-wrapped payload directly (encryption is client-side, transparent to server).
        b64_payload = base64.b64encode(sgmeta_payload).decode('ascii')

        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes   = len(sgmeta_payload),
                                            content_type_hint = 'application/pdf')).json()
        tid = create['transfer_id']
        upload = self.client.post(f'/transfers/upload/{tid}',
                                  json=dict(data = b64_payload))
        assert upload.status_code    == 200
        assert upload.json()['size'] == len(sgmeta_payload)

        self.client.post(f'/transfers/complete/{tid}')

        # Download returns the full SGMETA-wrapped payload
        response = self.client.get(f'/transfers/download/{tid}')
        assert response.status_code == 200
        downloaded = response.content
        assert downloaded            == sgmeta_payload

        # Verify SGMETA can be parsed to extract the filename (mirrors browser's decrypt logic)
        assert downloaded[:7]          == magic
        extracted_meta_len = struct.unpack('>I', downloaded[7:11])[0]
        extracted_metadata = json_mod.loads(downloaded[11:11 + extracted_meta_len])
        extracted_content  = downloaded[11 + extracted_meta_len:]
        assert extracted_metadata['filename'] == filename
        assert extracted_content              == file_content

    def test__upload_payload__mcp_data_parameter__full_round_trip(self):
        """Full MCP round-trip with data parameter: upload via base64 param, download raw and base64."""
        import base64
        raw_payload = b'hello from claude.ai web via data param!'
        b64_payload = base64.b64encode(raw_payload).decode('ascii')

        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes   = len(raw_payload),
                                            content_type_hint = 'text/plain')).json()
        tid = create['transfer_id']
        upload = self.client.post(f'/transfers/upload/{tid}',
                                  json=dict(data = b64_payload))
        assert upload.json()['size'] == len(raw_payload)

        self.client.post(f'/transfers/complete/{tid}')

        # Direct download returns raw bytes
        download = self.client.get(f'/transfers/download/{tid}')
        assert download.content == raw_payload

        # Base64 download returns base64 of raw bytes
        b64_download = self.client.get(f'/transfers/download-base64/{tid}')
        b64_data     = b64_download.json()
        assert base64.b64decode(b64_data['data']) == raw_payload

    # --- Security: complete response must not leak sensitive data ---

    def test__complete__does_not_leak_token(self):
        """Regression test: shareable URLs must never contain access tokens (incident 19 Feb 2026)"""
        create = self.client.post('/transfers/create',
                                  json=dict(file_size_bytes=4)).json()
        tid = create['transfer_id']
        self.client.post(f'/transfers/upload/{tid}',
                         content = b'\x00\x01\x02\x03',
                         headers = {'content-type': 'application/octet-stream'})
        response = self.client.post(f'/transfers/complete/{tid}')
        data = response.json()

        # token_name must never appear in complete response (it was leaking into shareable URLs)
        assert 'token_name'    not in data
        assert 'access_token'  not in data

        # download_url must not contain token/key query parameters
        if 'download_url' in data:
            assert '?token='       not in data['download_url']
            assert '&token='       not in data['download_url']
            assert 'access_token=' not in data['download_url']
