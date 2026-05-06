# DevOps Configuration

Everything required to stand up `data.send.sgraph.ai`.

---

## 1. DNS

Add a CNAME in Route 53 (or wherever `sgraph.ai` is managed):

```
data.send.sgraph.ai  CNAME  <cloudfront-distribution-domain>.cloudfront.net
```

The existing wildcard ACM certificate for `*.sgraph.ai` covers this subdomain —
no new certificate needed if the cert is already in `us-east-1` (CloudFront
requires ACM certs in us-east-1).

Verify:
```bash
aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?contains(DomainName,'*.sgraph.ai')]"
```

---

## 2. CloudFront Key Pair (trusted key group)

### Generate RSA key pair

```bash
openssl genrsa -out cf-signing-private.pem 2048
openssl rsa -pubout -in cf-signing-private.pem -out cf-signing-public.pem
```

### Upload public key to CloudFront

Console: CloudFront → Public keys → Create public key → paste `cf-signing-public.pem`

Or CLI:
```bash
aws cloudfront create-public-key --public-key-config \
  CallerReference=sgraph-send-data-$(date +%s),\
  Name=sgraph-send-data-upload-key,\
  EncodedKey=$(cat cf-signing-public.pem | tr -d '\n')
```

Note the returned `PublicKeyId` — this is `CF_PUBLIC_KEY_ID` in Lambda env vars.

### Create trusted key group

Console: CloudFront → Key groups → Create key group → add the public key above

Or CLI:
```bash
aws cloudfront create-key-group --key-group-config \
  Name=sgraph-send-data-key-group,\
  Items=["<PublicKeyId>"]
```

Note the `KeyGroupId` — referenced in the distribution cache behavior.

### Store private key

Option A (recommended): SSM Parameter Store (SecureString, encrypted with KMS):
```bash
aws ssm put-parameter \
  --name /sgraph/send/cf-signing-private-key \
  --type SecureString \
  --value "$(cat cf-signing-private.pem)"
```

Option B: Lambda environment variable (simpler, but 4 KB aggregate env var limit
applies — a 2048-bit RSA PEM key is ~1.7 KB, so it fits, but leaves little room
for other env vars):
```
CF_PRIVATE_KEY_PEM = <full PEM content, newlines preserved>
```

---

## 3. CloudFront Distribution

Create a new distribution (separate from the static UI distribution to keep
access logs and cache behaviors clean).

### Origin

```
Origin domain:       745506449035--sgraph-send-transfers--eu-west-2.s3.eu-west-2.amazonaws.com
Origin path:         /sg-send__data/sg-send-api__v1.0/shared
Origin type:         S3 (not S3 website endpoint)
Origin access:       Origin Access Control (OAC)
OAC name:            sgraph-send-data-oac
OAC signing:         Sign requests (SigV4), always
```

**Important:** Use the S3 regional endpoint (`s3.eu-west-2.amazonaws.com`), not the
global endpoint or the website endpoint. OAC requires the regional endpoint.

### Cache Behaviors

Two separate behaviors on the same distribution:

#### Behavior A: Downloads (`/downloads/*`)

```
Path pattern:              /downloads/*
Allowed HTTP methods:      GET, HEAD, OPTIONS
Cached HTTP methods:       GET, HEAD
Viewer protocol policy:    Redirect HTTP to HTTPS
Restrict viewer access:    Yes
  Trusted key groups:      sgraph-send-data-key-group
Cache policy:              CachingDisabled  (content is per-request and signed)
Origin request policy:     AllViewer (forward all headers/query strings to origin)
Compress objects:          No  (already encrypted ciphertext — compression won't help)
```

#### Behavior B: Uploads (`/uploads/*`)

```
Path pattern:              /uploads/*
Allowed HTTP methods:      GET, HEAD, OPTIONS, PUT
Cached HTTP methods:       GET, HEAD
Viewer protocol policy:    Redirect HTTP to HTTPS
Restrict viewer access:    Yes
  Trusted key groups:      sgraph-send-data-key-group
Cache policy:              CachingDisabled
Origin request policy:     AllViewer
Compress objects:          No
```

Note: CloudFront does not buffer PUT request bodies — it streams them directly
to the origin. Maximum object size via CloudFront PUT is 5 GB (S3 single-PUT
limit). For files larger than 5 GB, S3 multipart upload is required (out of scope).

#### Default behavior (`/*`)

```
Path pattern:              * (default)
Allowed HTTP methods:      GET, HEAD
Viewer protocol policy:    Redirect HTTP to HTTPS
Restrict viewer access:    Yes, same key group
Cache policy:              CachingDisabled
```

This acts as a catch-all. Requests that don't match `/downloads/*` or `/uploads/*`
are rejected by the signed URL check (no valid signature for the default path).

### Distribution Settings

