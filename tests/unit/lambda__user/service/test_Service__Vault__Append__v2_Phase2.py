# ===============================================================================
# Tests — append lanes v2, Phase 2 (service level, memory backend, no mocks)
# processed listing, unmark, retention, soft/hard limits + byte budget, the count
# cache near the limit, fail-closed lane modes, scoped read keys, stats,
# merge-safe configure.
# ===============================================================================

import hashlib
import json
import time
from   unittest                                                                    import TestCase
from   memory_fs.storage_fs.providers.Storage_FS__Memory                           import Storage_FS__Memory
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Append              import Service__Vault__Append, APPEND_MAX_PAYLOAD
from   sgraph_ai_app_send.lambda__user.storage.Storage__Append__Listing            import Storage__Append__Listing
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest          ,
                                                                                          path__vault_append_config     ,
                                                                                          path__vault_append_pending    ,
                                                                                          path__vault_append_processed  )

VAULT_ID  = 'phase2vault01'
WRITE_KEY = 'phase2-write-key-0123456789'
ENUM_KEY  = hashlib.sha256(b'phase2-enum').hexdigest()


def _h(value):
    return hashlib.sha256(value.encode()).hexdigest()

def _token(seed):
    return hashlib.sha256(seed.encode()).hexdigest()

TOKEN_A, TOKEN_B = _token('lane-a'), _token('lane-b')


