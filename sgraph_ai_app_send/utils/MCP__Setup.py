# ===============================================================================
# SGraph Send - MCP Setup Utility
# Wraps fastapi-mcp integration for mounting MCP servers on FastAPI apps
# ===============================================================================

import asyncio
import logging

from osbot_utils.type_safe.Type_Safe    import Type_Safe
from fastapi_mcp.transport.http         import FastApiHttpSessionManager
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

logger = logging.getLogger(__name__)

ROUTES_PATHS__MCP    = ['/mcp'                                        ,
                        '/.well-known/oauth-protected-resource'       ,
                        '/.well-known/oauth-authorization-server'     ,
                        '/.well-known/openid-configuration'           ]
MCP_PROTOCOL_VERSION = '2025-06-18'


class MCP__Http__Stateless(FastApiHttpSessionManager):
    """HTTP transport with stateless sessions for Lambda compatibility.

    Lambda functions cannot persist session state between invocations.
    This subclass overrides the session manager to use stateless=True,
    making each request independent — no Mcp-Session-Id required."""

    async def _ensure_session_manager_started(self):
        if self._manager_started:
            return
        async with self._startup_lock:
            if self._manager_started:
                return
            self._session_manager = StreamableHTTPSessionManager(
                app               = self.mcp_server      ,
                event_store       = self.event_store      ,
                json_response     = self.json_response    ,
                stateless         = True                  ,
                security_settings = self.security_settings,
            )
            async def run_session_manager():
                try:
                    async with self._session_manager.run():
                        await asyncio.Event().wait()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("Error in stateless MCP session manager")
                    raise
            self._manager_task = asyncio.create_task(run_session_manager())
            self._manager_started = True
            await asyncio.sleep(0.1)


class MCP__Setup(Type_Safe):
    name            : str  = ""
    include_tags    : list = None
    exclude_tags    : list = None
    forward_headers : list = None                                                      # Header names to forward from MCP request to tool calls
    stateless       : bool = False                                                     # Lambda-compatible stateless mode

    def mount_mcp(self, fast_api_app):
        from fastapi_mcp import FastApiMCP
        self._set_short_operation_ids(fast_api_app)                                        # Shorten names before MCP reads OpenAPI
        kwargs = dict(fastapi               = fast_api_app        ,
                      name                   = self.name           ,
                      describe_all_responses = True                )
        if self.include_tags is not None:
            kwargs['include_tags'] = self.include_tags
        if self.exclude_tags is not None:
            kwargs['exclude_tags'] = self.exclude_tags
        if self.forward_headers is not None:
            kwargs['headers'] = self.forward_headers
        mcp = FastApiMCP(**kwargs)
        if self.stateless:
            self._mount_stateless(fast_api_app, mcp)
        else:
            mcp.mount_http()                                                               # HTTP transport (JSON-RPC over POST)
        return mcp

    def _set_short_operation_ids(self, fast_api_app):
        """Shorten operation_ids to fit Claude.ai's 64-char tool name limit.

        fastapi-mcp uses OpenAPI operationId as the MCP tool name. FastAPI's
        auto-generated IDs include the full path and method, exceeding 64 chars.
        This sets short IDs derived from: {tag}_{action} (e.g. vault_create)."""
        from fastapi.routing import APIRoute

        tags = set(self.include_tags or [])
        if not tags:
            return

        candidates = []
        for route in fast_api_app.routes:
            if not isinstance(route, APIRoute):
                continue
            route_tags = set(route.tags or [])
            if not route_tags.intersection(tags):
                continue

            tag    = route.tags[0]
            method = sorted(route.methods)[0].lower()

            # Extract action from path: strip tag prefix, remove {params}
            path_parts = [p for p in route.path.split('/')
                          if p and not p.startswith('{')]
            if path_parts and path_parts[0] == tag:
                path_parts = path_parts[1:]
            action = '_'.join(path_parts) or 'root'

            name = f"{tag}_{action}"
            candidates.append((route, name, method))

        # Find duplicate names (e.g. vault_folder for both POST and GET)
        name_counts = {}
        for _, name, _ in candidates:
            name_counts[name] = name_counts.get(name, 0) + 1

        # Set operation_id, appending HTTP method for duplicates
        for route, name, method in candidates:
            if name_counts[name] > 1:
                route.operation_id = f"{name}_{method}"
            else:
                route.operation_id = name

    def _mount_stateless(self, fast_api_app, mcp):
        """Mount MCP with stateless HTTP transport and authless discovery routes.

        Adds: stateless /mcp endpoint, HEAD with protocol version,
        and .well-known 404 responses for Claude.ai authless compatibility."""
        from fastapi             import Request
        from starlette.responses import Response, JSONResponse

        transport = MCP__Http__Stateless(mcp_server=mcp.server)

        @fast_api_app.api_route('/mcp', methods=['GET', 'POST', 'DELETE', 'HEAD'],
                                include_in_schema=False)
        async def handle_mcp(request: Request):
            if request.method == 'HEAD':
                return Response(headers={'MCP-Protocol-Version': MCP_PROTOCOL_VERSION})
            return await transport.handle_fastapi_request(request)

        async def well_known_not_found():
            return JSONResponse(status_code=404, content={'error': 'not_found'})

        for wk_path in ['/.well-known/oauth-protected-resource'  ,
                        '/.well-known/oauth-authorization-server',
                        '/.well-known/openid-configuration'      ]:
            fast_api_app.add_api_route(wk_path, well_known_not_found,
                                       methods=['GET'], include_in_schema=False)
