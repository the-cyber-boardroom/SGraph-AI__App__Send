#!/bin/bash
# ---------------------------------------------------------------------------
# Local dev server for the send UI (dev.send.sgraph.ai)
#
# Serves the user UI as a pure static file server, pointing API calls
# at a remote backend (default: https://dev.send.sgraph.ai).
#
# This mirrors production where CloudFront routes:
#   /* → S3 static files
#   /api/* → Lambda
#
# The send UI uses Web Crypto API (AES-256-GCM) which requires either:
#   - https:// (production)
#   - http://localhost (local dev — this script)
# Using 127.0.0.1 will NOT work for Web Crypto.
# ---------------------------------------------------------------------------
PORT=10062
API_ENDPOINT="${SGRAPH_API_ENDPOINT:-https://dev.send.sgraph.ai}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
STATIC_DIR="$REPO_ROOT/sgraph_ai_app_send__ui__user"
UI_VERSION_UPLOAD="v0.2.13"
UI_VERSION_DOWNLOAD="v0.3.0"
SERVE_DIR="$REPO_ROOT/.local-server-user"

# Clean up on exit
cleanup() {
    echo ""
    echo "Stopping server..."
    rm -rf "$SERVE_DIR"
}
trap cleanup EXIT

# Build the local serve directory with symlinks
echo "Building local server directory (mirroring production URL structure)..."
rm -rf "$SERVE_DIR"
mkdir -p "$SERVE_DIR"

UPLOAD_BASE_DIR="$STATIC_DIR/v0/v0.2/v0.2.0"
UPLOAD_DIR="$STATIC_DIR/v0/v0.2/$UI_VERSION_UPLOAD"

# v0.3.0 is self-contained (no overlays) — detect major version from download version
DOWNLOAD_MAJOR=$(echo "$UI_VERSION_DOWNLOAD" | sed 's/\(v0\.[0-9]*\)\..*/\1/')
if [ "$DOWNLOAD_MAJOR" = "v0.3" ]; then
    DOWNLOAD_DIR="$STATIC_DIR/v0/v0.3/$UI_VERSION_DOWNLOAD"
else
    DOWNLOAD_DIR="$STATIC_DIR/v0/v0.2/$UI_VERSION_DOWNLOAD"
fi

if [ ! -d "$UPLOAD_DIR" ]; then
    echo "ERROR: Upload UI not found: $UPLOAD_DIR"
    exit 1
fi
if [ ! -d "$DOWNLOAD_DIR" ]; then
    echo "ERROR: Download UI not found: $DOWNLOAD_DIR"
    exit 1
fi

# ─── Build merged _common ────────────────────────────────────────────────────
# For upload: Start with v0.2.0's _common then overlay IFD versions
# For download: v0.3.0+ is self-contained, v0.2.x uses overlay chain

# Copy v0.2.0's _common as base (resolving symlinks)
cp -rL "$UPLOAD_BASE_DIR/_common" "$SERVE_DIR/_common"

# Overlay all intermediate IFD versions up to and including the upload version
# This ensures dependency chains work (e.g. v0.2.4 depends on v0.2.3's files)
if [ "$UI_VERSION_UPLOAD" != "v0.2.0" ]; then
    upload_patch=$(echo "$UI_VERSION_UPLOAD" | sed 's/v0\.2\.//')
    for patch in $(seq 1 "$upload_patch"); do
        overlay_dir="$STATIC_DIR/v0/v0.2/v0.2.$patch"
        if [ -d "$overlay_dir/_common" ]; then
            find "$overlay_dir/_common" -type f | while read -r src; do
                rel="${src#$overlay_dir/_common/}"
                dest="$SERVE_DIR/_common/$rel"
                mkdir -p "$(dirname "$dest")"
                cp "$src" "$dest"
            done
        fi
    done
fi

# v0.3.0+ download UI: self-contained _common, copy alongside the merged one
# v0.2.x download UI: overlay its files on the merged _common
if [ "$DOWNLOAD_MAJOR" = "v0.3" ]; then
    # v0.3.0 has its own _common — copy it to a separate location
    # The v0.3.0 HTML references ../../_common/ relative to en-gb/download/
    cp -rL "$DOWNLOAD_DIR/_common" "$SERVE_DIR/_common_v03"
else
    find "$DOWNLOAD_DIR/_common" -type f | while read -r src; do
        rel="${src#$DOWNLOAD_DIR/_common/}"
        dest="$SERVE_DIR/_common/$rel"
        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
    done
fi

# ─── Symlink locale pages ────────────────────────────────────────────────────
# en-gb/index.html        → upload page (latest upload version)
# en-gb/download/          → download page
# en-gb/browse|gallery|v|view/ → viewer routes
# en-gb/welcome/           → welcome page (v0.2.0)

