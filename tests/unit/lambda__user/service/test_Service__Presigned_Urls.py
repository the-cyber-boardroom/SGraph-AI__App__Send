# ===============================================================================
# SGraph Send - Service__Presigned_Urls Tests
# Tests presigned URL service in memory mode (graceful degradation)
# and verifies S3-mode logic via Service__Presigned_Urls__S3_Sim
# ===============================================================================

from unittest                                                                        import TestCase
from sgraph_ai_app_send.lambda__user.service.Service__Presigned_Urls                 import Service__Presigned_Urls, DEFAULT_PART_SIZE, MAX_PARTS
from sgraph_ai_app_send.lambda__user.service.Transfer__Service                       import Transfer__Service
from sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                     import Enum__Storage__Mode


class test_Service__Presigned_Urls__Memory_Mode(TestCase):
    """Tests in memory mode — presigned URLs are not available, service gracefully degrades."""

    def setUp(self):
        self.transfer_service  = Transfer__Service()
        self.presigned_service = Service__Presigned_Urls(
            transfer_service = self.transfer_service,
            storage_mode     = Enum__Storage__Mode.MEMORY
        )

    def test__is_s3_mode__false(self):
        assert self.presigned_service.is_s3_mode() is False

    def test__get_capabilities__memory_mode(self):
        caps = self.presigned_service.get_capabilities()
        assert caps['presigned_upload']   is False
        assert caps['presigned_download'] is False
        assert caps['multipart_upload']   is False
        assert caps['direct_upload']      is True
        assert caps['max_part_size']      == DEFAULT_PART_SIZE
        assert caps['min_part_size']      == 5 * 1024 * 1024
        assert caps['max_parts']          == MAX_PARTS

    def test__initiate_multipart_upload__memory_mode(self):
        result = self.presigned_service.initiate_multipart_upload(
            transfer_id     = 'test123',
            file_size_bytes = 1024
        )
        assert result['error'] == 'presigned_not_available'

    def test__complete_multipart_upload__memory_mode(self):
        result = self.presigned_service.complete_multipart_upload(
            transfer_id = 'test123',
            upload_id   = 'fake-upload-id',
            parts       = []
        )
        assert result['error'] == 'presigned_not_available'

    def test__cancel_multipart_upload__memory_mode(self):
        result = self.presigned_service.cancel_multipart_upload(
            transfer_id = 'test123',
            upload_id   = 'fake-upload-id'
        )
        assert result['error'] == 'presigned_not_available'

    def test__create_download_url__memory_mode(self):
        result = self.presigned_service.create_download_url(transfer_id='test123')
        assert result['error'] == 'presigned_not_available'

    def test__create_upload_url__memory_mode(self):
        result = self.presigned_service.create_upload_url(transfer_id='test123')
        assert result['error'] == 'presigned_not_available'


class test_Service__Presigned_Urls__S3_Key_Logic(TestCase):
    """Tests S3 key generation logic (doesn't require S3 connection)."""

    def test__s3_key__matches_storage_paths(self):
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__transfer_payload
        service = Service__Presigned_Urls()
        assert service.s3_key('abc123') == path__transfer_payload('abc123')

    def test__s3_key__includes_shard_prefix(self):
        service = Service__Presigned_Urls()
        key = service.s3_key('abc123')
        assert '/transfers/ab/abc123/payload' in key

    def test__s3_key__includes_storage_version(self):
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import STORAGE__VERSION
        service = Service__Presigned_Urls()
        assert STORAGE__VERSION in service.s3_key('abc123')


class test_Service__Presigned_Urls__Transfer_Validation(TestCase):
    """Tests validation logic against transfer service."""

    def setUp(self):
        self.transfer_service  = Transfer__Service()
        self.presigned_service = Service__Presigned_Urls(
            transfer_service = self.transfer_service,
            storage_mode     = Enum__Storage__Mode.MEMORY
        )

    def test__initiate__transfer_not_found(self):
        """Even in memory mode, the error is 'presigned_not_available' not 'transfer_not_found'
        because memory mode check happens first."""
        result = self.presigned_service.initiate_multipart_upload(
            transfer_id     = 'nonexistent',
            file_size_bytes = 1024
        )
        assert 'error' in result

    def test__download_url__transfer_not_found(self):
        result = self.presigned_service.create_download_url(transfer_id='nonexistent')
        assert 'error' in result
