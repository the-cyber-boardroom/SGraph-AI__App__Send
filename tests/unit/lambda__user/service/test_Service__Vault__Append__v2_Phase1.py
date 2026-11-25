# ===============================================================================
# Tests — append lanes v2, Phase 1 (service level, memory backend, no mocks)
# Plan: team/roles/dev/reviews/11/25/v0.33.69__dev-plan__append-lanes-v2-implementation.md
# ===============================================================================

import contextlib
import hashlib
import io
import json
import logging
import random
import time
from   unittest                                                                    import TestCase
from   memory_fs.storage_fs.providers.Storage_FS__Memory                           import Storage_FS__Memory
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append_Token       import Safe_Str__Vault__Append_Token
from   sgraph_ai_app_send.lambda__user.schemas.Safe_Str__Vault__Append__File_Id    import Safe_Str__Vault__Append__File_Id
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Append              import (Service__Vault__Append    ,
                                                                                          APPEND_CONFIG_TTL_MAX     ,
                                                                                          APPEND_MAX_PAYLOAD        ,
                                                                                          FETCH_CONTENT_CEILING     ,
                                                                                          LAMBDA_MAX_INLINE_PAYLOAD )
from   sgraph_ai_app_send.lambda__user.storage.Storage__Append__Listing            import Storage__Append__Listing
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import (path__vault_manifest              ,
                                                                                          path__vault_tombstone             ,
                                                                                          path__vault_append_base           ,
                                                                                          path__vault_append_pending        ,
                                                                                          path__vault_append_processed      )

VAULT_ID  = 'phase1vault01'
WRITE_KEY = 'phase1-write-key-0123456789'
ENUM_KEY  = hashlib.sha256(b'phase1-enum').hexdigest()


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()

def _token(seed):
    return hashlib.sha256(seed.encode()).hexdigest()


