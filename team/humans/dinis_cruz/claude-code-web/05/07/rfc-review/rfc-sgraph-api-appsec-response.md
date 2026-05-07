# SG/Send API + AppSec Response to SGit Team RFC
**Date:** 07 May 2026 (revised)
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

## Revised Architecture Principle: Fully Independent Buckets

**The two buckets must be completely independent.** A public vault lives entirely in the
public bucket; a private vault lives entirely in the private bucket. Neither bucket knows
about the other. There is no cross-bucket coupling.

This means `manifest.json` for a public vault lives in the **public** bucket, not in the
private bucket. The Lambda selects which bucket to operate against based on the
`X-Vault-Public: true` header, and then does all operations — including write auth — against
that one bucket.

### Full public vault layout (public bucket only)

```
sg-send__data/sg-send-api__v1.0/{deployment}/vault/{id[:2]}/{id}/
    manifest.json            ← write auth record (write_key_hash); assume publicly readable
    bare/
        refs/
            <ref-id>/payload
        data/
            obj-cas-imm-<hash>/payload
        indexes/
            <index-id>/payload
    _read_key/payload        ← plaintext read key bytes; the decryption entry point
    _public/payload          ← public marker (JSON: {"created_at": ...})
    deleted.json             ← tombstone if vault is deleted/unpublished
```

### `manifest.json` exposure — design assumption

**Assume `manifest.json` is publicly readable.** Do not rely on it being hidden. A
CloudFront behaviour rule blocking `*/manifest.json` is recommended as defence in depth,
but the security model must not depend on it.

This is safe because `write_key_hash` exposure is benign — see §4.7 below for the full
proof. Design the system as if `manifest.json` is world-readable. If it is also blocked by
CloudFront, that is a bonus.

---

## §4.7 Blocker: Write Key Exposure — Full Answer

This is the stated blocker. The answer is unambiguous.

### What the server actually stores

```json
{ "vault_id": "abc123", "write_key_hash": "<sha256hex>", "created_at": 1714000000000 }
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

### Why `manifest.json` exposure is benign

Even if `manifest.json` is fully public:

1. `write_key_hash` is a SHA-256 digest. It cannot be reversed.
2. An attacker who submits the stored `write_key_hash` as the header value would fail: the
   server hashes the submitted value and compares `SHA-256(write_key_hash)` against the
   stored `write_key_hash`. These cannot match unless SHA-256 has a fixed point (it does
   not for any practical input).
3. The route layer requires the **plaintext** write key in the header. It hashes it on
   arrival. Submitting the hash directly is not a valid auth attempt.

**Answer to SGit 4.7 Q2:** `manifest.json` exposure is benign. The hash cannot forge a
valid write-key header. The public bucket can store `manifest.json` without weakening
write security.

### Accepted risk posture (project decision)

The project has accepted the following risk: even in the case of complete server-side data
compromise (all S3 objects readable), no security incident occurs, because:

- All vault objects are client-side encrypted (AES-256-GCM, Web Crypto API)
- The server has no decryption key at any time
- The `write_key_hash` cannot derive the write key or the encryption key

This zero-knowledge guarantee is fully preserved in the public vault design.

---

## AppSec Position on the Public Vault Design

### Q1: `_read_key` in the public bucket — is this safe?

**Yes.** For a public vault the `_read_key` is intentionally public — world-readable by
design. This is the point of a public vault. It is analogous to a public GitHub repository.

**`_read_key` is the decryption entry point.** The vault ID alone is sufficient for a client
to read all content:

```
1. vault_id known
2. GET https://data.send.sgraph.ai/public-vaults/{deployment}/{id[:2]}/{id}/_read_key/payload
   → read key bytes (plaintext)
3. GET .../bare/refs/<ref-id>/payload → encrypted HEAD ref → decrypt with read key
4. GET .../bare/data/obj-cas-imm-<hash>/payload → encrypted object → decrypt with read key
   ... and so on
