# ===============================================================================
# Tests — Service__Vault__Inbox
# Full coverage: gates, append, list, fetch, mark-processed, purge, configure
# Uses real in-memory stack (no mocks, no patches)
# ===============================================================================

import base64
import hashlib
import json
import time
from   unittest                                                                    import TestCase
from   sgraph_ai_app_send.lambda__user.service.Service__Vault__Inbox               import (Service__Vault__Inbox  ,
                                                                                           INBOX_MAX_FILES       ,
                                                                                           INBOX_MAX_BYTES       ,
                                                                                           APPEND_MAX_PAYLOAD    ,
                                                                                           INBOX_DEFAULT_LIMIT   ,
                                                                                           INBOX_MAX_LIMIT       )
from   sgraph_ai_app_send.lambda__user.storage.Storage__Paths                      import path__vault_manifest


VAULT_ID     = 'inboxvault01'
WRITE_KEY    = 'deadbeef1234567890abcdef'
APPEND_TOKEN = 'test_append_token_abc123'
ENUM_KEY     = 'test_enum_key_xyz789'
PAYLOAD      = b'\x00\x01\x02\x03encrypted-test-payload'


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


class test_Service__Vault__Inbox(TestCase):

    def setUp(self):
        self.service = Service__Vault__Inbox()
        self._create_vault_with_inbox(VAULT_ID, WRITE_KEY, APPEND_TOKEN, ENUM_KEY)

    def _create_vault_with_inbox(self, vault_id, write_key, append_token, enum_key):
        manifest = dict(vault_id       = vault_id                  ,
                        write_key_hash = _hash(write_key)          ,
                        append_anchors = [_hash(append_token)]     ,
                        enum_key_hash  = _hash(enum_key)           ,
                        created_at     = int(time.time() * 1000)   )
        manifest_path = path__vault_manifest(vault_id)
        self.service.storage_fs.file__save(manifest_path, json.dumps(manifest).encode())

    def _append(self, vault_id=VAULT_ID, token=APPEND_TOKEN, payload=PAYLOAD):
        return self.service.append(vault_id, token, payload)

    def _append_n(self, n, vault_id=VAULT_ID, token=APPEND_TOKEN):
        results = []
        for i in range(n):
            result = self._append(vault_id, token, f'payload-{i}'.encode())
            results.append(result)
        return results

    # =========================================================================
    # Configure
    # =========================================================================

    def test__configure__adds_anchors(self):
        vault = 'cfgvault0001'
        manifest = dict(vault_id       = vault              ,
                        write_key_hash = _hash(WRITE_KEY)   ,
                        created_at     = int(time.time() * 1000))
        self.service.storage_fs.file__save(path__vault_manifest(vault),
                                            json.dumps(manifest).encode())
        new_token = 'new_append_token'
        result = self.service.configure(vault, WRITE_KEY,
                                         append_anchors=[_hash(new_token)],
                                         enum_key_hash=_hash(ENUM_KEY))
        assert result is not None
        assert result['status'] == 'configured'
        assert self.service._check_append_token(vault, new_token) is True
        assert self.service._check_enum_key(vault, ENUM_KEY) is True

    def test__configure__wrong_write_key(self):
        result = self.service.configure(VAULT_ID, 'wrongkey',
                                         append_anchors=[_hash('token')])
        assert result is None

    def test__configure__nonexistent_vault(self):
        result = self.service.configure('nonexistent00001', WRITE_KEY,
                                         append_anchors=[_hash('token')])
        assert result is None

    def test__configure__partial_update_preserves_existing(self):
        result = self.service.configure(VAULT_ID, WRITE_KEY,
                                         enum_key_hash=_hash('new_enum'))
        assert result['status'] == 'configured'
        assert self.service._check_append_token(VAULT_ID, APPEND_TOKEN) is True
        assert self.service._check_enum_key(VAULT_ID, 'new_enum') is True

    def test__configure__updates_manifest_cache(self):
        self.service._load_manifest(VAULT_ID)
        new_token = 'cache_test_token'
        self.service.configure(VAULT_ID, WRITE_KEY,
                                append_anchors=[_hash(new_token)])
        assert self.service._check_append_token(VAULT_ID, new_token) is True

    def test__configure__multiple_anchors(self):
        tokens = ['token_a', 'token_b', 'token_c']
        self.service.configure(VAULT_ID, WRITE_KEY,
                                append_anchors=[_hash(t) for t in tokens])
        for t in tokens:
            assert self.service._check_append_token(VAULT_ID, t) is True
        assert self.service._check_append_token(VAULT_ID, 'token_d') is False

    # =========================================================================
    # Gate checks
    # =========================================================================

    def test__gate__append_token_valid(self):
        assert self.service._check_append_token(VAULT_ID, APPEND_TOKEN) is True

    def test__gate__append_token_invalid(self):
        assert self.service._check_append_token(VAULT_ID, 'wrong_token') is False

    def test__gate__enum_key_valid(self):
        assert self.service._check_enum_key(VAULT_ID, ENUM_KEY) is True

    def test__gate__enum_key_invalid(self):
        assert self.service._check_enum_key(VAULT_ID, 'wrong_key') is False

    def test__gate__write_key_valid(self):
        assert self.service._check_write_key(VAULT_ID, WRITE_KEY) is True

    def test__gate__write_key_invalid(self):
        assert self.service._check_write_key(VAULT_ID, 'wrong_key') is False

    def test__gate__nonexistent_vault(self):
        assert self.service._check_append_token('nonexist00001', APPEND_TOKEN) is False
        assert self.service._check_enum_key('nonexist00001', ENUM_KEY) is False
        assert self.service._check_write_key('nonexist00001', WRITE_KEY) is False

    def test__gate__append_token_cannot_enumerate(self):
        result = self.service.inbox_list(VAULT_ID, APPEND_TOKEN)
        assert result['status'] == 'gate_failed'

    def test__gate__enum_key_cannot_purge(self):
        result = self.service.purge(VAULT_ID, ENUM_KEY, 'processed', APPEND_TOKEN)
        assert result['status'] == 'gate_failed'

    # =========================================================================
    # Append
    # =========================================================================

    def test__append__success(self):
        result = self._append()
        assert result['status'] == 'ok'

    def test__append__wrong_token(self):
        result = self.service.append(VAULT_ID, 'wrong_token', PAYLOAD)
        assert result['status'] == 'gate_failed'

    def test__append__payload_stored(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY, include_content=True)
        assert len(listing['entries']) == 1
        content = base64.b64decode(listing['entries'][0]['content'])
        assert content == PAYLOAD

    def test__append__server_assigned_filename(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        assert file_id.endswith('.enc')
        assert '_' in file_id
        parts = file_id.replace('.enc', '').split('_')
        assert len(parts[0]) == 13
        assert len(parts[1]) == 24

    def test__append__multiple_files_chronological(self):
        self._append_n(5)
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_ids = [e['file_id'] for e in listing['entries']]
        assert file_ids == sorted(file_ids)
        assert len(file_ids) == 5

    def test__append__payload_too_large(self):
        big_payload = b'x' * (APPEND_MAX_PAYLOAD + 1)
        result = self.service.append(VAULT_ID, APPEND_TOKEN, big_payload)
        assert result['status'] == 'payload_too_large'

    def test__append__at_file_capacity(self):
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__vault_inbox
        import secrets
        for i in range(INBOX_MAX_FILES):
            file_name = f'{int(time.time()*1000):013d}_{secrets.token_hex(12)}.enc'
            path = path__vault_inbox(VAULT_ID, APPEND_TOKEN, file_name)
            self.service.storage_fs.file__save(path, b'x')
        result = self._append()
        assert result['status'] == 'at_capacity'

    def test__append__blindness_no_file_id_returned(self):
        result = self._append()
        assert 'file_id' not in result
        assert result == dict(status='ok')

    def test__append__different_tokens_different_folders(self):
        token_a = 'token_alpha'
        token_b = 'token_beta'
        self.service.configure(VAULT_ID, WRITE_KEY,
                                append_anchors=[_hash(token_a), _hash(token_b)])
        self.service.append(VAULT_ID, token_a, b'from-alpha')
        self.service.append(VAULT_ID, token_b, b'from-beta')
        listing_a = self.service.inbox_list(VAULT_ID, ENUM_KEY, inbox=token_a)
        listing_b = self.service.inbox_list(VAULT_ID, ENUM_KEY, inbox=token_b)
        assert len(listing_a['entries']) == 1
        assert len(listing_b['entries']) == 1

    # =========================================================================
    # Inbox list
    # =========================================================================

    def test__inbox_list__empty(self):
        result = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert result['status']    == 'ok'
        assert result['entries']   == []
        assert result['truncated'] is False

    def test__inbox_list__wrong_enum_key(self):
        result = self.service.inbox_list(VAULT_ID, 'wrong_key')
        assert result['status'] == 'gate_failed'

    def test__inbox_list__returns_metadata(self):
        self._append()
        result = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        entry  = result['entries'][0]
        assert 'file_id'  in entry
        assert 'size'     in entry
        assert 'received' in entry
        assert 'inbox'    in entry
        assert 'content'  not in entry

    def test__inbox_list__include_content(self):
        self._append()
        result = self.service.inbox_list(VAULT_ID, ENUM_KEY, include_content=True)
        entry  = result['entries'][0]
        assert 'content' in entry
        assert base64.b64decode(entry['content']) == PAYLOAD

    def test__inbox_list__pagination_limit(self):
        self._append_n(10)
        result = self.service.inbox_list(VAULT_ID, ENUM_KEY, limit=3)
        assert len(result['entries']) == 3
        assert result['truncated']    is True

    def test__inbox_list__pagination_cursor(self):
        self._append_n(5)
        page1 = self.service.inbox_list(VAULT_ID, ENUM_KEY, limit=2)
        cursor = page1['entries'][-1]['file_id']
        page2 = self.service.inbox_list(VAULT_ID, ENUM_KEY, limit=2, after_file_id=cursor)
        page1_ids = {e['file_id'] for e in page1['entries']}
        page2_ids = {e['file_id'] for e in page2['entries']}
        assert len(page1_ids & page2_ids) == 0

    def test__inbox_list__full_drain_via_cursor(self):
        self._append_n(7)
        all_ids = []
        cursor  = None
        while True:
            page = self.service.inbox_list(VAULT_ID, ENUM_KEY, limit=3,
                                            after_file_id=cursor)
            if not page['entries']:
                break
            all_ids.extend(e['file_id'] for e in page['entries'])
            cursor = page['entries'][-1]['file_id']
            if not page['truncated']:
                break
        assert len(all_ids) == 7
        assert len(set(all_ids)) == 7

    def test__inbox_list__max_limit_enforced(self):
        self._append_n(5)
        result = self.service.inbox_list(VAULT_ID, ENUM_KEY, limit=99999)
        assert len(result['entries']) == 5

    def test__inbox_list__filter_by_inbox(self):
        token_a = 'filter_token_a'
        token_b = 'filter_token_b'
        self.service.configure(VAULT_ID, WRITE_KEY,
                                append_anchors=[_hash(token_a), _hash(token_b)])
        self.service.append(VAULT_ID, token_a, b'msg-a-1')
        self.service.append(VAULT_ID, token_a, b'msg-a-2')
        self.service.append(VAULT_ID, token_b, b'msg-b-1')
        result_a = self.service.inbox_list(VAULT_ID, ENUM_KEY, inbox=token_a)
        result_b = self.service.inbox_list(VAULT_ID, ENUM_KEY, inbox=token_b)
        assert len(result_a['entries']) == 2
        assert len(result_b['entries']) == 1

    # =========================================================================
    # Inbox fetch
    # =========================================================================

    def test__inbox_fetch__success(self):
        self._append()
        listing  = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id  = listing['entries'][0]['file_id']
        inbox    = listing['entries'][0]['inbox']
        result   = self.service.inbox_fetch(VAULT_ID, ENUM_KEY, inbox, [file_id])
        assert result['status']  == 'ok'
        assert len(result['files'])   == 1
        assert len(result['missing']) == 0
        assert base64.b64decode(result['files'][0]['content']) == PAYLOAD

    def test__inbox_fetch__wrong_enum_key(self):
        result = self.service.inbox_fetch(VAULT_ID, 'wrong', APPEND_TOKEN, ['any.enc'])
        assert result['status'] == 'gate_failed'

    def test__inbox_fetch__missing_file(self):
        result = self.service.inbox_fetch(VAULT_ID, ENUM_KEY, APPEND_TOKEN,
                                           ['nonexistent.enc'])
        assert result['status']  == 'ok'
        assert len(result['files'])   == 0
        assert len(result['missing']) == 1

    def test__inbox_fetch__mixed_found_and_missing(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        result  = self.service.inbox_fetch(VAULT_ID, ENUM_KEY, inbox,
                                            [file_id, 'ghost.enc'])
        assert len(result['files'])   == 1
        assert len(result['missing']) == 1
        assert result['missing'][0]   == 'ghost.enc'

    def test__inbox_fetch__multiple_files(self):
        self._append_n(3)
        listing  = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_ids = [e['file_id'] for e in listing['entries']]
        inbox    = listing['entries'][0]['inbox']
        result   = self.service.inbox_fetch(VAULT_ID, ENUM_KEY, inbox, file_ids)
        assert len(result['files']) == 3
        assert len(result['missing']) == 0

    # =========================================================================
    # Mark processed
    # =========================================================================

    def test__mark_processed__success(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        result  = self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        assert result['status'] == 'ok'
        assert file_id in result['moved']
        assert len(result['missing']) == 0
        after = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(after['entries']) == 0

    def test__mark_processed__wrong_enum_key(self):
        result = self.service.mark_processed(VAULT_ID, 'wrong', APPEND_TOKEN, ['f.enc'])
        assert result['status'] == 'gate_failed'

    def test__mark_processed__idempotent(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        result = self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        assert result['status'] == 'ok'
        assert file_id in result['missing']
        assert len(result['moved']) == 0

    def test__mark_processed__file_exists_in_processed(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__vault_processed
        processed_path = path__vault_processed(VAULT_ID, inbox, file_id)
        assert self.service.storage_fs.file__exists(processed_path) is True
        content = self.service.storage_fs.file__bytes(processed_path)
        assert content == PAYLOAD

    def test__mark_processed__batch_partial(self):
        self._append_n(3)
        listing  = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_ids = [e['file_id'] for e in listing['entries']]
        inbox    = listing['entries'][0]['inbox']
        batch    = [file_ids[0], 'ghost.enc', file_ids[2]]
        result   = self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, batch)
        assert len(result['moved'])   == 2
        assert len(result['missing']) == 1
        assert 'ghost.enc' in result['missing']

    # =========================================================================
    # Purge
    # =========================================================================

    def test__purge__processed_files(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        result = self.service.purge(VAULT_ID, WRITE_KEY, 'processed', inbox, [file_id])
        assert result['status'] == 'ok'
        assert file_id in result['purged']
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__vault_processed
        assert self.service.storage_fs.file__exists(
            path__vault_processed(VAULT_ID, inbox, file_id)) is False

    def test__purge__wrong_write_key(self):
        result = self.service.purge(VAULT_ID, 'wrongkey', 'processed', APPEND_TOKEN)
        assert result['status'] == 'gate_failed'

    def test__purge__idempotent(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        self.service.purge(VAULT_ID, WRITE_KEY, 'processed', inbox, [file_id])
        result = self.service.purge(VAULT_ID, WRITE_KEY, 'processed', inbox, [file_id])
        assert file_id in result['missing']
        assert len(result['purged']) == 0

    def test__purge__all_processed(self):
        self._append_n(3)
        listing  = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_ids = [e['file_id'] for e in listing['entries']]
        inbox    = listing['entries'][0]['inbox']
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, file_ids)
        result = self.service.purge(VAULT_ID, WRITE_KEY, 'processed', inbox)
        assert len(result['purged']) == 3

    def test__purge__inbox_files_directly(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        result = self.service.purge(VAULT_ID, WRITE_KEY, 'inbox', inbox, [file_id])
        assert file_id in result['purged']
        after = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(after['entries']) == 0

    # =========================================================================
    # Full drain cycle
    # =========================================================================

    def test__full_drain_cycle(self):
        self._append_n(5)
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(listing['entries']) == 5
        file_ids = [e['file_id'] for e in listing['entries']]
        inbox    = listing['entries'][0]['inbox']
        for file_id in file_ids:
            fetched = self.service.inbox_fetch(VAULT_ID, ENUM_KEY, inbox, [file_id])
            assert len(fetched['files']) == 1
        move_result = self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, file_ids)
        assert len(move_result['moved']) == 5
        after_move = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(after_move['entries']) == 0
        purge_result = self.service.purge(VAULT_ID, WRITE_KEY, 'processed', inbox)
        assert len(purge_result['purged']) == 5

    def test__drain_with_pagination(self):
        self._append_n(7)
        all_file_ids = []
        cursor = None
        inbox  = None
        while True:
            page = self.service.inbox_list(VAULT_ID, ENUM_KEY, limit=3,
                                            after_file_id=cursor)
            if not page['entries']:
                break
            for entry in page['entries']:
                all_file_ids.append(entry['file_id'])
                if inbox is None:
                    inbox = entry['inbox']
            cursor = page['entries'][-1]['file_id']
            if not page['truncated']:
                break
        assert len(all_file_ids) == 7
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, all_file_ids)
        empty = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(empty['entries']) == 0

    # =========================================================================
    # Capability tier separation (security tests)
    # =========================================================================

    def test__tier__append_cannot_list(self):
        result = self.service.inbox_list(VAULT_ID, APPEND_TOKEN)
        assert result['status'] == 'gate_failed'

    def test__tier__append_cannot_fetch(self):
        result = self.service.inbox_fetch(VAULT_ID, APPEND_TOKEN, APPEND_TOKEN, ['f.enc'])
        assert result['status'] == 'gate_failed'

    def test__tier__append_cannot_mark_processed(self):
        result = self.service.mark_processed(VAULT_ID, APPEND_TOKEN, APPEND_TOKEN, ['f.enc'])
        assert result['status'] == 'gate_failed'

    def test__tier__enum_cannot_append(self):
        result = self.service.append(VAULT_ID, ENUM_KEY, PAYLOAD)
        assert result['status'] == 'gate_failed'

    def test__tier__enum_cannot_purge(self):
        result = self.service.purge(VAULT_ID, ENUM_KEY, 'processed', APPEND_TOKEN)
        assert result['status'] == 'gate_failed'

    def test__tier__write_key_cannot_append(self):
        result = self.service.append(VAULT_ID, WRITE_KEY, PAYLOAD)
        assert result['status'] == 'gate_failed'

    def test__tier__write_key_cannot_enumerate(self):
        result = self.service.inbox_list(VAULT_ID, WRITE_KEY)
        assert result['status'] == 'gate_failed'

    # =========================================================================
    # Edge cases
    # =========================================================================

    def test__deleted_vault_blocks_all_operations(self):
        vault = 'deletedvlt01'
        self._create_vault_with_inbox(vault, WRITE_KEY, APPEND_TOKEN, ENUM_KEY)
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__vault_tombstone, path__vault_manifest as _manifest_path
        self.service.storage_fs.file__delete(_manifest_path(vault))
        tombstone = dict(vault_id=vault, status='deleted')
        self.service.storage_fs.file__save(path__vault_tombstone(vault),
                                            json.dumps(tombstone).encode())
        self.service._manifest_cache.pop(vault, None)
        assert self.service.append(vault, APPEND_TOKEN, PAYLOAD)['status'] == 'gate_failed'
        assert self.service.inbox_list(vault, ENUM_KEY)['status'] == 'gate_failed'
        assert self.service.purge(vault, WRITE_KEY, 'processed', APPEND_TOKEN)['status'] == 'gate_failed'

    def test__empty_inbox_operations_are_safe(self):
        result = self.service.inbox_fetch(VAULT_ID, ENUM_KEY, APPEND_TOKEN, [])
        assert result['status'] == 'ok'
        assert len(result['files'])   == 0
        assert len(result['missing']) == 0

    def test__mark_processed_preserves_content(self):
        payload = b'important-encrypted-message'
        self.service.append(VAULT_ID, APPEND_TOKEN, payload)
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        file_id = listing['entries'][0]['file_id']
        inbox   = listing['entries'][0]['inbox']
        self.service.mark_processed(VAULT_ID, ENUM_KEY, inbox, [file_id])
        from sgraph_ai_app_send.lambda__user.storage.Storage__Paths import path__vault_processed
        content = self.service.storage_fs.file__bytes(
            path__vault_processed(VAULT_ID, inbox, file_id))
        assert content == payload

    def test__concurrent_append_and_list(self):
        self._append_n(3)
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(listing['entries']) == 3
        self._append()
        listing2 = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        assert len(listing2['entries']) == 4

    def test__inbox_list__received_timestamp_from_filename(self):
        self._append()
        listing = self.service.inbox_list(VAULT_ID, ENUM_KEY)
        received = listing['entries'][0]['received']
        now_ms = int(time.time() * 1000)
        assert abs(received - now_ms) < 5000
