# File Upload Libraries and Protocols: Research for Transfer Engine

**Version:** v0.3.13
**Date:** 2026-02-15
**Role:** Dev (Explorer)
**Purpose:** Decision-support document for selecting or building the file transfer engine

---

## Table of Contents

1. [tus Protocol](#1-tus-protocol)
2. [tus-js-client](#2-tus-js-client)
3. [tus-node-server](#3-tus-node-server)
4. [Uppy](#4-uppy)
5. [Resumable.js](#5-resumablejs)
6. [Flow.js](#6-flowjs)
7. [Comparison Matrix](#7-comparison-matrix)
8. [Evaluation for Our Use Case](#8-evaluation-for-our-use-case)
9. [Recommendation](#9-recommendation)

---

## 1. tus Protocol

**What it is:** An open protocol for resumable file uploads over HTTP, designed as an RFC-like specification. The protocol enables interrupted uploads to resume without re-uploading previous data.

**Protocol version:** 1.0.0 (stable, following SemVer -- no breaking changes expected until 2.0.0)

**Specification:** https://tus.io/protocols/resumable-upload

**IETF standardisation:** The tus team is working with the HTTP working group inside the IETF to make resumable uploads an official internet standard via an Internet Draft ("Resumable Uploads for HTTP").

### Core Protocol

The core protocol handles resuming an interrupted upload. It assumes an upload URL already exists (typically created via the Creation extension).

| Operation | HTTP Method | Purpose |
|-----------|-------------|---------|
| Resume check | `HEAD {upload-url}` | Returns `Upload-Offset` header indicating how many bytes the server has |
| Resume upload | `PATCH {upload-url}` | Sends data from the offset, with `Upload-Offset` and `Content-Type: application/offset+octet-stream` |
| Create upload | `POST {creation-endpoint}` | Creates a new upload resource (Creation extension) |
| Discover | `OPTIONS {endpoint}` | Returns server capabilities: `Tus-Version`, `Tus-Extension`, `Tus-Max-Size` |

### Required Headers

| Header | Direction | Purpose |
|--------|-----------|---------|
| `Tus-Resumable` | Both | Protocol version (must be in every request/response except OPTIONS) |
| `Upload-Offset` | Both | Current byte offset of the upload |
| `Upload-Length` | Request | Total upload size in bytes |
| `Upload-Metadata` | Request | Base64-encoded key-value pairs |
| `Tus-Version` | Response | Comma-separated list of supported versions |
| `Tus-Extension` | Response | Comma-separated list of supported extensions |
| `Tus-Max-Size` | Response | Maximum allowed upload size |
| `X-HTTP-Method-Override` | Request | Allows POST to act as PATCH (for environments that block PATCH) |

### Extensions

All six extensions are optional but widely implemented:

#### 1. Creation
Creates a new upload via `POST`. Server responds with `Location` header containing the upload URL. Supports `Upload-Length` (known size) and `Upload-Defer-Length: 1` (streaming, size unknown).

#### 2. Creation With Upload
Allows sending the first chunk of data in the `POST` creation request body, saving a round-trip.

#### 3. Expiration
Server returns `Upload-Expires` header (RFC 9110 datetime format) indicating when partial upload data will be garbage-collected.

#### 4. Checksum
Client sends `Upload-Checksum` header with algorithm name and Base64-encoded checksum for each PATCH request. Server verifies integrity. Supported algorithms are server-dependent. Also supports trailer-based checksums for streaming scenarios.

#### 5. Termination
Client sends `DELETE` to notify the server that an unfinished upload will not be resumed, allowing the server to reclaim storage.

#### 6. Concatenation
Enables parallel uploads: multiple "partial" uploads can be created independently and then concatenated into a "final" upload via `Upload-Concat: final;url1 url2 url3`. This is the mechanism for parallel chunk uploads.

### Who Uses tus

| Company | Usage |
|---------|-------|
| **Vimeo** | Video upload API |
| **Cloudflare** | Stream uploads > 200MB |
| **Supabase** | Storage resumable uploads (replaced multipart HTTP uploads) |
| **Transloadit** | File processing service (creators of tus) |
| **GitHub** | Large file uploads |
| **Mux** | Video upload API |

### Strengths

- Open, well-specified protocol with clear semantics
- Wide industry adoption and battle-tested at scale
- IETF standardisation in progress
- Language-agnostic (implementations in Go, Node.js, Python, Java, .NET, Elixir, Ruby, PHP)
- Handles all the hard resumability problems (offset tracking, retry semantics, concurrent access)
- Works through proxies and CDNs (HTTP-native)

### Weaknesses

- Requires a server-side tus implementation (cannot do direct client-to-S3 without a tus proxy)
- Protocol overhead for small files (HEAD + PATCH vs. a single PUT)
- Does not handle encryption or compression (must be layered on top)
- The concatenation extension (for parallel uploads) is not universally implemented
- Fingerprinting/URL-storage for resume across sessions can leak metadata

### License

MIT

---

## 2. tus-js-client

**What it is:** The official JavaScript client for the tus resumable upload protocol.

**Repository:** https://github.com/tus/tus-js-client
**npm:** `tus-js-client`
**Current version:** 4.3.1
**License:** MIT

### Key Stats

| Metric | Value |
|--------|-------|
| GitHub stars | ~2,400 |
| Weekly npm downloads | ~315K-380K |
| Bundle size (minified) | ~65 KiB |
| Bundle size (min+gzip) | ~18 KiB |
| Node.js requirement | >= v20 |
| Last publish | ~2025 (v4.3.1) |

### Platform Support

- Browsers (all modern browsers)
- Node.js (v20+)
- React Native
- Apache Cordova

### API Overview

```javascript
import * as tus from 'tus-js-client';

const upload = new tus.Upload(file, {
  // Required
  endpoint: 'https://example.com/files/',

  // Chunk configuration
  chunkSize: Infinity,         // Default: entire file in one PATCH (set only if needed)

  // Retry configuration
  retryDelays: [0, 1000, 3000, 5000],  // 5 attempts with backoff, null to disable

  // Metadata
  metadata: {
    filename: file.name,
    filetype: file.type,
  },

  // Progress callback
  onProgress: (bytesUploaded, bytesTotal) => {
    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
    console.log(`${percentage}%`);
  },

  // Chunk completion (confirmed by server, more reliable than onProgress)
  onChunkComplete: (chunkSize, bytesAccepted, bytesTotal) => {
    // bytesAccepted is confirmed received by server
  },

  // Success callback
  onSuccess: () => {
    console.log('Upload finished:', upload.url);
  },

  // Error callback
  onError: (error) => {
    console.log('Upload failed:', error);
  },

  // Middleware hooks
  onBeforeRequest: async (req) => {
    // Modify request before sending (e.g., add auth headers)
    req.setHeader('Authorization', `Bearer ${await getToken()}`);
  },

  onAfterResponse: async (req, res) => {
    // Process response (e.g., read custom headers, handle 401)
    const customHeader = res.getHeader('X-Custom');
  },

  onShouldRetry: (err, retryAttempt, options) => {
    // Custom retry logic (e.g., don't retry on 403)
    const status = err.originalResponse?.getStatus();
    if (status === 403) return false;
    return true;
  },

  // Resume configuration
  storeFingerprintForResuming: true,   // Store upload URL for resume
  removeFingerprintOnSuccess: true,    // Clean up after success

  // Parallel uploads (concatenation extension)
  parallelUploads: 5,                  // Split into 5 parallel partial uploads

  // HTTP method override (for environments blocking PATCH)
  overridePatchMethod: false,

  // Deferred length (for streams where total size is unknown)
  uploadLengthDeferred: false,

  // Custom HTTP stack (for custom transport)
  httpStack: customStack,

  // Custom URL storage (for custom fingerprint persistence)
  urlStorage: customStorage,
});

// Resume from previous uploads
const previousUploads = await upload.findPreviousUploads();
if (previousUploads.length > 0) {
  upload.resumeFromPreviousUpload(previousUploads[0]);
}

// Start the upload
upload.start();

// Pause the upload
upload.abort();

// Cancel and clean up (with terminate: true)
upload.abort(true);  // Sends DELETE to server (termination extension)
```

### How Resume Works

1. Client generates a **fingerprint** for each file (based on name, size, modification time, endpoint)
2. On `POST` creation, server returns `Location` header with the upload URL
3. Client stores `{fingerprint -> upload URL}` in Web Storage (browser) or filesystem (Node.js)
4. On resume: client retrieves URL via fingerprint, sends `HEAD` to get current `Upload-Offset`
5. Client sends `PATCH` from the offset with remaining data
6. Fingerprint is removed on success (if `removeFingerprintOnSuccess: true`)

### Custom HTTP Stack

tus-js-client supports a pluggable `httpStack` interface, which allows replacing the underlying HTTP transport (XHR in browsers, http module in Node.js) with a custom implementation. This is the extension point for custom transports.

```javascript
// The httpStack interface
const customStack = {
  createRequest: (method, url) => {
    return {
      setHeader: (name, value) => { /* ... */ },
      getHeader: (name) => { /* ... */ },
      setProgressHandler: (handler) => { /* ... */ },
      send: (body) => { /* returns Promise */ },
      abort: () => { /* ... */ },
      getMethod: () => method,
      getURL: () => url,
      getUnderlyingObject: () => { /* ... */ },
    };
  },
};
```

### Parallel Uploads

When `parallelUploads` is set (e.g., `parallelUploads: 5`), the client:
1. Splits the file into N equal-sized parts
2. Creates N partial uploads concurrently
3. Once all complete, creates a final upload using the concatenation extension
4. Server concatenates the parts into one file

**Requirement:** Server must support the `concatenation` extension.

### Retry Behaviour

- `retryDelays: [0, 1000, 3000, 5000]` means: attempt immediately, wait 1s, wait 3s, wait 5s
- Array length = max retry count (4 retries + 1 initial = 5 total attempts)
- `retryDelays: null` disables automatic retry
- `onShouldRetry` provides fine-grained control over which errors trigger retries

---

## 3. tus-node-server

**What it is:** The official Node.js server implementation of the tus protocol.

**Repository:** https://github.com/tus/tus-node-server
**npm packages:** `@tus/server` (v2.3.0), `@tus/s3-store`, `@tus/file-store`, `@tus/gcs-store`
**License:** MIT

### Key Stats

| Metric | Value |
|--------|-------|
| GitHub stars | ~1,100 |
| Current version | 2.3.0 (@tus/server) |
| Node.js requirement | >= 20.19.0 |
| v2.0.0 release | March 2025 |
| TypeScript | Fully typed |

### Storage Backends

| Backend | Package | Production Users |
|---------|---------|-----------------|
| Local disk | `@tus/file-store` | Development, small deployments |
| AWS S3 / S3-compatible | `@tus/s3-store` | Supabase, most production deployments |
| Google Cloud Storage | `@tus/gcs-store` | GCP deployments |
| Azure Blob Storage | `@tus/azure-store` | Azure deployments |

### S3 Store: How it Maps tus to S3 Multipart

The `@tus/s3-store` maps the tus protocol onto S3's native multipart upload API:

| tus Operation | S3 Operation |
|---------------|-------------|
| `POST` (create upload) | `CreateMultipartUpload` + create `.info` object |
| `PATCH` (upload chunk) | `UploadPart` (each PATCH becomes one S3 part) |
| Upload complete | `CompleteMultipartUpload` (assembles all parts) |
| `DELETE` (terminate) | `AbortMultipartUpload` + delete `.info` object |
| `HEAD` (check offset) | `ListParts` to calculate total uploaded bytes |

**Key S3 store configuration:**

```javascript
import { Server } from '@tus/server';
import { S3Store } from '@tus/s3-store';

const server = new Server({
  path: '/files',
  datastore: new S3Store({
    s3ClientConfig: {
      bucket: 'my-bucket',
      region: 'us-east-1',
    },
    // Max concurrent part uploads per file (default: 60)
    maxConcurrentPartUploads: 60,
    // Max parts in a multipart upload (default: 10,000; some providers limit to 1,000)
    maxMultipartParts: 10000,
    // Expiration period in ms
    expirationPeriodInMilliseconds: 6 * 60 * 60 * 1000, // 6 hours
  }),
});
```

**S3 compatibility notes:**
- **Cloudflare R2:** Requires all parts (except last) to have the same size
- **Scaleway:** Limit of 1,000 parts per multipart upload
- **MinIO:** Full S3 compatibility

**Expiration and cleanup:** The S3 store uses a `Tus-Completed` tag on all objects (`.part`, `.info`) to indicate completion status. You can set up an S3 Lifecycle policy to automatically clean up incomplete uploads without needing a CRON job.

### v2.0.0 Runtime Support

tus-node-server v2.0.0 (March 2025) rewrote all handlers to use standard `Request`/`Response` objects, enabling it to run in:

- Node.js (Express, Fastify, Koa, Hapi)
- Next.js, Nuxt, React Router, SvelteKit
- AWS Lambda
- Cloudflare Workers
- Bun
- Deno Deploy

### Distributed Locks

v2.0.0 introduced distributed locking:
- S3-locker based on S3 conditional writes
- GCS-locker (in progress)
- Removes the need for Redis or Postgres for concurrent access control

---

## 4. Uppy

**What it is:** A modular, plugin-based file upload library with optional UI components, maintained by Transloadit.

**Website:** https://uppy.io
**Repository:** https://github.com/transloadit/uppy
**npm:** `uppy` (meta-package), `@uppy/core` (core only)
**Current version:** 5.2.3 (uppy), 5.2.0 (@uppy/core)
**License:** MIT

### Key Stats

| Metric | Value |
|--------|-------|
| GitHub stars | ~30,300 |
| Weekly npm downloads (@uppy/core) | ~263K |
| Weekly npm downloads (uppy meta) | ~24K |
| Node.js support | Limited (primarily browser-focused) |
| Maintained by | Transloadit (commercial company) |

### Architecture: Core + Plugins

Uppy is built around a plugin architecture:

```
@uppy/core (state manager, event emitter, restrictions)
  +-- UI Plugins (optional)
  |     +-- @uppy/dashboard (full-featured UI, Preact-based)
  |     +-- @uppy/drag-drop (minimal drag-drop zone)
  |     +-- @uppy/file-input (file input element)
  |     +-- @uppy/webcam (camera capture)
  |     +-- @uppy/image-editor (crop/rotate)
  +-- Transport Plugins
  |     +-- @uppy/tus (resumable uploads via tus protocol)
  |     +-- @uppy/aws-s3 (direct S3 upload, with optional multipart)
  |     +-- @uppy/xhr-upload (simple XHR/fetch upload)
  |     +-- @uppy/transloadit (managed service)
  +-- Provider Plugins (remote sources, via Companion)
        +-- @uppy/google-drive
        +-- @uppy/dropbox
        +-- @uppy/instagram
        +-- @uppy/url (import from URL)
```

### Transport Plugins in Detail

#### @uppy/tus -- tus Protocol Integration

Wraps `tus-js-client` internally. Provides resumable uploads with all tus features.

```javascript
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

const uppy = new Uppy();
uppy.use(Tus, {
  endpoint: 'https://tusd.example.com/files/',
  retryDelays: [0, 1000, 3000, 5000],
  chunkSize: 5 * 1024 * 1024,
  headers: { Authorization: 'Bearer xxx' },
  onBeforeRequest: (req, file) => {
    // file argument is Uppy-specific addition to tus-js-client API
  },
});
```

#### @uppy/aws-s3 -- Direct S3 Upload (Unified)

As of Uppy 4+, `@uppy/aws-s3` is the unified plugin (replaces the deprecated `@uppy/aws-s3-multipart`).

```javascript
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';

const uppy = new Uppy();
uppy.use(AwsS3, {
  shouldUseMultipart: (file) => file.size > 100 * 1024 * 1024, // Multipart for >100MB
  companionUrl: 'https://companion.example.com/', // OR custom signing functions:
  // getUploadParameters: async (file) => ({ method: 'PUT', url: presignedUrl, headers: {} }),
  // createMultipartUpload: async (file) => ({ uploadId, key }),
  // signPart: async (file, partData) => ({ url: presignedPartUrl }),
  // completeMultipartUpload: async (file, { uploadId, key, parts }) => ({ location }),
  // abortMultipartUpload: async (file, { uploadId, key }) => {},
});
```

**S3 multipart flow:**
1. `createMultipartUpload` -- initiates S3 multipart upload, returns `uploadId`
2. `signPart` -- generates presigned URL for each part
3. Client uploads parts directly to S3 using presigned URLs
4. `completeMultipartUpload` -- finalises the upload on S3
5. `abortMultipartUpload` -- cancels and cleans up (on user cancel)

#### @uppy/xhr-upload -- Simple XHR Upload

For custom server endpoints. No resumability.

```javascript
uppy.use(XHRUpload, {
  endpoint: 'https://api.example.com/upload',
  fieldName: 'file',
  headers: { Authorization: 'Bearer xxx' },
});
```

### Headless Usage (Uppy 5.0)

Uppy 5.0 (announced late 2025) introduced three tiers:

1. **Pre-composed UI** (`<Dashboard />`) -- plug-and-play, not customisable
2. **Headless components** -- smaller composable pieces, style-override friendly
3. **Hooks** -- attach Uppy logic to your own UI components (React, Vue, Svelte)

**Can you use Uppy without any UI?** Yes. `@uppy/core` is a headless state manager. If no UI plugins are loaded, a modern bundler tree-shakes Preact away.

```javascript
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

const uppy = new Uppy({ autoProceed: true });
uppy.use(Tus, { endpoint: 'https://tusd.example.com/files/' });

// Add files programmatically
uppy.addFile({ name: 'test.txt', type: 'text/plain', data: blob });

// Listen to events
uppy.on('progress', (progress) => console.log(`${progress}%`));
uppy.on('upload-success', (file, response) => console.log(file.name, response));
uppy.on('complete', (result) => console.log('Done', result.successful));
```

### Bundle Size

| Package | Unpacked (npm) | Estimated min+gzip |
|---------|---------------|-------------------|
| `@uppy/core` | 369 KiB | ~45-55 KiB (estimated) |
| `@uppy/tus` | — | ~20-25 KiB (wraps tus-js-client) |
| `@uppy/aws-s3` | — | ~15-20 KiB (estimated) |
| `uppy` (full CDN bundle) | — | ~530 KiB minified (not recommended) |

Note: Exact min+gzip sizes for individual Uppy 5.x packages were not available via Bundlephobia at time of research. The full CDN bundle is ~530KB and is explicitly not recommended for production.

### Companion (Server-Side)

Companion is Uppy's Node.js server component:
- Handles OAuth with remote providers (Google Drive, Dropbox, etc.)
- Acts as an S3 signing proxy
- Streams files server-to-server (never stores them)
- Can run standalone or as Express middleware
- Has server-side event emitter for detecting upload start/finish/fail without client dependency

### Node.js Support

Uppy is **primarily browser-focused**. While `@uppy/core` runs in Node.js, the transport plugins (`@uppy/tus`, `@uppy/aws-s3`) are designed for browser environments. The Companion server handles server-side concerns but is a separate application, not a drop-in for uploading from Node.js.

### Strengths

- Extremely popular and well-maintained (30K+ stars, Transloadit-backed)
- Rich plugin ecosystem (UI, providers, transports)
- Headless mode available (Uppy 5.0)
- Built-in S3 presigned URL workflow
- Good progress events and file management

### Weaknesses

- Heavy dependency tree when using UI plugins (Preact)
- Browser-first design; not a natural fit for Node.js/Deno/Bun client-side uploads
- Companion is a separate deployment (adds infrastructure)
- S3 multipart requires a signing server (Companion or custom endpoints)
- Abstracts away transport details, making custom transport harder
- No built-in encryption or compression hooks

---

## 5. Resumable.js

**What it is:** A JavaScript library for chunked, resumable uploads using the HTML5 File API.

**Repository:** https://github.com/23/resumable.js
**npm:** `resumablejs`
**Current version:** 1.1.0
**License:** MIT

### Key Stats

| Metric | Value |
|--------|-------|
| GitHub stars | ~4,700 |
| Weekly npm downloads | ~29K |
| Bundle size (min+gzip) | ~5.4 KiB |
| Last npm publish | ~2017 (8 years ago) |
| Last meaningful commit | September 2018 |
| Open issues (unanswered) | 30+ from 2024-2025 |
| **Maintenance status** | **Effectively unmaintained** |

### How It Works

1. File is split into configurable chunks (default 1MB)
2. Each chunk is uploaded as a separate `multipart/form-data` POST request
3. Chunks include metadata: `resumableChunkNumber`, `resumableChunkSize`, `resumableTotalSize`, `resumableIdentifier`, `resumableFilename`
4. Before uploading, client sends a `GET` request for each chunk to check if the server already has it
5. Server responds `200` (chunk exists, skip) or `404`/`204` (chunk needed, upload it)
6. On resume, client re-checks all chunks via `GET` and only uploads missing ones

### Configuration

```javascript
const r = new Resumable({
  target: '/api/upload',
  chunkSize: 1 * 1024 * 1024,     // 1 MB
  simultaneousUploads: 3,           // Parallel chunk uploads
  testChunks: true,                 // GET before POST (resume check)
  throttleProgressCallbacks: 0.5,   // Progress callback throttle (seconds)
  maxFiles: undefined,              // No file limit
  maxFileSize: undefined,           // No size limit
  permanentErrors: [400, 404, 415, 500, 501],
  maxChunkRetries: 3,
  chunkRetryInterval: 500,          // ms between retries
});

// Events
r.on('fileAdded', (file, event) => { /* ... */ });
r.on('fileProgress', (file, message) => { /* ... */ });
r.on('fileSuccess', (file, message) => { /* ... */ });
r.on('fileError', (file, message) => { /* ... */ });
r.on('progress', () => { /* overall progress */ });
r.on('complete', () => { /* all files done */ });
r.on('pause', () => { /* upload paused */ });

// Control
r.upload();    // Start
r.pause();     // Pause
r.cancel();    // Cancel
r.isUploading(); // Check status
r.progress();    // Get progress (0-1)
```

### Server-Side Contract

The server must implement:
- `GET /upload` with query params for chunk metadata -> respond 200 (exists) or 404 (needed)
- `POST /upload` with multipart/form-data containing chunk data + metadata
- Server must track which chunks have been received and reassemble the file

**This is a custom protocol** -- there is no formal specification. Each server implementation must match Resumable.js's expectations.

### Resumability Approach

The `testChunks: true` approach sends a `GET` request per chunk to check existence before uploading. For a 1GB file with 1MB chunks, this means up to 1,024 GET requests on resume. This is notably inefficient compared to tus's single `HEAD` request that returns the offset.

### Browser Support

- Requires HTML5 File API (`File`, `Blob`, `FileList`, `FileReader`)
- No Node.js support (browser-only)
- No TypeScript types (community `@types/resumablejs` exists but is minimal)

### Comparison with tus

| Aspect | Resumable.js | tus |
|--------|-------------|-----|
| Protocol | Custom (GET per chunk) | Open standard (HEAD for offset) |
| Resume efficiency | O(n) GET requests for n chunks | O(1) HEAD request |
| Server implementations | Must build custom | 20+ implementations available |
| Parallel chunks | Yes (native) | Yes (via concatenation extension) |
| Specification | None (README is the spec) | Formal protocol specification |
| Maintenance | Unmaintained since 2018 | Actively maintained |

---

## 6. Flow.js

**What it is:** A fork/successor of Resumable.js with additional features and test coverage.

**Repository:** https://github.com/flowjs/flow.js
**npm:** `@flowjs/flow.js`
**Current version:** 2.14.1
**License:** MIT

### Key Stats

| Metric | Value |
|--------|-------|
| GitHub stars | ~3,000 |
| Weekly npm downloads | ~16,700 |
| Last npm publish | ~June 2019 (6 years ago) |
| **Maintenance status** | **Inactive** |

### Differences from Resumable.js

| Feature | Resumable.js | Flow.js |
|---------|-------------|---------|
| Test suite | Minimal | Jasmine + Karma (comprehensive) |
| Folder drag-drop | No | Yes |
| Upload speed estimation | No | Yes |
| Time remaining | No | Yes |
| Per-file pause/resume | No | Yes |
| `allowDuplicateUploads` | No | Yes |
| `changeRawDataBeforeSend` | No | Yes (useful for GCS) |
| Code style | Inconsistent | Google JS Style Guide |

### Same Fundamental Approach

Flow.js uses the same chunk-and-check protocol as Resumable.js:
- Splits files into chunks
- `GET` per chunk to test existence (same O(n) inefficiency)
- `POST multipart/form-data` per chunk
- No formal protocol specification

### Node.js Support

Browser-only. No Node.js support.

### Framework Bindings

- `@flowjs/ng-flow` -- AngularJS binding
- `@flowjs/ngx-flow` -- Angular binding

### Assessment

Flow.js is a better-engineered version of Resumable.js, but it shares the same fundamental limitations (custom protocol, no spec, per-chunk GET checking) and is now also inactive. The ~16.7K weekly downloads suggest ongoing use in legacy projects, but no new development should adopt it.

---

## 7. Comparison Matrix

| Feature | tus-js-client | Uppy + tus | Uppy + S3 multipart | Resumable.js | Flow.js | Build from scratch |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Resumable uploads** | Yes (protocol-native) | Yes (via tus) | Yes (S3 multipart) | Yes (chunk-check) | Yes (chunk-check) | Must implement |
| **Parallel chunks** | Yes (concatenation ext) | Yes (via tus) | Yes (S3 parts) | Yes (native) | Yes (native) | Must implement |
| **Browser support** | All modern | All modern | All modern | HTML5 File API | HTML5 File API | Must implement |
| **Node.js support** | Yes (v20+) | Limited | No (browser signing) | No | No | Full control |
| **Deno/Bun support** | Untested | No | No | No | No | Full control |
| **S3 direct upload** | No (needs tus proxy) | No (needs tus proxy) | Yes (presigned URLs) | No | No | Yes |
| **Progress events** | `onProgress` + `onChunkComplete` | `progress` event | `progress` event | `fileProgress` event | `fileProgress` event | Must implement |
| **Retry logic** | Configurable backoff array | Via tus | Per-part retry | `maxChunkRetries` | `maxChunkRetries` | Must implement |
| **Bundle size (min+gz)** | ~18 KiB | ~65-75 KiB (core+tus) | ~60-70 KiB (core+s3) | ~5.4 KiB | ~5.5 KiB (est.) | 0 (our code) |
| **Encryption hook** | `onBeforeRequest` (limited) | No built-in hook | No built-in hook | No | `changeRawDataBeforeSend` | Native |
| **Compression hook** | No | No | No | No | No | Native |
| **Custom transport** | `httpStack` interface | Plugin system | Plugin system | XHR only | XHR only | Native |
| **Pluggable storage** | `urlStorage` interface | Via plugin config | Via signing functions | Server-side only | Server-side only | Native |
| **Pause / Resume / Cancel** | `abort()` / `start()` / `abort(true)` | `pauseResume()` / `cancelAll()` | `pauseResume()` / `cancelAll()` | `pause()` / `upload()` / `cancel()` | `pause()` / `upload()` / `cancel()` | Must implement |
| **Transfer manifest** | No (URL-based state) | No (Uppy state object) | No (Uppy state object) | No | No | Native |
| **Protocol specification** | Formal (tus 1.0.0) | Formal (tus 1.0.0) | S3 Multipart API | None (README) | None (README) | Ours |
| **License** | MIT | MIT | MIT | MIT | MIT | N/A |
| **Maintenance** | Active | Active | Active | Unmaintained (2018) | Inactive (2019) | N/A |

---

## 8. Evaluation for Our Use Case

Our transfer engine has seven hard requirements. Here is how each library scores.

### Requirement 1: Client-Side Encryption (compress -> encrypt -> upload pipeline)

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | Partial | Accepts `Blob`/`ReadableStream` as input. We can compress+encrypt into a Blob and hand it to tus. But tus sees the encrypted blob as opaque data -- there is no mid-pipeline hook. Chunked encryption would require encrypting each chunk separately and managing IVs ourselves. |
| Uppy + tus | Partial | Same as above. Uppy adds files as blobs. `@uppy/compressor` exists but only does image compression. No encryption plugin. |
| Uppy + S3 multipart | Partial | Same blob-passing approach. Each S3 part would need to be independently encrypted, or the entire file encrypted first then split. |
| Resumable.js | No | No stream/transform support. Browser-only. Chunk data is sent via multipart/form-data with no pre-processing hook (except Flow.js's `changeRawDataBeforeSend`). |
| Flow.js | Partial | `changeRawDataBeforeSend` could theoretically encrypt each chunk, but the API is rudimentary and not designed for async crypto operations. |
| Build from scratch | **Full** | Complete control over the compress->encrypt->chunk->upload pipeline. Can use Web Streams API for zero-copy streaming transforms. |

**Verdict:** No library natively supports our encrypt-before-upload pipeline. All require workarounds. Building from scratch gives us the cleanest integration.

### Requirement 2: Browser AND Node.js/Deno/Bun Support

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | Good | Browser + Node.js (v20+). Deno/Bun untested but plausible via Node compat layers. |
| Uppy | Poor | Browser-first. @uppy/core runs in Node but transport plugins assume browser APIs. |
| Resumable.js | No | Browser-only (HTML5 File API dependency). |
| Flow.js | No | Browser-only. |
| Build from scratch | **Full** | Use `fetch()` (universal) and `ReadableStream` (universal). Target Web API standards that work everywhere. |

**Verdict:** tus-js-client is the only existing library with real cross-runtime support. Building from scratch using Web API standards (fetch, ReadableStream, Web Crypto) gives the broadest runtime coverage.

### Requirement 3: Direct-to-S3 Upload (presigned URLs)

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | No | tus protocol requires a tus server. Cannot upload directly to S3 with presigned URLs. |
| Uppy + tus | No | Same -- tus proxy needed between client and S3. |
| Uppy + S3 multipart | **Yes** | Built for this. `createMultipartUpload` / `signPart` / `completeMultipartUpload` functions can be provided to use your own presigned URL generator. |
| Resumable.js | No | Custom protocol, not S3-compatible. |
| Flow.js | No | Same. |
| Build from scratch | **Yes** | Full control over presigned URL workflow. |

**Verdict:** Only Uppy's S3 plugin and building from scratch support direct-to-S3. tus always requires a server-side component between client and storage.

### Requirement 4: Granular Progress Events (three-level progress)

Our three levels: overall transfer, per-file, per-chunk.

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | Partial | `onProgress` (bytes sent, unreliable) + `onChunkComplete` (server-confirmed). Per-upload only, no multi-file orchestration. |
| Uppy | Good | `progress` (overall %), `upload-progress` (per-file), no per-chunk. Uppy manages multi-file state. |
| Resumable.js | Partial | `progress` (overall), `fileProgress` (per-file), no per-chunk callback. |
| Flow.js | Partial | Same as Resumable.js plus upload speed / time remaining. |
| Build from scratch | **Full** | Emit events at all three levels with custom payload. |

**Verdict:** No library provides all three levels natively. Building from scratch is the only way to get the exact event granularity we need.

### Requirement 5: Pause / Resume / Cancel

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | **Yes** | `abort()` pauses, `start()` resumes, `abort(true)` cancels with server cleanup. |
| Uppy | **Yes** | `pauseResume(fileID)`, `cancelAll()`, `removeFile(fileID)`. |
| Resumable.js | **Yes** | `pause()`, `upload()`, `cancel()`. |
| Flow.js | **Yes** | Same + per-file pause/resume. |
| Build from scratch | Must implement | AbortController + state tracking. Well-understood patterns. |

**Verdict:** All libraries handle this well. Not a differentiator.

### Requirement 6: Pluggable Transport (S3, Azure, GCP, WebRTC, Lambda)

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | Partial | `httpStack` interface allows custom HTTP transport, but it's still the tus protocol semantics. Cannot swap to S3 presigned URL or WebRTC transport. |
| Uppy | Partial | Plugin system supports tus, S3, XHR. But adding WebRTC or Lambda transports requires writing a full Uppy plugin conforming to their internal API. |
| Resumable.js | No | XHR hard-coded. |
| Flow.js | No | XHR hard-coded. |
| Build from scratch | **Full** | Define a `Transport` interface. Implement S3Transport, TusTransport, WebRTCTransport, etc. |

**Verdict:** Existing libraries are locked to their protocol semantics. Our transport abstraction (S3, Azure, GCP, WebRTC, Lambda) requires a custom `Transport` interface that none of them provide.

### Requirement 7: Transfer Manifest (our custom state tracking)

The transfer manifest tracks: file metadata, chunk states, encryption parameters, compression config, transport config, retry history, timing data.

| Library | Score | Notes |
|---------|-------|-------|
| tus-js-client | No | State is a `{fingerprint -> URL}` map. No rich manifest. |
| Uppy | Partial | Uppy's internal state object tracks file status, but it is not serialisable as a manifest and lacks our custom fields. |
| Resumable.js | No | No state persistence beyond in-memory chunk tracking. |
| Flow.js | No | Same. |
| Build from scratch | **Full** | Manifest is a first-class data structure. Serialise/deserialise to JSON. Persist to IndexedDB/filesystem. |

**Verdict:** The transfer manifest is a custom concept. No library supports it. Must be built from scratch regardless.

### Summary Scorecard

| Requirement | tus | Uppy+tus | Uppy+S3 | Resumable.js | Flow.js | Scratch |
|-------------|:---:|:--------:|:-------:|:------------:|:-------:|:-------:|
| 1. Client-side encryption | Partial | Partial | Partial | No | Partial | **Full** |
| 2. Cross-runtime | Good | Poor | Poor | No | No | **Full** |
| 3. Direct-to-S3 | No | No | **Yes** | No | No | **Full** |
| 4. Three-level progress | Partial | Good | Good | Partial | Partial | **Full** |
| 5. Pause/Resume/Cancel | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | Must build |
| 6. Pluggable transport | Partial | Partial | Partial | No | No | **Full** |
| 7. Transfer manifest | No | No | No | No | No | **Full** |

---

## 9. Recommendation

### What to Build vs. What to Borrow

**Build from scratch: the transfer engine core.** None of the existing libraries satisfy more than 3 of our 7 requirements. The combination of client-side encryption, cross-runtime support, pluggable transport, and the transfer manifest is unique to our use case. Attempting to bend tus-js-client or Uppy to fit would result in more wrapper code than actual library usage.

**Borrow concepts, not code:**

| Concept | Source | What to take |
|---------|--------|-------------|
| Resumability via offset | tus protocol | HEAD-to-check-offset, PATCH-from-offset is elegant. Our S3 transport can use `ListParts`; our custom transport can use the same HEAD/PATCH pattern. |
| Retry with backoff array | tus-js-client | `retryDelays: [0, 1000, 3000, 5000]` is a clean API. Adopt this exact pattern. |
| `onBeforeRequest` / `onAfterResponse` hooks | tus-js-client | Middleware pattern for transport-level hooks. |
| Presigned URL S3 multipart workflow | Uppy `@uppy/aws-s3` | The `createMultipartUpload` / `signPart` / `completeMultipartUpload` function interface is the right abstraction for S3 direct upload. |
| `httpStack` pluggable transport | tus-js-client | Interface pattern for swappable HTTP backends. Extend to cover non-HTTP transports (WebRTC). |
| Fingerprinting for resume | tus-js-client | Content-hash-based fingerprinting for matching uploads across sessions. |
| `shouldUseMultipart` conditional | Uppy S3 | Smart threshold for when to use multipart vs. single PUT. Adopt for our `TransportStrategy` selection. |

### What NOT to Do

1. **Do not adopt tus as our wire protocol.** It requires a tus-compatible server between client and storage. We want direct-to-S3 and pluggable transports.
2. **Do not use Uppy as a dependency.** Its value is in the UI and plugin ecosystem, which we do not need (we use IFD Web Components). The transport layer alone is not worth the dependency.
3. **Do not use Resumable.js or Flow.js.** Both are unmaintained and use an inefficient per-chunk GET checking approach.
4. **Do not reinvent retry/backoff logic.** The patterns from tus-js-client are proven and should be adopted directly.

### Potential Future Integration

If we later want to support tus-compatible endpoints (e.g., Cloudflare Stream, Supabase Storage), we could:
- Implement a `TusTransport` that speaks the tus protocol
- Use tus-js-client as a dependency inside that transport (it is small at ~18 KiB gzipped)
- Or implement the tus HEAD/PATCH semantics directly (the protocol is simple enough)

Similarly, if we want to offer an Uppy plugin for third-party integrators:
- Build an `@uppy/sgraph-send` transport plugin
- Wraps our transfer engine as an Uppy-compatible uploader
- This is a distribution concern, not an architecture concern

---

## Appendix: Package Data Summary

| Package | Version | npm Weekly DL | GitHub Stars | Min+Gzip | Last Update | License |
|---------|---------|:------------:|:------------:|:--------:|:-----------:|:-------:|
| tus-js-client | 4.3.1 | ~350K | ~2,400 | ~18 KiB | 2025 | MIT |
| @tus/server | 2.3.0 | — | ~1,100 (repo) | N/A (server) | Feb 2026 | MIT |
| @tus/s3-store | latest | — | (same repo) | N/A (server) | Feb 2026 | MIT |
| @uppy/core | 5.2.0 | ~263K | ~30,300 (repo) | ~50 KiB (est.) | Feb 2026 | MIT |
| @uppy/tus | 5.x | — | (same repo) | ~22 KiB (est.) | Feb 2026 | MIT |
| @uppy/aws-s3 | 5.0.2 | — | (same repo) | ~18 KiB (est.) | Jan 2026 | MIT |
| resumablejs | 1.1.0 | ~29K | ~4,700 | ~5.4 KiB | 2017 | MIT |
| @flowjs/flow.js | 2.14.1 | ~16.7K | ~3,000 | ~5.5 KiB (est.) | 2019 | MIT |

---

*Research conducted 2026-02-15. Data sourced from npm, GitHub, Bundlephobia, tus.io, uppy.io, and web search results. Bundle sizes marked (est.) are estimates where Bundlephobia data was not directly accessible.*
