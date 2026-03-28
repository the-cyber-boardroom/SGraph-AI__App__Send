# Spec: Large Blob Support in sgit (Upload + Download)

**Date:** 2026-03-28
**Status:** Design confirmed — awaiting server Phase 1 implementation
**Problem:** Files larger than ~4.7 MB fail on `sgit push`. Files larger than ~5.7 MB will fail on `sgit pull` / checkout.

---

## Confirmed Design Decisions

The following were resolved in a server-team review session:

| # | Decision |
|---|---|
| 1 | **Write key required** on all initiate/complete calls (not on the S3 presigned PUT itself — the presigned URL is self-authenticating) |
| 2 | **Presigned URL TTL** — default 15–30 minutes (1h upper bound); client fetches a fresh URL per checkout session, no caching |
| 3 | **`/api/vault/zip` is a different endpoint** — it is for full-vault zip *download*, not for large blob upload. No conflation. |
| 4 | **`large: bool` added to server-side tree entry schema** — server already has `Schema__Object_Tree_Entry`; the `large` field will be added there to flag blobs stored via multipart S3 |
| 5 | **No wrapper for the S3 part PUT** — the client does a raw `urllib.request` / `fetch()` PUT to the presigned URL directly; no server-side method needed |

---

## Root Cause

All vault read/write endpoints route through AWS Lambda (RequestResponse invocation). API Gateway **base64-encodes binary request bodies** before invoking Lambda, adding ~33% overhead.

```
Upload limit:   6,291,456 bytes (Lambda) / 1.33 (base64) ≈ 4.7 MB max safe blob
Download limit: 6,291,456 bytes (Lambda response, no base64 overhead) ≈ 5.7 MB max safe blob
```

---

## Current Flows (What Works Today)

### Normal Write (blob ≤ ~4.7 MB)

```
Client                  API Gateway             Lambda              S3
  │                         │                      │                │
  │  PUT /api/vault/write/  │                      │                │
  │  {vault_id}/{file_id}   │                      │                │
  │  Body: raw bytes ~4MB   │                      │                │
  │─────────────────────────►                      │                │
  │                         │  Invoke Lambda        │                │
  │                         │  Event: {             │                │
  │                         │    body: base64(4MB)  │                │
  │                         │    = ~5.3MB event     │                │
  │                         │  }                    │                │
  │                         │──────────────────────►│                │
  │                         │                       │  s3.put(blob)  │
  │                         │                       │───────────────►│
  │                         │                       │◄───────────────│
  │                         │  { statusCode: 200 }  │                │
  │◄────────────────────────────────────────────────│                │
  │  { status: "ok" }       │                       │                │
```

### What Breaks (blob > ~4.7 MB)

```
Client                  API Gateway             Lambda
  │                         │                      │
  │  PUT /api/vault/write/  │                      │
  │  Body: raw bytes 5.2MB  │                      │
  │─────────────────────────►                      │
  │                         │  Invoke Lambda        │
  │                         │  Event: {             │
  │                         │    body: base64(5.2MB)│
  │                         │    = ~6.9MB event     │  ← EXCEEDS 6MB LIMIT
  │                         │  }                    │
  │                         │──────────────────────►│
  │                         │  413 Request Entity   │
  │                         │  Too Large            │
  │◄────────────────────────│                       │
  │  HTTP 413               │                       │
```

### Normal Read (blob ≤ ~5.7 MB)

```
Client                  API Gateway             Lambda              S3
  │                         │                      │                │
  │  GET /api/vault/read/   │                      │                │
  │  {vault_id}/{file_id}   │                      │                │
  │─────────────────────────►──────────────────────►                │
  │                         │                       │  s3.get(blob)  │
  │                         │                       │───────────────►│
  │                         │                       │  bytes (5.2MB) │
  │                         │                       │◄───────────────│
  │                         │  Response body: 5.2MB │                │
  │                         │  (no base64 on return)│                │
  │◄────────────────────────────────────────────────│                │
  │  5.2MB bytes            │                       │                │
  │  (works — under 6MB     │                       │                │
  │   response limit)       │                       │                │
```

### Batch Write (small objects, push flow)

