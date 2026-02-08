# SGraph Send — FastAPI Service Architectural Plan

**Author:** Claude (Architect role)
**Type:** Plan Mode document (independent architectural plan)
**Date:** 2026-02-08
**Status:** DRAFT — awaiting comparison with implementation plan

---

## 1. System Architecture Overview

```
                          ┌─────────────────────┐
                          │     CloudFront       │
                          │   *.sgraph.ai SSL    │
                          └──────┬────────┬──────┘
                                 │        │
                     ┌───────────┘        └───────────┐
                     ▼                                ▼
         ┌───────────────────┐            ┌───────────────────┐
         │  S3: Frontend     │            │   API Gateway     │
         │  Static Assets    │            │   /api/v1/*       │
         │  (HTML/JS/CSS)    │            └────────┬──────────┘
         └───────────────────┘                     │
                                                   ▼
                                          ┌────────────────┐
                                          │  Lambda         │
                                          │  FastAPI +      │
                                          │  Mangum         │
                                          │  Python 3.12    │
                                          │  arm64          │
                                          └───┬────────┬───┘
                                              │        │
                              ┌────────────────┘        └────────────────┐
                              ▼                                          ▼
                   ┌─────────────────────┐                  ┌─────────────────────┐
                   │  S3: Data Bucket    │                  │  S3: Config Bucket  │
                   │  sgraph-send-       │                  │  sgraph-send-       │
                   │  {tier}-data        │                  │  {tier}-config      │
                   │                     │                  │                     │
                   │  transfers/{id}/    │                  │  tokens/{id}.json   │
                   │  ├── meta.json     │                  │  waitlist/          │
                   │  ├── events.json   │                  │  admin/stats.json   │
                   │  └── payload.enc   │                  │                     │
                   └─────────────────────┘                  └─────────────────────┘
```

### Key Design Decisions

1. **Two S3 buckets per environment** — Data (transfers + encrypted payloads) and Config (tokens, waitlist, admin stats). Separation allows different IAM policies and lifecycle rules.

2. **Lambda never touches file bytes** — All file transfers use pre-signed URLs. Lambda handles orchestration (auth, metadata, logging) only. This avoids the 6MB API Gateway payload limit.

3. **S3 as database** — For MVP, all state is stored in S3 JSON files. This is sufficient for low-to-medium traffic and eliminates DynamoDB cost/complexity. If concurrent writes become an issue (e.g., events.json race conditions), we'll migrate to DynamoDB in a later phase.

4. **Mangum adapter** — FastAPI runs on Lambda via Mangum, which translates API Gateway events into ASGI. This means the same FastAPI app runs locally (uvicorn) and on Lambda (Mangum) with zero code changes.

---

## 2. API Contract Specification

### 2.1 Common Conventions

- **Base path:** `/api/v1/`
- **Content type:** `application/json` for all request/response bodies
- **Error format:** All errors return `{"error": {"code": "ERROR_CODE", "message": "Human-readable message"}}`
- **Timestamps:** ISO 8601 UTC (e.g., `2026-02-08T14:32:00Z`)
- **IDs:**
  - transfer_id: 12-char alphanumeric (e.g., `abc123def456`)
  - token_id: `tok_` prefix + 12-char alphanumeric (e.g., `tok_abc123def456`)
  - admin key: `adm_` prefix + 32-char (from environment variable)

### 2.2 Authentication

| Endpoint Pattern | Auth Required | Mechanism |
|-----------------|---------------|-----------|
| `POST /transfers`, `POST /transfers/{id}/complete` | Sender token | `Authorization: Bearer tok_xxx` |
| `GET /transfers/{id}`, `GET /transfers/{id}/download` | None | Public (content is encrypted) |
| `POST /tokens`, `GET /tokens`, `DELETE /tokens/{id}`, `GET /admin/stats` | Admin key | `Authorization: Bearer adm_xxx` |
| `POST /register-interest`, `GET /health` | None | Public |

### 2.3 Endpoint: POST /api/v1/transfers

