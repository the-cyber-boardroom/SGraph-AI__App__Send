#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Create a Python 3.12 virtual environment (required by project dependencies)
uv venv --python 3.12 "$CLAUDE_PROJECT_DIR/.venv"

# Install dependencies from requirements-test.txt (covers runtime + test deps)
uv pip install --python "$CLAUDE_PROJECT_DIR/.venv/bin/python" -r "$CLAUDE_PROJECT_DIR/requirements-test.txt"

# Activate the venv and set PYTHONPATH for the session
echo "source $CLAUDE_PROJECT_DIR/.venv/bin/activate" >> "$CLAUDE_ENV_FILE"
echo 'export PYTHONPATH="."' >> "$CLAUDE_ENV_FILE"
