# Options Overview: Custom Domain for All File Transfer

## Problem

S3 presigned URLs expose the raw S3 bucket hostname:

```
745506449035--sgraph-send-transfers--eu-west-2.s3.amazonaws.com
```

Agents (Claude Code web, MCP clients, LLMs with browser tools) block requests
to any domain not on their allow-list. Today the S3 hostname must be explicitly
whitelisted alongside `*.sgraph.ai`. The goal is to eliminate it.

---

## The Hard S3 Constraint

S3 presigned URLs use SigV4 signing. The `Host` header is part of the signed
string:

```
PUT\n
host:745506449035--sgraph-send-transfers--eu-west-2.s3.amazonaws.com\n
x-amz-date:...\n
```

Changing the hostname in the URL — even via CloudFront forwarding — causes S3
to reject the request. The signature is permanently bound to the S3 host.

**This rules out routing existing S3 presigned URLs through a custom domain.**

The solution is a different mechanism: **CloudFront signed URLs + OAC**.

---

## Solution: `data.send.sgraph.ai`

A dedicated CloudFront distribution fronts the S3 bucket:

```
Client / agent  →  data.send.sgraph.ai (CloudFront)  →  S3
   viewer auth (CloudFront signed URL)    origin auth (OAC SigV4)
```

- Client sees only `data.send.sgraph.ai` — never the S3 hostname.
- CloudFront validates the signed URL before forwarding.
- CloudFront re-signs the origin request to S3 via OAC.
- S3 accepts only requests from the trusted CloudFront distribution.

The Lambda API (`send.sgraph.ai`) generates the short-lived signed URLs and
never exposes S3 to the client.

---

## Upload Tiers

| Tier | Size | Domain | Agent-safe? | Status |
|------|------|--------|------------|--------|
| 1 | < 5 MB | `send.sgraph.ai` | Yes | Exists today (Lambda proxy) |
| 2 | 5 MB – any | `data.send.sgraph.ai` | Yes | **New** (CloudFront OAC PUT) |
| 3 | > 40 MB legacy | raw S3 hostname | No | Exists today — kept for backwards compat |

Tier 2 (CloudFront OAC PUT) replaces the Lambda chunking approach entirely.
One `PUT` to `data.send.sgraph.ai` with a short-lived CloudFront signed URL
flows straight to S3 without Lambda buffering. See `02__cloudfront-put-oac.md`.

> **Tier 3 is not removed.** Existing clients using S3 presigned URLs continue
> to work until they explicitly migrate. No forced cutover.

---

## Download Path

CloudFront signed URLs on `data.send.sgraph.ai` for all downloads:

```
Before:  https://745506449035--...s3.amazonaws.com/...?X-Amz-Signature=...
After:   https://data.send.sgraph.ai/downloads/transfers/{id}/payload
           ?Expires=...&Signature=...&Key-Pair-Id=...
```

**This is the highest-impact change.** Vault cloning (SGit clone) is all GET
operations. Fixing downloads immediately makes the full clone flow agent-safe.

---

## Resulting Allow-list for Agents

After both phases are complete:

```
*.sgraph.ai      ← send.sgraph.ai (API) + data.send.sgraph.ai (files)
openrouter.ai    ← existing MCP/AI calls
```

The S3 domain is removed from the required allow-list entirely.

---

## Backwards Compatibility Commitment

Both old and new paths coexist until all clients have migrated:

```
Client type          Upload path           Download path
─────────────────────────────────────────────────────────────────
Browser (current)    S3 presigned PUT      S3 presigned GET
SGit (legacy)        S3 presigned PUT      S3 presigned GET
SGit (new)           data.send.sgraph.ai   data.send.sgraph.ai
Claude agent         data.send.sgraph.ai   data.send.sgraph.ai
```

The capabilities endpoint (`GET /api/presigned/capabilities`) gains two new
flags so clients can discover which paths are available:

```json
{
  "cloudfront_upload":   true,
  "cloudfront_download": true,
  "presigned_upload":    true,
  "presigned_download":  true
}
```

Clients that understand the new flags use `data.send.sgraph.ai`.
Older clients see the existing flags and continue using S3 presigned URLs.
