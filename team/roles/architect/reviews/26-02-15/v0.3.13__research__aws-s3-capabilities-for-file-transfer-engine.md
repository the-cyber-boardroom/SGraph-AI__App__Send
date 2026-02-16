# AWS S3 Capabilities for File Transfer Engine — Research Document

**Version:** v0.3.13
**Date:** 2026-02-15
**Role:** Architect
**Purpose:** Reference document for architecture decisions on large file transfer via S3

---

## Table of Contents

1. [S3 Multipart Upload](#1-s3-multipart-upload)
2. [S3 Presigned URLs](#2-s3-presigned-urls)
3. [S3 Transfer Acceleration](#3-s3-transfer-acceleration)
4. [Browser Direct Upload to S3 Pattern](#4-browser-direct-upload-to-s3-pattern)
5. [S3 Object Lambda](#5-s3-object-lambda)
6. [Code Examples](#6-code-examples)
7. [Architecture Decision Summary](#7-architecture-decision-summary)

---

## 1. S3 Multipart Upload

### 1.1 How It Works

S3 multipart upload is a three-phase process that allows uploading a single object as a set of independently uploaded parts.

**Phase 1 — Initiate:**
- Call `CreateMultipartUpload` (API) / `CreateMultipartUploadCommand` (SDK v3).
- S3 returns an `UploadId` — a unique identifier that associates all parts with the final object.
- The `UploadId` must be included in every subsequent part upload and in the completion/abort call.

**Phase 2 — Upload Parts:**
- Upload each part using `UploadPart` (API) / `UploadPartCommand` (SDK v3), specifying the `UploadId` and a `PartNumber` (1–10,000).
- Each part upload returns an `ETag` in the response header.
- Parts can be uploaded in any order, in parallel, and from different machines.
- Parts can be overwritten — uploading a new part with the same `PartNumber` replaces the previous one.

**Phase 3 — Complete or Abort:**
- **Complete:** Call `CompleteMultipartUpload` with the `UploadId` and an ordered list of `{PartNumber, ETag}` pairs. S3 assembles the parts into the final object.
- **Abort:** Call `AbortMultipartUpload` with the `UploadId`. S3 deletes all uploaded parts and frees storage.

### 1.2 Hard Limits

| Constraint | Value |
|---|---|
| Maximum object size | **5 TB** |
| Maximum number of parts per upload | **10,000** |
| Minimum part size | **5 MB** (except the last part, which can be smaller) |
| Maximum part size | **5 GB** |
| Maximum single PUT upload (non-multipart) | **5 GB** |
| Part number range | **1 to 10,000** |

**Derived limits:**
- At minimum part size (5 MB) with 10,000 parts: max object = ~48.8 GB
- At 100 MB part size with 10,000 parts: max object = ~976 GB
- At 500 MB part size with 10,000 parts: max object = ~4.88 TB
- To reach the 5 TB maximum, each part must be at least ~524 MB (5 TB / 10,000)

**AWS recommendation:** Use part sizes of 16–64 MB for optimal throughput and error recovery. Use multipart upload for any object larger than 100 MB.

### 1.3 Parallel Part Upload

Parts can be uploaded concurrently from multiple threads, processes, or machines. This is a first-class feature of the API — each `UploadPart` call is independent. Parallelism is limited only by your network bandwidth and S3's per-prefix request rate (3,500 PUT/POST/DELETE requests per second per prefix).

### 1.4 Part-Level Retry

Individual parts can be re-uploaded without affecting other parts. If part 7 of 100 fails, you retry only part 7. Successfully uploaded parts remain intact. This is one of the primary advantages over single PUT upload for large files.

### 1.5 ETags and Part Verification

**Single-part uploads:** The ETag is the MD5 hash of the object content (hex-encoded).

**Multipart uploads:** The ETag is a composite checksum with the format:

```
ETag = MD5(MD5(part1) || MD5(part2) || ... || MD5(partN)) + "-" + N
```

Where `||` is binary concatenation and `N` is the number of parts. Example: `"a1b2c3d4e5f6...789-7"` (7 parts).

**Per-part verification:** Each `UploadPart` response includes the ETag (MD5) for that individual part. The client should record `{PartNumber, ETag}` for every part and provide these when calling `CompleteMultipartUpload`. S3 verifies the ETags match during assembly.

**Additional checksum algorithms (newer feature):** S3 now supports `CRC32`, `CRC32C`, `SHA-1`, and `SHA-256` as alternative checksum algorithms via the `ChecksumAlgorithm` parameter. These can be specified at upload initiation and provide stronger integrity guarantees than MD5.

### 1.6 Lifecycle Policies for Incomplete Multipart Uploads

**Problem:** Incomplete multipart uploads (initiated but never completed or aborted) continue to incur storage costs for their uploaded parts indefinitely.

**Solution:** Configure a lifecycle rule with `AbortIncompleteMultipartUpload`:

```json
{
  "Rules": [
    {
      "ID": "abort-incomplete-multipart-uploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": ""
      },
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
```

**Key details:**
- `DaysAfterInitiation`: Number of days after upload initiation before S3 aborts and deletes the parts.
- Recommended value: **7 days** (adjust based on expected upload completion times).
- Completed uploads are not affected — only incomplete ones.
- Lifecycle rules run once a day at midnight UTC.
- New lifecycle rules may take up to 48 hours to execute the first time.
- No early delete charges apply for cleaning up incomplete multipart upload parts.
- Tag-based filters are not supported for `AbortIncompleteMultipartUpload`.
- This rule should be on **every S3 bucket** that receives multipart uploads.

### 1.7 The `@aws-sdk/client-s3` Package

The `@aws-sdk/client-s3` package provides low-level command classes for every S3 API operation. For multipart upload, the relevant commands are:

| Command Class | S3 API Operation | Purpose |
|---|---|---|
| `CreateMultipartUploadCommand` | `CreateMultipartUpload` | Initiate upload, get `UploadId` |
| `UploadPartCommand` | `UploadPart` | Upload a single part |
| `CompleteMultipartUploadCommand` | `CompleteMultipartUpload` | Assemble parts into final object |
| `AbortMultipartUploadCommand` | `AbortMultipartUpload` | Cancel upload, delete parts |
| `ListPartsCommand` | `ListParts` | List uploaded parts for an upload |
| `ListMultipartUploadsCommand` | `ListMultipartUploads` | List all in-progress uploads for a bucket |

These are low-level — the developer must manually handle chunking, parallelism, retry, and progress tracking.

### 1.8 The `@aws-sdk/lib-storage` Upload Class

The `Upload` class from `@aws-sdk/lib-storage` is a high-level abstraction that wraps the low-level multipart upload commands.

**What it handles automatically:**
- Chunking: Splits the input (Buffer, Blob, Stream, or string) into parts of configurable size.
- Multipart lifecycle: Calls `CreateMultipartUpload`, `UploadPart` for each chunk, and `CompleteMultipartUpload`.
- Parallelism: Uploads multiple parts concurrently (configurable via `queueSize`).
- Abort on error: By default, calls `AbortMultipartUpload` if any part fails (configurable).
- Progress events: Emits `httpUploadProgress` events.

**Configuration options:**

| Option | Default | Description |
|---|---|---|
| `client` | (required) | `S3Client` or `S3` instance |
| `params` | (required) | `{Bucket, Key, Body, ContentType, ...}` |
| `queueSize` | `4` | Number of parts uploaded in parallel |
| `partSize` | `5,242,880` (5 MB) | Size of each part in bytes (minimum 5 MB) |
| `leavePartsOnError` | `false` | If `true`, do not auto-abort on failure |
| `tags` | `[]` | Optional object tags |

**Memory usage:** The `Upload` class buffers at most `queueSize * partSize` bytes in memory at any time. With defaults (4 x 5 MB), that is 20 MB.

**Retry behavior — important caveat:** The `Upload` class itself does **not** implement per-part retry logic. Retry behavior depends on the retry strategy configured on the underlying `S3Client`. If a part upload fails and the S3Client's retries are exhausted, the `Upload` class will either abort the entire upload (default) or leave parts in place (`leavePartsOnError: true`). This is a known limitation — see [GitHub issue #2311](https://github.com/aws/aws-sdk-js-v3/issues/2311).

**Usage example:**

```javascript
import { Upload } from "@aws-sdk/lib-storage";
import { S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({ region: "us-east-1" });

const upload = new Upload({
  client,
  params: {
    Bucket: "my-bucket",
    Key:    "uploads/large-file.dat",
    Body:   readableStream,             // Buffer, Blob, ReadableStream, or string
    ContentType: "application/octet-stream",
  },
  queueSize: 4,                         // 4 concurrent part uploads
  partSize:  10 * 1024 * 1024,          // 10 MB per part
  leavePartsOnError: false,             // auto-abort on failure
});

upload.on("httpUploadProgress", (progress) => {
  console.log(`Uploaded: ${progress.loaded} / ${progress.total}`);
});

const result = await upload.done();
console.log("Upload complete:", result.Location);
```

**When to use `Upload` vs. manual multipart:**
- Use `Upload` when the server (Node.js) is the one uploading data to S3 (e.g., receiving a stream from a client and forwarding to S3).
- Use manual multipart with presigned URLs when the **browser** uploads directly to S3 (the server only generates URLs).

---

## 2. S3 Presigned URLs

### 2.1 How Presigned URLs Work

A presigned URL is a time-limited URL that grants temporary permission to perform a specific S3 operation (GET, PUT, etc.) without requiring the caller to have AWS credentials.

**For PUT (upload):**
- The server generates a presigned URL for `PutObject` or `UploadPart`.
- The client performs an HTTP PUT to that URL with the file data as the request body.
- The URL encodes the bucket, key, expiration, and a signature derived from the server's AWS credentials.
- No AWS credentials are sent to the client.

**For GET (download):**
- The server generates a presigned URL for `GetObject`.
- The client performs an HTTP GET to that URL to download the object.
- Optional: Set `ResponseContentDisposition` to control the download filename.

### 2.2 Presigned URLs for Multipart Upload Parts

**Yes, you can generate presigned URLs for individual multipart upload parts.** This is the critical capability that enables browser-direct multipart upload.

The flow:
1. Server calls `CreateMultipartUpload` to get an `UploadId`.
2. Server generates a presigned URL for each part using `UploadPartCommand` (not `PutObjectCommand` — this is a common mistake).
3. Browser uploads each part directly to S3 using the per-part presigned URLs.
4. Browser collects the `ETag` from each part's response.
5. Browser sends the list of `{PartNumber, ETag}` to the server.
6. Server calls `CompleteMultipartUpload` to assemble the object.

**Critical implementation detail:** You must use `UploadPartCommand` (not `PutObjectCommand`) when generating presigned URLs for parts. `PutObjectCommand` does not accept `UploadId` or `PartNumber` — those parameters are silently ignored, producing a regular single-object upload URL.

### 2.3 Presigned URL Expiration Limits

The presigned URL expires at the **earlier** of: (a) its configured expiration, or (b) the expiration of the credentials used to sign it.

| Credential Type | Maximum URL Lifetime |
|---|---|
| IAM User (long-term access keys) | **7 days** (604,800 seconds) |
| STS Temporary Credentials (AssumeRole) | **Up to 36 hours** (depends on role session duration) |
| EC2 Instance Profile | **~6 hours** (metadata credentials rotate) |
| STS AssumeRole (default) | **1 hour** (configurable via `DurationSeconds`) |
| AWS Console | **12 hours** |
| Lambda execution role | **~6–12 hours** (temporary credentials) |

**Common pitfall:** If your server runs on Lambda or EC2 (which use temporary credentials from instance profiles/execution roles), presigned URLs will expire when those credentials rotate — typically 6–12 hours — even if you set `expiresIn` to 7 days. To get 7-day URLs, you must sign with IAM user long-term access keys.

**For SGraph Send:** Since transfers are short-lived (download within hours), Lambda execution role credentials with a 1-hour expiration are sufficient. For per-part upload URLs, even shorter expirations (15–60 minutes) are appropriate.

### 2.4 CORS Configuration for Browser-Direct Uploads

When the browser makes a PUT request directly to S3 (a different origin than your app), the browser enforces CORS. The S3 bucket must have a CORS configuration that allows the request.

**Minimum CORS configuration for multipart upload:**

```json
[
  {
    "AllowedOrigins": ["https://send.sgraph.ai"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "Content-Type",
      "Content-MD5",
      "x-amz-content-sha256",
      "x-amz-date",
      "x-amz-security-token"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Critical elements:**
- `AllowedOrigins`: Must match your app's origin exactly. Use `["*"]` only for development.
- `AllowedMethods`: `["PUT"]` for presigned PUT uploads.
- `AllowedHeaders`: Must include `Content-Type` and any `x-amz-*` headers that the presigned URL requires.
- `ExposeHeaders`: **Must include `"ETag"`** — the browser needs to read the ETag from each part's response to send to `CompleteMultipartUpload`. Without this, the browser's JavaScript cannot access the ETag header.
- `MaxAgeSeconds`: Cache preflight responses for this duration (3600 = 1 hour).

**Gotcha — region-specific endpoints:** In regions other than `us-east-1`, S3 may return HTTP 307 redirects on preflight requests if you use the global `s3.amazonaws.com` endpoint. Always use the region-specific endpoint: `s3.{region}.amazonaws.com`.

### 2.5 Security: Permissions for the Presigning Entity

The entity (IAM user, role, or Lambda execution role) that generates presigned URLs must have the corresponding S3 permissions. A presigned URL cannot grant more permissions than the signer has.

**Required IAM permissions for multipart upload with presigned URLs:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::my-bucket/uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::my-bucket"
    }
  ]
}
```

**Breakdown:**
- `s3:PutObject` — required for `UploadPart` and `PutObject` presigned URLs. Also implicitly required for `CreateMultipartUpload` and `CompleteMultipartUpload`.
- `s3:GetObject` — required for download presigned URLs.
- `s3:AbortMultipartUpload` — required if the server needs to abort incomplete uploads.
- `s3:ListMultipartUploadParts` — required for `ListParts` (useful for resuming uploads).
- `s3:ListBucket` — required at the bucket level (not object level) for listing operations.

**Least privilege principle:** Create a dedicated IAM role for URL signing with permissions scoped to the specific bucket prefix used for transfers.

---

## 3. S3 Transfer Acceleration

### 3.1 How It Works

S3 Transfer Acceleration (S3TA) routes uploads through the nearest AWS CloudFront edge location. Data travels from the user to the edge location over the public internet, then from the edge location to the S3 bucket over AWS's optimized internal backbone network.

```
User's Browser
    │
    │ (public internet, shortest path to nearest edge)
    ▼
AWS CloudFront Edge Location (one of 218+ worldwide)
    │
    │ (AWS backbone network, optimized path)
    ▼
S3 Bucket (in a specific AWS region)
```

- AWS has ~24 regions but **218+ edge locations**.
- The transfer is synchronous — the PUT response is not returned until the object reaches the S3 bucket.
- S3TA must be **enabled on the bucket** before use.
- After enabling, it may take up to **20 minutes** before acceleration is active.

**Accelerated endpoint format:**
```
https://{bucket-name}.s3-accelerate.amazonaws.com
```

For dual-stack (IPv4 + IPv6):
```
https://{bucket-name}.s3-accelerate.dualstack.amazonaws.com
```

**Restriction:** Bucket names containing periods (`.`) cannot use Transfer Acceleration.

### 3.2 Cost

| Direction | Edge Location Region | Cost per GB |
|---|---|---|
| Data IN to S3 | US, Europe, Japan | **$0.04/GB** |
| Data IN to S3 | All other locations | **$0.08/GB** |
| Data OUT from S3 | US, Europe, Japan | **$0.04/GB** |
| Data OUT from S3 | All other locations | **$0.08/GB** |

**Important:** You are only charged when S3TA actually accelerates the transfer. If the accelerated path would not be faster than the standard path, S3 routes via the standard path and does **not** charge the acceleration fee.

This is in addition to standard S3 data transfer and request pricing.

### 3.3 When It Helps vs. When It Doesn't

**Helps significantly (50–300% speedup):**
- Uploads from a **different continent** than the bucket's region (e.g., uploading from Asia to a US bucket).
- Uploads from locations with **high internet latency** to the bucket's region.
- Large files (10 MB+) where the time savings compound.
- Users with **available bandwidth** that the standard path cannot fully utilize due to routing inefficiency.

**Minimal or no benefit:**
- Uploads from **within the same AWS region** as the bucket.
- Uploads from a location **very close** to the bucket's region.
- Very small files where the overhead of the extra hop outweighs the benefit.
- Connections that already have an optimal path to the S3 region.

**Testing tool:** AWS provides a [Transfer Acceleration Speed Comparison Tool](https://s3-accelerate-speedtest.s3-accelerate.amazonaws.com/en/accelerate-speed-comparsion.html) that tests upload speed with and without acceleration from the user's current location to various regions.

### 3.4 Can It Be Combined with Multipart Upload?

**Yes.** Transfer Acceleration and multipart upload are fully compatible and commonly used together. Each part is uploaded to the accelerated endpoint. This is the recommended pattern for large files from geographically distributed users.

### 3.5 Can It Be Combined with Presigned URLs?

**Yes.** When generating presigned URLs, configure the S3 client with the accelerate endpoint. The presigned URLs will use the `s3-accelerate.amazonaws.com` domain instead of the standard S3 endpoint.

**Server-side (Node.js):**

```javascript
const s3Client = new S3Client({
  region: "us-east-1",
  useAccelerateEndpoint: true,    // This changes the endpoint in generated URLs
});

// Presigned URLs generated with this client will use:
// https://my-bucket.s3-accelerate.amazonaws.com/...
```

This means all three can be combined: **multipart upload + presigned URLs + Transfer Acceleration**.

---

## 4. Browser Direct Upload to S3 Pattern

### 4.1 The Full Flow

This pattern removes Lambda (and API Gateway) from the data path entirely. Lambda only handles authentication and URL generation — the actual file data flows directly from the browser to S3.

```
┌─────────────┐           ┌──────────────────┐           ┌──────────┐
│   Browser   │──(1)────▶ │  API (Lambda)    │──(2)────▶ │   S3     │
│             │           │  Auth + URL Gen   │           │          │
│             │◀──(3)──── │                  │           │          │
│             │           └──────────────────┘           │          │
│             │──(4)─────────────────────────────────────▶│          │
│             │◀──(5)─────────────────────────────────────│          │
│             │──(6)────▶ │  API (Lambda)    │──(7)────▶ │          │
│             │◀──(8)──── │  Complete Upload  │◀──(8)──── │          │
└─────────────┘           └──────────────────┘           └──────────┘
```

**Step-by-step:**

1. **Browser → API:** "I want to upload a file. Here's the file size and number of parts."
2. **API → S3:** `CreateMultipartUpload` → gets `UploadId`.
3. **API → Browser:** Returns `UploadId` + array of presigned URLs (one per part).
4. **Browser → S3 (direct):** Uploads each part via HTTP PUT to the presigned URL. Parts uploaded in parallel. **No data flows through Lambda.**
5. **S3 → Browser:** Returns `ETag` for each part in the response header.
6. **Browser → API:** "All parts uploaded. Here's the list of `{PartNumber, ETag}`."
7. **API → S3:** `CompleteMultipartUpload` with the parts list.
8. **S3 → API → Browser:** Upload complete. Returns final object metadata.

**Why this matters for Lambda:**
- Lambda has a **6 MB payload limit** (request/response body).
- Lambda has a **15-minute execution timeout**.
- Lambda is billed per ms of execution time.
- With direct upload, Lambda runs for only the milliseconds needed to generate URLs and complete the upload — it never touches the file data.
- A 5 GB file upload costs the same Lambda execution time as a 5 MB file upload.

### 4.2 CORS Setup on the S3 Bucket

See [Section 2.4](#24-cors-configuration-for-browser-direct-uploads) for the full CORS configuration.

The single most commonly forgotten element: **`ExposeHeaders: ["ETag"]`**. Without it, the browser's JavaScript cannot read the ETag header from S3's response, and `CompleteMultipartUpload` will fail because the client cannot provide the ETags.

### 4.3 Progress Tracking

**XMLHttpRequest (recommended for progress tracking):**

```javascript
function uploadPart(presignedUrl, partData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 100;
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const etag = xhr.getResponseHeader("ETag");
        resolve(etag);
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("PUT", presignedUrl);
    xhr.send(partData);
  });
}
```

**Fetch API:** Does **not** natively support upload progress events. Use `XMLHttpRequest` or a library like Axios (which wraps XHR) if you need progress tracking.

**Aggregate progress across parts:** Track `{loaded, total}` for each part separately, then compute overall progress as:

```javascript
const overallProgress = parts.reduce((sum, p) => sum + p.loaded, 0)
                      / parts.reduce((sum, p) => sum + p.total, 0);
```

### 4.4 Error Handling and Retry at the Browser Level

**Per-part retry strategy:**

```javascript
async function uploadPartWithRetry(presignedUrl, partData, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const etag = await uploadPart(presignedUrl, partData);
      return etag;
    } catch (error) {
      lastError = error;
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

**Key retry considerations:**
- Presigned URLs have a limited lifetime — if retries take too long, the URL may expire. Request new URLs if needed.
- Only the failed part needs to be retried, not the entire upload.
- Track which parts succeeded (have ETags) so the upload can resume from where it left off.
- Implement a maximum retry count to avoid infinite loops on persistent failures.

### 4.5 How This Eliminates Lambda from the Data Path

| Concern | With Lambda in data path | With direct S3 upload |
|---|---|---|
| Max file size | 6 MB (Lambda payload) | 5 TB (S3 limit) |
| Upload duration limit | 15 min (Lambda timeout) | None (presigned URL expiry only) |
| Lambda cost | Billed for entire upload duration | Billed for ~100ms (URL generation) |
| Bandwidth | Limited by Lambda network | Limited by user's connection to S3 |
| Concurrency | Each upload consumes a Lambda invocation | Lambda only needed for init/complete |
| Scalability | Lambda concurrency limits apply to data transfer | S3 scales independently |

---

## 5. S3 Object Lambda

### 5.1 Can It Intercept Uploads?

**No.** S3 Object Lambda supports only **GET**, **HEAD**, and **LIST** requests. It cannot intercept or transform PUT/POST requests (uploads).

S3 Object Lambda is designed to transform data on the read path — for example, redacting PII from documents, resizing images on download, or converting data formats. It has no capability to intercept or modify data during upload.

**Additional limitations:**
- Maximum Lambda execution time: **60 seconds**.
- As of November 2025, S3 Object Lambda is available only to existing customers and select AWS partners. AWS has stated they do not plan to introduce new capabilities for S3 Object Lambda.
- Lambda function must be in the same account and region as the Object Lambda Access Point.
- Maximum 1,000 Object Lambda Access Points per account per region.

### 5.2 Alternatives for Post-Upload Processing

**Pattern: S3 Event Notification → Lambda**

This is the standard pattern for processing files after upload. S3 fires an event notification when an object is created, which triggers a Lambda function.

**Relevant event types:**
- `s3:ObjectCreated:Put` — single PUT upload completed.
- `s3:ObjectCreated:CompleteMultipartUpload` — multipart upload completed (all parts assembled).
- `s3:ObjectCreated:*` — any object creation event.

**Key behaviors:**
- For multipart uploads, the event fires only **after** `CompleteMultipartUpload` succeeds and S3 has assembled the final object. The object is fully available when the event fires.
- Events are delivered asynchronously. There may be a delay of seconds between upload completion and Lambda invocation.
- Events can be sent to Lambda, SQS, SNS, or EventBridge.

**Architecture for SGraph Send post-upload processing:**

```
Browser ──PUT──▶ S3 Bucket
                    │
                    │ s3:ObjectCreated:CompleteMultipartUpload
                    ▼
               Lambda Function
                    │
                    ├──▶ Update transfer metadata (mark upload complete)
                    ├──▶ Validate encrypted payload size
                    └──▶ Trigger download URL generation
```

**Best practice:** Use an SQS queue between S3 and Lambda as a buffer for high-volume scenarios. This provides:
- Retry with configurable visibility timeout.
- Dead letter queue for persistent failures.
- Smoothing of traffic spikes.
- At-least-once delivery (make Lambda idempotent).

---

## 6. Code Examples

### 6.1 Server-Side: Presigned URL Generation (Node.js)

**Complete flow — initiate multipart, generate per-part URLs, complete upload:**

```javascript
// server/s3-multipart.js

import { S3Client,
         CreateMultipartUploadCommand,
         UploadPartCommand,
         CompleteMultipartUploadCommand,
         AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl }                from "@aws-sdk/s3-request-presigner";

const BUCKET   = "sgraph-send-transfers";
const REGION   = "us-east-1";
const URL_EXPIRY_SECONDS = 3600;  // 1 hour

const s3Client = new S3Client({
  region: REGION,
  // Uncomment for Transfer Acceleration:
  // useAccelerateEndpoint: true,
});

/**
 * Step 1: Initiate multipart upload.
 * Returns the UploadId needed for all subsequent operations.
 */
export async function initiateMultipartUpload(objectKey, contentType) {
  const command = new CreateMultipartUploadCommand({
    Bucket:      BUCKET,
    Key:         objectKey,
    ContentType: contentType,
  });

  const response = await s3Client.send(command);
  return response.UploadId;
}

/**
 * Step 2: Generate presigned URLs for each part.
 * The browser will use these URLs to upload directly to S3.
 */
export async function generatePartPresignedUrls(objectKey, uploadId, totalParts) {
  const urls = [];

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const command = new UploadPartCommand({
      Bucket:     BUCKET,
      Key:        objectKey,
      UploadId:   uploadId,
      PartNumber: partNumber,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: URL_EXPIRY_SECONDS,
    });

    urls.push({
      partNumber,
      url: presignedUrl,
    });
  }

  return urls;
}

/**
 * Step 3: Complete the multipart upload.
 * Called after the browser has uploaded all parts and collected ETags.
 *
 * @param {Array<{PartNumber: number, ETag: string}>} parts
 */
export async function completeMultipartUpload(objectKey, uploadId, parts) {
  const command = new CompleteMultipartUploadCommand({
    Bucket:   BUCKET,
    Key:      objectKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  });

  const response = await s3Client.send(command);
  return {
    location: response.Location,
    etag:     response.ETag,
    key:      response.Key,
  };
}

/**
 * Abort a multipart upload (cleanup on failure).
 */
export async function abortMultipartUpload(objectKey, uploadId) {
  const command = new AbortMultipartUploadCommand({
    Bucket:   BUCKET,
    Key:      objectKey,
    UploadId: uploadId,
  });

  await s3Client.send(command);
}
```

### 6.2 Server-Side: Simple Presigned PUT URL (Single File)

```javascript
// For files under 5 GB — single PUT upload with presigned URL

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({ region: "us-east-1" });

/**
 * Generate a presigned URL for uploading a single object.
 */
export async function generateUploadUrl(objectKey, contentType, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket:      "sgraph-send-transfers",
    Key:         objectKey,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading an object.
 */
export async function generateDownloadUrl(objectKey, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: "sgraph-send-transfers",
    Key:    objectKey,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}
```

### 6.3 Browser-Side: Multipart Upload Using Presigned URLs

```javascript
// browser/multipart-upload.js
// Vanilla JS — no framework dependencies

const PART_SIZE = 10 * 1024 * 1024;  // 10 MB per part
const MAX_CONCURRENT = 4;             // parallel part uploads
const MAX_RETRIES = 3;

/**
 * Upload a file using multipart presigned URLs.
 *
 * @param {File}     file         - The File object from <input type="file">
 * @param {string}   apiBaseUrl   - Your backend API base URL
 * @param {Function} onProgress   - Callback: (percentComplete: number) => void
 * @returns {Promise<{key: string, etag: string}>}
 */
async function uploadFileMultipart(file, apiBaseUrl, onProgress) {
  const totalParts = Math.ceil(file.size / PART_SIZE);

  // Step 1: Request multipart upload initiation from API
  const initResponse = await fetch(`${apiBaseUrl}/uploads/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileSize:    file.size,
      contentType: file.type || "application/octet-stream",
      totalParts:  totalParts,
    }),
  });

  const { uploadId, objectKey, presignedUrls } = await initResponse.json();
  // presignedUrls is an array of { partNumber, url }

  // Step 2: Upload parts in parallel with concurrency limit
  const partResults = [];   // { PartNumber, ETag }
  const partProgress = {};  // partNumber -> { loaded, total }

  function updateOverallProgress() {
    const loaded = Object.values(partProgress).reduce((s, p) => s + p.loaded, 0);
    onProgress((loaded / file.size) * 100);
  }

  // Concurrency-limited part upload
  const queue = [...presignedUrls];
  const workers = [];

  for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
    workers.push(processQueue());
  }

  async function processQueue() {
    while (queue.length > 0) {
      const { partNumber, url } = queue.shift();
      const start = (partNumber - 1) * PART_SIZE;
      const end   = Math.min(start + PART_SIZE, file.size);
      const blob  = file.slice(start, end);

      partProgress[partNumber] = { loaded: 0, total: end - start };

      const etag = await uploadPartWithRetry(url, blob, partNumber);

      partProgress[partNumber].loaded = end - start;
      updateOverallProgress();

      partResults.push({ PartNumber: partNumber, ETag: etag });
    }
  }

  async function uploadPartWithRetry(presignedUrl, blob, partNumber) {
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await uploadSinglePart(presignedUrl, blob, partNumber);
      } catch (err) {
        lastError = err;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error(
      `Part ${partNumber} failed after ${MAX_RETRIES} attempts: ${lastError.message}`
    );
  }

  function uploadSinglePart(presignedUrl, blob, partNumber) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          partProgress[partNumber] = { loaded: event.loaded, total: event.total };
          updateOverallProgress();
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          const etag = xhr.getResponseHeader("ETag");
          resolve(etag);
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error")));
      xhr.addEventListener("abort", () => reject(new Error("Aborted")));

      xhr.open("PUT", presignedUrl);
      xhr.send(blob);
    });
  }

  await Promise.all(workers);

  // Step 3: Complete multipart upload via API
  const completeResponse = await fetch(`${apiBaseUrl}/uploads/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectKey,
      uploadId,
      parts: partResults.sort((a, b) => a.PartNumber - b.PartNumber),
    }),
  });

  return completeResponse.json();
}
```

### 6.4 Server-Side: Presigned URL Generation with Transfer Acceleration

```javascript
import { S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl }                from "@aws-sdk/s3-request-presigner";

// Enable Transfer Acceleration on the client
const s3Client = new S3Client({
  region: "us-east-1",
  useAccelerateEndpoint: true,
});

// URLs generated with this client will use:
// https://my-bucket.s3-accelerate.amazonaws.com/...
// instead of:
// https://my-bucket.s3.us-east-1.amazonaws.com/...

async function generateAcceleratedPartUrl(bucket, key, uploadId, partNumber) {
  const command = new UploadPartCommand({
    Bucket:     bucket,
    Key:        key,
    UploadId:   uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}
```

---

## 7. Architecture Decision Summary

### Recommended Pattern for SGraph Send

**Browser-direct multipart upload with per-part presigned URLs.**

```
Browser ──(encrypted data)──▶ S3 (via presigned URLs)
  │                               │
  │ (1) Request upload session    │
  ▼                               │
Lambda (auth + URL generation)    │
  │                               │
  │ (2) CreateMultipartUpload     │
  │ (3) Generate presigned URLs ──┘
  │
  │ (4) After all parts uploaded:
  │     CompleteMultipartUpload
  ▼
S3 Event Notification ──▶ Lambda (post-upload processing)
```

### Why This Pattern

| Decision | Rationale |
|---|---|
| Presigned URLs (not SDK Upload class) | Browser uploads directly to S3; Lambda never touches file data |
| Multipart upload | Files > 5 GB; part-level retry; parallel upload |
| Per-part presigned URLs | Each part gets its own URL; browser controls parallelism and retry |
| `UploadPartCommand` for URL signing | Only correct command for per-part presigned URLs (not `PutObjectCommand`) |
| Short URL expiry (1 hour) | Matches Lambda execution role credential lifetime; sufficient for part upload |
| XHR for upload (not Fetch) | Required for upload progress tracking (`xhr.upload.onprogress`) |
| Transfer Acceleration (optional) | Enable for global users; only charged when it helps |
| Lifecycle policy on bucket | Auto-abort incomplete uploads after 7 days; prevents storage cost leaks |
| S3 event notification post-upload | Process completed uploads without blocking the upload flow |

### Limits to Design Around

| Limit | Value | Impact |
|---|---|---|
| Max object size | 5 TB | Theoretical max; practical limit depends on part size x 10,000 |
| Max parts | 10,000 | At 10 MB/part = 97.7 GB max; at 100 MB/part = 976 GB max |
| Min part size | 5 MB | Small files should use single PUT, not multipart |
| Lambda payload | 6 MB | Lambda must never be in the data path |
| Lambda timeout | 15 min | URL generation is fast (~100ms); not a concern |
| Presigned URL expiry | 1–7 days | 1 hour is sufficient for per-part upload URLs |
| CORS ETag exposure | Must be configured | Without `ExposeHeaders: ["ETag"]`, browser cannot complete multipart upload |

### SDK Packages Required (Node.js Server)

```
@aws-sdk/client-s3          — S3 commands (CreateMultipartUpload, UploadPart, etc.)
@aws-sdk/s3-request-presigner — getSignedUrl() for generating presigned URLs
```

The `@aws-sdk/lib-storage` `Upload` class is **not needed** for the browser-direct pattern — it is designed for server-side uploads where the Node.js process itself sends data to S3.

---

## Sources

- [Amazon S3 multipart upload limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [Uploading and copying objects using multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [@aws-sdk/lib-storage — npm](https://www.npmjs.com/package/@aws-sdk/lib-storage)
- [@aws-sdk/lib-storage Upload class — AWS docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-lib-storage/Class/Upload/)
- [lib-storage Upload does not retry if one part fails — GitHub issue #2311](https://github.com/aws/aws-sdk-js-v3/issues/2311)
- [Uploading objects with presigned URLs — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
- [Download and upload objects with presigned URLs — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Sharing objects with presigned URLs — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html)
- [Migrate multipart upload with presigned URLs from SDK v2 to v3 — GitHub issue #3591](https://github.com/aws/aws-sdk-js-v3/issues/3591)
- [Generate a presigned URL in modular AWS SDK for JavaScript — AWS blog](https://aws.amazon.com/blogs/developer/generate-presigned-url-modular-aws-sdk-javascript/)
- [Uploading large objects using multipart upload and Transfer Acceleration — AWS blog](https://aws.amazon.com/blogs/compute/uploading-large-objects-to-amazon-s3-using-multipart-upload-and-transfer-acceleration/)
- [S3 Transfer Acceleration — AWS](https://aws.amazon.com/s3/transfer-acceleration/)
- [Enabling and using S3 Transfer Acceleration — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration-examples.html)
- [S3 Pricing — AWS](https://aws.amazon.com/s3/pricing/)
- [Using cross-origin resource sharing (CORS) — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- [Deep dive into CORS configs on AWS S3 — AWS blog](https://aws.amazon.com/blogs/media/deep-dive-into-cors-configs-on-aws-s3-how-to/)
- [Introducing Amazon S3 Object Lambda — AWS blog](https://aws.amazon.com/blogs/aws/introducing-amazon-s3-object-lambda-use-your-code-to-process-data-as-it-is-being-retrieved-from-s3/)
- [Amazon S3 Object Lambda — AWS](https://aws.amazon.com/s3/features/object-lambda/)
- [Configuring lifecycle to delete incomplete multipart uploads — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)
- [Process Amazon S3 event notifications with Lambda — AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html)
- [Checking object integrity — AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html)
- [Minimum IAM Permission to create S3 presigned URLs — Radish Logic](https://www.radishlogic.com/aws/s3/minimum-iam-permission-to-create-s3-presigned-urls/)
- [Securing Amazon S3 presigned URLs for serverless applications — AWS blog](https://aws.amazon.com/blogs/compute/securing-amazon-s3-presigned-urls-for-serverless-applications/)
- [Presigned URL expiration troubleshooting — AWS re:Post](https://repost.aws/knowledge-center/presigned-url-s3-bucket-expiration)
- [aws-samples/amazon-s3-multipart-upload-transfer-acceleration — GitHub](https://github.com/aws-samples/amazon-s3-multipart-upload-transfer-acceleration)
