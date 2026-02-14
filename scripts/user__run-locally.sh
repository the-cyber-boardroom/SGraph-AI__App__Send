#!/bin/bash
PORT=10062

export PYTHONPATH="$(pwd)/modules/MGraph-DB:$(pwd)/modules/OSBot-Utils:${PYTHONPATH}"


# Load environment variables from .env file if it exists
if [ -f .local-server.env ]; then
    echo "Loading environment variables from .local-server.env file..."
    export $(cat .local-server.env | grep -v '^#' | grep -v '^[[:space:]]*$' | xargs)
    echo "✓ Environment variables loaded"
else
    echo "⚠️  Warning: .env file not found"
    echo "   Create a .env file with your configuration"
fi

poetry run uvicorn sgraph_ai_app_send.lambda__user.lambda_function.lambda_handler__user:app --reload --host 0.0.0.0 --port $PORT \
    --log-level info \
    --timeout-graceful-shutdown 0

#    --no-access-log  \