**Purpose:** Initiate a transfer. Validates token, creates metadata, returns pre-signed upload URL.

**Request:**
```json
{
  "file_size_bytes": 4821033,
  "content_type_hint": "application/pdf"
}
```

**Response (201 Created):**
```json
{
  "transfer_id": "abc123def456",
  "upload_url": "https://sgraph-send-dev-data.s3.eu-west-1.amazonaws.com/transfers/abc123def456/payload.enc?X-Amz-Algorithm=...",
  "upload_expires_in": 3600,
  "transfer_url": "https://dev-send.sgraph.ai/d/abc123def456"
}
```

**Errors:**
- `401 Unauthorized` — Invalid, revoked, or missing token
- `400 Bad Request` — Missing file_size_bytes or invalid content_type_hint
- `413 Payload Too Large` — file_size_bytes exceeds limit (100MB for MVP)

**Server-side behaviour:**
1. Validate Bearer token (check S3 config bucket: `tokens/{token_id}.json`)
2. Generate transfer_id (cryptographically random, 12 chars)
3. Create `transfers/{transfer_id}/meta.json` in data bucket:
   ```json
   {
     "transfer_id": "abc123def456",
     "status": "pending",
     "created_at": "2026-02-08T14:32:00Z",
     "sender_ip": "203.0.113.42",
     "file_size_bytes": 4821033,
     "content_type_hint": "application/pdf",
     "token_id": "tok_xyz",
     "expires_at": "2026-02-15T14:32:00Z"
   }
   ```
4. Create empty `transfers/{transfer_id}/events.json`:
   ```json
   {"events": []}
   ```
5. Generate pre-signed PUT URL for `transfers/{transfer_id}/payload.enc` (1hr expiry, content-type: `application/octet-stream`)
6. Increment token usage_count in config bucket
7. Return response

### 2.4 Endpoint: POST /api/v1/transfers/{id}/complete

**Purpose:** Mark upload as complete. Returns download link and transparency data.

**Request:** Empty body (transfer_id in path).

**Response (200 OK):**
```json
{
  "status": "completed",
  "download_link": "https://dev-send.sgraph.ai/d/abc123def456",
  "transparency": {
    "your_ip": "203.0.113.42",
    "upload_timestamp": "2026-02-08T14:32:00Z",
    "file_size_bytes": 4821033,
    "stored_fields": ["ip", "timestamp", "file_size", "content_type_hint", "token_id"],
    "not_stored": ["file_name", "file_content", "decryption_key"]
  }
}
```

**Errors:**
- `401 Unauthorized` — Token mismatch (must be same token used to create)
- `404 Not Found` — Transfer ID not found
- `409 Conflict` — Transfer already completed or expired

**Server-side behaviour:**
1. Validate Bearer token matches the token_id in meta.json
2. Verify transfer status is `pending`
3. (Optional) Verify payload.enc exists in S3 via HEAD request
4. Update meta.json: `status` → `completed`
5. Append `upload_complete` event to events.json
6. Return response with transparency data (read from meta.json)

### 2.5 Endpoint: GET /api/v1/transfers/{id}

**Purpose:** Get transfer metadata and download count. Public.

**Response (200 OK):**
```json
{
  "transfer_id": "abc123def456",
  "status": "completed",
  "file_size_bytes": 4821033,
  "created_at": "2026-02-08T14:32:00Z",
  "expires_at": "2026-02-15T14:32:00Z",
  "download_count": 2,
  "events": [
    {
      "type": "download",
      "timestamp": "2026-02-08T16:45:00Z"
    }
  ]
}
```

**Note:** Events returned here are sanitised — they include type and timestamp but NOT IP addresses or user-agents (those are only in the server-side events.json). The sender's status page gets this public view.

**Errors:**
- `404 Not Found` — Transfer ID not found
- `410 Gone` — Transfer expired and payload deleted

### 2.6 Endpoint: GET /api/v1/transfers/{id}/download

**Purpose:** Generate pre-signed download URL and log the download event.

