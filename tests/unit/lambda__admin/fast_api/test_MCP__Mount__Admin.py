from unittest                                                                       import TestCase
from osbot_utils.utils.Env                                                          import get_env
from starlette.testclient                                                           import TestClient
from osbot_fast_api.api.Fast_API                                                    import ENV_VAR__FAST_API__AUTH__API_KEY__NAME, ENV_VAR__FAST_API__AUTH__API_KEY__VALUE
from sgraph_ai_app_send.lambda__admin.fast_api.Fast_API__SGraph__App__Send__Admin   import Fast_API__SGraph__App__Send__Admin
from tests.unit.lambda__admin.Fast_API__Test_Objs__SGraph__App__Send__Admin         import setup__html_graph_service__fast_api_test_objs

MCP_HEADERS = {'Accept': 'application/json', 'Content-Type': 'application/json'}

class test_MCP__Mount__Admin(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__html_graph_service__fast_api_test_objs() as _:                  # Sets auth env vars
            cls.fast_api = _.fast_api
            cls.app      = _.fast_api__app

        # Build auth-aware MCP headers (Admin Lambda requires API key)
        auth_key_name  = get_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME )
        auth_key_value = get_env(ENV_VAR__FAST_API__AUTH__API_KEY__VALUE)
        cls.mcp_headers = {**MCP_HEADERS, auth_key_name: auth_key_value}

    def test__mcp_endpoint_exists(self):
        route_paths = [r.path for r in self.app.routes if hasattr(r, 'path')]
        assert '/mcp' in route_paths

    def test__mcp_initialize(self):
        # Fresh app needed — MCP session manager requires lifespan context
        fresh_app = Fast_API__SGraph__App__Send__Admin().setup().app()
        with TestClient(fresh_app) as client:
            response = client.post('/mcp', headers=self.mcp_headers, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test-admin', 'version': '0.1'}
                }
            })
            assert response.status_code == 200
            result = response.json()['result']
            assert result['serverInfo']['name'] == 'sgraph-send-admin'
            assert result['capabilities']['tools'] is not None

    def test__mcp_lists_tools(self):
        # Fresh app needed — MCP session manager requires lifespan context
        fresh_app = Fast_API__SGraph__App__Send__Admin().setup().app()
        with TestClient(fresh_app) as client:
            # Initialize
            init_response = client.post('/mcp', headers=self.mcp_headers, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test-admin', 'version': '0.1'}
                }
            })
            assert init_response.status_code == 200
            session_id      = init_response.headers.get('mcp-session-id', '')
            session_headers = {**self.mcp_headers, 'mcp-session-id': session_id}

            # Send initialized notification
            client.post('/mcp', headers=session_headers, json={
                'jsonrpc': '2.0', 'method': 'notifications/initialized'
            })

            # List tools
            list_response = client.post('/mcp', headers=session_headers, json={
                'jsonrpc': '2.0', 'method': 'tools/list', 'id': 2, 'params': {}
            })
            assert list_response.status_code == 200
            tools      = list_response.json()['result']['tools']
            tool_names = [t['name'] for t in tools]
            assert len(tools) > 0                                                    # At least some tools discovered

            # Admin routes should be present (tokens, keys, vault, users)
            has_tokens = any('token' in name.lower() for name in tool_names)
            has_keys   = any('key'   in name.lower() for name in tool_names)
            has_vault  = any('vault' in name.lower() for name in tool_names)
            has_users  = any('user'  in name.lower() for name in tool_names)
            assert has_tokens, f'Expected tokens tools in {tool_names}'
            assert has_keys  , f'Expected keys tools in {tool_names}'
            assert has_vault , f'Expected vault tools in {tool_names}'
            assert has_users , f'Expected users tools in {tool_names}'

            # Internal routes should NOT be present (info, cache browser, metrics, set-cookie)
            has_info    = any('health'           in name.lower() for name in tool_names)
            has_cache   = any(name.lower().startswith('cache_')  for name in tool_names)  # Cache browser routes (not vault_cache_key params)
            has_metrics = any('metric'           in name.lower() for name in tool_names)
            assert not has_info   , f'info routes should be excluded, found in {tool_names}'
            assert not has_cache  , f'cache browser routes should be excluded, found in {tool_names}'
            assert not has_metrics, f'metrics routes should be excluded, found in {tool_names}'
