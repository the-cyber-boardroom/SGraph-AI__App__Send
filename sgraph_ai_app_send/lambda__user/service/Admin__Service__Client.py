# ===============================================================================
# SGraph Send - Admin Service Client
# Stateless facade for user Lambda to call admin Lambda via Service Registry
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                             import Type_Safe
from sgraph_ai_app_send.lambda__user.service.Admin__Service__Client__Requests    import Admin__Service__Client__Requests


class Admin__Service__Client(Type_Safe):                                         # Stateless facade — config lives in registry

    def requests(self):                                                          # Create transport with registry lookup key
        requests              = Admin__Service__Client__Requests()
        requests.service_type = Admin__Service__Client
        return requests

    def token_use(self, token_name, ip_hash='', action='page_opened', transfer_id=''):  # Record a token usage via admin service
        return self.requests().execute('POST', f'/tokens/use/{token_name}',
                                       body=dict(ip_hash     = ip_hash     ,
                                                 action      = action      ,
                                                 transfer_id = transfer_id ))

    def token_lookup(self, token_name):                                          # Look up token by name via admin service
        return self.requests().execute('GET', f'/tokens/lookup/{token_name}')

    def token_create(self, token_name, usage_limit=50, created_by='system', metadata=None):  # Create a new token via admin service
        return self.requests().execute('POST', '/tokens/create',
                                       body=dict(token_name  = token_name       ,
                                                 usage_limit = usage_limit      ,
                                                 created_by  = created_by       ,
                                                 metadata    = metadata or {}   ))
