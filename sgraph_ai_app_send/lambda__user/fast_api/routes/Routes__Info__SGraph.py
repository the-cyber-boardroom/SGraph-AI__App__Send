from importlib.metadata                                       import version as pkg_version, PackageNotFoundError
from osbot_fast_api_serverless.fast_api.routes.Routes__Info   import Routes__Info, ROUTES_INFO__HEALTH__RETURN_VALUE
from sgraph_ai_app_send.utils.Version                         import version__sgraph_ai_app_send

TAG__ROUTES_INFO__SGRAPH    = 'api/info'
ROUTES_PATHS__INFO__SGRAPH  = [ f'/{TAG__ROUTES_INFO__SGRAPH}/health'  ,
                                f'/{TAG__ROUTES_INFO__SGRAPH}/server'  ,
                                f'/{TAG__ROUTES_INFO__SGRAPH}/status'  ,
                                f'/{TAG__ROUTES_INFO__SGRAPH}/version' ,
                                f'/{TAG__ROUTES_INFO__SGRAPH}/versions']

DEPENDENCIES__TRACKED = [ 'starlette'                       ,                # web framework core (BadHost CVE-2026-48710 surface)
                          'fastapi'                         ,                # web framework
                          'uvicorn'                         ,                # ASGI server (container)
                          'mangum'                          ,                # Lambda ASGI adapter
                          'pydantic'                        ,                # transitively required by fastapi
                          'httpx'                           ,                # http client
                          'boto3'                           ,                # AWS SDK (via osbot-aws)
                          'osbot-utils'                     ,                # Type_Safe base
                          'osbot-aws'                       ,                # AWS wrapper
                          'osbot-fast-api'                  ,                # Fast_API__Routes base
                          'osbot-fast-api-serverless'       ,                # Serverless__Fast_API base
                          'memory-fs'                       ,                # storage abstraction
                          'mgraph-ai-service-cache'         ,                # cache service (transfer index)
                          'mgraph-ai-service-cache-client'  ,                # cache service client
                          'fastapi-mcp'                     ]                # MCP mount


class Routes__Info__SGraph(Routes__Info):                                    # SGraph Send variant: /api/info/* prefix + richer dependency versions
    tag: str = TAG__ROUTES_INFO__SGRAPH

    def versions(self):                                                      # Returns {package_name: version} for app + all tracked dependencies
        result = {'sgraph_ai_app_send': str(version__sgraph_ai_app_send)}
        for dep in DEPENDENCIES__TRACKED:
            try:
                result[dep] = pkg_version(dep)
            except PackageNotFoundError:
                result[dep] = 'not-installed'
        return result
