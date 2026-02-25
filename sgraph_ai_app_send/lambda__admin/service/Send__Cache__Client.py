# ===============================================================================
# SGraph Send - Cache Client Wrapper
# Thin wrapper over MGraph-AI Cache Service Client for SGraph Send domain
# Follows Html_Cache__Client pattern: Type_Safe wrapper with domain-specific methods
# ===============================================================================

from mgraph_ai_service_cache_client.client.cache_client.Cache__Service__Client                  import Cache__Service__Client
from osbot_utils.helpers.cache.Cache__Hash__Generator                                           import Cache__Hash__Generator
from osbot_utils.type_safe.Type_Safe                                                            import Type_Safe

NS_ANALYTICS  = 'analytics'                                                # Raw events + aggregations
NS_TOKENS     = 'tokens'                                                   # Token metadata + usage events
NS_COSTS      = 'costs'                                                    # AWS cost data
NS_TRANSFERS  = 'transfers'                                                # Per-transfer analytics summaries
NS_KEYS       = 'keys'                                                     # Public key registry entries
NS_USERS      = 'users'                                                     # User identity records
NS_ROOMS      = 'rooms'                                                     # Data room metadata
NS_INVITES    = 'invites'                                                   # Data room invite codes
NS_AUDIT      = 'audit'                                                     # Immutable audit trail
NS_SESSIONS   = 'sessions'                                                  # Room-scoped session tokens


