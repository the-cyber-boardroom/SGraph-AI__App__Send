# Debrief — Browser-Compatible Dual-Write Fix

**Date:** 2026-03-16
**Branch:** `claude/create-villager-team-7wpYl`

## Context

Vaults created via the CLI were returning 404 when opened in the browser. The root cause: the CLI and browser use different file ID naming schemes to store and retrieve refs and branch indexes on the server.

- **Browser** derives deterministic 12-char hex IDs via HMAC-SHA256 (e.g. `112c1dad1a72`)
- **CLI** writes to UUID-based paths under `bare/` (e.g. `bare/refs/ref-7b2e1d`)

The data was on the server, just at paths the browser never looks at.

## What We Did

### 1. Root Cause Analysis & Brief to Vault Team

Traced the full vault-open flow from the browser side (HMAC derivation → API reads) and matched it against the CLI's push flow (UUID-based bare/ paths → API writes). Documented the mismatch in a brief for the vault team with a comparison table and proposed fix.

**File:** `team/humans/dinis_cruz/claude-code-web/03/16/brief__vault-team__404-root-cause__file-id-mismatch.md`

### 2. Added `derive_branch_index_file_id()` to Vault__Crypto

The crypto layer already had `derive_ref_file_id()` but was missing the branch index equivalent. Added:

- `BRANCH_INDEX_DOMAIN = 'sg-vault-v1:file-id:branch-index'` constant
- `derive_branch_index_file_id(read_key, vault_id)` method
- Updated `derive_keys()` to include `branch_index_file_id` in its return dict

### 3. Browser-Compatible Dual-Writes in Push Flow

Added dual-writes at every point where the CLI writes refs or indexes to the server:

| Location | What it writes | Browser-compat copy |
|----------|---------------|---------------------|
| `Vault__Batch.build_push_operations()` | `bare/refs/{named_ref_id}` | `{HMAC-derived ref_file_id}` |
| `Vault__Sync._register_pending_branch()` | `bare/refs/{head_ref_id}` | `{HMAC-derived ref_file_id}` |
| `Vault__Sync._register_pending_branch()` | `bare/indexes/{index_id}` | `{HMAC-derived branch_index_file_id}` |
| `Vault__Sync._upload_bare_to_server()` | `bare/refs/*` | `{HMAC-derived ref_file_id}` |
| `Vault__Sync._upload_bare_to_server()` | `bare/indexes/*` | `{HMAC-derived branch_index_file_id}` |

The CLI keeps its own internal `bare/` structure intact (no breaking change) but also publishes to the deterministic paths the browser expects.

### 4. All Tests Pass

- 971 unit tests passed, 4 xfailed (expected)
- No regressions

## Key Files Changed

| File | What |
|------|------|
| `sg_send_cli/crypto/Vault__Crypto.py` | Added `BRANCH_INDEX_DOMAIN`, `derive_branch_index_file_id()`, updated `derive_keys()` |
| `sg_send_cli/sync/Vault__Batch.py` | Added `vault_id` param, browser-compat ref dual-write |
| `sg_send_cli/sync/Vault__Sync.py` | Browser-compat dual-writes in `_register_pending_branch()` and `_upload_bare_to_server()` |

## What Works Now

After this fix, every CLI push writes both:
1. **CLI paths** — `bare/refs/{id}`, `bare/indexes/{id}` (for CLI pull/clone)
2. **Browser paths** — `{HMAC-derived-ref-id}`, `{HMAC-derived-branch-index-id}` (for browser vault-open)

This means newly pushed vaults should be openable in the browser immediately.

## What Still Needs Validation

1. **Existing vaults** created before this fix still have data only at `bare/` paths. A one-time migration script (or server-side copy) is needed for those.
2. **Payload format compatibility** — the browser expects to decrypt the ref/index with `readKey` and find specific JSON. Need to confirm the CLI's encrypted payload format matches what the browser parser expects.
3. **Long-term direction** — dual-write is a bridge. The vault team should decide whether both sides converge on HMAC-derived IDs (dropping `bare/` paths) or keep dual-write permanently.