**Response (200 OK):**
```json
{
  "download_url": "https://sgraph-send-dev-data.s3.eu-west-1.amazonaws.com/transfers/abc123def456/payload.enc?X-Amz-Algorithm=...",
  "download_expires_in": 3600,
  "file_size_bytes": 4821033,
  "transparency": {
    "your_ip": "198.51.100.7",
    "download_timestamp": "2026-02-08T16:45:00Z",
    "user_agent": "Mozilla/5.0...",
    "stored_fields": ["ip", "timestamp", "user_agent"],
    "not_stored": ["file_content", "decryption_key", "decryption_result"]
  }
}
```

**Errors:**
- `404 Not Found` — Transfer ID not found
- `410 Gone` — Transfer expired or payload deleted
- `425 Too Early` — Transfer status is still `pending` (upload not complete)

**Server-side behaviour:**
1. Read meta.json, verify status is `completed` and not expired
2. Append download event to events.json
3. Generate pre-signed GET URL for payload.enc (1hr expiry)
4. Return response with transparency data

### 2.7 Endpoint: POST /api/v1/tokens

**Purpose:** Create a new access token (admin only).

**Request:**
```json
{
  "label": "Friend - Alice",
  "expires_in_days": 30
}
```

**Response (201 Created):**
```json
{
  "token_id": "tok_abc123def456",
  "token_value": "tok_abc123def456",
  "label": "Friend - Alice",
  "status": "active",
  "created_at": "2026-02-08T14:32:00Z",
  "expires_at": "2026-03-10T14:32:00Z",
  "usage_count": 0
}
```

**Note:** `token_value` is the full token the admin gives to the user. For MVP, `token_id == token_value`. In future, the stored ID could be a hash of the token.

### 2.8 Endpoint: GET /api/v1/tokens

**Purpose:** List all tokens with usage stats (admin only).

**Response (200 OK):**
```json
{
  "tokens": [
    {
      "token_id": "tok_abc123def456",
      "label": "Friend - Alice",
      "status": "active",
      "created_at": "2026-02-08T14:32:00Z",
      "expires_at": "2026-03-10T14:32:00Z",
      "usage_count": 7,
      "last_used_at": "2026-02-08T16:45:00Z"
    }
  ],
  "total": 1
}
```

### 2.9 Endpoint: DELETE /api/v1/tokens/{id}

**Purpose:** Revoke a token (admin only).

**Response (200 OK):**
```json
{
  "token_id": "tok_abc123def456",
  "status": "revoked",
  "revoked_at": "2026-02-08T18:00:00Z"
}
```

### 2.10 Endpoint: GET /api/v1/admin/stats

**Purpose:** Aggregate usage analytics (admin only).

**Response (200 OK):**
```json
{
  "active_tokens": 5,
  "revoked_tokens": 1,
  "total_transfers": 42,
  "transfers_by_status": {
    "pending": 1,
    "completed": 38,
    "expired": 3
  },
  "total_bytes_uploaded": 284000000,
  "generated_at": "2026-02-08T18:00:00Z"
}
```

### 2.11 Endpoint: POST /api/v1/register-interest

**Purpose:** Mailing list sign-up (public, rate limited).

**Request:**
```json
{
  "email": "alice@example.com",
  "message": "Would love to try this!"
}
```

**Response (201 Created):**
```json
{
  "registered": true
}
```

**Rate limit:** 5 requests per hour per IP.

### 2.12 Endpoint: GET /api/v1/health

**Purpose:** Health check (public).

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "sgraph-send",
  "version": "0.1.0",
  "timestamp": "2026-02-08T14:32:00Z"
}
```

---

## 3. Data Model

### 3.1 S3 Data Bucket Layout

```
sgraph-send-{tier}-data/
└── transfers/
    └── {transfer_id}/
        ├── meta.json       Transfer metadata (created by Lambda)
        ├── events.json     Event log (appended by Lambda)
        └── payload.enc     Encrypted file blob (uploaded by client via pre-signed URL)
