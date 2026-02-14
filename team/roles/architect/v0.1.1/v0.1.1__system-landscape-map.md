# SGraph Send — System Landscape Map

**Author:** Claude (Cartographer role)
**Date:** 2026-02-08
**Status:** DRAFT

---

## 1. Full System Topology

```
                               ┌──────────────────────────┐
                               │        Internet          │
                               │   (Sender / Receiver)    │
                               └────────────┬─────────────┘
                                            │ HTTPS
                                            ▼
                    ┌────────────────────────────────────────────┐
                    │              CloudFront                     │
                    │       {tier}-send.sgraph.ai                │
                    │       *.sgraph.ai wildcard SSL             │
                    │                                            │
                    │  Behaviour Rules:                          │
                    │  ┌──────────┬──────────────────────┐      │
                    │  │ Path     │ Origin               │      │
                    │  ├──────────┼──────────────────────┤      │
                    │  │ /api/*   │ API Gateway           │      │
                    │  │ *        │ S3 Frontend Bucket    │      │
                    │  └──────────┴──────────────────────┘      │
                    └──────┬─────────────────────┬──────────────┘
                           │                     │
              ┌────────────┘                     └────────────┐
              ▼                                               ▼
    ┌──────────────────┐                         ┌──────────────────┐
    │  S3: Frontend    │                         │  API Gateway     │
    │  Bucket          │                         │  REST API        │
    │                  │                         │  /api/v1/*       │
    │  index.html      │                         │                  │
    │  css/            │                         │  CORS: allowed   │
    │  js/             │                         │  origins per     │
    │  assets/         │                         │  environment     │
    │                  │                         └────────┬─────────┘
    │  Static site     │                                  │
    │  (HTML/JS/CSS)   │                                  ▼
    │  No server-side  │                         ┌────────────────┐
    │  processing      │                         │  Lambda         │
    └──────────────────┘                         │  Function       │
                                                 │                 │
                                                 │  FastAPI +      │
                                                 │  Mangum         │
                                                 │  Python 3.12    │
                                                 │  arm64          │
                                                 │  256MB          │
                                                 │  30s timeout    │
                                                 └───┬────────┬───┘
                                                     │        │
                                    ┌────────────────┘        └────────────────┐
                                    ▼                                          ▼
                         ┌─────────────────────┐                  ┌─────────────────────┐
                         │  S3: Data Bucket    │                  │  S3: Config Bucket  │
                         │                     │                  │                     │
                         │  transfers/{id}/    │                  │  tokens/{id}.json   │
                         │  ├── meta.json     │                  │  waitlist/{id}.json │
                         │  ├── events.json   │                  │  admin/stats.json   │
                         │  └── payload.enc   │                  │                     │
                         │                     │                  │  IAM: Lambda         │
                         │  IAM: Lambda        │                  │  read/write          │
                         │  read/write +       │                  │                     │
                         │  generate presigned │                  └─────────────────────┘
                         │                     │
                         │  SSE-S3 encryption  │
                         │  No public access   │
                         └─────────────────────┘

                 ┌──────────────────────────────────────────────────┐
                 │  CloudWatch                                       │
                 │  ├── Logs (Lambda structured JSON logs)           │
                 │  ├── Metrics (invocations, duration, errors)      │
                 │  └── Alarms (error rate, latency)                 │
                 └──────────────────────────────────────────────────┘
```

---

## 2. Data Flow: Upload (Encrypt & Send)

```
Step  Actor            Action                          Target
────  ──────           ──────                          ──────
 1    Sender Browser   Enter token + select file       (local)
 2    Sender Browser   POST /api/v1/transfers          → API Gateway → Lambda
      [Body: {file_size, content_type}]
      [Header: Authorization: Bearer tok_xxx]
 3    Lambda           Validate token                  ← S3 Config (tokens/)
 4    Lambda           Create meta.json + events.json  → S3 Data (transfers/{id}/)
 5    Lambda           Generate presigned PUT URL       → S3 SDK
 6    Lambda           Return {transfer_id, upload_url} → Sender Browser

 7    Sender Browser   Generate AES-256-GCM key        (local, Web Crypto API)
 8    Sender Browser   Encrypt file → payload blob     (local, Web Crypto API)
 9    Sender Browser   PUT payload blob                → S3 Data (direct, presigned URL)
      [No Lambda involvement — direct browser→S3]

10    Sender Browser   POST /transfers/{id}/complete   → API Gateway → Lambda
      [Header: Authorization: Bearer tok_xxx]
11    Lambda           Update meta.json (completed)    → S3 Data
12    Lambda           Return {download_link, transparency} → Sender Browser

13    Sender Browser   Display link + key + panel      (local)
```

