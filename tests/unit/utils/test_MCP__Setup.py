from unittest                                import TestCase
from fastapi                                 import FastAPI
from sgraph_ai_app_send.utils.MCP__Setup     import MCP__Setup, ROUTES_PATHS__MCP


class test_MCP__Setup(TestCase):

    def test__init__(self):
        mcp_setup = MCP__Setup(name='test-mcp', include_tags=['tokens'])
        assert type(mcp_setup)       is MCP__Setup
        assert mcp_setup.name        == 'test-mcp'
        assert mcp_setup.include_tags == ['tokens']
        assert mcp_setup.exclude_tags is None

    def test__routes_paths_constant(self):
        assert ROUTES_PATHS__MCP == ['/mcp']

    def test__mount_mcp(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        @app.get('/internal/status', tags=['internal'])
        def status():
            return {'status': 'ok'}

        mcp_setup = MCP__Setup(name         = 'test-mcp'  ,
                               include_tags = ['test']     )
        mcp = mcp_setup.mount_mcp(app)

        assert mcp is not None

        # Verify /mcp route is registered
        route_paths = [r.path for r in app.routes if hasattr(r, 'path')]
        assert '/mcp' in route_paths

    def test__mount_mcp__tag_filtering(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        @app.get('/admin/secret', tags=['admin'])
        def secret():
            return {'secret': 'value'}

        mcp_setup = MCP__Setup(name         = 'filtered-mcp'  ,
                               include_tags = ['test']         )
        mcp_setup.mount_mcp(app)

        from starlette.testclient import TestClient
        headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}

        with TestClient(app) as client:
            # Initialize MCP session
            init_response = client.post('/mcp', headers=headers, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test', 'version': '0.1'}
                }
            })
            assert init_response.status_code == 200
            session_id = init_response.headers.get('mcp-session-id', '')

            session_headers = {**headers, 'mcp-session-id': session_id}

            # Send initialized notification
            client.post('/mcp', headers=session_headers, json={
                'jsonrpc': '2.0', 'method': 'notifications/initialized'
            })

            # List tools — only 'test' tag routes should appear
            list_response = client.post('/mcp', headers=session_headers, json={
                'jsonrpc': '2.0', 'method': 'tools/list', 'id': 2, 'params': {}
            })
            assert list_response.status_code == 200
            tools = list_response.json()['result']['tools']
            tool_names = [t['name'] for t in tools]
            assert len(tools) == 1                                                   # Only 'hello' from 'test' tag
            assert any('hello' in name for name in tool_names)                       # hello route included
            assert not any('secret' in name for name in tool_names)                  # admin route excluded
