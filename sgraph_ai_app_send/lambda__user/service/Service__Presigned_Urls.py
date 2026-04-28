# ===============================================================================
# SGraph Send - Presigned URL Service
# Generates presigned URLs for large file transfer via S3 multipart upload
#
# Flow:
#   1. Client calls /transfers/create (existing route) → gets transfer_id
#   2. Client calls /presigned/initiate → gets upload_id + presigned PUT URLs
#   3. Client PUTs encrypted chunks directly to S3 (bypasses Lambda)
#   4. Client calls /presigned/complete with ETags → S3 assembles the object
#   5. Client calls /transfers/complete (existing route) → marks transfer done
#   6. Downloader calls /presigned/download-url → gets presigned GET URL
#
# NOTE: This service requires S3 storage mode. In memory mode, clients use
#       the existing /transfers/upload route instead.
# ===============================================================================

import json
from   datetime                                                                      import datetime, timezone
from   osbot_aws.aws.s3.S3                                                           import S3
from   osbot_utils.type_safe.Type_Safe                                               import Type_Safe
from   sgraph_ai_app_send.lambda__user.service.Transfer__Service                     import Transfer__Service
from   sgraph_ai_app_send.lambda__user.storage.Enum__Storage__Mode                   import Enum__Storage__Mode
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                        import path__transfer_payload

DEFAULT_PART_SIZE         = 10 * 1024 * 1024                                         # 10 MB per part
PRESIGNED_UPLOAD_EXPIRY   = 3600                                                     # 1 hour for upload URLs
PRESIGNED_DOWNLOAD_EXPIRY = 3600                                                     # 1 hour for download URLs
MAX_PARTS                 = 10000                                                    # S3 max parts per multipart upload


