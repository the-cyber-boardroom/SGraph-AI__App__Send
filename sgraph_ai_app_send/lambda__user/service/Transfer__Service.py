# ===============================================================================
# SGraph Send - Transfer Service
# In-memory transfer management with IP hashing and transparency logging
# ===============================================================================

import hashlib
import secrets
from   datetime                                                                  import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe

# todo: transfers and payloads should be type safe collections (see library/dependencies/osbot-utils/type_safe/v3.63.3__for_llms__type_safe__collections__subclassing_guide.md)
#       very important: we should using here the Memory_FS abstraction layer since that allow us to change the location of where the data is saved (via configuration)
class Transfer__Service(Type_Safe):                                              # Core transfer management service
    transfers : dict                                                             # In-memory store: {transfer_id: meta_dict}
    payloads  : dict                                                             # In-memory store: {transfer_id: bytes}

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

        self.transfers[transfer_id] = meta                                       # todo: good example of what we shouldn't be doing since both meta and self.transfers[transfer_id] are dicts
        upload_url = f'/transfers/upload/{transfer_id}'                          # todo: we shouldn't be hardcoding this url here, the caller should know where to find it from the transfer_id
        return dict(transfer_id = transfer_id,
                    upload_url  = upload_url  )

    # todo: see above the comments about the method
    def upload_payload(self, transfer_id, payload_bytes):                        # Store encrypted payload bytes
        if transfer_id not in self.transfers:
            return False
        meta = self.transfers[transfer_id]
        if meta['status'] != 'pending':                                          # todo: these should be ENUMs
            return False
        self.payloads[transfer_id] = payload_bytes
        meta['events'].append(dict(action    = 'upload'                         ,       # todo: should not be an dict
                                   timestamp = datetime.now(timezone.utc).isoformat())) # todo: should be Timestamp_Now
        return True

    #todo: I'm going to stop adding comments on the issues I raised above
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
        return hashlib.sha256(ip_address.encode()).hexdigest()                   # todo: move this hash logic into a separate class, and take a look at the Cache__Hash__Generator (in osbot_utils/helpers/cache/Cache__Hash__Generator.py) since that should already have what we need
