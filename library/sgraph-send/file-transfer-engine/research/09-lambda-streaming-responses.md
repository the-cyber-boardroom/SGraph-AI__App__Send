# Lambda Streaming Responses, Payload Constraints, and File Transfer Implications

**Version:** v0.3.13
**Date:** 15 February 2026
**Priority:** P3 (per research brief)
**Role:** Architect / DevOps
**Status:** Research complete

---

## Executive Summary

AWS Lambda imposes payload limits that directly constrain SGraph Send's current upload/download architecture. The system currently uses Lambda Function URLs in BUFFERED mode with Mangum (Python ASGI adapter), hitting a hard **6 MB limit** on both request and response payloads. Lambda response streaming raises the response limit to **200 MB** (as of July 2025), but **does not help with uploads** (request payload remains 6 MB). For SGraph Send's file transfer use case -- where the server performs no processing on file data (client-side encryption) -- **presigned URLs direct to S3** are the correct architecture for both upload and download paths, with Lambda managing state, auth, and URL generation only.

---

## 1. Current Lambda Payload Constraints (Verified February 2026)

### 1.1 Synchronous Invocation (BUFFERED mode)

| Metric | Limit | Notes |
|--------|-------|-------|
| **Request payload** | 6 MB (6,291,456 bytes) | Hard limit, not increasable |
| **Response payload** | 6 MB (6,291,556 bytes) | Hard limit; 100 bytes larger than request |
| **Memory** | 128 MB -- 10,240 MB (10 GB) | Configurable per function |
| **Execution time** | Up to 15 minutes (900s) | Configurable per function |
| **Temporary storage (/tmp)** | 512 MB -- 10,240 MB (10 GB) | Configurable, ephemeral |
| **Concurrency** | 1,000 per region (default) | Increasable via AWS support |
| **Deployment package (zip)** | 50 MB (compressed), 250 MB (uncompressed) | |
| **Environment variables** | 4 KB total | |

### 1.2 Asynchronous Invocation

| Metric | Limit | Notes |
|--------|-------|-------|
| **Request payload** | **1 MB** (increased from 256 KB, October 2025) | Automatic for all functions |
| **Response** | N/A | No synchronous response |

The October 2025 increase from 256 KB to 1 MB applies automatically to all Lambda functions, SQS queues, and EventBridge event buses. No configuration change needed.

### 1.3 Lambda Function URLs

| Mode | Request Limit | Response Limit |
|------|---------------|----------------|
| **BUFFERED** (default) | 6 MB | 6 MB |
| **RESPONSE_STREAM** | 6 MB | **200 MB** (default, increased from 20 MB in July 2025) |

Key detail: **request payload is still 6 MB even in streaming mode.** Streaming only affects the response direction.

### 1.4 Lambda@Edge

| Trigger | Request/Response Limit |
|---------|----------------------|
| Viewer request/response | 40 KB |
| Origin request | 1 MB |
| Origin response | 1 MB |

Lambda@Edge is irrelevant for file transfer due to these severe limits.

### 1.5 API Gateway

| Type | Payload Limit | Streaming Support |
|------|--------------|-------------------|
| **REST API** | 10 MB (hard, not increasable) | Yes (since November 2025) |
| **HTTP API** | 10 MB (hard, not increasable) | No |
| **WebSocket API** | 128 KB per frame, 32 KB per message | N/A |

API Gateway REST API streaming (announced November 2025):
- First 10 MB of response has uncapped bandwidth
- Beyond 10 MB: bandwidth capped at 2 MB/s
- Supports timeouts up to 15 minutes (vs. 29-second default without streaming)
- Works with LAMBDA_PROXY and HTTP_PROXY integration types
- **Does not support** content encoding, endpoint caching, or VTL response transformation

---

## 2. Lambda Response Streaming Deep Dive

### 2.1 What It Is

Lambda response streaming allows a function to send response data incrementally as it becomes available, rather than buffering the entire response before returning. Enabled via Lambda Function URLs with `RESPONSE_STREAM` invoke mode.

### 2.2 Key Numbers

| Parameter | Value |
|-----------|-------|
| **Maximum response size** | 200 MB (default as of July 2025) |
| **Bandwidth: first 6 MB** | Uncapped |
| **Bandwidth: beyond 6 MB** | Capped at 2 MB/s |
| **Request payload** | Still 6 MB (streaming is response-only) |
| **Cost** | Same as regular Lambda (duration + memory) |
| **Additional streaming cost** | Charged only for data beyond the initial 6 MB per request |
| **Primary benefit** | Reduced time-to-first-byte (TTFB) |

