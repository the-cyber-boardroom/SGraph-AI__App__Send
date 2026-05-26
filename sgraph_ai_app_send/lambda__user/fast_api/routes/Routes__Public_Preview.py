# ===============================================================================
# SGraph Send - Public Vault Preview Routes
# Crawler-visible Open Graph rendering + the card-tester data source for the
# deliberately-public vault preview. Reads only the already-public transfer;
# stores nothing; never touches vault contents; fails closed.
#
# CloudFront maps the public paths to these (DevOps, dev pack doc 02 §4.3/§6):
#   /en-gb/app/<public-id>      (crawler UA)  -> /api/public-preview/og/<id>
#   /en-gb/preview/<public-id>  (tester page) -> consumes /api/public-preview/info/<id>
# ===============================================================================

from fastapi                                                                       import Request, Response
from osbot_utils.utils.Env                                                         import get_env
from osbot_fast_api.api.routes.Fast_API__Routes                                    import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id    import Safe_Str__Id
from sgraph_ai_app_send.lambda__user.service.Public_Preview__Service               import Public_Preview__Service

TAG__ROUTES_PUBLIC_PREVIEW = 'api/public-preview'

ROUTES_PATHS__PUBLIC_PREVIEW = [f'/{TAG__ROUTES_PUBLIC_PREVIEW}/og/{{public_id}}'      ,
                                f'/{TAG__ROUTES_PUBLIC_PREVIEW}/og-image/{{public_id}}',
                                f'/{TAG__ROUTES_PUBLIC_PREVIEW}/info/{{public_id}}'    ]


class Routes__Public_Preview(Fast_API__Routes):
    tag              : str = TAG__ROUTES_PUBLIC_PREVIEW
    transfer_service : object = None                                             # Transfer__Service (download source)
    preview_service  : Public_Preview__Service = None

    def service(self) -> Public_Preview__Service:                                # Lazy — bind the shared transfer service
        if self.preview_service is None:
            self.preview_service = Public_Preview__Service(transfer_service=self.transfer_service)
        return self.preview_service

    def og__public_id(self, public_id: Safe_Str__Id, request: Request) -> Response:   # GET /api/public-preview/og/{public_id}
        # og:url must point at the canonical VAULT app page, not this API host — a
        # crawler may reach this route via a cross-host 302 (CloudFront bot rule), so
        # build it from PUBLIC_VAULT_APP_HOST (default dev.vault.sgraph.ai), not Host.
        app_host  = get_env('PUBLIC_VAULT_APP_HOST', '') or 'dev.vault.sgraph.ai'
        app_url   = f"https://{app_host}/en-gb/app/{public_id}"
        # og:image must be an HTTP URL (crawlers don't fetch data: URIs) — point it at the
        # og-image endpoint on whatever host served this OG HTML (so the crawler can reach it).
        proto     = request.headers.get('x-forwarded-proto', 'https')
        api_host  = request.headers.get('host', app_host)
        image_url = f"{proto}://{api_host}/api/public-preview/og-image/{public_id}"
        html      = self.service().render_og_html(str(public_id), app_url=app_url, image_url=image_url)
        return Response(content = html, media_type = 'text/html')

    def og_image__public_id(self, public_id: Safe_Str__Id) -> Response:          # GET /api/public-preview/og-image/{public_id}
        result = self.service().thumbnail_bytes(str(public_id))                  # decoded inline thumbnail (deliberately public)
        if not result:
            return Response(content = b'', status_code = 404)
        media, raw = result
        return Response(content = raw, media_type = media, headers = {'Cache-Control': 'public, max-age=300'})

    def info__public_id(self, public_id: Safe_Str__Id) -> dict:                  # GET /api/public-preview/info/{public_id} (tester page data)
        svc     = self.service()
        preview = svc.fetch_preview(str(public_id))
        return dict(found       = preview is not None              ,
                    preview     = preview or {}                    ,
                    transfer_id = svc.derive_transfer_id(str(public_id)) ,   # public — derivable by anyone from the public-id
                    read_key    = svc.read_key_base64url(str(public_id)) ,   # read-only, public-derivable (transparency / "open raw file" link)
                    timings     = getattr(svc, 'last_timings', {})     )

    def setup_routes(self):
        self.add_route_get(self.og__public_id      )
        self.add_route_get(self.og_image__public_id)
        self.add_route_get(self.info__public_id    )
        return self
