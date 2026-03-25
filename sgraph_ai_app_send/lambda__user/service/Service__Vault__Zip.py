# ===============================================================================
# SGraph Send - Vault Zip Service
# Build zip archives of vault contents with content-addressable S3 caching
# Write-key required (bulk export is a privileged operation)
# ===============================================================================

import hashlib
import io
import zipfile
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Pointer           import Service__Vault__Pointer


class Service__Vault__Zip(Type_Safe):                                            # Vault zip builder with content-addressable caching
    vault_service : Service__Vault__Pointer = None                               # Vault pointer service (shared)
    storage_fs    : Storage_FS              = None                               # Storage backend for zip cache

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:
            self.storage_fs = Storage_FS__Memory()

    def vault_content_hash(self, vault_id):                                      # SHA-256 hash of vault file list + sizes (cache key)
        list_result = self.vault_service.list_files(vault_id)
        files       = sorted(list_result['files'])
        if not files:
            return None                                                          # Empty vault — no zip to build

        parts = []
        for file_id in files:
            payload = self.vault_service.read(vault_id, file_id)
            size    = len(payload) if payload else 0
            parts.append(f'{file_id}:{size}')

        return hashlib.sha256('|'.join(parts).encode()).hexdigest()

    def zip_storage_path(self, vault_id, content_hash):                          # Storage path for cached zip
        return f'vault-zips/{vault_id}/{content_hash}.zip'

    def zip_exists(self, vault_id, content_hash):                                # Check if cached zip exists
        return self.storage_fs.file__exists(self.zip_storage_path(vault_id, content_hash))

    def build_zip(self, vault_id):                                               # Build zip archive of all vault files
        list_result = self.vault_service.list_files(vault_id)
        files       = sorted(list_result['files'])

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_id in files:
                payload = self.vault_service.read(vault_id, file_id)
                if payload is not None:
                    zf.writestr(file_id, payload)
        return buf.getvalue()

    def get_or_create_zip(self, vault_id, write_key_hex):                        # Full flow: auth → hash → cache check → build → return
        submitted_hash = self.vault_service._hash_write_key(write_key_hex)       # Verify write key
        if not self.vault_service._check_vault_write_key(vault_id, submitted_hash):
            return None                                                          # Auth failure

        manifest_path = self.vault_service.vault_manifest_path(vault_id)
        if not self.vault_service.storage_fs.file__exists(manifest_path):
            return dict(status = 'error', detail = 'Vault not found')

        content_hash = self.vault_content_hash(vault_id)
        if content_hash is None:
            return dict(status     = 'ok'       ,
                        vault_id   = vault_id   ,
                        file_count = 0          ,
                        cached     = False      ,
                        detail     = 'Vault is empty — no files to zip')

        zip_path = self.zip_storage_path(vault_id, content_hash)
        cached   = self.zip_exists(vault_id, content_hash)

        if not cached:                                                           # Cache miss — build and store
            zip_bytes = self.build_zip(vault_id)
            self.storage_fs.file__save(zip_path, zip_bytes)

        list_result = self.vault_service.list_files(vault_id)
        file_count  = len(list_result['files'])

        return dict(status       = 'ok'          ,
                    vault_id     = vault_id       ,
                    content_hash = content_hash   ,
                    file_count   = file_count     ,
                    cached       = cached         ,
                    zip_path     = zip_path       )
