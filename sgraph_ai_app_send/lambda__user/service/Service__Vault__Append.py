import base64
import hashlib
import json
import re
import secrets
import time
from   memory_fs.storage_fs.Storage_FS                                           import Storage_FS
from   memory_fs.storage_fs.providers.Storage_FS__Memory                         import Storage_FS__Memory
from   osbot_utils.type_safe.Type_Safe                                           import Type_Safe
from   osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append_Token     import Safe_Str__Vault__Append_Token
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append__File_Id  import Safe_Str__Vault__Append__File_Id, TYPE_SAFE_STR__VAULT__APPEND__FILE_ID__REGEX
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append_Token     import TYPE_SAFE_STR__VAULT__APPEND_TOKEN__REGEX
from   sgraph_ai_app_send.lambda__user.storage.Storage__Append__Listing          import Storage__Append__Listing
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                    import (path__vault_manifest               ,
                                                                                         path__vault_tombstone              ,
                                                                                         path__vault_append_base            ,
                                                                                         path__vault_append_config          ,
                                                                                         path__vault_append_pending         ,
                                                                                         path__vault_append_pending_prefix  ,
                                                                                         path__vault_append_processed       ,
                                                                                         path__vault_append_processed_prefix)

APPEND_MAX_FILES          = 1000
APPEND_MAX_PAYLOAD        = 5  * 1024 * 1024
APPEND_DEFAULT_LIMIT      = 50
APPEND_MAX_LIMIT          = 200
APPEND_BATCH_MAX_FILE_IDS = 100
INLINE_CONTENT_CEILING    = 3 * 1024 * 1024
FETCH_CONTENT_CEILING     = 5_500_000                                           # base64 bytes per fetch response: stays under Lambda's 6 MB response cap with the JSON around it
LAMBDA_MAX_INLINE_PAYLOAD = 4_400_000                                           # raw bytes that still fit Lambda's 6 MB request once base64-encoded inside JSON
APPEND_CONFIG_TTL_DEFAULT = 30                                                  # seconds a warm instance trusts its cached config/manifest (revocation horizon)
APPEND_CONFIG_TTL_MAX     = 300
APPEND_FEATURES           = ('limits', 'fetch-deferred', 'configure-creates-vault')
AFTER_FILE_ID_REGEX       = re.compile(r'^[0-9]{1,13}(_[0-9a-f]{0,24}(\.enc)?)?\Z') # a file id or a prefix of one: anything else never reaches a storage cursor


