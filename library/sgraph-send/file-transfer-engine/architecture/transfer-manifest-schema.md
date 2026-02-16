# Transfer Manifest Schema

**Version:** v0.3.12
**Date:** 15 February 2026
**Status:** Architecture design — pre-implementation

---

## What the Manifest Is

The **transfer manifest** is the single source of truth for every transfer. It is a JSON document stored server-side (in the cache service / S3) that tracks the complete state of an upload/download. Both the uploader and downloader read the same manifest.

The manifest enables:
- **Resume**: knows which chunks are complete — only missing chunks need re-uploading
- **Progress from both sides**: uploader and downloader both read the manifest
- **Integrity verification**: every chunk has a checksum
- **Streaming download**: downloader can start fetching completed chunks before upload finishes
- **Retry**: failed chunks are tracked and retried
- **Transfer history**: complete record of what happened

---

## Schema Definition

```json
{
  "$schema": "transfer-manifest-v1",
  "version": 1,

  "transfer_id": "a1b2c3d4e5f6",
  "status": "uploading",
  "created_at": "2026-02-15T14:32:00.000Z",
  "updated_at": "2026-02-15T14:32:08.500Z",

  "file": {
    "size_original": 15728640,
    "size_compressed": 10485760,
    "size_encrypted": 10485776,
    "content_hash": "sha256:a3f7b2c1d4e5f6...",
    "compression": "gzip",
    "encryption": "aes-256-gcm",
    "content_type_hint": "application/pdf"
  },

  "chunks": {
    "total": 12,
    "chunk_size": 1048576,
    "last_chunk_size": 524288,
    "completed": [0, 1, 2, 3, 4, 5, 6],
    "pending": [7, 8, 9, 10, 11],
    "failed": [],
    "checksums": {
      "0": "sha256:abcdef1234567890...",
      "1": "sha256:1234567890abcdef...",
      "2": "sha256:fedcba0987654321...",
      "3": "sha256:...",
      "4": "sha256:...",
      "5": "sha256:...",
      "6": "sha256:..."
    }
  },

  "storage": {
    "mode": "chunked",
    "backend": "s3",
    "bucket": "sgraph-send-transfers",
    "prefix": "chunks/a1/a1b2c3d4e5f6",
    "upload_id": "s3-multipart-upload-id"
  },

  "timing": {
    "compression_ms": 2100,
    "encryption_ms": 800,
    "upload_started_at": "2026-02-15T14:32:03.000Z",
    "upload_completed_at": null,
    "chunks_per_second": 1.2,
    "estimated_completion_at": "2026-02-15T14:32:12.000Z",
    "total_bytes_uploaded": 7340032,
    "total_bytes_downloaded": 0
  },

  "encryption_metadata": {
    "algorithm": "aes-256-gcm",
    "chunk_iv_strategy": "counter-derived",
    "aad_fields": ["chunk_index", "total_chunks", "transfer_id"],
    "key_wrapping": "url-encoded"
  },

  "events": [
    {
      "type": "chunk_complete",
      "chunk_index": 6,
      "timestamp": "2026-02-15T14:32:08.500Z",
      "duration_ms": 1657,
      "bytes": 1048576,
      "checksum": "sha256:..."
    }
  ],

  "download": {
    "count": 0,
    "first_download_at": null,
    "last_download_at": null
  }
}
```

---

## Field Reference

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | Yes | Schema identifier: `"transfer-manifest-v1"` |
| `version` | integer | Yes | Schema version: `1` |
| `transfer_id` | string | Yes | 12-char hex transfer identifier |
| `status` | enum | Yes | `"pending"` \| `"uploading"` \| `"completed"` \| `"failed"` \| `"expired"` |
| `created_at` | ISO8601 | Yes | When the transfer was initiated |
| `updated_at` | ISO8601 | Yes | Last manifest update time |

### `file` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `size_original` | integer | Yes | Original file size in bytes |
| `size_compressed` | integer | No | Size after compression (null if no compression) |
| `size_encrypted` | integer | No | Size after encryption (includes per-chunk IV + auth tag overhead) |
| `content_hash` | string | No | SHA-256 hash of original plaintext (`sha256:hex`) |
| `compression` | string | No | Algorithm used: `"gzip"` \| `"zstd"` \| `"none"` \| `null` |
| `encryption` | string | Yes | Algorithm used: `"aes-256-gcm"` |
| `content_type_hint` | string | No | MIME type hint (not authoritative) |

### `chunks` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `total` | integer | Yes | Total number of chunks |
| `chunk_size` | integer | Yes | Size of each chunk in bytes (except last) |
| `last_chunk_size` | integer | Yes | Size of the final chunk |
| `completed` | integer[] | Yes | Indices of successfully uploaded chunks |
| `pending` | integer[] | Yes | Indices of chunks not yet uploaded |
| `failed` | integer[] | Yes | Indices of chunks that failed (will be retried) |
| `checksums` | object | Yes | Map of chunk_index → `"sha256:hex"` for completed chunks |

### `storage` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | enum | Yes | `"single"` (legacy) \| `"chunked"` \| `"cas_chunked"` |
| `backend` | string | Yes | `"s3"` \| `"memory"` \| `"filesystem"` |
| `bucket` | string | No | S3 bucket name (when backend is S3) |
| `prefix` | string | No | S3 key prefix for chunks |
| `upload_id` | string | No | S3 multipart upload ID (for completion/abort) |