### 2.3 Bandwidth Throttle Analysis

The 2 MB/s bandwidth cap beyond 6 MB is significant for file transfer:

| File Size | Time at 2 MB/s (after 6 MB burst) | Practical? |
|-----------|------------------------------------|------------|
| 10 MB | ~2 seconds | Yes |
| 20 MB | ~7 seconds | Acceptable |
| 50 MB | ~22 seconds | Marginal |
| 100 MB | ~47 seconds | Poor |
| 200 MB | ~97 seconds | Very poor |

For comparison, S3 presigned URL downloads are limited only by the client's internet connection speed, typically 10-100+ MB/s.

**Verdict:** The 2 MB/s throttle makes Lambda streaming unsuitable for file downloads larger than ~20 MB, even though the payload limit allows 200 MB.

### 2.4 Supported Runtimes

| Runtime | Streaming Support | Method |
|---------|-------------------|--------|
| **Node.js** | Native (managed runtime) | `awslambda.streamifyResponse()` |
| **Python** | Via custom runtime or Lambda Web Adapter | Not in managed Python runtime |
| **Java** | Via Lambda Web Adapter | Not in managed Java runtime |
| **Go** | Via Lambda Web Adapter | Not in managed Go runtime |
| **Custom runtimes** | Via Runtime API streaming protocol | Must implement chunked transfer encoding |

### 2.5 Node.js Implementation Reference

```javascript
export const handler = awslambda.streamifyResponse(
    async (event, responseStream, context) => {
        // Set content type
        const metadata = {
            statusCode: 200,
            headers: { 'Content-Type': 'application/octet-stream' }
        };
        responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);

        // Stream data in chunks
        responseStream.write(chunk1);
        responseStream.write(chunk2);
        // ...
        responseStream.end();
    }
);
```

### 2.6 Cost Model

Lambda streaming uses the same pricing as standard Lambda:
- **Compute:** $0.0000166667 per GB-second (us-east-1)
- **Requests:** $0.20 per 1 million requests
- **Streaming surcharge:** Only for response data beyond 6 MB per invocation
- **Critical:** Function continues billing even if the client disconnects. The streamed response is NOT interrupted when the client connection breaks.

### 2.7 VPC Limitation

