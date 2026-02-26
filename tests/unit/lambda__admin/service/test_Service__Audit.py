# ===============================================================================
# Tests for Service__Audit
# Append-only audit trail: log, query, hash chaining
# ===============================================================================

from unittest                                                                   import TestCase
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Setup               import create_send_cache_client
from sgraph_ai_app_send.lambda__admin.service.Service__Audit                   import Service__Audit


class test_Service__Audit(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.cache_client = create_send_cache_client()
        cls.service      = Service__Audit(send_cache_client=cls.cache_client)

    # ═══════════════════════════════════════════════════════════════════════
    # Log Events
    # ═══════════════════════════════════════════════════════════════════════

    def test__01__log_event(self):
        result = self.service.log('room-aud-001', 'user-aud-001', 'room.created')
        assert result is not None
        assert 'event_id'   in result
        assert 'entry_hash' in result
        assert 'timestamp'  in result
        assert len(result['event_id'])   == 16                               # 16-hex event ID
        assert len(result['entry_hash']) == 16                               # 16-char truncated hash

    def test__02__log_event__with_target(self):
        result = self.service.log('room-aud-001', 'user-aud-001', 'file.uploaded',
                                   target_guid='file-001')
        assert result is not None

    def test__03__log_event__different_room(self):
        result = self.service.log('room-aud-002', 'user-aud-002', 'room.created')
        assert result is not None

    def test__04__log_event__with_metadata(self):
        result = self.service.log('room-aud-001', 'user-aud-001', 'member.added',
                                   target_guid='user-aud-003',
                                   metadata={'permission': 'viewer'})
        assert result is not None

    # ═══════════════════════════════════════════════════════════════════════
    # Hash Chain Integrity
    # ═══════════════════════════════════════════════════════════════════════

    def test__10__hash_chain__entries_have_hashes(self):
        events = self.service.query()
        assert len(events) >= 4
        for event in events:
            assert 'entry_hash' in event                                     # Every entry has a hash
            assert 'prev_hash'  in event                                     # Every entry has prev_hash field
            assert len(event['entry_hash']) == 16                            # 16-char truncated SHA-256

    def test__11__hash_chain__exactly_one_root(self):
        events = self.service.query()
        roots  = [e for e in events if e.get('prev_hash') == '']
        assert len(roots) == 1                                               # Exactly one entry with empty prev_hash (the first)

    # ═══════════════════════════════════════════════════════════════════════
    # Query Events
    # ═══════════════════════════════════════════════════════════════════════

    def test__20__query_all(self):
        events = self.service.query()
        assert len(events) >= 4                                              # All events logged above

    def test__21__query_by_room(self):
        events = self.service.get_room_events('room-aud-001')
        assert len(events) >= 3                                              # room.created, file.uploaded, member.added
        for event in events:
            assert event.get('room_id') == 'room-aud-001'

    def test__22__query_by_user(self):
        events = self.service.get_user_events('user-aud-001')
        assert len(events) >= 3
        for event in events:
            assert event.get('user_id') == 'user-aud-001'

    def test__23__query_by_action(self):
        events = self.service.query(action='room.created')
        assert len(events) >= 2                                              # room-aud-001 and room-aud-002
        for event in events:
            assert event.get('action') == 'room.created'

    def test__24__query_with_limit(self):
        events = self.service.query(limit=2)
        assert len(events) <= 2

    def test__25__query_combined_filters(self):
        events = self.service.query(room_id='room-aud-001', action='file.uploaded')
        assert len(events) >= 1
        for event in events:
            assert event.get('room_id') == 'room-aud-001'
            assert event.get('action')  == 'file.uploaded'
