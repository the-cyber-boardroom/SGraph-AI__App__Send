# Dev Implementation Plan

## Backwards Compatibility Commitment

**Both old and new paths coexist indefinitely until each client explicitly migrates.**

No existing client will break. The S3 presigned URL path is not removed — it is
only deprecated after SGit and the browser client have fully adopted the new path
and the old path has had zero traffic for a defined period.

```
Client               Today                           After migration
────────────────────────────────────────────────────────────────────
Browser (old)        S3 presigned URL                unchanged
SGit (old)           S3 presigned URL                unchanged
SGit (new)           —                               data.send.sgraph.ai
Claude agent         blocked by S3 domain            data.send.sgraph.ai
Browser (new)        —                               data.send.sgraph.ai (optional)
```

The capabilities endpoint (`GET /api/presigned/capabilities`) is the discovery
mechanism. Clients that understand the new flags use the new path.
Clients that don't understand the new flags ignore them and use the old path.

---

## Phase 0: POC (1–2 days)

**Goal:** Validate that CloudFront OAC PUT actually works end-to-end before
committing to implementation.

```
Deliverable: A script that:
  1. Calls the Lambda API to get a CloudFront signed upload URL
  2. PUTs a test file to data.send.sgraph.ai
  3. Calls finalize
  4. Confirms the object appears at the correct S3 key
  5. Calls the Lambda API to get a CloudFront signed download URL
  6. GETs the object back via data.send.sgraph.ai
  7. Confirms bytes match

Also verify (manually):
  - Unsigned PUT → 403
  - Expired signed URL → 403
  - Wrong path → 403
  - Direct S3 PUT → 403
```

Infrastructure for the POC (done by DevOps, see `03__devops-config.md`):
- CloudFront distribution at `data.send.sgraph.ai`
- OAC configured
- S3 bucket policy updated
- Lambda env vars set (CF_PUBLIC_KEY_ID, CF_PRIVATE_KEY_PEM, CF_DISTRIBUTION_DOMAIN)

If POC fails or reveals unexpected complexity, fall back to Lambda chunked uploads
for Tier 2 (the plan remains valid).

---

## Phase 1: Download Path (1–2 days)

**Goal:** All transfer and vault downloads served via `data.send.sgraph.ai`.
Old S3 presigned GET URLs continue to work in parallel.

### New helper

Add `sgraph_ai_app_send/lambda__user/service/Service__CloudFront__Signer.py`:

```python
class Service__CloudFront__Signer(Type_Safe):
    distribution_domain : str
    public_key_id       : str
    private_key_pem     : str

    def signed_url(self, path: str, expires_in: int = 3600) -> str:
        ...  # botocore.signers.CloudFrontSigner implementation
             # see 02__cloudfront-put-oac.md for full code
```

### Changes to existing services

`Service__Presigned_Urls.create_download_url()`:
- If `cf_signer` is configured → generate CloudFront signed GET URL on `data.send.sgraph.ai`
- If not configured → existing S3 presigned GET URL (unchanged)

`Service__Vault__Presigned.create_read_url()`:
- Same pattern

### Capabilities endpoint update

`Service__Presigned_Urls.get_capabilities()` gains two new keys:

```python
return dict(
    ...
    cloudfront_download = self.cf_signer is not None,
    cloudfront_upload   = self.cf_signer is not None,
    cloudfront_domain   = self.cf_signer.distribution_domain if self.cf_signer else None,
)
```

### SGit adoption

SGit checks capabilities on `sgit clone` / `sgit pull`:
- If `cloudfront_download: true` → use CloudFront download URLs (no S3 domain needed)
- If `cloudfront_download: false` → use S3 presigned GET URLs (existing behaviour)

### Tests

- Unit test: `Service__CloudFront__Signer.signed_url()` generates a URL containing
  the distribution domain, the path, `Expires`, `Signature`, `Key-Pair-Id`.
- Unit test: capabilities endpoint includes `cloudfront_download` and `cloudfront_upload` keys.
- Integration test: end-to-end download via CloudFront signed URL.

---

## Phase 2: Upload Path (2–3 days)

**Goal:** All uploads can go through `data.send.sgraph.ai`. Old S3 presigned PUT
URLs continue to work in parallel.

### New routes (user Lambda)

```python
# POST /api/transfers/{transfer_id}/cloudfront-upload-url
# Returns a CloudFront signed PUT URL for direct upload to data.send.sgraph.ai

# POST /api/transfers/{transfer_id}/uploads/{upload_id}/finalize
# Validates the uploaded object and moves it to the authoritative location

# POST /api/vault/presigned/cloudfront-write-url/{vault_id}
# CloudFront signed PUT URL for vault object upload

# POST /api/vault/presigned/cloudfront-write-finalize/{vault_id}/{file_id}
# Validate + move vault object from uploads/ to vault/
```

### New service: `Service__CloudFront__Upload`

