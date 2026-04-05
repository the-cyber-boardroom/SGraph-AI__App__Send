#!/bin/bash
# ---------------------------------------------------------------------------
# Local dev server for the library site (library.sgraph.ai)
#
# Serves sgraph_ai_app_send__library/ directly — no symlink flattening needed
# because the library site has no versioned IFD subdirectories.
#
# Also regenerates all individual document wrapper pages before starting.
# ---------------------------------------------------------------------------
PORT=10065
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
LIBRARY_DIR="$REPO_ROOT/sgraph_ai_app_send__library"

if [ ! -d "$LIBRARY_DIR" ]; then
    echo "ERROR: Library directory not found: $LIBRARY_DIR"
    exit 1
fi

# Regenerate document wrapper pages and indexes
echo "Regenerating library document pages..."
python3 "$SCRIPT_DIR/generate_library_pages.py"
echo "Regenerating library indexes..."
python3 "$SCRIPT_DIR/generate_library_index.py"

echo ""
echo "Starting library.sgraph.ai local server..."
echo "  Root:  $LIBRARY_DIR"
echo ""
echo "  URLs:"
echo "    Home:              http://localhost:$PORT/"
echo "    Roles:             http://localhost:$PORT/roles/"
echo "    Skills:            http://localhost:$PORT/skills/"
echo "    Guides:            http://localhost:$PORT/guides/"
echo "    Teams:             http://localhost:$PORT/teams/"
echo "    Claude Guidance:   http://localhost:$PORT/claude-guidance/"
echo "    Workflows:         http://localhost:$PORT/workflows/"
echo ""
python3 -m http.server $PORT --directory "$LIBRARY_DIR" --bind localhost