class test_Service__Vault__Append__v2_Phase2(TestCase):

    def setUp(self):
        self.storage = Storage_FS__Memory()
        self.service = Service__Vault__Append(storage_fs=self.storage)
        self.storage.file__save(path__vault_manifest(VAULT_ID), json.dumps(dict(write_key_hash=_h(WRITE_KEY))).encode())
        result = self.service.configure(VAULT_ID, WRITE_KEY, append_anchors=[_h(TOKEN_A), _h(TOKEN_B)], enum_key_hash=_h(ENUM_KEY))
        assert result['status'] == 'configured'

    def _configure(self, **fields):
        return self.service.configure(VAULT_ID, WRITE_KEY, **fields)

    def _write(self, token, payload=b'x', service=None):
        return (service or self.service).append(VAULT_ID, token, payload)['status']

    def _ids(self, token, folder='pending', enum_key=ENUM_KEY):
        return [e['file_id'] for e in self.service.list_entries(VAULT_ID, enum_key, inbox=token, folder=folder, limit=200)['entries']]

    # --- 2.1: list processed ----------------------------------------------------------------

    def test__list_processed(self):
        for _ in range(3):
            self._write(TOKEN_A)
        ids = self._ids(TOKEN_A)
        self.service.mark_processed(VAULT_ID, ENUM_KEY, TOKEN_A, ids[:2])
        assert self._ids(TOKEN_A, 'processed') == ids[:2]
        assert self._ids(TOKEN_A, 'pending')   == ids[2:]
        assert self.service.list_entries(VAULT_ID, ENUM_KEY, folder='archive')['status'] == 'invalid_input'

    # --- 2.2: unmark ----------------------------------------------------------------------------

    def test__unmark_moves_entries_back(self):
        self._write(TOKEN_A, b'keep-me')
        file_id = self._ids(TOKEN_A)[0]
        self.service.mark_processed(VAULT_ID, ENUM_KEY, TOKEN_A, [file_id])
        result = self.service.unmark(VAULT_ID, ENUM_KEY, TOKEN_A, [file_id, f'1700000000000_{"0" * 24}.enc'])
        assert result['moved'] == [file_id] and result['refused'] == [] and len(result['missing']) == 1
        assert self.storage.file__bytes(path__vault_append_pending(VAULT_ID, TOKEN_A, file_id)) == b'keep-me'
        assert self._ids(TOKEN_A, 'processed') == []

    def test__unmark_respects_the_hard_limit(self):
        self._configure(lanes={_h(TOKEN_A): dict(hard_pending=2)})
        self._write(TOKEN_A); self._write(TOKEN_A)
        first_two = self._ids(TOKEN_A)
        self.service.mark_processed(VAULT_ID, ENUM_KEY, TOKEN_A, first_two)
        self._write(TOKEN_A)                                                       # one slot left after this
        result = self.service.unmark(VAULT_ID, ENUM_KEY, TOKEN_A, first_two)
        assert len(result['moved']) == 1 and len(result['refused']) == 1
        assert len(self._ids(TOKEN_A)) == 2

    def test__unmark_gate_failures_are_unauthorized(self):
        assert self.service.unmark(VAULT_ID, 'wrong-key', TOKEN_A, [f'1700000000000_{"0" * 24}.enc'])['status'] == 'unauthorized'
        assert self.service.unmark(VAULT_ID, ENUM_KEY, TOKEN_A, 'not-a-list')['status'] == 'invalid_input'

    # --- 2.3 / 2.11: retention ------------------------------------------------------------------

    def test__retention_sweep_on_memory_backend(self):                           # S3 uses lifecycle rules by tag; memory/disk sweep on access
        self._configure(lanes={_h(TOKEN_A): dict(retention_days=1)})
        old_ms   = int(time.time() * 1000) - 3 * 86_400_000
        old_name = f'{old_ms:013d}_{"a" * 24}.enc'
        self.storage.file__save(path__vault_append_processed(VAULT_ID, TOKEN_A, old_name), b'old')
        self._write(TOKEN_A)
        young = self._ids(TOKEN_A)[0]
        self.service.mark_processed(VAULT_ID, ENUM_KEY, TOKEN_A, [young])        # triggers the sweep
        assert self._ids(TOKEN_A, 'processed') == [young]

    def test__no_retention_keeps_processed_entries(self):
        old_name = f'{int(time.time() * 1000) - 400 * 86_400_000:013d}_{"b" * 24}.enc'
        self.storage.file__save(path__vault_append_processed(VAULT_ID, TOKEN_A, old_name), b'old')
        assert self._ids(TOKEN_A, 'processed') == [old_name]

    # --- 2.4 / 2.12: limits, byte budget, the count cache ---------------------------------

    def test__lane_hard_limit(self):
        self._configure(lanes={_h(TOKEN_A): dict(hard_pending=3)})
        assert [self._write(TOKEN_A) for _ in range(4)] == ['ok', 'ok', 'ok', 'at_capacity']
        assert self._write(TOKEN_B) == 'ok'                                        # other lanes keep the default 1,000

    def test__byte_budget_refusal_reveals_one_bit(self):                         # refused when less than one maximum payload of room is left, whatever this payload's size
        self._configure(lanes={_h(TOKEN_A): dict(max_pending_bytes=10 * 1024 * 1024)})
        three_mib = b'z' * (3 * 1024 * 1024)
        assert self._write(TOKEN_A, three_mib) == 'ok'                             # 0 + 5 MiB room check ≤ 10 MiB
        assert self._write(TOKEN_A, three_mib) == 'ok'                             # 3 MiB used
        assert self._write(TOKEN_A, three_mib) == 'at_capacity'                    # 6 MiB used: less than 5 MiB left
        assert self._write(TOKEN_A, b'1')      == 'at_capacity'                    # same answer for one byte

    def test__two_instances_never_overshoot_inside_the_margin(self):            # the cache is trusted only far from the limit; near it, every append counts
        self._configure(lanes={_h(TOKEN_A): dict(hard_pending=150)})
        lambda_a = Service__Vault__Append(storage_fs=self.storage)
        lambda_b = Service__Vault__Append(storage_fs=self.storage)
        results  = [self._write(TOKEN_A, service=(lambda_a if i % 2 else lambda_b)) for i in range(160)]
        assert results.count('ok') == 150
        assert len(self.storage.folder__files__all(path__vault_append_pending(VAULT_ID, TOKEN_A, ''))) == 150

    # --- 2.9: fail closed on an unknown lane mode -------------------------------------------

    def test__unknown_lane_mode_refuses_writes(self):                             # e.g. a Phase 4 "signed" lane seen by this build after a rollback
        config_path = path__vault_append_config(VAULT_ID)
        config      = self.storage.file__json(config_path)
        config['lanes'] = {_h(TOKEN_A): dict(mode='signed')}
        self.storage.file__save(config_path, json.dumps(config).encode())
        self.service._config_cache.clear()
        assert self._write(TOKEN_A) == 'lane_mode_unsupported'
        assert self.service.unmark(VAULT_ID, ENUM_KEY, TOKEN_A, [f'1700000000000_{"0" * 24}.enc'])['status'] == 'lane_mode_unsupported'
        assert self._write(TOKEN_B) == 'ok'
        self._configure(lanes={_h(TOKEN_A): dict(retention_days=30)})             # a Phase 2 configure keeps the mode it does not know
        assert self.storage.file__json(config_path)['lanes'][_h(TOKEN_A)]['mode'] == 'signed'

    # --- 2.5 / 2.10: scoped read keys -------------------------------------------------------

    def test__scoped_read_keys(self):
        feedback_key = _token('feedback-keeper')
        self._configure(add_enum_keys={_h(feedback_key): dict(lanes=[_h(TOKEN_A)])})
        self._write(TOKEN_A); self._write(TOKEN_B)
        listed = self.service.list_entries(VAULT_ID, feedback_key)['entries']
        assert {e['inbox'] for e in listed} == {TOKEN_A}                           # never sees lane B, or its token
        any_b = self._ids(TOKEN_B)[0]
        assert self.service.list_entries (VAULT_ID, feedback_key, inbox=TOKEN_B)['status'] == 'gate_failed'
        assert self.service.fetch        (VAULT_ID, feedback_key, TOKEN_B, [any_b])['status'] == 'gate_failed'
        assert self.service.mark_processed(VAULT_ID, feedback_key, TOKEN_B, [any_b])['status'] == 'gate_failed'
        assert self.service.stats        (VAULT_ID, feedback_key, TOKEN_B)['status'] == 'unauthorized'
        assert {e['inbox'] for e in self.service.list_entries(VAULT_ID, ENUM_KEY)['entries']} == {TOKEN_A, TOKEN_B}   # legacy key: every lane

    def test__removing_a_scoped_key_revokes_it(self):
        keeper = _token('temp-keeper')
        self._configure(add_enum_keys={_h(keeper): dict(lanes='*')})
        assert self.service.list_entries(VAULT_ID, keeper)['status'] == 'ok'
        self._configure(remove_enum_keys=[_h(keeper)])
        assert self.service.list_entries(VAULT_ID, keeper)['status'] == 'gate_failed'

    # --- 2.6 / 2.14: stats ------------------------------------------------------------------------

    def test__stats(self):
        self._configure(lanes={_h(TOKEN_A): dict(soft_pending=2, hard_pending=10)})
        for payload in (b'aa', b'bbb', b'cccc'):
            self._write(TOKEN_A, payload)
        ids    = self._ids(TOKEN_A)                                                # same-millisecond writes sort by their random suffix
        marked = len(self.storage.file__bytes(path__vault_append_pending(VAULT_ID, TOKEN_A, ids[0])))
        self.service.mark_processed(VAULT_ID, ENUM_KEY, TOKEN_A, ids[:1])
        stats = self.service.stats(VAULT_ID, ENUM_KEY, TOKEN_A)
        assert (stats['pending'], stats['pending_bytes'], stats['processed']) == (2, 9 - marked, 1)
        assert stats['oldest_pending'] == int(ids[1].split('_')[0]) and stats['newest_pending'] == int(ids[2].split('_')[0])
        assert stats['over_soft'] is False and stats['soft_pending'] == 2 and stats['hard_pending'] == 10
        assert stats['retention_none'] is True and stats['processed_capped'] is False
        assert self.service.stats(VAULT_ID, ENUM_KEY, None)['status'] == 'invalid_input'

    # --- 2.7 / 2.8: configure through the service --------------------------------------------

    def test__configure__refuses_unknown_and_badly_typed_fields(self):
        result = self._configure(webhook_url='https://example.com')
        assert result['status'] == 'invalid_input' and 'webhook_url' in result['detail']
        assert self._configure(lanes={_h(TOKEN_A): dict(hard_pending=float('nan'))})['status'] == 'invalid_input'

    def test__configure__invalid_request_never_claims_a_vault(self):
        assert self.service.configure('freshvault0001', WRITE_KEY, lanes={'x': {}})['status'] == 'invalid_input'
        assert self.storage.file__exists(path__vault_manifest('freshvault0001')) is False

    def test__configure__reports_an_ignored_legacy_key(self):
        self._configure(add_enum_keys={_h('k'): dict(lanes='*')}, remove_legacy_enum_key=True)
        result = self._configure(enum_key_hash=_h(ENUM_KEY))
        assert result['ignored'] == ['enum_key_hash']
        assert self.service.list_entries(VAULT_ID, ENUM_KEY)['status'] == 'gate_failed'

    def test__conditional_write_detects_a_concurrent_change(self):
        listing = Storage__Append__Listing(storage_fs=self.storage)
        path    = path__vault_append_config(VAULT_ID)
        data, version = listing.read_versioned(path)
        assert listing.write_if_version(path, b'{"by":"first"}', version) is True
        assert listing.write_if_version(path, b'{"by":"stale"}', version) is False   # the second writer read before the first wrote
        assert listing.write_if_version('missing/config.json', b'{}', None) is True  # create-if-absent
        assert listing.write_if_version('missing/config.json', b'{}', None) is False

    def test__configure__replaces_an_unreadable_stored_config(self):            # the owner's recovery path, never a 500
        for garbage in (b'not json', b'[1, 2]', b'null'):
            self.storage.file__save(path__vault_append_config(VAULT_ID), garbage)
            self.service._config_cache.clear()
            assert self._configure(append_anchors=[_h(TOKEN_A)], enum_key_hash=_h(ENUM_KEY))['status'] == 'configured'
            assert json.loads(self.storage.file__bytes(path__vault_append_config(VAULT_ID)))['append_anchors'] == [_h(TOKEN_A)]

    def test__configure__rotating_out_a_lane_with_settings_still_works(self):   # what sg-append.js does: re-send the whole anchor list
        assert self._configure(lanes={_h(TOKEN_B): dict(hard_pending=5)})['status'] == 'configured'
        assert self._configure(append_anchors=[_h(TOKEN_A)], enum_key_hash=_h(ENUM_KEY))['status'] == 'configured'
        assert self._write(TOKEN_B) == 'gate_failed' and self._write(TOKEN_A) == 'ok'