```

### 3.2 meta.json Schema

```json
{
  "transfer_id": "string (12 chars)",
  "status": "pending | completed | expired | deleted",
  "created_at": "ISO 8601 UTC",
  "completed_at": "ISO 8601 UTC | null",
  "sender_ip": "string (IPv4 or IPv6)",
  "file_size_bytes": "integer",
  "content_type_hint": "string (MIME type)",
  "token_id": "string (tok_ prefix)",
  "expires_at": "ISO 8601 UTC"
}
```

### 3.3 events.json Schema

```json
{
  "events": [
    {
      "type": "upload_complete | download | expired | deleted",
      "timestamp": "ISO 8601 UTC",
      "ip": "string (optional — present for upload_complete, download)",
      "user_agent": "string (optional — present for download)"
    }
  ]
}
```

### 3.4 S3 Config Bucket Layout

```
sgraph-send-{tier}-config/
├── tokens/
│   └── {token_id}.json
├── waitlist/
│   └── {submission_id}.json
└── admin/
    └── stats.json
```

### 3.5 Token Schema

```json
{
  "token_id": "string (tok_ prefix + 12 chars)",
  "label": "string (human-readable label)",
  "status": "active | revoked | expired",
  "created_at": "ISO 8601 UTC",
  "expires_at": "ISO 8601 UTC",
  "revoked_at": "ISO 8601 UTC | null",
  "usage_count": "integer",
  "last_used_at": "ISO 8601 UTC | null"
}
```

---

## 4. Pre-Signed URL Flow

### 4.1 Upload Sequence

```
Client                          Lambda                              S3
  │                               │                                  │
  │  POST /api/v1/transfers       │                                  │
  │  { file_size, content_type }  │                                  │
  │  Authorization: Bearer tok_x  │                                  │
  │ ─────────────────────────────►│                                  │
  │                               │  validate token                  │
  │                               │  PUT meta.json ────────────────► │
  │                               │  PUT events.json ──────────────► │
  │                               │  generate_presigned_url(         │
  │                               │    method=PUT,                   │
  │                               │    key=transfers/{id}/payload.enc│
  │                               │    expires=3600,                 │
  │                               │    content_type=application/     │
  │                               │      octet-stream)               │
  │  ◄──── { transfer_id,        │                                  │
  │          upload_url }          │                                  │
  │                               │                                  │
  │  [Client encrypts file locally with AES-256-GCM]                 │
  │                               │                                  │
  │  PUT upload_url               │                                  │
  │  Content-Type: application/octet-stream                          │
  │  Body: encrypted blob         │                                  │
  │ ─────────────────────────────────────────────────────────────────►│
  │  ◄──── 200 OK ──────────────────────────────────────────────────│
  │                               │                                  │
  │  POST /api/v1/transfers/{id}/ │                                  │
  │    complete                   │                                  │
  │  Authorization: Bearer tok_x  │                                  │
  │ ─────────────────────────────►│                                  │
  │                               │  update meta.json (completed) ──►│
  │                               │  append event ─────────────────► │
  │  ◄──── { download_link,      │                                  │
  │          transparency }        │                                  │
```

### 4.2 Download Sequence

```
Client                          Lambda                              S3
  │                               │                                  │
  │  GET /api/v1/transfers/{id}/  │                                  │
  │    download                   │                                  │
  │ ─────────────────────────────►│                                  │
  │                               │  GET meta.json ◄────────────────│
  │                               │  verify status=completed         │
  │                               │  append download event ─────────►│
  │                               │  generate_presigned_url(         │
  │                               │    method=GET,                   │
  │                               │    key=transfers/{id}/payload.enc│
  │                               │    expires=3600)                 │
  │  ◄──── { download_url,       │                                  │
  │          transparency }        │                                  │
  │                               │                                  │
  │  GET download_url             │                                  │
  │ ─────────────────────────────────────────────────────────────────►│
  │  ◄──── encrypted blob ──────────────────────────────────────────│
  │                               │                                  │
  │  [Client decrypts blob locally using key entered in UI]          │
  │  [Client triggers browser Save As with decrypted content]        │