```python
class Service__CloudFront__Upload(Type_Safe):
    cf_signer    : Service__CloudFront__Signer
    s3           : S3
    s3_bucket    : str
    max_bytes    : int = 5 * 1024 * 1024 * 1024   # 5 GB (S3 single-PUT limit)

    def create_upload_url(self, transfer_id, upload_id, expires_in=900) -> dict:
        path = f"/uploads/transfers/{transfer_id}/{upload_id}/payload"
        return dict(
            method       = "PUT",
            url          = self.cf_signer.signed_url(path, expires_in),
            expires_in   = expires_in,
            max_bytes    = self.max_bytes,
            headers      = self._required_headers(transfer_id, upload_id),
            finalize_url = f"https://send.sgraph.ai/api/transfers/{transfer_id}/uploads/{upload_id}/finalize",
        )

    def finalize_upload(self, transfer_id, upload_id, expected_sha256=None) -> dict:
        # HEAD, verify, copy, delete temp, mark complete
        ...
```

### Backwards compatibility for multipart uploads

The existing `POST /api/presigned/initiate` → multipart PUT to raw S3 path is
**unchanged**. The new `cloudfront-upload-url` endpoint is a separate, parallel path.

Clients that want single-PUT (up to 5 GB) use the new path.
Clients that need multipart (> 5 GB) use the existing S3 presigned path.

### SGit adoption

SGit checks capabilities on `sgit push`:
- If `cloudfront_upload: true` → use CloudFront single-PUT for each object
- If `cloudfront_upload: false` → use existing S3 presigned PUT (unchanged)

SGit objects are typically small (encrypted blobs, < 10 MB each). Single-PUT
via CloudFront handles all practical vault objects.

### Tests

- Unit test: `create_upload_url()` returns expected structure
- Unit test: `finalize_upload()` rejects wrong transfer_id in metadata
- Unit test: `finalize_upload()` rejects oversized object
- Integration test: PUT a 50 MB file through `data.send.sgraph.ai`, finalize, confirm at final S3 key
- Integration test: unfinalized upload is cleaned up by S3 lifecycle after 24h

---

## Phase 3: SGit Full Adoption

**Goal:** SGit uses `data.send.sgraph.ai` exclusively. Agent allow-list drops the S3 domain.

After Phase 1 and 2 are deployed:

1. SGit CLI adds capabilities check + CloudFront upload/download paths
2. SGit integration tests run with only `*.sgraph.ai` on the allow-list
3. Announce: "SGit now works from any Claude agent with `*.sgraph.ai` allowed"
4. Monitor: confirm zero traffic on old S3 presigned paths from SGit user agents

---

## Phase 4: Browser Client (optional, future)

The browser (send.sgraph.ai UI) currently uses S3 presigned multipart upload for
large files. This gives human users a fast parallel upload experience.

Migrating to single-PUT via CloudFront removes the S3 domain requirement from the
browser too, but loses multipart parallelism. For files > ~100 MB, multipart may
be preferable.

Decision: defer browser migration until Phase 3 is stable. The S3 domain stays
on the browser allow-list for now — human users can manage this manually. Agents
use the new path exclusively.

---

## Phase 5: Deprecation (future)

Once all clients using the new path have had zero S3 presigned URL traffic for
30 days:

1. Remove `s3:GetObject` public access from the bucket policy (if it existed)
2. Update capabilities endpoint to return `presigned_upload: false` and
   `presigned_download: false`
3. Remove `Service__Presigned_Urls.create_download_url()` S3 code path
4. Announce deprecation of old path — give 90-day notice for any remaining clients

---

## File Structure (new files)

```
sgraph_ai_app_send/lambda__user/service/
├── Service__CloudFront__Signer.py     # CF signed URL generation (Phase 1)
└── Service__CloudFront__Upload.py     # Upload URL + finalize logic (Phase 2)

sgraph_ai_app_send/lambda__user/fast_api/routes/
└── Routes__CloudFront__Upload.py      # New routes: cloudfront-upload-url, finalize (Phase 2)

tests/unit/lambda__user/service/
├── test_Service__CloudFront__Signer.py
└── test_Service__CloudFront__Upload.py

tests/unit/lambda__user/fast_api/routes/
└── test_Routes__CloudFront__Upload.py
```

No changes to existing routes. No deletions. Purely additive.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CloudFront OAC PUT behaves differently than expected | Low | High | Phase 0 POC validates before any code written |
| CF signed URL generation adds cold-start latency (RSA signing) | Low | Low | Sign on request (not cold start); RSA-SHA1 is fast (~1ms) |
| Private key exposed in Lambda env vars | Low | High | Use SSM SecureString; rotate key annually |
| Client sends PUT without required metadata headers | Medium | Low | Finalize rejects if metadata missing; temp object expires in 24h |
| CloudFront adds latency to large uploads | Low | Medium | CF is edge-close and streams directly; no buffering in Lambda |
| Race condition: two concurrent uploads for same transfer_id | Low | Low | Random upload_id per request; finalize checks idempotently |