Lambda Function URLs **do not support response streaming within a VPC environment.** Workarounds:
1. Use `InvokeWithResponseStream` API via VPC endpoint (requires Lambda VPC endpoint setup)
2. Use API Gateway REST API with response streaming (proxy to Lambda)
3. Keep the streaming Lambda outside the VPC (SGraph Send's current architecture)

---

## 3. Mangum and the Python Streaming Gap

### 3.1 Current State: Mangum Does NOT Support Streaming

SGraph Send uses Mangum to run FastAPI on Lambda. Mangum explicitly buffers all response chunks:

> An application may pass the `more_body` argument to send content in chunks, however content will always be returned in a single response, never streamed.

- **Latest version:** 0.21.0 (February 2026)
- **Open issues:** #299 ("Support for streaming?"), #341 ("No Streaming Response for ALB + Lambda")
- **Verdict:** No streaming support planned in the near term

### 3.2 Alternative: AWS Lambda Web Adapter

The Lambda Web Adapter is an AWS-provided tool that enables streaming for any web framework, including Python/FastAPI.

**How it works:**
1. Runs your web application (e.g., FastAPI + uvicorn) as a subprocess inside Lambda
2. Proxies HTTP between the Lambda runtime and your web app
3. Supports `RESPONSE_STREAM` mode natively

**Configuration:**
```yaml
# SAM template
Environment:
  Variables:
    AWS_LAMBDA_EXEC_WRAPPER: /opt/bootstrap
    AWS_LWA_INVOKE_MODE: response_stream
    PORT: 8000
Layers:
  - !Sub arn:aws:lambda:${AWS::Region}:753240598075:layer:LambdaAdapterLayerArm64:22
FunctionUrlConfig:
  InvokeMode: RESPONSE_STREAM
```

**Docker-based:**
```dockerfile
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV PORT=8000
```

**Trade-offs vs. Mangum:**

| Factor | Mangum | Lambda Web Adapter |
|--------|--------|-------------------|
| Streaming support | No | Yes |
| Deployment complexity | Low (pip install) | Medium (layer or Docker image) |
| Cold start overhead | Low (~100ms) | Higher (~200-500ms, spawns subprocess) |
| Memory overhead | Minimal | Additional (runs web server process) |
| Framework integration | Native ASGI | HTTP proxy |
| Maturity | Established | AWS-maintained, growing adoption |
| Python compatibility | All Python versions | All Python versions |

### 3.3 Alternative: Custom Python Runtime

Build a custom Lambda runtime in Python that implements the streaming Runtime API protocol:
- Set `Lambda-Runtime-Function-Response-Mode: streaming` header
- Set `Transfer-Encoding: chunked` header
- Write response conforming to HTTP/1.1 chunked transfer encoding
- Close connection after response is written

This is more work than the Lambda Web Adapter but avoids the subprocess overhead.

### 3.4 Recommendation for SGraph Send

**Do not switch from Mangum to Lambda Web Adapter for streaming.** The file transfer path should bypass Lambda entirely (presigned URLs). Mangum is appropriate for the metadata/state management APIs that SGraph Send's Lambda handles, which are well within the 6 MB limit.

---

## 4. API Gateway Alternatives Comparison

| Service | Request Limit | Response Limit (Buffered) | Response Limit (Streaming) | Streaming Bandwidth Cap | Auth Options | Cost Model |
|---------|---------------|--------------------------|---------------------------|------------------------|-------------|-----------|
| **Lambda Function URL** | 6 MB | 6 MB | 200 MB | 2 MB/s after 6 MB | IAM or NONE | Lambda pricing only |
| **API Gateway REST** | 10 MB | 10 MB | >10 MB (streaming) | 2 MB/s after 10 MB | IAM, Cognito, Custom, API Key | $3.50/million + data transfer |
| **API Gateway HTTP** | 10 MB | 10 MB | Not supported | N/A | IAM, JWT, Cognito | $1.00/million + data transfer |
| **ALB** | 1 MB default | 1 MB default | Not supported | N/A | Cognito, OIDC | $0.008/LCU-hour |
| **CloudFront + Function URL** | 6 MB | Passes through | Passes through (streaming) | CloudFront limits apply | Signed URL/Cookie | CloudFront pricing |
| **AppRunner** | No fixed limit | No fixed limit | Native | Network speed | IAM | Per-request + per-compute |

### CloudFront + Lambda Function URL (Interesting Combination)

CloudFront can be placed in front of a Lambda Function URL as an origin. This combination:
- Adds CloudFront's global CDN caching
- Supports response streaming (passes through)
- Adds signed URL/cookie auth
- Adds WAF integration
- Reduces Lambda invocations for cacheable responses

SGraph Send already uses CloudFront. This combination is relevant if we ever need Lambda in the download path.

---

## 5. Implications for SGraph Send File Transfer

### 5.1 Current Architecture

```
Client (browser)
    |
    | HTTPS (6 MB limit)
    v
Lambda Function URL (BUFFERED mode)
    |
    | Mangum -> FastAPI -> Transfer__Service
    |
    v
Storage_FS (memory / S3 backend)
```

**Current limitations:**
- Upload: 6 MB max file size (entire file in request body)
- Download: 6 MB max file size (entire file in response body)
- No chunking, no resume, no streaming

### 5.2 Upload Path Analysis: Client -> Server

**Lambda streaming does NOT help uploads.** The request payload limit remains 6 MB regardless of streaming mode.

Options for large file uploads:

| Approach | Max Size | Complexity | Lambda Role |
|----------|----------|------------|-------------|
| **Current (via Lambda)** | 6 MB | Low | Receives and stores data |
| **Presigned PUT URL -> S3** | 5 GB per part | Low | Generates presigned URL |
| **Presigned POST URL -> S3** | 5 GB per part (with size limits enforced) | Low | Generates presigned POST |
| **S3 Multipart Upload (presigned per part)** | 5 TB (10,000 parts x 5 GB) | Medium | Initiates multipart, generates per-part URLs |
| **Chunked upload via multiple Lambda calls** | Unlimited (app-managed) | High | Receives each chunk, assembles |

**Recommended: Presigned URLs direct to S3.**

Lambda's role in the upload path:
1. Authenticate the user (validate access token)
2. Create the transfer manifest
3. Generate presigned upload URLs (one per chunk for multipart, or single PUT URL for small files)
4. Track upload state and chunk completion
5. Finalise the transfer (assemble multipart, generate download link)

**Lambda never touches the file data.** The browser uploads directly to S3.

### 5.3 Download Path Analysis: Server -> Client

Lambda streaming could theoretically help downloads (200 MB limit, stream from S3 through Lambda). But for SGraph Send:

1. **Server does not decrypt** -- encryption is client-side. There is no server-side processing of file data during download.
2. **The 2 MB/s bandwidth cap** makes streaming impractical for files >20 MB.
3. **Presigned URLs are cheaper** -- no Lambda compute cost for the download.
4. **Presigned URLs are faster** -- direct S3/CloudFront download, no Lambda overhead.

| Download Path | Max Size | Speed | Cost per 100 MB | Server Processing | Complexity |
|---------------|----------|-------|-----------------|-------------------|------------|
| **S3 Presigned URL** | 5 TB | Client bandwidth (10-100+ MB/s) | ~$0.009 (S3 egress only) | None | Low |
| **S3 + CloudFront Signed URL** | 5 TB | CDN speed + caching | ~$0.0085 (CF egress, lower for cached) | None | Medium |
| **Lambda streaming (Function URL)** | 200 MB | 2 MB/s after 6 MB | ~$0.009 (S3 egress) + ~$0.04 (Lambda 100s at 512MB) | Possible | Medium |
| **Lambda buffered (current)** | 6 MB | Lambda response time | ~$0.009 + Lambda cost | Possible | Low |

**Recommended: Presigned URLs direct from S3 (or via CloudFront).**

Lambda's role in the download path:
1. Authenticate the user (validate download token or link)
2. Look up the transfer manifest
3. Generate presigned download URLs (one per chunk, or single URL for small files)
4. Log the download event
5. Update transfer state (download count, etc.)

### 5.4 When Lambda Streaming WOULD Make Sense

Lambda streaming is the right choice when the server needs to **process data during download**:

1. **Server-side decryption** -- not our case (client-side encryption is a core design principle)
2. **Transcoding/transformation** -- converting file formats on-the-fly
3. **Watermarking** -- adding user-specific watermarks to downloaded files
4. **Server-side compression** -- compressing before sending (our architecture compresses client-side)
5. **Aggregation** -- assembling data from multiple sources into a single download stream
6. **Auth that cannot be delegated** -- when presigned URL auth is insufficient (e.g., per-byte access control)

None of these apply to SGraph Send's core use case. The zero-knowledge encryption model means the server is a **dumb storage relay** -- it stores ciphertext and returns ciphertext. No processing, no transformation, no reason for Lambda to be in the data path.

### 5.5 Small File Optimisation

For files under ~5 MB, the current Lambda-through path is simpler (no presigned URL generation, no multipart coordination). Consider keeping it as a **fast path for small files**:

```
File size < 5 MB:
  Upload: POST /api/transfer/upload (file in request body, through Lambda)
  Download: GET /api/transfer/download/{id} (file in response body, through Lambda)

File size >= 5 MB:
  Upload: POST /api/transfer/initiate -> get presigned URLs -> upload directly to S3
  Download: GET /api/transfer/download-url/{id} -> get presigned URL -> download from S3
```

This provides:
- Simple flow for the common case (most files are small)
- Scalable flow for large files (no Lambda in data path)
- Single API surface (same Lambda handles both paths, just different routes)

---

## 6. Cost Comparison: Lambda vs. Presigned URL Paths

### 6.1 S3 Costs (us-east-1)

| Operation | Cost |
|-----------|------|
| Storage (Standard) | $0.023/GB/month |
| PUT request | $0.005 per 1,000 requests |
| GET request | $0.0004 per 1,000 requests |
| Data transfer IN (upload) | Free |
| Data transfer OUT (first 100 GB/month) | Free |
| Data transfer OUT (next 10 TB/month) | $0.09/GB |
| S3 Transfer Acceleration (upload) | +$0.04/GB |
| S3 Transfer Acceleration (download) | +$0.04/GB |

### 6.2 Lambda Costs (us-east-1)

| Metric | Cost |
|--------|------|
| Requests | $0.20 per 1 million |
| Compute (128 MB) | $0.0000000021/ms |
| Compute (512 MB) | $0.0000000083/ms |
| Compute (1024 MB) | $0.0000000167/ms |
| Free tier (monthly) | 1M requests + 400,000 GB-seconds |

### 6.3 Scenario: 100 MB File Transfer

**Path A: Through Lambda (current, if it could handle 100 MB)**
- Upload: Lambda at 512 MB for ~10s = $0.000083
- Download: Lambda at 512 MB for ~50s (2 MB/s streaming) = $0.000415
- S3 PUT: $0.000005
- S3 GET: $0.0000004
- S3 egress: $0.009
- **Total: ~$0.0096 + Lambda duration**

**Path B: Presigned URLs (recommended)**
- Lambda for URL generation: ~200ms at 512 MB = $0.0000017
- S3 PUT: $0.000005
- S3 GET: $0.0000004
- S3 egress: $0.009
- **Total: ~$0.0091**

**Savings:** ~5-10% cost reduction, plus dramatically better speed (client bandwidth vs. 2 MB/s cap), plus no Lambda timeout risk.

### 6.4 Scenario: 1,000 Transfers per Day (Average 50 MB)

| Path | Monthly Lambda Cost | Monthly S3 Cost | Monthly Total |
|------|--------------------|-----------------| --------------|
| Through Lambda (hypothetical) | ~$75 | ~$15 | ~$90 |
| Presigned URLs | ~$0.60 | ~$15 | ~$15.60 |

The Lambda cost difference is dramatic at scale because presigned URL generation takes milliseconds while file transfer through Lambda takes seconds.

---

## 7. CloudFront Integration

### 7.1 CloudFront + S3 (Optimal Download Path)

SGraph Send already uses CloudFront. For downloads, CloudFront signed URLs or signed cookies provide:

| Feature | Presigned S3 URL | CloudFront Signed URL |
|---------|------------------|----------------------|
| Speed | S3 direct | CDN edge (faster for global users) |
| Caching | No | Yes (if same file downloaded multiple times) |
| Cost (egress) | $0.09/GB | $0.085/GB (lower at volume) |
| Auth | Time-limited, per-URL | Time-limited, per-URL or cookie |
| Geographic restriction | No | Yes |
| WAF integration | No | Yes |
| Custom domain | No (S3 URL) | Yes (your domain) |
| HTTPS | Yes | Yes |

For SGraph Send, CloudFront signed URLs are preferable for downloads because:
- Lower egress costs at volume
- Edge caching benefits for popular files
- Custom domain support (`send.sgraph.ai/download/...`)
- WAF protection against abuse

### 7.2 CloudFront + Lambda Function URL Origin

CloudFront can proxy to a Lambda Function URL origin. This supports streaming passthrough. Useful if we ever need Lambda in the download path for metadata APIs that return large JSON.

---

## 8. Comparison: All Download Paths

| Path | Max Size | Auth | Cost (100 MB) | Latency | Bandwidth | Complexity | Server Processing |
|------|----------|------|---------------|---------|-----------|------------|-------------------|
| **S3 Presigned URL** | 5 TB | Time-limited URL | $0.009 | Low | Client speed | Low | No |
| **CloudFront Signed URL** | 5 TB | Signed URL/Cookie | $0.0085 | Lowest (cached) | CDN speed | Medium | No |
| **Lambda Function URL (buffered)** | 6 MB | IAM/custom | $0.009 + Lambda | Higher | N/A | Low | Yes |
| **Lambda Function URL (streaming)** | 200 MB | IAM/custom | $0.009 + Lambda | Medium | 2 MB/s after 6 MB | Medium | Yes |
| **API Gateway REST + Lambda (streaming)** | >10 MB | IAM/Custom/JWT/API Key | $0.009 + Lambda + APIGW | Higher | 2 MB/s after 10 MB | Medium-High | Yes |
| **API Gateway HTTP + Lambda** | 10 MB | IAM/JWT | $0.009 + Lambda + APIGW | Higher | N/A | Medium | Yes |

---

## 9. Recommendations for SGraph Send

### 9.1 Upload Path

**Use presigned URLs for direct-to-S3 upload. Lambda generates URLs and manages state only.**

- Small files (<5 MB): single presigned PUT URL
- Large files (>=5 MB): S3 multipart upload with per-part presigned URLs
- Lambda endpoints: `/api/transfer/initiate`, `/api/transfer/complete`, `/api/transfer/abort`
- No change to Mangum/FastAPI stack needed

### 9.2 Download Path

**Use CloudFront signed URLs (or S3 presigned URLs as fallback) for direct download. Lambda generates URLs and manages state only.**

- Small files (<5 MB): single presigned GET URL (or keep current Lambda-through path for simplicity)
- Large files (>=5 MB): presigned GET URL per chunk (for chunked download with resume capability)
- Lambda endpoints: `/api/transfer/download-urls/{transfer_id}`
- No change to Mangum/FastAPI stack needed

### 9.3 Lambda Streaming

**Not needed for SGraph Send's primary file transfer use case.**

Reasons:
1. Server performs no processing on file data (zero-knowledge encryption)
2. 2 MB/s bandwidth cap makes it impractical for large files
3. Presigned URLs are cheaper, faster, and simpler
4. Mangum does not support streaming (would require architecture change)
5. Request payload limit remains 6 MB (does not help uploads)

### 9.4 Keep Current Architecture for Metadata APIs

The existing Mangum + FastAPI + Lambda Function URL (BUFFERED) architecture is correct for:
- Transfer manifest CRUD operations
- Access token validation
- Presigned URL generation
- Transfer state management
- Health checks and admin endpoints

All of these involve small JSON payloads well within the 6 MB limit.

### 9.5 Future Consideration: Lambda Streaming

Revisit Lambda streaming if SGraph Send ever needs:
- Server-side file transformation (unlikely given zero-knowledge model)
- Large metadata responses (unlikely to exceed 6 MB)
- Real-time event streaming (SSE for progress updates -- could use streaming for this)
- AI/LLM integration that streams generated content

The only realistic near-term use case for Lambda streaming is **server-sent events (SSE) for real-time transfer progress**. The download page could subscribe to an SSE endpoint that streams transfer manifest updates. This would be a small, bounded use of streaming (tiny payloads, not file data) and could justify the Lambda Web Adapter migration for the specific progress endpoint -- but not for file data transfer.

---

## 10. Implementation Roadmap

### Phase 1: Presigned URL Upload (Near-term)

1. Add endpoint: `POST /api/transfer/initiate` -- creates manifest, returns presigned upload URL(s)
2. Add endpoint: `POST /api/transfer/complete` -- validates chunks, finalises transfer
3. Client-side: generate presigned URL(s), upload directly to S3
4. Keep existing Lambda upload path as fallback for files <5 MB

### Phase 2: Presigned URL Download (Near-term)

1. Add endpoint: `GET /api/transfer/download-url/{id}` -- validates auth, returns presigned download URL
2. Client-side: redirect to presigned URL (or fetch directly)
3. Keep existing Lambda download path as fallback for files <5 MB

### Phase 3: Multipart Upload for Large Files (Medium-term)

1. Add endpoint: `POST /api/transfer/initiate-multipart` -- initiates S3 multipart, returns per-part presigned URLs
2. Add endpoint: `POST /api/transfer/complete-multipart` -- completes S3 multipart assembly
3. Client-side: chunk file, upload parts in parallel, report progress

### Phase 4: CloudFront Signed URLs (Medium-term)

1. Generate CloudFront signed URLs instead of S3 presigned URLs for downloads
2. Add CloudFront key pair management to admin Lambda
3. Benefit from CDN caching and lower egress costs

---

## Sources

- [AWS Lambda quotas documentation](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [AWS Lambda response streaming documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)
- [AWS Lambda response streaming now supports 200 MB response payloads (July 2025)](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-lambda-response-streaming-200-mb-payloads/)
- [AWS Lambda increases async payload to 1 MB (October 2025)](https://aws.amazon.com/about-aws/whats-new/2025/10/aws-lambda-payload-size-256-kb-1-mb-invocations/)
- [Lambda Response Streaming Increases Payload Limit to 200 MB -- InfoQ](https://www.infoq.com/news/2025/08/lambda-stream-200mb-payload/)
- [API Gateway response streaming for REST APIs (November 2025)](https://aws.amazon.com/about-aws/whats-new/2025/11/api-gateway-response-streaming-rest-apis/)
- [AWS Lambda Web Adapter -- FastAPI streaming example](https://github.com/awslabs/aws-lambda-web-adapter/tree/main/examples/fastapi-response-streaming)
- [Using response streaming with Lambda Web Adapter -- AWS Compute Blog](https://aws.amazon.com/blogs/compute/using-response-streaming-with-aws-lambda-web-adapter-to-optimize-performance/)
- [Mangum GitHub -- Issue #299 (Streaming support)](https://github.com/Kludex/mangum/issues/299)
- [Mangum GitHub -- Issue #341 (No streaming response)](https://github.com/Kludex/mangum/issues/341)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [S3 presigned URLs documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html)
- [Lambda streaming bandwidth details -- Lumigo](https://lumigo.io/blog/return-large-objects-with-aws-lambdas-new-streaming-response/)
- [Lambda response streaming in Python -- AWS re:Post](https://repost.aws/questions/QUwVlNZV0nT7a-EdJVFoRz7g/streaming-response-from-lambda-in-python)
