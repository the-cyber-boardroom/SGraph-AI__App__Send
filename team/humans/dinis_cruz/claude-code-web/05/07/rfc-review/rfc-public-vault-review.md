# RFC Review: Public Vault Type
**RFC date:** 02 May 2026
**Review date:** 07 May 2026
**Reviewer:** Architect Agent (SG/Send API) — code-verified against actual implementation

---

## Corrections to the RFC's Description of the Current Implementation

The RFC was written without access to the source code. Several descriptions of the current
system are inaccurate. These corrections are critical before any implementation work begins.

### 1. Object naming convention is different

The RFC describes client-side structure as `objects/`, `trees/`, `commits/`, `refs/heads/main`.
The actual server-side S3 key structure is:

```
# Actual (code-verified from Storage__Paths.py + SGit CLI behaviour):
sg-send__data/sg-send-api__v1.0/shared/vault/{id[:2]}/{vault_id}/
    manifest.json                           ← server-only auth record
    bare/
        refs/
            ref-current/payload             ← HEAD pointer
        data/
            obj-commit-{hash}/payload       ← commit objects
            obj-tree-{hash}/payload         ← tree objects
            obj-blob-{hash}/payload         ← blob objects
```

The client (SGit) sends `file_id` values like `bare/data/obj-commit-abc123` and the server
stores them as `{vault_prefix}/{file_id}/payload`. The server treats `file_id` as an opaque
string — it imposes no schema on the path.

The RFC's `objects/`, `trees/`, `commits/` naming reflects the SGit client's local
`.sg-vault/` folder layout, not the server's S3 structure. These are the same objects —
just named differently on the two sides.

### 2. There is no `_write_key` file

The RFC refers to a `_write_key` file in the vault's bare data. **This does not exist.**

The server stores vault auth in a separate `manifest.json` at the vault root:

```json
{
  "vault_id":       "dap47prw",
  "write_key_hash": "sha256hex...",
  "created_at":     1714000000000
}
```

`write_key_hash` is `SHA-256(write_key_hex)` — **a hash of the key, not the key itself.**
The actual write key never reaches or is stored by the server. This is the zero-knowledge
design.

This has significant implications for the AppSec questions — see below.

### 3. S3 bucket and path

The RFC uses placeholder names `sg-vaults-private` and `sg-vaults-public`. The actual
private bucket is `745506449035--sgraph-send-transfers--eu-west-2`. The proposal's
`{deployment}/{vault-id}/` path maps to the actual pattern
`sg-send__data/sg-send-api__v1.0/{deployment}/vault/{id[:2]}/{id}/`.

The two-character prefix (`{id[:2]}/`) is a shard prefix used to avoid S3 key hotspots.
It must be preserved in the public bucket structure.

### 4. All reads currently go through Lambda — there is no CDN read path today

The RFC describes the current private vault flow as:
```
Client -> API Gateway -> Lambda -> S3 -> Lambda -> Client
```

There is no API Gateway. SG/Send uses **Lambda Function URLs** (direct HTTPS, no API
Gateway). Otherwise this description is correct for the current state.

---

## Assessment of the Core Proposal

**The fundamental idea is sound.** A separate, publicly-readable S3 bucket for a distinct
"public vault" type is the right architectural boundary. The rest of the RFC's specific
questions can be answered cleanly once the factual corrections above are accepted.

### What is genuinely new

1. A second S3 bucket with public read via CloudFront
2. A `public: true` flag on API calls to route to the correct bucket
3. A `_read_key` file written into the vault's bare data (the actual read key, in plaintext)
4. A `_public` marker file (can be folded into `manifest.json` as a field instead)
5. CDN-direct reads (Phase 2) — this aligns with the `data.send.sgraph.ai` CloudFront
   work already in design (see `cloudfront-upload-briefing/`)

### What does NOT need to change

- The file path structure inside the bucket (reuse existing conventions)
- The write auth model (write key hash in manifest, never the key itself)
- The Lambda code for writes (just needs to know which bucket to use)
- The `Storage_FS` abstraction (it already accepts a configurable bucket name)

---

## Answers to RFC Questions (SG/Send Architect)

### Q1: Separate bucket — any issues?

No blockers. `Storage_FS__S3` takes `s3_bucket` as a constructor parameter — the same
Lambda code can write to a different bucket by instantiating a second `Storage_FS__S3`
with the public bucket name. No code duplication.

