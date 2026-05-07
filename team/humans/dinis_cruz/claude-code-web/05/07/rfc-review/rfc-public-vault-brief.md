# Public Vault Type — Design Brief
**Date:** 07 May 2026
**From:** SG/Send API Team
**To:** SGit Team
**Status:** Ready for comment

---

## Core Insight: A Public Vault Is a Second Remote

A public vault is not a new vault type that the server manages. It is a **second remote**
that the SGit client pushes to — a remote that happens to point at a world-readable S3
bucket instead of a private one.

This is already how git works. Multiple remotes, each holding a different version of the
same repository, is a first-class git concept. SGit inherits this for free.

**Public vaults start public** — the owner decides at creation time. There is no
conversion from private to public. A public vault is initialised directly in the public
bucket; a private vault is initialised in the private bucket. The server distinguishes them
by the `X-Vault-Public: true` header.

Branches, commits, pulls, merges — all the normal git mechanics handle sync and divergence.
No server-side publish or unpublish workflow is needed.

---

## Vault Layout

Both buckets use identical path conventions. The public bucket adds two files at the vault
root that are not present in private vaults.

```
sg-send__data/sg-send-api__v1.0/{deployment}/vault/{id[:2]}/{id}/

    # Present in all vaults (both buckets)
    manifest.json                    ← write auth record (write_key_hash); server-internal
    bare/refs/<ref-id>/payload       ← HEAD pointer (mutable, encrypted)
    bare/data/obj-cas-imm-<hash>/payload   ← vault objects (immutable, encrypted)
    bare/indexes/<index-id>/payload  ← index objects (encrypted)
    deleted.json                     ← tombstone written after vault is destroyed

    # Public bucket only
    public-vault.json                ← discovery entry point (plaintext, world-readable)
```

`public-vault.json` is a plain JSON file at the vault root — not an encrypted object, not
using the `/payload` suffix convention. It is the only new file the server writes.

---

## `public-vault.json` Format

```json
{
  "schema":     "sgit-public-vault/1",
  "vault_id":   "abc123de",
  "created_at": 1746662400000,
  "read_key":   "<base64-encoded read key bytes>",
  "cdn_base":   "https://data.send.sgraph.ai/public-vaults/shared/ab/abc123de"
}
```

- **`read_key`** — the decryption key for all vault objects. Provided by the SGit client
  at vault initialisation (via `X-Vault-Read-Key` header). Stored verbatim by the server.
- **`cdn_base`** — Phase 2 field. In Phase 1 this will be the Lambda URL. In Phase 2 it
  becomes the CloudFront URL so SGit can fetch objects directly from CDN without
  constructing paths independently.
- **`description`** is intentionally absent — vault description lives inside the
  encrypted vault content, not in the access record.

---

## Reads Are Already Anonymous

This is code-verified. The existing read endpoints require **no authentication**:

```python
# Routes__Vault__Pointer.py
def read__vault_id__file_id(self, vault_id, file_id) -> Response:
    self._validate_vault_id(vault_id)      # format check only — no token, no write key
    payload = self.vault_service.read(vault_id=vault_id, file_id=file_id)
    return Response(content=payload, media_type='application/octet-stream')
```

`check_access_token` is called only on writes, deletes, and zip downloads. The read-only
batch handler notes explicitly: `# Read-only batch — no auth required (data is encrypted)`.

This is the zero-knowledge design: the server stores only ciphertext, so gating reads
provides no security benefit. Anyone who knows the vault ID and file path can fetch
encrypted bytes — they are useless without the decryption key.

This is already how `qa.sgraph.ai/en-gb/library` works: it reads directly from a private
vault using the Lambda URL, with the vault ID and read key embedded in the site's config.

---

## Two-Phase Read Model

### Phase 1 — Lambda URL, caller needs vault_id + read_key

No new infrastructure. The same Lambda URL serves public vault reads anonymously.

```
GET /api/vault/read/{vault_id}/public-vault.json           → { read_key, cdn_base, ... }
GET /api/vault/read/{vault_id}/bare/refs/<ref-id>          → encrypted HEAD ref
GET /api/vault/read/{vault_id}/bare/data/obj-cas-imm-<h>   → encrypted object
```

