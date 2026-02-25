from unittest                                import TestCase
from fastapi                                 import FastAPI
from sgraph_ai_app_send.utils.MCP__Setup     import MCP__Setup, ROUTES_PATHS__MCP, MCP_PROTOCOL_VERSION


class test_MCP__Setup(TestCase):

    def test__init__(self):
        mcp_setup = MCP__Setup(name='test-mcp', include_tags=['tokens'])
        assert type(mcp_setup)       is MCP__Setup
        assert mcp_setup.name        == 'test-mcp'
        assert mcp_setup.include_tags == ['tokens']
        assert mcp_setup.exclude_tags is None
        assert mcp_setup.stateless   is False

    def test__init__stateless(self):
        mcp_setup = MCP__Setup(name='test-mcp', stateless=True)
        assert mcp_setup.stateless is True

    def test__routes_paths_constant(self):
        assert '/mcp'                                    in ROUTES_PATHS__MCP
        assert '/.well-known/oauth-protected-resource'   in ROUTES_PATHS__MCP
        assert '/.well-known/oauth-authorization-server' in ROUTES_PATHS__MCP
        assert '/.well-known/openid-configuration'       in ROUTES_PATHS__MCP

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

    def test__short_operation_ids(self):
        app = FastAPI()

        @app.post('/vault/folder', tags=['vault'])
        def folder():
            return {'created': True}

        @app.get('/vault/folder/{vault_cache_key}/{folder_guid}', tags=['vault'])
        def folder_get(vault_cache_key: str, folder_guid: str):
            return {'folder': folder_guid}

        @app.get('/vault/folders/{vault_cache_key}', tags=['vault'])
        def folders(vault_cache_key: str):
            return {'folders': []}

        mcp_setup = MCP__Setup(name='test', include_tags=['vault'])
        mcp_setup._set_short_operation_ids(app)

        from fastapi.routing import APIRoute
        op_ids = {r.operation_id for r in app.routes if isinstance(r, APIRoute) and r.operation_id}
        assert 'vault_folder_post' in op_ids                                           # Deduped with method suffix
        assert 'vault_folder_get'  in op_ids                                           # Deduped with method suffix
        assert 'vault_folders'     in op_ids                                           # Unique — no suffix needed
        for op_id in op_ids:
            assert len(op_id) <= 64, f'Tool name too long ({len(op_id)} chars): {op_id}'

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

    def test__mount_mcp__stateless(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        mcp_setup = MCP__Setup(name         = 'stateless-mcp' ,
                               include_tags = ['test']         ,
                               stateless    = True             )
        mcp = mcp_setup.mount_mcp(app)

        assert mcp is not None

        # Verify routes registered: /mcp + 3 well-known endpoints
        route_paths = [r.path for r in app.routes if hasattr(r, 'path')]
        assert '/mcp'                                        in route_paths
        assert '/.well-known/oauth-protected-resource'       in route_paths
        assert '/.well-known/oauth-authorization-server'     in route_paths
        assert '/.well-known/openid-configuration'           in route_paths

    def test__stateless__initialize_no_session_id(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        MCP__Setup(name='stateless-mcp', include_tags=['test'], stateless=True).mount_mcp(app)

        from starlette.testclient import TestClient
        headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}

        with TestClient(app) as client:
            response = client.post('/mcp', headers=headers, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test', 'version': '0.1'}
                }
            })
            assert response.status_code == 200
            assert response.headers.get('mcp-session-id') is None                       # Stateless: no session ID

    def test__stateless__tools_list_without_session(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        MCP__Setup(name='stateless-mcp', include_tags=['test'], stateless=True).mount_mcp(app)

        from starlette.testclient import TestClient
        headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}

        with TestClient(app) as client:
            # Initialize (no session ID returned)
            client.post('/mcp', headers=headers, json={
                'jsonrpc': '2.0', 'method': 'initialize', 'id': 1,
                'params': {
                    'protocolVersion': '2024-11-05',
                    'capabilities': {},
                    'clientInfo': {'name': 'test', 'version': '0.1'}
                }
            })

            # Initialized notification (no session header needed)
            client.post('/mcp', headers=headers, json={
                'jsonrpc': '2.0', 'method': 'notifications/initialized'
            })

            # List tools — works without session ID
            list_response = client.post('/mcp', headers=headers, json={
                'jsonrpc': '2.0', 'method': 'tools/list', 'id': 2, 'params': {}
            })
            assert list_response.status_code == 200
            tools = list_response.json()['result']['tools']
            assert len(tools) == 1
            assert any('hello' in t['name'] for t in tools)

    def test__stateless__head_returns_protocol_version(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        MCP__Setup(name='stateless-mcp', include_tags=['test'], stateless=True).mount_mcp(app)

        from starlette.testclient import TestClient

        with TestClient(app) as client:
            response = client.head('/mcp')
            assert response.status_code          == 200
            assert response.headers.get('mcp-protocol-version') == MCP_PROTOCOL_VERSION

    def test__stateless__well_known_returns_404(self):
        app = FastAPI()

        @app.get('/test/hello', tags=['test'])
        def hello():
            return {'message': 'hello'}

        MCP__Setup(name='stateless-mcp', include_tags=['test'], stateless=True).mount_mcp(app)

        from starlette.testclient import TestClient

        with TestClient(app) as client:
            for path in ['/.well-known/oauth-protected-resource'  ,
                         '/.well-known/oauth-authorization-server',
                         '/.well-known/openid-configuration'      ]:
                response = client.get(path)
                assert response.status_code == 404, f'{path} should return 404'
                assert response.json()      == {'error': 'not_found'}
