# ===============================================================================
# SGraph Send - Vault Presigned URL Service
# Generates presigned URLs for large vault blob transfer via S3 multipart upload
#
# Flow:
#   1. Client calls POST /api/vault/presigned/initiate/{vault_id}
#      → gets upload_id + presigned PUT URLs for each part
#   2. Client PUTs encrypted chunks directly to S3 (bypasses Lambda)
#   3. Client calls POST /api/vault/presigned/complete/{vault_id}
#      with ETags → S3 assembles the object
#   4. For download: GET /api/vault/presigned/read-url/{vault_id}/{file_id}
#      → gets presigned GET URL, client fetches directly from S3
#
# NOTE: This service requires S3 storage mode. In memory mode,
#       clients use the existing /api/vault/write route instead.
# ===============================================================================

from   osbot_aws.aws.s3.S3                                                          import S3
from   osbot_utils.type_safe.Type_Safe                                               import Type_Safe
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer               import Service__Vault__Pointer
from   sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                   import Enum__Storage__Mode
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                        import path__vault_payload

DEFAULT_PART_SIZE         = 10 * 1024 * 1024                                         # 10 MB per part
PRESIGNED_UPLOAD_EXPIRY   = 3600                                                     # 1 hour for upload URLs
PRESIGNED_DOWNLOAD_EXPIRY = 3600                                                     # 1 hour for download URLs
MAX_PARTS                 = 10000                                                    # S3 max parts per multipart upload


class Service__Vault__Presigned(Type_Safe):                                          # Presigned URL management for vault large blobs
    vault_service  : Service__Vault__Pointer = None                                  # For write-key validation and path resolution
    s3             : S3                      = None                                  # S3 client (from osbot-aws)
    s3_bucket      : str                     = ''                                    # S3 bucket name
    storage_mode   : Enum__Storage__Mode     = None                                  # Storage mode (S3 or MEMORY)

    def is_s3_mode(self):                                                            # Check if S3 presigned URLs are available
        return self.storage_mode == Enum__Storage__Mode.S3 and self.s3 is not None

    def s3_key(self, vault_id, file_id):                                             # Build S3 key matching vault_payload_path()
        return path__vault_payload(vault_id, file_id)

    # =========================================================================
    # Write-key validation (delegates to vault service)
    # =========================================================================

    def _validate_write_key(self, vault_id, write_key_hex):                          # Returns True if write key is valid
        if not self.vault_service:
            return True                                                              # No vault service → skip validation (test mode)
        submitted_hash = self.vault_service._hash_write_key(write_key_hex)
        return self.vault_service._check_vault_write_key(vault_id, submitted_hash)

    # =========================================================================
    # Multipart upload: initiate
    # =========================================================================

    def initiate_upload(self, vault_id, file_id, file_size_bytes,
                        write_key_hex, num_parts=None):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available', message='S3 storage mode required for presigned uploads')

        if not self._validate_write_key(vault_id, write_key_hex):
            return dict(error='write_key_mismatch')

        # Calculate part count and size
        part_size = DEFAULT_PART_SIZE
        if num_parts is None or num_parts == 0:
            num_parts = max(1, -(-file_size_bytes // part_size))                     # ceiling division
        else:
            part_size = max(5 * 1024 * 1024, -(-file_size_bytes // num_parts))       # min 5MB per part (S3 requirement)

        if num_parts > MAX_PARTS:
            return dict(error='too_many_parts', message=f'Maximum {MAX_PARTS} parts allowed')

        s3_key = self.s3_key(vault_id, file_id)

        # Create S3 multipart upload
        response = self.s3.client().create_multipart_upload(
            Bucket      = self.s3_bucket,
            Key         = s3_key,
            ContentType = 'application/octet-stream'
        )
        upload_id = response['UploadId']

        # Generate presigned PUT URLs for each part
        part_urls = []
        for part_num in range(1, num_parts + 1):
            url = self.s3.client().generate_presigned_url(
                'upload_part',
                Params    = dict(Bucket     = self.s3_bucket,
                                 Key        = s3_key       ,
                                 UploadId   = upload_id    ,
                                 PartNumber = part_num     ),
                ExpiresIn = PRESIGNED_UPLOAD_EXPIRY
            )
            part_urls.append(dict(part_number = part_num, upload_url = url))

        return dict(upload_id  = upload_id ,
                    part_urls  = part_urls ,
                    part_size  = part_size )

    # =========================================================================
    # Multipart upload: complete
    # =========================================================================

    def complete_upload(self, vault_id, file_id, upload_id, parts, write_key_hex):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available')

        if not self._validate_write_key(vault_id, write_key_hex):
            return dict(error='write_key_mismatch')

        s3_key = self.s3_key(vault_id, file_id)

        # Build S3 parts list
        s3_parts = [dict(ETag       = part['etag']       ,
                         PartNumber = part['part_number'] )
                    for part in parts]

        # Sort by part number (S3 requires ascending order)
        s3_parts.sort(key=lambda p: p['PartNumber'])

        response = self.s3.client().complete_multipart_upload(
            Bucket          = self.s3_bucket,
            Key             = s3_key,
            UploadId        = upload_id,
            MultipartUpload = dict(Parts=s3_parts)
        )

        return dict(status = 'ok'                      ,
                    etag   = response.get('ETag', '')   )

    # =========================================================================
    # Multipart upload: cancel (cleanup on failure)
    # =========================================================================

    def cancel_upload(self, vault_id, file_id, upload_id, write_key_hex):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available')

        if not self._validate_write_key(vault_id, write_key_hex):
            return dict(error='write_key_mismatch')

        s3_key = self.s3_key(vault_id, file_id)
        self.s3.client().abort_multipart_upload(                                     # S3 SDK method name (AWS API)
            Bucket   = self.s3_bucket,
            Key      = s3_key,
            UploadId = upload_id
        )

        return dict(status = 'cancelled')

    # =========================================================================
    # Presigned download URL
    # =========================================================================

    def create_read_url(self, vault_id, file_id, expiry=PRESIGNED_DOWNLOAD_EXPIRY):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available', message='S3 storage mode required')

        s3_key = self.s3_key(vault_id, file_id)

        url = self.s3.create_pre_signed_url(
            bucket_name = self.s3_bucket,
            object_name = s3_key,
            operation   = 'get_object',
            expiration  = expiry
        )

        return dict(url        = url   ,
                    expires_in = expiry )
