# ===============================================================================
# SGraph Send - Token Service
# Token lifecycle management: create, lookup, use, revoke, list
# Uses KEY_BASED strategy in the 'tokens' namespace
# ===============================================================================

import secrets
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client              import Send__Cache__Client


class Service__Tokens:                                                     # Token lifecycle management

    def __init__(self, send_cache_client: Send__Cache__Client):
        self.send_cache_client = send_cache_client

    def create(self, token_name, usage_limit, created_by='admin', metadata=None):  # Create a new token
        existing = self.send_cache_client.token__lookup(token_name)
        if existing is not None:
            return None                                                    # Token name already exists

        token_data = dict(
            token_name  = token_name                 ,
            usage_limit = usage_limit                ,
            usage_count = 0                          ,
            status      = 'active'                   ,
            created_by  = created_by                 ,
            metadata    = metadata or {}             )

        result = self.send_cache_client.token__create(token_data)
        if result and hasattr(result, 'cache_id'):
            return dict(cache_id   = str(result.cache_id) ,
                        token_name = token_name            )
        return None

    def lookup(self, token_name):                                          # Find token by name
        return self.send_cache_client.token__lookup(token_name)

    def use(self, token_name, ip_hash='', action='page_opened', transfer_id=''):  # Record a token usage
        token_data = self.send_cache_client.token__lookup(token_name)
        if token_data is None:
            return dict(success=False, reason='not_found')

        status = token_data.get('status', '')
        if status == 'revoked':
            return dict(success=False, reason='revoked')
        if status == 'exhausted':
            return dict(success=False, reason='exhausted')

        usage_limit = token_data.get('usage_limit', 0)
        usage_count = token_data.get('usage_count', 0)
        if usage_limit > 0 and usage_count >= usage_limit:
            token_data['status'] = 'exhausted'
            cache_id = self.send_cache_client.token__lookup_cache_id(token_name)
            if cache_id:
                self.send_cache_client.token__update(cache_id, token_data)
            return dict(success=False, reason='exhausted')

        token_data['usage_count'] = usage_count + 1
        if usage_limit > 0 and token_data['usage_count'] >= usage_limit:
            token_data['status'] = 'exhausted'

        cache_id = self.send_cache_client.token__lookup_cache_id(token_name)
        if cache_id is None:
            return dict(success=False, reason='not_found')

        self.send_cache_client.token__update(cache_id, token_data)

        event_id = secrets.token_hex(8)
        usage_event = dict(
            event_id         = event_id     ,
            ip_hash          = ip_hash      ,
            action           = action       ,
            transfer_id      = transfer_id  ,
            success          = True         ,
            rejection_reason = ''           )

        self.send_cache_client.token__use(token_name, usage_event)

        return dict(success    = True                              ,
                    usage_count = token_data['usage_count']         ,
                    remaining   = max(0, usage_limit - token_data['usage_count']) if usage_limit > 0 else -1)

    def revoke(self, token_name):                                          # Revoke a token
        return self.send_cache_client.token__revoke(token_name)

    def list_tokens(self):                                                 # List all token files
        return self.send_cache_client.token__list_all()
