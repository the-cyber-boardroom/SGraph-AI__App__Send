# ===============================================================================
# Tests — append lanes v2, Phase 3: blobs (service level, memory backend, no mocks)
# Gates, blob-id validation on every blob verb, the lane budget (entries + blobs +
# reservations, refused on a fixed condition), reservation expiry, blob-delete and
# purge folder:"blobs". Presigned URLs need S3: the full upload/download flow runs
# on LocalStack (test_Storage_FS__S3__LocalStack.py) and the signed-header list
# offline (test_Storage_FS__S3__Presign.py).
# ===============================================================================

import hashlib
import json
import time
from   unittest                                                                    import TestCase
from   memory_fs.storage_fs.providers.Storage_FS__Memory                           import Storage_FS__Memory
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Append              import (Service__Vault__Append, MAX_BLOB_RESERVATIONS,
                                                                                          BLOB_RESERVATION_TTL_MS)
from   sgraph_ai_app_send.lambda__user.service.Vault__Append__Config               import LANE_BYTES_FLOOR, TOKEN_LANE_BLOB_CEILING
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest              ,
                                                                                          path__vault_append_config         ,
                                                                                          path__vault_append_pending        ,
                                                                                          path__vault_append_blob           ,
                                                                                          path__vault_append_blob_reservation)

VAULT_ID  = 'phase3vault01'
WRITE_KEY = 'phase3-write-key-0123456789'
ENUM_KEY  = hashlib.sha256(b'phase3-enum').hexdigest()
MIB       = 1024 * 1024


def _h(value):
    return hashlib.sha256(value.encode()).hexdigest()

TOKEN_A, TOKEN_B = _h('p3-lane-a'), _h('p3-lane-b')
LANE_A           = _h(TOKEN_A)
BLOB_1, BLOB_2   = _h('ciphertext-1'), _h('ciphertext-2')
BAD_BLOB_IDS     = ('a' * 63, 'A' * 64, 'a' * 64 + '\n', '../' + 'a' * 61, 'a' * 32 + '/' + 'a' * 31, 'a' * 65, '', 64, None)


