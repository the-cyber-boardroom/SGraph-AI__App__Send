# ===============================================================================
# SGraph Send - Append lane configuration (validation + merge, no storage)
# configure() requests are validated against a typed schema, bounded, and merged
# field by field into the stored config, so a client that sets one field can never
# wipe another (a partial update keeps every other lane setting and key).
# Stored shape (all optional; old code ignores the new keys):
#   append_anchors : [sha256(token), …]
#   enum_key_hash  : sha256(enum_key)                       — legacy read key, scope "*"
#   enum_keys      : {sha256(key): {"lanes": [sha256(token), …] | "*"}}
#   lane_defaults  : {soft_pending, hard_pending, max_pending_bytes, retention_days,
#                     blobs, max_blob_bytes, blob_retention_days}
#   lanes          : {sha256(token): {same fields}}
# ===============================================================================

import copy
import re
from   osbot_utils.type_safe.Type_Safe                                         import Type_Safe
from   sgraph_ai_app_send.lambda__user.schemas.Schema__Vault__Append__Lane     import Schema__Vault__Append__Lane

APPEND_DEFAULT_HARD_PENDING = 1000                                               # today's limit: a lane with no settings behaves exactly as before
TOKEN_LANE_HARD_CEILING     = 5_000                                              # server ceilings for token lanes (decision 1)
TOKEN_LANE_BYTES_CEILING    = 1024 ** 3                                          # 1 GiB
LANE_BYTES_FLOOR            = 10 * 1024 * 1024                                   # a budget must hold at least two maximum payloads
APPEND_RETENTION_CLASSES    = (1, 3, 7, 30, 90, 365)                             # days; absent = kept until purged
BLOB_RETENTION_CHOICES      = (0,) + APPEND_RETENTION_CLASSES                    # blobs: an explicit choice is required; 0 = kept until purged (AS-8, plan 3.2)
TOKEN_LANE_BLOB_CEILING     = 25 * 1024 * 1024                                   # decision 2: 25 MiB per blob on token lanes (signed lanes: Phase 4)
MAX_ANCHORS                 = 256
MAX_LANES                   = 64
MAX_ENUM_KEYS               = 16
MAX_SCOPE_LANES             = 64
CONFIGURE_MAX_BODY          = 64 * 1024
HEX64                       = re.compile(r'^[0-9a-f]{64}\Z')
CONFIGURE_FIELDS            = ('append_anchors', 'enum_key_hash', 'legacy_enum_key', 'remove_legacy_enum_key',
                               'add_enum_keys', 'remove_enum_keys', 'lane_defaults', 'lanes')
LANE_FIELDS                 = ('soft_pending', 'hard_pending', 'max_pending_bytes', 'retention_days',
                               'blobs', 'max_blob_bytes', 'blob_retention_days')


class Vault__Append__Config__Error(Exception):
    pass


