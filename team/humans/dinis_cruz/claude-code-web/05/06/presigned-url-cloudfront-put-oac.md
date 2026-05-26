# Briefing: CloudFront PUT Uploads Behind `*.sgraph.ai`

## Context

The original research correctly identifies the core S3 presigned URL problem:

- S3 presigned URLs are bound to the original S3 `Host` header via SigV4.
- Replacing the S3 hostname with `static.sgraph.ai` breaks the signature.
- Therefore, S3 presigned PUT/GET URLs cannot simply be routed through a custom domain.

The proposed solution for downloads using **CloudFront signed URLs + OAC** is sound.

However, for uploads there is an additional option worth evaluating before committing fully to Lambda chunking: **direct `PUT` uploads through CloudFront using Origin Access Control (OAC)**.

This does **not** mean using S3 presigned PUT URLs through CloudFront. It means using CloudFront as the viewer-facing upload endpoint, with CloudFront signing the origin request to S3.

---

## Key Concept

There are two separate authorization layers:

```text
Client / agent  --->  CloudFront  --->  S3
      viewer auth          origin auth
```

### 1. Client → CloudFront: viewer authorization

The client receives a short-lived CloudFront-authorized URL on `static.sgraph.ai`, for example:

```text
PUT https://static.sgraph.ai/uploads/transfers/{transfer_id}/{upload_id}/payload
  ?Expires=...
  &Signature=...
  &Key-Pair-Id=...
```

CloudFront validates this URL before accepting and forwarding the upload.

This is the app-controlled authorization point.

### 2. CloudFront → S3: origin authorization

CloudFront uses **Origin Access Control** with SigV4 signing enabled:

```text
OAC signing behavior: always
OAC signing protocol: SigV4
```

CloudFront signs the request it sends to S3.

The S3 bucket policy trusts only the CloudFront distribution, not public clients.

---

## Why This Enables App-Controlled Uploads

Yes, this allows SGraph to control programmatically who can upload files.

The flow becomes:

```text
1. User/agent authenticates to send.sgraph.ai
2. API checks whether the user may upload to the transfer/vault
3. API creates an upload record and target object key
4. API generates a short-lived CloudFront signed URL for that exact path
5. Client PUTs bytes to static.sgraph.ai
6. CloudFront validates the signed URL
7. CloudFront signs the origin request to S3 via OAC
8. S3 accepts the object only because it came from the trusted CloudFront distribution
9. API finalizes and validates the uploaded object before trusting it
```

The client never receives an S3 URL and never needs the S3 bucket hostname on the allow-list.

---

## Who Generates the CloudFront Signed URL?

The SGraph API/Lambda generates it, not the client.

This should live near the existing presigned URL service logic, for example:

```text
Service__Presigned_Urls.create_upload_url()
Service__Vault__Presigned.create_write_url()
```

Instead of creating an S3 presigned PUT URL, the service would:

1. Validate user permissions.
2. Create a canonical CloudFront upload path.
3. Generate a CloudFront signed URL.
4. Return method, URL, expiry, expected headers, and finalize endpoint.

Example response:

```json
{
  "method": "PUT",
  "url": "https://static.sgraph.ai/uploads/transfers/t_123/u_456/payload?Expires=...&Signature=...&Key-Pair-Id=...",
  "expires_in": 900,
  "max_size": 41943040,
  "headers": {
    "content-type": "application/octet-stream",
    "x-amz-meta-transfer-id": "t_123",
    "x-amz-meta-upload-id": "u_456",
    "x-amz-meta-sha256": "..."
  },
  "finalize_url": "https://send.sgraph.ai/api/transfers/t_123/uploads/u_456/finalize"
}
```

---

## Python Signing Implementation

In Python, use `botocore.signers.CloudFrontSigner`.

This is not the same as `boto3.client(...).generate_presigned_url(...)` used for normal AWS service presigning.

Example helper:

```python
import os
from datetime import datetime, timedelta, timezone

from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


CF_PUBLIC_KEY_ID  = os.environ["CF_PUBLIC_KEY_ID"]
CF_PRIVATE_KEY_PEM = os.environ["CF_PRIVATE_KEY_PEM"]


def rsa_signer(message: bytes) -> bytes:
    private_key = serialization.load_pem_private_key(
        CF_PRIVATE_KEY_PEM.encode("utf-8"),
        password=None,
    )
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())


def generate_cloudfront_signed_url(url: str, expires_in_seconds: int = 900) -> str:
    expire_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
    signer    = CloudFrontSigner(key_id=CF_PUBLIC_KEY_ID, rsa_signer=rsa_signer)
    return signer.generate_presigned_url(url, date_less_than=expire_at)
```

Usage:

```python
signed_url = generate_cloudfront_signed_url(
    "https://static.sgraph.ai/uploads/transfers/t_123/u_456/payload",
    expires_in_seconds=15 * 60,
)
```

Note: CloudFront's URL parameter is named `Key-Pair-Id`, but with modern CloudFront trusted key groups
this value is the **CloudFront public key ID**. Prefer naming the environment variable `CF_PUBLIC_KEY_ID`
rather than `CF_KEY_PAIR_ID`.

---

## CloudFront Key Setup

Recommended setup:

```text
1. Generate RSA public/private key pair
2. Upload public key to CloudFront
3. Add public key to a CloudFront trusted key group
4. Attach trusted key group to the relevant CloudFront cache behavior
5. Store private key securely for the API/Lambda signer
```

Use CloudFront trusted key groups rather than legacy CloudFront key pairs.

For private key storage:

