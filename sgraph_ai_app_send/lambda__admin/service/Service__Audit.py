# ===============================================================================
# SGraph Send - Audit Service
# Append-only event log for data rooms (Decision 3)
# Uses KEY_BASED strategy in NS_AUDIT namespace — immutable, no update/delete
# Query by room_id, user_id, action type
# ===============================================================================

import secrets
import hashlib
from   datetime                                                              import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                      import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client         import Send__Cache__Client


class Service__Audit(Type_Safe):                                             # Immutable audit trail
    send_cache_client : Send__Cache__Client                                  # Cache client for audit storage
    _prev_hash        : str = ''                                             # Hash of previous entry (chain of trust)

    # ═══════════════════════════════════════════════════════════════════════
    # Log Events
    # ═══════════════════════════════════════════════════════════════════════

    def log(self, room_id, user_id, action, target_guid='',                  # Append an audit event (immutable)
            ip_hash='', metadata=None):
        event_id = secrets.token_hex(8)                                      # 16-char event ID
        now      = datetime.now(timezone.utc).isoformat()

        # Hash chain: each entry includes hash of previous entry
        entry_content = f'{event_id}:{room_id}:{user_id}:{action}:{now}:{self._prev_hash}'
        entry_hash    = hashlib.sha256(entry_content.encode()).hexdigest()[:16]

        audit_data = dict(event_id    = event_id                 ,
                          room_id     = room_id                  ,
                          user_id     = user_id                  ,
                          action      = action                   ,
                          target_guid = target_guid              ,
                          ip_hash     = ip_hash                  ,
                          timestamp   = now                      ,
                          prev_hash   = self._prev_hash          ,
                          entry_hash  = entry_hash               ,
                          metadata    = metadata or {}           )

        result = self.send_cache_client.audit__append(audit_data)
        if result is None:
            return None

        self._prev_hash = entry_hash

        return dict(event_id   = event_id   ,
                    entry_hash = entry_hash  ,
                    timestamp  = now         )

    # ═══════════════════════════════════════════════════════════════════════
    # Query Events
    # ═══════════════════════════════════════════════════════════════════════

    def query(self, room_id=None, user_id=None, action=None, limit=50):      # Query audit events with optional filters
        event_ids = self.send_cache_client.audit__list_all()
        events    = []

        for event_id in event_ids:
            if not event_id:
                continue
            event = self.send_cache_client.audit__lookup(event_id)
            if event:
                if room_id and event.get('room_id') != room_id:
                    continue
                if user_id and event.get('user_id') != user_id:
                    continue
                if action and event.get('action') != action:
                    continue
                events.append(event)
                if len(events) >= limit:
                    break

        return events

    def get_room_events(self, room_id, limit=50):                            # Shorthand: get events for a specific room
        return self.query(room_id=room_id, limit=limit)

    def get_user_events(self, user_id, limit=50):                            # Shorthand: get events for a specific user
        return self.query(user_id=user_id, limit=limit)
