# ===============================================================================
# SGraph Send - Transfer Service
# Transfer management with Storage_FS backend, IP hashing and transparency logging
# ===============================================================================

import hashlib
import json
import re
import secrets
from   datetime                                                                  import datetime, timezone
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                    import path__transfer_meta, path__transfer_payload


class Transfer__Service(Type_Safe):                                              # Core transfer management service
    storage_fs : Storage_FS = None                                               # Pluggable storage backend

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:                                              # Auto-create in-memory backend
            self.storage_fs = Storage_FS__Memory()

    def meta_path(self, transfer_id):                                            # Path for transfer metadata JSON
        return path__transfer_meta(transfer_id)

    def payload_path(self, transfer_id):                                         # Path for encrypted payload bytes
        return path__transfer_payload(transfer_id)

    def save_meta(self, transfer_id, meta):                                      # Persist metadata as JSON bytes
        self.storage_fs.file__save(self.meta_path(transfer_id),
                                   json.dumps(meta).encode()   )

    def load_meta(self, transfer_id):                                            # Load metadata from storage
        return self.storage_fs.file__json(self.meta_path(transfer_id))

    def has_transfer(self, transfer_id):                                         # Check if transfer exists
        return self.storage_fs.file__exists(self.meta_path(transfer_id))

    def has_payload(self, transfer_id):                                          # Check if payload exists
        return self.storage_fs.file__exists(self.payload_path(transfer_id))

    TRANSFER_ID_PATTERN = re.compile(r'^[a-f0-9]{12}$')                           # Valid transfer ID: exactly 12 lowercase hex chars

    def _hash_str(self, value):                                                  # SHA-256 hash of any string value
        if value is None:
            value = ''
        return hashlib.sha256(value.encode()).hexdigest()

    def hash_ip(self, ip_address):                                               # SHA-256 hash of IP address
        return self._hash_str(ip_address)

    def hash_user_agent(self, user_agent):                                       # SHA-256 hash of user-agent string
        return self._hash_str(user_agent)

    def create_transfer(self, file_size_bytes, content_type_hint, sender_ip,     # Create a new transfer record
                             transfer_id      = ''    ,                          # Optional client-provided ID (PBKDF2 simple-token mode)
                             max_downloads    = 0     ,                          # 0 = unlimited
                             auto_delete      = False ,                          # Wipe payload after last download
                             expires_at       = ''    ,                          # ISO-8601 UTC, empty = no expiry
                             delete_auth_hash = ''    ):                         # SHA-256 of delete_auth, empty = delete disabled
        if transfer_id:                                                          # Client-provided ID — validate format and uniqueness
            if not self.TRANSFER_ID_PATTERN.match(transfer_id):
                return dict(error = 'invalid_transfer_id_format')
            if self.has_transfer(transfer_id):
                return dict(error = 'transfer_id_exists')
        else:
            transfer_id = secrets.token_hex(6)                                   # 12-char random hex string
        ip_hash = self.hash_ip(sender_ip)
        now     = datetime.now(timezone.utc).isoformat()

        meta = dict(transfer_id       = transfer_id      ,
                    status            = 'pending'         ,
                    file_size_bytes   = file_size_bytes   ,
                    content_type_hint = content_type_hint ,
                    created_at        = now               ,
                    sender_ip_hash    = ip_hash           ,
                    download_count    = 0                 ,
                    max_downloads     = max_downloads     ,
                    auto_delete       = auto_delete       ,
                    expires_at        = expires_at        ,
                    delete_auth_hash  = delete_auth_hash  ,
                    events            = []                )

        self.save_meta(transfer_id, meta)
        upload_url = f'/api/transfers/upload/{transfer_id}'
        return dict(transfer_id = transfer_id,
                    upload_url  = upload_url  )

    def upload_payload(self, transfer_id, payload_bytes):                        # Store encrypted payload bytes
        if not self.has_transfer(transfer_id):
            return False
        meta = self.load_meta(transfer_id)
        if meta['status'] != 'pending':
            return False
        self.storage_fs.file__save(self.payload_path(transfer_id),
                                   payload_bytes                  )
        meta['events'].append(dict(action    = 'upload'                        ,
                                   timestamp = datetime.now(timezone.utc).isoformat()))
        self.save_meta(transfer_id, meta)
        return True

    def complete_transfer(self, transfer_id):                                    # Mark transfer as completed
        if not self.has_transfer(transfer_id):
            return None
        meta = self.load_meta(transfer_id)
        if not self.has_payload(transfer_id):
            return None
        meta['status'] = 'completed'
        meta['events'].append(dict(action    = 'complete'                      ,
                                   timestamp = datetime.now(timezone.utc).isoformat()))
        self.save_meta(transfer_id, meta)
        download_url = f'/d/{transfer_id}'
        transparency = dict(ip             = meta['sender_ip_hash']  ,
                            timestamp      = meta['created_at']      ,
                            file_size_bytes= meta['file_size_bytes'] ,
                            stored_fields  = ['ip_hash', 'file_size_bytes', 'created_at', 'content_type_hint'],
                            encrypted      = ['file_name', 'file_content'],
                            not_stored     = ['decryption_key', 'raw_ip'])
        return dict(transfer_id  = transfer_id ,
                    download_url = download_url,
                    transparency = transparency)

    def get_transfer_info(self, transfer_id):                                    # Get transfer metadata
        if not self.has_transfer(transfer_id):
            return None
        meta = self.load_meta(transfer_id)
        return dict(transfer_id         = meta['transfer_id']              ,
                    status              = meta['status']                   ,
                    file_size_bytes     = meta['file_size_bytes']          ,
                    content_type_hint   = meta.get('content_type_hint', ''),
                    created_at          = meta['created_at']               ,
                    download_count      = meta['download_count']           ,
                    max_downloads       = meta.get('max_downloads', 0)     ,
                    expires_at          = meta.get('expires_at', '')       ,
                    downloads_remaining = self._downloads_remaining(meta)  ,
                    is_expired          = self._is_expired(meta)           )

    def get_download_payload(self, transfer_id, downloader_ip, user_agent):      # Retrieve encrypted payload
        if not self.has_transfer(transfer_id):
            return None
        meta = self.load_meta(transfer_id)
        if meta['status'] not in ('completed', 'exhausted'):
            return None
        if meta['status'] == 'exhausted':
            return dict(error='exhausted', status=410)
        if not self.has_payload(transfer_id):
            return None

        if self._is_expired(meta):                                               # Expiry check before download limit
            return dict(error='expired', status=410)

        max_dl = meta.get('max_downloads', 0)
        if max_dl > 0 and meta.get('download_count', 0) >= max_dl:              # Download limit check
            return dict(error='exhausted', status=410)

        meta['download_count'] += 1
        meta['events'].append(dict(action      = 'download'                    ,
                                   timestamp   = datetime.now(timezone.utc).isoformat(),
                                   ip_hash     = self.hash_ip(downloader_ip)   ,
                                   user_agent  = self.hash_user_agent(user_agent)))
        self.save_meta(transfer_id, meta)

        payload = self.storage_fs.file__bytes(self.payload_path(transfer_id))

        if meta.get('auto_delete') and max_dl > 0 and meta['download_count'] >= max_dl:
            self.storage_fs.file__delete(self.payload_path(transfer_id))         # Wipe payload — max downloads reached
            meta['status'] = 'exhausted'
            self.save_meta(transfer_id, meta)

        return payload

    def delete_transfer(self, transfer_id, delete_auth_hex):                     # Sender-controlled hard delete (requires delete_auth derived from decryption key)
        if not self.has_transfer(transfer_id):
            return dict(error='not_found', status=404)
        meta = self.load_meta(transfer_id)
        stored_hash = meta.get('delete_auth_hash', '')
        if not stored_hash:
            return dict(error='delete_not_enabled', status=409)
        submitted_hash = self._hash_str(delete_auth_hex)
        if submitted_hash != stored_hash:
            return dict(error='auth_mismatch', status=403)
        if meta.get('status') in ('deleted', 'exhausted'):
            return dict(status='already_deleted', transfer_id=transfer_id)
        if self.has_payload(transfer_id):
            self.storage_fs.file__delete(self.payload_path(transfer_id))
        meta['status'] = 'deleted'
        meta['events'].append(dict(action    = 'delete'                        ,
                                   timestamp = datetime.now(timezone.utc).isoformat()))
        self.save_meta(transfer_id, meta)
        return dict(status='deleted', transfer_id=transfer_id)

    @staticmethod
    def _is_expired(meta):                                                       # Check if transfer has passed its expiry timestamp
        exp = meta.get('expires_at', '')
        if not exp:
            return False
        return datetime.now(timezone.utc) > datetime.fromisoformat(exp)

    @staticmethod
    def _downloads_remaining(meta):                                              # Remaining downloads (0 = unlimited)
        max_dl = meta.get('max_downloads', 0)
        if max_dl == 0:
            return 0
        return max(0, max_dl - meta.get('download_count', 0))
