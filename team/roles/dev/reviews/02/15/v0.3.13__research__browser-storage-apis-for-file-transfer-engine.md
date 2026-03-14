# v0.3.13 -- Research: Browser Storage APIs for File Transfer Engine

**Date:** 2026-02-15
**Role:** Dev (Explorer)
**Purpose:** Evaluate browser storage APIs for client-side file caching (crash resilience) and transfer state persistence (resume capability) in the SGraph Send file transfer engine.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [IndexedDB](#indexeddb)
3. [Origin Private File System (OPFS)](#origin-private-file-system-opfs)
4. [Cache API (Service Workers)](#cache-api-service-workers)
5. [Storage Manager API](#storage-manager-api)
6. [localStorage / sessionStorage](#localstorage--sessionstorage)
7. [Comparison Table](#comparison-table)
8. [IndexedDB Wrapper Libraries](#indexeddb-wrapper-libraries)
9. [Performance Benchmarks](#performance-benchmarks)
10. [Practical Patterns for File Transfer](#practical-patterns-for-file-transfer)
11. [Recommendations for SGraph Send](#recommendations-for-sgraph-send)
12. [Sources](#sources)

---

## Executive Summary

For the SGraph Send file transfer engine, two browser storage APIs are most relevant:

- **IndexedDB** -- universal browser support, good for structured metadata and transfer manifests, adequate for binary data up to moderate sizes.
- **Origin Private File System (OPFS)** -- modern API (supported since early 2023 across all major browsers), 2x-7x faster than IndexedDB for large binary data, random-access file operations, ideal for chunked file storage.

The recommended architecture is a **dual-storage pattern**: OPFS for raw file data (encrypted chunks), IndexedDB for transfer metadata (manifests, chunk status, transfer history), with IndexedDB as a fallback for the rare browser that lacks OPFS support.

---

## IndexedDB

### What It Is

IndexedDB is a browser-native, asynchronous NoSQL database with full support for binary data. It stores structured data as key-value pairs in object stores within versioned databases. Unlike localStorage, IndexedDB supports transactions, indexes, cursors, and can store Blob, ArrayBuffer, and File objects directly via the structured clone algorithm.

### Storage Limits by Browser

| Browser | Per-Origin Limit | Overall Browser Limit | Notes |
|---------|------------------|-----------------------|-------|
| **Chrome / Edge** | Up to 60% of total disk | Up to 80% of total disk | Chrome always reports 60% of actual disk size (fingerprinting mitigation) |
| **Firefox** (best-effort) | min(10% of disk, 10 GiB) per eTLD+1 group | 50% of free disk | Group limit applies to all origins in same eTLD+1 |
| **Firefox** (persistent) | Up to 50% of disk, max 8 TiB | 50% of free disk | Not subject to group limit |
| **Safari** (browser app) | ~60% of total disk (since Safari 17.0+) | Up to 80% of total disk | 7-day eviction policy for non-interacted origins |
| **Safari** (private mode) | ~0 bytes | N/A | Deleted on session end |
| **iOS Safari** | Same as Safari (WebKit-based) | PWA added to Home Screen uses full browser quota | Third-party browsers use WebKit on iOS (except EU iOS 17.4+) |

**Practical example on a 512 GB disk:**
- Chrome: ~307 GB available per origin
- Firefox (best-effort): ~10 GiB per origin
- Firefox (persistent): ~256 GB per origin
- Safari: ~307 GB per origin

### API Overview

IndexedDB operates through several core concepts:

- **Database** (`IDBDatabase`): top-level container, versioned
- **Object Store** (`IDBObjectStore`): analogous to a table, holds records
- **Index** (`IDBIndex`): secondary key for querying
- **Transaction** (`IDBTransaction`): groups read/write operations atomically
- **Cursor** (`IDBCursor`): iterates over records or index entries
- **Key Range** (`IDBKeyRange`): filters queries by key bounds

### Binary Data Support

IndexedDB stores binary data through the structured clone algorithm, which natively handles:

- `ArrayBuffer` -- serialised inline in the database (e.g., into SQLite in Firefox)
- `Blob` -- stored as separate files on the filesystem, with references in the database
- `File` -- same as Blob (File extends Blob)
- `TypedArray` (Uint8Array, etc.) -- the underlying ArrayBuffer is cloned in its entirety

**Important:** When storing a `Uint8Array` backed by a large `ArrayBuffer`, the entire `ArrayBuffer` is serialised, not just the view. For large files, prefer wrapping data as a `Blob` -- browsers store Blobs externally to the database, which avoids size limits on inline structured clone data.

### Performance Characteristics

**Transaction overhead is the bottleneck, not data throughput:**
- 1,000 documents in a single transaction: ~80ms (0.08ms per document)
- 1,000 documents with one transaction each: ~2,000ms (2ms per document) -- **25x slower**
- Increasing document size by 100x has negligible impact on write time within a single transaction
- Bulk writes (100 puts per transaction): ~5x faster than one-per-transaction

**Large blob performance:**
- On macOS: 750 appends of 1.2 MB each took ~20 seconds (~45 MB/s)
- On Windows: same operation took ~136 seconds (~6.6 MB/s) -- fsync overhead
- UI thread can block during structured clone serialisation of large objects
- Chromium's IndexedDB performance is bottlenecked by IPC (inter-process communication)
- Chrome's team has stated they focus on read performance optimisation, not write performance

**Key insight for file transfer:** IndexedDB is transaction-limited, not bandwidth-limited. Storing a 100 MB file in a single put is faster than storing it as 100 x 1 MB puts in separate transactions.

### Structured Cloning: How Binary Data Is Stored

Internally, browsers handle binary data differently:

- **ArrayBuffer** data: serialised as part of the structured clone output and written directly into the underlying database engine (e.g., SQLite in Firefox)
- **Blob/File** objects: stored as separate files on the filesystem, with only references maintained in the database
- Firefox has a threshold: smaller blobs may be inlined in SQLite for performance, larger ones stored as files

This means Blob storage is generally more efficient for large binary data than raw ArrayBuffer storage.

### Persistence and Eviction

- **Persists across:** tab close, browser restart, system reboot
- **Eviction risk (best-effort mode):** browsers may evict under storage pressure using LRU (Least Recently Used) policy
- **Persistent mode:** call `navigator.storage.persist()` to request non-evictable storage
- **Safari 7-day policy:** if cross-site tracking prevention is on and the origin has no user interaction in 7 days, script-created data is deleted (does not apply to installed PWAs)
- **Private browsing:** Safari provides ~0 quota; other browsers may restrict or disable IndexedDB

### Code Example: Storing and Retrieving a File Chunk

```javascript
// Open database with versioned schema
const db = await idb.openDB('sgraph-send', 1, {
  upgrade(db) {
    // Store for encrypted file chunks
    const chunkStore = db.createObjectStore('chunks', {
      keyPath: ['transferId', 'chunkIndex']
    });
    chunkStore.createIndex('by-transfer', 'transferId');

    // Store for transfer manifests
    db.createObjectStore('manifests', { keyPath: 'transferId' });
  }
});

// Store an encrypted chunk (ArrayBuffer from Web Crypto)
async function storeChunk(transferId, chunkIndex, encryptedData) {
  const tx = db.transaction('chunks', 'readwrite');
  await tx.store.put({
    transferId,
    chunkIndex,
    data: new Blob([encryptedData]),  // Blob for efficient large binary storage
    storedAt: Date.now()
  });
  await tx.done;
}

// Retrieve all chunks for a transfer
async function getChunks(transferId) {
  return db.getAllFromIndex('chunks', 'by-transfer', transferId);
}

// Store transfer manifest
async function storeManifest(manifest) {
  const tx = db.transaction('manifests', 'readwrite');
  await tx.store.put(manifest);
  await tx.done;
}

// Retrieve manifest for resume
async function getManifest(transferId) {
  return db.get('manifests', transferId);
}
```

---

## Origin Private File System (OPFS)

### What It Is

The Origin Private File System (OPFS) is a storage endpoint provided as part of the File System API (standardised by WHATWG). It gives web applications a private, sandboxed, origin-specific virtual filesystem that is invisible to the user. Unlike IndexedDB, OPFS is designed for file operations, not database operations -- it provides low-level, byte-by-byte file access optimised for performance.

### How It Differs from IndexedDB

| Aspect | IndexedDB | OPFS |
|--------|-----------|------|
| Data model | Key-value object stores with indexes | Files and directories |
| Access pattern | Full record read/write per transaction | Random access (seek, read range, write range) |
| API paradigm | Database transactions | File system operations |
| Sync API | No (async only) | Yes (in dedicated Web Workers) |
| Metadata/querying | Built-in indexes and cursors | None (just files and directories) |
| Performance for large binary | Good (transaction overhead dominates) | Excellent (2x-7x faster) |

### API Surface

**Entry point (main thread or worker):**
```javascript
const root = await navigator.storage.getDirectory();
// Returns a FileSystemDirectoryHandle for the origin's private FS root
```

**Directory operations:**
```javascript
const dir = await root.getDirectoryHandle('transfers', { create: true });
const subDir = await dir.getDirectoryHandle('abc123', { create: true });
```

**File operations (async, main thread or worker):**
```javascript
const fileHandle = await dir.getFileHandle('chunk-0.bin', { create: true });

// Write via writable stream (async)
const writable = await fileHandle.createWritable();
await writable.write(encryptedArrayBuffer);
await writable.close();

// Read via File object (async)
const file = await fileHandle.getFile();
const data = await file.arrayBuffer();
```

**Synchronous access (dedicated Web Workers only -- high performance):**
```javascript
// worker.js
onmessage = async (event) => {
  const { transferId, chunkIndex, data } = event.data;

  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(transferId, { create: true });
  const fileHandle = await dir.getFileHandle(
    `chunk-${chunkIndex}.bin`,
    { create: true }
  );

  // createSyncAccessHandle() is async despite the name,
  // but the returned handle's methods are synchronous
  const accessHandle = await fileHandle.createSyncAccessHandle();

  // Synchronous write -- no promise overhead
  const bytesWritten = accessHandle.write(data, { at: 0 });

  // Persist to disk
  accessHandle.flush();

  // MUST close to release exclusive lock
  accessHandle.close();

  postMessage({ transferId, chunkIndex, bytesWritten });
};
```

**Reading with random access (sync, in Worker):**
```javascript
const accessHandle = await fileHandle.createSyncAccessHandle();

const size = accessHandle.getSize();

// Read a specific range (e.g., bytes 1024-2047)
const buffer = new Uint8Array(1024);
const bytesRead = accessHandle.read(buffer, { at: 1024 });

accessHandle.close();
```

### Synchronous Access Handle Methods

| Method | Description | Sync/Async |
|--------|-------------|------------|
| `read(buffer, options)` | Reads file content into buffer at optional offset | Sync |
| `write(buffer, options)` | Writes buffer to file at optional offset | Sync |
| `getSize()` | Returns file size in bytes | Sync |
| `truncate(size)` | Resizes the file | Sync |
| `flush()` | Persists changes to disk | Sync |
| `close()` | Releases exclusive lock on the file | Sync |

**Note:** In Chrome versions before 108, `close()`, `flush()`, `getSize()`, and `truncate()` were async. All current browsers implement them as synchronous.

### Storage Limits

OPFS shares the same per-origin quota as IndexedDB and Cache API. The limits are identical to those listed in the IndexedDB section above. All browser-based storage mechanisms draw from a single per-origin quota pool.

### Browser Support

| Browser | `navigator.storage.getDirectory()` | `createSyncAccessHandle()` | `readwrite-unsafe` mode |
|---------|-------------------------------------|---------------------------|-------------------------|
| **Chrome** | 86+ | 102+ | 121+ |
| **Edge** | 86+ (Chromium) | 102+ (Chromium) | 121+ |
| **Firefox** | 111+ | 111+ | Not yet |
| **Safari** | 15.2+ | 15.2+ | Not yet |
| **Safari iOS** | 15.2+ | 15.2+ | Not yet |

**Global browser support:** Available across all major browsers since March 2023. Internet Explorer is not supported and will never be.

**Caveats:**
- `createSyncAccessHandle()` is only available in dedicated Web Workers (not main thread, not SharedWorker, not iframe)
- Takes an exclusive lock on the file -- other tabs cannot access the same file simultaneously (unless using `readwrite-unsafe` mode, Chrome 121+ only)
- HTTPS required (secure context)
- Not available in private/incognito browsing modes in most browsers
- WKWebView (iOS embedded apps): individual files capped at 10 MB (does not affect Safari itself)
- Safari versions before 17 have a bug with OPFS from sub-workers affecting SQLite WASM usage

### Performance

OPFS is **2x-7x faster** than IndexedDB for large file operations:

- **Plain inserts** (new file per write): 2x faster than IndexedDB
- **Reads**: up to 4x faster than IndexedDB
- **Real-world (Autodesk Viewer migration from IndexedDB to OPFS):**
  - Initial model loading: 1.1-1.7x faster (small cache), 2-7x faster (medium cache), more for large caches
  - Subsequent model loading: 2-4x faster (small cache), 3-6x faster (medium cache)
- The synchronous Worker API eliminates promise/async overhead entirely
- Random access means you can read/write specific byte ranges without loading the entire file

### Key Advantages for File Transfer

1. **Random access** -- read/write specific chunks without loading the full file, ideal for resume
2. **No transaction overhead** -- unlike IndexedDB, no transaction wrapping required
3. **Sync API in Workers** -- no async overhead, matches native filesystem semantics
4. **Natural file semantics** -- chunks are files in directories, not records in a database
5. **Streaming support** -- can pipe ReadableStream directly to a writable file

---

## Cache API (Service Workers)

### What It Is

The Cache API (`caches` / `CacheStorage`) is a browser storage mechanism designed for HTTP Request/Response pairs. It was originally designed for Service Worker offline caching but can be used from any context (main thread, workers).

### Storage Limits

Same per-origin quota as IndexedDB and OPFS -- all share a single pool.

### Key Characteristics

- Stores `Response` objects keyed by `Request` objects (or URL strings)
- No automatic expiration -- cached responses persist until explicitly deleted
- Requires HTTPS (secure context)
- Can store any binary data wrapped in a Response object
- No indexing, querying, or structured metadata

### Relevance to File Transfer

The Cache API is **not well-suited** for raw file storage or transfer state persistence. Its Request/Response model is designed for HTTP caching, not arbitrary binary data.

**However, it could be useful for:**
- Caching presigned upload/download URLs
- Caching static UI assets for offline support
- Caching download responses for later assembly

### Why Not to Use It for Core File Storage

- No random access (must read/write entire Response)
- No concept of partial data or chunks
- Awkward API for non-HTTP data (must wrap in synthetic Response objects)
- No structured metadata support
- Eviction behaviour same as IndexedDB with less control

### Code Example (for reference only)

```javascript
// Caching a download response
const cache = await caches.open('download-cache-v1');
await cache.put(
  new Request(`/chunks/${transferId}/${chunkIndex}`),
  new Response(encryptedBlob, {
    headers: { 'Content-Type': 'application/octet-stream' }
  })
);

// Retrieving
const response = await cache.match(
  new Request(`/chunks/${transferId}/${chunkIndex}`)
);
const data = await response.arrayBuffer();
```

---

## Storage Manager API

The Storage Manager API (`navigator.storage`) provides two critical methods for managing browser storage:

### `navigator.storage.estimate()`

Returns estimated usage and quota for the current origin.

```javascript
if ('storage' in navigator && 'estimate' in navigator.storage) {
  const { usage, quota } = await navigator.storage.estimate();

  const usedMB   = (usage / (1024 * 1024)).toFixed(2);
  const totalMB  = (quota / (1024 * 1024)).toFixed(2);
  const freeMB   = ((quota - usage) / (1024 * 1024)).toFixed(2);
  const pctUsed  = ((usage / quota) * 100).toFixed(1);

  console.log(`Storage: ${usedMB} MB used / ${totalMB} MB quota (${pctUsed}%)`);
  console.log(`Available: ${freeMB} MB`);
}
```

**Important caveats:**
- Values are **estimates**, not exact (browsers may obscure for fingerprinting protection)
- Chrome always reports 60% of actual disk size as quota, regardless of free space
- Covers all origin storage: IndexedDB + OPFS + Cache API combined
- Browser support: Chrome 61+, Firefox 57+, Safari 17+, Edge 79+

### `navigator.storage.persist()`

Requests that storage be protected from automatic eviction.

```javascript
async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (isPersisted) {
      console.log('Storage is already persistent');
      return true;
    }

    const granted = await navigator.storage.persist();
    if (granted) {
      console.log('Persistent storage granted');
    } else {
      console.log('Persistent storage denied -- data may be evicted under pressure');
    }
    return granted;
  }
  return false;  // API not available
}
```

**Per-browser behaviour:**

| Browser | Behaviour | User Prompt? |
|---------|-----------|-------------|
| **Chrome** | Auto-grants/denies based on engagement heuristics (bookmarked, installed as PWA, notifications permission, etc.) | No |
| **Firefox** | Prompts the user; requires user gesture to trigger | Yes |
| **Safari** | Auto-grants/denies based on interaction history (since Safari 17+) | No |
| **Edge** | Same as Chrome (Chromium-based) | No |

**Effect of persistence:**
- **Without persistence:** browser may evict data under storage pressure (LRU policy)
- **With persistence:** data is protected from automatic eviction; only the user can clear it
- In practice, Chrome rarely evicts data even without persistence, but Safari is more aggressive

**Best practice:** Request persistence when the user initiates a file upload, not on page load. Wrap the request in a user gesture on Firefox. Check `navigator.storage.persisted()` before requesting.

---

## localStorage / sessionStorage

### Why Not to Use Them

| Limitation | Detail |
|-----------|--------|
| Size limit | 5 MB per origin (localStorage) + 5 MB (sessionStorage) |
| Data format | Strings only -- binary data must be base64-encoded (33% overhead) |
| API | Synchronous -- blocks the main thread |
| Performance | Terrible for anything beyond small key-value pairs |
| Persistence | localStorage persists; sessionStorage cleared on tab close |

**For SGraph Send:** localStorage could hold small configuration values (e.g., user preferences, last-used settings) but is entirely unsuitable for file data or transfer manifests of any significant size.

---

## Comparison Table

| Feature | IndexedDB | OPFS | Cache API | localStorage |
|---------|-----------|------|-----------|-------------|
| **Max storage** | 60% disk (Chrome), 10 GiB (Firefox best-effort) | Same quota (shared) | Same quota (shared) | 5 MB |
| **Binary data** | Yes (Blob, ArrayBuffer, File) | Yes (native file bytes) | Yes (Response body) | No (strings only) |
| **Random access** | No (full record read/write) | Yes (seek + byte range) | No | No |
| **Sync API** | No (async only) | Yes (in dedicated Worker) | No (async only) | Yes (main thread) |
| **Performance (large files)** | Good (~45 MB/s macOS) | Excellent (2-7x faster) | N/A for this use case | Terrible |
| **Structured metadata** | Yes (indexes, cursors, key ranges) | No (files and directories only) | No (Request/Response pairs) | No (flat key-value) |
| **Transaction support** | Yes (ACID within a transaction) | No (file-level locking) | No | No |
| **Browser support** | Universal (IE 10+) | Modern (all browsers since March 2023) | Universal (modern) | Universal |
| **Persistence** | Requestable via Storage API | Requestable via Storage API | Requestable via Storage API | Always persistent |
| **Eviction risk** | Yes (unless persistent) | Yes (unless persistent) | Yes (unless persistent) | No |
| **Private browsing** | Available (limits vary) | Mostly unavailable | Available (limits vary) | Available (5 MB) |
| **Worker requirement** | No (works on main thread) | Sync API: dedicated Worker only | No | No (main thread only) |

---

## IndexedDB Wrapper Libraries

### idb (by Jake Archibald)

- **Size:** ~1.19 KB (brotli'd)
- **API style:** Promise-based wrapper that closely mirrors the native IndexedDB API
- **Key feature:** Turns IDBRequest callbacks into Promises; supports `async/await`
- **Schema management:** Manual via `upgrade` callback
- **Interoperability:** Can unwrap to native IDBDatabase and vice versa
- **npm:** [npmjs.com/package/idb](https://www.npmjs.com/package/idb) -- 144k weekly downloads
- **GitHub:** [github.com/jakearchibald/idb](https://github.com/jakearchibald/idb)

**Also see:** `idb-keyval` (same author) -- 295-573 bytes, simple get/set API only.

```javascript
import { openDB } from 'idb';

const db = await openDB('sgraph-send', 1, {
  upgrade(db) {
    db.createObjectStore('manifests', { keyPath: 'transferId' });
  },
  blocked()    { console.warn('Database blocked by older version'); },
  blocking()   { console.warn('This connection is blocking a newer version'); },
  terminated() { console.error('Database connection terminated unexpectedly'); },
});

await db.put('manifests', { transferId: 'abc123', status: 'uploading', chunks: 42 });
const manifest = await db.get('manifests', 'abc123');
```

**Recommendation for SGraph Send:** Best choice. Minimal footprint, stays close to native API, zero dependencies. Perfect for storing transfer manifests and chunk metadata.

### Dexie.js

- **Size:** ~83 KB minified, ~26 KB gzipped
- **API style:** Fluent, chainable, database-like query syntax
- **Key features:** Versioned schema migrations, advanced querying (filtering, sorting, multi-index), automatic transaction management, reactive queries, cloud sync
- **npm:** [npmjs.com/package/dexie](https://www.npmjs.com/package/dexie) -- used by 100,000+ sites
- **GitHub:** [github.com/dexie/Dexie.js](https://github.com/dexie/Dexie.js)

```javascript
import Dexie from 'dexie';

const db = new Dexie('sgraph-send');
db.version(1).stores({
  manifests: 'transferId, status, createdAt',
  chunks:    '[transferId+chunkIndex], transferId'
});

await db.manifests.put({ transferId: 'abc123', status: 'uploading', createdAt: Date.now() });
const pending = await db.manifests.where('status').equals('uploading').toArray();
```

**Assessment:** Powerful but overkill for SGraph Send's needs. The 26 KB gzipped size is significant for a zero-dependency frontend. Advanced querying is unnecessary for transfer manifests.

### localForage

- **Size:** ~7 KB gzipped
- **API style:** Simple key-value (mirrors localStorage API)
- **Key feature:** Falls back from IndexedDB to WebSQL to localStorage automatically
- **Limitation:** No indexing, no querying -- must iterate all keys to search
- **npm:** [npmjs.com/package/localforage](https://www.npmjs.com/package/localforage) -- 4.7M weekly downloads

```javascript
import localforage from 'localforage';

await localforage.setItem('manifest-abc123', { transferId: 'abc123', status: 'uploading' });
const manifest = await localforage.getItem('manifest-abc123');
```

**Assessment:** Simplest API but too limited. No compound keys, no indexes, no multi-record transactions. The WebSQL/localStorage fallbacks are irrelevant for modern browsers.

### opfs-tools

- **Purpose:** High-level abstraction over OPFS
- **Key feature:** All file I/O runs in Web Workers automatically (non-blocking main thread)
- **API:** `file()`, `dir()`, `write()` functions with Promise-based interface
- **GitHub:** [github.com/hughfenghen/opfs-tools](https://github.com/hughfenghen/opfs-tools)

```javascript
import { file, dir, write } from 'opfs-tools';

// Write file from a stream
await write('/transfers/abc123/chunk-0.bin', encryptedStream);

// Read file
const data = await file('/transfers/abc123/chunk-0.bin').arrayBuffer();

// Create directory
await dir('/transfers/abc123').create();
```

**Assessment:** Worth evaluating for OPFS usage if the raw API feels too low-level. However, for SGraph Send, the raw OPFS API with a thin wrapper may be more appropriate to keep dependencies at zero.

---

## Performance Benchmarks

### IndexedDB Write Performance

| Scenario | Time | Notes |
|----------|------|-------|
| 1,000 small docs, single transaction | ~80 ms | 0.08 ms per doc |
| 1,000 small docs, one transaction each | ~2,000 ms | 25x slower -- transaction overhead dominates |
| 1,000 large docs (100x bigger), single transaction | ~80 ms | Data size is not the bottleneck |
| 100 puts per transaction (bulk) | ~5x faster | Than one-per-transaction |
| 750 x 1.2 MB appends (macOS) | ~20 s | ~45 MB/s |
| 750 x 1.2 MB appends (Windows) | ~136 s | ~6.6 MB/s (fsync overhead) |

### OPFS vs. IndexedDB

| Operation | OPFS Advantage | Source |
|-----------|---------------|--------|
| Plain inserts (new file per write) | ~2x faster | RxDB storage benchmarks |
| Reads | Up to 4x faster | RxDB storage benchmarks |
| Complex queries over large datasets | Up to 4x faster | RxDB storage benchmarks |

### Autodesk Viewer Case Study (IndexedDB to OPFS Migration)

| Metric | Small Cache | Medium Cache | Large Cache |
|--------|------------|-------------|-------------|
| Initial model loading improvement | 1.1-1.7x | 2-7x | Even more |
| Subsequent model loading improvement | 2-4x | 3-6x | Even more |

Key finding: IndexedDB in Chrome had "severe performance issues on large amounts of data to the point where initial model loading times became significantly slower." OPFS eliminated this degradation entirely.

### Why OPFS Is Faster

1. **No transaction overhead** -- IndexedDB performance is dominated by transaction handling and IPC in Chromium
2. **Synchronous API** -- eliminates promise/microtask overhead in Web Workers
3. **Low-level byte access** -- no structured clone serialisation, no database abstraction layer
4. **Random access** -- can write to a specific offset without reading/rewriting the entire record

---

## Practical Patterns for File Transfer

### Pattern 1: Pre-Upload File Caching (Crash Resilience)

The user selects/drops a file. Before uploading, immediately cache it locally so that if the tab crashes, the file survives.

```javascript
// Main thread
async function cacheFileForUpload(file, transferId) {
  // Check available storage first
  const { usage, quota } = await navigator.storage.estimate();
  const available = quota - usage;
  if (file.size > available * 0.8) {
    throw new Error(`File too large for local cache: ${file.size} bytes, ${available} available`);
  }

  // Request persistent storage (best effort)
  await navigator.storage.persist();

  // Store file in OPFS via worker
  worker.postMessage({
    action: 'cache-file',
    transferId,
    file  // File objects are transferable
  });
}

// Worker
onmessage = async (event) => {
  const { action, transferId, file } = event.data;
  if (action === 'cache-file') {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(transferId, { create: true });
    const fileHandle = await dir.getFileHandle('source.bin', { create: true });
    const accessHandle = await fileHandle.createSyncAccessHandle();

    // Read file in chunks and write to OPFS
    const reader = file.stream().getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accessHandle.write(value, { at: offset });
      offset += value.byteLength;
    }
    accessHandle.flush();
    accessHandle.close();

    postMessage({ action: 'cached', transferId, size: offset });
  }
};
```

### Pattern 2: Transfer Manifest Persistence

Store a JSON manifest in IndexedDB alongside the cached file. The manifest tracks which chunks have been uploaded, enabling resume.

```javascript
import { openDB } from 'idb';

const db = await openDB('sgraph-send', 1, {
  upgrade(db) {
    const store = db.createObjectStore('manifests', { keyPath: 'transferId' });
    store.createIndex('by-status', 'status');
  }
});

// Create manifest when transfer starts
async function createManifest(transferId, fileSize, chunkSize) {
  const totalChunks = Math.ceil(fileSize / chunkSize);
  const manifest = {
    transferId,
    fileSize,
    chunkSize,
    totalChunks,
    status: 'uploading',         // 'uploading' | 'paused' | 'completed' | 'failed'
    chunksUploaded: [],          // Array of uploaded chunk indexes
    createdAt: Date.now(),
    updatedAt: Date.now(),
    encryptionIv: null,          // stored if needed for resume
  };
  await db.put('manifests', manifest);
  return manifest;
}

// Update manifest as chunks upload
async function markChunkUploaded(transferId, chunkIndex) {
  const tx = db.transaction('manifests', 'readwrite');
  const manifest = await tx.store.get(transferId);
  manifest.chunksUploaded.push(chunkIndex);
  manifest.updatedAt = Date.now();
  if (manifest.chunksUploaded.length === manifest.totalChunks) {
    manifest.status = 'completed';
  }
  await tx.store.put(manifest);
  await tx.done;
}

// Resume: find incomplete transfers
async function getResumableTransfers() {
  return db.getAllFromIndex('manifests', 'by-status', 'uploading');
}

// Resume: determine which chunks still need uploading
async function getRemainingChunks(transferId) {
  const manifest = await db.get('manifests', transferId);
  if (!manifest) return null;
  const uploaded = new Set(manifest.chunksUploaded);
  const remaining = [];
  for (let i = 0; i < manifest.totalChunks; i++) {
    if (!uploaded.has(i)) remaining.push(i);
  }
  return { manifest, remaining };
}
```

### Pattern 3: Download Chunk Caching

When downloading, store received chunks locally so interrupted downloads can resume.

```javascript
// Worker: store downloaded chunk in OPFS
async function cacheDownloadChunk(transferId, chunkIndex, encryptedData) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(`dl-${transferId}`, { create: true });
  const fileHandle = await dir.getFileHandle(
    `chunk-${chunkIndex}.bin`,
    { create: true }
  );
  const accessHandle = await fileHandle.createSyncAccessHandle();
  accessHandle.write(encryptedData, { at: 0 });
  accessHandle.flush();
  accessHandle.close();
}

// Assemble complete file from chunks
async function assembleFile(transferId, totalChunks) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(`dl-${transferId}`);
  const parts = [];

  for (let i = 0; i < totalChunks; i++) {
    const fileHandle = await dir.getFileHandle(`chunk-${i}.bin`);
    const file = await fileHandle.getFile();
    parts.push(await file.arrayBuffer());
  }

  return new Blob(parts, { type: 'application/octet-stream' });
}
```

### Pattern 4: OPFS for Data, IndexedDB for Metadata (Recommended)

This is the recommended architecture for SGraph Send:

```
OPFS (via Web Worker)           IndexedDB (via idb)
========================        ========================
/transfers/                     manifests store:
  /{transferId}/                  { transferId, status,
    source.bin                      totalChunks, chunkSize,
    chunk-0.enc                     chunksUploaded: [],
    chunk-1.enc                     createdAt, updatedAt }
    chunk-2.enc
                                history store:
/downloads/                       { transferId, direction,
  /{transferId}/                    fileSize, completedAt }
    chunk-0.enc
    chunk-1.enc
    assembled.bin
```

**Why this split:**
- OPFS handles what it's best at: large binary file storage with random access and high throughput
- IndexedDB handles what it's best at: structured metadata with indexes for querying
- Both share the same per-origin quota, so total available storage is the same
- If OPFS is unavailable (very rare in 2026), fall back to IndexedDB for everything

---

## Recommendations for SGraph Send

### Primary Architecture: OPFS + IndexedDB Dual Storage

| Component | Storage | Rationale |
|-----------|---------|-----------|
| Encrypted file chunks (upload cache) | OPFS | Large binary data, 2-7x faster than IndexedDB, random access for chunked reads |
| Encrypted file chunks (download cache) | OPFS | Same reasons, plus streaming assembly |
| Transfer manifests | IndexedDB (via idb) | Structured JSON, needs indexing (by status, by date), small data |
| Transfer history | IndexedDB (via idb) | Query support needed, tiny records |
| User preferences | localStorage | Tiny key-value, always persistent, no eviction |

### Library Choice: idb (~1.19 KB)

Use `idb` by Jake Archibald for IndexedDB access. Reasons:
- Smallest footprint (1.19 KB brotli'd) -- aligns with SGraph Send's zero-dependency frontend philosophy
- Promise/async-await API -- clean, modern code
- Mirrors native IndexedDB closely -- no abstraction surprises
- No framework dependencies
- Well-maintained by a Google Chrome team member

Do **not** use Dexie.js (26 KB gzipped, features we don't need) or localForage (no indexes, unnecessary fallbacks).

### OPFS Usage: Raw API with Thin Worker Wrapper

Write a small dedicated Web Worker (`storage-worker.js`) that handles all OPFS operations. The main thread communicates via `postMessage`. This:
- Keeps the main thread free (no file I/O blocking)
- Enables the synchronous `createSyncAccessHandle()` API (fastest path)
- Centralises file system logic in one place
- Aligns with SGraph Send's Web Components / IFD architecture

### Fallback Strategy

```
Has OPFS? ──yes──> Use OPFS for file data + IndexedDB for metadata
    │
    no (rare in 2026)
    │
    └──> Use IndexedDB for everything (store chunks as Blobs)
```

Detection:
```javascript
const hasOPFS = 'storage' in navigator && 'getDirectory' in navigator.storage;
```

### Storage Quota Management

Before any file storage operation:
1. Call `navigator.storage.estimate()` to check available space
2. If the file exceeds 80% of available quota, warn the user
3. Call `navigator.storage.persist()` on first upload (request non-evictable storage)
4. Handle `QuotaExceededError` gracefully -- inform the user, suggest clearing old transfers

### Private Browsing Consideration

OPFS is mostly unavailable in private browsing. IndexedDB may also be restricted. For SGraph Send, this is acceptable: the core value proposition (zero-knowledge encrypted transfer) works without local caching -- caching is a progressive enhancement for crash resilience and resume, not a requirement.

### Size Limits in Practice

For a typical user on a device with 256 GB disk:
- Chrome: ~153 GB available per origin (60% of disk)
- Firefox (best-effort): ~10 GiB per origin
- Firefox (persistent): ~128 GB per origin
- Safari: ~153 GB per origin

This is more than sufficient for caching multi-GB file transfers. The 10 GiB Firefox best-effort limit is the most restrictive, but requesting persistent storage raises it to 128 GB.

---

## Sources

- [MDN: Storage Quotas and Eviction Criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN: Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [MDN: FileSystemFileHandle.createSyncAccessHandle()](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
- [MDN: StorageManager.estimate()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)
- [MDN: StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [MDN: Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [MDN: Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- [web.dev: The Origin Private File System](https://web.dev/articles/origin-private-file-system)
- [web.dev: Storage for the Web](https://web.dev/articles/storage-for-the-web)
- [web.dev: Persistent Storage](https://web.dev/articles/persistent-storage)
- [RxDB: IndexedDB Max Storage Limit](https://rxdb.info/articles/indexeddb-max-storage-limit.html)
- [RxDB: LocalStorage vs IndexedDB vs Cookies vs OPFS vs WASM-SQLite](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- [RxDB: OPFS RxStorage](https://rxdb.info/rx-storage-opfs.html)
- [RxDB: Solving IndexedDB Slowness](https://rxdb.info/slow-indexeddb.html)
- [Autodesk: Viewer Performance Update -- OPFS Caching](https://aps.autodesk.com/blog/viewer-performance-update-part-2-3-opfs-caching)
- [Chrome Developers: Estimating Available Storage Space](https://developer.chrome.com/blog/estimating-available-storage-space)
- [Chrome Developers: Sync Methods for AccessHandles](https://developer.chrome.com/blog/sync-methods-for-accesshandles)
- [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Can I Use: FileSystemSyncAccessHandle](https://caniuse.com/mdn-api_filesystemsyncaccesshandle)
- [GitHub: jakearchibald/idb](https://github.com/jakearchibald/idb)
- [npm: idb](https://www.npmjs.com/package/idb)
- [Bundlephobia: Dexie.js](https://bundlephobia.com/package/dexie)
- [npm: Dexie.js](https://www.npmjs.com/package/dexie)
- [GitHub: hughfenghen/opfs-tools](https://github.com/hughfenghen/opfs-tools)
- [Dexie.js: StorageManager Guide](https://dexie.org/docs/StorageManager)
- [How to Ask for Persistent Storage Permission in Chrome](https://blog.desgrange.net/post/2025/10/06/how-persistent-storage-permission-chrome.html)