```

### 4.3 Pre-Signed URL Parameters

| Operation | S3 Method | Key Pattern | Expiry | Content-Type |
|-----------|-----------|-------------|--------|-------------|
| Upload | PUT | `transfers/{id}/payload.enc` | 3600s (1hr) | `application/octet-stream` |
| Download | GET | `transfers/{id}/payload.enc` | 3600s (1hr) | (S3 returns stored type) |

---

## 5. Lambda Handler Design

### 5.1 Application Structure

```
sgraph_ai_app_send/
├── __init__.py
├── app.py                  # FastAPI app instantiation + Mangum handler
├── config.py               # Environment-based config (bucket names, admin key, etc.)
├── routes/
│   ├── __init__.py
│   ├── transfers.py        # /transfers endpoints
│   ├── tokens.py           # /tokens endpoints
│   ├── admin.py            # /admin/stats endpoint
│   ├── register.py         # /register-interest endpoint
│   └── health.py           # /health endpoint
├── services/
│   ├── __init__.py
│   ├── s3_service.py       # S3 read/write/presign operations
│   ├── token_service.py    # Token CRUD + validation logic
│   ├── transfer_service.py # Transfer CRUD + event logging
│   └── stats_service.py    # Aggregate stats computation
├── middleware/
│   ├── __init__.py
│   ├── auth.py             # Token + Admin auth dependencies
│   └── rate_limit.py       # IP-based rate limiting
├── models/
│   ├── __init__.py
│   ├── transfer.py         # Pydantic models for transfer request/response
│   ├── token.py            # Pydantic models for token request/response
│   └── common.py           # Shared models (error, transparency, etc.)
└── utils/
    ├── __init__.py
    └── ids.py              # ID generation (transfer_id, token_id)
```

### 5.2 Entry Point (app.py)

```python
from fastapi import FastAPI
from mangum import Mangum

app = FastAPI(
    title="SGraph Send API",
    version="0.1.0",
    root_path="/api/v1"
)

# Register routes
app.include_router(health_router)
app.include_router(transfers_router, prefix="/transfers", tags=["transfers"])
app.include_router(tokens_router,   prefix="/tokens",    tags=["tokens"])
app.include_router(admin_router,    prefix="/admin",     tags=["admin"])
app.include_router(register_router, tags=["register"])

# Lambda handler
handler = Mangum(app, lifespan="off")
```

### 5.3 Configuration (Environment Variables)

| Variable | Example | Purpose |
|----------|---------|---------|
| `SGRAPH_SEND_TIER` | `dev` | Environment tier (dev/qa/prod) |
| `SGRAPH_SEND_DATA_BUCKET` | `sgraph-send-dev-data` | S3 bucket for transfers |
| `SGRAPH_SEND_CONFIG_BUCKET` | `sgraph-send-dev-config` | S3 bucket for tokens/config |
| `SGRAPH_SEND_ADMIN_KEY` | `adm_xxx` | Admin authentication key |
| `SGRAPH_SEND_REGION` | `eu-west-1` | AWS region |
| `SGRAPH_SEND_FRONTEND_URL` | `https://dev-send.sgraph.ai` | Frontend origin (for CORS + download links) |
| `SGRAPH_SEND_TRANSFER_EXPIRY_DAYS` | `7` | Default transfer expiry |
| `SGRAPH_SEND_MAX_FILE_SIZE` | `104857600` | Max file size in bytes (100MB) |

---

## 6. Authentication Model

### 6.1 Token Validation (Sender Auth)

FastAPI dependency that:
1. Extracts `Authorization: Bearer tok_xxx` header
2. Reads `tokens/{token_id}.json` from config bucket
3. Checks: token exists, status is `active`, not expired
4. Increments `usage_count`, updates `last_used_at`
5. Returns token data to the route handler
6. On failure: raises `HTTPException(401)`

### 6.2 Admin Auth

