# CloudFront PUT Uploads via OAC — Technical Briefing

## Two-Layer Authorization Model

```
Client / agent  →  data.send.sgraph.ai (CloudFront)  →  S3
   viewer auth                             origin auth
 (CF signed URL)                          (OAC SigV4)
```

### Layer 1: Client → CloudFront (viewer auth)

Client receives a short-lived CloudFront signed URL:

```
PUT https://data.send.sgraph.ai/uploads/transfers/{transfer_id}/{upload_id}/payload
  ?Expires=1748300000
  &Signature=<RSA-SHA1-over-policy>
  &Key-Pair-Id=<CF-public-key-id>
```

CloudFront validates the signature before forwarding the request.
The URL encodes the exact resource path and expiry — any tampering invalidates it.

### Layer 2: CloudFront → S3 (origin auth)

CloudFront uses Origin Access Control with `signing_behavior=always`:

```
OAC signing behavior: always
OAC signing protocol: SigV4
```

CloudFront re-signs the outbound request to S3. The S3 bucket policy permits
only requests from the specific CloudFront distribution — direct S3 access is
rejected.

---

## Upload Flow

```
Client                     Lambda (send.sgraph.ai)         CloudFront (data.send.sgraph.ai)     S3
  │                               │                                   │                          │
  │  POST /api/transfers/         │                                   │                          │
  │    {id}/cloudfront-upload-url │                                   │                          │
  │                               │── validate transfer               │                          │
  │                               │── generate CF signed URL ─────────┤                          │
  │  ◀── {method, url, expiry,    │   for exact path + TTL            │                          │
  │        finalize_url}          │                                   │                          │
  │                               │                                   │                          │
  │  PUT data.send.sgraph.ai/     │                                   │                          │
  │    uploads/.../payload ───────────────────────────────────────────▶                          │
  │  (content-type, x-amz-meta-*) │                                   │── OAC SigV4 sign ────────▶
  │                               │                                   │── PUT to S3 key ─────────▶
  │  ◀── 200 OK ──────────────────────────────────────────────────────│                          │
  │                               │                                   │                          │
  │  POST /api/transfers/         │                                   │                          │
  │    {id}/uploads/{uid}/finalize│                                   │                          │
  │                               │── HEAD S3 object ─────────────────────────────────────────── ▶
  │                               │── verify size/checksum            │                          │
  │                               │── copy to final S3 key ───────────────────────────────────── ▶
  │                               │── delete temp key ────────────────────────────────────────── ▶
  │                               │── mark transfer complete          │                          │
  │  ◀── 200 {status: complete}   │                                   │                          │
```

---

## S3 Key Layout

CloudFront origin path is set to `/sg-send__data/sg-send-api__v1.0/shared` so
paths are clean:

| CloudFront path | S3 key |
|-----------------|--------|
| `/downloads/transfers/{id[:2]}/{id}/payload` | `sg-send__data/.../shared/transfers/{id[:2]}/{id}/payload` |
| `/downloads/vault/{vid[:2]}/{vid}/{file_id}/payload` | `sg-send__data/.../shared/vault/{vid[:2]}/{vid}/{file_id}/payload` |
| `/uploads/transfers/{tid}/{uid}/payload` | `sg-send__data/.../shared/uploads/transfers/{tid}/{uid}/payload` |

Temp upload objects live under `uploads/` prefix. Finalize moves them to the
authoritative `transfers/` or `vault/` prefix via `s3.copy_object` + `s3.delete_object`.

---

## Python Signing Code

`botocore.signers.CloudFrontSigner` — not the same as `generate_presigned_url`.

```python
import os
from datetime import datetime, timedelta, timezone

from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


CF_DISTRIBUTION_DOMAIN = os.environ["CF_DISTRIBUTION_DOMAIN"]  # data.send.sgraph.ai
CF_PUBLIC_KEY_ID       = os.environ["CF_PUBLIC_KEY_ID"]         # CloudFront public key ID
CF_PRIVATE_KEY_PEM     = os.environ["CF_PRIVATE_KEY_PEM"]       # RSA private key, PEM


def _rsa_signer(message: bytes) -> bytes:
    private_key = serialization.load_pem_private_key(
        CF_PRIVATE_KEY_PEM.encode(), password=None
    )
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())


def generate_cf_signed_url(path: str, expires_in: int = 900) -> str:
    """path e.g. '/downloads/transfers/ab/abc123/payload'"""
    url      = f"https://{CF_DISTRIBUTION_DOMAIN}{path}"
    expire   = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    signer   = CloudFrontSigner(key_id=CF_PUBLIC_KEY_ID, rsa_signer=_rsa_signer)
    return signer.generate_presigned_url(url, date_less_than=expire)
```