**Key observation:** Lambda handles steps 2–6 and 10–12 (auth + metadata). Steps 7–9 are entirely client-side and S3-direct. Lambda never sees the file content or the encryption key.

---

## 3. Data Flow: Download (Receive & Decrypt)

```
Step  Actor              Action                          Target
────  ──────             ──────                          ──────
 1    Receiver Browser   Open /d/{transfer_id}           → CloudFront → S3 Frontend
 2    Receiver Browser   GET /api/v1/transfers/{id}      → API Gateway → Lambda
 3    Lambda             Read meta.json                  ← S3 Data
 4    Lambda             Return {status, file_size, ...} → Receiver Browser

 5    Receiver Browser   Display transfer info + key input (local)
 6    Receiver Browser   Enter decryption key            (local)
 7    Receiver Browser   Click "Download & Decrypt"      (local)

 8    Receiver Browser   GET /api/v1/transfers/{id}/download → API Gateway → Lambda
 9    Lambda             Append download event to events.json → S3 Data
10    Lambda             Generate presigned GET URL       → S3 SDK
11    Lambda             Return {download_url, transparency} → Receiver Browser

12    Receiver Browser   GET download_url                → S3 Data (direct, presigned URL)
      [No Lambda involvement — direct browser→S3]
13    Receiver Browser   Receive encrypted blob          ← S3 Data

14    Receiver Browser   Decrypt blob using entered key  (local, Web Crypto API)
15    Receiver Browser   Trigger browser "Save As"       (local)
```

**Key observation:** Lambda handles steps 2–4 and 8–11 (metadata + presigned URL). Steps 12–15 are entirely client-side and S3-direct.

---

## 4. Environment Separation

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEV ENVIRONMENT                              │
│  Domain:    dev-send.sgraph.ai                                      │
│  CloudFront: d-dev-xxxxx.cloudfront.net                             │
│  Lambda:    sgraph-send-dev-api                                     │
│  S3:        sgraph-send-dev-frontend                                │
│             sgraph-send-dev-data                                    │
│             sgraph-send-dev-config                                  │
│  Admin Key: SGRAPH_SEND_ADMIN_KEY (dev-specific)                    │
│  Deploy:    Auto on push to dev branch                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        QA ENVIRONMENT                               │
│  Domain:    qa-send.sgraph.ai                                       │
│  CloudFront: d-qa-xxxxx.cloudfront.net                              │
│  Lambda:    sgraph-send-qa-api                                      │
│  S3:        sgraph-send-qa-frontend                                 │
│             sgraph-send-qa-data                                     │
│             sgraph-send-qa-config                                   │
│  Admin Key: SGRAPH_SEND_ADMIN_KEY (qa-specific)                     │
│  Deploy:    Manual promotion from dev                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        PROD ENVIRONMENT                             │
│  Domain:    send.sgraph.ai                                          │
│  CloudFront: d-prod-xxxxx.cloudfront.net                            │
│  Lambda:    sgraph-send-prod-api                                    │
│  S3:        sgraph-send-prod-frontend                               │
│             sgraph-send-prod-data                                   │
│             sgraph-send-prod-config                                 │
│  Admin Key: SGRAPH_SEND_ADMIN_KEY (prod-specific)                   │
│  Deploy:    Manual promotion from qa                                │
└─────────────────────────────────────────────────────────────────────┘
```

Each environment is fully isolated. No shared S3 buckets, no shared Lambda functions, no shared admin keys.

---

## 5. Security Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PUBLIC ZONE (no auth required)                    │
│                                                                     │
│  GET  /d/{id}                Frontend download page                 │
│  GET  /api/v1/transfers/{id}          Transfer metadata             │
│  GET  /api/v1/transfers/{id}/download Pre-signed download URL       │
│  POST /api/v1/register-interest       Mailing list sign-up          │
│  GET  /api/v1/health                  Health check                  │
│  GET  /                               Frontend upload page          │
│  GET  /how                            How-it-works page             │
│                                                                     │
│  NOTE: Public endpoints are safe because file content is encrypted. │
│  The download URL gives access to ciphertext only. The decryption   │
│  key is never in this zone.                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    SENDER ZONE (token required)                     │
│                                                                     │
│  POST /api/v1/transfers               Initiate transfer             │
│  POST /api/v1/transfers/{id}/complete Mark upload complete           │
│                                                                     │
│  Authorization: Bearer tok_xxx                                      │
│  Token validated per-request against S3 config bucket               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ADMIN ZONE (admin key required)                   │
│                                                                     │
│  POST   /api/v1/tokens               Create token                  │
│  GET    /api/v1/tokens               List tokens                   │
│  DELETE /api/v1/tokens/{id}          Revoke token                  │
│  GET    /api/v1/admin/stats          Usage analytics               │
│                                                                     │
│  Authorization: Bearer adm_xxx                                      │
│  Admin key from environment variable, compared per-request          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT-ONLY ZONE (never on server)                │
│                                                                     │
│  AES-256-GCM key generation          Browser only                   │
│  File encryption                     Browser only                   │
│  File decryption                     Browser only                   │
│  Decryption key display              Browser only                   │
│  Decrypted file content              Browser only                   │
│                                                                     │
│  NOTHING in this zone ever reaches the server. This is the          │
│  fundamental security guarantee of the system.                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. IAM Role Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  Role: sgraph-send-{tier}-lambda-exec                               │
│                                                                     │
│  Attached to: Lambda function                                       │
│  Permissions:                                                       │
│    s3:GetObject     on sgraph-send-{tier}-data/*                    │
│    s3:PutObject     on sgraph-send-{tier}-data/*                    │
│    s3:ListBucket    on sgraph-send-{tier}-data                      │
│    s3:GetObject     on sgraph-send-{tier}-config/*                  │
│    s3:PutObject     on sgraph-send-{tier}-config/*                  │
│    s3:ListBucket    on sgraph-send-{tier}-config                    │
│    logs:*           on /aws/lambda/sgraph-send-{tier}-api           │
│                                                                     │
│  NOTE: Lambda also needs s3:PutObject to generate presigned PUT     │
│  URLs (the presigned URL inherits the caller's permissions).        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Role: sgraph-send-{tier}-deployer                                  │
│                                                                     │
│  Attached to: GitHub Actions CI/CD                                  │
│  Permissions:                                                       │
│    lambda:UpdateFunctionCode  on sgraph-send-{tier}-api             │
│    s3:PutObject               on sgraph-send-{tier}-frontend/*      │
│    s3:DeleteObject            on sgraph-send-{tier}-frontend/*      │
│    cloudfront:CreateInvalidation on distribution                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Integration Risks & Dependency Chain

### 7.1 Critical Path Dependencies

```
                    ┌──────────────────┐
                    │ AWS Account +    │
                    │ IAM Roles        │
                    └──────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────┐
    │ S3 Buckets   │ │ Lambda   │ │ API Gateway  │
    │ (data+config │ │ Function │ │              │
    │  +frontend)  │ │          │ │              │
    └──────┬───────┘ └────┬─────┘ └──────┬───────┘
           │              │              │
           └──────────────┼──────────────┘
                          ▼
                   ┌─────────────┐
                   │ CloudFront  │
                   │ Distribution│
                   └──────┬──────┘
                          ▼
                   ┌─────────────┐
                   │ DNS (Route  │
                   │  53 or ext) │
                   └─────────────┘
