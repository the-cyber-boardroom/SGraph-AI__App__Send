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
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append__Blob_Id  import Safe_Str__Vault__Append__Blob_Id, TYPE_SAFE_STR__VAULT__APPEND__BLOB_ID__REGEX
from   sgraph_ai_app_send.lambda__user.service.Vault__Append__Config             import (Vault__Append__Config, Vault__Append__Config__Error,
                                                                                         APPEND_RETENTION_CLASSES, BLOB_RETENTION_CHOICES)
from   sgraph_ai_app_send.lambda__user.storage.Storage__Append__Listing          import Storage__Append__Listing
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                    import (path__vault_manifest               ,
                                                                                         path__vault_tombstone              ,
                                                                                         path__vault_append_base            ,
                                                                                         path__vault_append_config          ,
                                                                                         path__vault_append_pending         ,
                                                                                         path__vault_append_pending_prefix  ,
                                                                                         path__vault_append_processed       ,
                                                                                         path__vault_append_processed_prefix,
                                                                                         path__vault_append_blob            ,
                                                                                         path__vault_append_blobs_prefix    ,
                                                                                         path__vault_append_blob_reservation)

APPEND_MAX_FILES          = 1000                                                # default hard limit (a lane with no settings behaves as before)
APPEND_MAX_PAYLOAD        = 5  * 1024 * 1024
APPEND_DEFAULT_LIMIT      = 50
APPEND_MAX_LIMIT          = 200
APPEND_BATCH_MAX_FILE_IDS = 100
INLINE_CONTENT_CEILING    = 3 * 1024 * 1024
FETCH_CONTENT_CEILING     = 5_500_000                                           # base64 bytes per fetch response: stays under Lambda's 6 MB response cap with the JSON around it
LAMBDA_MAX_INLINE_PAYLOAD = 4_400_000                                           # raw bytes that still fit Lambda's 6 MB request once base64-encoded inside JSON
APPEND_CONFIG_TTL_DEFAULT = 30                                                  # seconds a warm instance trusts its cached config/manifest (revocation horizon)
APPEND_CONFIG_TTL_MAX     = 300
COUNT_CACHE_TTL           = 5                                                   # seconds a warm instance trusts its pending count, and only far from the hard limit
STATS_CACHE_TTL           = 30
PROCESSED_COUNT_CAP       = 10_000
RETENTION_SWEEP_MAX       = 100                                                 # memory/disk: expired processed entries removed per access
CONFIGURE_CAS_ATTEMPTS    = 3
APPEND_FEATURES           = ('limits', 'fetch-deferred', 'configure-creates-vault', 'list-processed', 'unmark',
                             'stats', 'lane-limits', 'scoped-read-keys', 'retention', 'configure-merge', 'blobs')
BLOB_PUT_EXPIRY           = 300                                                 # seconds a presigned PUT is valid (AS-2)
BLOB_GET_EXPIRY           = 300
BLOB_RESERVATION_TTL_MS   = (BLOB_PUT_EXPIRY + 60) * 1000                       # a reservation outlives its URL by a minute of clock skew
BLOB_RESERVATION_TAGS     = {'sg-retention': '1d'}                              # S3 backstop for reservations nobody lists again
MAX_BLOBS_PER_LANE        = 5_000
MAX_BLOB_RESERVATIONS     = 100                                                 # outstanding upload URLs per lane
BLOB_EXPIRED_SWEEP_MAX    = 20                                                  # expired reservations removed per listing
RESERVED_PREFIX           = '.reserved/'
RESERVATION_NAME_REGEX    = re.compile(r'^([0-9]{13})_([0-9]{1,12})_([0-9a-f]{64})\Z')
AFTER_FILE_ID_REGEX       = re.compile(r'^[0-9]{1,13}(_[0-9a-f]{0,24}(\.enc)?)?\Z') # a file id or a prefix of one: anything else never reaches a storage cursor
FOLDERS                   = {'pending'  : (path__vault_append_pending  , path__vault_append_pending_prefix  ),
                             'processed': (path__vault_append_processed, path__vault_append_processed_prefix)}