```
Client                  API Gateway             Lambda              S3
  │                         │                      │                │
  │  POST /api/vault/batch/ │                      │                │
  │  {vault_id}             │                      │                │
  │  Body: JSON {           │                      │                │
  │    operations: [        │                      │                │
  │      { op: "write",     │                      │                │
  │        file_id: "bare/data/abc",               │                │
  │        data: base64(blob) },  ← already b64    │                │
  │      { op: "write-if-match",  ← CAS on ref     │                │
  │        file_id: "bare/refs/X",                 │                │
  │        data: ..., match: ... }                 │                │
  │    ]                    │                      │                │
  │  }                      │                      │                │
  │─────────────────────────►──────────────────────►                │
  │                         │                       │  s3.put(×N)    │
  │                         │                       │───────────────►│
  │                         │  { status: "ok" }     │               │
  │◄────────────────────────────────────────────────│               │
```

> **Note:** Batch bodies embed base64-encoded blobs inside JSON. API Gateway then base64-encodes the entire JSON body again before invoking Lambda. A batch containing a single 4 MB blob → ~5.3 MB JSON → ~7 MB Lambda event → 413. Large blobs fail in batch *faster* than in individual writes.

---

## Server Capabilities (Confirmed)

`GET /api/presigned/capabilities`:

```json
{
  "presigned_upload":   true,
  "multipart_upload":   true,
  "presigned_download": true,
  "direct_upload":      true,
  "max_part_size":      10485760,
  "min_part_size":       5242880,
  "max_parts":           10000
}
```

These already exist for the share/token flow (`transfer_id`). Three vault-scoped equivalents are needed.

---

## Required New Server Endpoints

```
POST  /api/vault/presigned/initiate/{vault_id}
POST  /api/vault/presigned/complete/{vault_id}
GET   /api/vault/presigned/read-url/{vault_id}/{file_id}
```

---

## Proposed Flows (Large Blob)

### Large Blob Upload — Single Part (4 MB < blob ≤ 10 MB)

```
Client              API Gateway          Lambda                  S3
  │                      │                  │                    │
  │  POST /api/vault/presigned/initiate/{vault_id}               │
  │  Headers: x-sgraph-vault-write-key: {write_key}              │
  │  Body: { file_id: "bare/data/{blob_id}",                     │
  │          file_size_bytes: 5200000,                           │
  │          num_parts: 1 }                                      │
  │──────────────────────►──── Invoke ──────►│                   │
  │                       │                  │ s3.CreateMultipart│
  │                       │                  │ Upload()          │
  │                       │                  │──────────────────►│
  │                       │                  │ { upload_id }     │
  │                       │                  │◄──────────────────│
  │                       │                  │ s3.GeneratePresigned
  │                       │                  │ UploadPartUrl()   │
  │                       │                  │──────────────────►│
  │                       │                  │ { upload_url }    │
  │                       │                  │◄──────────────────│
  │  { upload_id: "abc",  │                  │                   │
  │    parts: [{          │                  │                   │
  │      part_number: 1,  │                  │                   │
  │      upload_url: "https://s3.amazonaws.com/...?partNumber=1" │
  │    }] }               │                  │                   │
  │◄──────────────────────│◄─────────────────│                   │
  │                       │                  │                   │
  │  PUT {upload_url}     │                  │                   │
  │  Body: 5.2MB blob ─────────────────────────────────────────►│
  │  (direct to S3 — no Lambda, no size limit)                   │
  │                       │                  │                   │
  │  HTTP 200, ETag: "etag1" ◄──────────────────────────────────│
  │                       │                  │                   │
  │  POST /api/vault/presigned/complete/{vault_id}               │
  │  Headers: x-sgraph-vault-write-key: {write_key}              │
  │  Body: { file_id: "bare/data/{blob_id}",                     │
  │          upload_id: "abc",                                   │
  │          parts: [{ part_number: 1, etag: "etag1" }] }        │
  │──────────────────────►──── Invoke ──────►│                   │
  │                       │                  │ s3.CompleteMultipart
  │                       │                  │ Upload()          │
  │                       │                  │──────────────────►│
  │                       │                  │◄──────────────────│
  │  { status: "ok" }     │                  │                   │
  │◄──────────────────────│◄─────────────────│                   │
```

### Large Blob Upload — Multipart (blob > 10 MB)