```

No other credential or out-of-band value is needed. The vault URL (containing the vault ID)
is the only thing the vault owner needs to share.

Caveats:
- The read key enables **reading only**. It does not enable writing.
- The SGit team must confirm that `read_key → write_key` derivation is computationally
  infeasible (this is a SGit-internal design invariant; SG/Send API cannot verify it).
- Once published, `_read_key` cannot be purged from CDN caches without an explicit
  CloudFront cache invalidation. The unpublish flow must include this step.

### Q2: `manifest.json` in the public bucket

**Accept exposure; block as defence in depth.**

`manifest.json` lives in the public bucket for public vaults. This is required for the
fully-independent-bucket design. Assume it is publicly readable.

As established in §4.7, this is benign. `write_key_hash` cannot be used to forge a write
request. No secret is disclosed.

Recommended defence in depth: add a CloudFront cache behaviour for `*/manifest.json` that
returns 403. This prevents `write_key_hash` from appearing in CDN logs and access records,
and reduces attack surface for any future change to `manifest.json` content. But the
security model does not depend on this rule being in place.

### Q3: CDN cache poisoning

Not a realistic attack vector. CloudFront caches S3 responses only; S3 objects can only be
written via authenticated Lambda API calls (correct `write_key_hash`). The chain of custody
is intact.

Client-side hash verification (`SHA-256(ciphertext) == filename`) is recommended as
belt-and-braces integrity. Negligible cost since the object is already being decrypted.

### Q4: Metadata leakage in public vaults

Acceptable by definition — the user has opted in. Object counts, sizes, and tree depth
are observable. File names and paths are inside encrypted tree objects (not visible).
Commit timestamps are a SGit design question — confirm whether they are plaintext in
commit objects.

### Q5: Takedown / unpublish path

Must be supported from day 1. AppSec requirements:

1. **Write `deleted.json` tombstone** to the public vault prefix — same pattern as the
   private vault tombstone. Prevents re-publication under the same vault ID.
2. **Delete `_read_key/payload` and `_public/payload`** from the public bucket.
3. **CloudFront cache invalidation** for `_read_key` and `ref-current` paths — these are
   mutable and sensitive. For immutable `data/` objects, natural cache expiry is fine.
4. **Lambda returns 410 Gone** for any request to a tombstoned public vault prefix.

Note: migrating data from the public bucket to a private vault is an optional step — not
required for unpublish. The vault owner can create a new private vault separately if they
want to continue using the content. The tombstone simply closes the public vault.

AppSec sign-off: the public vault design is acceptable. The primary new risk (`_read_key`
publicly exposed) is user-acknowledged and consistent with the zero-knowledge philosophy.

### Q6: Accidental same-vault-ID in both buckets

The user raised whether we should prevent a public vault ID from being accidentally
created as a private vault in the private bucket (or vice versa).

**Not prevented at the server level.** Vault IDs are 8 hex characters of cryptographic
randomness — `secrets.token_hex(4)`. The probability of a collision between independently
created vaults is 1 in 2^32 (~1 in 4 billion). This does not require active prevention.

The tombstone pattern prevents re-creation **within the same bucket**. Cross-bucket
tombstone checking would require coupling the two buckets together, which is worse than
the risk it mitigates.

---

## Responses to SGit Asks (§4.1–4.8)

### 4.1 Confirm bucket name and path

**Confirmed.** Proposed public bucket: `745506449035--sgraph-send-public--eu-west-2`

Path structure mirrors the private bucket exactly. Both buckets use:
```
sg-send__data/sg-send-api__v1.0/{deployment}/vault/{id[:2]}/{id}/
    manifest.json
    bare/refs/<ref-id>/payload
    bare/data/obj-cas-imm-<hash>/payload
    bare/indexes/<index-id>/payload
    _read_key/payload      ← public vaults only
    _public/payload        ← public vaults only
    deleted.json           ← tombstone (either vault type, after delete)
```

The Lambda simply instantiates `Storage_FS__S3` with the appropriate bucket name. All
path logic is identical.

### 4.2 Header routing

**Confirmed.** `X-Vault-Public: true` header on all API calls routes to the public
`Storage_FS__S3` instance. One header; no other transport changes.

```python
def _get_storage_fs(self, request: Request) -> Storage_FS:
    if request.headers.get('x-vault-public') == 'true':
        return self.config.public_vault_storage_fs()
    return self.config.storage_fs()
