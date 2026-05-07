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
3. **`_read_key/payload` written on first push** — when the public vault is initialised
   (i.e. `manifest.json` does not yet exist in the public bucket for that vault ID), the
   server writes `_read_key/payload` alongside the manifest

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

## The Only New Security Property

The read key is embedded in the public vault at `_read_key/payload`. This is the
decryption entry point: the **vault ID alone** is sufficient for any client to read all
content.

```
vault_id  →  GET data.send.sgraph.ai/public-vaults/.../vault_id/_read_key/payload
          →  read key bytes
          →  decrypt all subsequent object fetches
```

This is intentional. Public vaults are opt-in. The owner is explicitly making the content
world-readable. The UX should make this unmistakably clear.

---

## Phase 1 Server Checklist (Revised)

| Task | Estimate |
|------|----------|
| New env var `SEND__PUBLIC_VAULT__S3_BUCKET` | 30 min |
| `Send__Config.public_vault_storage_fs()` returning `Storage_FS__S3` for public bucket | 30 min |
| Route layer: select storage backend from `X-Vault-Public: true` header | 1 hr |
| On first push to public vault: write `_read_key/payload` (from `X-Vault-Read-Key` header) and `_public/payload` | 1 hr |
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
- `_read_key/payload` → `no-store` (must be purgeable on unpublish)
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
