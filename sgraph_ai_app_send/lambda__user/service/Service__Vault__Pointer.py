# ===============================================================================
# SGraph Send - Vault Pointer Service
# Opaque blob storage with write-key authorization
# No per-file metadata — manifest.json is the sole auth record per vault
# ===============================================================================

import base64
import hashlib
import json
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe


class Service__Vault__Pointer(Type_Safe):                                        # Opaque blob storage with write-key auth
    storage_fs       : Storage_FS = None                                         # Pluggable storage backend (shared with Transfer__Service)
    _manifest_cache  : dict       = None                                         # Lambda-lifetime cache: vault_id → manifest dict (or True for "no manifest")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:                                              # Auto-create in-memory backend
            self.storage_fs = Storage_FS__Memory()
        if self._manifest_cache is None:
            self._manifest_cache = {}

    def vault_manifest_path(self, vault_id):                                     # Path for vault manifest (ownership record)
        return f'transfers/vault/{vault_id}/manifest.json'

    def vault_payload_path(self, vault_id, file_id):                             # Path for vault file payload bytes
        return f'transfers/vault/{vault_id}/{file_id}/payload'

    def _hash_write_key(self, write_key_hex):                                    # SHA-256 hash of write key
        return hashlib.sha256(write_key_hex.encode()).hexdigest()

    def _load_manifest(self, vault_id):                                          # Load manifest with Lambda-lifetime cache
        if vault_id in self._manifest_cache:                                     # Cache hit
            return self._manifest_cache[vault_id]
        manifest_path = self.vault_manifest_path(vault_id)
        if not self.storage_fs.file__exists(manifest_path):
            return None                                                          # No manifest yet (not cached — will be created on first write)
        manifest = self.storage_fs.file__json(manifest_path)
        self._manifest_cache[vault_id] = manifest                                # Cache for Lambda lifetime
        return manifest

    def _check_vault_write_key(self, vault_id, submitted_hash):                  # Check write key against vault manifest
        manifest = self._load_manifest(vault_id)
        if manifest is None:
            return True                                                          # No manifest yet — first write creates it
        return manifest.get('write_key_hash') == submitted_hash

    def _ensure_manifest(self, vault_id, submitted_hash):                        # Create manifest on first write to a vault
        if self._load_manifest(vault_id) is not None:                            # Already exists (cached check — no S3 call)
            return
        manifest_path = self.vault_manifest_path(vault_id)
        manifest = dict(vault_id       = vault_id                               ,
                        write_key_hash = submitted_hash                         ,
                        created_at     = Timestamp_Now()                        )
        self.storage_fs.file__save(manifest_path, json.dumps(manifest).encode())
        self._manifest_cache[vault_id] = manifest                                # Cache the newly created manifest

    def write(self, vault_id, file_id, write_key_hex, payload_bytes):            # Write or overwrite a vault file
        payload_path   = self.vault_payload_path(vault_id, file_id)
        submitted_hash = self._hash_write_key(write_key_hex)

        if not self._check_vault_write_key(vault_id, submitted_hash):            # Vault manifest rejects this write key
            return None

        self._ensure_manifest(vault_id, submitted_hash)                          # Create manifest if needed
        self.storage_fs.file__save(payload_path, payload_bytes)
        return dict(file_id  = file_id              ,
                    vault_id = vault_id             ,
                    status   = 'completed'          )

    def read(self, vault_id, file_id):                                           # Read a vault file's payload bytes
        payload_path = self.vault_payload_path(vault_id, file_id)
        if not self.storage_fs.file__exists(payload_path):
            return None
        return self.storage_fs.file__bytes(payload_path)

    def delete(self, vault_id, file_id, write_key_hex):                          # Delete a vault file (requires write key)
        payload_path   = self.vault_payload_path(vault_id, file_id)
        submitted_hash = self._hash_write_key(write_key_hex)

        if not self._check_vault_write_key(vault_id, submitted_hash):            # Vault manifest rejects this write key
            return None

        if not self.storage_fs.file__exists(payload_path):
            return None                                                          # File doesn't exist

        self.storage_fs.file__delete(payload_path)
        return dict(file_id  = file_id  ,
                    vault_id = vault_id ,
                    status   = 'deleted')

    def write_if_match(self, vault_id, file_id, match_b64, data_b64,             # Compare-and-swap: write only if current matches expected
                       write_key_hex):
        submitted_hash = self._hash_write_key(write_key_hex)
        if not self._check_vault_write_key(vault_id, submitted_hash):
            return None                                                          # Auth failure

        self._ensure_manifest(vault_id, submitted_hash)

        payload_path = self.vault_payload_path(vault_id, file_id)
        current      = self.storage_fs.file__bytes(payload_path) if self.storage_fs.file__exists(payload_path) else None
        expected     = base64.b64decode(match_b64) if match_b64 else None

        if current == expected:                                                  # Match — perform the write
            new_data = base64.b64decode(data_b64)
            self.storage_fs.file__save(payload_path, new_data)
            return dict(file_id = file_id ,
                        status  = 'ok'    )
        else:                                                                    # Mismatch — return current value
            current_b64 = base64.b64encode(current).decode('ascii') if current else None
            return dict(file_id = file_id    ,
                        status  = 'conflict' ,
                        current = current_b64)

    def list_files(self, vault_id, prefix=''):                                   # List file_ids in a vault matching prefix
        vault_folder = f'transfers/vault/{vault_id}/{prefix}' if prefix else f'transfers/vault/{vault_id}/'
        scoped_paths = self.storage_fs.folder__files__all(vault_folder)          # Scoped S3 list — only this vault's prefix
        vault_prefix = f'transfers/vault/{vault_id}/'
        result       = []
        seen         = set()

        for path in scoped_paths:
            path_str = str(path)
            if not path_str.startswith(vault_prefix):
                continue
            relative = path_str[len(vault_prefix):]                              # Strip vault prefix
            if relative == 'manifest.json':                                      # Skip manifest
                continue
            if not relative.endswith('/payload'):                                 # Only payload files
                continue
            file_id = relative[:-len('/payload')]                                # Extract file_id
            if file_id not in seen:
                seen.add(file_id)
                result.append(file_id)

        return dict(vault_id = vault_id ,
                    prefix   = prefix   ,
                    files    = result    )

    def batch(self, vault_id, operations, write_key_hex):                        # Execute batch operations (best-effort, ordered)
        submitted_hash = self._hash_write_key(write_key_hex)
        if not self._check_vault_write_key(vault_id, submitted_hash):
            return None                                                          # Auth failure

        self._ensure_manifest(vault_id, submitted_hash)

        results = []
        for op in operations:
            op_type = op.get('op')
            file_id = op.get('file_id', '')

            if op_type == 'read':
                results.append(self._batch_read(vault_id, file_id))

            elif op_type == 'write':
                data         = base64.b64decode(op['data'])
                payload_path = self.vault_payload_path(vault_id, file_id)
                self.storage_fs.file__save(payload_path, data)
                results.append(dict(op = 'write', file_id = file_id, status = 'ok'))

            elif op_type == 'write-if-match':
                match_val = op.get('match')
                data_val  = op.get('data')
                cas_result = self._cas_write(vault_id, file_id, match_val, data_val)
                results.append(cas_result)
                if cas_result['status'] == 'conflict':                           # Stop on conflict
                    break

            elif op_type == 'delete':
                payload_path = self.vault_payload_path(vault_id, file_id)
                if self.storage_fs.file__exists(payload_path):
                    self.storage_fs.file__delete(payload_path)
                    results.append(dict(op = 'delete', file_id = file_id, status = 'ok'))
                else:
                    results.append(dict(op = 'delete', file_id = file_id, status = 'not_found'))

            else:
                results.append(dict(op = op_type or 'unknown', file_id = file_id, status = 'error', detail = 'unknown operation'))
                break                                                            # Stop on unknown op

        return dict(vault_id = vault_id ,
                    results  = results  )

    def batch_read(self, vault_id, operations):                                  # Read-only batch (no auth required — data is encrypted)
        results = []
        for op in operations:
            file_id = op.get('file_id', '')
            results.append(self._batch_read(vault_id, file_id))
        return dict(vault_id = vault_id ,
                    results  = results  )

    def _batch_read(self, vault_id, file_id):                                    # Internal: read single file for batch response
        payload_path = self.vault_payload_path(vault_id, file_id)
        if not self.storage_fs.file__exists(payload_path):
            return dict(file_id = file_id, status = 'not_found')
        payload = self.storage_fs.file__bytes(payload_path)
        return dict(file_id = file_id                                ,
                    status  = 'ok'                                   ,
                    data    = base64.b64encode(payload).decode('ascii'))

    def _cas_write(self, vault_id, file_id, match_b64, data_b64):               # Internal CAS for batch use (no auth check — already validated)
        payload_path = self.vault_payload_path(vault_id, file_id)
        current      = self.storage_fs.file__bytes(payload_path) if self.storage_fs.file__exists(payload_path) else None
        expected     = base64.b64decode(match_b64) if match_b64 else None

        if current == expected:
            new_data = base64.b64decode(data_b64)
            self.storage_fs.file__save(payload_path, new_data)
            return dict(op = 'write-if-match', file_id = file_id, status = 'ok')
        else:
            current_b64 = base64.b64encode(current).decode('ascii') if current else None
            return dict(op = 'write-if-match', file_id = file_id, status = 'conflict', current = current_b64)
