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
    name         : str  = ""
    include_tags : list = None
    exclude_tags : list = None
    stateless    : bool = False                                                        # Lambda-compatible stateless mode

    def mount_mcp(self, fast_api_app):
        from fastapi_mcp import FastApiMCP
        kwargs = dict(fastapi               = fast_api_app        ,
                      name                   = self.name           ,
                      describe_all_responses = True                )
        if self.include_tags is not None:
            kwargs['include_tags'] = self.include_tags
        if self.exclude_tags is not None:
            kwargs['exclude_tags'] = self.exclude_tags
        mcp = FastApiMCP(**kwargs)
        if self.stateless:
            self._mount_stateless(fast_api_app, mcp)
        else:
            mcp.mount_http()                                                           # HTTP transport (JSON-RPC over POST)
        return mcp

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