SHA-1 is required by CloudFront's signing spec regardless of general security guidance.

---

## Upload API Response Shape

```json
{
  "method":       "PUT",
  "url":          "https://data.send.sgraph.ai/uploads/transfers/t_abc/u_xyz/payload?Expires=...&Signature=...&Key-Pair-Id=...",
  "expires_in":   900,
  "max_bytes":    209715200,
  "headers": {
    "content-type":              "application/octet-stream",
    "x-amz-meta-transfer-id":   "t_abc",
    "x-amz-meta-upload-id":     "u_xyz",
    "x-amz-meta-sha256":        "<sha256-of-ciphertext>"
  },
  "finalize_url": "https://send.sgraph.ai/api/transfers/t_abc/uploads/u_xyz/finalize"
}
```

---

## Finalize Step

Before trusting any uploaded object, the Lambda must validate it:

```python
def finalize_upload(transfer_id, upload_id):
    temp_key  = f"uploads/transfers/{transfer_id}/{upload_id}/payload"
    final_key = path__transfer_payload(transfer_id)           # existing helper

    # 1. Verify object exists
    head = s3.head_object(Bucket=bucket, Key=full_s3_key(temp_key))

    # 2. Verify size is within limit
    assert head['ContentLength'] <= MAX_UPLOAD_BYTES

    # 3. Verify metadata matches upload record
    meta = head.get('Metadata', {})
    assert meta.get('transfer-id') == transfer_id
    assert meta.get('upload-id')   == upload_id

    # 4. Verify checksum if provided
    if expected_sha256:
        assert meta.get('sha256') == expected_sha256

    # 5. Copy to authoritative location
    s3.copy_object(CopySource={'Bucket': bucket, 'Key': full_s3_key(temp_key)},
                   Bucket=bucket, Key=full_s3_key(final_key))

    # 6. Delete temp object
    s3.delete_object(Bucket=bucket, Key=full_s3_key(temp_key))

    # 7. Mark transfer complete
    transfer_service.complete_transfer(transfer_id)
```

---

## Security Properties

**What CloudFront signed URLs enforce:**
- Exact resource path (cannot be used for a different object)
- Expiry time (typically 15 minutes for uploads, 1 hour for downloads)
- Optional: IP restriction, start time

**What CloudFront signed URLs do NOT enforce (must be handled in app):**
- HTTP method (handled by cache behavior `AllowedMethods`)
- Content length (Lambda enforces `max_bytes` in finalize HEAD check)
- Checksum (app checks `x-amz-meta-sha256` in finalize)
- Overwrite prevention (random `upload_id` per request)
- Business ownership rules (Lambda validates before issuing the signed URL)

**S3 bucket access:**
- Direct S3 access is blocked — bucket policy trusts only the CloudFront distribution
- Presigned S3 URLs for old clients still work (different auth path, not affected)

---

## POC Validation Checklist

Before implementing in production:

```
1.  Create /uploads/* behavior on data.send.sgraph.ai with PUT allowed
2.  Attach trusted key group
3.  Enable OAC with signing_behavior=always
4.  Add S3 bucket policy: s3:PutObject only from the CloudFront distribution
5.  Generate a CloudFront signed URL for a test upload path
6.  PUT a 50 MB test file through data.send.sgraph.ai
7.  Confirm S3 object appears at expected key
8.  Confirm unsigned PUT to the same URL is rejected (403)
9.  Confirm expired signed URL is rejected (403)
10. Confirm signed URL for path A cannot be used for path B (403)
11. Confirm direct PUT to raw S3 URL is rejected (403)
12. Confirm a CloudFront signed GET URL for the object returns the bytes
13. Confirm an agent with only *.sgraph.ai on its allow-list can complete the flow
```