```
Alternate domain names:    data.send.sgraph.ai
SSL certificate:           *.sgraph.ai (ACM, us-east-1)
HTTP/2:                    enabled
HTTP/3:                    enabled (optional)
IPv6:                      enabled
Logging:                   enabled, separate S3 prefix for access logs
Price class:               Use only North America and Europe  (adjust to match existing)
```

---

## 4. S3 Bucket Policy Changes

The existing bucket (`745506449035--sgraph-send-transfers--eu-west-2`) needs
two new statements — one for downloads and one for uploads.

These are **additive** — existing policy statements for Lambda execution role
are unchanged.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontGetObjectDownloads",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::745506449035--sgraph-send-transfers--eu-west-2/sg-send__data/sg-send-api__v1.0/shared/transfers/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::745506449035:distribution/<DISTRIBUTION_ID>"
        }
      }
    },
    {
      "Sid": "AllowCloudFrontGetObjectVaultDownloads",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::745506449035--sgraph-send-transfers--eu-west-2/sg-send__data/sg-send-api__v1.0/shared/vault/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::745506449035:distribution/<DISTRIBUTION_ID>"
        }
      }
    },
    {
      "Sid": "AllowCloudFrontPutObjectUploads",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::745506449035--sgraph-send-transfers--eu-west-2/sg-send__data/sg-send-api__v1.0/shared/uploads/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::745506449035:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

**Notes:**
- `GetObject` is scoped to `transfers/*` and `vault/*` — the prefixes that contain
  authoritative objects. Temp upload objects (`uploads/*`) are not readable via CF.
- `PutObject` is scoped to `uploads/*` only — the temp prefix. The finalize Lambda
  step (authenticated via Lambda IAM role) moves objects to the authoritative prefix.
- Replace `<DISTRIBUTION_ID>` with the actual CloudFront distribution ID after creation.

---

## 5. Lambda Environment Variables

Add to the user Lambda function (in `Deploy__Service.deploy_lambda()`):

```python
_.set_env_variable('CF_DISTRIBUTION_DOMAIN', 'data.send.sgraph.ai'              )
_.set_env_variable('CF_PUBLIC_KEY_ID'       , get_env('CF_PUBLIC_KEY_ID'       ) )
_.set_env_variable('CF_PRIVATE_KEY_PEM'     , get_env('CF_PRIVATE_KEY_PEM'     ) )
```

`CF_PRIVATE_KEY_PEM` and `CF_PUBLIC_KEY_ID` must be set in the CI/CD environment
(GitHub Actions secrets) and never committed to the repo.

Alternatively, if SSM is used for the private key, replace `CF_PRIVATE_KEY_PEM`
with the SSM parameter name and have the Lambda fetch it at cold start:

```python
_.set_env_variable('CF_PRIVATE_KEY_SSM_PATH', '/sgraph/send/cf-signing-private-key')
```

---

## 6. CORS

The CloudFront distribution must return appropriate CORS headers for browser
clients doing cross-origin PUTs.

Add a CloudFront response headers policy on the `/uploads/*` behavior:

```
Access-Control-Allow-Origin:  https://send.sgraph.ai
Access-Control-Allow-Methods: PUT, OPTIONS
Access-Control-Allow-Headers: content-type, x-amz-meta-transfer-id, x-amz-meta-upload-id, x-amz-meta-sha256
Access-Control-Max-Age:       86400
```

For the `/downloads/*` behavior:

```
Access-Control-Allow-Origin:  https://send.sgraph.ai
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Max-Age:       86400
```

---

## 7. S3 Lifecycle Rule (temp upload cleanup)

Add a lifecycle rule to prevent orphaned temp upload objects accumulating if
finalize is never called (e.g. client crash):

```json
{
  "Rules": [
    {
      "ID": "expire-temp-uploads",
      "Filter": { "Prefix": "sg-send__data/sg-send-api__v1.0/shared/uploads/" },
      "Status": "Enabled",
      "Expiration": { "Days": 1 }
    }
  ]
}
```

Objects in `uploads/` that are not finalized are automatically deleted after 24 hours.

---

## 8. Setup Sequence

Recommended order to avoid partial states:

```
1. Generate RSA key pair locally
2. Upload public key to CloudFront → get PublicKeyId
3. Create key group with the public key → get KeyGroupId
4. Create OAC → get OACId
5. Create CloudFront distribution (no S3 bucket policy yet)
   → get DistributionId and DistributionDomain
6. Add DNS CNAME: data.send.sgraph.ai → DistributionDomain
7. Update S3 bucket policy with DistributionId (now it's known)
8. Store private key in SSM or CI secrets
9. Add Lambda env vars (CF_DISTRIBUTION_DOMAIN, CF_PUBLIC_KEY_ID, CF_PRIVATE_KEY_PEM)
10. Run POC validation checklist (see 02__cloudfront-put-oac.md)
```