- Secrets Manager or SSM Parameter Store is preferable.
- Lambda environment variables can work, but Lambda has a 4 KB aggregate environment variable limit
  and key rotation is less clean.

---

## CloudFront Behavior for Uploads

Create a dedicated behavior, for example:

```text
Path pattern:             /uploads/*
Allowed methods:          GET, HEAD, OPTIONS, PUT
Cached methods:           GET, HEAD
Viewer protocol policy:   HTTPS only
Restrict viewer access:   yes, trusted key group
Origin:                   S3 regional endpoint, not website endpoint
OAC:                      signing_behavior=always
```

Depending on the design, GET may not be needed on this behavior. If upload and download paths are
separated, the upload behavior can be more restrictive.

---

## S3 Bucket Policy

The bucket should allow writes only from the CloudFront distribution.

Example shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontPutObjectViaOAC",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": [ "s3:PutObject" ],
      "Resource": "arn:aws:s3:::745506449035--sgraph-send-transfers--eu-west-2/sg-send__data/sg-send-api__v1.0/shared/uploads/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id>"
        }
      }
    }
  ]
}
```

Downloads would need `s3:GetObject` on the relevant download prefix.

Deletes should only be added if explicitly required.

---

## Important Security Caveat

Native CloudFront signed URLs primarily authorize:

```text
- Resource path / URL
- Expiry time
- Optional start time
- Optional IP range
```

They do **not** by themselves enforce:

```text
- exact HTTP method
- exact content length
- checksum
- content type
- overwrite prevention
- business-level ownership rules
```

Those controls should be handled by a combination of:

```text
- CloudFront cache behavior allowed methods
- path-specific signed URLs
- short expiration times
- random upload IDs
- object metadata
- post-upload finalize validation
- optional CloudFront Function or Lambda@Edge validation
```

---

## Recommended SGraph Upload Flow

```text
POST https://send.sgraph.ai/api/transfers/{transfer_id}/cloudfront-upload-url
```

API checks permissions and returns a short-lived URL:

```text
PUT https://static.sgraph.ai/uploads/transfers/{transfer_id}/{upload_id}/payload?...signature...
```

Client uploads:

```bash
curl -X PUT \
  -H "content-type: application/octet-stream" \
  -H "x-amz-meta-transfer-id: t_123" \
  -H "x-amz-meta-upload-id: u_456" \
  -H "x-amz-meta-sha256: abc123..." \
  --data-binary @payload.zip \
  "$SIGNED_URL"
```

Client finalizes:

```text
POST https://send.sgraph.ai/api/transfers/{transfer_id}/uploads/{upload_id}/finalize
```

Finalize should:

```text
1. HEAD the uploaded S3 object
2. Verify object exists at expected key
3. Verify size is within limit
4. Verify metadata matches the upload record
5. Verify checksum if available
6. Move/copy object from temporary upload prefix to final trusted prefix
7. Mark transfer/vault write as complete
8. Optionally delete temporary upload key
```

This gives SGraph app-level authorization and validation while preserving the `*.sgraph.ai`
allow-list requirement.

---

## Relationship to Existing Tiered Plan

The original tiered upload plan (from `presigned-url-custom-domain-options.md`) is still valid
as a fallback:

```text
Tier 1: <5 MB       Lambda/API upload          agent-safe  (exists today)
Tier 2: 5–40 MB     Lambda chunked upload      agent-safe  (NEW — port from admin lambda)
Tier 3: >40 MB      S3 multipart presigned     not agent-safe
```

But CloudFront PUT introduces a cleaner alternative that replaces Tier 2:

```text
Tier 2B: any size    CloudFront OAC PUT via static.sgraph.ai    agent-safe
```

This could reduce or eliminate the need for Lambda chunking.

**Suggested next step: run a focused POC before implementing the chunked Lambda tier.**

---

## POC Scope

Implement a minimal direct PUT proof of concept:

```text
1.  Create /uploads/* behavior on static.sgraph.ai
2.  Enable PUT method
3.  Attach trusted key group
4.  Use OAC with signing_behavior=always
5.  Add S3 bucket policy allowing s3:PutObject only from the CloudFront distribution
6.  Add API helper to generate a CloudFront signed URL for an exact upload path
7.  PUT a test file through static.sgraph.ai
8.  Confirm S3 object is created
9.  Confirm unsigned PUT is rejected
10. Confirm expired signed URL is rejected
11. Confirm wrong path is rejected
12. Confirm raw S3 access is rejected
```

If this works cleanly with agent clients, it becomes the preferred medium-to-large upload path.

If edge validation or content-size enforcement becomes too complex, fall back to the Lambda
chunking plan (Tier 2 above).

---

## Correction to Original Chunk Size Assumption

If the Lambda chunking tier remains, adjust the proposed chunk size.

A raw 4 MB chunk encoded as base64 becomes approximately 5.33 MB before JSON/API overhead.
This is close to Lambda's 6 MB synchronous payload limit.

Safer values:

```text
Raw chunk size: 3.0–3.5 MB
Max chunks:     12 configurable
Total size:     approximately 36–42 MB
```

Add per-chunk and final checksums.

---

## Bottom Line

CloudFront PUT with OAC allows SGraph to keep upload URLs under `*.sgraph.ai` while still
writing directly to S3.

The app controls who can upload by deciding who receives short-lived CloudFront signed upload URLs.

The S3 bucket remains private and trusts only CloudFront.

This is not a replacement for all validation. The uploaded object should still go through a
finalize step before being trusted.

**Recommended action:** Run a CloudFront OAC PUT POC before implementing the Lambda chunked
upload tier.