class Vault__Append__Config(Type_Safe):
    hard_ceiling  : int = TOKEN_LANE_HARD_CEILING
    bytes_ceiling : int = TOKEN_LANE_BYTES_CEILING
    blob_ceiling  : int = TOKEN_LANE_BLOB_CEILING

    # --- reading ------------------------------------------------------------------------

    def lane_settings(self, config, lane_hash):                                  # effective settings for one lane: defaults < lane_defaults < lanes[h]
        settings = dict(soft_pending=None, hard_pending=APPEND_DEFAULT_HARD_PENDING, max_pending_bytes=None, retention_days=None,
                        blobs=False, max_blob_bytes=None, blob_retention_days=None, mode=None)
        for layer in ((config or {}).get('lane_defaults') or {}, ((config or {}).get('lanes') or {}).get(lane_hash) or {}):
            for key, value in layer.items():
                if key in settings:
                    settings[key] = value
        if settings['soft_pending'] is None:
            settings['soft_pending'] = settings['hard_pending']
        if settings['max_blob_bytes'] is None:
            settings['max_blob_bytes'] = self.blob_ceiling
        return settings

    def lane_budget(self, settings):                                             # bytes the lane may hold; a blob lane always has one (public tokens must not fill storage)
        if settings.get('max_pending_bytes'):
            return settings['max_pending_bytes']
        return self.bytes_ceiling if settings.get('blobs') else None

    @staticmethod
    def enum_scope(config, key_hash):                                            # "*" (every lane), a set of lane hashes, or None (not a read key of this vault)
        config  = config or {}
        entry   = (config.get('enum_keys') or {}).get(key_hash)
        if entry is not None:
            lanes = entry.get('lanes')
            return '*' if lanes == '*' else set(lanes or [])
        legacy = config.get('enum_key_hash')
        if legacy and key_hash == legacy:
            return '*'
        return None

    # --- configure: validate + merge ------------------------------------------------

    def merge(self, config, request, cross_checks=True):                         # → (new_config, ignored_fields); raises Vault__Append__Config__Error
        if not isinstance(request, dict):
            raise Vault__Append__Config__Error('configure body must be an object')
        unknown = [key for key in request if key not in CONFIGURE_FIELDS]
        if unknown:
            raise Vault__Append__Config__Error(f'unknown configure fields: {", ".join(sorted(unknown))}')
        new     = copy.deepcopy(config or {})
        ignored = []

        if request.get('append_anchors') is not None:
            anchors = request['append_anchors']
            if not isinstance(anchors, list) or len(anchors) > MAX_ANCHORS or not all(isinstance(a, str) and HEX64.match(a) for a in anchors):
                raise Vault__Append__Config__Error(f'append_anchors must be a list of at most {MAX_ANCHORS} sha256 hex strings')
            new['append_anchors'] = list(dict.fromkeys(anchors))
            named = request.get('lanes') if isinstance(request.get('lanes'), dict) else {}
            kept  = {h: s for h, s in (new.get('lanes') or {}).items() if h in new['append_anchors'] or h in named}
            if 'lanes' in new:                                                    # a removed anchor takes its settings with it (sg-append.js re-sends the whole list
                new['lanes'] = kept                                              #  on every configure; rotating a token must not turn into a 400)
                if not kept:
                    new.pop('lanes')

        self._merge_enum_keys(new, request, ignored)
        if 'lane_defaults' in request:
            new['lane_defaults'] = self._merge_lane(new.get('lane_defaults'), request['lane_defaults'], 'lane_defaults')
            if not new['lane_defaults']:
                new.pop('lane_defaults')
        if 'lanes' in request:
            self._merge_lanes(new, request['lanes'])

        if not cross_checks:                                                     # request-only validation (types, ranges, shapes): nothing that depends on the stored config
            return new, ignored
        for lane_hash, lane in (new.get('lanes') or {}).items():                  # cross-field checks on the merged result
            if lane_hash not in (new.get('append_anchors') or []):
                raise Vault__Append__Config__Error('lane settings must name one of the append_anchors')
            self._check_soft_hard(self.lane_settings(new, lane_hash), f'lanes[{lane_hash[:8]}…]')
            self._check_blobs    (self.lane_settings(new, lane_hash), f'lanes[{lane_hash[:8]}…]')
        self._check_soft_hard(self.lane_settings(new, None), 'lane_defaults')
        self._check_blobs    (self.lane_settings(new, None), 'lane_defaults')
        return new, ignored

    def _merge_enum_keys(self, new, request, ignored):
        if request.get('remove_legacy_enum_key') is True:
            new.pop('enum_key_hash', None)
        elif request.get('remove_legacy_enum_key') not in (None, False):
            raise Vault__Append__Config__Error('remove_legacy_enum_key must be a boolean')
        if request.get('legacy_enum_key') not in (None, True, False):
            raise Vault__Append__Config__Error('legacy_enum_key must be a boolean')

        legacy = request.get('enum_key_hash')
        if legacy is not None:
            if not isinstance(legacy, str) or not HEX64.match(legacy):
                raise Vault__Append__Config__Error('enum_key_hash must be a sha256 hex string')
            scoped_keys_exist = bool(new.get('enum_keys'))
            already_set       = new.get('enum_key_hash') == legacy
            if scoped_keys_exist and not already_set and request.get('legacy_enum_key') is not True:
                ignored.append('enum_key_hash')                                  # never silently restore the vault-wide key once scoped keys exist
            else:
                new['enum_key_hash'] = legacy

        removals = request.get('remove_enum_keys')
        if removals is not None:
            if not isinstance(removals, list) or not all(isinstance(k, str) and HEX64.match(k) for k in removals):
                raise Vault__Append__Config__Error('remove_enum_keys must be a list of sha256 hex strings')
            keys = new.get('enum_keys') or {}
            for key_hash in removals:
                keys.pop(key_hash, None)
            new['enum_keys'] = keys

        additions = request.get('add_enum_keys')
        if additions is not None:
            if not isinstance(additions, dict):
                raise Vault__Append__Config__Error('add_enum_keys must be an object of {sha256(key): {"lanes": [...] | "*"}}')
            keys = new.get('enum_keys') or {}
            for key_hash, entry in additions.items():
                if not HEX64.match(key_hash) or not isinstance(entry, dict) or set(entry) != {'lanes'}:
                    raise Vault__Append__Config__Error('each add_enum_keys entry is sha256(key): {"lanes": [...] | "*"}')
                lanes = entry['lanes']
                if lanes != '*':
                    if not isinstance(lanes, list) or not lanes or len(lanes) > MAX_SCOPE_LANES or not all(isinstance(h, str) and HEX64.match(h) for h in lanes):
                        raise Vault__Append__Config__Error(f'"lanes" must be "*" or a list of 1..{MAX_SCOPE_LANES} sha256(token) hex strings')
                    lanes = list(dict.fromkeys(lanes))
                keys[key_hash] = dict(lanes=lanes)
            new['enum_keys'] = keys

        if 'enum_keys' in new:
            if len(new['enum_keys']) > MAX_ENUM_KEYS:
                raise Vault__Append__Config__Error(f'at most {MAX_ENUM_KEYS} scoped read keys')
            if not new['enum_keys']:
                new.pop('enum_keys')

    def _merge_lanes(self, new, lanes_request):
        if not isinstance(lanes_request, dict):
            raise Vault__Append__Config__Error('lanes must be an object of {sha256(token): settings | null}')
        lanes = new.get('lanes') or {}
        for lane_hash, settings in lanes_request.items():
            if not isinstance(lane_hash, str) or not HEX64.match(lane_hash):
                raise Vault__Append__Config__Error('lanes keys must be sha256(token) hex strings')
            if settings is None:
                lanes.pop(lane_hash, None)
                continue
            merged = self._merge_lane(lanes.get(lane_hash), settings, f'lanes[{lane_hash[:8]}…]')
            if merged:
                lanes[lane_hash] = merged
            else:
                lanes.pop(lane_hash, None)
        if len(lanes) > MAX_LANES:
            raise Vault__Append__Config__Error(f'at most {MAX_LANES} lanes with settings')
        new['lanes'] = lanes
        if not lanes:
            new.pop('lanes')

    def _merge_lane(self, current, request, label):                              # per-field merge; a null value removes that field
        if request is None:
            return {}
        if not isinstance(request, dict):
            raise Vault__Append__Config__Error(f'{label} must be an object')
        merged  = {k: v for k, v in (current or {}).items() if k in LANE_FIELDS or k == 'mode'}  # keep 'mode' written by a later version: never drop it here
        to_type = {}
        for key, value in request.items():
            if key not in LANE_FIELDS:
                raise Vault__Append__Config__Error(f'{label}: unknown field {key!r}')
            if value is None:
                merged.pop(key, None)
            else:
                to_type[key] = value
        try:
            Schema__Vault__Append__Lane(**to_type)                               # rejects NaN, booleans, floats, strings
        except (ValueError, TypeError) as error:
            raise Vault__Append__Config__Error(f'{label}: {error}')
        for key, value in to_type.items():
            self._check_range(key, value, label)
            merged[key] = value
        return merged

    def _check_range(self, key, value, label):
        if key in ('soft_pending', 'hard_pending') and not 1 <= value <= self.hard_ceiling:
            raise Vault__Append__Config__Error(f'{label}: {key} must be between 1 and {self.hard_ceiling}')
        if key == 'max_pending_bytes' and not LANE_BYTES_FLOOR <= value <= self.bytes_ceiling:
            raise Vault__Append__Config__Error(f'{label}: max_pending_bytes must be between {LANE_BYTES_FLOOR} and {self.bytes_ceiling}')
        if key == 'retention_days' and value not in APPEND_RETENTION_CLASSES:
            raise Vault__Append__Config__Error(f'{label}: retention_days must be one of {APPEND_RETENTION_CLASSES} (or null for none)')
        if key == 'max_blob_bytes' and not 1 <= value <= self.blob_ceiling:
            raise Vault__Append__Config__Error(f'{label}: max_blob_bytes must be between 1 and {self.blob_ceiling}')
        if key == 'blob_retention_days' and value not in BLOB_RETENTION_CHOICES:
            raise Vault__Append__Config__Error(f'{label}: blob_retention_days must be one of {BLOB_RETENTION_CHOICES} (0 = kept until purged)')

    def _check_blobs(self, settings, label):                                     # cross-field rules for a lane with blobs on
        if not settings.get('blobs'):
            return
        if settings.get('blob_retention_days') is None:
            raise Vault__Append__Config__Error(f'{label}: blobs need an explicit blob_retention_days (one of {BLOB_RETENTION_CHOICES}; 0 = kept until purged)')
        if settings['max_blob_bytes'] > self.lane_budget(settings):
            raise Vault__Append__Config__Error(f'{label}: max_blob_bytes cannot exceed the lane byte budget (max_pending_bytes)')

    @staticmethod
    def _check_soft_hard(settings, label):
        if settings['soft_pending'] > settings['hard_pending']:
            raise Vault__Append__Config__Error(f'{label}: soft_pending cannot exceed hard_pending')
