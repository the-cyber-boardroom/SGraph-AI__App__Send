# Architecture Recommendations

**Version:** v0.3.12
**Date:** 15 February 2026
**Status:** Final recommendations from research phase

---

## 1. What to Build

Build a **pure JavaScript file transfer engine** with pluggable adapters. The engine handles chunking, manifest management, retry, resume, progress events, and orchestration. Platform-specific capabilities (storage, crypto, compression, transport, cache, UI) are injected via adapter interfaces.

**Name suggestion:** `@sgraph/transfer-engine`

---

## 2. Implementation Phases (Updated from Brief)

### Phase 1: Core Engine + CLI (Explorer — near-term)

**Goal:** Working chunked upload/download with tests, runnable from command line.

| Component | What to Build | Key Decisions |
|-----------|---------------|---------------|
| Core engine | Chunking, manifest lifecycle, retry, progress events | 4 MB default chunk size, dynamic sizing |
| Transfer manifest | JSON schema v1, status lifecycle, chunk tracking | See `transfer-manifest-schema.md` |
| S3 storage adapter | Presigned URL generation, multipart lifecycle | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Node.js crypto adapter | Per-chunk AES-256-GCM via `crypto.subtle` | Counter-derived IVs, AAD binding |
| Node.js transport adapter | `fetch` or `http` for chunk upload/download | Per-chunk retry with exponential backoff |
| Filesystem cache adapter | Write chunks to local disk for tests | Simple file I/O |
| Memory cache adapter | In-memory chunk storage for unit tests | Map-based |
| CLI tool | `sgraph-send upload`, `download`, `status`, `bench` | Commander.js or built-in `parseArgs` |
| Test suite | Full upload/download cycle against local storage | No mocks, no patches, real in-memory stack |

**Deliverable:** `npx sgraph-send upload ./file.pdf --compress --encrypt` works end-to-end.

### Phase 2: Browser Integration (Explorer)

| Component | What to Build |
|-----------|---------------|
| Browser crypto adapter | Web Crypto API (same interface as Node.js — `crypto.subtle` is universal) |
| Browser transport adapter | XHR-based (for upload progress tracking) |
| OPFS cache adapter | Store encrypted chunks in Origin Private File System via Web Worker |
| IndexedDB cache adapter | Store transfer manifests and metadata |
| DOM progress adapter | Three-level progress display (simple bar / stages / technical) |
| `beforeunload` guard | Prevent accidental navigation during upload |
| Pause / resume / cancel | UI controls wired to engine methods |
| Integration with SGraph Send UI | Replace current single-blob upload/download |

**Deliverable:** Large file upload/download works in the browser with progress, resume, and crash resilience.

### Phase 3: Advanced Features (Explorer)

| Component | What to Build |
|-----------|---------------|
| Compression pipeline | compress → encrypt → upload (CompressionStream default, fflate upgrade) |
| Auto-skip detection | Magic bytes + content-type to skip already-compressed files |
| Streaming mode | Download starts before upload finishes (manifest-driven) |
| Live upload status on download page | Downloader polls manifest, shows upload progress |
| Bandwidth throttling | Background mode, custom throttle |
| WebRTC transport adapter | P2P when both parties online, S3 fallback |
| Multi-file bundling | Package multiple small files into one transfer |

### Phase 4: Optimization (Villager)

| Component | What to Build |
|-----------|---------------|
| Content-addressable storage | Hash-based chunk keys, within-transfer dedup |
| Content-defined chunking | FastCDC for delta upload capability |
| R2 cost optimization | Switch storage backend to Cloudflare R2 |
| CloudFront integration | Signed URLs for download, edge caching |
| Performance profiling | Benchmark chunk sizes, parallelism, compression |
| WASM acceleration | Only if profiling reveals specific bottleneck |

---

## 3. Key Architecture Principles

### 3.1 Encryption is Just a Callback