class test_Service__Vault__Append__v2_Phase3(TestCase):

    def setUp(self):
        self.storage = Storage_FS__Memory()
        self.service = Service__Vault__Append(storage_fs=self.storage)
        self.storage.file__save(path__vault_manifest(VAULT_ID), json.dumps(dict(write_key_hash=_h(WRITE_KEY))).encode())
        assert self.service.configure(VAULT_ID, WRITE_KEY, append_anchors=[_h(TOKEN_A), _h(TOKEN_B)], enum_key_hash=_h(ENUM_KEY))['status'] == 'configured'

    def _blobs_on(self, **settings):
        lane = dict(blobs=True, blob_retention_days=7, **settings)
        assert self.service.configure(VAULT_ID, WRITE_KEY, lanes={_h(TOKEN_A): lane})['status'] == 'configured'

    def _upload(self, size=MIB, sha256=BLOB_1, token=TOKEN_A):
        return self.service.blob_upload(VAULT_ID, token, size, sha256)['status']

    def _put_blob(self, blob_id, size):                                          # what a presigned PUT leaves behind on S3
        self.storage.file__save(path__vault_append_blob(VAULT_ID, LANE_A, blob_id), b'x' * size)

    def _reserve(self, size, blob_id=BLOB_2, expires_ms=None):                   # what an issued upload URL leaves behind
        expires_ms = expires_ms or int(time.time() * 1000) + BLOB_RESERVATION_TTL_MS
        name       = f'{expires_ms:013d}_{size}_{blob_id}'
        self.storage.file__save(path__vault_append_blob_reservation(VAULT_ID, LANE_A, name), b'')
        return name

    # --- blob-upload gates, in order ------------------------------------------------------

    def test__upload__input_checks_come_first(self):
        self._blobs_on()
        for size in (0, -1, True, 1.5, '10', None):
            assert self._upload(size=size) == 'invalid_input', size
        for bad in BAD_BLOB_IDS:
            assert self._upload(sha256=bad) == 'invalid_input', repr(bad)
        assert self.service.blob_upload(VAULT_ID, 'not-hex!', MIB, BLOB_1)['status'] == 'invalid_input'

    def test__upload__gates(self):
        assert self._upload(token=_h('not-an-anchor')) == 'unauthorized'
        assert self._upload()                          == 'blobs_disabled'               # default: off
        self._blobs_on(max_blob_bytes=2 * MIB)
        result = self.service.blob_upload(VAULT_ID, TOKEN_A, 2 * MIB + 1, BLOB_1)
        assert result == dict(status='blob_too_large', limit=2 * MIB, received=2 * MIB + 1)
        assert self._upload() == 'presigned_not_available'                            # memory backend: the budget passed, presigning cannot

    def test__upload__unknown_mode_fails_closed(self):
        self._blobs_on()
        config = json.loads(self.storage.file__bytes(path__vault_append_config(VAULT_ID)))
        config['lanes'][LANE_A]['mode'] = 'signed'
        self.storage.file__save(path__vault_append_config(VAULT_ID), json.dumps(config).encode())
        self.service._config_cache.clear()
        assert self._upload() == 'lane_mode_unsupported'

    # --- AS-2: one budget, fixed refusal ---------------------------------------------------

    def test__budget_counts_entries_blobs_and_reservations(self):
        self._blobs_on(max_pending_bytes=LANE_BYTES_FLOOR, max_blob_bytes=4 * MIB)            # 10 MiB budget, 4 MiB per blob
        assert self._upload() == 'presigned_not_available'                                    # 0 used: room
        self._put_blob(BLOB_1, 3 * MIB)
        self._reserve(2 * MIB)
        self.storage.file__save(path__vault_append_pending(VAULT_ID, TOKEN_A, f'{int(time.time()*1000):013d}_{"0"*24}.enc'), b'x' * MIB)
        assert self._upload() == 'presigned_not_available'                                    # 3 + 2 + 1 = 6 MiB used; 6 + 4 = 10: still fits
        self._reserve(1, blob_id=_h('third'))
        assert self._upload() == 'at_capacity'                                                # one more byte anywhere: refused

    def test__refusal_does_not_depend_on_the_requested_size(self):              # 28 binary-search probes must not reveal the used bytes
        self._blobs_on(max_pending_bytes=LANE_BYTES_FLOOR, max_blob_bytes=4 * MIB)
        self._put_blob(BLOB_1, 6 * MIB + 1)
        assert {self._upload(size=size) for size in (1, MIB, 3 * MIB, 4 * MIB)} == {'at_capacity'}
        self.storage.file__delete(path__vault_append_blob(VAULT_ID, LANE_A, BLOB_1))
        self._put_blob(BLOB_1, 6 * MIB)
        assert {self._upload(size=size) for size in (1, MIB, 3 * MIB, 4 * MIB)} == {'presigned_not_available'}

    def test__an_uploaded_blob_is_counted_once(self):                            # its reservation stops counting once the blob exists
        self._blobs_on(max_pending_bytes=LANE_BYTES_FLOOR, max_blob_bytes=4 * MIB)
        self._reserve(4 * MIB, blob_id=BLOB_1)
        self._put_blob(BLOB_1, 4 * MIB)
        usage = self.service._blob_usage(VAULT_ID, LANE_A)
        assert (usage['blob_bytes'], usage['reserved_bytes'], usage['reservations']) == (4 * MIB, 0, 1)

    def test__expired_reservations_stop_counting_and_are_swept(self):
        self._blobs_on(max_pending_bytes=LANE_BYTES_FLOOR, max_blob_bytes=4 * MIB)
        old = self._reserve(9 * MIB, expires_ms=int(time.time() * 1000) - 1)
        assert self.service._blob_usage(VAULT_ID, LANE_A)['reserved_bytes'] == 0
        assert self.storage.file__exists(path__vault_append_blob_reservation(VAULT_ID, LANE_A, old)) is False
        assert self._upload() == 'presigned_not_available'

    def test__outstanding_reservations_are_capped(self):
        self._blobs_on(max_blob_bytes=1)
        for i in range(MAX_BLOB_RESERVATIONS):
            self._reserve(1, blob_id=_h(f'r{i}'))
        assert self._upload(size=1) == 'at_capacity'

    def test__a_blob_lane_has_a_budget_even_without_max_pending_bytes(self):
        self._blobs_on()
        settings = self.service._lane_settings(VAULT_ID, TOKEN_A)
        assert self.service.config_rules.lane_budget(settings) == 1024 ** 3 and settings['max_blob_bytes'] == TOKEN_LANE_BLOB_CEILING

    def test__appends_count_blob_bytes_on_a_blob_lane(self):                    # one budget: a lane full of blobs refuses entries too
        self._blobs_on(max_pending_bytes=LANE_BYTES_FLOOR, max_blob_bytes=MIB)
        assert self.service.append(VAULT_ID, TOKEN_A, b'x')['status'] == 'ok'
        self._put_blob(BLOB_1, LANE_BYTES_FLOOR - MIB)
        self.service._count_cache.clear()
        assert self.service.append(VAULT_ID, TOKEN_A, b'x')['status'] == 'at_capacity'

    # --- blob-url / blob-delete ------------------------------------------------------------

    def test__url_and_delete__gates_and_ids(self):                              # AS-9: every blob verb refuses a malformed id with 400
        for verb in (self.service.blob_url, self.service.blob_delete):
            assert verb(VAULT_ID, 'wrong-key', TOKEN_A, [BLOB_1])['status'] == 'unauthorized'
            assert verb(VAULT_ID, None,        TOKEN_A, [BLOB_1])['status'] == 'unauthorized'
            for bad in BAD_BLOB_IDS:
                assert verb(VAULT_ID, ENUM_KEY, TOKEN_A, [bad])['status'] == 'invalid_input', repr(bad)
            for ids in ([], [BLOB_1] * 101, BLOB_1, None):
                assert verb(VAULT_ID, ENUM_KEY, TOKEN_A, ids)['status'] == 'invalid_input'
        assert self.service.blob_url(VAULT_ID, ENUM_KEY, TOKEN_A, [BLOB_1])['status'] == 'presigned_not_available'

    def test__a_scoped_key_reaches_only_its_lanes(self):
        scoped = _h('p3-scoped')
        self.service.configure(VAULT_ID, WRITE_KEY, add_enum_keys={_h(scoped): dict(lanes=[_h(TOKEN_B)])})
        assert self.service.blob_delete(VAULT_ID, scoped, TOKEN_A, [BLOB_1])['status'] == 'unauthorized'
        assert self.service.blob_delete(VAULT_ID, scoped, TOKEN_B, [BLOB_1])['status'] == 'ok'

    def test__blob_delete(self):
        self._put_blob(BLOB_1, 10)
        result = self.service.blob_delete(VAULT_ID, ENUM_KEY, TOKEN_A, [BLOB_1, BLOB_2])
        assert (result['deleted'], result['missing']) == ([BLOB_1], [BLOB_2])
        assert self.storage.file__exists(path__vault_append_blob(VAULT_ID, LANE_A, BLOB_1)) is False

    def test__purge_blobs__named_and_all(self):
        self._put_blob(BLOB_1, 10); self._put_blob(BLOB_2, 10); self._reserve(10)
        assert self.service.purge(VAULT_ID, 'wrong', 'blobs', TOKEN_A, [BLOB_1])['status'] == 'gate_failed'
        assert self.service.purge(VAULT_ID, WRITE_KEY, 'blobs', TOKEN_A, ['a' * 63])['status'] == 'invalid_input'
        assert self.service.purge(VAULT_ID, WRITE_KEY, 'blobs', TOKEN_A, [BLOB_1])['purged'] == [BLOB_1]
        assert self.service.purge(VAULT_ID, WRITE_KEY, 'blobs', TOKEN_A)['purged'] == [BLOB_2]
        assert self.service._blob_usage(VAULT_ID, LANE_A)['reservations'] == 0

    # --- layout ----------------------------------------------------------------------------

    def test__blob_folders_are_never_mistaken_for_lanes(self):                  # "blobs" is not hex: lane discovery skips it
        self._put_blob(BLOB_1, 10)
        assert self.service.append(VAULT_ID, TOKEN_A, b'entry')['status'] == 'ok'
        entries = self.service.list_entries(VAULT_ID, ENUM_KEY)['entries']
        assert [e['inbox'] for e in entries] == [TOKEN_A]
        assert 'blobs' not in self.service._lane_names(VAULT_ID)

    def test__stats_report_blob_usage(self):
        self._blobs_on(max_pending_bytes=LANE_BYTES_FLOOR, max_blob_bytes=MIB)
        self._put_blob(BLOB_1, 100); self._reserve(50)
        stats = self.service.stats(VAULT_ID, ENUM_KEY, TOKEN_A)
        assert (stats['blobs'], stats['blob_count'], stats['blob_bytes'], stats['reserved_bytes'], stats['budget'],
                stats['max_blob_bytes'], stats['blob_retention_days']) == (True, 1, 100, 50, LANE_BYTES_FLOOR, MIB, 7)
        assert self.service.stats(VAULT_ID, ENUM_KEY, TOKEN_B)['blobs'] is False

    def test__limits(self):
        limits = self.service.limits()
        assert 'blobs' in limits['features'] and limits['presigned_blobs'] is False
        assert (limits['token_lane_blob_ceiling'], limits['blob_put_expiry'], limits['blob_retention_choices']) == (25 * MIB, 300, [0, 1, 3, 7, 30, 90, 365])

    def test__malformed_reservation_names_are_ignored(self):                    # raw vault writes can put any key here; never a 500
        self._blobs_on()
        for name in ('\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2\u00b2_1_' + BLOB_1, 'x_1_' + BLOB_1, f'{"9"*13}_1_{BLOB_1}/payload', 'junk'):
            self.storage.file__save(path__vault_append_blob_reservation(VAULT_ID, LANE_A, name), b'')
        usage = self.service._blob_usage(VAULT_ID, LANE_A)
        assert (usage['reservations'], usage['reserved_bytes']) == (0, 0)