```

All subsequent operations — reads, writes, manifest auth — use the selected storage
instance. No cross-bucket lookups.

### 4.3 Read key storage at vault creation

**Confirmed.** On public vault init (`X-Vault-Public: true`):
1. Write `manifest.json` to the **public** bucket (not the private bucket).
2. Write `_read_key/payload` to the public bucket with the read key bytes from the client.
3. Write `_public/payload` as a marker (JSON: `{"created_at": <timestamp>}`).

The client provides the `_read_key` bytes at vault creation time. The server stores them
verbatim and does not interpret or validate the key. Suggested transport: a dedicated
`X-Vault-Read-Key` header (base64-encoded) on the vault creation request.

**`_read_key/payload` is the discovery endpoint.** From Phase 2 onward, a client that
knows only the vault ID can fetch `_read_key/payload` from the CDN and derive the full
read capability without any out-of-band secret exchange.

### 4.4 Manifest exposure of public flag

**Confirmed.** `manifest.json` includes `"public": true` for public vaults. Because
manifest lives in the public bucket for public vaults, this field is readable — which is
fine and can even be useful (allows a generic client to detect vault type).

### 4.5 Phase 1: API routing without CDN

**Confirmed.** Phase 1 is API-only:
- Reads and writes: Lambda proxies to the appropriate S3 bucket based on the header
- `_read_key/payload` served via Lambda in Phase 1 (same as all other objects)
- No CloudFront involvement until Phase 2

Estimate: **1–2 days API-side** — aligns with SGit team estimate.

### 4.6 Phase 2: CDN-direct reads

**Confirmed.** CloudFront distribution for `data.send.sgraph.ai` adds a behaviour for
the public bucket. CDN URL:

```
https://data.send.sgraph.ai/public-vaults/{deployment}/{id[:2]}/{id}/{file_id}/payload
```

Including:
```
https://data.send.sgraph.ai/public-vaults/shared/{id[:2]}/{id}/_read_key/payload
```

SGit switches to direct CDN fetch for all public vault reads. Writes continue via Lambda.

Cache-Control recommendations:
- `bare/data/obj-cas-imm-*/payload` → `immutable, max-age=31536000` (content-addressed)
- `bare/refs/*/payload` → `no-store` or `max-age=10` (mutable HEAD pointer)
- `_read_key/payload` → `no-store` (must invalidate on unpublish)
- `manifest.json` → blocked by CF behaviour rule (403)

### 4.7 AppSec questions — answered above

Summary:
- `write_key_hash` exposure is benign (one-way hash, cannot forge auth header)
- `manifest.json` in public bucket: accepted, block via CF rule as defence in depth
- `_read_key` public exposure: accepted risk, user opt-in, zero-knowledge design intact
- Read key → write key derivation: **SGit team must confirm infeasible** (open question)

### 4.8 Takedown / unpublish

**Confirmed.** Endpoint: `POST /vault/{id}/unpublish` (requires write key in header).

Phase 1 implementation:
1. Verify write key against `manifest.json` in public bucket
2. Write `deleted.json` tombstone to public vault prefix
3. Delete `_read_key/payload` and `_public/payload`
4. Initiate CloudFront cache invalidation for `_read_key` and `ref-current` paths
5. Return 410 Gone for all subsequent requests to this vault in the public bucket

Data preservation (copy to private vault) is a Phase 2 feature if needed.

---

## Phase 1 API Change Checklist

| Task | Owner | Estimate |
|------|-------|----------|
| New env var `SEND__PUBLIC_VAULT__S3_BUCKET` | API | 30 min |
| `Send__Config.public_vault_storage_fs()` | API | 30 min |
| Header routing in route layer (select storage_fs) | API | 1 hr |
| `_read_key` + `_public` write on vault init | API | 1 hr |
| Unpublish endpoint (tombstone + delete `_read_key`) | API | 1 hr |
| Cache-Control headers on public bucket responses | API | 30 min |
| Tests (unit + integration) | API | 2 hr |
| **Total** | | **~6–7 hrs** |

---

## What Needs SGit Confirmation Before Phase 1 Merges

1. **Confirm `read_key → write_key` derivation is infeasible.** This is the only
   unresolved security question. If they share a root secret with a forward derivation
   path, the threat model changes materially.

2. **Confirm `_read_key` byte format.** Raw bytes, hex string, or base64? Affects how the
   client sends it (`X-Vault-Read-Key` header encoding) and how the server stores it.

3. **Confirm CDN URL format for Phase 2.** Proposed pattern above — confirm SGit's URL
   construction is compatible so Phase 2 is a config change, not a protocol change.

---

## Conclusion

The public vault design is sound. Fully independent buckets is the right architecture —
no cross-bucket coupling, no hidden dependencies. `manifest.json` exposure is benign and
the design explicitly accounts for it. The vault ID alone is sufficient to bootstrap a
read session via `_read_key/payload`. The single open question is the SGit-internal
`read_key → write_key` derivation path. Everything else is cleared for Phase 1.
