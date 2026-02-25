# ===============================================================================
# SGraph Send - MCP Setup Utility
# Wraps fastapi-mcp integration for mounting MCP servers on FastAPI apps
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe

ROUTES_PATHS__MCP = ['/mcp']

class MCP__Setup(Type_Safe):
    name         : str  = ""
    include_tags : list = None
    exclude_tags : list = None

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
        mcp.mount_http()                                                           # HTTP transport (JSON-RPC over POST) — works on Lambda
        return mcp
