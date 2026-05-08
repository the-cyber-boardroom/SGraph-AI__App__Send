#!/bin/bash
# ---------------------------------------------------------------------------
# Local dev server for the vault UI (dev.vault.sgraph.ai)
#
# In production, the CI deploy script flattens the versioned IFD structure:
#   vault/v0/v0.1/v0.1.2/en-gb/   →  latest/en-gb/
#   vault/v0/v0.1/v0.1.2/_common/  →  latest/_common/
#   vault/v0/v0.1/v0.1.2/i18n/     →  latest/i18n/
#
# This script replicates that locally by creating symlinks in a temporary
# directory that mirrors the production URL structure.
#
# LOCAL CDN OVERRIDE: The vault index.html loads shared components from
# dev.send.sgraph.ai. This script merges all user UI IFD layers (v0.3.0,
# v0.3.1, v0.3.2, v0.3.3) on top of the vault _common/ and patches index.html to
# use local URLs so that local code changes are visible without a CDN deploy.
#
# The vault UI uses Web Crypto API (AES-256-GCM) which requires either:
#   - https:// (production)
#   - http://localhost (local dev — this script)
# Using 127.0.0.1 will NOT work for Web Crypto.
# ---------------------------------------------------------------------------
PORT=10067
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
STATIC_DIR="$REPO_ROOT/sgraph_ai_app_send__ui__vault"
UI_VERSION="v0.2.2"
IFD_PATH="v0/v0.2/$UI_VERSION"
VAULT_BASE_VERSION="v0.2.0"   # IFD base layer — provides vault-shell, vault-browse-edit, etc.
# Vault IFD overlay layers applied on top of base (base-to-latest).
# Each only contains files changed in that version.
VAULT_IFD_OVERLAYS=(
    "v0.2.1"
    "v0.2.2"
)
SERVE_DIR="$REPO_ROOT/.local-server-vault"

# User UI IFD layers — merged in order (base first, latest last) to replicate
# what the CDN serves. Each version only contains files changed in that version.
USER_UI_DIR="$REPO_ROOT/sgraph_ai_app_send__ui__user"
USER_UI_LAYERS=(
    "v0/v0.3/v0.3.0/_common"
    "v0/v0.3/v0.3.1/_common"
    "v0/v0.3/v0.3.2/_common"
    "v0/v0.3/v0.3.3/_common"
)

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

# Versioned content → root (en-gb/, _common/, i18n/, etc.)
CONTENT_DIR="$STATIC_DIR/$IFD_PATH"
if [ ! -d "$CONTENT_DIR" ]; then
    echo "ERROR: Content directory not found: $CONTENT_DIR"
    exit 1
fi