```
Client                                                        S3
  │                                                            │
  │  1. POST /api/vault/presigned/initiate/{vault_id}          │
  │     Body: { file_id, file_size_bytes: 50MB, num_parts: 5 } │
  │     → { upload_id: "xyz",                                  │
  │         parts: [                                           │
  │           { part_number: 1, upload_url: "s3://...?part=1" }│
  │           { part_number: 2, upload_url: "s3://...?part=2" }│
  │           { part_number: 3, upload_url: "s3://...?part=3" }│
  │           { part_number: 4, upload_url: "s3://...?part=4" }│
  │           { part_number: 5, upload_url: "s3://...?part=5" }│
  │         ] }                                                │
  │                                                            │
  │  2. Split encrypted blob into chunks:                      │
  │     chunk_1 = blob[0     : 10MB]                           │
  │     chunk_2 = blob[10MB  : 20MB]                           │
  │     ...                                                    │
  │                                                            │
  │  3. Raw PUT directly to each presigned URL (no Lambda):    │
  │     PUT {url_1} body=chunk_1 ──────────────────────────── ►│ ETag1
  │     PUT {url_2} body=chunk_2 ──────────────────────────── ►│ ETag2
  │     PUT {url_3} body=chunk_3 ──────────────────────────── ►│ ETag3
  │     PUT {url_4} body=chunk_4 ──────────────────────────── ►│ ETag4
  │     PUT {url_5} body=chunk_5 ──────────────────────────── ►│ ETag5
  │     (parts can be uploaded in parallel)                    │
  │                                                            │
  │  4. POST /api/vault/presigned/complete/{vault_id}          │
  │     Body: { file_id, upload_id: "xyz",                     │
  │             parts: [{ part_number: 1, etag: ETag1 },       │
  │                      { part_number: 2, etag: ETag2 }, ...] }│
  │     → { status: "ok" }  (Lambda, tiny JSON payload — fine) │
```

### Large Blob Download

```
Client              API Gateway          Lambda                  S3
  │                      │                  │                    │
  │  GET /api/vault/presigned/read-url/{vault_id}/{file_id}      │
  │──────────────────────►──── Invoke ──────►│                   │
  │                       │                  │ s3.GeneratePresigned
  │                       │                  │ GetObjectUrl()    │
  │                       │                  │──────────────────►│
  │                       │                  │ { url, expiry }   │
  │                       │                  │◄──────────────────│
  │  { url: "https://s3.amazonaws.com/...?X-Amz-Expires=...",   │
  │    expires_in: 900 }  │                  │                   │
  │◄──────────────────────│◄─────────────────│                   │
  │  (Lambda only returned a URL — tiny response payload)        │
  │                       │                  │                   │
  │  GET {url}            │                  │                   │
  │  (raw urllib/fetch, direct to S3 — no Lambda, no limit) ───►│
  │                       │                  │                   │
  │  5.2MB encrypted blob ◄────────────────────────────────────│
  │                       │                  │                   │
  │  AES-256-GCM decrypt  │                  │                   │
  │  → write to working   │                  │                   │
  │    directory          │                  │                   │
```

---

## Tree / Schema Changes

### Server-side schema (confirmed by server team)

```python
class Schema__Object_Tree_Entry(Type_Safe):
    blob_id          : Safe_Str__Object_Id
    tree_id          : Safe_Str__Object_Id
    name_enc         : Safe_Str__Encrypted_Value
    size_enc         : Safe_Str__Encrypted_Value
    content_hash_enc : Safe_Str__Encrypted_Value
    content_type_enc : Safe_Str__Encrypted_Value
    large            : bool = False              # NEW — blob stored via multipart S3
```

### Client-side schema (to match)

```python
class Schema__Tree_Entry(Type_Safe):
    path    : Safe_Str__File_Path
    blob_id : Safe_Str__Object_Id  = None
    mode    : Safe_Str__File_Mode
    size    : Safe_UInt__File_Size              # plaintext bytes
    large   : bool = False                      # NEW — matches server schema
```

### Why the tree is the right place

The tree is read **before** any blobs are fetched during checkout. Storing `large: true` here lets the client pick the presigned download path proactively — zero wasted attempts on the normal read path.

What is **not** stored in the tree:
- Presigned URLs (expire in minutes; tree is immutable forever)
- S3 object paths (server-internal detail)

---

## Client Logic

### At commit / push time

