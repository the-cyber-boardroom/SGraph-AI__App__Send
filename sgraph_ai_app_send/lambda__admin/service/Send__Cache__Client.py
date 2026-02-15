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
        result = self.cache_client.admin_storage().files__all__path(
            path = NS_TOKENS)
        if result and hasattr(result, 'files'):
            token_names = []
            seen        = set()
            prefix      = f'{NS_TOKENS}/data/key-based/'
            for file_path in result.files:
                if not file_path.startswith(prefix):                     # Skip refs/, non-data files
                    continue
                if not file_path.endswith('.json'):                      # Skip .json.config, .json.metadata
                    continue
                relative = file_path[len(prefix):]                       # e.g. "abc/abc.json"
                parts    = relative.split('/')
                if len(parts) == 2:                                      # Must be {name}/{name}.json exactly
                    token_name = parts[0]
                    if token_name not in seen:
                        seen.add(token_name)
                        token_names.append(token_name)
            return token_names
        return []