# Merge locale dirs (en-gb/, etc.) from ALL vault IFD layers base→latest.
# Each layer can add or update locale dirs; later layers override earlier ones.
# This means individual version deltas don't need to copy unchanged locale dirs.
for ver in "$VAULT_BASE_VERSION" "${VAULT_IFD_OVERLAYS[@]}"; do
    for locale_dir in "$STATIC_DIR/v0/v0.2/$ver"/*/; do
        [ -d "$locale_dir" ] || continue
        dirname=$(basename "$locale_dir")
        [ "$dirname" = "_common" ] && continue
        [ "$dirname" = "i18n"    ] && continue
        cp -r "$locale_dir" "$SERVE_DIR/$dirname"
    done
done

# Build _common: start with vault IFD base layer (vault-shell, vault-browse-edit, etc.)
# then apply overlay deltas in order (only changed files in each delta).
BASE_COMMON_DIR="$STATIC_DIR/v0/v0.2/$VAULT_BASE_VERSION/_common"
if [ -d "$BASE_COMMON_DIR" ]; then
    echo "Merging vault base layer: $VAULT_BASE_VERSION ..."
    cp -r "$BASE_COMMON_DIR" "$SERVE_DIR/_common"
else
    mkdir -p "$SERVE_DIR/_common/js"
fi

for ver in "${VAULT_IFD_OVERLAYS[@]}"; do
    overlay_dir="$STATIC_DIR/v0/v0.2/$ver/_common"
    if [ -d "$overlay_dir" ]; then
        echo "Merging vault overlay: $ver ..."
        cp -r "$overlay_dir"/. "$SERVE_DIR/_common/"
    fi
done

# Merge user UI IFD layers in order (v0.3.0 → v0.3.1 → v0.3.2) — replicates
# the CDN's flattened view. Each layer only contains files changed in that
# version; later layers override earlier ones. Local changes take effect
# without a CDN deploy.
for layer in "${USER_UI_LAYERS[@]}"; do
    layer_dir="$USER_UI_DIR/$layer"
    if [ -d "$layer_dir" ]; then
        echo "Merging user UI layer: $layer ..."
        cp -r "$layer_dir"/. "$SERVE_DIR/_common/"
    else
        echo "WARNING: user UI layer not found: $layer_dir (skipping)"
    fi
done

# Symlink i18n/
[ -d "$CONTENT_DIR/i18n" ] && ln -sf "$CONTENT_DIR/i18n" "$SERVE_DIR/i18n"

# Copy root files (index.html, etc.) — index.html is the vault shell, not a redirect
for f in "$CONTENT_DIR"/*.html "$CONTENT_DIR"/*.json; do
    [ -f "$f" ] && cp "$f" "$SERVE_DIR/$(basename "$f")"
done

# Create en-gb/vault/index.html — serves the vault shell at /en-gb/vault so that
# history.replaceState(null, '', '/en-gb/vault') produces a real, refreshable URL.
# Generated from root index.html at serve time; _common/ paths are made root-absolute
# so they resolve correctly from /en-gb/vault/ (two directories deep).
mkdir -p "$SERVE_DIR/en-gb/vault"
python3 -c "
import sys
with open('$SERVE_DIR/index.html') as f:
    html = f.read()
# Make local relative _common/ paths root-absolute so they work from /en-gb/vault/
html = html.replace('href=\"_common/', 'href=\"/_common/')
html = html.replace('src=\"_common/', 'src=\"/_common/')
with open('$SERVE_DIR/en-gb/vault/index.html', 'w') as f:
    f.write(html)
print('  Created: en-gb/vault/index.html')
"

# Inject /api/health for local dev — vault-header.js calls window.location.origin/api/health
# to display the backend version. Python http.server has no API routes, so this
# provides a static JSON response that prevents a noisy 404 in DevTools.
mkdir -p "$SERVE_DIR/api"
cat > "$SERVE_DIR/api/health" <<HEALTHEOF
{"status":"ok","version":"local-dev","mode":"local-static"}
HEALTHEOF

# Inject build-info.js for local dev (CI generates this in production)
mkdir -p "$SERVE_DIR/_common/js"
cat > "$SERVE_DIR/_common/js/build-info.js" <<JSEOF
/* Generated by vault__run-locally.sh — local development only */
window.SGRAPH_BUILD = {
    appVersion : 'local-dev',
    uiVersion  : '$UI_VERSION',
    buildTime  : '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
};
JSEOF

# Patch index.html files: replace CDN URLs with local /_common/ so the browser
# loads local copies of send-browse, sg-site-header, etc. without a CDN deploy.
echo "Patching index.html: CDN URLs → local /_common/ ..."
for index_html in "$SERVE_DIR/index.html" "$SERVE_DIR"/*/index.html "$SERVE_DIR"/*/*/index.html; do
    [ -f "$index_html" ] || continue
    python3 -c "
import sys
path = sys.argv[1]
with open(path) as f: html = f.read()
patched = html.replace('https://dev.send.sgraph.ai/_common/', '/_common/')
patched = patched.replace('https://dev.sgraph.ai/_common/', '/_common/')
with open(path, 'w') as f: f.write(patched)
print('  Patched:', path)
" "$index_html"
done

echo ""
echo "Starting vault.sgraph.ai local server..."
echo "  Root:       $SERVE_DIR"
echo "  Content:    $CONTENT_DIR"
echo "  CDN override: $USER_UI_DIR (v0.3.0 → v0.3.1 → v0.3.2 merged)"
echo ""
echo "  URLs:"
echo "    Landing page:   http://localhost:$PORT/en-gb/"
echo "    Open vault:     http://localhost:$PORT/#your-token"
echo "    (en-gb/browse/ redirects to /#hash automatically)"
echo ""
echo "  IMPORTANT: Use 'localhost' not '127.0.0.1' (Web Crypto requires secure context)"
echo ""
echo "  Backend:"
echo "    Default:        https://send.sgraph.ai (production)"
echo "    Local backend:  Run ./scripts/user__run-locally.sh in another terminal (port $PORT)"
echo "                    Then set data-endpoint=\"http://localhost:$PORT\" on <vault-entry>"
echo ""
python3 -m http.server $PORT --directory "$SERVE_DIR" --bind localhost
