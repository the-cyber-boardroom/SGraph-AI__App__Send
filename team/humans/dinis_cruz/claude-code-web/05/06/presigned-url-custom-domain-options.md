# Presigned URL Custom Domain — Options

**Problem:** S3 presigned URLs expose the raw S3 bucket hostname
(`745506449035--sgraph-send-transfers--eu-west-2.s3.amazonaws.com`).
Agents block requests to domains not on the allow-list, so this S3 domain
must be explicitly whitelisted. We want to serve everything through `*.sgraph.ai`.

---

## Why This Matters for Agents

When an agent (Claude Code web, or any MCP client) runs flows that involve
uploading or downloading files, every URL the client touches must be on the
agent's allowed-domain list. Today that requires:

```
*.sgraph.ai                                            ← API, UI
745506449035--sgraph-send-transfers--eu-west-2.s3.amazonaws.com  ← S3 presigned URLs
```

Removing the S3 domain from the list is a hard requirement for
**fully-agent-safe** file transfer and vault operations.

---

## The Hard Constraint

S3 presigned URLs use SigV4 signing. The `Host` header is part of the signed
string. You cannot swap the hostname (even via CloudFront forwarding) without
S3 rejecting the signature. This is a fundamental AWS constraint — not a
configuration option.

```
Signed string includes:
  PUT\n
  host:745506449035--sgraph-send-transfers--eu-west-2.s3.amazonaws.com\n
  ...

→ If client sends request to static.sgraph.ai, S3 rejects it.
  The signature is bound to the original host, permanently.
```

---

## Download Path — Fully Solvable

**Solution: CloudFront Signed URLs**

Put a CloudFront distribution in front of the S3 bucket with:
- Custom domain: `static.sgraph.ai` (already exists as a CF distribution)
- Origin path: `s3://745506449035--sgraph-send-transfers--eu-west-2/sg-send__data/sg-send-api__v1.0/shared/`
- Origin Access Control (OAC): CloudFront re-signs requests to S3
- CloudFront key pair: RSA keypair for signing download URLs

Lambda generates CloudFront signed URLs instead of S3 presigned GET URLs:

```
Before:  https://745506449035--sgraph-send-transfers--eu-west-2.s3.amazonaws.com/...?X-Amz-Signature=...
After:   https://static.sgraph.ai/transfers/{id}/payload?Expires=...&Signature=...&Key-Pair-Id=...
```

**Impact:** Vault cloning (SGit clone) only needs GET operations — this
solution makes the entire vault clone flow agent-safe without the S3 domain.

**Code change:** `Service__Presigned_Urls.create_download_url()` and
`Service__Vault__Presigned.create_read_url()` switch from `s3.create_pre_signed_url()`
to a CloudFront signed URL generator using the CF key pair stored in Lambda env vars.

---

## Upload Path — Three-Tier Approach

Since S3 presigned PUT URLs cannot be routed through a custom domain,
uploads use a tiered strategy based on file size:

### Tier 1: Small files (< ~5MB) — already agent-safe
Route: `PUT /api/transfers/upload/{id}` or `POST /api/vault/write/{id}/{file_id}`
- Upload goes through Lambda
- Lambda writes to Storage_FS → S3
- Pure `send.sgraph.ai` — no S3 domain exposure
- Current limit: ~5MB (Lambda 6MB response body limit)

### Tier 2: Medium files (~5MB–40MB) — new, agent-safe
Route: `POST /api/transfers/upload-chunk/{id}` (NEW — adapt from admin Lambda pattern)

Upload in up to **10 × 4MB chunks** through Lambda:
```
Client                    Lambda                     S3
  │                          │                        │
  │  POST upload-chunk       │                        │
  │  {chunk_index: 0,        │                        │
  │   total_chunks: 5,       │                        │
  │   chunk_data: <b64>}     │── store chunk ─────────▶
  │  ◀── 200 {stored: true}  │                        │
  │                          │                        │
  │  POST upload-chunk       │                        │
  │  {chunk_index: 1, ...}   │── store chunk ─────────▶
  │  ...                     │                        │
  │                          │                        │
  │  POST assemble           │── read all chunks ─────▶
  │                          │── concatenate           │
  │                          │── write final object ──▶
  │  ◀── 200 {assembled}     │── delete chunks ────────▶
```

- **Max per chunk:** 4MB (stays well under Lambda 6MB body limit with base64 overhead)
- **Max total:** 10 chunks × 4MB = **40MB** (covers all practical agent-initiated uploads)
- **Domain:** 100% `send.sgraph.ai` — fully agent-safe
- **Prior art:** Admin Lambda already has `Service__Vault.store_file_chunk()` and `assemble_file()` — port this pattern to the user Lambda

### Tier 3: Large files (> 40MB) — human/CLI only, not agent-safe
Route: `POST /api/presigned/initiate` → S3 multipart presigned PUT URLs

- Parts go directly to the raw S3 domain
- **Not agent-safe** by design — agents can't realistically handle 40MB+ files anyway
- Human users (browser, CLI) can add the S3 domain to their allow-list manually
- SGit CLI does not use browser allow-lists — unaffected

```
Tier    Size        Domain              Agent-safe?   Status
─────────────────────────────────────────────────────────────
1       < 5MB       send.sgraph.ai      Yes           Exists today
2       5–40MB      send.sgraph.ai      Yes           New (port from admin lambda)
3       > 40MB      *.s3.amazonaws.com  No            Exists today (humans/CLI only)
```

---

## Resulting Allow-list for Agents

After implementing download fix + Tier 2 uploads:

```
*.sgraph.ai           ← covers send.sgraph.ai, static.sgraph.ai, dev.*, etc.
openrouter.ai         ← existing (MCP/AI calls)
```

The S3 domain (`745506449035--...s3.amazonaws.com`) is removed from the
required agent allow-list entirely.

---

## Implementation Plan

### Phase 1 — Downloads (CloudFront signed URLs)
1. Create CloudFront distribution at `static.sgraph.ai` with OAC pointing to S3 bucket + prefix
2. Generate a CloudFront key pair, store private key in Lambda env as `CF_SIGNING_KEY` and key-pair ID as `CF_KEY_PAIR_ID`
3. Change `create_download_url()` and `create_read_url()` to call a `generate_cloudfront_signed_url()` helper instead of `s3.create_pre_signed_url()`
4. Update capabilities endpoint to reflect new download URL domain

**Benefit unlocked: full vault clone (SGit clone) is agent-safe.**

### Phase 2 — Medium uploads (chunked through Lambda)
1. Add `POST /api/transfers/upload-chunk/{transfer_id}` route to user Lambda
2. Add `POST /api/transfers/assemble/{transfer_id}` route
3. Chunk storage: use existing Storage_FS (temp prefix, e.g. `transfers/{id}/chunks/`)
4. Client checks capabilities endpoint → uses chunked path if file 5–40MB
5. Port chunk-and-assemble logic from `lambda__admin/service/Service__Vault.py`

**Benefit unlocked: medium file uploads by agents without S3 domain.**

---

## Notes

- The 40MB agent ceiling is a pragmatic choice. If agents need larger files, the
  chunk count or size can be increased — but 40MB already covers virtually all
  source-code repository content an AI agent would push.
- The existing S3 multipart upload path (Tier 3) is unchanged — zero regression
  for human users and the SGit CLI.
- `static.sgraph.ai` already exists as a CF distribution (used for UI assets).
  Whether to reuse it or create a separate data distribution is a minor
  infrastructure decision — a separate distribution keeps access logs clean.