The `X-Vault-Public: true` header on writes routes them to the public bucket. Reads from
the public bucket work identically to reads from the private bucket — same endpoints, same
anonymous access.

### Phase 2 — CloudFront, vault_id alone is sufficient

CloudFront distribution `data.send.sgraph.ai` adds a behaviour pointing at the public
bucket. SGit fetches all public vault objects directly from CDN; writes continue through
the Lambda API.

```
# Step 1: discover read key and CDN base from vault ID alone
GET https://data.send.sgraph.ai/public-vaults/shared/{id[:2]}/{id}/public-vault.json
    → { "read_key": "...", "cdn_base": "https://data.send.sgraph.ai/public-vaults/..." }

# Step 2: fetch all objects directly from CDN using cdn_base
GET {cdn_base}/bare/refs/<ref-id>        → encrypted HEAD ref   (Cache-Control: no-store)
GET {cdn_base}/bare/data/<hash>          → encrypted object     (Cache-Control: immutable)
```

Cache-Control policy:
- `bare/data/obj-cas-imm-*/payload` → `immutable, max-age=31536000` (content-addressed)
- `bare/refs/*/payload` → `no-store` (mutable HEAD pointer)
- `public-vault.json` → `no-store` (must be purgeable on unpublish)
- `manifest.json` → blocked at CloudFront (403); defence in depth

---

## What SGit Needs to Do (Client Side)

**Public vaults start public.** The owner decides at creation time — there is no
conversion from private to public. This avoids the entire class of problems around
migration, dual-state vaults, and "which copy is canonical".

```
sgit init --public          # creates vault in public bucket from the start
                            # includes X-Vault-Public: true + X-Vault-Read-Key on init
```

**Destroying a public vault** is a vault delete (same as private):
- Push a `deleted.json` tombstone to the public remote, or
- Call the destroy endpoint — the server writes the tombstone and removes objects

No `sgit publish` command. No `sgit unpublish` command. The multi-remote model (pushing the
same content to both a private and a public remote) remains available as a power-user
pattern, but it is not a first-class workflow — and it is not what `sgit publish` would
have been.

---

## What the Server Needs to Do (Minimal)

| Task | Estimate |
|------|----------|
| New env var `SEND__PUBLIC_VAULT__S3_BUCKET` | 30 min |
| `Send__Config.public_vault_storage_fs()` → `Storage_FS__S3` for public bucket | 30 min |
| Route layer: select storage backend from `X-Vault-Public: true` header | 1 hr |
| On first push (no `manifest.json` yet in public bucket): write `public-vault.json` using read_key from `X-Vault-Read-Key` header | 1 hr |
| Tests | 2 hr |
| **Total** | **~5 hrs** |

Not needed (removed from earlier scope):
- ~~Publish endpoint~~ — this is `sgit push public`
- ~~Unpublish endpoint~~ — this is `sgit push` with a tombstone object
- ~~Cross-bucket manifest lookup~~ — each bucket is fully independent

---

## Bucket Independence

Each bucket is fully self-contained:

- Public vaults: everything (including `manifest.json` for write auth) lives in the
  public bucket
- Private vaults: everything lives in the private bucket
- Neither bucket knows about the other
- No cross-bucket coupling of any kind

**`manifest.json` will be publicly readable** (we accept this). `write_key_hash` exposure
is benign: the server hashes the submitted write key on arrival, so submitting the stored
hash directly cannot authenticate a write. A CloudFront rule blocking `manifest.json`
(returning 403) is recommended as defence in depth but the design does not depend on it.

---

## Open Question for SGit Team (Blocker)

**Is `read_key → write_key` derivation computationally infeasible?**

If a reader can derive the write key from the read key, then anyone who fetches
`public-vault.json` from a public vault can escalate to write access. This would
fundamentally change the threat model.

If the two keys are fully independent, the design is clean and Phase 1 can proceed.

The SG/Send API cannot answer this — it is a SGit-internal key derivation question.
Please confirm before Phase 1 implementation begins.