class Service__Vault__Append(Type_Safe):
    storage_fs        : Storage_FS               = None
    cache_ttl_seconds : int                      = APPEND_CONFIG_TTL_DEFAULT
    fast_listing      : bool                     = True                         # False = the pre-v2 listing code, kept one release as a switch back
    on_lambda         : bool                     = False                        # True on Lambda: limits() reports the transport ceiling
    listing           : Storage__Append__Listing = None
    config_rules      : Vault__Append__Config    = None
    _manifest_cache   : dict                     = None
    _config_cache     : dict                     = None
    _count_cache      : dict                     = None
    _stats_cache      : dict                     = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.storage_fs is None:
            self.storage_fs = Storage_FS__Memory()
        if self.listing is None:
            self.listing = Storage__Append__Listing(storage_fs=self.storage_fs)
        if self.config_rules is None:
            self.config_rules = Vault__Append__Config()
        for cache in ('_manifest_cache', '_config_cache', '_count_cache', '_stats_cache'):
            if getattr(self, cache) is None:
                setattr(self, cache, {})
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

    # --- gates -----------------------------------------------------------------------

    def _vault_live(self, vault_id):
        manifest = self._load_manifest(vault_id)
        return manifest is not None and manifest.get('status') != 'deleted'

    def _check_append_token(self, vault_id, presented_token):
        if not self._vault_live(vault_id):
            return False
        config  = self._load_append_config(vault_id)
        anchors = config.get('append_anchors', [])
        return self._hash(presented_token) in anchors

    def _enum_scope(self, vault_id, presented_key):                              # "*", a set of sha256(token), or None: which lanes this read key may touch
        if not isinstance(presented_key, str) or not presented_key:
            return None
        if not self._vault_live(vault_id):
            return None
        return self.config_rules.enum_scope(self._load_append_config(vault_id), self._hash(presented_key))

    def _check_enum_key(self, vault_id, presented_key):                          # any lane at all (kept for callers that only need yes/no)
        return self._enum_scope(vault_id, presented_key) is not None

    def _lane_in_scope(self, scope, token):
        return scope == '*' or (scope is not None and self._hash(str(token)) in scope)

    def _check_write_key(self, vault_id, write_key_hex):
        manifest = self._load_manifest(vault_id)
        if manifest is None or manifest.get('status') == 'deleted':
            return False
        return manifest.get('write_key_hash') == self._hash(write_key_hex)

    def _lane_settings(self, vault_id, token):
        return self.config_rules.lane_settings(self._load_append_config(vault_id), self._hash(str(token)))

    @staticmethod
    def _mode_supported(settings):                                               # fail closed: a mode this build does not know (a later phase's "signed") refuses writes
        return settings.get('mode') in (None, 'token')

    # --- configure -------------------------------------------------------------------

    def _create_manifest(self, vault_id, write_key_hex):                         # same first-write rule as Service__Vault__Pointer._ensure_manifest
        manifest = dict(vault_id       = vault_id                 ,
                        write_key_hash = self._hash(write_key_hex),
                        created_at     = Timestamp_Now()          )
        self.storage_fs.file__save(path__vault_manifest(vault_id), json.dumps(manifest).encode())
        return self._cache_put(self._manifest_cache, vault_id, manifest)

    def configure(self, vault_id, write_key_hex, append_anchors=None, enum_key_hash=None, **fields):
        request = dict(fields)                                                   # every field is merged, never replaced wholesale (except append_anchors, as before)
        if append_anchors is not None:
            request['append_anchors'] = append_anchors
        if enum_key_hash is not None:
            request['enum_key_hash'] = enum_key_hash
        return self.configure_request(vault_id, write_key_hex, request)

    def configure_request(self, vault_id, write_key_hex, request):               # the HTTP body as a dict: never splatted into kwargs (a "vault_id" key must be a 400, not a TypeError)
        if not isinstance(request, dict):
            return dict(status='invalid_input', detail='configure body must be an object')
        try:
            self.config_rules.merge({}, request, cross_checks=False)             # types, ranges, shapes: before anything is created or read
        except Vault__Append__Config__Error as error:
            return dict(status='invalid_input', detail=str(error))
        manifest = self._load_manifest(vault_id)
        if manifest is None:                                                     # no commit pushed yet: configure claims the vault id, as the first vault write would
            manifest = self._create_manifest(vault_id, write_key_hex)            # (a tombstoned vault is never re-created: _load_manifest returns the tombstone)
        if manifest.get('status') == 'deleted':
            return None
        if manifest.get('write_key_hash') != self._hash(write_key_hex):
            return None
        config_path = path__vault_append_config(vault_id)
        for _ in range(CONFIGURE_CAS_ATTEMPTS):                                  # read-merge-write with If-Match: concurrent owners never lose each other's changes
            raw, version = self.listing.read_versioned(config_path)
            try:
                current = json.loads(raw) if raw else {}
            except ValueError:
                current = None
            if not isinstance(current, dict):                                    # unreadable config: the owner (write key) replaces it, still under the version check
                current = {}
            try:
                new, ignored = self.config_rules.merge(current, request)
            except Vault__Append__Config__Error as error:
                return dict(status='invalid_input', detail=str(error))
            if self.listing.write_if_version(config_path, json.dumps(new).encode(), version):
                self._cache_put(self._config_cache, vault_id, new)
                self._count_cache.clear()
                self._stats_cache.clear()
                result = dict(vault_id = vault_id, status = 'configured')
                if ignored:
                    result['ignored'] = ignored
                return result
        return dict(status='conflict')

    # --- write -----------------------------------------------------------------------

    def _max_inline(self):
        return min(APPEND_MAX_PAYLOAD, LAMBDA_MAX_INLINE_PAYLOAD) if self.on_lambda else APPEND_MAX_PAYLOAD

    def _lane_has_room(self, vault_id, token, settings, payload_size):          # exact near the limit, cached (5 s) far from it; the byte check reveals one bit
        hard   = settings['hard_pending']
        budget = self.config_rules.lane_budget(settings)                         # None for a lane with no budget and no blobs (Phase 2 behaviour)
        margin = max(100, hard // 10)
        key    = (vault_id, str(token))
        entry  = self._count_cache.get(key)
        now    = time.monotonic()
        fresh  = (entry is not None and now - entry['at'] < COUNT_CACHE_TTL
                  and entry['count'] + entry['accepted'] < hard - margin
                  and (budget is None or entry['bytes'] + entry['accepted_bytes'] + self._max_inline() <= budget - self._max_inline()))
        if not fresh:
            prefix = path__vault_append_pending_prefix(vault_id, token)
            if budget is None:
                entry = dict(count=self.listing.count_up_to(prefix, hard), bytes=0)
            else:
                usage = self.listing.usage(prefix, hard)
                entry = dict(count=usage['count'], bytes=usage['bytes'])
                if settings.get('blobs'):                                        # one budget for the lane: entries, blobs and outstanding reservations
                    blobs = self._blob_usage(vault_id, self._hash(str(token)))
                    entry['bytes'] += blobs['blob_bytes'] + blobs['reserved_bytes']
            entry.update(at=now, accepted=0, accepted_bytes=0)
            self._count_cache[key] = entry
        if entry['count'] + entry['accepted'] >= hard:
            return False
        if budget is not None and entry['bytes'] + entry['accepted_bytes'] + self._max_inline() > budget:   # fixed condition: independent of this payload's size
            return False
        entry['accepted']       += 1
        entry['accepted_bytes'] += payload_size
        return True

    def append(self, vault_id, append_token, payload_bytes):
        try:
            token = self._safe_token(append_token)
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if not self._check_append_token(vault_id, token):
            return dict(status='gate_failed')
        settings = self._lane_settings(vault_id, token)
        if not self._mode_supported(settings):
            return dict(status='lane_mode_unsupported')
        if len(payload_bytes) > APPEND_MAX_PAYLOAD:
            return dict(status='payload_too_large', limit=APPEND_MAX_PAYLOAD, received=len(payload_bytes))
        if not self._lane_has_room(vault_id, token, settings, len(payload_bytes)):
            return dict(status='at_capacity')
        epoch_ms  = f'{int(time.time() * 1000):013d}'
        rand_hex  = secrets.token_hex(12)
        file_name = f'{epoch_ms}_{rand_hex}.enc'
        file_path = path__vault_append_pending(vault_id, token, file_name)
        self.storage_fs.file__save(file_path, payload_bytes)
        return dict(status='ok')

    def limits(self):                                                            # public, input-free: nothing here depends on a vault or lane
        return dict(max_inline_payload       = self._max_inline()             ,
                    max_pending              = APPEND_MAX_FILES               ,      # the default hard limit; lanes may set their own up to the ceiling
                    max_batch_ids            = APPEND_BATCH_MAX_FILE_IDS      ,
                    list_page_default        = APPEND_DEFAULT_LIMIT           ,
                    list_page_max            = APPEND_MAX_LIMIT               ,
                    inline_content_ceiling   = INLINE_CONTENT_CEILING         ,
                    fetch_content_ceiling    = FETCH_CONTENT_CEILING          ,
                    token_lane_hard_ceiling  = self.config_rules.hard_ceiling ,
                    token_lane_bytes_ceiling = self.config_rules.bytes_ceiling,
                    retention_classes        = list(APPEND_RETENTION_CLASSES) ,
                    token_lane_blob_ceiling  = self.config_rules.blob_ceiling ,
                    blob_retention_choices   = list(BLOB_RETENTION_CHOICES)   ,
                    blob_put_expiry          = BLOB_PUT_EXPIRY                ,
                    blob_get_expiry          = BLOB_GET_EXPIRY                ,
                    presigned_blobs          = self.listing.can_presign()     ,      # False on memory/disk: blob-upload and blob-url answer 501
                    config_ttl_seconds       = self.cache_ttl_seconds         ,
                    now_ms                   = int(time.time() * 1000)        ,
                    features                 = list(APPEND_FEATURES)          )

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
                     limit=None, include_content=False, folder='pending'):
        scope = self._enum_scope(vault_id, enum_key)
        if scope is None:
            return dict(status='gate_failed')
        if folder is None:
            folder = 'pending'
        if not isinstance(folder, str) or folder not in FOLDERS:                 # a list/dict is unhashable: check the type before the lookup
            return dict(status='invalid_input')
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
            if not self._lane_in_scope(scope, token_folders[0]):
                return dict(status='gate_failed')
        elif self.fast_listing:
            token_folders = [lane for lane in self._lane_names(vault_id) if self._lane_in_scope(scope, lane)]
        else:
            token_folders = [lane for lane in self._lane_names__legacy(vault_id) if self._lane_in_scope(scope, lane)]

        if folder == 'processed':
            for token_folder in token_folders:
                self._sweep_processed(vault_id, token_folder)

        path_of, prefix_of = FOLDERS[folder]
        if self.fast_listing:
            entries, truncated = self._list_page(vault_id, token_folders, after_file_id, limit, prefix_of)
        else:
            entries, truncated = self._list_page__legacy(vault_id, token_folders, after_file_id, limit, prefix_of)

        if include_content:
            total = 0
            for entry in entries:
                file_bytes = self.storage_fs.file__bytes(path_of(vault_id, entry['inbox'], entry['file_id'])) or b''
                total += len(file_bytes)
                if total > INLINE_CONTENT_CEILING:
                    return dict(status='content_too_large', entries=[], truncated=True)
                entry['size']    = len(file_bytes)
                entry['content'] = base64.b64encode(file_bytes).decode('ascii')

        return dict(status='ok', entries=entries, truncated=truncated)

    def _list_page(self, vault_id, token_folders, after_file_id, limit, prefix_of=path__vault_append_pending_prefix):   # each lane reads only its next limit+1 names
        entries = []
        for token_folder in token_folders:
            prefix = prefix_of(vault_id, token_folder)
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

    def _list_page__legacy(self, vault_id, token_folders, after_file_id, limit, prefix_of=path__vault_append_pending_prefix):  # pre-v2: lists and sorts every entry on every page
        all_entries = []
        for token_folder in token_folders:
            prefix = prefix_of(vault_id, token_folder)
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

    # --- retention -----------------------------------------------------------------------

    def _retention_tags(self, settings):                                         # S3: the lifecycle rule for this class deletes the object; values come from a fixed set
        days = settings.get('retention_days')
        return {'sg-retention': f'{days}d'} if days in APPEND_RETENTION_CLASSES else None

    def _sweep_processed(self, vault_id, token):                                 # memory/disk only (no object tags): remove up to RETENTION_SWEEP_MAX expired entries
        if self.listing.is_s3():
            return 0
        days = self._lane_settings(vault_id, token).get('retention_days')
        if days not in APPEND_RETENTION_CLASSES:
            return 0
        cutoff_ms = int(time.time() * 1000) - days * 86_400_000
        removed   = 0
        for file_name in self.listing.page(path__vault_append_processed_prefix(vault_id, token), max_keys=RETENTION_SWEEP_MAX):
            if not TYPE_SAFE_STR__VAULT__APPEND__FILE_ID__REGEX.match(file_name) or int(file_name.split('_', 1)[0]) >= cutoff_ms:
                break                                                            # names sort by time: the first young one ends the sweep
            self.storage_fs.file__delete(path__vault_append_processed(vault_id, token, file_name))
            removed += 1
        return removed

    # --- fetch / mark / unmark / purge -------------------------------------------------

    def fetch(self, vault_id, enum_key, inbox, file_ids):
        scope = self._enum_scope(vault_id, enum_key)
        if scope is None:
            return dict(status='gate_failed')
        valid = self._validate_batch(inbox, file_ids)
        if valid is None:
            return dict(status='invalid_input')
        token, safe_ids = valid
        if not self._lane_in_scope(scope, token):
            return dict(status='gate_failed')
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
        scope = self._enum_scope(vault_id, enum_key)
        if scope is None:
            return dict(status='gate_failed')
        valid = self._validate_batch(inbox, file_ids)
        if valid is None:
            return dict(status='invalid_input')
        token, safe_ids = valid
        if not self._lane_in_scope(scope, token):
            return dict(status='gate_failed')
        tags    = self._retention_tags(self._lane_settings(vault_id, token))
        moved   = []
        missing = []
        for file_id in safe_ids:
            src = path__vault_append_pending(vault_id, token, file_id)
            dst = path__vault_append_processed(vault_id, token, file_id)
            if self.storage_fs.file__exists(src):
                self.listing.copy(src, dst, tags=tags)                           # server-side CopyObject on S3, tagged for the lane's retention class
                self.storage_fs.file__delete(src)
                moved.append(file_id)
            else:
                missing.append(file_id)
        self._forget_counts(vault_id, token)
        self._sweep_processed(vault_id, token)
        return dict(status='ok', moved=moved, missing=missing)

    def unmark(self, vault_id, enum_key, inbox, file_ids):                       # processed → pending (undo); capacity applies; the retention tag is cleared
        scope = self._enum_scope(vault_id, enum_key)
        if scope is None:
            return dict(status='unauthorized')
        valid = self._validate_batch(inbox, file_ids)
        if valid is None:
            return dict(status='invalid_input')
        token, safe_ids = valid
        if not self._lane_in_scope(scope, token):
            return dict(status='unauthorized')
        settings = self._lane_settings(vault_id, token)
        if not self._mode_supported(settings):
            return dict(status='lane_mode_unsupported')
        room    = settings['hard_pending'] - self.listing.count_up_to(path__vault_append_pending_prefix(vault_id, token), settings['hard_pending'])
        moved   = []
        missing = []
        refused = []
        for file_id in safe_ids:
            src = path__vault_append_processed(vault_id, token, file_id)
            dst = path__vault_append_pending(vault_id, token, file_id)
            if not self.storage_fs.file__exists(src):
                missing.append(file_id)
            elif room <= 0:
                refused.append(file_id)
            else:
                self.listing.copy(src, dst, tags={})                             # tags={} clears sg-retention: an unmarked entry must never expire unread
                self.storage_fs.file__delete(src)
                moved.append(file_id)
                room -= 1
        self._forget_counts(vault_id, token)
        return dict(status='ok', moved=moved, missing=missing, refused=refused)

    def stats(self, vault_id, enum_key, inbox):                                  # one lane's counts, bytes and times, from listings; cached 30 s
        scope = self._enum_scope(vault_id, enum_key)
        if scope is None:
            return dict(status='unauthorized')
        try:
            token = str(self._safe_token(inbox))
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if not self._lane_in_scope(scope, token):
            return dict(status='unauthorized')
        key    = (vault_id, token)
        cached = self._stats_cache.get(key)
        if cached is not None and time.monotonic() - cached[1] < STATS_CACHE_TTL:
            return cached[0]
        settings  = self._lane_settings(vault_id, token)
        hard      = settings['hard_pending']
        pending   = self.listing.usage(path__vault_append_pending_prefix(vault_id, token), hard + max(100, hard // 10))
        processed = self.listing.count_up_to(path__vault_append_processed_prefix(vault_id, token), PROCESSED_COUNT_CAP)
        epoch     = lambda name: int(name.split('_', 1)[0]) if name and TYPE_SAFE_STR__VAULT__APPEND__FILE_ID__REGEX.match(name) else None
        result    = dict(status            = 'ok'                                   ,
                         inbox             = token                                  ,
                         pending           = pending['count']                       ,
                         pending_bytes     = pending['bytes']                       ,
                         oldest_pending    = epoch(pending['first'])                ,
                         newest_pending    = epoch(pending['last'])                 ,
                         processed         = processed                              ,
                         processed_capped  = processed >= PROCESSED_COUNT_CAP       ,
                         soft_pending      = settings['soft_pending']               ,
                         hard_pending      = hard                                   ,
                         max_pending_bytes = settings.get('max_pending_bytes')      ,
                         over_soft         = pending['count'] > settings['soft_pending'],
                         retention_days    = settings.get('retention_days')         ,
                         retention_none    = settings.get('retention_days') is None ,
                         budget            = self.config_rules.lane_budget(settings),
                         blobs             = bool(settings.get('blobs'))            )
        if settings.get('blobs'):
            blob_usage = self._blob_usage(vault_id, self._hash(token))
            result.update(blob_count          = blob_usage['blob_count']           ,
                          blob_bytes          = blob_usage['blob_bytes']           ,
                          reserved_bytes      = blob_usage['reserved_bytes']       ,
                          max_blob_bytes      = settings['max_blob_bytes']         ,
                          blob_retention_days = settings.get('blob_retention_days'))
        self._stats_cache[key] = (result, time.monotonic())
        return result

    def _forget_counts(self, vault_id, token):
        self._count_cache.pop((vault_id, str(token)), None)
        self._stats_cache.pop((vault_id, str(token)), None)

    def purge(self, vault_id, write_key_hex, folder, inbox, file_ids=None):
        if not self._check_write_key(vault_id, write_key_hex):
            return dict(status='gate_failed')
        if folder not in ('pending', 'processed', 'blobs'):
            return dict(status='invalid_input')
        try:
            token = str(self._safe_token(inbox))
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if file_ids is not None and not isinstance(file_ids, list):
            return dict(status='invalid_input')
        self._forget_counts(vault_id, token)
        if folder == 'blobs':
            return self._purge_blobs(vault_id, token, file_ids)
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

    # --- blobs (v2 Phase 3) -------------------------------------------------------------
    # Ciphertext attachments go straight to S3 by presigned PUT; the entry that references a blob
    # is appended afterwards, as today, with the blob id inside its sealed envelope. Blob ids are
    # the SHA-256 of the ciphertext, under bare/append/blobs/<sha256(token)>/ (never the raw token).

    @staticmethod
    def _parse_reservation(name):                                                # "<expires_ms>_<size>_<blob_id>" -> (expires_ms, size, blob_id) or None
        match = RESERVATION_NAME_REGEX.match(name)                               # ASCII digits only: str.isdigit() would let '²' through to int()
        if match is None:
            return None
        return int(match.group(1)), int(match.group(2)), match.group(3)

    def _blob_usage(self, vault_id, lane_hash, now_ms=None):                     # one bounded listing: blobs, live reservations; expired ones are swept
        now_ms   = now_ms or int(time.time() * 1000)
        prefix   = path__vault_append_blobs_prefix(vault_id, lane_hash)
        cap      = MAX_BLOBS_PER_LANE + MAX_BLOB_RESERVATIONS + 1
        items    = self.listing.sizes(prefix, cap)
        blobs    = {}
        reserved = []
        expired  = []
        for name, size in items:
            if TYPE_SAFE_STR__VAULT__APPEND__BLOB_ID__REGEX.match(name):
                blobs[name] = size
            elif name.startswith(RESERVED_PREFIX):
                parsed = self._parse_reservation(name[len(RESERVED_PREFIX):])
                if parsed is None:
                    continue
                (expired if parsed[0] < now_ms else reserved).append((name, parsed))
        for name, _ in expired[:BLOB_EXPIRED_SWEEP_MAX]:
            self.storage_fs.file__delete(prefix + name)
        reserved_bytes = sum(size for _, (_, size, blob_id) in reserved if blob_id not in blobs)    # an uploaded blob counts once, by its real size
        return dict(blob_count     = len(blobs)            ,
                    blob_bytes     = sum(blobs.values())   ,
                    blob_ids       = blobs                 ,
                    reservations   = len(reserved)         ,
                    reserved_bytes = reserved_bytes        ,
                    truncated      = len(items) >= cap     )

    def blob_upload(self, vault_id, append_token, size, sha256):                 # append token -> one presigned, create-only PUT pinned to size, hash, type and tag
        try:
            token = str(self._safe_token(append_token))
        except (ValueError, Exception):
            return dict(status='invalid_input')
        if not isinstance(size, int) or isinstance(size, bool) or size < 1:
            return dict(status='invalid_input')
        blob_id = self._safe_blob_id(sha256)
        if blob_id is None:
            return dict(status='invalid_input')
        if not self._check_append_token(vault_id, token):
            return dict(status='unauthorized')
        settings = self._lane_settings(vault_id, token)
        if not self._mode_supported(settings):
            return dict(status='lane_mode_unsupported')
        if not settings.get('blobs'):
            return dict(status='blobs_disabled')
        if size > settings['max_blob_bytes']:
            return dict(status='blob_too_large', limit=settings['max_blob_bytes'], received=size)
        lane_hash = self._hash(token)
        now_ms    = int(time.time() * 1000)
        pending   = self.listing.usage(path__vault_append_pending_prefix(vault_id, token), settings['hard_pending'])
        blobs     = self._blob_usage(vault_id, lane_hash, now_ms)
        used      = pending['bytes'] + blobs['blob_bytes'] + blobs['reserved_bytes']
        if (blobs['truncated'] or blobs['blob_count'] >= MAX_BLOBS_PER_LANE or blobs['reservations'] >= MAX_BLOB_RESERVATIONS
                or used + settings['max_blob_bytes'] > self.config_rules.lane_budget(settings)):     # fixed condition: never depends on this request's size (AS-2)
            return dict(status='at_capacity')
        if not self.listing.can_presign():                                       # after the budget, so the same one bit is testable on every backend
            return dict(status='presigned_not_available')
        reservation = f'{now_ms + BLOB_RESERVATION_TTL_MS:013d}_{size}_{blob_id}'
        self.listing.save_tagged(path__vault_append_blob_reservation(vault_id, lane_hash, reservation), b'', BLOB_RESERVATION_TAGS)
        days    = settings.get('blob_retention_days')
        tags    = {'sg-retention': f'{days}d'} if days else None                 # 0 = kept until purged: no tag
        upload  = self.listing.presign_put(path__vault_append_blob(vault_id, lane_hash, blob_id), size,
                                           base64.b64encode(bytes.fromhex(blob_id)).decode('ascii'), tags, BLOB_PUT_EXPIRY)
        self._forget_counts(vault_id, token)
        return dict(status     = 'ok'             ,
                    blob_id    = blob_id          ,
                    method     = 'PUT'            ,
                    upload_url = upload['url']    ,
                    headers    = upload['headers'],
                    expires_in = BLOB_PUT_EXPIRY  )

    def blob_url(self, vault_id, enum_key, inbox, blob_ids):                     # enum key -> presigned GETs (5 min) for the blobs that exist
        valid = self._blob_gate(vault_id, enum_key, inbox, blob_ids)
        if 'status' in valid:
            return valid
        if not self.listing.can_presign():
            return dict(status='presigned_not_available')
        present = self._blob_usage(vault_id, valid['lane_hash'])['blob_ids']
        urls    = []
        missing = []
        for blob_id in valid['blob_ids']:
            if blob_id in present:
                urls.append(dict(blob_id = blob_id,
                                 size    = present[blob_id],
                                 url     = self.listing.presign_get(path__vault_append_blob(vault_id, valid['lane_hash'], blob_id), BLOB_GET_EXPIRY)))
            else:
                missing.append(blob_id)
        return dict(status='ok', urls=urls, missing=missing, expires_in=BLOB_GET_EXPIRY)

    def blob_delete(self, vault_id, enum_key, inbox, blob_ids):                  # enum key: a keeper removes the blobs of entries it has processed (orphans, plan 3.2)
        valid = self._blob_gate(vault_id, enum_key, inbox, blob_ids)
        if 'status' in valid:
            return valid
        deleted, missing = self._delete_blobs(vault_id, valid['lane_hash'], valid['blob_ids'])
        self._forget_counts(vault_id, valid['token'])
        return dict(status='ok', deleted=deleted, missing=missing)

    def _blob_gate(self, vault_id, enum_key, inbox, blob_ids):
        scope = self._enum_scope(vault_id, enum_key)
        if scope is None:
            return dict(status='unauthorized')
        if not isinstance(blob_ids, list) or not blob_ids or len(blob_ids) > APPEND_BATCH_MAX_FILE_IDS:
            return dict(status='invalid_input')
        try:
            token = str(self._safe_token(inbox))
        except (ValueError, Exception):
            return dict(status='invalid_input')
        safe_ids = [self._safe_blob_id(blob_id) for blob_id in blob_ids]
        if None in safe_ids:
            return dict(status='invalid_input')
        if not self._lane_in_scope(scope, token):
            return dict(status='unauthorized')
        return dict(token=token, lane_hash=self._hash(token), blob_ids=list(dict.fromkeys(safe_ids)))

    @staticmethod
    def _safe_blob_id(value):
        if not isinstance(value, str):
            return None
        try:
            return str(Safe_Str__Vault__Append__Blob_Id(value))
        except (ValueError, Exception):
            return None

    def _delete_blobs(self, vault_id, lane_hash, blob_ids):
        deleted = []
        missing = []
        for blob_id in blob_ids:
            path = path__vault_append_blob(vault_id, lane_hash, blob_id)
            if self.storage_fs.file__exists(path):
                self.storage_fs.file__delete(path)
                deleted.append(blob_id)
            else:
                missing.append(blob_id)
        return deleted, missing

    def _purge_blobs(self, vault_id, token, file_ids):                           # write key: named blob ids, or every blob and reservation of the lane
        lane_hash = self._hash(token)
        if file_ids:
            if len(file_ids) > APPEND_BATCH_MAX_FILE_IDS:
                return dict(status='invalid_input')
            safe_ids = [self._safe_blob_id(blob_id) for blob_id in file_ids]
            if None in safe_ids:
                return dict(status='invalid_input')
            purged, missing = self._delete_blobs(vault_id, lane_hash, safe_ids)
            return dict(status='ok', purged=purged, missing=missing)
        prefix = path__vault_append_blobs_prefix(vault_id, lane_hash)
        purged = []
        for path in self.storage_fs.folder__files__all(prefix):
            name = str(path)[len(prefix):] if str(path).startswith(prefix) else str(path).rsplit('/', 1)[-1]
            self.storage_fs.file__delete(str(path))
            if TYPE_SAFE_STR__VAULT__APPEND__BLOB_ID__REGEX.match(name):
                purged.append(name)
        return dict(status='ok', purged=purged, missing=[])

    def _validate_batch(self, inbox, file_ids):
        if not isinstance(file_ids, list) or not file_ids or len(file_ids) > APPEND_BATCH_MAX_FILE_IDS:
            return None
        try:
            token    = str(self._safe_token(inbox))
            safe_ids = [str(self._safe_file_id(fid)) for fid in file_ids]
        except (ValueError, Exception):
            return None
        return token, safe_ids
