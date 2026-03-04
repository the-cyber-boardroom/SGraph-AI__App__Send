# ===============================================================================
# SGraph Send - Vault Pointer Service
# Mutable vault file storage with write-key authorization
# ===============================================================================

import hashlib
import json
from   datetime                                                                  import datetime, timezone
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe


class Service__Vault__Pointer(Type_Safe):                                        # Mutable vault file storage with write-key auth
    storage_fs : Storage_FS = None                                               # Pluggable storage backend (shared with Transfer__Service)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:                                              # Auto-create in-memory backend
            self.storage_fs = Storage_FS__Memory()

    def vault_manifest_path(self, vault_id):                                     # Path for vault manifest (ownership record)
        return f'transfers/vault/{vault_id}/manifest.json'

    def vault_meta_path(self, vault_id, file_id):                                # Path for vault file metadata JSON
        return f'transfers/vault/{vault_id}/{file_id}/meta.json'

    def vault_payload_path(self, vault_id, file_id):                             # Path for vault file payload bytes
        return f'transfers/vault/{vault_id}/{file_id}/payload'

    def _check_vault_write_key(self, vault_id, submitted_hash):                  # Check write key against vault manifest
        manifest_path = self.vault_manifest_path(vault_id)
        if not self.storage_fs.file__exists(manifest_path):
            return True                                                          # No manifest yet — first write creates it
        manifest = self.storage_fs.file__json(manifest_path)
        return manifest.get('write_key_hash') == submitted_hash

    def _ensure_manifest(self, vault_id, submitted_hash):                        # Create manifest on first write to a vault
        manifest_path = self.vault_manifest_path(vault_id)
        if self.storage_fs.file__exists(manifest_path):
            return
        manifest = dict(vault_id       = vault_id                               ,
                        write_key_hash = submitted_hash                         ,
                        created_at     = datetime.now(timezone.utc).isoformat() )
        self.storage_fs.file__save(manifest_path, json.dumps(manifest).encode())

    def write(self, vault_id, file_id, write_key_hex, payload_bytes):            # Write or overwrite a vault file
        meta_path      = self.vault_meta_path(vault_id, file_id)
        payload_path   = self.vault_payload_path(vault_id, file_id)
        submitted_hash = hashlib.sha256(write_key_hex.encode()).hexdigest()

        if not self._check_vault_write_key(vault_id, submitted_hash):            # Vault manifest rejects this write key
            return None

        if self.storage_fs.file__exists(meta_path):                              # Overwrite — verify write key
            meta = self.storage_fs.file__json(meta_path)
            if meta.get('write_key_hash') != submitted_hash:
                return None                                                      # Auth failure
            meta['updated_at']  = datetime.now(timezone.utc).isoformat()
            meta['write_count'] = meta.get('write_count', 0) + 1
        else:                                                                    # First write — register
            self._ensure_manifest(vault_id, submitted_hash)                      # Create manifest if needed
            meta = dict(file_id        = file_id                                ,
                        vault_id       = vault_id                               ,
                        mutable        = True                                   ,
                        write_key_hash = submitted_hash                         ,
                        status         = 'completed'                            ,
                        created_at     = datetime.now(timezone.utc).isoformat() ,
                        updated_at     = datetime.now(timezone.utc).isoformat() ,
                        write_count    = 1                                      )

        self.storage_fs.file__save(meta_path   , json.dumps(meta).encode())
        self.storage_fs.file__save(payload_path, payload_bytes             )
        return dict(file_id     = file_id              ,
                    vault_id    = vault_id             ,
                    status      = 'completed'          ,
                    write_count = meta['write_count']  )

    def read(self, vault_id, file_id):                                           # Read a vault file's payload bytes
        payload_path = self.vault_payload_path(vault_id, file_id)
        if not self.storage_fs.file__exists(payload_path):
            return None
        return self.storage_fs.file__bytes(payload_path)

    def delete(self, vault_id, file_id, write_key_hex):                          # Delete a vault file (requires write key)
        meta_path    = self.vault_meta_path(vault_id, file_id)
        payload_path = self.vault_payload_path(vault_id, file_id)
        submitted_hash = hashlib.sha256(write_key_hex.encode()).hexdigest()

        if not self._check_vault_write_key(vault_id, submitted_hash):            # Vault manifest rejects this write key
            return None

        if not self.storage_fs.file__exists(meta_path):
            return None                                                          # File doesn't exist

        meta = self.storage_fs.file__json(meta_path)
        if meta.get('write_key_hash') != submitted_hash:
            return None                                                          # Auth failure

        self.storage_fs.file__delete(meta_path)
        self.storage_fs.file__delete(payload_path)
        return dict(file_id  = file_id  ,
                    vault_id = vault_id ,
                    status   = 'deleted')
