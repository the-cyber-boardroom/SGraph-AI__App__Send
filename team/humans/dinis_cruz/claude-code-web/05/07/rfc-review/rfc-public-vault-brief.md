# Brief: Public Vault Type — Revised Design
**Date:** 07 May 2026
**From:** SG/Send API Architect
**To:** SGit Team + SG/Send API Dev

---

## Core Insight

A public vault is not a new vault type that the server manages. It is a **second remote**
that the sgit client pushes to. The server is a dumb storage backend. All workflow
intelligence lives in the sgit client.

This is already how git works. Multiple remotes, each holding a different version of the
same repository, is a first-class git concept. SGit inherits this for free.

```
sgit remote add origin   https://vault.sgraph.ai   # private remote (private bucket)
sgit remote add public   https://vault.sgraph.ai   # public remote  (public bucket)

sgit push origin   main   # → private bucket, no header
sgit push public   main   # → public bucket,  X-Vault-Public: true
```

Branches, commits, pulls, merges — all the normal git mechanics handle sync, divergence,
and selective publishing between the two remotes. No server-side publish workflow needed.

---

## What This Means for the Server

The server does not need a "publish" endpoint, an "unpublish" endpoint, or any concept of
vault visibility state. It needs three things:

1. **A second bucket** — `745506449035--sgraph-send-public--eu-west-2`
2. **Header routing** — `X-Vault-Public: true` selects the public `Storage_FS__S3` instance
3. **`public-vault.json` written on first push** — when the public vault is initialised
   (i.e. `manifest.json` does not yet exist in the public bucket for that vault ID), the
   server writes `public-vault.json` alongside the manifest. This file contains the read
   key and is the discovery entry point for any client that knows only the vault ID.

That is the complete Phase 1 server-side change.

---

## What This Means for sgit

A `sgit publish` command (or equivalent) is purely a client-side convenience:

```
sgit publish          # shorthand for:
                      # 1. add 'public' remote if not present
                      # 2. push current branch to public remote
                      # 3. print the CDN URL for sharing
```

Unpublish is equally simple:

```
sgit unpublish        # shorthand for:
                      # 1. push a tombstone (deleted.json) to public remote
                      # 2. remove public remote from local config
```

The owner can continue pushing to the private remote after unpublishing. Nothing on the
private side is affected — it was never touched.

---

## Bucket Independence

Each bucket is fully self-contained. Public vaults exist entirely in the public bucket
(including `manifest.json` for write auth). Private vaults exist entirely in the private
bucket. Neither bucket knows about the other.

**Same vault ID in both buckets** is normal and expected — it just means the owner has
pushed to both remotes. The server treats them as independent storage namespaces. The sgit
client manages the relationship between them, exactly as git manages the relationship
between `origin` and any other remote.

No cross-bucket tombstone checking. No cross-bucket coupling of any kind.

---

## Reads Are Already Anonymous — No New Auth Model Needed

This is code-verified. The existing read endpoints have **no authentication**:

```python
# Routes__Vault__Pointer.py — read path
def read__vault_id__file_id(self, vault_id, file_id) -> Response:
    self._validate_vault_id(vault_id)          # format check only
    payload = self.vault_service.read(...)     # no token, no write key
    return Response(content=payload, ...)
```

`check_access_token` is only called on writes, deletes, and zip downloads. Read-only batch
explicitly notes: `# Read-only batch — no auth required (data is encrypted)`.

This is the zero-knowledge design: the server only holds ciphertext, so protecting reads is
pointless. Anyone who knows the vault ID and file path can fetch the encrypted bytes.

This is already how `qa.sgraph.ai/en-gb/library` works — it reads directly from a private
vault using the Lambda URL, with the vault ID and read key embedded in the site's config.

### Phase 1: same Lambda URL, caller needs vault_id + read_key

```
# Works today — no new infrastructure needed
GET /api/vault/read/{vault_id}/bare/refs/<ref-id>    →  encrypted bytes
GET /api/vault/read/{vault_id}/bare/data/<hash>      →  encrypted bytes
GET /api/vault/read/{vault_id}/public-vault.json     →  { read_key, vault_id, ... }
```

Adding `X-Vault-Public: true` to a write routes it to the public bucket. Reads from the
public bucket work identically — same endpoint, same anonymous access.

### Phase 2: CloudFront + public bucket → vault_id alone is sufficient

```
# Phase 2: caller only needs the vault ID
GET data.send.sgraph.ai/public-vaults/shared/{id[:2]}/{id}/public-vault.json
    → { "read_key": "...", "cdn_base": "https://data.send.sgraph.ai/...", ... }
    → use read_key to decrypt; fetch all objects directly from cdn_base
```

`public-vault.json` is the discovery entry point. It lives at the vault root (not inside
`bare/`) and is a plain JSON file — not an encrypted vault object, not using the
`/payload` suffix convention.

### `public-vault.json` format

```json
{
  "schema":     "sgit-public-vault/1",
  "vault_id":   "abc123de",
  "created_at": 1746662400000,
  "read_key":   "<base64-encoded read key bytes>",
  "cdn_base":   "https://data.send.sgraph.ai/public-vaults/shared/ab/abc123de"
}
```

`cdn_base` is the Phase 2 field — omit or set to the Lambda URL in Phase 1.
Any vault description lives inside the encrypted vault content, not here.
In Phase 2, SGit reads `cdn_base` from this file and constructs all object URLs from it,
so a CDN URL change is a server-side update to this file, not a protocol change.

This is intentional. Public vaults are opt-in. The owner is explicitly making the content
world-readable. The UX should make this unmistakably clear.

---

## Phase 1 Server Checklist (Revised)

| Task | Estimate |
|------|----------|
| New env var `SEND__PUBLIC_VAULT__S3_BUCKET` | 30 min |
| `Send__Config.public_vault_storage_fs()` returning `Storage_FS__S3` for public bucket | 30 min |
| Route layer: select storage backend from `X-Vault-Public: true` header | 1 hr |
| On first push to public vault: write `public-vault.json` (read_key from `X-Vault-Read-Key` header, plus metadata) | 1 hr |
| Tests | 2 hr |
| **Total** | **~5 hrs** |

Removed from Phase 1 (not needed):
- ~~Publish endpoint~~ — this is `sgit push public`
- ~~Unpublish endpoint~~ — this is `sgit push public` with a tombstone
- ~~Cross-bucket manifest lookup~~ — each bucket is independent

---

## Phase 2: CDN-Direct Reads

Add a CloudFront behaviour on `data.send.sgraph.ai` pointing at the public bucket:

```
/public-vaults/*  →  745506449035--sgraph-send-public--eu-west-2
```

Cache-Control:
- `bare/data/obj-cas-imm-*/payload` → `immutable, max-age=31536000`
- `bare/refs/*/payload` → `no-store` (mutable HEAD pointer)
- `public-vault.json` → `no-store` (contains read_key; must be purgeable on unpublish)
- `manifest.json` → blocked (CF behaviour returns 403; defence in depth)

From Phase 2, sgit fetches public vault objects directly from CloudFront. Writes continue
through the Lambda API with `X-Vault-Public: true`.

---

## Open Question for SGit Team

One security question remains open before Phase 1 can merge:

**Is `read_key → write_key` derivation computationally infeasible?**

If the read key and write key share a root secret with a forward derivation path, a reader
could escalate to writer. If they are fully independent, the design is clean. The SG/Send
API cannot answer this — it is a SGit-internal key derivation question.