mkdir -p "$SERVE_DIR/en-gb"

# Upload page
ln -sf "$UPLOAD_DIR/en-gb/index.html" "$SERVE_DIR/en-gb/index.html"

# Download page
mkdir -p "$SERVE_DIR/en-gb/download"

# For v0.3.0, the HTML references ../../_common/ — create the right structure
if [ "$DOWNLOAD_MAJOR" = "v0.3" ]; then
    # Create a wrapper index.html that rewrites paths for the flat serve dir
    # OR simply serve v0.3.0's files with the correct relative path structure
    # The cleanest approach: mount the v0.3.0 tree directly
    ln -sf "$DOWNLOAD_DIR/en-gb/download/index.html" "$SERVE_DIR/en-gb/download/index.html"
    # _common for v0.3.0 needs to be at ../../_common relative to en-gb/download/
    # That resolves to $SERVE_DIR/_common — already there via merged copy
    # But v0.3.0's _common has its own send-download components, so overlay them
    if [ -d "$SERVE_DIR/_common_v03" ]; then
        find "$SERVE_DIR/_common_v03" -type f | while read -r src; do
            rel="${src#$SERVE_DIR/_common_v03/}"
            dest="$SERVE_DIR/_common/$rel"
            mkdir -p "$(dirname "$dest")"
            cp -f "$src" "$dest"
        done
        rm -rf "$SERVE_DIR/_common_v03"
    fi
else
    ln -sf "$DOWNLOAD_DIR/en-gb/download/index.html" "$SERVE_DIR/en-gb/download/index.html"
fi

# Viewer route pages (browse, gallery, v, view)
for route in browse gallery v view; do
    if [ -d "$DOWNLOAD_DIR/en-gb/$route" ]; then
        mkdir -p "$SERVE_DIR/en-gb/$route"
        ln -sf "$DOWNLOAD_DIR/en-gb/$route/index.html" "$SERVE_DIR/en-gb/$route/index.html"
    fi
done

# Welcome page (may be in upload version or base)
if [ -d "$UPLOAD_DIR/en-gb/welcome" ]; then
    ln -sf "$UPLOAD_DIR/en-gb/welcome" "$SERVE_DIR/en-gb/welcome"
elif [ -d "$UPLOAD_BASE_DIR/en-gb/welcome" ]; then
    ln -sf "$UPLOAD_BASE_DIR/en-gb/welcome" "$SERVE_DIR/en-gb/welcome"
fi

# ─── Inject build-info.js ────────────────────────────────────────────────────
mkdir -p "$SERVE_DIR/_common/js"
cat > "$SERVE_DIR/_common/js/build-info.js" <<JSEOF
/* Generated by user__run-locally.sh — local development only */
window.SGRAPH_BUILD = {
    appVersion  : 'local-dev',
    uiVersion   : '$UI_VERSION_DOWNLOAD',
    buildTime   : '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
    apiEndpoint : '$API_ENDPOINT'
};
JSEOF

# ─── Test files ──────────────────────────────────────────────────────────────
# The send-test-files component resolves ../test-files from en-gb/ → /test-files/
if [ -d "$UPLOAD_DIR/test-files" ]; then
    ln -sf "$UPLOAD_DIR/test-files" "$SERVE_DIR/test-files"
elif [ -d "$UPLOAD_BASE_DIR/test-files" ]; then
    ln -sf "$UPLOAD_BASE_DIR/test-files" "$SERVE_DIR/test-files"
fi

# ─── Root redirect ───────────────────────────────────────────────────────────
cat > "$SERVE_DIR/index.html" <<'HTMLEOF'
<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0;url=/en-gb/"></head>
<body><a href="/en-gb/">Redirecting to /en-gb/...</a></body>
</html>
HTMLEOF

# ─── Start server ────────────────────────────────────────────────────────────
echo ""
echo "Starting send.sgraph.ai local server..."
echo "  Root:       $SERVE_DIR"
echo "  Upload UI:  $UPLOAD_DIR"
echo "  Download UI: $DOWNLOAD_DIR"
echo ""
echo "  URLs:"
echo "    Home:           http://localhost:$PORT/"
echo "    Upload:         http://localhost:$PORT/en-gb/"
echo "    Download:       http://localhost:$PORT/en-gb/download/"
echo "    Browse:         http://localhost:$PORT/en-gb/browse/"
echo "    View:           http://localhost:$PORT/en-gb/v/"
echo ""
echo "  Backend API:    $API_ENDPOINT"
echo "    Override:     SGRAPH_API_ENDPOINT=https://send.sgraph.ai ./scripts/user__run-locally.sh"
echo ""
echo "  IMPORTANT: Use 'localhost' not '127.0.0.1' (Web Crypto requires secure context)"
echo ""
python3 -m http.server $PORT --directory "$SERVE_DIR" --bind localhost
