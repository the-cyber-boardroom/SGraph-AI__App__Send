from unittest                                                                       import TestCase
from starlette.testclient                                                           import TestClient
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User     import Fast_API__SGraph__App__Send__User
from tests.unit.lambda__user.Fast_API__Test_Objs__SGraph__App__Send__User           import setup__fast_api__user__test_objs

MCP_HEADERS = {'Accept': 'application/json', 'Content-Type': 'application/json'}

class test_MCP__Mount__User(TestCase):

    @classmethod
    def setUpClass(cls):
        with setup__fast_api__user__test_objs() as _:
            cls.fast_api = _.fast_api
            cls.app      = _.fast_api__app

    def test__mcp_endpoint_exists(self):
        route_paths = [r.path for r in self.app.routes if hasattr(r, 'path')]
        assert '/mcp' in route_paths

    def test__mcp_initialize(self):
        # Fresh app needed — MCP session manager requires lifespan context
        fresh_app = Fast_API__SGraph__App__Send__User().setup().app()
        with TestClient(fresh_app) as client:
            response = client.post('/mcp', headers=MCP_HEADERS, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test-user', 'version': '0.1'}
                }
            })
            assert response.status_code == 200
            result = response.json()['result']
            assert result['serverInfo']['name'] == 'sgraph-send-user'
            assert result['capabilities']['tools'] is not None

    def test__mcp_lists_tools(self):
        # Fresh app needed — MCP session manager requires lifespan context
        fresh_app = Fast_API__SGraph__App__Send__User().setup().app()
        with TestClient(fresh_app) as client:
            # Initialize
            init_response = client.post('/mcp', headers=MCP_HEADERS, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test-user', 'version': '0.1'}
                }
            })
            assert init_response.status_code == 200
            session_id      = init_response.headers.get('mcp-session-id', '')
            session_headers = {**MCP_HEADERS, 'mcp-session-id': session_id}

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

            # User routes should be present (transfers, presigned)
            has_transfers = any('transfer' in name.lower() or 'create' in name.lower() for name in tool_names)
            assert has_transfers, f'Expected transfer tools in {tool_names}'

            # Vault pointer routes added to User Lambda for v0.10.35
            has_vault = any('vault' in name.lower() for name in tool_names)
            assert has_vault, f'Expected vault pointer tools in User Lambda MCP, not found in {tool_names}'

            # Internal routes should NOT be present (info)
            has_info = any('status' in name.lower() for name in tool_names)
            assert not has_info, f'info routes should be excluded, found in {tool_names}'
