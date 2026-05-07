# SG/Send API + AppSec Response to SGit Team RFC
**Date:** 07 May 2026
**From:** SG/Send API Architect + AppSec Agent
**To:** SGit Team
**Re:** Public Vault RFC — SGit Team Response (received 07 May 2026)

---

## Summary

The SGit team's response is well-grounded in the actual implementation. The simplified design
(single `X-Vault-Public: true` header, no new transport) is the right call and aligns exactly
with the API team's own assessment. This document responds to each of the SGit team's asks
(§4.1–4.8) and provides the AppSec team's formal position on the security questions.

---

## §4.7 Blocker: Write Key Exposure — Full Answer

This is the stated blocker. The answer is unambiguous.

### What the server actually stores

```
manifest.json  →  { "vault_id": "...", "write_key_hash": "<sha256hex>", "created_at": ... }
```

`write_key_hash = SHA-256(write_key_hex)`

The **actual write key** never reaches the server. What the server holds is a one-way hash.

### Authentication flow (code-verified)

```python
# Service__Vault__Pointer._check_vault_write_key()
def _check_vault_write_key(self, vault_id, submitted_hash):
    manifest = self._load_manifest(vault_id)
    if manifest is None:
        return True                      # First write — no key yet
    if manifest.get('status') == 'deleted':
        return False                     # Tombstone — permanently blocked
    return manifest.get('write_key_hash') == submitted_hash
```

The route layer computes `SHA-256(write_key_hex)` from the `x-sgraph-vault-write-key` header
and passes the *hash* to this method. The server never sees or stores the key itself.

### Why exposing `manifest.json` from the public bucket is benign

If `manifest.json` were publicly readable (it should not be — see §AppSec Q2 below):

1. `write_key_hash` is a SHA-256 digest. It cannot be reversed.
2. An attacker who submits `write_key_hash` as the `x-sgraph-vault-write-key` header would
   fail authentication: the server would re-hash the submitted value and compare
   `SHA-256(write_key_hash)` against the stored `write_key_hash`. These cannot match unless
   SHA-256 has a fixed point (it does not for any practical input).
3. The write key must be submitted in plaintext in the header; the server hashes it on arrival.
   Submitting the hash directly is not a valid authentication attempt.

**Answer to SGit 4.7 Q2:** Exposing `manifest.json` does NOT expose any credential that could
be used to authenticate a write. The hash cannot forge a valid write-key header.

### Accepted risk posture (project decision)

The project has accepted the following risk: even in the case of complete server-side data
compromise (all S3 objects readable), no security incident occurs, because:

- All vault objects are client-side encrypted (AES-256-GCM, Web Crypto API)
- The server has no decryption key at any time
- The write key hash cannot derive the write key or the encryption key

This is the zero-knowledge guarantee. It is preserved in full by the public vault design.

---

## AppSec Position on the Public Vault Design

### Q1: `_read_key` in the public bucket — is this safe?

**Yes, with caveats.** For a public vault, the `_read_key` is intentionally public — this
is the mechanism by which anyone with the vault URL can read the vault. It is analogous to
a public GitHub repository: the content is world-readable by design.

Caveats:
- The read key enables **reading** of vault content. It does not enable writing.
- If the write key were derivable from the read key (a SGit client-side design question),
  this would be a problem. The SGit team must confirm that `read_key` and `write_key` are
  independently derived with no backwards inference path.
- Once published, a `_read_key` cannot be un-published from CDN caches without a cache
  purge. Design for this from the start: the "unpublish" flow (§4.8) must include a
  CloudFront cache invalidation for the `_read_key` path.

**AppSec recommendation:** Confirm with SGit that `derive(read_key) → write_key` is
computationally infeasible. This is a SGit-internal design invariant; SG/Send API cannot
verify it.

### Q2: `manifest.json` in the public bucket

**`manifest.json` must NOT be publicly readable.**

