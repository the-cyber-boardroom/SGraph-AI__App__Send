# ===============================================================================
# SGraph Send - Transfer Service
# Transfer management with Storage_FS backend, IP hashing and transparency logging
# ===============================================================================

import hashlib
import json
import secrets
from   datetime                                                                  import datetime, timezone
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe


class Transfer__Service(Type_Safe):                                              # Core transfer management service
    storage_fs : Storage_FS = None                                               # Pluggable storage backend

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:                                              # Auto-create in-memory backend
            self.storage_fs = Storage_FS__Memory()

    def meta_path(self, transfer_id):                                            # Path for transfer metadata JSON
        return f'transfers/{transfer_id}/meta.json'

    def payload_path(self, transfer_id):                                         # Path for encrypted payload bytes
        return f'transfers/{transfer_id}/payload'

    def save_meta(self, transfer_id, meta):                                      # Persist metadata as JSON bytes
        self.storage_fs.file__save(self.meta_path(transfer_id),
                                   json.dumps(meta).encode()   )

    def load_meta(self, transfer_id):                                            # Load metadata from storage
        return self.storage_fs.file__json(self.meta_path(transfer_id))

    def has_transfer(self, transfer_id):                                         # Check if transfer exists
        return self.storage_fs.file__exists(self.meta_path(transfer_id))

    def has_payload(self, transfer_id):                                          # Check if payload exists
        return self.storage_fs.file__exists(self.payload_path(transfer_id))

    # todo: this signature needs to be protected by @type_safe and have a type safe primitive mapped to each var (see library/guides/development/code-formating/v3.63.4__for_llms__python_formatting_guide.md )
    def create_transfer(self, file_size_bytes, content_type_hint, sender_ip):    # Create a new transfer record
        # todo this code should be replaced with Transfer_Id() with Transfer_Id(Random_Guid)
        #      for security purposes it will be better to use a full GUID/UUID for the transfer id
        transfer_id = secrets.token_hex(6)                                       # 12-char random hex string
        ip_hash     = self.hash_ip(sender_ip)
        now         = datetime.now(timezone.utc).isoformat()                    # todo all dates and timestamps to be created using Timestamp_Now()

        # todo: this should be Type_Safe class (not a dict
        meta = dict(transfer_id       = transfer_id      ,                      # todo: if transfer_id is of type Transfer_Id (extending Random_Guid) and this is Type_Safe class, then this value will be created automatically on instance creation
                    status            = 'pending'         ,                     # todo: this should be an ENUM
                    file_size_bytes   = file_size_bytes   ,
                    content_type_hint = content_type_hint ,                     # todo: note that without this being a Type_Safe class, what exactly is inside this variable?
                    created_at        = now               ,                     # todo: if this a Timestamp_Now object, then this doesn't need to be created
                    sender_ip_hash    = ip_hash           ,
                    download_count    = 0                 ,                     # todo: no need to assign this since 0 is the default value of Safe_UInt
                    events            = []                )                     # todo: same here [] is the default value of a list, note that this needs to be Type_Safe lis

        self.save_meta(transfer_id, meta)                                        # Persist to storage backend
        upload_url = f'/transfers/upload/{transfer_id}'                          # todo: we shouldn't be hardcoding this url here, the caller should know where to find it from the transfer_id
        return dict(transfer_id = transfer_id,
                    upload_url  = upload_url  )

    # todo: see above the comments about the method
    def upload_payload(self, transfer_id, payload_bytes):                        # Store encrypted payload bytes
        if not self.has_transfer(transfer_id):
            return False
        meta = self.load_meta(transfer_id)
        if meta['status'] != 'pending':                                          # todo: these should be ENUMs
            return False
        self.storage_fs.file__save(self.payload_path(transfer_id),
                                   payload_bytes                  )
        meta['events'].append(dict(action    = 'upload'                         ,       # todo: should not be an dict
                                   timestamp = datetime.now(timezone.utc).isoformat())) # todo: should be Timestamp_Now
        self.save_meta(transfer_id, meta)
        return True

    #todo: I'm going to stop adding comments on the issues I raised above
    # todo: needs @type_safe decorator with typed parameters (transfer_id : Transfer_Id)
    # todo: return type should be Schema__Transfer__Complete_Response (not raw dict)
    def complete_transfer(self, transfer_id):                                    # Mark transfer as completed
        if not self.has_transfer(transfer_id):
            return None
        meta = self.load_meta(transfer_id)
        if not self.has_payload(transfer_id):
            return None
        meta['status'] = 'completed'                                             # todo: should be Enum__Transfer__Status.COMPLETED
        meta['events'].append(dict(action    = 'complete'                       ,# todo: event should be Type_Safe class (not raw dict)
                                   timestamp = datetime.now(timezone.utc).isoformat())) # todo: should be Timestamp_Now()
        self.save_meta(transfer_id, meta)
        download_url = f'/d/{transfer_id}'                                       # todo: hardcoded URL, caller should derive from transfer_id
        transparency = dict(ip             = meta['sender_ip_hash']  ,           # todo: transparency should be a Type_Safe class
                            timestamp      = meta['created_at']      ,
                            file_size_bytes= meta['file_size_bytes'] ,
                            stored_fields  = ['ip_hash', 'file_size_bytes', 'created_at', 'content_type_hint'],
                            not_stored     = ['file_name', 'decryption_key', 'raw_ip'])
        return dict(transfer_id  = transfer_id ,                                 # todo: return Type_Safe class, not raw dict
                    download_url = download_url,
                    transparency = transparency)

    # todo: needs @type_safe decorator with typed parameters (transfer_id : Transfer_Id)
    # todo: return type should be Schema__Transfer__Info (not raw dict)
    def get_transfer_info(self, transfer_id):                                    # Get transfer metadata
        if not self.has_transfer(transfer_id):
            return None
        meta = self.load_meta(transfer_id)
        return dict(transfer_id      = meta['transfer_id']      ,                 # todo: return Type_Safe class, not raw dict
                    status           = meta['status']           ,
                    file_size_bytes  = meta['file_size_bytes']  ,
                    content_type_hint= meta.get('content_type_hint', ''),
                    created_at       = meta['created_at']       ,
                    download_count   = meta['download_count']   )

    # todo: needs @type_safe decorator with typed parameters
    # todo: transfer_id should be Transfer_Id, downloader_ip should be str or Safe_Str__IP_Address
    # todo: user_agent should be Safe_Str or Safe_Str__Http__User_Agent
    def get_download_payload(self, transfer_id, downloader_ip, user_agent):      # Retrieve encrypted payload
        if not self.has_transfer(transfer_id):
            return None
        meta = self.load_meta(transfer_id)
        if meta['status'] != 'completed':                                        # todo: should compare with Enum__Transfer__Status.COMPLETED
            return None
        if not self.has_payload(transfer_id):
            return None
        meta['download_count'] += 1                                              # todo: should use Safe_UInt for download_count
        meta['events'].append(dict(action       = 'download'                    ,# todo: event should be Type_Safe class (not raw dict)
                                   timestamp    = datetime.now(timezone.utc).isoformat(), # todo: should be Timestamp_Now()
                                   ip_hash      = self.hash_ip(downloader_ip)   ,
                                   user_agent   = user_agent or ''              ))
        self.save_meta(transfer_id, meta)
        return self.storage_fs.file__bytes(self.payload_path(transfer_id))

    def hash_ip(self, ip_address):                                               # SHA-256 hash of IP address
        if ip_address is None:
            ip_address = ''
        return hashlib.sha256(ip_address.encode()).hexdigest()                   # todo: move this hash logic into a separate class, and take a look at the Cache__Hash__Generator (in osbot_utils/helpers/cache/Cache__Hash__Generator.py) since that should already have what we need
