# ===============================================================================
# SGraph Send - Service__Vault__Presigned Tests
# Tests presigned URL service in memory mode (graceful degradation)
# and verifies S3-key alignment with Service__Vault__Pointer
# ===============================================================================

from unittest                                                                        import TestCase
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Presigned               import Service__Vault__Presigned, DEFAULT_PART_SIZE, MAX_PARTS
from sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer                 import Service__Vault__Pointer
from sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                     import Enum__Storage__Mode


class test_Service__Vault__Presigned__Memory_Mode(TestCase):
    """Tests in memory mode — presigned URLs are not available, service gracefully degrades."""

    def setUp(self):
        self.vault_service = Service__Vault__Pointer()
        self.service       = Service__Vault__Presigned(
            vault_service = self.vault_service,
            storage_mode  = Enum__Storage__Mode.MEMORY
        )

    def test__is_s3_mode__false(self):
        assert self.service.is_s3_mode() is False

    def test__initiate_upload__memory_mode(self):
        result = self.service.initiate_upload(
            vault_id        = 'a1b2c3d4',
            file_id         = 'bare/data/abc123',
            file_size_bytes = 1024,
            write_key_hex   = 'deadbeef'
        )
        assert result['error'] == 'presigned_not_available'

    def test__complete_upload__memory_mode(self):
        result = self.service.complete_upload(
            vault_id      = 'a1b2c3d4',
            file_id       = 'bare/data/abc123',
            upload_id     = 'fake-upload-id',
            parts         = [],
            write_key_hex = 'deadbeef'
        )
        assert result['error'] == 'presigned_not_available'

    def test__cancel_upload__memory_mode(self):
        result = self.service.cancel_upload(
            vault_id      = 'a1b2c3d4',
            file_id       = 'bare/data/abc123',
            upload_id     = 'fake-upload-id',
            write_key_hex = 'deadbeef'
        )
        assert result['error'] == 'presigned_not_available'

    def test__create_read_url__memory_mode(self):
        result = self.service.create_read_url(
            vault_id = 'a1b2c3d4',
            file_id  = 'bare/data/abc123'
        )
        assert result['error'] == 'presigned_not_available'


class test_Service__Vault__Presigned__S3_Key_Logic(TestCase):
    """Tests S3 key generation — must align with Service__Vault__Pointer.vault_payload_path()."""

    def test__s3_key__no_prefix(self):
        service = Service__Vault__Presigned(s3_prefix='')
        assert service.s3_key('v1d2e3f4', 'bare/data/abc123') == 'transfers/vault/v1d2e3f4/bare/data/abc123/payload'

    def test__s3_key__with_prefix(self):
        service = Service__Vault__Presigned(s3_prefix='prod')
        assert service.s3_key('v1d2e3f4', 'bare/data/abc123') == 'prod/transfers/vault/v1d2e3f4/bare/data/abc123/payload'

    def test__s3_key__with_trailing_slash(self):
        service = Service__Vault__Presigned(s3_prefix='prod/')
        assert service.s3_key('v1d2e3f4', 'bare/data/abc123') == 'prod/transfers/vault/v1d2e3f4/bare/data/abc123/payload'

    def test__s3_key__matches_vault_pointer_path(self):
        """Verify the S3 key (without prefix) matches Service__Vault__Pointer.vault_payload_path()."""
        vault_service    = Service__Vault__Pointer()
        presigned_service = Service__Vault__Presigned(s3_prefix='')
        vault_id = 'a1b2c3d4'
        file_id  = 'bare/data/abc123'
        assert presigned_service.s3_key(vault_id, file_id) == vault_service.vault_payload_path(vault_id, file_id)

    def test__s3_key__matches_vault_pointer_path__with_prefix(self):
        """Verify prefix handling matches Storage_FS__S3.s3_key() pattern."""
        presigned_service = Service__Vault__Presigned(s3_prefix='myprefix')
        vault_id = 'a1b2c3d4'
        file_id  = 'bare/data/abc123'
        expected_path = f'myprefix/transfers/vault/{vault_id}/{file_id}/payload'
        assert presigned_service.s3_key(vault_id, file_id) == expected_path
