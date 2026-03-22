# Brief: Vault 404 Root Cause — File ID Naming Mismatch

**From:** CLI Team
**To:** Vault Team
**Date:** 2026-03-16
**Re:** 404 on vault open (`aaaabbp1`) — ref `v0.16.1__technical-doc__vault-open-api-flow.md`

---

## TL;DR

The vault data **is on the server**. The 404 happens because the browser and the CLI use **different file ID naming schemes** to store and retrieve the same data. The browser derives deterministic 12-char hex IDs via HMAC; the CLI writes to `bare/refs/{uuid}` and `bare/indexes/{uuid}` paths. They never intersect.

---

## The Mismatch

### What the browser does (vault-open flow)

The browser derives two deterministic file IDs from the vault key using HMAC-SHA256:

```
refFileId          = HMAC(readKey, "sg-vault-v1:file-id:ref:{vault_id}")[:12]       → 112c1dad1a72
branchIndexFileId  = HMAC(readKey, "sg-vault-v1:file-id:branch-index:{vault_id}")[:12] → 115a772efd9e
```

Then reads:
```
GET /api/vault/read/aaaabbp1/112c1dad1a72        ← HEAD ref
GET /api/vault/read/aaaabbp1/115a772efd9e        ← branch index
```

### What the CLI does (push flow)

The CLI stores refs and indexes at path-based IDs with `bare/` prefixes:

```
PUT /api/vault/write/aaaabbp1/bare/refs/ref-7b2e1d        ← HEAD ref
PUT /api/vault/write/aaaabbp1/bare/indexes/idx-m8n4r1     ← branch index
```

### Result

| Resource | Browser reads from | CLI writes to | Match? |
|----------|-------------------|---------------|--------|
| HEAD ref | `112c1dad1a72` | `bare/refs/ref-7b2e1d` | No |
| Branch index | `115a772efd9e` | `bare/indexes/idx-m8n4r1` | No |

The data exists on the server at the CLI's paths, but the browser looks at the HMAC-derived paths and gets 404.

---

## Why it happened

The CLI uses a "v2" branching model with UUID-based ref IDs and a `bare/` directory structure (mimicking git's object store). The browser uses a "v1" model with deterministic HMAC-derived file IDs. Neither side writes to the other's expected locations.

Interestingly, the CLI already has `derive_ref_file_id()` in `Vault__Crypto` — it just doesn't use it when uploading to the API. And it's missing `derive_branch_index_file_id()` entirely.

---

## Proposed Fix (CLI side)

During push, the CLI should write **both** its internal paths and the browser-compatible deterministic paths:

1. **Add `derive_branch_index_file_id()`** to `Vault__Crypto`:
   ```python
   BRANCH_INDEX_DOMAIN = 'sg-vault-v1:file-id:branch-index'

   def derive_branch_index_file_id(self, read_key, vault_id):
       return self.derive_file_id(read_key, f'{BRANCH_INDEX_DOMAIN}:{vault_id}')
   ```

2. **On push**, after updating `bare/refs/{id}`, also write a copy to the derived `refFileId`
3. **On push**, after updating `bare/indexes/{id}`, also write a copy to the derived `branchIndexFileId`

This is a compatibility bridge — the CLI keeps its own internal structure but also publishes to the locations the browser expects.

---

## What the vault team needs to confirm

1. **Is the browser's derivation correct?** Specifically:
   - `refFileId` uses domain `sg-vault-v1:file-id:ref:{vault_id}` — is this the HEAD ref or a per-branch ref?
   - `branchIndexFileId` uses domain `sg-vault-v1:file-id:branch-index:{vault_id}` — confirmed?

2. **Does the browser expect the same encrypted format?** The CLI encrypts refs as raw ciphertext via AES-256-GCM. The browser expects to decrypt with `readKey` and find JSON like `{ "commit_id": "obj-xxx" }`. Need to confirm the payload schema matches.

3. **Should the browser also learn to read `bare/` paths?** Or should the CLI be the one to adapt? A dual-write from the CLI is the simplest short-term fix, but long-term we should pick one scheme.

---

## Immediate workaround

If the vault team needs to unblock before the CLI fix ships: the vault data for `aaaabbp1` exists at `bare/refs/*` and `bare/indexes/*` paths. A server-side script could copy the payloads to the HMAC-derived paths to make them visible to the browser.
