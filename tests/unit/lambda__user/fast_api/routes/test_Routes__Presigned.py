# ===============================================================================
# SGraph Send - Routes__Presigned Tests
# Presigned URL route tests via shared FastAPI test client (memory mode)
# ===============================================================================

from unittest                                                                        import TestCase
from sgraph_ai_app_send.lambda__user.service.Service__Presigned_Urls                 import DEFAULT_PART_SIZE, MAX_PARTS
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User            import setup__fast_api__user__test_objs


class test_Routes__Presigned(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client   = _.fast_api__client
            cls.fast_api = _.fast_api

    # =========================================================================
    # GET /presigned/capabilities
    # =========================================================================

    def test__capabilities(self):
        response = self.client.get('/api/presigned/capabilities')
        assert response.status_code      == 200
        data = response.json()
        assert data['direct_upload']     is True
        assert data['max_parts']         == MAX_PARTS
        assert data['max_part_size']     == DEFAULT_PART_SIZE
        assert data['min_part_size']     == 5 * 1024 * 1024
        # In memory mode, presigned operations are unavailable
        assert data['presigned_upload']   is False
        assert data['presigned_download'] is False
        assert data['multipart_upload']   is False

    # =========================================================================
    # POST /presigned/initiate — memory mode returns 400
    # =========================================================================

    def test__initiate__memory_mode(self):
        # First create a transfer
        create_resp = self.client.post('/api/transfers/create',
                                       json=dict(file_size_bytes=1024))
        tid = create_resp.json()['transfer_id']

        response = self.client.post('/api/presigned/initiate',
                                    json=dict(transfer_id     = tid,
                                              num_parts       = 3,
                                              file_size_bytes = 1024))
        assert response.status_code      == 400                                      # Presigned not available in memory mode

    # =========================================================================
    # POST /presigned/complete — memory mode returns 400
    # =========================================================================

    def test__complete__memory_mode(self):
        response = self.client.post('/api/presigned/complete',
                                    json=dict(transfer_id = 'fake123456ab',
                                              upload_id   = 'fake-upload',
                                              parts       = []))
        assert response.status_code      == 400

    # =========================================================================
    # POST /presigned/cancel/{transfer_id}/{upload_id} — memory mode
    # =========================================================================

    def test__cancel__memory_mode(self):
        response = self.client.post('/api/presigned/cancel/fake123456ab/fake-upload')
        assert response.status_code      == 400

    # =========================================================================
    # GET /presigned/upload-url/{transfer_id} — memory mode
    # =========================================================================

    def test__upload_url__memory_mode(self):
        create_resp = self.client.post('/api/transfers/create',
                                       json=dict(file_size_bytes=1024))
        tid = create_resp.json()['transfer_id']
        response = self.client.get(f'/api/presigned/upload-url/{tid}')
        assert response.status_code      == 400

    # =========================================================================
    # GET /presigned/download-url/{transfer_id} — memory mode
    # =========================================================================

    def test__download_url__memory_mode(self):
        # Create and complete a transfer first
        create_resp = self.client.post('/api/transfers/create',
                                       json=dict(file_size_bytes=4))
        tid = create_resp.json()['transfer_id']
        self.client.post(f'/api/transfers/upload/{tid}',
                         content=b'\x00\x01\x02\x03',
                         headers={'content-type': 'application/octet-stream'})
        self.client.post(f'/api/transfers/complete/{tid}')

        response = self.client.get(f'/api/presigned/download-url/{tid}')
        assert response.status_code      == 400                                      # Presigned not available

    # =========================================================================
    # GET /presigned/download-url/{transfer_id} — not found
    # =========================================================================

    def test__download_url__not_found(self):
        response = self.client.get('/api/presigned/download-url/nonexistent12')
        # In memory mode, the error is 'presigned_not_available' which is 400
        # not 404 — because the S3 mode check happens before the transfer check
        assert response.status_code      == 400


class test_Routes__Presigned__Capabilities_Details(TestCase):
    """Detailed capability response structure tests."""

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.client = _.fast_api__client

    def test__capabilities__returns_all_fields(self):
        response = self.client.get('/api/presigned/capabilities')
        data     = response.json()
        expected_keys = {'presigned_upload', 'multipart_upload', 'presigned_download',
                         'direct_upload', 'max_part_size', 'min_part_size', 'max_parts'}
        assert set(data.keys()) == expected_keys

    def test__capabilities__types(self):
        data = self.client.get('/api/presigned/capabilities').json()
        assert type(data['presigned_upload'])   is bool
        assert type(data['multipart_upload'])   is bool
        assert type(data['presigned_download']) is bool
        assert type(data['direct_upload'])      is bool
        assert type(data['max_part_size'])      is int
        assert type(data['min_part_size'])      is int
        assert type(data['max_parts'])          is int
