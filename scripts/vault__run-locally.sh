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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SERVE_DIR="$REPO_ROOT/.local-server-vault"

# Clean up on exit
cleanup() {
    echo ""
    echo "Stopping server..."
    rm -rf "$SERVE_DIR"
}
trap cleanup EXIT

# Build the static tree
bash "$SCRIPT_DIR/build-vault-static.sh" "$SERVE_DIR"

echo ""
echo "Starting vault.sgraph.ai local server..."
echo "  Root:    $SERVE_DIR"
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
