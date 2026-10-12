#!/usr/bin/env bash
# Vault Chat unit test runner.
# Run from repo root: npm run test:vault-chat-unit
# Or directly: bash tests/unit/vault_ui/vault-chat/run-all.sh
set -e

echo "=== Vault Chat unit tests ==="
node tests/unit/vault_ui/vault-chat/test__memory_vfs.js
node tests/unit/vault_ui/vault-chat/test__tool_policies.js
node tests/unit/vault_ui/vault-chat/test__builtin_tools.js
node tests/unit/vault_ui/vault-chat/test__execution_center.js
node tests/unit/vault_ui/vault-chat/test__flush_controller.js
node tests/unit/vault_ui/vault-chat/test__chat_session.js
node tests/unit/vault_ui/vault-chat/test__chat_loop.js
node tests/unit/vault_ui/vault-chat/test__mock_llm.js
node tests/unit/vault_ui/vault-chat/test__fencing_and_guards.js
node tests/unit/vault_ui/vault-chat/test__consolidate_memory.js
echo ""
echo "=== All vault-chat unit tests passed ==="
