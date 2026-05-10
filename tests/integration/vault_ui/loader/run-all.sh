#!/usr/bin/env bash
# Vault loader integration test runner.
# Run from repo root: npm run test:vault-integration
# Or directly: bash tests/integration/vault_ui/loader/run-all.sh
set -e

echo "=== Vault UI integration tests ==="
node tests/integration/vault_ui/loader/test__open_flow_full.js
node tests/integration/vault_ui/loader/test__create_then_open.js
echo ""
echo "=== All vault integration tests passed ==="