`manifest.json` is a server-internal auth record (`write_key_hash`, `created_at`). It is not
part of the vault's data. It has no business being in the public CloudFront distribution.

Two enforcement approaches:
1. **Store `manifest.json` only in the private bucket** (preferred): even for public vaults,
   the auth record stays in the private bucket. The public bucket contains only vault objects
   + `_read_key` + `_public`.
2. **CloudFront behaviour rule** (defence in depth): add a CloudFront cache behaviour for
   `*/manifest.json` that returns 403, regardless of what S3 returns.

The API team will implement option 1. Option 2 is recommended as defence in depth once the
CloudFront distribution is created.

### Q3: CDN cache poisoning

Not a realistic attack vector. CloudFront can only cache S3 responses; S3 objects can only
be written via authenticated API calls. The chain of custody is intact.

Client-side hash verification (`SHA-256(ciphertext) == filename`) is recommended as a
belt-and-braces integrity check. Cost: negligible (object is already being decrypted).

### Q4: Metadata leakage in public vaults

Acceptable. The user has explicitly opted into a public vault. Object counts, sizes, and
tree depth are observable. File names and paths are inside encrypted tree objects (not
visible). Commit timestamps depend on SGit's commit object design — the SGit team should
confirm whether timestamps are plaintext in commit objects.

### Q5: Takedown / unpublish path

Must be supported from day 1 (§4.8). AppSec requirements:

1. **Server copies objects from public bucket to private bucket** — or creates a new
   private vault and moves the data. Vault ID may stay the same or change (user decision).
2. **Deletes all objects from public bucket** — including `_read_key` and `_public`.
3. **CloudFront cache invalidation** — required for `_read_key` and `ref-current` paths
   (the only mutable/sensitive paths). For immutable data objects, cache expiry is fine.
4. **Tombstone on the public vault** — write `deleted.json` to the public vault prefix to
   prevent re-publication under the same ID without a new vault creation.
5. **Audit log** — record the unpublish event in the vault's server-side history.

AppSec sign-off: public vault is acceptable. The primary new risk (read key publicly
exposed) is accepted by the user and is consistent with the zero-knowledge design philosophy.

---

## Responses to SGit Asks (§4.1–4.8)

### 4.1 Confirm bucket name and path

**Confirmed.** Proposed bucket name: `745506449035--sgraph-send-public--eu-west-2`
(following existing naming convention).

Path structure (mirrors private bucket exactly):
```
sg-send__data/sg-send-api__v1.0/{deployment}/vault/{id[:2]}/{id}/
    manifest.json        ← stays in private bucket only (NOT in public bucket)
    bare/
        refs/
            <ref-id>/payload
        data/
            obj-cas-imm-<hash>/payload
        indexes/
            <index-id>/payload
    _read_key/payload    ← new: plaintext read key bytes
    _public/payload      ← new: public marker (empty or JSON {"created_at": ...})
```

Note: `manifest.json` is kept in the **private bucket only**, even for public vaults.
The Lambda uses the private bucket for auth and the public bucket for data.

### 4.2 Header routing

**Confirmed.** `X-Vault-Public: true` header on all API calls routes to the public
`Storage_FS__S3` instance. The route layer instantiates the correct backend based on this
header. No other transport changes.

Implementation sketch:
```python
def _get_storage_fs(self, request: Request) -> Storage_FS:
    if request.headers.get('x-vault-public') == 'true':
        return self.config.public_vault_storage_fs()
    return self.config.storage_fs()
```

### 4.3 Read key storage at vault creation

**Confirmed.** When `X-Vault-Public: true` is present on the vault creation call, the API:
1. Stores `manifest.json` in the **private** bucket as usual.
2. Stores `_read_key/payload` and `_public/payload` in the **public** bucket.

The client sends the `_read_key` bytes in the creation request body (or a dedicated
`X-Vault-Read-Key` header — to be agreed). The server stores it verbatim; it does not
validate or interpret the key.

