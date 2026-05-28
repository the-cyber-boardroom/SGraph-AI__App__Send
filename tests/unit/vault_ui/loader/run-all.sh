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
node tests/unit/vault_ui/loader/test__vault_history.js
node tests/unit/vault_ui/loader/test__ro_record_derivation.js
node tests/unit/vault_ui/loader/test__sgsend_access_token.js
node tests/unit/vault_ui/loader/test__app_permissions.js
node tests/unit/vault_ui/loader/test__secure_channel_envelope.js
node tests/unit/vault_ui/loader/test__secure_channel.js
node tests/unit/vault_ui/loader/test__kernel_mounts.js
node tests/unit/vault_ui/loader/test__kernel_broker.js
node tests/unit/vault_ui/loader/test__kernel_relay.js
node tests/unit/vault_ui/loader/test__app_permissions_vault_mount.js
node tests/unit/vault_ui/loader/test__sg_app_stub.js
echo ""
echo "=== All vault unit tests passed ==="