Bucket policy for public read via CloudFront:

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::745506449035--sgraph-send-public--eu-west-2/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::745506449035:distribution/<PUBLIC_DIST_ID>"
      }
    }
  }]
}
```

CORS: `AllowedOrigins: ["*"]`, `AllowedMethods: ["GET", "HEAD"]` — public read needs
no credentials so broad CORS is fine.

### Q2: CloudFront configuration

Two options:

**Option A (recommended):** Add a new origin on the existing `data.send.sgraph.ai`
distribution with a path-based behaviour:

```
/public-vaults/*  →  sg-send-public bucket
/uploads/*        →  sg-send-transfers bucket (existing)
/downloads/*      →  sg-send-transfers bucket (existing)
```

Public vault objects would be at:
```
https://data.send.sgraph.ai/public-vaults/{deployment}/{id[:2]}/{id}/{file_id}/payload
```

**Option B:** Separate CloudFront distribution (e.g. `vaults.sgraph.ai`). Cleaner
operationally — separate access logs, cache policies, and IAM. Slight additional cost.

Recommendation: Option B if public vaults are a significant product line; Option A if
they are a niche feature.

### Q3: Deployment path compatibility

The existing `SEND__DEPLOYMENT_ID` env var (default `shared`) flows into all S3 paths.
Dev, main, and prod all use `shared` today (same data namespace). The public bucket
would follow the same convention. No changes needed to the deployment concept.

### Q4: Object immutability and caching

**Yes, set `Cache-Control: immutable, max-age=31536000` on all data objects.**

Vault objects (commits, trees, blobs) are content-addressed by the SGit client —
same hash always means same content. They are truly immutable after write.

**One exception:** `bare/refs/ref-current/payload` is mutable (it's the HEAD pointer,
updated on every push). Set `Cache-Control: no-store` or short TTL on `refs/` prefix.
`_read_key` and `_public` are also mutable (could theoretically be replaced), so
no-store on those too.

### Q5: Discovery chain

The fetch chain is:

```
1. GET /public-vaults/{id}/bare/refs/ref-current/payload → commit_id (encrypted)
2. Client decrypts → gets obj-commit-{hash}
3. GET /public-vaults/{id}/bare/data/obj-commit-{hash}/payload → commit object (encrypted)
4. Client decrypts → gets tree_id
5. GET /public-vaults/{id}/bare/data/obj-tree-{hash}/payload → tree object (encrypted)
... etc
```

This is fine for developer/agent use. For a browser-facing "public vault" experience,
a `_manifest.json` (plaintext index of all objects + their sizes) would speed up initial
load. That is an optimisation — not required for Phase 1.

### Q6: Migration (private → public)

Migration requires:
1. Lambda reads all objects from private bucket (via existing `list_files` + `read`)
2. Writes them to public bucket with `public: true` routing
3. Writes `_read_key` and `_public` marker
4. Tombstones the private vault_id (via the new tombstone mechanism)

**This is a copy, not a move** — the vault_id is the same but data moves between buckets.
The tombstone on the private side prevents any future private write to that vault_id.

Reverse migration (public → private) is possible but must go through the API — the
server copies from public bucket to private, removes public objects, writes new manifest.
Recommend making this an explicit admin operation, not a self-service one.

---

## Answers to RFC AppSec Questions

### Q1: Can the read key derive the write key or vault key?

This depends entirely on the SGit key derivation. **The server does not know the read key
or vault key** — it only stores `SHA-256(write_key_hex)` in `manifest.json`. The server
cannot answer this question; it must be answered by the SGit team.

For the server's part: the server never stores the read key for private vaults, and never
stores the write key (only its hash). Public vaults store the read key in plaintext — this
is intentional and is the point of a public vault.

### Q2: `_write_key` in the public bucket — CORRECTION

**The RFC's assumption is wrong.** The `_write_key` file does not exist. What the server
stores in `manifest.json` is `write_key_hash = SHA-256(write_key_hex)`. This hash:

- Cannot be used to authenticate a write (the server re-hashes the submitted key and
  compares — submitting the hash directly would not match the hash-of-hash)
- Cannot derive the original write key (SHA-256 is one-way)

**Recommendation:** Keep `manifest.json` **out of the public bucket entirely**. It is a
server-internal auth record, not part of the vault's bare data. The public bucket should
contain only vault objects (bare data files) plus `_read_key` and `_public`. The Lambda
maintains its own `manifest.json` for the public vault in the public bucket, used only
for write authentication — not publicly readable.

If the public bucket policy is `s3:GetObject` via CloudFront, `manifest.json` would be
publicly readable unless explicitly excluded. Exclude it via bucket policy condition or
S3 object ACL on that specific key.

### Q3: CDN cache poisoning

Not a realistic risk. CloudFront only caches responses from the S3 origin. S3 objects
can only be written via the API (which requires the write key hash). An attacker cannot
cause CloudFront to cache arbitrary content at a legitimate hash URL without first
successfully writing to S3.

Client-side hash verification (re-hash downloaded ciphertext, compare to filename) is
a good practice and costs very little for objects that are already being decrypted.
Recommend including it in the SGit client as a standard integrity check.

### Q4: Client-side hash verification

**Yes, implement it.** The ciphertext is downloaded and decrypted anyway — computing
`SHA-256(ciphertext)` adds negligible cost. If the hash doesn't match the filename,
the client should refuse to use the object and alert the user. This detects:
- CDN configuration errors
- Any tampering between S3 and client
- Bugs in the build process that wrote incorrect content

### Q5: Metadata leakage

For a public vault, metadata exposure is acceptable by definition — the creator has opted
in. Object sizes, counts, and tree depth are observable. File names and paths are inside
encrypted tree objects, so they are not exposed. Commit timestamps (if unencrypted in
commit objects) would be exposed — this is a SGit design question, not a server question.

### Q6: Separate bucket as security boundary

**Yes, this satisfies the security requirement.** Separate bucket means:
- Separate IAM policies
- Separate S3 bucket policy
- Separate CloudFront distribution (recommended)
- Separate access logs
- Zero chance of a misconfigured vault ACL on one bucket affecting the other

Additional recommended control: enable S3 Object Lock on the private bucket with a
short retention period (e.g., 1 hour) so that even if credentials are compromised,
bulk deletion of private vault data is not instant.

---

## Minimal Implementation (Adapted to Actual Codebase)

### Phase 1: Routing + flag (no CDN changes)

**New env var:**
```python
SEND__PUBLIC_VAULT__S3_BUCKET = '745506449035--sgraph-send-public--eu-west-2'
```

**`Send__Config.py`:** expose `public_vault_storage_fs()` that returns a
`Storage_FS__S3` pointed at the public bucket.

**`Service__Vault__Pointer`:** accepts an optional `is_public: bool` param.
When `True`, uses `public_storage_fs` instead of `storage_fs` for all operations.
OR: simpler — the route layer creates a `Service__Vault__Pointer` with the public
`storage_fs` when the `public` flag is present.

**New API flag:** `X-SGGraph-Vault-Public: true` header (or `?public=true` query param)
on all existing vault routes. Route handler selects the correct storage backend.

**New files written on vault init (public vaults only):**
```
bare/meta/_public          → empty marker (or JSON: {"created_at": ...})
bare/meta/_read_key        → plaintext read key bytes (provided by client)
```
Not `manifest.json` — that stays server-internal in both buckets.

### Phase 2: CDN-direct reads (aligns with `data.send.sgraph.ai` work)

Add `/public-vaults/*` behaviour on the `data.send.sgraph.ai` CloudFront distribution
pointing to the public S3 bucket. No auth (public read). SGit fetches objects directly
from CloudFront URL when `public` mode is enabled.

Write operations continue through the Lambda API with `X-SGGraph-Vault-Public: true`.

### Phase 3: Hash verification + manifest

Client: verify `SHA-256(ciphertext) == filename` on every CDN-fetched object.
Server: optionally generate `_manifest.json` listing all object IDs and sizes
(plaintext) for faster initial clone.

---

## What the RFC Gets Right

- **Separate bucket for public data:** correct and essential
- **Explicit `public` flag required on all API calls:** correct — never implicit
- **Writes still through API:** correct — direct S3 writes must remain blocked
- **Content-addressed objects are immutable:** correct
- **`_read_key` embedded in vault data:** correct approach for self-contained public vaults
- **Phase approach:** sensible — API routing before CDN, CDN before optimisation

## What Needs to Change

| RFC claim | Correction |
|-----------|-----------|
| `_write_key` file in vault data | Does not exist. Server stores `write_key_hash` in `manifest.json` only. Keep `manifest.json` out of public bucket |
| Object path structure `objects/`, `trees/`, `commits/` | Actual: `bare/data/obj-{type}-{hash}/payload` |
| S3 path `{deployment}/{vault-id}/` | Actual: `sg-send__data/sg-send-api__v1.0/{deployment}/vault/{id[:2]}/{id}/` |
| API Gateway in flow diagram | No API Gateway — Lambda Function URLs directly |
| "reads currently through Lambda with auth" | Reads have no auth today (zero-knowledge model) |
