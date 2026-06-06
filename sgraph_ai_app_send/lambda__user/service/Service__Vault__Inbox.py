# ===============================================================================
# SGraph Send - Vault Inbox Service
# Append-only inbox with tiered gates: append_token, enum_key, write_key
# ===============================================================================

import base64
import hashlib
import json
import secrets
import time
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append_Token     import Safe_Str__Vault__Append_Token
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Inbox__File_Id   import Safe_Str__Vault__Inbox__File_Id
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                    import (path__vault_manifest          ,
                                                                                         path__vault_tombstone         ,
                                                                                         path__vault_inbox             ,
                                                                                         path__vault_inbox_prefix      ,
                                                                                         path__vault_processed         ,
                                                                                         path__vault_processed_prefix  )

INBOX_MAX_FILES          = 1000                                                  # Per-inbox file-count cap (availability guard)
APPEND_MAX_PAYLOAD       = 5  * 1024 * 1024                                      # 5 MB per message
INBOX_DEFAULT_LIMIT      = 50
INBOX_MAX_LIMIT          = 200
INBOX_BATCH_MAX_FILE_IDS = 100                                                   # Cap per fetch/mark-processed/purge batch (DoS guard)
INLINE_CONTENT_CEILING   = 3 * 1024 * 1024                                       # 3 MB summed ciphertext for include_content