### 4.4 Manifest exposure of public flag

**Confirmed.** `manifest.json` will include `"public": true` for public vaults. This is
the server's canonical record of vault type, used for routing decisions. It is not publicly
accessible (stored in private bucket only, or at minimum excluded from CloudFront).

### 4.5 Phase 1: API routing without CDN

**Confirmed.** Phase 1 is API-only:
- Reads: Lambda fetches from public S3 bucket and returns in response body (same Lambda URL)
- Writes: Lambda writes to public S3 bucket
- No CloudFront involvement in Phase 1

Estimate: **1–2 days API-side** (new env var, second Storage_FS instance, header routing,
`_read_key` + `_public` write on init). This matches the SGit team's estimate.

### 4.6 Phase 2: CDN-direct reads

**Confirmed.** Phase 2 adds the `data.send.sgraph.ai` CloudFront distribution behaviour
for the public bucket. SGit clients switch to fetching objects directly from CloudFront
URLs when public mode is active. Writes continue through the Lambda API.

CDN URL pattern:
```
https://data.send.sgraph.ai/public-vaults/{deployment}/{id[:2]}/{id}/{file_id}/payload
```

This aligns with the `cloudfront-upload-briefing` already in design (see
`claude-code-web/05/06/cloudfront-upload-briefing/`). The public vault CDN path can be
a second behaviour on the same distribution (no new DNS entry required in Phase 2).

### 4.7 AppSec questions — see above

Key answers:
- `write_key_hash` exposure is benign (one-way hash, cannot forge auth)
- `manifest.json` must be kept out of the public bucket
- `_read_key` public exposure is accepted risk (zero-knowledge design, user opt-in)
- Read key → write key derivation must be confirmed infeasible by SGit team

### 4.8 Takedown / unpublish

**Confirmed.** The API team will implement a `DELETE /vault/{id}/publish` endpoint (or
`POST /vault/{id}/unpublish`) in Phase 1. See AppSec Q5 above for requirements.

Simplest Phase 1 implementation: mark `_public` as `{"status": "unpublished"}` and have
Lambda return 410 Gone for all public bucket reads. Full data migration to private bucket
can be Phase 2.

---

## Phase 1 API Change Checklist

| Task | Owner | Estimate |
|------|-------|----------|
| New env var `SEND__PUBLIC_VAULT__S3_BUCKET` | API | 30 min |
| `Send__Config.public_vault_storage_fs()` | API | 30 min |
| Header routing in route layer | API | 1 hr |
| `_read_key` + `_public` write on vault init | API | 1 hr |
| `manifest.json` stays in private bucket | API | included above |
| Unpublish endpoint (simple tombstone version) | API | 1 hr |
| Tests (unit + integration) | API | 2 hr |
| **Total** | | **~6–7 hrs** |

---

## What Needs SGit Confirmation Before Phase 1 Merges

1. **Confirm `read_key → write_key` derivation is infeasible.** This is the only unresolved
   security question. If the answer is "they share a root secret and one can derive the other,"
   then the threat model for public vaults changes materially. If they are independent, we
   are clear to proceed.

2. **Confirm `_read_key` byte format.** The API will store it verbatim — just confirm the
   expected content (raw bytes? hex string? base64?). This affects how the client sends it
   and how the server stores it.

3. **Confirm Phase 1 CDN URL format.** The API team proposes
   `https://data.send.sgraph.ai/public-vaults/{deployment}/{id[:2]}/{id}/{file_id}/payload`
   for Phase 2. SGit should confirm this is compatible with its URL construction logic, so
   Phase 2 integration is a configuration change, not a protocol change.

---

## Conclusion

The public vault design is sound, the security properties are preserved, and the
implementation scope is small. The single open question is the SGit-internal key derivation
path from read key to write key. Everything else is cleared for Phase 1 implementation.
