#!/bin/bash
# ---------------------------------------------------------------------------
# Local dev server for the main website (dev.sgraph.ai)
#
# In production, the CI deploy script flattens the versioned IFD structure:
#   sgraph_ai__website/v0/v0.2/v0.2.0/en-gb/   →  latest/en-gb/
#   sgraph_ai__website/v0/v0.2/v0.2.0/_common/  →  latest/_common/
#
# This script replicates that locally by copying content from the versioned
# directory into a temporary directory that mirrors the production URL structure.
# IFD overlay: v0.2.0 is the base; any v0.2.1+ patches overlay on top.
#
# No Web Crypto / secure-context requirement — 127.0.0.1 or localhost both work.
# ---------------------------------------------------------------------------
PORT=10060
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WEBSITE_DIR="$REPO_ROOT/sgraph_ai__website"
SERVE_DIR="$REPO_ROOT/.local-server-website"

# ─── Discover all v0.2.x versions (IFD overlay pattern) ─────────────────────
VERSIONS=$(ls -d "$WEBSITE_DIR/v0/v0.2"/v0.2.* 2>/dev/null | xargs -n1 basename | sort -t. -k3 -n)
LATEST_VERSION=$(echo "$VERSIONS" | tail -1)

if [ -z "$LATEST_VERSION" ]; then
    echo "ERROR: No v0.2.x versions found in $WEBSITE_DIR/v0/v0.2/"
    exit 1
fi

# Clean up on exit
cleanup() {
    echo ""
    echo "Stopping server..."
    rm -rf "$SERVE_DIR"
}
trap cleanup EXIT

# ─── Build the local serve directory ──────────────────────────────────────────
# IFD overlay pattern: apply v0.2.0 base first, then overlay v0.2.1+ on top.
# This mirrors what deploy_static_site.py does when pushing to S3 latest/.

echo "Building local server directory (IFD overlay: $VERSIONS)..."
rm -rf "$SERVE_DIR"
mkdir -p "$SERVE_DIR"

for VERSION in $VERSIONS; do
    VERSION_DIR="$WEBSITE_DIR/v0/v0.2/$VERSION"
    if [ ! -d "$VERSION_DIR" ]; then
        echo "WARNING: $VERSION_DIR not found, skipping"
        continue
    fi

    echo "  Applying $VERSION ..."

    # _common/ (fonts, CSS, JS) — later versions overlay earlier ones
    if [ -d "$VERSION_DIR/_common" ]; then
        mkdir -p "$SERVE_DIR/_common"
        cp -r "$VERSION_DIR/_common"/. "$SERVE_DIR/_common/"
    fi

    # en-gb/ pages — later versions overlay earlier ones
    if [ -d "$VERSION_DIR/en-gb" ]; then
        mkdir -p "$SERVE_DIR/en-gb"
        cp -r "$VERSION_DIR/en-gb"/. "$SERVE_DIR/en-gb/"
    fi

    # Root index.html (redirect)
    [ -f "$VERSION_DIR/index.html" ] && cp "$VERSION_DIR/index.html" "$SERVE_DIR/index.html"
done

# ─── Start server ─────────────────────────────────────────────────────────────
echo ""
echo "Starting sgraph.ai local server ($LATEST_VERSION — IFD overlay: $VERSIONS)..."
echo "  Root:     $SERVE_DIR"
echo "  Versions: $VERSIONS"
echo ""
echo "  URLs:"
echo "    Home:         http://localhost:$PORT/"
echo "    EN-GB:        http://localhost:$PORT/en-gb/"
echo "    How it Works: http://localhost:$PORT/en-gb/how-it-works/"
echo "    Vaults:       http://localhost:$PORT/en-gb/vaults/"
echo "    Security:     http://localhost:$PORT/en-gb/security/"
echo "    Pricing:      http://localhost:$PORT/en-gb/pricing/"
echo ""
python3 -m http.server $PORT --directory "$SERVE_DIR" --bind localhost