### `timing` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `compression_ms` | integer | No | Time spent compressing |
| `encryption_ms` | integer | No | Time spent encrypting |
| `upload_started_at` | ISO8601 | No | When first chunk upload began |
| `upload_completed_at` | ISO8601 | No | When last chunk completed (null if in progress) |
| `chunks_per_second` | number | No | Rolling average upload rate |
| `estimated_completion_at` | ISO8601 | No | ETA based on current rate |
| `total_bytes_uploaded` | integer | No | Cumulative bytes uploaded |
| `total_bytes_downloaded` | integer | No | Cumulative bytes downloaded |

### `encryption_metadata` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `algorithm` | string | Yes | `"aes-256-gcm"` |
| `chunk_iv_strategy` | string | Yes | `"counter-derived"` (chunk index in last 4 bytes of IV) |
| `aad_fields` | string[] | Yes | Fields included in AAD: `["chunk_index", "total_chunks", "transfer_id"]` |
| `key_wrapping` | string | Yes | `"url-encoded"` \| `"passphrase-derived"` \| `"rsa-wrapped"` |

### `events` Array

Each event is a log entry. Kept bounded (last N events, or level 3 detail only).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `"chunk_complete"` \| `"chunk_failed"` \| `"chunk_retry"` \| `"upload_complete"` \| `"download_start"` \| `"download_complete"` |
| `chunk_index` | integer | No | Which chunk (for chunk events) |
| `timestamp` | ISO8601 | Yes | When the event occurred |
| `duration_ms` | integer | No | How long the operation took |
| `bytes` | integer | No | Bytes involved |
| `checksum` | string | No | Chunk checksum (for completion events) |
| `error` | string | No | Error message (for failure events) |
| `attempt` | integer | No | Retry attempt number (for retry events) |

---

## Status Lifecycle

```
pending ──► uploading ──► completed
                │              │
                ▼              ▼
             failed        expired
```

| Status | Meaning |
|--------|---------|
| `pending` | Transfer created, no chunks uploaded yet |
| `uploading` | At least one chunk uploaded, more pending |
| `completed` | All chunks uploaded and verified |
| `failed` | Upload failed after max retries, not recoverable |
| `expired` | Transfer past its TTL, chunks may be deleted |

---

## Manifest Storage Location

### S3 Layout

```
{prefix}/manifest.json              ← the manifest
{prefix}/chunks/0                   ← chunk 0 (encrypted)
{prefix}/chunks/1                   ← chunk 1 (encrypted)
...
{prefix}/chunks/{N-1}               ← last chunk (encrypted)
```

Where `prefix` is typically `transfers/{hash_prefix}/{transfer_id}` with hash-based distribution for S3 rate limit avoidance (see research doc 04).

### CAS Layout (Phase 4)

```
manifests/{transfer_id}/manifest.json
chunks/{hash[0:2]}/{hash[2:4]}/{full_hash}     ← content-addressed chunks
```

---

## Backward Compatibility

### Legacy Single-Blob Transfers

Transfers created before the chunked engine use `storage.mode = "single"`:

```json
{
  "$schema": "transfer-manifest-v1",
  "version": 1,
  "transfer_id": "abc123def456",
  "status": "completed",
  "file": {
    "size_original": 5242880,
    "encryption": "aes-256-gcm"
  },
  "chunks": {
    "total": 1,
    "chunk_size": 5242880,
    "last_chunk_size": 5242880,
    "completed": [0],
    "pending": [],
    "failed": [],
    "checksums": {}
  },
  "storage": {
    "mode": "single",
    "backend": "s3"
  },
  "encryption_metadata": {
    "algorithm": "aes-256-gcm",
    "chunk_iv_strategy": "single-random",
    "aad_fields": [],
    "key_wrapping": "url-encoded"
  }
}
```

The engine treats `total_chunks == 1` with `chunk_iv_strategy == "single-random"` as the legacy format (single IV, no AAD).

---

## Manifest Update Rules

1. **Manifest is append-mostly**: chunks move from `pending` → `completed` (or `failed`). Never back.
2. **Atomic updates**: each manifest write replaces the full JSON. No partial updates.
3. **Client is authoritative during upload**: the uploading client updates the manifest after each chunk.
4. **Server validates on complete**: when the client signals completion, the server verifies all chunks are present.
5. **Downloader reads but never writes**: the download side polls the manifest for status updates.
6. **Events are bounded**: keep only the last 100 events to prevent manifest bloat.
7. **Timing is best-effort**: estimated completion and throughput are approximate.

---

## Security Properties

1. **No plaintext in manifest**: file name is NOT stored server-side (it's in the SGMETA envelope inside the encrypted payload)
2. **No decryption key**: key is never in the manifest — it's shared out-of-band (URL hash or passphrase)
3. **Content hash is of original plaintext**: this is computed client-side and optional. If included, it helps verify end-to-end integrity but does reveal something about the content (a known file can be verified by hash). Consider making this opt-in.
4. **Chunk checksums are of encrypted data**: safe to store server-side — reveals nothing about plaintext
5. **IP hashing**: any IP addresses in events are SHA-256 hashed with a daily salt