class Service__Vault__Append(Type_Safe):
    storage_fs        : Storage_FS               = None
    cache_ttl_seconds : int                      = APPEND_CONFIG_TTL_DEFAULT
    fast_listing      : bool                     = True                         # False = the pre-v2 listing code, kept one release as a switch back
    on_lambda         : bool                     = False                        # True on Lambda: limits() reports the transport ceiling
    listing           : Storage__Append__Listing = None
    _manifest_cache   : dict                     = None
    _config_cache     : dict                     = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:
            self.storage_fs = Storage_FS__Memory()
        if self.listing is None:
            self.listing = Storage__Append__Listing(storage_fs=self.storage_fs)
        if self._manifest_cache is None:
            self._manifest_cache = {}
        if self._config_cache is None:
            self._config_cache = {}
        self.cache_ttl_seconds = max(0, min(self.cache_ttl_seconds, APPEND_CONFIG_TTL_MAX))

    # --- caches (per warm instance, bounded by cache_ttl_seconds) ------------------
    # Without the TTL a revoked token, rotated enum key or deleted vault stayed valid
    # on every other warm Lambda until AWS recycled it.

    def _cache_get(self, cache, key):
        entry = cache.get(key)
        if entry is None:
            return None
        value, loaded_at = entry
        if time.monotonic() - loaded_at >= self.cache_ttl_seconds:
            cache.pop(key, None)
            return None
        return value

    @staticmethod
    def _cache_put(cache, key, value):
        cache[key] = (value, time.monotonic())
        return value

    def _load_manifest(self, vault_id):
        cached = self._cache_get(self._manifest_cache, vault_id)
        if cached is not None:
            return cached
        manifest_path = path__vault_manifest(vault_id)
        if not self.storage_fs.file__exists(manifest_path):
            tombstone_path = path__vault_tombstone(vault_id)
            if self.storage_fs.file__exists(tombstone_path):
                tombstone = self.storage_fs.file__json(tombstone_path)
                return self._cache_put(self._manifest_cache, vault_id, tombstone)
            return None
        manifest = self.storage_fs.file__json(manifest_path)
        return self._cache_put(self._manifest_cache, vault_id, manifest)

    def _load_append_config(self, vault_id):
        cached = self._cache_get(self._config_cache, vault_id)
        if cached is not None:
            return cached
        config_path = path__vault_append_config(vault_id)
        if not self.storage_fs.file__exists(config_path):
            return {}
        config = self.storage_fs.file__json(config_path)
        return self._cache_put(self._config_cache, vault_id, config)

    @staticmethod
    def _hash(value):
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _safe_token(value):
        if not isinstance(value, str):
            raise ValueError('append token must be a string')
        return Safe_Str__Vault__Append_Token(value)

    @staticmethod
    def _safe_file_id(value):
        if not isinstance(value, str):
            raise ValueError('file id must be a string')
        return Safe_Str__Vault__Append__File_Id(value)

    def _check_append_token(self, vault_id, presented_token):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        config  = self._load_append_config(vault_id)
        anchors = config.get('append_anchors', [])
        return self._hash(presented_token) in anchors

    def _check_enum_key(self, vault_id, presented_key):
        if not isinstance(presented_key, str) or not presented_key:
            return False
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        config   = self._load_append_config(vault_id)
        expected = config.get('enum_key_hash')
        if not expected:
            return False
        return self._hash(presented_key) == expected

    def _check_write_key(self, vault_id, write_key_hex):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        return manifest.get('write_key_hash') == self._hash(write_key_hex)

    def _create_manifest(self, vault_id, write_key_hex):                         # same first-write rule as Service__Vault__Pointer._ensure_manifest
        manifest = dict(vault_id       = vault_id                 ,
                        write_key_hash = self._hash(write_key_hex),
                        created_at     = Timestamp_Now()          )
        self.storage_fs.file__save(path__vault_manifest(vault_id), json.dumps(manifest).encode())
        return self._cache_put(self._manifest_cache, vault_id, manifest)

    def configure(self, vault_id, write_key_hex, append_anchors=None, enum_key_hash=None):
        if append_anchors is not None:
            if not isinstance(append_anchors, list) or not all(isinstance(anchor, str) for anchor in append_anchors):
                return dict(status='invalid_input')
        if enum_key_hash is not None and not isinstance(enum_key_hash, str):
            return dict(status='invalid_input')
        manifest = self._load_manifest(vault_id)
        if manifest is None:                                                     # no commit pushed yet: configure claims the vault id, as the first vault write would
            manifest = self._create_manifest(vault_id, write_key_hex)            # (a tombstoned vault is never re-created: _load_manifest returns the tombstone)
        if manifest.get('status') == 'deleted':
            return None
        if manifest.get('write_key_hash') != self._hash(write_key_hex):
            return None
        config_path = path__vault_append_config(vault_id)
        if self.storage_fs.file__exists(config_path):
            config = self.storage_fs.file__json(config_path)
        else:
            config = {}
        if append_anchors is not None:
            config['append_anchors'] = append_anchors
        if enum_key_hash is not None:
            config['enum_key_hash'] = enum_key_hash
        self.storage_fs.file__save(config_path, json.dumps(config).encode())
        self._cache_put(self._config_cache, vault_id, config)
        return dict(vault_id = vault_id, status = 'configured')

    def append(self, vault_id, append_token, payload_bytes):
        try:
            token = self._safe_token(append_token)
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if not self._check_append_token(vault_id, token):
            return dict(status='gate_failed')
        if len(payload_bytes) > APPEND_MAX_PAYLOAD:
            return dict(status='payload_too_large', limit=APPEND_MAX_PAYLOAD, received=len(payload_bytes))
        pending_prefix = path__vault_append_pending_prefix(vault_id, token)
        if self.listing.count_up_to(pending_prefix, APPEND_MAX_FILES) >= APPEND_MAX_FILES:  # stops listing at the limit
            return dict(status='at_capacity')
        epoch_ms  = f'{int(time.time() * 1000):013d}'
        rand_hex  = secrets.token_hex(12)
        file_name = f'{epoch_ms}_{rand_hex}.enc'
        file_path = path__vault_append_pending(vault_id, token, file_name)
        self.storage_fs.file__save(file_path, payload_bytes)
        return dict(status='ok')

    def limits(self):                                                            # public, input-free: nothing here depends on a vault or lane
        max_inline = min(APPEND_MAX_PAYLOAD, LAMBDA_MAX_INLINE_PAYLOAD) if self.on_lambda else APPEND_MAX_PAYLOAD
        return dict(max_inline_payload     = max_inline                 ,
                    max_pending            = APPEND_MAX_FILES           ,
                    max_batch_ids          = APPEND_BATCH_MAX_FILE_IDS  ,
                    list_page_default      = APPEND_DEFAULT_LIMIT       ,
                    list_page_max          = APPEND_MAX_LIMIT           ,
                    inline_content_ceiling = INLINE_CONTENT_CEILING     ,
                    fetch_content_ceiling  = FETCH_CONTENT_CEILING      ,
                    config_ttl_seconds     = self.cache_ttl_seconds     ,
                    now_ms                 = int(time.time() * 1000)    ,
                    features               = list(APPEND_FEATURES)      )

    # --- list ------------------------------------------------------------------------

    @staticmethod
    def _parse_limit(limit):
        if limit is None:
            return APPEND_DEFAULT_LIMIT
        if isinstance(limit, bool):
            return None
        if isinstance(limit, int):
            value = limit
        elif isinstance(limit, str) and re.fullmatch(r'[0-9]{1,6}', limit):     # clients that send "50"
            value = int(limit)
        else:
            return None
        return max(1, min(value, APPEND_MAX_LIMIT))

    def _lane_names(self, vault_id):
        append_base = path__vault_append_base(vault_id)
        return [name for name in self.listing.subfolder_names(append_base)
                if TYPE_SAFE_STR__VAULT__APPEND_TOKEN__REGEX.match(name)]       # skip anything that is not a lane (keys written through the raw vault API)

    @staticmethod
    def _entry(lane, file_name):
        return dict(inbox    = lane                              ,              # the lane's folder name: the raw append token
                    file_id  = file_name                         ,
                    received = int(file_name.split('_', 1)[0])   )

    def list_entries(self, vault_id, enum_key, inbox=None, after_file_id=None,
                     limit=None, include_content=False):
        if not self._check_enum_key(vault_id, enum_key):
            return dict(status='gate_failed')
        limit = self._parse_limit(limit)
        if limit is None:
            return dict(status='invalid_input')
        if after_file_id == '':
            after_file_id = None
        if after_file_id is not None and (not isinstance(after_file_id, str) or not AFTER_FILE_ID_REGEX.match(after_file_id)):
            return dict(status='invalid_input')
        if include_content is None:
            include_content = False
        if not isinstance(include_content, bool):
            return dict(status='invalid_input')

        if inbox:
            try:
                token_folders = [str(self._safe_token(inbox))]
            except (ValueError, Exception):
                return dict(status='invalid_input')
        elif self.fast_listing:
            token_folders = self._lane_names(vault_id)
        else:
            token_folders = self._lane_names__legacy(vault_id)

        if self.fast_listing:
            entries, truncated = self._list_page(vault_id, token_folders, after_file_id, limit)
        else:
            entries, truncated = self._list_page__legacy(vault_id, token_folders, after_file_id, limit)

        if include_content:
            total = 0
            for entry in entries:
                file_path  = path__vault_append_pending(vault_id, entry['inbox'], entry['file_id'])
                file_bytes = self.storage_fs.file__bytes(file_path) or b''
                total += len(file_bytes)
                if total > INLINE_CONTENT_CEILING:
                    return dict(status='content_too_large', entries=[], truncated=True)
                entry['size']    = len(file_bytes)
                entry['content'] = base64.b64encode(file_bytes).decode('ascii')

        return dict(status='ok', entries=entries, truncated=truncated)

    def _list_page(self, vault_id, token_folders, after_file_id, limit):        # each lane reads only its next limit+1 names; merged, the result equals the full sort
        entries = []
        for token_folder in token_folders:
            prefix = path__vault_append_pending_prefix(vault_id, token_folder)
            for file_name in self.listing.page(prefix, start_after=after_file_id, max_keys=limit + 1):
                if TYPE_SAFE_STR__VAULT__APPEND__FILE_ID__REGEX.match(file_name):
                    entries.append(self._entry(token_folder, file_name))
        entries.sort(key=lambda e: e['file_id'])
        return entries[:limit], len(entries) > limit

    def _lane_names__legacy(self, vault_id):                                     # pre-v2: walks every key under bare/append/, processed/ included
        append_base   = path__vault_append_base(vault_id)
        token_folders = []
        for folder in self.storage_fs.folder__folders(append_base):
            folder_name = str(folder).rstrip('/').rsplit('/', 1)[-1]
            if folder_name and folder_name != 'config.json':
                token_folders.append(folder_name)
        return token_folders

    def _list_page__legacy(self, vault_id, token_folders, after_file_id, limit):  # pre-v2: lists and sorts every pending entry on every page
        all_entries = []
        for token_folder in token_folders:
            prefix = path__vault_append_pending_prefix(vault_id, token_folder)
            for f in self.storage_fs.folder__files__all(prefix):
                file_name = str(f).rsplit('/', 1)[-1]
                epoch_str = file_name.split('_')[0] if '_' in file_name else '0'
                all_entries.append(dict(inbox    = token_folder ,
                                        file_id  = file_name    ,
                                        received = int(epoch_str)))
        all_entries.sort(key=lambda e: e['file_id'])
        if after_file_id:
            all_entries = [e for e in all_entries if e['file_id'] > after_file_id]
        return all_entries[:limit], len(all_entries) > limit

    # --- fetch / mark / purge ----------------------------------------------------------

    def fetch(self, vault_id, enum_key, inbox, file_ids):
        if not self._check_enum_key(vault_id, enum_key):
            return dict(status='gate_failed')
        valid = self._validate_batch(inbox, file_ids)
        if valid is None:
            return dict(status='invalid_input')
        token, safe_ids = valid
        files         = []
        missing       = []
        deferred      = []
        encoded_total = 0
        for file_id in safe_ids:
            if deferred:                                                         # past the ceiling: the rest are deferred unread
                deferred.append(file_id)
                continue
            file_bytes = self.storage_fs.file__bytes(path__vault_append_pending(vault_id, token, file_id))
            if file_bytes is None:
                missing.append(file_id)
                continue
            encoded_size = 4 * ((len(file_bytes) + 2) // 3)
            if files and encoded_total + encoded_size > FETCH_CONTENT_CEILING:   # the first entry is always returned, so a reader always makes progress
                deferred.append(file_id)
                continue
            encoded_total += encoded_size
            files.append(dict(file_id = file_id,
                              size    = len(file_bytes),
                              content = base64.b64encode(file_bytes).decode('ascii')))
        return dict(status='ok', files=files, missing=missing, deferred=deferred)

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
            src = path__vault_append_pending(vault_id, token, file_id)
            dst = path__vault_append_processed(vault_id, token, file_id)
            if self.storage_fs.file__exists(src):
                self.listing.copy(src, dst)                                      # server-side CopyObject on S3
                self.storage_fs.file__delete(src)
                moved.append(file_id)
            else:
                missing.append(file_id)
        return dict(status='ok', moved=moved, missing=missing)

    def purge(self, vault_id, write_key_hex, folder, inbox, file_ids=None):
        if not self._check_write_key(vault_id, write_key_hex):
            return dict(status='gate_failed')
        if folder not in ('pending', 'processed'):
            return dict(status='invalid_input')
        try:
            token = str(self._safe_token(inbox))
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if file_ids is not None and not isinstance(file_ids, list):
            return dict(status='invalid_input')
        purged  = []
        missing = []
        if folder == 'processed' and not file_ids:
            prefix = path__vault_append_processed_prefix(vault_id, token)
            files  = self.storage_fs.folder__files__all(prefix)
            for f in files:
                path_str  = str(f)
                file_name = path_str.rsplit('/', 1)[-1]
                self.storage_fs.file__delete(path_str)
                purged.append(file_name)
            return dict(status='ok', purged=purged, missing=missing)
        if not file_ids:
            return dict(status='ok', purged=purged, missing=missing)
        if len(file_ids) > APPEND_BATCH_MAX_FILE_IDS:
            return dict(status='invalid_input')
        for raw_id in file_ids:
            try:
                file_id = str(self._safe_file_id(raw_id))
            except (ValueError, Exception):
                return dict(status='invalid_input')
            if folder == 'pending':
                path = path__vault_append_pending(vault_id, token, file_id)
            else:
                path = path__vault_append_processed(vault_id, token, file_id)
            if self.storage_fs.file__exists(path):
                self.storage_fs.file__delete(path)
                purged.append(file_id)
            else:
                missing.append(file_id)
        return dict(status='ok', purged=purged, missing=missing)

    def _validate_batch(self, inbox, file_ids):
        if not isinstance(file_ids, list) or not file_ids or len(file_ids) > APPEND_BATCH_MAX_FILE_IDS:
            return None
        try:
            token    = str(self._safe_token(inbox))
            safe_ids = [str(self._safe_file_id(fid)) for fid in file_ids]
        except (ValueError, Exception):
            return None
        return token, safe_ids
