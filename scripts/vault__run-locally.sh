#!/bin/bash
# ---------------------------------------------------------------------------
# Local dev server for the vault UI (dev.vault.sgraph.ai)
#
# Calls build-vault-static.sh to produce .local-server-vault/, then serves
# it with Python's built-in HTTP server.
#
# The vault UI uses Web Crypto API (AES-256-GCM) which requires either:
#   - https:// (production)
#   - http://localhost (local dev — this script)
# Using 127.0.0.1 will NOT work for Web Crypto.
# ---------------------------------------------------------------------------
PORT=10067
API_PORT=10068   # default port for user__run-locally.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SERVE_DIR="$REPO_ROOT/.local-server-vault"

# Parse flags
USE_LOCAL_API=0
for arg in "$@"; do
    case "$arg" in
        --local-api) USE_LOCAL_API=1 ;;
    esac
done

# Clean up on exit
cleanup() {
    echo ""
    echo "Stopping server..."
    rm -rf "$SERVE_DIR"
}
trap cleanup EXIT

# If --local-api, point all vault/app pages at the local API server
if [ "$USE_LOCAL_API" -eq 1 ]; then
    export VAULT_DEFAULT_ENDPOINT="http://localhost:$API_PORT"
    echo "  [local-api] Rewriting default endpoint → $VAULT_DEFAULT_ENDPOINT"
fi

# Build the static tree — exit loudly on failure so we never serve an empty dir
bash "$SCRIPT_DIR/build-vault-static.sh" "$SERVE_DIR" || {
    echo ""
    echo "ERROR: build-vault-static.sh failed — server not started."
    exit 1
}

echo ""
echo "Starting vault.sgraph.ai local server..."
echo "  Root:    $SERVE_DIR"
echo ""
echo "  URLs:"
echo "    Landing page:   http://localhost:$PORT/en-gb/"
echo "    Open vault:     http://localhost:$PORT/#your-token"
echo "    App page:       http://localhost:$PORT/en-gb/app/"
echo "    (en-gb/browse/ redirects to /#hash automatically)"
echo ""
echo "  IMPORTANT: Use 'localhost' not '127.0.0.1' (Web Crypto requires secure context)"
echo ""
echo "  Backend:"
if [ "$USE_LOCAL_API" -eq 1 ]; then
    echo "    Using local API: $VAULT_DEFAULT_ENDPOINT"
    echo "    Make sure user__run-locally.sh is running on port $API_PORT"
else
    echo "    Default:         https://dev.send.sgraph.ai (production)"
    echo "    Local API:       Run with --local-api flag to point all pages at"
    echo "                     http://localhost:$API_PORT (requires user__run-locally.sh)"
    echo ""
    echo "    Endpoint override (env var):"
    echo "      VAULT_DEFAULT_ENDPOINT=http://localhost:$API_PORT bash scripts/vault__run-locally.sh"
fi
echo ""
python3 << PYEOF
import http.server, os, re, urllib.parse
class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # SPA fallback: /en-gb/app/<public-id> and /en-gb/preview/<public-id> have no
    # file on disk (only index.html lives under those dirs). Rewrite a single-segment
    # path to the dir's index.html so the SPA boots and reads location.pathname.
    # This mirrors the CloudFront Function used in production (see scripts/cloudfront/).
    _SPA = re.compile(r'^/en-gb/(app|preview)/[^/]+/?$')
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        m = self._SPA.match(path)
        if m and not path.rstrip('/').endswith('index.html'):
            self.path = '/en-gb/%s/index.html' % m.group(1)
        return super().do_GET()
    def end_headers(self):
        # Disable all caching so the browser always fetches fresh JS/CSS
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
os.chdir('$SERVE_DIR')
http.server.HTTPServer(('localhost', $PORT), NoCacheHandler).serve_forever()
PYEOF
