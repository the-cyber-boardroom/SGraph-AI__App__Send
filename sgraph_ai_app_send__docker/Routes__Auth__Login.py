# ===============================================================================
# SG/Send Container — Friendly login page (single-key mode front door)
#
# Serves a branded login page at /auth/set-cookie-form — the SAME path the
# osbot-fast-api auth middleware excludes from API-key checks — replacing the
# generic "Auth Cookie Editor" from osbot_fast_api.Routes__Set_Cookie.
#
# Flow: enter access key → JS sets the auth cookie → verify against
# /api/info/health → redirect to the vault UI. Wrong key stays on the page
# with a clear error. The POST /auth/set-auth-cookie endpoint is kept for
# programmatic/cookie-jar clients (same contract as the osbot original).
#
# ADR-12 (multi-target deployment spec): in single-key deployments this page
# IS the login screen — caddy/ALB just proxy; the app's gate + this page do
# the work. No secrets are stored server-side; the cookie lives in the browser.
# ===============================================================================

from fastapi                                            import Request, Response
from fastapi.responses                                  import HTMLResponse
from osbot_fast_api.api.routes.Fast_API__Routes         import Fast_API__Routes
from osbot_fast_api.api.schemas.consts.consts__Fast_API import ENV_VAR__FAST_API__AUTH__API_KEY__NAME
from osbot_utils.type_safe.Type_Safe                    import Type_Safe
from osbot_utils.utils.Env                              import get_env

ROUTES_PATHS__AUTH_LOGIN = ['/auth/set-cookie-form' ,
                            '/auth/set-auth-cookie' ]

COOKIE_NAME__FALLBACK    = 'x-sgraph-access-token'


class Schema__Set_Cookie(Type_Safe):                                            # same shape as the osbot original — keeps existing clients working
    cookie_value : str


LOGIN_PAGE__CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       background: linear-gradient(160deg, #0d1117 0%, #10312b 100%);
       min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.card { background: #ffffff; border-radius: 14px; padding: 40px 36px; width: 100%; max-width: 420px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
.logo { font-size: 15px; font-weight: 700; letter-spacing: 0.4px; color: #10312b; margin-bottom: 4px; }
h1 { font-size: 24px; color: #111; margin-bottom: 6px; }
p.sub { color: #556; font-size: 14px; margin-bottom: 26px; line-height: 1.5; }
label { display: block; font-size: 13px; font-weight: 600; color: #334; margin-bottom: 6px; }
input[type=password] { width: 100%; padding: 12px 14px; font-size: 15px; font-family: ui-monospace, monospace;
        border: 1.5px solid #cfd8dc; border-radius: 8px; outline: none; }
input[type=password]:focus { border-color: #4ecdc4; box-shadow: 0 0 0 3px rgba(78,205,196,0.25); }
button { width: 100%; margin-top: 18px; padding: 12px; font-size: 15px; font-weight: 600; color: #fff;
         background: #10312b; border: none; border-radius: 8px; cursor: pointer; }
button:hover { background: #17493f; }
button:disabled { background: #9ab; cursor: wait; }
.error { display: none; margin-top: 14px; padding: 10px 12px; border-radius: 8px; font-size: 13px;
         background: #fdecea; color: #b3261e; border: 1px solid #f5c6c0; }
.hint { margin-top: 22px; font-size: 12px; color: #789; line-height: 1.6; }
.hint code { background: #f2f5f7; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
"""

LOGIN_PAGE__HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SG/Send — Sign in</title>
    <style>{css}</style>
</head>
<body>
    <div class="card">
        <div class="logo">SG/SEND</div>
        <h1>Sign in</h1>
        <p class="sub">This server is protected by an access key. Enter it once — it is stored
        as a cookie in your browser only.</p>
        <form id="loginForm">
            <label for="accessKey">Access key</label>
            <input type="password" id="accessKey" autocomplete="current-password"
                   placeholder="paste your access key" autofocus>
            <button type="submit" id="submitBtn">Unlock</button>
        </form>
        <div class="error" id="errorBox">That key was not accepted — check it and try again.</div>
        <div class="hint">
            API clients send the same key as a header:<br>
            <code>{cookie_name}: &lt;access-key&gt;</code><br>
            sgit: <code>sgit clone &lt;vault-key&gt; --endpoint {{origin}} --token &lt;access-key&gt;</code>
        </div>
    </div>
    <script>
    (function () {{
        var form   = document.getElementById('loginForm');
        var input  = document.getElementById('accessKey');
        var button = document.getElementById('submitBtn');
        var error  = document.getElementById('errorBox');
        form.addEventListener('submit', function (e) {{
            e.preventDefault();
            var key = input.value.trim();
            if (!key) {{ return; }}
            button.disabled = true;
            error.style.display = 'none';
            document.cookie = '{cookie_name}=' + encodeURIComponent(key) +
                              '; path=/; max-age=2592000; SameSite=Strict' +
                              (location.protocol === 'https:' ? '; Secure' : '');
            fetch('/api/info/health', {{ credentials: 'same-origin' }})
                .then(function (r) {{
                    if (r.ok) {{ window.location.href = '/'; }}
                    else {{
                        document.cookie = '{cookie_name}=; path=/; max-age=0';
                        error.style.display = 'block';
                        button.disabled = false;
                        input.select();
                    }}
                }})
                .catch(function () {{
                    error.style.display = 'block';
                    button.disabled = false;
                }});
        }});
    }})();
    </script>
</body>
</html>"""


class Routes__Auth__Login(Fast_API__Routes):                                     # Friendly single-key login — replaces osbot Routes__Set_Cookie
    tag : str = 'auth'

    def cookie_name(self):
        return get_env(ENV_VAR__FAST_API__AUTH__API_KEY__NAME) or COOKIE_NAME__FALLBACK

    def set_cookie_form(self):                                                   # GET /auth/set-cookie-form — the login page (auth-excluded path)
        html = LOGIN_PAGE__HTML.format(css         = LOGIN_PAGE__CSS   ,
                                       cookie_name = self.cookie_name())
        return HTMLResponse(content=html)

    def set_auth_cookie(self, set_cookie: Schema__Set_Cookie,                    # POST /auth/set-auth-cookie — programmatic cookie set (osbot-compatible)
                              request   : Request           ,
                              response  : Response           ):
        cookie_name = self.cookie_name()
        secure      = request.url.scheme == 'https'
        response.set_cookie(key      = cookie_name             ,
                            value    = set_cookie.cookie_value ,
                            max_age  = 30 * 24 * 3600          ,
                            path     = '/'                     ,
                            httponly = True                    ,
                            samesite = 'strict'                ,
                            secure   = secure                  )
        return dict(status = 'ok', cookie_name = cookie_name)

    def setup_routes(self):
        self.add_route_get (self.set_cookie_form)
        self.add_route_post(self.set_auth_cookie)
        return self
