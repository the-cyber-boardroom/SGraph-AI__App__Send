# Multi-Cloud Storage: Large File Upload Capabilities Research

**Version:** v0.3.13
**Date:** 2026-02-15
**Role:** Architect
**Purpose:** Compare cloud storage providers for a pluggable multi-cloud file transfer engine

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [AWS S3 (Baseline)](#aws-s3-baseline)
3. [Azure Blob Storage](#azure-blob-storage)
4. [Google Cloud Storage (GCS)](#google-cloud-storage-gcs)
5. [Cloudflare R2](#cloudflare-r2)
6. [Backblaze B2](#backblaze-b2)
7. [Comparison Matrix](#comparison-matrix)
8. [Cost Comparison: 1 GB File Transfer](#cost-comparison-1-gb-file-transfer)
9. [Adapter Design Implications](#adapter-design-implications)
10. [Recommendations](#recommendations)
11. [Sources](#sources)

---

## Executive Summary

This document evaluates five cloud storage providers for integration into SGraph Send's pluggable storage backend. The evaluation focuses on large file upload capabilities, browser-direct upload support, SDK availability, and cost. The key finding is that **three of the five providers (R2, B2, GCS via XML API) are S3-compatible**, meaning a single configurable S3 adapter covers four out of five providers. Only Azure requires its own adapter.

---

## AWS S3 (Baseline)

AWS S3 is the incumbent and most mature object storage service. It serves as our baseline for comparison.

### Upload Mechanism: Multipart Upload

- **Maximum parts per upload:** 10,000
- **Part size range:** 5 MB minimum, 5 GB maximum (last part can be smaller than 5 MB)
- **Maximum object size:** 5 TB
- **Recommended threshold:** Use multipart for objects > 100 MB; required for objects > 5 GB
- **Concurrency:** Parts can be uploaded in parallel
- **Incomplete uploads:** Accumulate storage charges; configure lifecycle rules to auto-abort after N days

### Browser-Direct Upload

- **Presigned URLs:** Generate server-side, upload client-side via HTTP PUT
- **Presigned POST:** Form-based upload with policy conditions
- **Validity:** Up to 7 days (using IAM credentials, not STS)

### Upload Acceleration

- **S3 Transfer Acceleration (S3TA):** Routes uploads through CloudFront edge locations and AWS backbone
- **Performance improvement:** 50-500% for long-distance, large object transfers
- **Additional cost:** $0.04/GB (US/EU/Japan edges), $0.08/GB (other edges) -- on top of standard transfer charges

### Pricing (US East, Standard tier)

| Component | Price |
|-----------|-------|
| Storage | $0.023/GB/month (first 50 TB), decreasing tiers above |
| PUT/COPY/POST/LIST | $0.005 per 1,000 requests |
| GET/SELECT | $0.0004 per 1,000 requests |
| Data transfer IN (ingress) | Free |
| Data transfer OUT (egress) | First 100 GB/month free, then $0.09/GB (first 10 TB) |
| Transfer Acceleration (upload) | $0.04/GB (US/EU/JP), $0.08/GB (other) |
| DELETE | Free |

### JavaScript SDK

- **Package:** `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`
- **Browser upload:** `Upload` class from `@aws-sdk/lib-storage` handles multipart automatically
- **Progress tracking:** Built-in `httpUploadProgress` event
- **Presigned URLs:** `@aws-sdk/s3-request-presigner` -- `getSignedUrl()`

---

## Azure Blob Storage

Azure Blob Storage uses a fundamentally different upload model (Block Blobs) that offers the highest maximum object size of any provider.

### Upload Mechanism: Block Blobs

- **Maximum blocks per blob:** 50,000
- **Maximum block size:** 4,000 MiB (4 GiB) -- increased from 100 MiB in older API versions
- **Maximum blob size:** ~190.7 TiB (up to ~200 TB in preview)
- **Upload workflow:**
  1. `Put Block` -- upload individual blocks (each identified by a block ID)
  2. `Put Block List` -- commit the blocks into a final blob
- **Uncommitted blocks limit:** 100,000 (across all blobs in account)
- **Default single-upload threshold:** 128 MiB (SDK auto-splits above this)
- **Concurrency:** Blocks can be uploaded in parallel

This is analogous to S3's `UploadPart` + `CompleteMultipartUpload`, but with significantly higher limits (50K blocks vs 10K parts, 190 TiB max vs 5 TB max).

### Browser-Direct Upload

- **SAS Tokens (Shared Access Signatures):** Equivalent of presigned URLs
  - **Scope:** Can be limited to specific blob, container, or entire storage account
  - **Permissions:** Read, write, delete, list, add, create, update, process
  - **Time-limited:** Custom start and expiry times
  - **IP restrictions:** Can restrict to specific client IP ranges
  - **Protocol:** Can enforce HTTPS-only
- **Browser upload:** Direct PUT to blob URL with SAS token appended as query string

### Upload Acceleration

- **Azure CDN:** Primarily for download acceleration
- **Azure Front Door:** Can accelerate uploads by routing to nearest Azure PoP
- **No direct equivalent** of S3 Transfer Acceleration as a single toggle

### Pricing (East US, LRS, Hot tier)

| Component | Price |
|-----------|-------|
| Storage (Hot) | $0.018/GB/month (first 50 TB), decreasing tiers above |
| Storage (Cool) | $0.010/GB/month |
| Storage (Cold) | $0.0036/GB/month |
| Storage (Archive) | $0.00099/GB/month |
| PUT/Create Block | $0.065 per 10,000 operations |
| Read/GET | $0.005 per 10,000 operations |
| Data transfer IN (ingress) | Free |
| Data transfer OUT (egress) | First 100 GB/month free, then ~$0.087/GB (first 10 TB) |
| DELETE | Free |

### JavaScript SDK

- **Package:** `@azure/storage-blob`
- **Key classes:**
  - `BlockBlobClient.uploadBrowserData()` -- browser upload with automatic chunking
  - `BlockBlobClient.uploadStream()` -- Node.js streaming upload
  - `BlockBlobClient.stageBlock()` + `commitBlockList()` -- manual block-level control
- **Progress tracking:** Built-in `onProgress` callback in upload options
- **SAS generation:** `generateBlobSASQueryParameters()` from `@azure/storage-blob`

### Azure-Specific Considerations

- **NOT S3-compatible** -- requires a dedicated adapter
- **Richer tier system** -- Hot/Cool/Cold/Archive with automatic tiering options
- **Early deletion penalties** -- Cool (30 days), Cold (90 days), Archive (180 days)
- **Reserved capacity** -- Up to 34% savings with 1-year or 3-year commitments

---

## Google Cloud Storage (GCS)

GCS offers a unique resumable upload protocol and partial S3 compatibility via its XML API.

### Upload Mechanism: Resumable Uploads

- **Protocol:** Native HTTP-based resumable upload
  1. **Initiate:** `POST` to get a session URI
  2. **Upload chunks:** `PUT` to session URI with `Content-Range` header
  3. **Resume after failure:** `PUT` with `Content-Range: bytes */<total>` to query current offset, then continue from there
- **Session URI validity:** 1 week
- **Chunk size:** No minimum, but 256 KiB multiples recommended for efficiency; default SDK buffer is 8 MiB
- **Maximum object size:** 5 TB
- **Billing:** A completed resumable upload counts as a single Class A operation regardless of how many chunk requests were made

### Alternative: XML API (S3-Compatible)

- GCS provides an **XML API that is compatible with S3**
- Can use AWS S3 SDKs by pointing the endpoint to `storage.googleapis.com`
- Supports multipart upload via S3-compatible API calls
- Useful for the pluggable adapter strategy -- a single S3 adapter can target GCS

### Browser-Direct Upload

- **Signed URLs (V4):** Recommended signing method
  - Validity: Up to 7 days
  - Supports PUT for direct upload
- **Signed Policy Documents:** For HTML form-based uploads
- **Resumable upload from browser:** Initiate server-side, upload client-side to session URI

### Upload Acceleration

- **Cloud CDN:** Primarily for download caching and acceleration
- **Premium Network Tier:** Uses Google's global backbone for improved routing (vs Standard Tier which uses public internet)
- **No direct equivalent** of S3 Transfer Acceleration, but Google's network backbone provides inherently good global performance

### Pricing (US Region, Standard class)

| Component | Price |
|-----------|-------|
| Storage (Standard) | $0.020/GB/month (region), $0.026/GB/month (multi-region) |
| Storage (Nearline) | $0.010/GB/month |
| Storage (Coldline) | $0.004/GB/month |
| Storage (Archive) | $0.0012/GB/month |
| Class A operations (write) | $0.05 per 10,000 (region), $0.10 per 10,000 (multi-region) |
| Class B operations (read) | $0.004 per 10,000 (region) |
| Data transfer IN (ingress) | Free |
| Data transfer OUT (egress) | First 100 GB/month free, then ~$0.12/GB (0-1 TB), ~$0.11/GB (1-10 TB) |
| Retrieval (Standard) | Free |
| DELETE | Free |

### JavaScript SDK

- **Package:** `@google-cloud/storage`
- **Key methods:**
  - `file.createWriteStream({ resumable: true })` -- resumable upload
  - `file.save()` -- simple upload
  - `file.generateSignedUrl()` -- V4 signed URLs
- **Progress tracking:** Stream events (`progress`, `finish`)
- **Note:** For browser-direct uploads, typically use signed URLs or signed resumable session URIs rather than the Node.js SDK directly

---

## Cloudflare R2

R2 is the cost disruptor in this space: S3-compatible API with zero egress fees.

### Upload Mechanism: S3-Compatible Multipart

- **API:** Fully S3-compatible (uses the same S3 SDK, change only the endpoint)
- **Maximum parts per upload:** 10,000
- **Part size range:** 5 MiB minimum, ~5 GiB maximum (5 GiB minus 5 MiB)
- **Part size constraint:** All parts except the last must be the same size
- **Maximum object size:** ~5 TB (5 TB minus 5 GB)
- **Single request upload limit:** ~5 GB (5 GB minus 5 MB)
- **Incomplete upload expiration:** 7 days by default (configurable via lifecycle policy)

### Browser-Direct Upload

- **Presigned URLs:** Fully supported via S3-compatible presigned URL mechanism
- **Works with:** `@aws-sdk/s3-request-presigner` -- just change the endpoint

### Upload Acceleration

- **No Transfer Acceleration equivalent** -- no explicit opt-in
- **Automatic placement:** R2 objects are placed near the users who access them (200+ PoPs via Cloudflare's network)
- **Workers integration:** Custom server-side logic at the edge for upload processing

### Pricing

| Component | Price |
|-----------|-------|
| Storage | $0.015/GB/month |
| Class A operations (write) | $4.50 per million ($0.0045 per 1,000) |
| Class B operations (read) | $0.36 per million ($0.00036 per 1,000) |
| Data transfer IN (ingress) | Free |
| Data transfer OUT (egress) | **FREE** |
| DELETE | Free |

### Free Tier

- 10 GB storage per month
- 1 million Class A operations per month
- 10 million Class B operations per month

### JavaScript SDK

- **Package:** `@aws-sdk/client-s3` (same as AWS S3)
- **Configuration:** Set `endpoint` to R2 account URL, set `region` to `auto`
- **All S3 SDK features work:** `Upload` from `@aws-sdk/lib-storage`, presigned URLs, etc.

### R2-Specific Considerations

- **Zero egress** is transformative for download-heavy workloads
- **Billing model:** Storage is billed on average daily usage (not peak)
- **Objects < 200 MiB** are uploaded as a single Class A operation; larger objects use multipart and incur multiple Class A operations
- **Bucket limit:** 1,000 buckets per account
- **Workers limit:** Inbound request size is constrained by Workers request limits when using Workers-based upload flows
- **Fewer lifecycle rules** than S3, but improving

---

## Backblaze B2

B2 is the budget leader with the cheapest storage pricing and generous free tiers.

### Upload Mechanism: Large File API (S3-Compatible)

- **S3-compatible API:** Since 2020, supports the S3 API surface
- **Large file threshold:** Files > 5 GB must use the large file API; recommended for files > 100 MB
- **Maximum parts:** 10,000
- **Part size range:** 5 MB minimum (recommended 100 MB for performance), 5 GB maximum
- **Minimum parts:** 2 (for large file API)
- **Maximum file size:** 10 TB (double the S3/GCS/R2 limit)
- **Concurrency:** Parts can be uploaded and copied in parallel

### Browser-Direct Upload

- **Presigned URLs:** Supported via S3-compatible API
- **Authorization tokens:** Native B2 API uses time-limited authorization tokens for upload URLs
- **Web UI upload limit:** 500 MB (not relevant for API use)

### Upload Acceleration

- **No acceleration service** -- no equivalent of S3 Transfer Acceleration
- **Limited regions:** US and EU only
- **Cloudflare Bandwidth Alliance:** Free egress when downloading via Cloudflare (not upload acceleration, but reduces total transfer cost)

### Pricing

| Component | Price |
|-----------|-------|
| Storage | $0.006/GB/month ($6/TB) -- first 10 GB free |
| Class C operations (write/upload) | $0.004 per 1,000 (first 2,500/day free) |
| Class B operations (read/download) | $0.004 per 10,000 (first 2,500/day free) |
| Data transfer IN (ingress) | Free |
| Data transfer OUT (egress) | Free up to 3x average monthly storage; then $0.01/GB |
| Via Cloudflare Bandwidth Alliance | **FREE** (unlimited) |
| DELETE | Free |

### B2 Overdrive (High-Performance Tier)

- **$0.015/GB/month** ($15/TB) -- for multi-petabyte workloads
- Up to 1 Tbps sustained throughput
- Premium support included

### Rate Limits (accounts storing <= 10 TB)

- Uploads: 3,000 requests/minute, 800 Mbps
- Downloads: 1,200 requests/minute, 200 Mbps
- Exceeding limits returns 503 (S3 API) or 429 (native API)

### JavaScript SDK

- **Package:** `@aws-sdk/client-s3` (S3-compatible)
- **Configuration:** Set `endpoint` to B2 S3-compatible URL, set `region` to appropriate region
- **Limitations vs S3:**
  - V4 signatures only (no V2)
  - Limited ACL support (object-level ACLs not supported)
  - Object tagging returns empty tags (compatibility stub)
  - Server-side encryption supported (SSE-B2 and SSE-C)

---

## Comparison Matrix

| Feature | AWS S3 | Azure Blob | GCS | Cloudflare R2 | Backblaze B2 |
|---------|--------|-----------|-----|---------------|-------------|
| **Upload Protocol** | Multipart (10K parts) | Block Blob (50K blocks) | Resumable / XML multipart | Multipart (S3-compat) | Large File / S3-compat |
| **Max Object Size** | 5 TB | ~190.7 TiB | 5 TB | ~5 TB | **10 TB** |
| **Max Part/Block Size** | 5 GB | **4 GiB** | No hard limit (chunks) | ~5 GiB | 5 GB |
| **Max Parts/Blocks** | 10,000 | **50,000** | N/A (resumable) | 10,000 | 10,000 |
| **Min Part Size** | 5 MB | No minimum | 256 KB recommended | 5 MiB | 5 MB |
| **Presigned/SAS URLs** | Yes | Yes (SAS) | Yes (V4 Signed) | Yes (S3-compat) | Yes (S3-compat) |
| **Browser-Direct Upload** | Yes | Yes | Yes | Yes | Yes |
| **Progress Tracking** | Via SDK events | Via SDK callbacks | Via stream events | Via S3 SDK events | Via S3 SDK events |
| **Resume After Failure** | Re-upload failed part | Re-upload failed block | **Native resume protocol** | Re-upload failed part | Re-upload failed part |
| **S3 API Compatible** | Native | No (own API) | Partial (XML API) | **Yes (full)** | **Yes** |
| **Storage $/GB/month** | $0.023 | $0.018 (Hot) | $0.020 | $0.015 | **$0.006** |
| **Egress $/GB** | $0.09 | $0.087 | $0.12 | **FREE** | $0.01 |
| **Upload Acceleration** | Transfer Accel ($0.04/GB) | Azure Front Door | Premium Network Tier | Auto (200+ PoPs) | None |
| **Global Presence** | 30+ regions | **60+ regions** | 35+ regions | Auto (200+ PoPs) | US/EU only |
| **JS SDK** | @aws-sdk/client-s3 | @azure/storage-blob | @google-cloud/storage | @aws-sdk/client-s3 | @aws-sdk/client-s3 |
| **Free Tier** | 100 GB egress/mo | 100 GB egress/mo | 100 GB egress/mo | 10 GB storage/mo | 10 GB storage/day |

---

## Cost Comparison: 1 GB File Transfer

**Scenario:** Upload a 1 GB file in 10 MB chunks (100 parts), store for 1 day, download once by recipient.

### Calculation Methodology

- **Storage:** 1 GB for 1 day = 1 GB * (1/30) month
- **Upload requests:** 100 PUT requests (multipart parts) + 1 initiate + 1 complete = 102 Class A/write operations
- **Download requests:** 1 GET request = 1 Class B/read operation
- **Egress:** 1 GB data transfer out

| Provider | Storage (1 day) | Upload Ops (102) | Download Ops (1) | Egress (1 GB) | **Total** |
|----------|-----------------|------------------|-------------------|---------------|-----------|
| **AWS S3** | $0.023 * 1/30 = $0.00077 | 102/1000 * $0.005 = $0.00051 | 1/1000 * $0.0004 = $0.0000004 | $0.09 | **$0.0913** |
| **Azure Blob** | $0.018 * 1/30 = $0.00060 | 102/10000 * $0.065 = $0.00066 | 1/10000 * $0.005 = $0.0000005 | $0.087 | **$0.0883** |
| **GCS** | $0.020 * 1/30 = $0.00067 | 1 * $0.05/10000 = $0.000005 | 1/10000 * $0.004 = $0.0000004 | $0.12 | **$0.1207** |
| **Cloudflare R2** | $0.015 * 1/30 = $0.00050 | 102/1000 * $0.0045 = $0.00046 | 1/1000000 * $0.36 = $0.00000036 | **FREE** | **$0.00096** |
| **Backblaze B2** | $0.006 * 1/30 = $0.00020 | 102/1000 * $0.004 = $0.00041 | 1/10000 * $0.004 = $0.0000004 | $0.01 | **$0.0106** |

### Notes on GCS Upload Operations

GCS charges a completed resumable upload as a **single Class A operation**, regardless of how many chunk requests are sent. This makes its upload operation cost dramatically lower than providers that charge per-part.

### Key Takeaways

- **Cloudflare R2 is 95x cheaper** than AWS S3 for this scenario, entirely due to zero egress
- **Backblaze B2 is 9x cheaper** than AWS S3, with very low storage and egress costs
- **GCS is the most expensive** due to high egress ($0.12/GB) despite low operation costs
- **Azure and AWS are comparable**, with Azure slightly cheaper on storage but similar egress
- **Egress dominates cost** -- it accounts for 85-99% of the total for all providers except R2

### At Scale: 1,000 Transfers per Day (1 GB each, 30 days)

| Provider | Monthly Storage | Monthly Upload Ops | Monthly Download Ops | Monthly Egress | **Monthly Total** |
|----------|----------------|-------------------|---------------------|----------------|-------------------|
| **AWS S3** | $23.00 | $15.30 | $0.012 | $2,700 | **~$2,738** |
| **Azure Blob** | $18.00 | $19.89 | $0.015 | $2,610 | **~$2,648** |
| **GCS** | $20.00 | $0.15 | $0.012 | $3,570 | **~$3,590** |
| **Cloudflare R2** | $15.00 | $13.77 | $0.011 | **FREE** | **~$29** |
| **Backblaze B2** | $6.00 | $12.24 | $0.012 | $300 | **~$318** |

At scale, R2's zero-egress advantage is overwhelming: **$29/month vs $2,738/month for S3**.

---

## Adapter Design Implications

### S3-Compatible Adapter (covers 4 providers)

The S3 SDK can target AWS S3, Cloudflare R2, Backblaze B2, and GCS (XML API) by changing only the endpoint URL and credentials.

```
S3 Adapter Configuration:
  - endpoint_url: str          # Provider-specific endpoint
  - region: str                # e.g., "us-east-1", "auto" (R2), "us-west-004" (B2)
  - access_key_id: str
  - secret_access_key: str
  - bucket_name: str
  - force_path_style: bool     # True for R2/B2, varies for GCS
  - multipart_threshold: int   # Bytes above which to use multipart (default: 100 MB)
  - multipart_chunksize: int   # Bytes per part (default: 10 MB, min: 5 MB)
  - max_concurrency: int       # Parallel upload threads (default: 4)
```

**Provider endpoint examples:**

| Provider | Endpoint URL | Region |
|----------|-------------|--------|
| AWS S3 | `https://s3.{region}.amazonaws.com` | `us-east-1` |
| Cloudflare R2 | `https://{account_id}.r2.cloudflarestorage.com` | `auto` |
| Backblaze B2 | `https://s3.{region}.backblazeb2.com` | `us-west-004` |
| GCS (XML) | `https://storage.googleapis.com` | `us` |

### Azure-Specific Adapter

Azure requires its own adapter due to a fundamentally different API surface.

```
Azure Adapter Configuration:
  - connection_string: str     # Or account_url + credential
  - container_name: str
  - block_size: int            # Bytes per block (default: 100 MB, max: 4 GiB)
  - max_concurrency: int       # Parallel block uploads
  - max_single_put_size: int   # Single PUT threshold (default: 128 MB)
```

### Adapter Interface

Both adapters should implement a common interface:

```
Storage Adapter Interface:
  - upload(file_data, object_key, metadata) -> upload_result
  - download(object_key) -> file_stream
  - delete(object_key) -> bool
  - get_presigned_upload_url(object_key, expiry) -> url
  - get_presigned_download_url(object_key, expiry) -> url
  - initiate_multipart(object_key) -> upload_id
  - upload_part(upload_id, part_number, data) -> etag
  - complete_multipart(upload_id, parts) -> result
  - abort_multipart(upload_id) -> bool
  - list_objects(prefix) -> list
  - get_object_metadata(object_key) -> metadata
```

### Priority Order for Adapter Implementation

1. **S3 adapter** (covers AWS S3 + R2 + B2 + GCS XML) -- one adapter, four providers
2. **Azure adapter** -- only if Azure is a deployment target
3. **GCS native adapter** -- only if resumable upload features (native resume, single-operation billing) are needed

---

## Recommendations

### 1. Primary Storage: AWS S3

- **Rationale:** Existing infrastructure, most mature, deepest ecosystem
- **Use case:** Default backend, production deployments on AWS
- **Risk:** Highest egress costs at scale

### 2. Cost Optimization: Cloudflare R2

- **Rationale:** Zero egress fees reduce transfer costs by 95%+; S3-compatible means zero adapter work
- **Use case:** Download-heavy workloads, cost-sensitive deployments
- **Risk:** Newer service, no transfer acceleration, fewer lifecycle rules
- **Migration path:** Change endpoint URL in S3 adapter config -- no code changes

### 3. Budget Storage: Backblaze B2

- **Rationale:** Cheapest storage at $0.006/GB; combined with Cloudflare Bandwidth Alliance for free egress
- **Use case:** Archival storage, long-retention transfers, budget-constrained deployments
- **Risk:** Rate limits for small accounts (3,000 req/min), US/EU only, 10 TB max file size (actually a feature)
- **Migration path:** Change endpoint URL in S3 adapter config -- no code changes

### 4. Enterprise Multi-Cloud: Azure Blob Storage

- **Rationale:** Required for Azure-native deployments; highest max object size (190 TiB)
- **Use case:** Enterprise customers on Azure, extremely large file transfers
- **Risk:** Requires separate adapter development; different API paradigm
- **Migration path:** New adapter implementation required

### 5. Adapter Strategy

Build the **S3 adapter first** with a configurable endpoint. This immediately supports:
- AWS S3 (native)
- Cloudflare R2 (S3-compatible, zero egress)
- Backblaze B2 (S3-compatible, cheapest storage)
- GCS via XML API (S3-compatible, Google ecosystem)

Build the Azure adapter only when there is a concrete enterprise requirement. The S3 adapter alone covers the most impactful cost-optimization scenarios.

### 6. Recommended Default Configuration

For SGraph Send's encrypted file transfer use case:
- **Multipart threshold:** 100 MB (below this, use single PUT)
- **Part size:** 10 MB (good balance of parallelism and retry cost)
- **Max concurrency:** 4 (avoid overwhelming browser connections)
- **Incomplete upload cleanup:** 24 hours (security: minimize ciphertext retention)
- **Presigned URL expiry:** 1 hour for uploads, 24 hours for downloads

---

## Sources

### AWS S3
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [S3 Multipart Upload Limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [S3 Transfer Acceleration](https://aws.amazon.com/s3/transfer-acceleration/)
- [AWS S3 Pricing Guide 2026 (Hyperglance)](https://www.hyperglance.com/blog/aws-s3-pricing-guide/)
- [Ultimate Guide to AWS S3 Pricing (nOps)](https://www.nops.io/blog/aws-s3-pricing/)

### Azure Blob Storage
- [Azure Blob Storage Pricing](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/)
- [Azure Bandwidth Pricing](https://azure.microsoft.com/en-us/pricing/details/bandwidth/)
- [Azure Blob Scalability Targets](https://learn.microsoft.com/en-us/azure/storage/blobs/scalability-targets)
- [Understanding Block Blobs](https://learn.microsoft.com/en-us/rest/api/storageservices/understanding-block-blobs--append-blobs--and-page-blobs)
- [Azure Blob Storage Pricing 2025-26 (Sedai)](https://sedai.io/blog/azure-blob-storage-pricing)

### Google Cloud Storage
- [GCS Pricing](https://cloud.google.com/storage/pricing)
- [GCS Resumable Uploads](https://docs.cloud.google.com/storage/docs/resumable-uploads)
- [GCS Quotas and Limits](https://docs.cloud.google.com/storage/quotas)
- [GCS Pricing Announce](https://cloud.google.com/storage/pricing-announce)
- [GCS Pricing 2025 (Elite Cloud)](https://www.elite.cloud/post/google-cloud-storage-pricing-2025-hidden-costs-explained-and-how-to-cut-your-bill/)

### Cloudflare R2
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 Limits](https://developers.cloudflare.com/r2/platform/limits/)
- [R2 Multipart Upload](https://developers.cloudflare.com/r2/objects/multipart-objects/)
- [R2 Pricing Calculator](https://r2-calculator.cloudflare.com/)
- [R2 2026 Pricing and S3 Comparison (Vocal Media)](https://vocal.media/futurism/cloudflare-r2-2026-pricing-features-and-aws-s3-comparison)

### Backblaze B2
- [B2 Cloud Storage Overview](https://www.backblaze.com/cloud-storage)
- [B2 Transaction Pricing](https://www.backblaze.com/cloud-storage/transaction-pricing)
- [B2 Large Files Documentation](https://www.backblaze.com/docs/cloud-storage-large-files)
- [B2 S3-Compatible API](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)
- [B2 Pricing Help](https://help.backblaze.com/hc/en-us/articles/360037814594-B2-Pricing)
- [B2 Cloud Storage Pricing Comparison](https://www.backblaze.com/cloud-storage/pricing)