class test_Service__Vault__Append__v2_Phase1(TestCase):

    def setUp(self):
        self.storage = Storage_FS__Memory()
        self.service = Service__Vault__Append(storage_fs=self.storage)
        self.storage.file__save(path__vault_manifest(VAULT_ID), json.dumps(dict(write_key_hash=_hash(WRITE_KEY))).encode())

    def _configure(self, service, tokens, enum_key=ENUM_KEY):
        return service.configure(VAULT_ID, WRITE_KEY, append_anchors=[_hash(t) for t in tokens], enum_key_hash=_hash(enum_key))

    def _seed_entry(self, token, file_name, payload=b'x'):                      # an entry written directly, so names (and so ordering) are controlled
        self.storage.file__save(path__vault_append_pending(VAULT_ID, token, file_name), payload)

    # --- 1.1 / 1.14: cache TTL, revocation reaches every warm instance -------------

    def test__ttl_zero__revocation_reaches_other_instances(self):
        token    = _token('t1')
        lambda_a = Service__Vault__Append(storage_fs=self.storage, cache_ttl_seconds=0)
        lambda_b = Service__Vault__Append(storage_fs=self.storage, cache_ttl_seconds=0)
        self._configure(lambda_a, [token])
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'ok'            # B loads the config
        lambda_a.configure(VAULT_ID, WRITE_KEY, append_anchors=[])                 # A revokes the token
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'gate_failed'   # B honours it (before: 'ok' until recycled)

    def test__ttl_zero__enum_key_rotation_reaches_other_instances(self):
        lambda_a = Service__Vault__Append(storage_fs=self.storage, cache_ttl_seconds=0)
        lambda_b = Service__Vault__Append(storage_fs=self.storage, cache_ttl_seconds=0)
        self._configure(lambda_a, [_token('t1')])
        assert lambda_b.list_entries(VAULT_ID, ENUM_KEY)['status'] == 'ok'
        lambda_a.configure(VAULT_ID, WRITE_KEY, enum_key_hash=_hash('rotated'))
        assert lambda_b.list_entries(VAULT_ID, ENUM_KEY)['status'] == 'gate_failed'

    def test__ttl_zero__a_deleted_vault_reaches_other_instances(self):          # the manifest cache is bounded too (tombstones included)
        token    = _token('t1')
        lambda_b = Service__Vault__Append(storage_fs=self.storage, cache_ttl_seconds=0)
        self._configure(lambda_b, [token])
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'ok'
        self.storage.file__delete(path__vault_manifest(VAULT_ID))
        self.storage.file__save(path__vault_tombstone(VAULT_ID), json.dumps(dict(status='deleted')).encode())
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'gate_failed'

    def test__default_ttl__is_the_revocation_horizon(self):                     # within the TTL a warm instance still trusts its copy: documented, bounded
        token    = _token('t1')
        lambda_a = Service__Vault__Append(storage_fs=self.storage)
        lambda_b = Service__Vault__Append(storage_fs=self.storage)
        assert lambda_b.cache_ttl_seconds == 30
        self._configure(lambda_a, [token])
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'ok'
        lambda_a.configure(VAULT_ID, WRITE_KEY, append_anchors=[])
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'ok'            # still inside the 30 s window
        value, loaded_at = lambda_b._config_cache[VAULT_ID]
        lambda_b._config_cache[VAULT_ID] = (value, loaded_at - 31)                  # the window passes
        assert lambda_b.append(VAULT_ID, token, b'x')['status'] == 'gate_failed'

    def test__ttl_is_clamped(self):
        assert Service__Vault__Append(cache_ttl_seconds=10_000).cache_ttl_seconds == APPEND_CONFIG_TTL_MAX
        assert Service__Vault__Append(cache_ttl_seconds=-5    ).cache_ttl_seconds == 0

    # --- 1.2 / 1.13: fetch response ceiling ------------------------------------------

    def test__fetch__defers_entries_over_the_ceiling(self):
        token = _token('big')
        self._configure(self.service, [token])
        names = [f'17000000000{i:02d}_{"a" * 24}.enc' for i in range(3)]
        for name in names:
            self._seed_entry(token, name, b'z' * (1536 * 1024))                     # 1.5 MiB = 2.1 MB encoded: two fit under the 5.5 MB ceiling, the third does not
        result = self.service.fetch(VAULT_ID, ENUM_KEY, token, names)
        assert [f['file_id'] for f in result['files']] == names[:2]
        assert result['deferred'] == names[2:]
        assert result['missing']  == []
        assert sum(4 * ((f['size'] + 2) // 3) for f in result['files']) <= FETCH_CONTENT_CEILING

    def test__fetch__the_first_entry_is_always_returned(self):                  # a reader always makes progress
        token = _token('big')
        self._configure(self.service, [token])
        name = f'1700000000001_{"b" * 24}.enc'
        self._seed_entry(token, name, b'z' * APPEND_MAX_PAYLOAD)
        result = self.service.fetch(VAULT_ID, ENUM_KEY, token, [name])
        assert [f['file_id'] for f in result['files']] == [name]
        assert result['deferred'] == []

    def test__fetch__deferred_ids_are_never_read(self):                         # a missing id after the ceiling is reported as deferred, not missing: it was never looked up
        token = _token('big')
        self._configure(self.service, [token])
        big   = [f'17000000000{i:02d}_{"c" * 24}.enc' for i in range(2)]
        ghost = f'1700000000099_{"d" * 24}.enc'
        for name in big:
            self._seed_entry(token, name, b'z' * (3 * 1024 * 1024))
        result = self.service.fetch(VAULT_ID, ENUM_KEY, token, big + [ghost])
        assert result['deferred'] == [big[1], ghost]
        assert result['missing']  == []

    def test__fetch__small_entries_come_back_whole_with_an_empty_deferred(self):
        token = _token('small')
        self._configure(self.service, [token])
        self.service.append(VAULT_ID, token, b'hello')
        file_id = self.service.list_entries(VAULT_ID, ENUM_KEY)['entries'][0]['file_id']
        result  = self.service.fetch(VAULT_ID, ENUM_KEY, token, [file_id])
        assert result['deferred'] == [] and len(result['files']) == 1

    # --- 1.3 / 1.11: limits ----------------------------------------------------------

    def test__limits(self):
        limits = self.service.limits()
        assert set(limits) == {'max_inline_payload', 'max_pending', 'max_batch_ids', 'list_page_default', 'list_page_max',
                               'inline_content_ceiling', 'fetch_content_ceiling', 'config_ttl_seconds', 'now_ms', 'features'}
        assert limits['max_inline_payload'] == APPEND_MAX_PAYLOAD
        assert limits['max_pending'] == 1000 and limits['max_batch_ids'] == 100 and limits['list_page_max'] == 200
        assert abs(limits['now_ms'] - int(time.time() * 1000)) < 5_000
        assert 'fetch-deferred' in limits['features'] and 'configure-creates-vault' in limits['features']

    def test__limits__on_lambda_report_the_transport_ceiling(self):
        assert Service__Vault__Append(on_lambda=True).limits()['max_inline_payload'] == LAMBDA_MAX_INLINE_PAYLOAD

    def test__payload_too_large__reports_limit_and_size(self):
        token = _token('t1')
        self._configure(self.service, [token])
        result = self.service.append(VAULT_ID, token, b'x' * (APPEND_MAX_PAYLOAD + 1))
        assert result == dict(status='payload_too_large', limit=APPEND_MAX_PAYLOAD, received=APPEND_MAX_PAYLOAD + 1)

    # --- 1.4 / 1.5: cheap counting and listing — same results as the pre-v2 code ------

    def test__listing__equivalent_to_the_legacy_code(self):
        rng    = random.Random(1125)
        tokens = [_token(f'lane-{i}') for i in range(5)]
        names  = set()
        for token in tokens:
            for _ in range(rng.randint(0, 40)):
                name = f'{1_700_000_000_000 + rng.randint(0, 9_999):013d}_{rng.getrandbits(96):024x}.enc'
                if name in names:
                    continue
                names.add(name)
                self._seed_entry(token, name, bytes([rng.randint(0, 255)]) * rng.randint(1, 50))
        fast   = Service__Vault__Append(storage_fs=self.storage, fast_listing=True )
        legacy = Service__Vault__Append(storage_fs=self.storage, fast_listing=False)
        self._configure(fast, tokens)
        sorted_names = sorted(names)
        cursors      = [None, sorted_names[0], sorted_names[len(sorted_names) // 2], sorted_names[-1], '1700000005000', '9999999999999']
        checked      = 0
        for inbox in [None] + tokens:
            for cursor in cursors:
                for limit in (1, 3, 17, 50, 200):
                    for include_content in (False, True):
                        expected = legacy.list_entries(VAULT_ID, ENUM_KEY, inbox=inbox, after_file_id=cursor, limit=limit, include_content=include_content)
                        actual   = fast  .list_entries(VAULT_ID, ENUM_KEY, inbox=inbox, after_file_id=cursor, limit=limit, include_content=include_content)
                        assert actual == expected, (inbox, cursor, limit, include_content)
                        checked += 1
        assert checked == 6 * 6 * 5 * 2

    def test__listing__skips_folders_that_are_not_lanes(self):                  # keys written through the raw vault API must not become lanes
        token = _token('real')
        self._configure(self.service, [token])
        self.service.append(VAULT_ID, token, b'x')
        self.storage.file__save(f'{path__vault_append_base(VAULT_ID)}/NOT-A-LANE/pending/whatever', b'x')
        entries = self.service.list_entries(VAULT_ID, ENUM_KEY)['entries']
        assert [e['inbox'] for e in entries] == [token]

    def test__count_up_to(self):
        listing = Storage__Append__Listing(storage_fs=self.storage)
        token   = _token('count')
        for i in range(7):
            self._seed_entry(token, f'170000000000{i}_{"e" * 24}.enc')
        prefix = path__vault_append_pending(VAULT_ID, token, '')
        assert listing.count_up_to(prefix, 3)   == 3
        assert listing.count_up_to(prefix, 100) == 7

    # --- 1.6: mark_processed copies through the listing helper ----------------------

    def test__mark_processed__moves_the_bytes(self):
        token = _token('mark')
        self._configure(self.service, [token])
        self.service.append(VAULT_ID, token, b'payload-to-keep')
        file_id = self.service.list_entries(VAULT_ID, ENUM_KEY)['entries'][0]['file_id']
        assert self.service.mark_processed(VAULT_ID, ENUM_KEY, token, [file_id])['moved'] == [file_id]
        assert self.storage.file__bytes(path__vault_append_processed(VAULT_ID, token, file_id)) == b'payload-to-keep'
        assert self.storage.file__exists(path__vault_append_pending(VAULT_ID, token, file_id)) is False

    # --- 1.8 / 1.12: strict inputs, a bad value is invalid_input (400), never a crash ---

    def test__list__rejects_bad_inputs(self):
        self._configure(self.service, [_token('t1')])
        for kwargs in (dict(after_file_id=123), dict(after_file_id='1700000000000\n'), dict(after_file_id='../x'),
                       dict(limit=True), dict(limit=[5]), dict(limit='5; drop'), dict(include_content='yes'),
                       dict(inbox=['a'*32]), dict(inbox=_token('t1') + '\n')):
            assert self.service.list_entries(VAULT_ID, ENUM_KEY, **kwargs)['status'] == 'invalid_input', kwargs

    def test__list__accepts_the_inputs_clients_send(self):
        self._configure(self.service, [_token('t1')])
        for kwargs in (dict(limit='50'), dict(limit=0), dict(after_file_id=''), dict(after_file_id='1700000000000'),
                       dict(after_file_id=f'1700000000000_{"f" * 24}.enc'), dict(include_content=None)):
            assert self.service.list_entries(VAULT_ID, ENUM_KEY, **kwargs)['status'] == 'ok', kwargs

    def test__batch_verbs__reject_non_list_file_ids(self):
        token = _token('t1')
        self._configure(self.service, [token])
        for file_ids in (123, 'abc', {'a': 1}):
            assert self.service.fetch         (VAULT_ID, ENUM_KEY, token, file_ids)['status'] == 'invalid_input'
            assert self.service.mark_processed(VAULT_ID, ENUM_KEY, token, file_ids)['status'] == 'invalid_input'

    def test__configure__rejects_badly_typed_fields(self):
        assert self.service.configure(VAULT_ID, WRITE_KEY, append_anchors='not-a-list'  )['status'] == 'invalid_input'
        assert self.service.configure(VAULT_ID, WRITE_KEY, append_anchors=[1, 2]        )['status'] == 'invalid_input'
        assert self.service.configure(VAULT_ID, WRITE_KEY, enum_key_hash=float('nan')   )['status'] == 'invalid_input'

    def test__validators__reject_trailing_newlines_and_non_ascii_digits(self):
        for bad in (_token('t') + '\n', _token('t').upper()):
            with self.assertRaises(ValueError):
                Safe_Str__Vault__Append_Token(bad)
        good_id = f'1700000000000_{"a" * 24}.enc'
        Safe_Str__Vault__Append__File_Id(good_id)
        for bad in (good_id + '\n', '١' * 13 + f'_{"a" * 24}.enc'):            # U+0661 ARABIC-INDIC DIGIT ONE matches \d
            with self.assertRaises(ValueError):
                Safe_Str__Vault__Append__File_Id(bad)

    # --- 1.10: no secrets, tokens, keys, ids or bodies in logs ------------------------

    def test__logs_carry_no_identifiers(self):
        token   = _token('log-lane')
        secret  = b'PLAINTEXT-SHOULD-NEVER-BE-LOGGED'
        handler = logging.StreamHandler(io.StringIO())
        root    = logging.getLogger()
        old     = root.level
        root.addHandler(handler); root.setLevel(logging.DEBUG)
        out, err = io.StringIO(), io.StringIO()
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self._configure(self.service, [token])
                self.service.append(VAULT_ID, token, secret)
                listed  = self.service.list_entries(VAULT_ID, ENUM_KEY, include_content=True)
                file_id = listed['entries'][0]['file_id']
                self.service.fetch(VAULT_ID, ENUM_KEY, token, [file_id])
                self.service.mark_processed(VAULT_ID, ENUM_KEY, token, [file_id])
        finally:
            root.removeHandler(handler); root.setLevel(old)
        captured = handler.stream.getvalue() + out.getvalue() + err.getvalue()
        for needle in (token, ENUM_KEY, WRITE_KEY, file_id, secret.decode(), _hash(token)):
            assert needle not in captured