```

### 7.2 Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| S3 presigned URL CORS issues | Upload/download fails | High (first time) | Test CORS config early; document exact CORS headers needed |
| API Gateway payload limit (6MB) | Can't proxy large files | N/A | Already mitigated: presigned URLs bypass API Gateway |
| Lambda cold starts | First request slow (1-3s) | Medium | Provisioned concurrency for prod; acceptable for dev/qa |
| S3 eventual consistency (events.json) | Lost download events | Low | Acceptable for MVP; DynamoDB migration path documented |
| Web Crypto API browser compat | Encryption fails on some browsers | Low | Target Chrome 90+, Firefox 90+, Safari 15+ — all support it |
| CloudFront cache stale frontend | Old JS served after deploy | Medium | CloudFront invalidation on deploy; content-hashed filenames |
| Admin key in env var | Key rotation requires redeploy | Low (MVP) | Acceptable for MVP; rotate to Secrets Manager later |

---

## 8. AWS Resource Summary (Per Environment)

| Resource | Name Pattern | Count per Env | Total (3 envs) |
|----------|-------------|---------------|-----------------|
| S3 Bucket | `sgraph-send-{tier}-data` | 1 | 3 |
| S3 Bucket | `sgraph-send-{tier}-config` | 1 | 3 |
| S3 Bucket | `sgraph-send-{tier}-frontend` | 1 | 3 |
| Lambda Function | `sgraph-send-{tier}-api` | 1 | 3 |
| API Gateway | `sgraph-send-{tier}` | 1 | 3 |
| CloudFront Distribution | `sgraph-send-{tier}` | 1 | 3 |
| IAM Role | `sgraph-send-{tier}-lambda-exec` | 1 | 3 |
| IAM Role | `sgraph-send-{tier}-deployer` | 1 | 3 |
| CloudWatch Log Group | `/aws/lambda/sgraph-send-{tier}-api` | 1 | 3 |

**Total AWS resources:** 27 (9 per environment)