```
for each file to commit:
  ┌──────────────────────────────────────────────────────────────┐
  │  encrypted_blob = AES-GCM-encrypt(plaintext)                 │
  │  encrypted_size = len(encrypted_blob)    # = plaintext + 28B │
  └──────────────────────────────────────────────────────────────┘
       │
       ├── encrypted_size ≤ 4 MB ?
       │       └── add to batch operations  (existing path)
       │           tree_entry["large"] = False
       │
       └── encrypted_size > 4 MB  (large blob):
               tree_entry["large"] = True
               │
               ├── encrypted_size ≤ 10 MB → num_parts = 1
               └── encrypted_size >  10 MB → num_parts = ceil(size / 10MB)
               │
               1. POST /api/vault/presigned/initiate
                  { file_id, file_size_bytes, num_parts }
                  Headers: x-sgraph-vault-write-key
               2. for each part:
                  PUT {presigned_url} body=chunk   ← raw urllib PUT, no wrapper
                  collect ETag from response header
               3. POST /api/vault/presigned/complete
                  { file_id, upload_id, parts: [{part_number, etag}] }
                  Headers: x-sgraph-vault-write-key
```

### At pull / checkout time

```
for each entry in tree:
       │
       ├── entry["large"] == False  (or field absent — backward compat)
       │       └── existing path:
       │           ciphertext = GET /api/vault/read/{vault_id}/{blob_id}
       │
       └── entry["large"] == True
               1. url_info = GET /api/vault/presigned/read-url/{vault_id}/{blob_id}
                  → { url: "https://s3.../...", expires_in: 900 }
               2. ciphertext = raw urllib GET {url}   ← direct S3, no Lambda
       │
       AES-256-GCM decrypt ciphertext → write file to working directory

fallback (blobs committed before large flag existed):
  if GET /api/vault/read returns HTTP 413:
      retry via presigned read-url path above
```

---

## New `Vault__API` Client Methods

```python
LARGE_BLOB_THRESHOLD = 4 * 1024 * 1024   # 4 MB

def presigned_initiate(self, vault_id: str, file_id: str,
                       file_size_bytes: int, num_parts: int,
                       write_key: str) -> dict:
    """POST /api/vault/presigned/initiate/{vault_id}
    Returns { upload_id, parts: [{ part_number, upload_url }] }"""

# No presigned_upload_part wrapper — client does a raw urllib PUT:
#   req = Request(upload_url, data=chunk, method='PUT')
#   with urlopen(req) as r: etag = r.headers['ETag']

def presigned_complete(self, vault_id: str, file_id: str,
                       upload_id: str, parts: list,
                       write_key: str) -> dict:
    """POST /api/vault/presigned/complete/{vault_id}
    parts = [{ part_number: int, etag: str }]"""

def presigned_read_url(self, vault_id: str, file_id: str) -> dict:
    """GET /api/vault/presigned/read-url/{vault_id}/{file_id}
    Returns { url: str, expires_in: int }"""

# No read_large() wrapper — caller already knows the blob is large (from entry['large'])
# and calls presigned_read_url() + raw urllib GET directly:
#   url_info = api.presigned_read_url(vault_id, file_id)
#   ciphertext = urlopen(url_info['url']).read()
```

---

## Implementation Phases

**Phase 1 — Server** (3 new endpoints, mirrors existing `/api/presigned/` surface)
```
POST /api/vault/presigned/initiate/{vault_id}
POST /api/vault/presigned/complete/{vault_id}
GET  /api/vault/presigned/read-url/{vault_id}/{file_id}
```

**Phase 2 — Client: upload** (unblocked once Phase 1 ships)
- `Vault__API`: add `presigned_initiate`, `presigned_complete`
- `Vault__Batch.execute_batch()`: extract large blobs, upload via presigned flow, batch the rest
- `Vault__Batch.execute_individually()`: route large blobs via presigned flow
- `Vault__Commit`: set `tree_entry["large"] = True` when `len(encrypted_blob) > LARGE_BLOB_THRESHOLD`

**Phase 3 — Client: schema**
- Add `large: bool = False` to `Schema__Tree_Entry`

**Phase 4 — Client: download** (unblocked once Phase 1 ships)
- `Vault__API`: add `presigned_read_url`
- `Vault__Fetch` / checkout: check `entry['large']` → call `presigned_read_url()` + raw urllib GET inline (no wrapper method)
- Add HTTP 413 fallback for blobs committed without the flag
