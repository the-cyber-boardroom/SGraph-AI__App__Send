# ===============================================================================
# SGraph Send - Analytics Middleware
# FastAPI middleware that records one raw analytics event per HTTP request
# Wraps all writes in try/except — analytics failures never affect user requests
# ===============================================================================

import hashlib
import secrets
import time

from starlette.middleware.base                                                  import BaseHTTPMiddleware
from starlette.requests                                                        import Request
from starlette.responses                                                       import Response
from sgraph_ai_app_send.lambda__admin.service.Send__Cache__Client              import Send__Cache__Client


def classify_event_type(path, method):                                     # Classify HTTP request into event type
    if '/transfers/upload'   in path : return 'file_upload'
    if '/transfers/download' in path : return 'file_download'
    if '/transfers/'         in path : return 'api_call'
    if method == 'GET'               : return 'page_view'
    return 'api_call'


def normalise_user_agent(user_agent):                                      # Extract browser family from user-agent string
    if not user_agent:
        return ''
    ua = user_agent.lower()
    if 'chrome'  in ua and 'edg' not in ua : return 'Chrome'
    if 'firefox' in ua                      : return 'Firefox'
    if 'safari'  in ua and 'chrome' not in ua : return 'Safari'
    if 'edg'     in ua                      : return 'Edge'
    return 'Other'


def hash_ip(ip_address):                                                   # SHA-256 hash of IP address
    if not ip_address:
        return ''
    return hashlib.sha256(ip_address.encode()).hexdigest()


class Middleware__Analytics(BaseHTTPMiddleware):                            # Records one raw event per HTTP request

    def __init__(self, app, send_cache_client: Send__Cache__Client):
        super().__init__(app)
        self.send_cache_client = send_cache_client

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response   = await call_next(request)
        duration   = int((time.time() - start_time) * 1000)

        try:
            client_ip  = request.client.host if request.client else ''
            user_agent = request.headers.get('user-agent', '')
            path       = request.url.path
            method     = request.method

            event_data = dict(
                event_id              = secrets.token_hex(8)               ,
                event_type            = classify_event_type(path, method)  ,
                path                  = path                               ,
                method                = method                             ,
                status_code           = response.status_code               ,
                duration_ms           = duration                           ,
                ip_hash               = hash_ip(client_ip)                 ,
                user_agent_normalised = normalise_user_agent(user_agent)   ,
                content_bytes         = int(response.headers.get('content-length', 0)),
                transfer_id           = ''                                 ,
                token_id              = ''                                 )

            self.send_cache_client.analytics__record_event(event_data)
        except Exception:                                                  # Never let analytics recording crash user requests
            pass

        return response
