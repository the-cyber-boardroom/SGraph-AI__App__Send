# ===============================================================================
# SGraph Send - User Identity Service
# User lifecycle: create, lookup by ID, lookup by fingerprint
# Binds user identity to PKI key (one key = one user)
# Uses KEY_BASED strategy in the 'users' namespace
# ===============================================================================

import secrets
from   datetime                                                              import datetime, timezone
from   osbot_utils.type_safe.Type_Safe                                      import Type_Safe
from   sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client         import Send__Cache__Client


class Service__Users(Type_Safe):                                             # User identity management
    send_cache_client : Send__Cache__Client                                  # Injected cache client

    def create(self, display_name, key_fingerprint):                         # Create a new user, return user record
        if not display_name or not display_name.strip():
            return None
        if not key_fingerprint or not key_fingerprint.strip():
            return None

        # Check for duplicate fingerprint
        existing = self.lookup_by_fingerprint(key_fingerprint)
        if existing is not None:
            return None                                                      # User with this key already exists

        user_id = secrets.token_hex(6)                                       # 12-hex user ID

        user_data = dict(user_id         = user_id                                       ,
                         display_name    = display_name.strip()                           ,
                         key_fingerprint = key_fingerprint.strip()                        ,
                         created         = datetime.now(timezone.utc).isoformat()         ,
                         active          = True                                           )

        result = self.send_cache_client.user__create(user_data)
        if result is None:
            return None

        # Create fingerprint→user_id index for reverse lookup
        self.send_cache_client.user__index_fingerprint(key_fingerprint.strip(), user_id)

        return dict(user_id         = user_id                    ,
                    display_name    = user_data['display_name']  ,
                    key_fingerprint = user_data['key_fingerprint'],
                    created         = user_data['created']       )

    def lookup(self, user_id):                                               # Lookup user by user_id
        entry = self.send_cache_client.user__lookup(user_id)
        if entry is None:
            return None
        if not entry.get('active', True):
            return None
        return entry

    def lookup_by_fingerprint(self, key_fingerprint):                        # Lookup user by PKI key fingerprint
        index = self.send_cache_client.user__lookup_by_fingerprint(key_fingerprint.strip())
        if index is None:
            return None
        user_id = index.get('user_id')
        if user_id:
            return self.lookup(user_id)
        return None

    def deactivate(self, user_id):                                           # Soft-delete a user
        entry = self.send_cache_client.user__lookup(user_id)
        if entry is None:
            return None

        entry['active'] = False
        cache_id = self.send_cache_client.user__lookup_cache_id(user_id)
        if cache_id:
            self.send_cache_client.user__update(cache_id, entry)

        return dict(user_id = user_id          ,
                    status  = 'deactivated'    )

    def list_users(self):                                                    # List all active users
        user_ids = self.send_cache_client.user__list_all()
        users    = []
        for user_id in user_ids:
            if user_id and not user_id.startswith('idx-'):
                entry = self.send_cache_client.user__lookup(user_id)
                if entry and entry.get('active', True):
                    users.append(entry)
        return users