class Service__Presigned_Urls(Type_Safe):                                            # Presigned URL management for large file transfer
    transfer_service  : Transfer__Service  = None                                    # Shared transfer service (for metadata)
    s3                : S3                 = None                                     # S3 client (from osbot-aws)
    s3_bucket         : str                = ''                                      # S3 bucket name
    storage_mode      : Enum__Storage__Mode = None                                   # Storage mode (S3 or MEMORY)

    def is_s3_mode(self):                                                            # Check if S3 presigned URLs are available
        return self.storage_mode == Enum__Storage__Mode.S3 and self.s3 is not None

    def s3_key(self, transfer_id):                                                   # Build S3 key for transfer payload
        return path__transfer_payload(transfer_id)

    # =========================================================================
    # Multipart upload: initiate
    # =========================================================================

    def initiate_multipart_upload(self, transfer_id, file_size_bytes, num_parts=None):
        if not self.is_s3_mode():                                                    # Memory mode: no presigned URLs
            return dict(error='presigned_not_available', message='S3 storage mode required for presigned uploads')

        if self.transfer_service and not self.transfer_service.has_transfer(transfer_id):
            return dict(error='transfer_not_found')

        if self.transfer_service:                                                    # Verify transfer is in pending state
            meta = self.transfer_service.load_meta(transfer_id)
            if meta.get('status') != 'pending':
                return dict(error='transfer_not_pending')

        # Calculate part count and size
        part_size = DEFAULT_PART_SIZE
        if num_parts is None or num_parts == 0:
            num_parts = max(1, -(-file_size_bytes // part_size))                     # ceiling division
        else:
            part_size = max(5 * 1024 * 1024, -(-file_size_bytes // num_parts))       # min 5MB per part (S3 requirement)

        if num_parts > MAX_PARTS:
            return dict(error='too_many_parts', message=f'Maximum {MAX_PARTS} parts allowed')

        s3_key = self.s3_key(transfer_id)

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

        # Record multipart initiation in transfer metadata
        if self.transfer_service:
            meta = self.transfer_service.load_meta(transfer_id)
            meta['upload_id']   = upload_id
            meta['num_parts']   = num_parts
            meta['part_size']   = part_size
            meta['upload_mode'] = 'presigned_multipart'
            meta['events'].append(dict(
                action    = 'multipart_initiated',
                timestamp = datetime.now(timezone.utc).isoformat(),
                num_parts = num_parts
            ))
            self.transfer_service.save_meta(transfer_id, meta)

        return dict(transfer_id = transfer_id,
                    upload_id   = upload_id  ,
                    part_urls   = part_urls  ,
                    part_size   = part_size  )

    # =========================================================================
    # Multipart upload: complete
    # =========================================================================

    def complete_multipart_upload(self, transfer_id, upload_id, parts):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available')

        if self.transfer_service and not self.transfer_service.has_transfer(transfer_id):
            return dict(error='transfer_not_found')

        s3_key = self.s3_key(transfer_id)

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

        # Record completion in transfer metadata
        if self.transfer_service:
            meta = self.transfer_service.load_meta(transfer_id)
            meta['events'].append(dict(
                action    = 'multipart_completed',
                timestamp = datetime.now(timezone.utc).isoformat(),
                upload_id = upload_id,
                etag      = response.get('ETag', '')
            ))
            # Mark as having payload (the existing complete_transfer flow checks has_payload)
            meta['events'].append(dict(
                action    = 'upload',
                timestamp = datetime.now(timezone.utc).isoformat()
            ))
            self.transfer_service.save_meta(transfer_id, meta)

        return dict(transfer_id = transfer_id,
                    status      = 'assembled' ,
                    etag        = response.get('ETag', ''))

    # =========================================================================
    # Multipart upload: cancel (cleanup on failure)
    # =========================================================================

    def cancel_multipart_upload(self, transfer_id, upload_id):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available')

        s3_key = self.s3_key(transfer_id)
        self.s3.client().abort_multipart_upload(
            Bucket   = self.s3_bucket,
            Key      = s3_key,
            UploadId = upload_id
        )

        if self.transfer_service:
            meta = self.transfer_service.load_meta(transfer_id)
            meta['events'].append(dict(
                action    = 'multipart_cancelled',
                timestamp = datetime.now(timezone.utc).isoformat(),
                upload_id = upload_id
            ))
            self.transfer_service.save_meta(transfer_id, meta)

        return dict(transfer_id = transfer_id, status = 'cancelled')

    # =========================================================================
    # Presigned download URL
    # =========================================================================

    def create_download_url(self, transfer_id, expiry=PRESIGNED_DOWNLOAD_EXPIRY,
                            downloader_ip='', user_agent=''):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available', message='S3 storage mode required')

        if self.transfer_service:
            if not self.transfer_service.has_transfer(transfer_id):
                return dict(error='transfer_not_found')
            meta = self.transfer_service.load_meta(transfer_id)
            if meta.get('status') != 'completed':
                return dict(error='transfer_not_completed')

            # Record download event (same as direct download path)
            meta['download_count'] = meta.get('download_count', 0) + 1
            meta['events'].append(dict(
                action     = 'download_presigned',
                timestamp  = datetime.now(timezone.utc).isoformat(),
                ip_hash    = self.transfer_service.hash_ip(downloader_ip),
                user_agent = self.transfer_service.hash_user_agent(user_agent or '')
            ))
            self.transfer_service.save_meta(transfer_id, meta)

        s3_key = self.s3_key(transfer_id)

        url = self.s3.create_pre_signed_url(
            bucket_name = self.s3_bucket,
            object_name = s3_key,
            operation   = 'get_object',
            expiration  = expiry
        )

        return dict(transfer_id  = transfer_id,
                    download_url = url         ,
                    expires_in   = expiry      )

    # =========================================================================
    # Presigned single-part upload URL (for files < 5GB but > Lambda limit)
    # =========================================================================

    def create_upload_url(self, transfer_id, expiry=PRESIGNED_UPLOAD_EXPIRY):
        if not self.is_s3_mode():
            return dict(error='presigned_not_available')

        if self.transfer_service and not self.transfer_service.has_transfer(transfer_id):
            return dict(error='transfer_not_found')

        s3_key = self.s3_key(transfer_id)

        url = self.s3.create_pre_signed_url(
            bucket_name = self.s3_bucket,
            object_name = s3_key,
            operation   = 'put_object',
            expiration  = expiry
        )

        return dict(transfer_id = transfer_id,
                    upload_url  = url         ,
                    expires_in  = expiry      )

    # =========================================================================
    # Storage mode capability check
    # =========================================================================

    def get_capabilities(self):                                                      # What upload modes are available
        return dict(presigned_upload   = self.is_s3_mode(),
                    multipart_upload   = self.is_s3_mode(),
                    presigned_download = self.is_s3_mode(),
                    direct_upload      = True,                                       # Always available (existing route)
                    max_part_size      = DEFAULT_PART_SIZE,
                    min_part_size      = 5 * 1024 * 1024,                            # S3 minimum
                    max_parts          = MAX_PARTS)