class Service__Vault__Inbox(Type_Safe):
    storage_fs      : Storage_FS = None
    _manifest_cache : dict       = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:
            self.storage_fs = Storage_FS__Memory()
        if self._manifest_cache is None:
            self._manifest_cache = {}

    def _load_manifest(self, vault_id):
        if vault_id in self._manifest_cache:
            return self._manifest_cache[vault_id]
        manifest_path = path__vault_manifest(vault_id)
        if not self.storage_fs.file__exists(manifest_path):
            tombstone_path = path__vault_tombstone(vault_id)
            if self.storage_fs.file__exists(tombstone_path):
                tombstone = self.storage_fs.file__json(tombstone_path)
                self._manifest_cache[vault_id] = tombstone
                return tombstone
            return None
        manifest = self.storage_fs.file__json(manifest_path)
        self._manifest_cache[vault_id] = manifest
        return manifest

    @staticmethod
    def _hash(value):
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _safe_token(value):                                                      # Coerce to a hex-only, traversal-proof folder name (raises on bad input)
        return Safe_Str__Vault__Append_Token(value)

    @staticmethod
    def _safe_file_id(value):                                                    # Coerce to the server's own filename format (raises on bad input)
        return Safe_Str__Vault__Inbox__File_Id(value)

    def _check_append_token(self, vault_id, presented_token):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        anchors = manifest.get('append_anchors', [])
        return self._hash(presented_token) in anchors

    def _check_enum_key(self, vault_id, presented_key):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        expected = manifest.get('enum_key_hash')
        if not expected:
            return False
        return self._hash(presented_key) == expected

    def _check_write_key(self, vault_id, write_key_hex):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        return manifest.get('write_key_hash') == self._hash(write_key_hex)

    def configure(self, vault_id, write_key_hex, append_anchors=None, enum_key_hash=None):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return None
        if manifest.get('write_key_hash') != self._hash(write_key_hex):
            return None
        if append_anchors is not None:
            manifest['append_anchors'] = append_anchors
        if enum_key_hash is not None:
            manifest['enum_key_hash'] = enum_key_hash
        manifest_path = path__vault_manifest(vault_id)
        self.storage_fs.file__save(manifest_path, json.dumps(manifest).encode())
        self._manifest_cache[vault_id] = manifest
        return dict(vault_id = vault_id, status = 'configured')

    def append(self, vault_id, append_token, payload_bytes):
        try:
            token = self._safe_token(append_token)                              # hex-only — safe as a path component (B-2)
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if not self._check_append_token(vault_id, token):
            return dict(status='gate_failed')
        if len(payload_bytes) > APPEND_MAX_PAYLOAD:
            return dict(status='payload_too_large')
        inbox_prefix = path__vault_inbox_prefix(vault_id, token)
        files        = self.storage_fs.folder__files__all(inbox_prefix)         # file-count cap only — no per-file reads (I-2)
        if len(files) >= INBOX_MAX_FILES:
            return dict(status='at_capacity')
        epoch_ms  = f'{int(time.time() * 1000):013d}'
        rand_hex  = secrets.token_hex(12)                                       # 96 bits — carries append-blindness at the ciphertext layer
        file_name = f'{epoch_ms}_{rand_hex}.enc'
        file_path = path__vault_inbox(vault_id, token, file_name)
        self.storage_fs.file__save(file_path, payload_bytes)
        return dict(status='ok')

    def inbox_list(self, vault_id, enum_key, inbox=None, after_file_id=None,
                   limit=None, include_content=False):
        if not self._check_enum_key(vault_id, enum_key):
            return dict(status='gate_failed')
        try:
            limit = INBOX_DEFAULT_LIMIT if limit is None else int(limit)        # coerce (M-4) — JSON may deliver a string
        except (ValueError, TypeError):
            return dict(status='invalid_input')
        limit = max(1, min(limit, INBOX_MAX_LIMIT))

        if inbox:                                                               # scoped to one folder
            try:
                token_folders = [str(self._safe_token(inbox))]                  # validate folder name (B-2)
            except (ValueError, Exception):
                return dict(status='invalid_input')
        else:                                                                    # enumerate all inbox folders (S3 now supported — B-1)
            vault_inbox_base = path__vault_inbox_prefix(vault_id, '')[:-1]
            subfolders       = self.storage_fs.folder__folders(vault_inbox_base)
            token_folders    = []
            for folder in subfolders:
                folder_name = str(folder).rstrip('/').rsplit('/', 1)[-1]
                if folder_name:
                    token_folders.append(folder_name)

        all_entries = []
        for token_folder in token_folders:
            prefix = path__vault_inbox_prefix(vault_id, token_folder)
            files  = self.storage_fs.folder__files__all(prefix)
            for f in files:
                path_str  = str(f)
                file_name = path_str.rsplit('/', 1)[-1]
                epoch_str = file_name.split('_')[0] if '_' in file_name else '0'
                entry     = dict(inbox    = token_folder      ,
                                 file_id  = file_name         ,
                                 received = int(epoch_str)    )                  # metadata only — no read (I-1)
                all_entries.append(entry)
        all_entries.sort(key=lambda e: e['file_id'])
        if after_file_id:
            all_entries = [e for e in all_entries if e['file_id'] > after_file_id]
        truncated = len(all_entries) > limit
        entries   = all_entries[:limit]

        if include_content:                                                      # only now do we read bytes — for the paged window only
            total = 0
            for entry in entries:
                file_path  = path__vault_inbox(vault_id, entry['inbox'], entry['file_id'])
                file_bytes = self.storage_fs.file__bytes(file_path) or b''
                entry['size']    = len(file_bytes)
                entry['content'] = base64.b64encode(file_bytes).decode('ascii')
                total += len(file_bytes)
            if total > INLINE_CONTENT_CEILING:
                return dict(status='content_too_large', entries=[], truncated=True)

        return dict(status='ok', entries=entries, truncated=truncated)

    def inbox_fetch(self, vault_id, enum_key, inbox, file_ids):
        if not self._check_enum_key(vault_id, enum_key):
            return dict(status='gate_failed')
        valid = self._validate_batch(inbox, file_ids)
        if valid is None:
            return dict(status='invalid_input')
        token, safe_ids = valid
        files   = []
        missing = []
        for file_id in safe_ids:
            file_path = path__vault_inbox(vault_id, token, file_id)
            if self.storage_fs.file__exists(file_path):
                file_bytes = self.storage_fs.file__bytes(file_path)
                files.append(dict(file_id = file_id,
                                  size    = len(file_bytes),
                                  content = base64.b64encode(file_bytes).decode('ascii')))
            else:
                missing.append(file_id)
        return dict(status='ok', files=files, missing=missing)

    def mark_processed(self, vault_id, enum_key, inbox, file_ids):
        if not self._check_enum_key(vault_id, enum_key):
            return dict(status='gate_failed')
        valid = self._validate_batch(inbox, file_ids)
        if valid is None:
            return dict(status='invalid_input')
        token, safe_ids = valid
        moved   = []
        missing = []
        for file_id in safe_ids:
            src = path__vault_inbox(vault_id, token, file_id)
            dst = path__vault_processed(vault_id, token, file_id)
            if self.storage_fs.file__exists(src):
                file_bytes = self.storage_fs.file__bytes(src)
                self.storage_fs.file__save(dst, file_bytes)
                self.storage_fs.file__delete(src)
                moved.append(file_id)
            else:
                missing.append(file_id)
        return dict(status='ok', moved=moved, missing=missing)

    def purge(self, vault_id, write_key_hex, folder, inbox, file_ids=None):
        if not self._check_write_key(vault_id, write_key_hex):
            return dict(status='gate_failed')
        try:
            token = str(self._safe_token(inbox))                                # validate folder name (B-2)
        except (ValueError, Exception):
            return dict(status='invalid_input')
        purged  = []
        missing = []
        if folder == 'processed' and not file_ids:                              # bulk purge all processed (brief 01 §3.5)
            prefix = path__vault_processed_prefix(vault_id, token)
            files  = self.storage_fs.folder__files__all(prefix)
            for f in files:
                path_str  = str(f)
                file_name = path_str.rsplit('/', 1)[-1]
                self.storage_fs.file__delete(path_str)
                purged.append(file_name)
            return dict(status='ok', purged=purged, missing=missing)
        if not file_ids:
            return dict(status='ok', purged=purged, missing=missing)
        if len(file_ids) > INBOX_BATCH_MAX_FILE_IDS:                            # DoS guard (I-3)
            return dict(status='invalid_input')
        for raw_id in file_ids:
            try:
                file_id = str(self._safe_file_id(raw_id))                       # validate file id (B-2)
            except (ValueError, Exception):
                return dict(status='invalid_input')
            if folder == 'inbox':
                path = path__vault_inbox(vault_id, token, file_id)
            else:
                path = path__vault_processed(vault_id, token, file_id)
            if self.storage_fs.file__exists(path):
                self.storage_fs.file__delete(path)
                purged.append(file_id)
            else:
                missing.append(file_id)
        return dict(status='ok', purged=purged, missing=missing)

    def _validate_batch(self, inbox, file_ids):                                  # Returns (token, [file_ids]) or None if any input is malformed / over cap
        if not file_ids or len(file_ids) > INBOX_BATCH_MAX_FILE_IDS:            # DoS guard (I-3)
            return None
        try:
            token    = str(self._safe_token(inbox))                             # validate folder name (B-2)
            safe_ids = [str(self._safe_file_id(fid)) for fid in file_ids]       # validate each file id (B-2)
        except (ValueError, Exception):
            return None
        return token, safe_ids