The engine's job is getting files from A to B. Encryption is a pluggable adapter — the engine calls `cryptoAdapter.encryptChunk()` and `cryptoAdapter.decryptChunk()` at the right points in the pipeline. SGraph Send configures AES-256-GCM. Another product could use a different algorithm or no encryption at all.

### 3.2 Transport-Agnostic

The same chunking, progress, and retry logic works whether chunks go to S3, Azure, R2, through Lambda, or via WebRTC. The `StorageAdapter` generates URLs; the `TransportAdapter` moves bytes. The engine doesn't know or care which cloud provider is behind the adapter.

### 3.3 Manifest is the Source of Truth

Every decision the engine makes — which chunks to upload, which to retry, what progress to report, whether resume is possible — comes from reading the transfer manifest. The manifest is a JSON document, stored server-side, readable by both uploader and downloader.

### 3.4 Compress Before Encrypt (Invariant)

Pipeline order: **compress → encrypt → upload** and **download → decrypt → decompress**. Encrypted data is random and does not compress. This must be enforced at the engine level, not left to adapter implementations.

### 3.5 Progressive Enhancement

- No compression available? Skip it. Transfer still works.
- No OPFS? Fall back to IndexedDB. Transfer still works.
- No Web Workers? Run encryption on main thread. Transfer still works (slower).
- No presigned URLs (local dev)? Upload through Lambda. Transfer still works (<5 MB).

---

## 4. Critical Path for Phase 1

The minimum viable file transfer engine needs these components:

```
TransferEngine (orchestrator)
├── TransferManifest (state management)
├── ChunkManager (split file, track chunks)
├── S3StorageAdapter (presigned URLs, multipart)
├── FetchTransportAdapter (HTTP upload/download)
├── WebCryptoAdapter (per-chunk AES-256-GCM)
├── MemoryCacheAdapter (for tests)
└── ConsoleProgressAdapter (CLI output)
```

**Estimated scope:** ~2,000-3,000 lines of pure JavaScript + ~1,500 lines of tests.

---

## 5. What NOT to Build (Yet)

| Capability | Why Not Now | When |
|-----------|-------------|------|
| Azure adapter | No Azure customers | When needed |
| WebRTC P2P | Complexity, S3 is simpler | Phase 3 |
| Content-defined chunking | Fixed-size is sufficient for Phase 1 | Phase 4 |
| Cross-transfer dedup | Conflicts with zero-knowledge | Likely never |
| WASM acceleration | No proven bottleneck | If profiling shows need |
| Folder sync | Requires CAS + CDC foundation | Phase 4+ |
| Lambda streaming | Presigned URLs are better for our model | Likely never |
| Custom compression format | Standard algorithms are sufficient | Never |

---

## 6. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| OPFS not available in older browsers | Reduced resilience | IndexedDB fallback |
| S3 presigned URL expiry during long upload | Chunks fail | Re-request URLs for expired parts |
| Large WASM bundles (zstd, brotli) | Slow initial load | Lazy-load compression modules |
| XHR deprecation (long-term) | Need new progress mechanism | Fetch upload progress is being standardized |
| S3 rate limiting under high concurrency | 503 errors | Hash-based prefix distribution + backoff |
| WebRTC NAT traversal failures | P2P doesn't connect | Always have S3 fallback |

---

## 7. Success Criteria for Phase 1

- [ ] Upload a 100 MB file from CLI to S3 in chunks with progress
- [ ] Download the same file and verify integrity (SHA-256 matches)
- [ ] Interrupt upload at 50%, resume, complete successfully
- [ ] Run full test suite against in-memory storage (no AWS required)
- [ ] Encrypt/decrypt with per-chunk AES-256-GCM, verify AAD binding
- [ ] Transfer manifest tracks state correctly through full lifecycle
- [ ] Same core engine code runs in Node.js and browser (adapters differ)
- [ ] CLI `bench` command measures throughput at different chunk sizes
