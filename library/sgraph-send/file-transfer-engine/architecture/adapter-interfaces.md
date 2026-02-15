# Adapter Interface Design

**Version:** v0.3.13
**Date:** 15 February 2026
**Status:** Architecture design — pre-implementation

---

## Overview

The file transfer engine is built on **pluggable adapters**. The core engine (orchestrator) handles chunking, manifest lifecycle, retry logic, progress events, and pipeline ordering. All platform-specific or swappable capabilities are injected as adapter instances that conform to defined interfaces.

This document defines every adapter interface, its methods, error contracts, and which implementations are planned for each phase.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Adapter Registry](#2-adapter-registry)
3. [StorageAdapter](#3-storageadapter)
4. [TransportAdapter](#4-transportadapter)
5. [CryptoAdapter](#5-cryptoadapter)
6. [CompressionAdapter](#6-compressionadapter)
7. [CacheAdapter](#7-cacheadapter)
8. [ProgressAdapter](#8-progressadapter)
9. [ManifestStore](#9-manifeststore)
10. [Engine Configuration](#10-engine-configuration)
11. [Error Model](#11-error-model)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Design Principles

### 1.1 Adapters Are Injected, Not Imported

The engine constructor receives adapter instances. It never imports a concrete adapter.

```javascript
const engine = new TransferEngine({
    storage:     new S3StorageAdapter(config),
    transport:   new FetchTransportAdapter(),
    crypto:      new WebCryptoAdapter(),
    compression: new CompressionStreamAdapter(),
    cache:       new OPFSCacheAdapter(),
    progress:    new DOMProgressAdapter(container),
    manifest:    new S3ManifestStore(config),
});
```

### 1.2 Every Method Returns a Promise

All adapter methods are async. Even synchronous operations (like memory cache reads) return Promises for interface consistency.

### 1.3 Adapters Are Stateless Between Transfers

An adapter instance may hold configuration (bucket name, compression level) but must not hold per-transfer state. Per-transfer state lives in the transfer manifest.

### 1.4 Errors Are Typed

Every adapter throws errors from a known set (see [Error Model](#11-error-model)). The engine maps these to retry/fail/abort decisions.

### 1.5 Optional Adapters Default to No-Op

If no `CompressionAdapter` is provided, the engine skips compression. If no `CacheAdapter` is provided, chunks are not cached locally. The only required adapters are `StorageAdapter`, `TransportAdapter`, and `ManifestStore`.

---

## 2. Adapter Registry

| Adapter | Required | Purpose | Phase 1 Implementation |
|---------|:--------:|---------|------------------------|
| **StorageAdapter** | Yes | Generate presigned URLs, manage storage lifecycle | `S3StorageAdapter` |
| **TransportAdapter** | Yes | Move bytes (upload/download chunks) | `FetchTransportAdapter` |
| **CryptoAdapter** | No | Per-chunk encrypt/decrypt | `WebCryptoAdapter` |
| **CompressionAdapter** | No | Compress/decompress data | `CompressionStreamAdapter` |
| **CacheAdapter** | No | Local chunk storage for resume/resilience | `MemoryCacheAdapter` |
| **ProgressAdapter** | No | Report progress to caller | `ConsoleProgressAdapter` |
| **ManifestStore** | Yes | Read/write transfer manifests | `S3ManifestStore` |

---

## 3. StorageAdapter

Responsible for managing the storage backend — generating upload/download URLs, initiating multipart uploads, completing/aborting them.

### Interface

```javascript
/**
 * @interface StorageAdapter
 */
class StorageAdapter {

    /**
     * Initialize a new chunked upload.
     * For S3: creates a multipart upload and returns the upload ID.
     *
     * @param {string} transferId - The transfer identifier
     * @param {object} metadata - Transfer metadata (content type hint, chunk count)
     * @returns {Promise<{ uploadId: string, prefix: string }>}
     */
    async initUpload(transferId, metadata) {}

    /**
     * Generate a presigned URL for uploading a single chunk.
     *
     * @param {string} transferId - The transfer identifier
     * @param {string} uploadId - Backend upload session ID (e.g., S3 multipart upload ID)
     * @param {number} chunkIndex - Zero-based chunk index
     * @param {number} chunkSize - Size of this chunk in bytes
     * @returns {Promise<{ url: string, headers: object, method: string }>}
     */
    async getUploadUrl(transferId, uploadId, chunkIndex, chunkSize) {}

    /**
     * Generate a presigned URL for downloading a single chunk.
     *
     * @param {string} transferId - The transfer identifier
     * @param {number} chunkIndex - Zero-based chunk index
     * @returns {Promise<{ url: string, headers: object }>}
     */
    async getDownloadUrl(transferId, chunkIndex) {}

    /**
     * Signal that all chunks are uploaded. Finalize the storage operation.
     * For S3: completes the multipart upload with ETags.
     *
     * @param {string} transferId - The transfer identifier
     * @param {string} uploadId - Backend upload session ID
     * @param {Array<{ index: number, etag: string }>} parts - Completed parts with ETags
     * @returns {Promise<void>}
     */
    async completeUpload(transferId, uploadId, parts) {}

    /**
     * Abort an in-progress upload. Cleans up backend resources.
     * For S3: aborts the multipart upload and deletes uploaded parts.
     *
     * @param {string} transferId - The transfer identifier
     * @param {string} uploadId - Backend upload session ID
     * @returns {Promise<void>}
     */
    async abortUpload(transferId, uploadId) {}

    /**
     * Delete all storage artifacts for a transfer (chunks + manifest).
     * Called when a transfer expires or is explicitly deleted.
     *
     * @param {string} transferId - The transfer identifier
     * @returns {Promise<void>}
     */
    async deleteTransfer(transferId) {}
}
```

### Implementations

| Implementation | Backend | Phase | Notes |
|----------------|---------|-------|-------|
| `S3StorageAdapter` | AWS S3 / R2 / B2 | 1 | Uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| `MemoryStorageAdapter` | In-memory Map | 1 | For tests — stores chunks as `Map<string, Uint8Array>` |
| `AzureBlobStorageAdapter` | Azure Blob Storage | Future | Uses block upload API, SAS tokens instead of presigned URLs |

### S3StorageAdapter Config

```javascript
{
    bucket:          'sgraph-send-transfers',
    region:          'us-east-1',
    endpoint:        undefined,          // Set for R2/B2/MinIO
    forcePathStyle:  false,              // Set true for MinIO
    urlExpiry:       3600,               // Presigned URL lifetime (seconds)
    prefix:          'transfers',        // S3 key prefix
    hashDistribution: true,              // Use hash-prefix for rate limit avoidance
}
```

---

## 4. TransportAdapter

Responsible for moving bytes between the client and storage URLs. Handles HTTP requests, progress tracking, and per-request retries.

### Interface

```javascript
/**
 * @interface TransportAdapter
 */
class TransportAdapter {

    /**
     * Upload a chunk to the given URL.
     *
     * @param {string} url - Presigned upload URL
     * @param {Uint8Array} data - Chunk data (encrypted)
     * @param {object} options
     * @param {object} options.headers - Additional headers (from StorageAdapter)
     * @param {string} options.method - HTTP method (default 'PUT')
     * @param {function} options.onProgress - Callback: (bytesUploaded, totalBytes) => void
     * @param {AbortSignal} options.signal - AbortController signal for cancellation
     * @returns {Promise<{ etag: string, statusCode: number }>}
     * @throws {TransportError}
     */
    async uploadChunk(url, data, options = {}) {}

    /**
     * Download a chunk from the given URL.
     *
     * @param {string} url - Presigned download URL
     * @param {object} options
     * @param {object} options.headers - Additional headers
     * @param {function} options.onProgress - Callback: (bytesDownloaded, totalBytes) => void
     * @param {AbortSignal} options.signal - AbortController signal for cancellation
     * @returns {Promise<Uint8Array>}
     * @throws {TransportError}
     */
    async downloadChunk(url, options = {}) {}
}
```

### Implementations

| Implementation | Mechanism | Phase | Notes |
|----------------|-----------|-------|-------|
| `FetchTransportAdapter` | `fetch()` API | 1 | Universal (browser + Node 18+). No upload progress in browsers. |
| `XHRTransportAdapter` | `XMLHttpRequest` | 2 | Browser only. Needed for `upload.onprogress` events. |
| `WebRTCTransportAdapter` | RTCDataChannel | 3 | P2P transfer — bypasses storage URLs entirely. |

### FetchTransportAdapter Config

```javascript
{
    timeout:        30000,               // Per-request timeout (ms)
    retries:        3,                   // Max retries per chunk
    retryBackoff:   [0, 1000, 3000, 5000], // Backoff delays (from tus pattern)
}
```

### Upload Progress Note

The Fetch API does not expose upload progress in browsers (no `ReadableStream` upload body progress). For Phase 1 (CLI), `fetch` is sufficient since Node.js can track bytes sent. For Phase 2 (browser), `XHRTransportAdapter` is needed for granular upload progress.

The engine should:
1. Use `FetchTransportAdapter` by default
2. Auto-switch to `XHRTransportAdapter` when `typeof XMLHttpRequest !== 'undefined'` and upload progress is requested

---

## 5. CryptoAdapter

Responsible for per-chunk encryption and decryption. The engine calls this at the correct point in the pipeline (after compression, before upload).

### Interface

```javascript
/**
 * @interface CryptoAdapter
 */
class CryptoAdapter {

    /**
     * Generate a new encryption key for a transfer.
     *
     * @returns {Promise<CryptoKey>} A new AES-256-GCM key
     */
    async generateKey() {}

    /**
     * Import a key from raw bytes (e.g., from URL hash).
     *
     * @param {Uint8Array} rawKey - 32 bytes (256 bits)
     * @returns {Promise<CryptoKey>}
     */
    async importKey(rawKey) {}

    /**
     * Export a key to raw bytes (for sharing via URL hash).
     *
     * @param {CryptoKey} key
     * @returns {Promise<Uint8Array>} 32 bytes
     */
    async exportKey(key) {}

    /**
     * Encrypt a single chunk.
     *
     * @param {CryptoKey} key - The encryption key
     * @param {Uint8Array} plaintext - Chunk data (possibly compressed)
     * @param {object} context
     * @param {number} context.chunkIndex - Zero-based chunk index
     * @param {number} context.totalChunks - Total number of chunks
     * @param {string} context.transferId - Transfer identifier
     * @returns {Promise<{ ciphertext: Uint8Array, iv: Uint8Array, tag: Uint8Array }>}
     *   iv: 12 bytes (counter-derived from chunk index)
     *   tag: 16 bytes (GCM authentication tag — appended to ciphertext by Web Crypto)
     *   ciphertext: encrypted data with tag appended
     */
    async encryptChunk(key, plaintext, context) {}

    /**
     * Decrypt a single chunk.
     *
     * @param {CryptoKey} key - The decryption key
     * @param {Uint8Array} ciphertext - Encrypted chunk (with appended auth tag)
     * @param {Uint8Array} iv - 12-byte IV
     * @param {object} context - Same context used during encryption
     * @returns {Promise<Uint8Array>} Decrypted plaintext
     * @throws {CryptoError} If authentication fails (tampered data)
     */
    async decryptChunk(key, ciphertext, iv, context) {}
}
```

### IV Strategy: Counter-Derived

Each chunk gets a deterministic IV derived from the chunk index. This avoids the need to store IVs separately and ensures IVs are never reused with the same key.

```javascript
function deriveIV(baseIV, chunkIndex) {
    // baseIV: first 8 bytes are random (per-transfer)
    // last 4 bytes: big-endian chunk index
    const iv = new Uint8Array(12);
    iv.set(baseIV.subarray(0, 8));
    const view = new DataView(iv.buffer);
    view.setUint32(8, chunkIndex, false); // big-endian
    return iv;
}
```

### AAD (Additional Authenticated Data)

AAD binds each chunk to its position and transfer, preventing chunk reordering or substitution attacks:

```javascript
function buildAAD(context) {
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify({
        chunk_index:  context.chunkIndex,
        total_chunks: context.totalChunks,
        transfer_id:  context.transferId,
    }));
}
```

### Implementations

| Implementation | Platform | Phase | Notes |
|----------------|----------|-------|-------|
| `WebCryptoAdapter` | Browser + Node.js | 1 | Uses `crypto.subtle` — same API everywhere |
| `NullCryptoAdapter` | Any | 1 | Passthrough (no encryption) — for testing pipeline without crypto overhead |

---

## 6. CompressionAdapter

Responsible for compressing data before encryption and decompressing after decryption. The engine enforces the pipeline order: compress → encrypt → upload.

### Interface

```javascript
/**
 * @interface CompressionAdapter
 */
class CompressionAdapter {

    /**
     * Human-readable name of the compression algorithm.
     * @type {string}
     */
    get name() {}

    /**
     * Determine if the given data should be compressed.
     * Checks content type and magic bytes to skip already-compressed files.
     *
     * @param {string|null} contentType - MIME type hint (may be null)
     * @param {Uint8Array|null} firstBytes - First 12+ bytes of the file (for magic byte detection)
     * @returns {boolean} true if compression should be applied
     */
    shouldCompress(contentType, firstBytes) {}

    /**
     * Compress data.
     *
     * @param {Uint8Array} data - Plaintext data
     * @returns {Promise<Uint8Array>} Compressed data
     */
    async compress(data) {}

    /**
     * Decompress data.
     *
     * @param {Uint8Array} data - Compressed data
     * @returns {Promise<Uint8Array>} Decompressed (original) data
     */
    async decompress(data) {}
}
```

### Implementations

| Implementation | Algorithm | Bundle Cost | Phase | Notes |
|----------------|-----------|-------------|-------|-------|
| `CompressionStreamAdapter` | gzip (native) | 0 KB | 1 | Uses `CompressionStream` / `DecompressionStream` API |
| `FflateAdapter` | gzip (level control) | ~8 KB | 2 | Compression level 1-9, streaming, Web Worker async |
| `ZstdAdapter` | zstd (WASM) | ~300 KB | 3 | Lazy-loaded WASM module, strong compression |
| `NullCompressionAdapter` | none | 0 KB | 1 | Passthrough — for testing or disabled compression |

### Auto-Skip Logic

The `shouldCompress` method checks two signals:

1. **MIME type** — skip known compressed types (JPEG, PNG, MP4, ZIP, etc.)
2. **Magic bytes** — detect compressed file signatures from the first 12 bytes

See research document `05-compression-algorithms.md` for the full skip-list and magic byte table.

### Compression Ratio Check

The engine (not the adapter) performs a post-compression ratio check:

```javascript
const compressed = await compressionAdapter.compress(data);
const ratio = compressed.byteLength / data.byteLength;

if (ratio > 0.95) {
    // Less than 5% reduction — not worth the decompression cost
    // Use original data, set manifest.file.compression = "none"
    return data;
}
```

---

## 7. CacheAdapter

Responsible for local chunk storage for resume capability and crash resilience. When an upload is interrupted, cached chunks don't need re-encryption or re-upload.

### Interface

```javascript
/**
 * @interface CacheAdapter
 */
class CacheAdapter {

    /**
     * Store an encrypted chunk locally.
     *
     * @param {string} transferId - The transfer identifier
     * @param {number} chunkIndex - Zero-based chunk index
     * @param {Uint8Array} data - Encrypted chunk data
     * @returns {Promise<void>}
     */
    async putChunk(transferId, chunkIndex, data) {}

    /**
     * Retrieve a cached encrypted chunk.
     *
     * @param {string} transferId - The transfer identifier
     * @param {number} chunkIndex - Zero-based chunk index
     * @returns {Promise<Uint8Array|null>} The cached data, or null if not cached
     */
    async getChunk(transferId, chunkIndex) {}

    /**
     * Check which chunks are cached for a transfer.
     *
     * @param {string} transferId - The transfer identifier
     * @returns {Promise<number[]>} Array of cached chunk indices
     */
    async getCachedChunks(transferId) {}

    /**
     * Delete all cached chunks for a transfer.
     * Called after successful upload or explicit cancel.
     *
     * @param {string} transferId - The transfer identifier
     * @returns {Promise<void>}
     */
    async clearTransfer(transferId) {}

    /**
     * Get total bytes used by the cache.
     * Used for cache eviction decisions.
     *
     * @returns {Promise<number>} Total bytes stored
     */
    async getStorageUsed() {}
}
```

### Implementations

| Implementation | Storage | Phase | Notes |
|----------------|---------|-------|-------|
| `MemoryCacheAdapter` | `Map<string, Uint8Array>` | 1 | For tests — lost on page reload |
| `FilesystemCacheAdapter` | Local disk | 1 | For CLI — writes to temp directory |
| `OPFSCacheAdapter` | Origin Private File System | 2 | Browser — via Web Worker, persists across crashes |
| `IndexedDBCacheAdapter` | IndexedDB | 2 | Browser fallback — when OPFS unavailable |

### Cache Key Format

```
{transferId}/{chunkIndex}
```

Example: `a1b2c3d4e5f6/7` for chunk 7 of transfer `a1b2c3d4e5f6`.

### Eviction Policy

The cache does not implement its own eviction. The engine is responsible for:
1. Clearing cache after successful upload (`clearTransfer`)
2. Clearing cache on explicit cancel
3. Checking `getStorageUsed()` before starting a new transfer and clearing old transfers if space is low

---

## 8. ProgressAdapter

Responsible for reporting transfer progress to the UI or caller. The engine emits structured progress events; the adapter decides how to display them.

### Interface

```javascript
/**
 * @interface ProgressAdapter
 */
class ProgressAdapter {

    /**
     * Called when transfer state changes.
     *
     * @param {object} event
     * @param {string} event.transferId
     * @param {string} event.phase - 'compressing' | 'encrypting' | 'uploading' | 'downloading' | 'decrypting' | 'decompressing' | 'complete' | 'failed'
     * @param {number} event.progress - 0.0 to 1.0 (overall progress)
     * @param {object} event.detail
     * @param {number} event.detail.chunksCompleted
     * @param {number} event.detail.chunksTotal
     * @param {number} event.detail.bytesTransferred
     * @param {number} event.detail.bytesTotal
     * @param {number} event.detail.bytesPerSecond - Rolling average throughput
     * @param {number} event.detail.estimatedSecondsRemaining
     * @param {number} event.detail.currentChunkIndex - Currently active chunk
     * @param {string|null} event.error - Error message (when phase is 'failed')
     * @returns {void}
     */
    onProgress(event) {}

    /**
     * Called when a single chunk completes (for detailed progress).
     *
     * @param {object} event
     * @param {string} event.transferId
     * @param {number} event.chunkIndex
     * @param {number} event.durationMs
     * @param {number} event.bytes
     * @param {string} event.checksum
     * @returns {void}
     */
    onChunkComplete(event) {}

    /**
     * Called when a chunk operation fails (before retry).
     *
     * @param {object} event
     * @param {string} event.transferId
     * @param {number} event.chunkIndex
     * @param {number} event.attempt - Retry attempt number (1-based)
     * @param {string} event.error - Error message
     * @param {number} event.retryInMs - How long until next retry (0 if no more retries)
     * @returns {void}
     */
    onChunkError(event) {}
}
```

### Three Levels of Progress Detail

The recommendations document specifies three progress display levels:

| Level | Audience | What's Shown | Adapter |
|-------|----------|-------------|---------|
| **Simple** | Regular user | Single progress bar, percentage | `SimpleProgressAdapter` |
| **Stages** | Power user | Phase labels + per-phase progress | `StagedProgressAdapter` |
| **Technical** | Developer | Per-chunk, throughput, retries, timing | `ConsoleProgressAdapter` |

### Implementations

| Implementation | Output | Phase | Notes |
|----------------|--------|-------|-------|
| `ConsoleProgressAdapter` | `console.log` / CLI output | 1 | Phase, percentage, throughput |
| `CallbackProgressAdapter` | User-provided callback function | 1 | Engine emits events, caller handles display |
| `DOMProgressAdapter` | DOM elements (progress bar, text) | 2 | Updates `<progress>` element and status text |
| `NullProgressAdapter` | Nothing | 1 | Silent — for tests or headless operation |

---

## 9. ManifestStore

Responsible for reading and writing transfer manifests. Separated from `StorageAdapter` because the manifest has different access patterns (frequent reads/writes, JSON format) and may live in a different location than chunk data.

### Interface

```javascript
/**
 * @interface ManifestStore
 */
class ManifestStore {

    /**
     * Create a new manifest for a transfer.
     *
     * @param {string} transferId
     * @param {object} manifest - Initial manifest data (see transfer-manifest-schema.md)
     * @returns {Promise<void>}
     */
    async create(transferId, manifest) {}

    /**
     * Read the current manifest for a transfer.
     *
     * @param {string} transferId
     * @returns {Promise<object|null>} The manifest, or null if not found
     */
    async read(transferId) {}

    /**
     * Update the manifest (full replacement).
     * Manifests are always written atomically — no partial updates.
     *
     * @param {string} transferId
     * @param {object} manifest - Complete updated manifest
     * @returns {Promise<void>}
     */
    async update(transferId, manifest) {}

    /**
     * Delete a manifest.
     *
     * @param {string} transferId
     * @returns {Promise<void>}
     */
    async delete(transferId) {}
}
```

### Implementations

| Implementation | Backend | Phase | Notes |
|----------------|---------|-------|-------|
| `S3ManifestStore` | S3 (same bucket as chunks) | 1 | Stores as `{prefix}/manifest.json` |
| `MemoryManifestStore` | In-memory Map | 1 | For tests |
| `APIManifestStore` | SGraph Send API | 2 | Manifest managed via API calls (server stores in Memory-FS) |

### Manifest Location

Manifests are stored adjacent to their chunk data:

```
transfers/{hash_prefix}/{transfer_id}/manifest.json
transfers/{hash_prefix}/{transfer_id}/chunks/0
transfers/{hash_prefix}/{transfer_id}/chunks/1
...
```

---

## 10. Engine Configuration

The `TransferEngine` constructor accepts adapters and configuration:

```javascript
const engine = new TransferEngine({
    // Required adapters
    storage:     storageAdapter,
    transport:   transportAdapter,
    manifest:    manifestStore,

    // Optional adapters (defaults to no-op)
    crypto:      cryptoAdapter,      // null = no encryption
    compression: compressionAdapter, // null = no compression
    cache:       cacheAdapter,       // null = no local caching
    progress:    progressAdapter,    // null = silent

    // Engine configuration
    config: {
        chunkSize:       4 * 1024 * 1024,  // 4 MB default
        maxParallelism:  4,                 // Concurrent chunk uploads
        maxRetries:      3,
        retryBackoff:    [0, 1000, 3000, 5000],
        minRatio:        0.95,             // Skip compression if ratio > this
        checksumAlgorithm: 'SHA-256',
    }
});
```

### Engine Methods

```javascript
class TransferEngine {

    /**
     * Upload a file.
     * Pipeline: [compress] → chunk → [encrypt per-chunk] → upload
     *
     * @param {File|Blob|Uint8Array} data - The file to upload
     * @param {object} options
     * @param {string} options.contentType - MIME type hint
     * @param {CryptoKey} options.key - Encryption key (null = no encryption)
     * @returns {Promise<{ transferId: string, manifest: object, key: CryptoKey|null }>}
     */
    async upload(data, options = {}) {}

    /**
     * Download a file.
     * Pipeline: download chunks → [decrypt per-chunk] → reassemble → [decompress]
     *
     * @param {string} transferId
     * @param {object} options
     * @param {CryptoKey} options.key - Decryption key
     * @returns {Promise<Uint8Array>}
     */
    async download(transferId, options = {}) {}

    /**
     * Resume an interrupted upload.
     * Reads manifest, identifies missing chunks, continues from where it stopped.
     *
     * @param {string} transferId
     * @param {File|Blob|Uint8Array} data - The original file
     * @param {object} options
     * @param {CryptoKey} options.key - Same key used for initial upload
     * @returns {Promise<{ transferId: string, manifest: object }>}
     */
    async resume(transferId, data, options = {}) {}

    /**
     * Pause an in-progress transfer.
     * Aborts active chunk requests. Can be resumed later.
     *
     * @param {string} transferId
     * @returns {Promise<void>}
     */
    async pause(transferId) {}

    /**
     * Cancel a transfer.
     * Aborts uploads, clears cache, optionally deletes server-side data.
     *
     * @param {string} transferId
     * @param {object} options
     * @param {boolean} options.deleteRemote - Also delete server-side chunks (default true)
     * @returns {Promise<void>}
     */
    async cancel(transferId, options = {}) {}

    /**
     * Get the current status of a transfer.
     *
     * @param {string} transferId
     * @returns {Promise<object>} Current manifest
     */
    async status(transferId) {}
}
```

---

## 11. Error Model

All adapter errors extend a base `TransferError` class. The engine uses error types to decide retry vs fail vs abort.

### Error Hierarchy

```
TransferError (base)
├── TransportError          — Network/HTTP failures
│   ├── NetworkError        — Connection failed, DNS, timeout
│   ├── HttpError           — Non-2xx response (has statusCode)
│   └── AbortError          — Request was cancelled (AbortController)
├── StorageError            — Storage backend failures
│   ├── UrlExpiredError     — Presigned URL expired (re-request)
│   ├── QuotaExceededError  — Storage limit reached
│   └── NotFoundError       — Object/manifest not found
├── CryptoError             — Encryption/decryption failures
│   ├── AuthenticationError — GCM tag mismatch (tampered data)
│   └── KeyError            — Invalid key format or size
├── CompressionError        — Compression/decompression failures
├── CacheError              — Local cache failures
│   └── CacheQuotaError    — Browser storage quota exceeded
└── ManifestError           — Manifest read/write failures
    └── ManifestConflict    — Concurrent update detected
```

### Engine Error Handling Strategy

| Error Type | Engine Action |
|------------|--------------|
| `NetworkError` | Retry with backoff |
| `HttpError` (429) | Retry with longer backoff |
| `HttpError` (5xx) | Retry with backoff |
| `HttpError` (4xx) | Fail (no retry) |
| `UrlExpiredError` | Re-request URL from StorageAdapter, then retry |
| `AbortError` | Stop (user cancelled) |
| `AuthenticationError` | Fail (data tampered — cannot recover) |
| `CacheQuotaError` | Evict old transfers, retry cache write |
| `ManifestConflict` | Re-read manifest, merge, retry update |

---

## 12. Implementation Roadmap

### Phase 1: Core Engine + CLI

```
Implement:
├── TransferEngine (orchestrator)
├── StorageAdapter
│   ├── S3StorageAdapter
│   └── MemoryStorageAdapter
├── TransportAdapter
│   └── FetchTransportAdapter
├── CryptoAdapter
│   ├── WebCryptoAdapter
│   └── NullCryptoAdapter
├── CompressionAdapter
│   ├── CompressionStreamAdapter (gzip)
│   └── NullCompressionAdapter
├── CacheAdapter
│   ├── MemoryCacheAdapter
│   └── FilesystemCacheAdapter
├── ProgressAdapter
│   ├── ConsoleProgressAdapter
│   ├── CallbackProgressAdapter
│   └── NullProgressAdapter
├── ManifestStore
│   ├── S3ManifestStore
│   └── MemoryManifestStore
└── Error classes
```

### Phase 2: Browser Integration

```
Add:
├── TransportAdapter
│   └── XHRTransportAdapter (upload progress)
├── CacheAdapter
│   ├── OPFSCacheAdapter
│   └── IndexedDBCacheAdapter
├── ProgressAdapter
│   └── DOMProgressAdapter
├── ManifestStore
│   └── APIManifestStore
└── CompressionAdapter
    └── FflateAdapter (level control)
```

### Phase 3: Advanced Features

```
Add:
├── TransportAdapter
│   └── WebRTCTransportAdapter
├── CompressionAdapter
│   └── ZstdAdapter (WASM, lazy-loaded)
└── StorageAdapter
    └── (R2 config variant of S3StorageAdapter)
```

### Phase 4: Optimization (Villager)

```
Add:
├── ContentAddressableStorageAdapter
├── ContentDefinedChunkingStrategy
└── Performance profiling adapters
```

---

## Appendix: Adapter Discovery Pattern

For environments where manual injection is impractical (e.g., quick demos), the engine can discover platform-appropriate adapters:

```javascript
function createDefaultAdapters(config) {
    const adapters = {
        storage:   new S3StorageAdapter(config.s3),
        transport: new FetchTransportAdapter(config.transport),
        manifest:  new S3ManifestStore(config.s3),
    };

    // Optional: crypto
    if (config.encryption !== false && typeof crypto?.subtle !== 'undefined') {
        adapters.crypto = new WebCryptoAdapter();
    }

    // Optional: compression
    if (config.compression !== false && typeof CompressionStream !== 'undefined') {
        adapters.compression = new CompressionStreamAdapter();
    }

    // Optional: cache (platform-dependent)
    if (typeof navigator?.storage?.getDirectory === 'function') {
        adapters.cache = new OPFSCacheAdapter();
    } else if (typeof indexedDB !== 'undefined') {
        adapters.cache = new IndexedDBCacheAdapter();
    }

    return adapters;
}
```

This is a convenience function, not a requirement. Production code should always inject adapters explicitly.
