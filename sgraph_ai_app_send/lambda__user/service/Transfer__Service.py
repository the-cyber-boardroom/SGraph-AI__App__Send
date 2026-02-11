# ===============================================================================
# SGraph Send - Transfer Service
# In-memory transfer management with IP hashing and transparency logging
# ===============================================================================

import hashlib
import secrets
from   datetime                                                                  import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe


class Transfer__Service(Type_Safe):                                              # Core transfer management service
    transfers : dict                                                             # In-memory store: {transfer_id: meta_dict}
    payloads  : dict                                                             # In-memory store: {transfer_id: bytes}

    def create_transfer(self, file_size_bytes, content_type_hint, sender_ip):    # Create a new transfer record
        transfer_id = secrets.token_hex(6)                                       # 12-char random hex string
        ip_hash     = self.hash_ip(sender_ip)
        now         = datetime.now(timezone.utc).isoformat()

        meta = dict(transfer_id       = transfer_id      ,
                    status            = 'pending'         ,
                    file_size_bytes   = file_size_bytes   ,
                    content_type_hint = content_type_hint ,
                    created_at        = now               ,
                    sender_ip_hash    = ip_hash           ,
                    download_count    = 0                 ,
                    events            = []                )

        self.transfers[transfer_id] = meta
        upload_url = f'/transfers/upload/{transfer_id}'
        return dict(transfer_id = transfer_id,
                    upload_url  = upload_url  )

    def upload_payload(self, transfer_id, payload_bytes):                        # Store encrypted payload bytes
        if transfer_id not in self.transfers:
            return False
        meta = self.transfers[transfer_id]
        if meta['status'] != 'pending':
            return False
        self.payloads[transfer_id] = payload_bytes
        meta['events'].append(dict(action    = 'upload'                         ,
                                   timestamp = datetime.now(timezone.utc).isoformat()))
        return True

    def complete_transfer(self, transfer_id):                                    # Mark transfer as completed
        if transfer_id not in self.transfers:
            return None
        meta = self.transfers[transfer_id]
        if transfer_id not in self.payloads:
            return None
        meta['status'] = 'completed'
        meta['events'].append(dict(action    = 'complete'                       ,
                                   timestamp = datetime.now(timezone.utc).isoformat()))
        download_url = f'/d/{transfer_id}'
        transparency = dict(ip             = meta['sender_ip_hash']  ,
                            timestamp      = meta['created_at']      ,
                            file_size_bytes= meta['file_size_bytes'] ,
                            stored_fields  = ['ip_hash', 'file_size_bytes', 'created_at', 'content_type_hint'],
                            not_stored     = ['file_name', 'decryption_key', 'raw_ip'])
        return dict(transfer_id  = transfer_id ,
                    download_url = download_url,
                    transparency = transparency)

    def get_transfer_info(self, transfer_id):                                    # Get transfer metadata
        if transfer_id not in self.transfers:
            return None
        meta = self.transfers[transfer_id]
        return dict(transfer_id    = meta['transfer_id']   ,
                    status         = meta['status']        ,
                    file_size_bytes= meta['file_size_bytes'],
                    created_at     = meta['created_at']    ,
                    download_count = meta['download_count'])

    def get_download_payload(self, transfer_id, downloader_ip, user_agent):      # Retrieve encrypted payload
        if transfer_id not in self.transfers:
            return None
        meta = self.transfers[transfer_id]
        if meta['status'] != 'completed':
            return None
        if transfer_id not in self.payloads:
            return None
        meta['download_count'] += 1
        meta['events'].append(dict(action       = 'download'                    ,
                                   timestamp    = datetime.now(timezone.utc).isoformat(),
                                   ip_hash      = self.hash_ip(downloader_ip)   ,
                                   user_agent   = user_agent or ''              ))
        return self.payloads[transfer_id]

    def hash_ip(self, ip_address):                                               # SHA-256 hash of IP address
        if ip_address is None:
            ip_address = ''
        return hashlib.sha256(ip_address.encode()).hexdigest()
