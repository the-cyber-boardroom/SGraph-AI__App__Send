# vault/proposed — Structure Key Encryption Split

**Source:** Docs 323–324 (04/28 briefs) | **Status:** DESIGN DECIDED — implementation pending
**Architect Review:** `team/humans/dinis_cruz/briefs/04/28/v0.22.17__architect-review__structure-key-encryption-split.md`
**Version:** v0.22.17 | **Date:** 26 April 2026

---

## Problem

The `structure_key` is correctly **derived** (HKDF-SHA256 from `read_key`) but never **used**
for encryption. All vault objects use `read_key`. The feature is inert — sharing `structure_key`
grants zero decryption capability.

---

## Target Design

A holder of `structure_key` only should be able to see:
- Full commit graph (commits, parents, timestamps, branch IDs, tree IDs)
- Complete directory topology (which folders and files exist, their object IDs)
- Branch names, types, creation times, HEAD positions
- Public PKI keys

A holder of `structure_key` only should NOT see:
- Filenames, file sizes, content hashes, MIME types
- Commit messages
- File content

---

## Encryption Assignment (Target)

| Object | Encrypt with | Rationale |
|--------|-------------|-----------|
| Refs, branch index, commit core fields, tree outer envelope, tree entry object IDs, public PKI keys | `structure_key` | Graph topology — no sensitive content |
| `message_enc`, tree entry `name_enc` / `size_enc` / `content_hash_enc` / `content_type_enc`, blob content | `read_key` | Sensitive |

---

## Migration Strategy (No Flag Day Required)

Use AES-GCM's `InvalidTag` / `OperationError` as the fallback signal:

```python
# Python (CLI team)
def decrypt_structural(self, structure_key, read_key, data):
    try:
        return self.decrypt(structure_key, data)
    except InvalidTag:
        return self.decrypt(read_key, data)   # old vault fallback
```

```javascript
// JavaScript (Vault Web Team)
static async decryptStructural(structureKey, readKey, data) {
    try {
        return await SGVaultCrypto.decrypt(structureKey, data)
    } catch (e) {
        if (e.name === 'OperationError') {  // Web Crypto auth failure
            return await SGVaultCrypto.decrypt(readKey, data)
        }
        throw e
    }
}
```

Old vaults: fallback always triggers. New vaults: `structure_key` succeeds directly. Mixed vaults:
per-object fallback. No migration scripts. No version checks.

---

## Implementation by Team

| Team | Action | Status |
|------|--------|--------|
| **API Team (this repo)** | No changes required — server stores opaque blobs | ACKNOWLEDGED |
| **CLI Team (SGit-AI__CLI)** | Primary implementor — `Vault__Crypto`, `Vault__Ref_Manager`, `Vault__Branch_Manager`, `Vault__Commit`, `Vault__Sub_Tree`, `Vault__Dump` | PENDING |
| **Vault Web Team (`sgraph_ai_app_send__ui__vault`)** | Same split, Web Crypto API — `sg-vault-crypto.js`, `sg-vault.js`, `sg-vault-ref-manager.js` | PENDING |
| **Vault Tools / Components Team (tools.sgraph.ai)** | Consumer of Vault Web Team changes — audit which tools need content vs. structural access only | PENDING |

---

## Open Questions

| # | Question | Owner |
|---|----------|-------|
| OQ-1 | Should `structure_key` be exposed via `sgit derive-keys` output? | CLI Team + Conductor |
| OQ-2 | Should `/api/vault/zip` accept `structure_key` for read-only snapshot pull? | API Team + Architect |
| OQ-3 | Schema version bump strategy — `commit_v2`, `tree_v2`, or a flag field? | CLI Team |
| OQ-4 | Should `sg-vault.js` expose an `openWithStructureKey` API surface explicitly? | Vault Web Team |

---

## Related: Named Branch Private Key (Deferred)

Named branch private key is currently encrypted with `read_key` (should be `write_key`).
Re-key when signature verification is activated. Low current impact — not a blocker.
