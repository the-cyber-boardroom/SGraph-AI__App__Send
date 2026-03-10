# S3 Rate Limits, Constraints, and Cost Optimization

**Version:** v0.3.13
**Date:** 2026-02-15
**Role:** Architect
**Purpose:** Reference document for architecture and operational decisions on the S3-backed file transfer engine

---

## Table of Contents

1. [S3 Request Rate Limits](#1-s3-request-rate-limits)
2. [S3 Multipart Upload Constraints](#2-s3-multipart-upload-constraints)
3. [Optimal Chunk Size Analysis](#3-optimal-chunk-size-analysis)
4. [S3 Pricing Model (us-east-1)](#4-s3-pricing-model-us-east-1)
5. [S3 Transfer Acceleration](#5-s3-transfer-acceleration)
6. [CloudFront Integration](#6-cloudfront-integration)
7. [CORS Configuration](#7-cors-configuration)
8. [Lifecycle Policies](#8-lifecycle-policies)
9. [Presigned URL Constraints](#9-presigned-url-constraints)
10. [Recommendations](#10-recommendations)

---

## 1. S3 Request Rate Limits

### Per-Prefix Baseline Limits

| Operation Type | Requests/Second/Prefix |
|---|---|
| PUT / COPY / POST / DELETE | 3,500 |
| GET / HEAD | 5,500 |

There is no limit to the number of prefixes in a bucket, so total bucket throughput scales linearly with the number of active prefixes. With 10 prefixes, effective PUT throughput becomes 10 x 3,500 = 35,000 requests/second.

### What Counts as a "Prefix"?

A prefix is the leading portion of an object key used by S3 for internal partitioning. Despite common belief, **slashes have no special meaning** to S3's partitioning system. S3 treats keys as flat strings and examines the distribution of data and activity across different prefix lengths to find optimal split points.

Key clarification: **the per-prefix limits are not immediate**. When a bucket is first created, all keys share a single partition. S3 automatically partitions as it detects sustained high request rates on specific prefixes. This auto-partitioning process takes 30-60 minutes. Until partitioning occurs, even low-traffic prefixes can be throttled if other prefixes in the same partition are consuming capacity.

### Auto-Scaling Behavior

- S3 automatically scales to handle increased request rates, but scaling is **not instantaneous**
- During scale-up, S3 may return **HTTP 503 Slow Down** responses
- Scaling happens gradually over 30-60 minutes of sustained traffic
- Once partitioned, each prefix gets its own independent rate limit
- AWS Support can pre-partition prefixes if you anticipate sudden spikes

### Multipart Upload Request Counting

**Yes, each part counts as a separate request.** A multipart upload with N parts generates:

| API Call | Count | Billed As |
|---|---|---|
| `CreateMultipartUpload` | 1 | PUT |
| `UploadPart` | N | N x PUT |
| `CompleteMultipartUpload` | 1 | PUT |
| **Total** | **N + 2** | **N + 2 PUT requests** |

Example: A 1 GB file uploaded with 10 MB chunks = 100 parts = **102 PUT requests** against the prefix rate limit.

### Prefix Distribution Strategy for SGraph Send

To avoid throttling, distribute chunks across multiple prefixes using hash-based key structures:

```
chunks/{hash_prefix}/{transfer_id}/{chunk_index}
```

Where `{hash_prefix}` is derived from the first 2 characters of the transfer_id (hex), giving 256 possible prefixes (00-ff):

```
chunks/a3/Trf_abc123def/0001
chunks/a3/Trf_abc123def/0002
chunks/7f/Trf_7f9b12cc34/0001
```

This distributes writes across up to 256 prefixes, yielding a theoretical maximum of 256 x 3,500 = **896,000 PUT requests/second** -- far more than needed.

### 503 Slow Down Handling

When rate limits are exceeded, S3 returns `HTTP 503 Slow Down`. The application **must** implement:

1. **Exponential backoff** starting at 100ms, doubling each retry
2. **Jitter** to prevent thundering herd (randomize backoff within a range)
3. **Maximum retry count** (e.g., 5 retries = up to ~3.2s total wait)
4. **Per-request retry** (only retry the failed part, not the entire upload)

### Best Practices Summary

| Practice | Rationale |
|---|---|
| Use random/hash-based prefixes | Prevents hot-partition problems |
| Avoid date-based or sequential prefixes | Sequential keys concentrate load on one partition |
| Ramp traffic gradually for new prefixes | Give S3 time to auto-partition |
| Implement exponential backoff with jitter | Required to handle 503 responses gracefully |
| Monitor `SlowDown` CloudWatch metrics | Early warning for throttling |
| Consider SSE-S3 over SSE-KMS | KMS has its own request quotas that can bottleneck S3 throughput |

---

## 2. S3 Multipart Upload Constraints

### Hard Limits

| Constraint | Value |
|---|---|
| Minimum part size | **5 MB** (except the last part) |
| Maximum part size | **5 GB** |
| Maximum number of parts | **10,000** |
| Maximum object size (multipart) | **5 TB** |
| Maximum object size (single PUT) | **5 GB** |
| Part numbering | **1 to 10,000** (1-indexed) |

### Derived Limits

| File Size | Minimum Chunk Size (to stay under 10,000 parts) |
|---|---|
| 50 GB | 5 MB (10,000 parts) |
| 100 GB | 10 MB (10,000 parts) |
| 500 GB | 50 MB (10,000 parts) |
| 1 TB | 100 MB (10,000 parts, rounded) |
| 5 TB | 500 MB (10,000 parts) |

Formula: `minimum_chunk_size = ceil(file_size / 10,000)`

### ETags

- Each `UploadPart` response includes an **ETag** (typically the MD5 hash of the part data)
- The `CompleteMultipartUpload` request requires a list of all part numbers and their corresponding ETags
- ETags must be stored client-side during upload to assemble the completion request
- The final object's ETag for a multipart upload is: `{MD5_of_concatenated_part_MD5s}-{number_of_parts}`

### Concurrent Uploads

- Multiple concurrent multipart uploads to the **same key** are allowed
- The **last** `CompleteMultipartUpload` to execute wins
- Each upload has a unique `UploadId` -- parts are isolated between uploads
- Incomplete uploads occupy storage and incur charges until aborted or completed

### Incomplete Upload Cleanup

Incomplete multipart uploads **continue to incur storage charges** for all uploaded parts until explicitly aborted. **Always** configure lifecycle policies (see Section 8).

---

## 3. Optimal Chunk Size Analysis

### Chunk Size vs. File Size Matrix

| File Size | Chunk Size | Num Chunks | PUT Requests (N+2) | Resume Granularity | Parallel Upload Time (4 conn, 100 Mbps) |
|---|---|---|---|---|---|
| 10 MB | 5 MB | 2 | 4 | 5 MB lost on retry | < 1s |
| 50 MB | 5 MB | 10 | 12 | 5 MB lost | ~4s |
| 100 MB | 10 MB | 10 | 12 | 10 MB lost | ~8s |
| 250 MB | 10 MB | 25 | 27 | 10 MB lost | ~20s |
| 500 MB | 10 MB | 50 | 52 | 10 MB lost | ~40s |
| 1 GB | 10 MB | ~100 | 102 | 10 MB lost | ~80s |
| 5 GB | 25 MB | 200 | 202 | 25 MB lost | ~6.5 min |
| 10 GB | 50 MB | 200 | 202 | 50 MB lost | ~13 min |
| 50 GB | 100 MB | 500 | 502 | 100 MB lost | ~65 min |
| 100 GB | 100 MB | 1,000 | 1,002 | 100 MB lost | ~130 min |
| 500 GB | 100 MB | 5,000 | 5,002 | 100 MB lost | ~11 hrs |
| 1 TB | 200 MB | ~5,000 | 5,002 | 200 MB lost | ~22 hrs |
| 5 TB | 500 MB | 10,000 | 10,002 | 500 MB lost | ~4.6 days |

**Note:** Parallel upload times assume 4 concurrent connections at 100 Mbps sustained throughput. Real-world performance varies significantly with network conditions. The "Resume Granularity" column shows how much data is lost if a single part upload fails and must be retried.

### Trade-offs

| Factor | Smaller Chunks (5-10 MB) | Larger Chunks (50-100 MB) |
|---|---|---|
| Request overhead | Higher (more PUT requests) | Lower |
| Resume granularity | Better (less data re-uploaded on failure) | Worse |
| Memory usage (browser) | Lower per-chunk | Higher per-chunk |
| Parallel efficiency | Better utilization of connections | Potential idle connections |
| Request cost | Higher | Lower |
| Rate limit impact | More requests per prefix | Fewer requests per prefix |

### Recommended Dynamic Chunk Sizing

```
if file_size <= 100 MB:
    chunk_size = 5 MB          # Fine-grained, good resume
elif file_size <= 1 GB:
    chunk_size = 10 MB         # Balance of resume and overhead
elif file_size <= 10 GB:
    chunk_size = 25 MB         # Reduces request count
elif file_size <= 100 GB:
    chunk_size = 50 MB         # Larger chunks, fewer requests
elif file_size <= 1 TB:
    chunk_size = 100 MB        # Minimize request overhead
else:
    chunk_size = max(200 MB, ceil(file_size / 10,000))  # Stay under 10,000 parts
```

This ensures:
- Never exceeds 10,000 parts
- Minimum 5 MB per part (S3 requirement)
- Reasonable memory usage in browser
- Good resume granularity for typical file sizes

---

## 4. S3 Pricing Model (us-east-1)

### Storage (S3 Standard)

| Tier | Price per GB/month |
|---|---|
| First 50 TB | $0.023 |
| Next 450 TB | $0.022 |
| Over 500 TB | $0.021 |

For temporary file transfers (deleted after download), storage cost is prorated. S3 bills per GB-hour:

```
hourly_rate = $0.023 / 730 hours = $0.0000315 per GB per hour
daily_rate  = $0.023 / 30 days  = $0.000767 per GB per day
```

### Request Pricing

| Operation | Price per 1,000 Requests |
|---|---|
| PUT / COPY / POST / LIST | $0.005 |
| GET / SELECT | $0.0004 |
| DELETE | **Free** |
| Lifecycle Transition | $0.01 |

Multipart upload billing:
- `CreateMultipartUpload` = 1 PUT = $0.000005
- Each `UploadPart` = 1 PUT = $0.000005
- `CompleteMultipartUpload` = 1 PUT = $0.000005
- `AbortMultipartUpload` = Free (DELETE pricing)

### Data Transfer

| Direction | Price per GB |
|---|---|
| Data IN (upload to S3) | **Free** |
| Data OUT first 100 GB/month | **Free** |
| Data OUT next 10 TB/month | $0.09 |
| Data OUT next 40 TB/month | $0.085 |
| Data OUT next 100 TB/month | $0.07 |
| Data OUT over 150 TB/month | $0.05 |
| S3 to CloudFront (same region) | **Free** |
| S3 to EC2 (same region) | **Free** |

### Cost Per Transfer Calculation

Below are fully worked cost calculations for single-file transfers using S3 Standard, assuming:
- Storage duration: 1 day (24 hours)
- Chunk size: 10 MB (for files >= 100 MB); single PUT for smaller files
- One download per transfer (1 GET request)
- Data transfer at the $0.09/GB tier (beyond free tier)

#### 10 MB File (single PUT, no multipart)

| Cost Component | Calculation | Cost |
|---|---|---|
| Storage (1 day) | 0.01 GB x ($0.023 / 30) | $0.0000077 |
| PUT requests | 1 request x ($0.005 / 1000) | $0.0000050 |
| GET requests | 1 request x ($0.0004 / 1000) | $0.0000004 |
| Data OUT (download) | 0.01 GB x $0.09 | $0.0009000 |
| **Total** | | **$0.0009131** |

#### 100 MB File (10 parts x 10 MB)

| Cost Component | Calculation | Cost |
|---|---|---|
| Storage (1 day) | 0.1 GB x ($0.023 / 30) | $0.0000767 |
| PUT requests | 12 requests x ($0.005 / 1000) | $0.0000600 |
| GET requests | 1 request x ($0.0004 / 1000) | $0.0000004 |
| Data OUT (download) | 0.1 GB x $0.09 | $0.0090000 |
| **Total** | | **$0.0091371** |

#### 1 GB File (100 parts x 10 MB)

| Cost Component | Calculation | Cost |
|---|---|---|
| Storage (1 day) | 1 GB x ($0.023 / 30) | $0.000767 |
| PUT requests | 102 requests x ($0.005 / 1000) | $0.000510 |
| GET requests | 1 request x ($0.0004 / 1000) | $0.0000004 |
| Data OUT (download) | 1 GB x $0.09 | $0.090000 |
| **Total** | | **$0.091277** |

#### 10 GB File (400 parts x 25 MB)

| Cost Component | Calculation | Cost |
|---|---|---|
| Storage (1 day) | 10 GB x ($0.023 / 30) | $0.00767 |
| PUT requests | 402 requests x ($0.005 / 1000) | $0.00201 |
| GET requests | 1 request x ($0.0004 / 1000) | $0.0000004 |
| Data OUT (download) | 10 GB x $0.09 | $0.90000 |
| **Total** | | **$0.90968** |

#### 50 GB File (500 parts x 100 MB)

| Cost Component | Calculation | Cost |
|---|---|---|
| Storage (1 day) | 50 GB x ($0.023 / 30) | $0.03833 |
| PUT requests | 502 requests x ($0.005 / 1000) | $0.00251 |
| GET requests | 1 request x ($0.0004 / 1000) | $0.0000004 |
| Data OUT (download) | 50 GB x $0.09 | $4.50000 |
| **Total** | | **$4.54084** |

### Cost Structure Insight

**Data transfer OUT (egress) dominates the cost** at every file size, representing 95-99% of total per-transfer cost. Storage and request costs are negligible in comparison for short-lived transfers.

| File Size | Storage % | Requests % | Egress % |
|---|---|---|---|
| 10 MB | 0.8% | 0.6% | 98.6% |
| 100 MB | 0.8% | 0.7% | 98.5% |
| 1 GB | 0.8% | 0.6% | 98.6% |
| 10 GB | 0.8% | 0.2% | 99.0% |
| 50 GB | 0.8% | 0.1% | 99.1% |

### Monthly Volume Cost Projection

Assuming 1,000 transfers/day with average file size of 100 MB, stored for 1 day each:

| Component | Monthly Calculation | Monthly Cost |
|---|---|---|
| Storage | 100 GB active at any time x $0.023 | $2.30 |
| PUT requests | 30,000 files x 12 PUTs = 360,000 | $1.80 |
| GET requests | 30,000 GETs | $0.01 |
| Data OUT | 3,000 GB x $0.09 | $270.00 |
| **Total** | | **~$274.11** |

At this volume, egress is 98.5% of total cost.

---

## 5. S3 Transfer Acceleration

### How It Works

S3 Transfer Acceleration routes uploads through Amazon CloudFront edge locations. Instead of uploading directly to the S3 bucket's region, the client uploads to the nearest CloudFront edge, which then transfers data to S3 over AWS's optimized backbone network.

### Pricing

| Direction | Edge Location | Cost per GB |
|---|---|---|
| Upload INTO S3 | US, Europe, Japan | $0.04 |
| Upload INTO S3 | All other regions | $0.08 |
| Download FROM S3 | Any region | $0.04 |

This is **in addition to** standard S3 storage, request, and data transfer costs.

### Endpoint Change

When Transfer Acceleration is enabled, presigned URLs must use the accelerated endpoint:

```
# Standard endpoint
https://{bucket}.s3.{region}.amazonaws.com/{key}

# Accelerated endpoint
https://{bucket}.s3-accelerate.amazonaws.com/{key}
```

### Compatibility

- Works with multipart uploads
- Works with presigned URLs (use the accelerated endpoint)
- Can be enabled/disabled per bucket
- No change to API calls -- only the endpoint changes

### When Transfer Acceleration Is Worth It

| Scenario | Upload Region | S3 Region | Benefit |
|---|---|---|---|
| User in US uploading to us-east-1 | US | us-east-1 | **Minimal** (already close) |
| User in Europe uploading to us-east-1 | EU | us-east-1 | **Moderate** (2-5x faster) |
| User in Asia uploading to us-east-1 | Asia | us-east-1 | **Significant** (3-10x faster) |
| User in Australia uploading to us-east-1 | AU | us-east-1 | **Significant** (3-10x faster) |

### Cost Impact

For a 1 GB file from a US user:
- Without acceleration: $0.00 upload + $0.09 download = $0.09
- With acceleration: $0.04 upload + ($0.09 + $0.04) download = $0.17
- **Premium: ~89% increase in transfer cost**

Decision: Only enable for users who are geographically distant from the S3 region, or offer as an opt-in "fast upload" feature.

### Speed Comparison Tool

AWS provides a speed comparison tool at:
`https://s3-accelerate-speedtest.s3-accelerate.amazonaws.com/en/accelerate-speed-comparsion.html`

---

## 6. CloudFront Integration

### Download via CloudFront (Signed URLs)

For downloads, serving via CloudFront provides:
1. **Lower egress cost**: $0.085/GB (US) vs. $0.09/GB (direct S3) -- S3-to-CloudFront transfer is **free**
2. **Edge caching** (limited benefit for unique encrypted files)
3. **Signed URLs with richer policies**: IP restrictions, date ranges, custom policies
4. **Origin Access Control (OAC)**: S3 bucket can be fully private; only CloudFront can access it

### Pricing Comparison (Downloads)

| Component | Direct S3 | CloudFront + S3 |
|---|---|---|
| Data transfer (US, first 10 TB) | $0.09/GB | $0.085/GB |
| S3 to CloudFront transfer | N/A | **Free** |
| GET requests (per 10K) | $0.004 | $0.0075 |
| Signed URL flexibility | 7-day max, basic | Custom policies, IP restrict |
| Free tier | 100 GB/month | 1 TB/month |

### Cache Hit Rate Consideration

For SGraph Send, each encrypted file is unique (encrypted with a unique key). There is effectively **zero cache hit rate** for file downloads. CloudFront benefits are limited to:
- Slightly lower per-GB egress pricing
- The generous free tier (1 TB/month)
- Signed URL flexibility
- Edge-based SSL termination (lower latency for HTTPS handshake)

### Upload via CloudFront

Uploading through CloudFront is supported but adds complexity. For SGraph Send, **direct-to-S3 upload via presigned URLs is simpler** and avoids CloudFront request charges on the upload path (since S3 upload is free anyway).

### Origin Access Control (OAC)

OAC is the modern replacement for Origin Access Identity (OAI):
- CloudFront signs requests to S3 using SigV4
- S3 bucket policy grants access only to the CloudFront distribution
- Supports S3 SSE-KMS encrypted objects
- Bucket can block all public access

### Lambda@Edge / CloudFront Functions

Potential uses:
- Authentication/authorization at the edge
- URL rewriting or redirect logic
- Request/response header manipulation
- One-time-use download URL enforcement

---

## 7. CORS Configuration

### Required for Browser-Direct Uploads

When the browser uploads directly to S3 via presigned URLs, the S3 bucket must have CORS configured. Without it, the browser blocks the cross-origin PUT/POST requests.

### Recommended CORS Configuration

```json
{
    "CORSRules": [
        {
            "ID": "AllowSGraphSendUploads",
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
            "AllowedOrigins": [
                "https://send.sgraph.ai"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-request-id",
                "x-amz-id-2",
                "Content-Length",
                "Content-Type"
            ],
            "MaxAgeSeconds": 3600
        }
    ]
}
```

### Key CORS Fields

| Field | Value | Rationale |
|---|---|---|
| `AllowedHeaders` | `["*"]` | Presigned URLs may include various headers |
| `AllowedMethods` | `["PUT", "POST", "GET", "HEAD"]` | PUT for part upload, POST for completion, GET for download, HEAD for metadata |
| `AllowedOrigins` | `["https://send.sgraph.ai"]` | Restrict to application domain only |
| `ExposeHeaders` | `["ETag", ...]` | ETag is required by the browser to complete multipart upload |
| `MaxAgeSeconds` | `3600` | Cache preflight for 1 hour, reducing OPTIONS requests |

### Common Pitfalls

1. **Missing `ETag` in `ExposeHeaders`**: The browser needs to read the ETag from each `UploadPart` response to build the `CompleteMultipartUpload` request. If ETag is not exposed, JavaScript cannot access it.
2. **Region-specific endpoints**: Using the generic `s3.amazonaws.com` endpoint (without region) can cause 307 redirects for buckets outside us-east-1, which breaks CORS preflight.
3. **Content-Type mismatch**: The Content-Type header used when generating the presigned URL must match exactly what the browser sends.
4. **Development origins**: Add `http://localhost:*` to `AllowedOrigins` during development only -- remove before production.

---

## 8. Lifecycle Policies

### Recommended Lifecycle Rules

Every SGraph Send S3 bucket should have these lifecycle rules:

#### Rule 1: Abort Incomplete Multipart Uploads

```json
{
    "ID": "AbortIncompleteMultipartUploads",
    "Status": "Enabled",
    "Filter": {
        "Prefix": ""
    },
    "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 1
    }
}
```

**Rationale:** Incomplete multipart uploads (abandoned browser sessions, network failures) continue to incur storage charges. For a file transfer service, 1 day is sufficient -- any upload not completed within 24 hours is almost certainly abandoned.

#### Rule 2: Auto-Delete Completed Transfers

```json
{
    "ID": "DeleteExpiredTransfers",
    "Status": "Enabled",
    "Filter": {
        "Prefix": "transfers/"
    },
    "Expiration": {
        "Days": 7
    }
}
```

**Rationale:** Transfers are ephemeral. Auto-delete after 7 days (or configurable per tier: free = 1 day, premium = 30 days).

#### Rule 3: Transition Long-Lived Transfers (if retention > 7 days)

```json
{
    "ID": "TransitionToInfrequentAccess",
    "Status": "Enabled",
    "Filter": {
        "Prefix": "transfers/"
    },
    "Transitions": [
        {
            "Days": 3,
            "StorageClass": "STANDARD_IA"
        }
    ]
}
```

**Rationale:** If transfers persist beyond 3 days (e.g., premium tier), move to S3 Standard-IA ($0.0125/GB/month vs. $0.023/GB/month) -- a 46% storage cost reduction. Note: Standard-IA has a minimum 128 KB charge per object and a 30-day minimum storage duration charge, so only beneficial for objects that will persist beyond 30 days.

### Full Lifecycle Configuration

```json
{
    "Rules": [
        {
            "ID": "AbortIncompleteMultipartUploads",
            "Status": "Enabled",
            "Filter": { "Prefix": "" },
            "AbortIncompleteMultipartUpload": {
                "DaysAfterInitiation": 1
            }
        },
        {
            "ID": "DeleteExpiredTransfers",
            "Status": "Enabled",
            "Filter": { "Prefix": "transfers/" },
            "Expiration": {
                "Days": 7
            }
        }
    ]
}
```

### Cost Impact of Lifecycle Policies

Without lifecycle rules, abandoned multipart uploads accumulate silently. AWS reports that customers commonly discover **gigabytes to terabytes** of orphaned multipart upload parts. At $0.023/GB/month, 100 GB of orphaned parts costs $2.30/month indefinitely.

---

## 9. Presigned URL Constraints

### Maximum Expiration Times

| Credential Type | Maximum URL Lifetime |
|---|---|
| IAM User (long-term credentials) | **7 days** |
| STS AssumeRole (temporary credentials) | Limited by session duration (default 1 hour, max 12 hours) |
| EC2 Instance Profile | ~6 hours (credential rotation) |
| S3 Console | 12 hours |

### Implications for File Transfer

1. **Upload presigned URLs**: Generate just-in-time for each chunk. Expiration of 15-60 minutes is sufficient.
2. **Download presigned URLs**: Generate on-demand when recipient requests download. Expiration of 1-24 hours is typical.
3. **For Lambda-generated URLs**: Lambda uses STS temporary credentials. Default session is 15 minutes for Lambda execution, but the role's session can be configured up to 12 hours.

### Multipart Upload with Presigned URLs

Each part requires its own presigned URL. The workflow:

1. Client requests upload initiation from backend
2. Backend calls `CreateMultipartUpload`, returns `UploadId`
3. Client requests presigned URLs for each part (can batch-request multiple)
4. Client uploads each part using its presigned URL
5. Client collects ETags from each `UploadPart` response
6. Client sends part numbers + ETags to backend
7. Backend calls `CompleteMultipartUpload`

**Important:** Each part's presigned URL must be used (upload initiated) before it expires. For large files with many parts, generate URLs in batches rather than all at once.

### Active Transfer Behavior

If a download or upload is in progress when the presigned URL expires, the active transfer **continues to completion**. Only new connection attempts after expiration will fail.

---

## 10. Recommendations

### 1. Optimal Chunk Size Strategy

Implement **dynamic chunk sizing** based on file size:

| File Size Range | Chunk Size | Rationale |
|---|---|---|
| < 5 MB | Single PUT (no multipart) | Below minimum part size |
| 5 MB - 100 MB | 5 MB | Fine-grained resume |
| 100 MB - 1 GB | 10 MB | Balance of resume + overhead |
| 1 GB - 10 GB | 25 MB | Reduced request count |
| 10 GB - 100 GB | 50 MB | Minimize overhead |
| 100 GB - 1 TB | 100 MB | Stay well under 10K parts |
| > 1 TB | ceil(file_size / 9,500) | Ensure < 10,000 parts with margin |

### 2. Prefix Strategy

Use hash-based prefix distribution:

```
chunks/{transfer_id[0:2]}/{transfer_id}/{chunk_number}
```

This provides 256 buckets (hex 00-ff), supporting up to 896,000 PUT requests/second. For SGraph Send's expected volume, this is more than sufficient.

### 3. Cost Optimization

| Recommendation | Savings | Priority |
|---|---|---|
| **Serve downloads via CloudFront** | 5.5% on egress + 1 TB free tier | High |
| **Lifecycle: abort incomplete uploads after 1 day** | Prevents orphaned part accumulation | Critical |
| **Lifecycle: auto-delete transfers after N days** | Eliminates forgotten storage | Critical |
| **Use S3 Standard (not IA) for short-lived transfers** | Avoids IA minimum duration charges | Medium |
| **Batch presigned URL generation** | Reduces Lambda invocations | Medium |
| **Transfer Acceleration only for distant users** | Avoids 89% premium when unnecessary | Medium |
| **CloudFront Security Savings Bundle** | Up to 30% on CloudFront costs at scale | Low (volume-dependent) |

### 4. Lifecycle Policy Recommendations

| Rule | Target | Action | Priority |
|---|---|---|---|
| Abort incomplete multipart uploads | All prefixes | After 1 day | **Critical** |
| Delete expired transfers | `transfers/` prefix | After 7 days (configurable) | **Critical** |
| Delete expired chunks | `chunks/` prefix | After 1 day | **High** |
| Transition to IA | Only if retention > 30 days | After 3 days | Low |

### 5. Transfer Acceleration Decision Matrix

| Condition | Use Acceleration? |
|---|---|
| User in same region as bucket | No |
| User in same continent as bucket | Probably not |
| User on different continent | Yes |
| File < 10 MB | No (overhead > benefit) |
| File > 100 MB from distant region | Yes |
| Cost-sensitive workload | Make it opt-in |

**Implementation approach:** Offer Transfer Acceleration as an opt-in feature. Use the AWS speed comparison tool or measure actual upload speeds to determine if acceleration provides meaningful benefit for each user's location.

---

## Sources

- [Amazon S3 Performance Optimization Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)
- [Amazon S3 Multipart Upload Limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [Uploading and Copying Objects Using Multipart Upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Amazon S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [S3 Transfer Acceleration](https://aws.amazon.com/s3/transfer-acceleration/)
- [S3 Multipart Upload Request Charges (AWS re:Post)](https://www.repost.aws/questions/QU2hZvjGGPRAGB68LFPgUTzQ/s3-multipart-upload-request-charges)
- [Multipart Upload Billing Per Part (AWS re:Post)](https://repost.aws/questions/QUXmwDga0VRvSOOjYWMfor-w/are-we-billed-a-put-request-for-each-part-with-s3-multipart-upload-or-only-once-for-the-final-merged-file)
- [S3 CORS Configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- [Deep Dive into CORS on S3 (AWS Blog)](https://aws.amazon.com/blogs/media/deep-dive-into-cors-configs-on-aws-s3-how-to/)
- [Configuring Lifecycle to Delete Incomplete Multipart Uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)
- [Discovering and Deleting Incomplete Multipart Uploads (AWS Blog)](https://aws.amazon.com/blogs/aws-cloud-financial-management/discovering-and-deleting-incomplete-multipart-uploads-to-lower-amazon-s3-costs/)
- [S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [S3 Prefix Partitioning (AWS re:Post)](https://repost.aws/questions/QULYcc6KsoTGujo-1hZV4ASQ/s3-key-structure-for-optimal-prefix-partitioning)
- [S3 Rate Limits Hidden Behavior (Medium)](https://medium.com/@olsenbudanur/s3-is-lying-to-you-the-hidden-rate-limits-that-degraded-a-high-traffic-workflow-2b373b6f1119)
- [Amazon S3 Quotas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Quotas.html)
- [CloudFront Signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)
- [S3 vs CloudFront Pricing Comparison](https://codevup.com/posts/s3-vs-cloudfront-pricing/)
