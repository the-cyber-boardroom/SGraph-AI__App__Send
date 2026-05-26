#!/usr/bin/env bash
# Vault loader unit test runner.
# Run from repo root: npm run test:vault-unit
# Or directly: bash tests/unit/vault_ui/loader/run-all.sh
set -e

echo "=== Vault UI unit tests ==="
node tests/unit/vault_ui/loader/test__format_detection.js
node tests/unit/vault_ui/loader/test__storage.js
node tests/unit/vault_ui/loader/test__recent_list.js
node tests/unit/vault_ui/loader/test__routing_decisions.js
node tests/unit/vault_ui/loader/test__public_preview_crypto.js
node tests/unit/vault_ui/loader/test__vault_links.js
node tests/unit/vault_ui/loader/test__composite_data_source.js
node tests/unit/vault_ui/loader/test__storage_pertab.js
echo ""
echo "=== All vault unit tests passed ==="