FastAPI dependency that:
1. Extracts `Authorization: Bearer adm_xxx` header
2. Compares against `SGRAPH_SEND_ADMIN_KEY` environment variable
3. On match: allows request
4. On mismatch: raises `HTTPException(401)`

### 6.3 No Auth (Public Endpoints)

`GET /transfers/{id}`, `GET /transfers/{id}/download`, `POST /register-interest`, `GET /health` — no auth dependency.

---

## 7. Error Handling Strategy

### 7.1 Error Response Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "TRANSFER_NOT_FOUND",
    "message": "Transfer abc123def456 not found"
  }
}
```

### 7.2 Error Codes

| Code | HTTP Status | When |
|------|-------------|------|
| `INVALID_TOKEN` | 401 | Token missing, revoked, or expired |
| `INVALID_ADMIN_KEY` | 401 | Admin key missing or wrong |
| `TRANSFER_NOT_FOUND` | 404 | Transfer ID doesn't exist |
| `TRANSFER_EXPIRED` | 410 | Transfer past expiry date |
| `TRANSFER_NOT_READY` | 425 | Transfer status is still pending |
| `TRANSFER_CONFLICT` | 409 | Transfer already completed |
| `FILE_TOO_LARGE` | 413 | file_size_bytes exceeds limit |
| `VALIDATION_ERROR` | 422 | Request body fails Pydantic validation |
| `RATE_LIMITED` | 429 | Too many requests from this IP |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### 7.3 Exception Handler

A global exception handler catches all unhandled exceptions and returns a sanitised 500 response (no stack traces, no internal details). Errors are logged to CloudWatch with full context.

---

## 8. Technology Choices & Rationale

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| Framework | FastAPI | Async, type-safe, auto-docs, Pydantic models, excellent Lambda support via Mangum | Flask (less type safety), Django (too heavy) |
| Lambda adapter | Mangum | Standard ASGI→Lambda bridge, well-maintained, handles API Gateway and ALB events | AWS Powertools (heavier), custom handler |
| S3 as database | JSON files in S3 | Zero additional infrastructure, simple, cheap, sufficient for MVP traffic | DynamoDB (overkill for MVP), PostgreSQL (requires VPC) |
| Pre-signed URLs | S3 generate_presigned_url | Avoids Lambda payload limits, client↔S3 direct, 1hr expiry | Lambda proxy (6MB limit), multipart (complex) |
| ID generation | secrets.token_urlsafe | Cryptographically random, URL-safe, no collisions at MVP scale | UUID (longer), nanoid (extra dependency) |
| Auth model | Bearer tokens in S3 | Simple, stateless per-request, no session management | JWT (stateless but complex), Cognito (overkill) |
| Max file size | 100MB | Reasonable for MVP, avoids multipart complexity | 50MB (too restrictive), 500MB (needs multipart) |
| Transfer expiry | 7 days default | Balances utility vs cost/security | 24hr (too short for MVP), 30 days (too long) |

---

## 9. Concurrency & S3 Race Conditions

### 9.1 Known Risk

S3 is eventually consistent for overwrites. If two download events happen simultaneously, the events.json append could lose one event (read-modify-write race).

### 9.2 MVP Mitigation

For MVP traffic levels (friends & family), this is acceptable. The probability of simultaneous downloads on the same transfer is extremely low.

### 9.3 Future Mitigation

When traffic grows:
- Migrate events to DynamoDB (atomic append)
- Or use S3 versioning + optimistic locking
- Or append events as separate S3 objects (one per event) and list on read

---

## 10. Observability

| Signal | Tool | What |
|--------|------|------|
| Logs | CloudWatch Logs | Structured JSON logs from FastAPI (request_id, endpoint, status, duration, error) |
| Metrics | CloudWatch Metrics | Lambda invocations, duration, errors, S3 request counts |
| Alarms | CloudWatch Alarms | Error rate > 5%, p99 latency > 5s, Lambda throttles |
| Tracing | X-Ray (future) | End-to-end request tracing through API Gateway → Lambda → S3 |