class Send__Cache__Client(Type_Safe):                                      # Cache service client wrapper for SGraph Send
    cache_client   : Cache__Service__Client                                # Official cache service client
    hash_generator : Cache__Hash__Generator                                # Hash generator for cache keys

    # ═══════════════════════════════════════════════════════════════════════
    # Health
    # ═══════════════════════════════════════════════════════════════════════

    def health_check(self):                                                # Check cache service availability
        result = self.cache_client.info().health()
        if result:
            return result.get('status') == 'ok'
        return False

    # ═══════════════════════════════════════════════════════════════════════
    # Analytics Operations
    # ═══════════════════════════════════════════════════════════════════════

    def analytics__record_event(self, event_data):                         # Record raw analytics event via TEMPORAL strategy
        return self.cache_client.store().store__json(namespace = NS_ANALYTICS ,
                                                     strategy  = 'temporal'   ,
                                                     body      = event_data   )  # todo: no need to have try catch here, this will return None if save failed
    
    def analytics__list_recent_files(self, path_prefix):                   # List files under analytics temporal path
        result = self.cache_client.admin_storage().files__all__path(
            path = f'{NS_ANALYTICS}/{path_prefix}')
        if result and hasattr(result, 'files'):
            return result.files
        return []

    def analytics__retrieve_event(self, cache_id):                         # Retrieve a single analytics event by cache_id
        return self.cache_client.retrieve().retrieve__cache_id__json(
            cache_id  = cache_id     ,
            namespace = NS_ANALYTICS )

    # ═══════════════════════════════════════════════════════════════════════
    # Token Operations
    # ═══════════════════════════════════════════════════════════════════════

    def token__create(self, token_data):                                   # Create a new token via KEY_BASED strategy
        token_name = token_data.get('token_name', '')
        return self.cache_client.store().store__json__cache_key(
            namespace       = NS_TOKENS       ,
            strategy        = 'key_based'     ,
            cache_key       = token_name      ,
            file_id         = token_name      ,
            body            = token_data      ,
            json_field_path = 'token_name'    )

    def token__lookup(self, token_name):                                   # Find token by name (hash lookup)
        cache_hash = self.hash_generator.from_string(token_name)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_TOKENS       )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id   ,
                namespace = NS_TOKENS  )
        return None

    def token__lookup_cache_id(self, token_name):                          # Get cache_id for a token by name
        cache_hash = self.hash_generator.from_string(token_name)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_TOKENS       )
        if response:
            return response.get('cache_id')
        return None

    def token__update(self, cache_id, token_data):                         # Update token data
        return self.cache_client.update().update__json(
            cache_id  = cache_id    ,
            namespace = NS_TOKENS   ,
            body      = token_data  )

    def token__use(self, token_name, usage_event_data):                    # Record a token usage event as child data
        cache_id = self.token__lookup_cache_id(token_name)
        if cache_id is None:
            return None
        event_id = usage_event_data.get('event_id', '')
        return self.cache_client.data_store().data__store_json__with__id_and_key(
            cache_id     = cache_id           ,
            namespace    = NS_TOKENS          ,
            data_key     = 'usage_events'     ,
            data_file_id = event_id           ,
            body         = usage_event_data   )

    def token__revoke(self, token_name):                                   # Revoke a token (update status to 'revoked')
        cache_id = self.token__lookup_cache_id(token_name)
        if cache_id is None:
            return False
        token_data = self.cache_client.retrieve().retrieve__cache_id__json(
            cache_id  = cache_id   ,
            namespace = NS_TOKENS  )
        if token_data is None:
            return False
        token_data['status']     = 'revoked'
        result = self.cache_client.update().update__json(
            cache_id  = cache_id    ,
            namespace = NS_TOKENS   ,
            body      = token_data  )
        if result and hasattr(result, 'updated_content'):
            return result.updated_content
        return False

    def token__list_all(self):                                             # List unique token names from storage
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_TOKENS}/data/key-based/' ,
            return_full_path = False                           ,
            recursive        = False                           ) or []

    def token__list_all_with_details(self):                               # List all tokens with full data (bulk)
        token_names = self.token__list_all()
        tokens      = []
        for token_name in token_names:
            if token_name:
                detail = self.token__lookup(token_name)
                if detail:
                    tokens.append(detail)
        return tokens

    def token__list_data(self, token_name):                              # List data files for a specific token
        cache_id = self.token__lookup_cache_id(token_name)
        if cache_id is None:
            return None
        return self.cache_client.data().list().data__list(
            cache_id  = cache_id   ,
            namespace = NS_TOKENS  )

    # ═══════════════════════════════════════════════════════════════════════
    # Key Registry Operations
    # ═══════════════════════════════════════════════════════════════════════

    def key__create(self, key_data):                                        # Create a new key entry via KEY_BASED strategy
        code = key_data.get('code', '')
        result = self.cache_client.store().store__json__cache_key(
            namespace       = NS_KEYS         ,
            strategy        = 'key_based'     ,
            cache_key       = code            ,
            file_id         = code            ,
            body            = key_data        ,
            json_field_path = 'code'          )
        if result and hasattr(result, 'cache_id'):
            return result
        return None

    def key__lookup(self, code):                                            # Find key by lookup code (hash lookup)
        cache_hash = self.hash_generator.from_string(code)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_KEYS         )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id ,
                namespace = NS_KEYS  )
        return None

    def key__lookup_cache_id(self, code):                                   # Get cache_id for a key by code
        cache_hash = self.hash_generator.from_string(code)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_KEYS         )
        if response:
            return response.get('cache_id')
        return None

    def key__update(self, cache_id, key_data):                              # Update key data
        return self.cache_client.update().update__json(
            cache_id  = cache_id  ,
            namespace = NS_KEYS   ,
            body      = key_data  )

    def key__list_all(self):                                                # List all key codes from storage
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_KEYS}/data/key-based/' ,
            return_full_path = False                         ,
            recursive        = False                         ) or []

    def key__index_fingerprint(self, fingerprint, code):                    # Create fingerprint→code index
        index_data = dict(fingerprint=fingerprint, code=code)
        fp_hex     = fingerprint.replace('sha256:', '')
        return self.cache_client.store().store__json__cache_key(
            namespace       = NS_KEYS                         ,
            strategy        = 'key_based'                     ,
            cache_key       = f'idx-fp-{fp_hex}'              ,
            file_id         = f'idx-fp-{fp_hex}'              ,
            body            = index_data                      ,
            json_field_path = 'fingerprint'                   )

    def key__lookup_by_fingerprint(self, fingerprint):                      # Check if fingerprint already exists
        fp_hex     = fingerprint.replace('sha256:', '')
        cache_hash = self.hash_generator.from_string(f'idx-fp-{fp_hex}')
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_KEYS         )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id ,
                namespace = NS_KEYS  )
        return None

    def key__append_log(self, log_entry):                                   # Append entry to transparency log
        seq     = log_entry.get('seq', 0)
        log_key = f'log-{seq:08d}'
        log_entry['log_key'] = log_key                                      # Add key field so hash matches
        return self.cache_client.store().store__json__cache_key(
            namespace       = NS_KEYS                                 ,
            strategy        = 'key_based'                             ,
            cache_key       = log_key                                 ,
            file_id         = log_key                                 ,
            body            = log_entry                               ,
            json_field_path = 'log_key'                               )

    def key__get_log_entries(self):                                          # Get all transparency log entries
        all_codes = self.key__list_all()
        log_codes = sorted([c for c in all_codes if c.startswith('log-')])
        entries   = []
        for log_key in log_codes:
            cache_hash = self.hash_generator.from_string(log_key)
            response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
                cache_hash = str(cache_hash) ,
                namespace  = NS_KEYS         )
            if response and response.get('cache_id'):
                entry = self.cache_client.retrieve().retrieve__cache_id__json(
                    cache_id  = response['cache_id'] ,
                    namespace = NS_KEYS              )
                if entry:
                    entries.append(entry)
        return entries

    # ═══════════════════════════════════════════════════════════════════════
    # User Operations
    # ═══════════════════════════════════════════════════════════════════════

    def user__create(self, user_data):                                        # Create a new user via KEY_BASED strategy
        user_id = user_data.get('user_id', '')
        result = self.cache_client.store().store__json__cache_key(
            namespace       = NS_USERS        ,
            strategy        = 'key_based'     ,
            cache_key       = user_id         ,
            file_id         = user_id         ,
            body            = user_data       ,
            json_field_path = 'user_id'       )
        if result and hasattr(result, 'cache_id'):
            return result
        return None

    def user__lookup(self, user_id):                                          # Find user by user_id (hash lookup)
        cache_hash = self.hash_generator.from_string(user_id)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_USERS        )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id  ,
                namespace = NS_USERS  )
        return None

    def user__lookup_cache_id(self, user_id):                                 # Get cache_id for a user by user_id
        cache_hash = self.hash_generator.from_string(user_id)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_USERS        )
        if response:
            return response.get('cache_id')
        return None

    def user__update(self, cache_id, user_data):                              # Update user data
        return self.cache_client.update().update__json(
            cache_id  = cache_id   ,
            namespace = NS_USERS   ,
            body      = user_data  )

    def user__list_all(self):                                                 # List all user IDs from storage
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_USERS}/data/key-based/' ,
            return_full_path = False                          ,
            recursive        = False                          ) or []

    def user__index_fingerprint(self, fingerprint, user_id):                  # Create fingerprint→user_id index
        fp_hex     = fingerprint.replace('sha256:', '')
        fp_key     = f'idx-fp-{fp_hex}'
        index_data = dict(fp_key      = fp_key       ,                       # Must match cache_key for hash alignment
                          fingerprint = fingerprint   ,
                          user_id     = user_id       )
        return self.cache_client.store().store__json__cache_key(
            namespace       = NS_USERS        ,
            strategy        = 'key_based'     ,
            cache_key       = fp_key          ,
            file_id         = fp_key          ,
            body            = index_data      ,
            json_field_path = 'fp_key'        )

    def user__lookup_by_fingerprint(self, fingerprint):                       # Look up user by fingerprint index
        fp_hex     = fingerprint.replace('sha256:', '')
        fp_key     = f'idx-fp-{fp_hex}'
        cache_hash = self.hash_generator.from_string(fp_key)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_USERS        )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id ,
                namespace = NS_USERS )
        return None

    # ═══════════════════════════════════════════════════════════════════════
    # Room Operations (Data Room entity)
    # ═══════════════════════════════════════════════════════════════════════

    def room__create(self, room_data):                                        # Create a new room via KEY_BASED strategy
        room_id = room_data.get('room_id', '')
        result = self.cache_client.store().store__json__cache_key(
            namespace       = NS_ROOMS         ,
            strategy        = 'key_based'      ,
            cache_key       = room_id          ,
            file_id         = room_id          ,
            body            = room_data        ,
            json_field_path = 'room_id'        )
        if result and hasattr(result, 'cache_id'):
            return result
        return None

    def room__lookup(self, room_id):                                          # Find room by room_id (hash lookup)
        cache_hash = self.hash_generator.from_string(room_id)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_ROOMS        )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id  ,
                namespace = NS_ROOMS  )
        return None

    def room__lookup_cache_id(self, room_id):                                 # Get cache_id for a room by room_id
        cache_hash = self.hash_generator.from_string(room_id)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_ROOMS        )
        if response:
            return response.get('cache_id')
        return None

    def room__update(self, cache_id, room_data):                              # Update room data
        return self.cache_client.update().update__json(
            cache_id  = cache_id   ,
            namespace = NS_ROOMS   ,
            body      = room_data  )

    def room__list_all(self):                                                 # List all room IDs from storage
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_ROOMS}/data/key-based/' ,
            return_full_path = False                          ,
            recursive        = False                          ) or []

    # ═══════════════════════════════════════════════════════════════════════
    # Invite Operations (Data Room invite codes)
    # ═══════════════════════════════════════════════════════════════════════

    def invite__create(self, invite_data):                                    # Create a new invite via KEY_BASED strategy
        invite_code = invite_data.get('invite_code', '')
        result = self.cache_client.store().store__json__cache_key(
            namespace       = NS_INVITES       ,
            strategy        = 'key_based'      ,
            cache_key       = invite_code      ,
            file_id         = invite_code      ,
            body            = invite_data      ,
            json_field_path = 'invite_code'    )
        if result and hasattr(result, 'cache_id'):
            return result
        return None

    def invite__lookup(self, invite_code):                                    # Find invite by code (hash lookup)
        cache_hash = self.hash_generator.from_string(invite_code)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_INVITES      )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id    ,
                namespace = NS_INVITES  )
        return None

    def invite__lookup_cache_id(self, invite_code):                           # Get cache_id for an invite by code
        cache_hash = self.hash_generator.from_string(invite_code)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_INVITES      )
        if response:
            return response.get('cache_id')
        return None

    def invite__update(self, cache_id, invite_data):                          # Update invite data
        return self.cache_client.update().update__json(
            cache_id  = cache_id    ,
            namespace = NS_INVITES  ,
            body      = invite_data )

    def invite__list_all(self):                                               # List all invite codes from storage
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_INVITES}/data/key-based/' ,
            return_full_path = False                            ,
            recursive        = False                            ) or []

    # ═══════════════════════════════════════════════════════════════════════
    # Audit Operations (Immutable append-only event log)
    # ═══════════════════════════════════════════════════════════════════════

    def audit__append(self, audit_data):                                      # Append audit event via KEY_BASED strategy
        event_id = audit_data.get('event_id', '')
        result = self.cache_client.store().store__json__cache_key(
            namespace       = NS_AUDIT        ,
            strategy        = 'key_based'     ,
            cache_key       = event_id        ,
            file_id         = event_id        ,
            body            = audit_data      ,
            json_field_path = 'event_id'      )
        if result and hasattr(result, 'cache_id'):
            return result
        return None

    def audit__lookup(self, event_id):                                        # Retrieve audit event by event_id
        cache_hash = self.hash_generator.from_string(event_id)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_AUDIT        )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id  ,
                namespace = NS_AUDIT  )
        return None

    def audit__list_all(self):                                                # List all audit event IDs from storage
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_AUDIT}/data/key-based/' ,
            return_full_path = False                          ,
            recursive        = False                          ) or []

    # ═══════════════════════════════════════════════════════════════════════
    # Session Operations (Room-scoped session tokens)
    # ═══════════════════════════════════════════════════════════════════════

    def session__create(self, session_data):                                  # Create a new session via KEY_BASED strategy
        session_token = session_data.get('session_token', '')
        result = self.cache_client.store().store__json__cache_key(
            namespace       = NS_SESSIONS        ,
            strategy        = 'key_based'        ,
            cache_key       = session_token      ,
            file_id         = session_token      ,
            body            = session_data       ,
            json_field_path = 'session_token'    )
        if result and hasattr(result, 'cache_id'):
            return result
        return None

    def session__lookup(self, session_token):                                 # Find session by token (hash lookup)
        cache_hash = self.hash_generator.from_string(session_token)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_SESSIONS     )
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id    ,
                namespace = NS_SESSIONS )
        return None

    def session__lookup_cache_id(self, session_token):                        # Get cache_id for a session by token
        cache_hash = self.hash_generator.from_string(session_token)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash) ,
            namespace  = NS_SESSIONS     )
        if response:
            return response.get('cache_id')
        return None

    def session__update(self, cache_id, session_data):                        # Update session data
        return self.cache_client.update().update__json(
            cache_id  = cache_id     ,
            namespace = NS_SESSIONS  ,
            body      = session_data )
