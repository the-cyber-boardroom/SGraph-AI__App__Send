# File Transfer Engine — Research & Architecture

**Version:** v0.3.12
**Date:** 15 February 2026
**Status:** Research phase — pre-implementation
**Origin brief:** `team/humans/dinis_cruz/briefs/02/15/v0.3.12__briefs__file-transfer-engine-architecture-and-research.md`

---

## What This Is

Self-contained research and architecture documentation for a **pure JavaScript file transfer engine** — multi-runtime (browser, Node.js, Deno, Bun), pluggable adapters, chunked/resumable uploads and downloads.

This folder is designed to be **portable** — it can be moved into its own project repository with no broken references.

---

## Folder Structure

```
file-transfer-engine/
├── README.md                                          ← You are here
├── research/
│   ├── 01-s3-multipart-and-presigned-urls.md          ← P1: AWS S3 native capabilities
│   ├── 02-tus-uppy-resumable-js.md                    ← P1: Existing upload libraries/protocols
│   ├── 03-browser-storage-apis.md                     ← P1: IndexedDB, OPFS, Cache API
│   ├── 04-s3-constraints-and-costs.md                 ← P1: Rate limits, pricing, chunk sizing
│   ├── 05-compression-algorithms.md                   ← P2: JS/WASM compression (fflate, zstd, brotli)
│   ├── 06-chunked-encryption-patterns.md              ← P1: Web Crypto streaming/chunked encryption
│   ├── 07-cloud-providers-comparison.md               ← P2: Azure Blob, GCP, R2, B2
│   ├── 08-webrtc-p2p-transfer.md                      ← P2: Browser-to-browser via WebRTC
│   ├── 09-lambda-streaming-responses.md               ← P3: Lambda response streaming, payload limits
│   └── 10-content-addressable-storage.md              ← P3: Dedup, delta uploads, CAS design
├── architecture/
│   ├── adapter-interfaces.md                          ← Core adapter API design
│   ├── transfer-manifest-schema.md                    ← Manifest JSON schema + lifecycle
│   ├── comparison-matrix.md                           ← Summary: build vs buy vs integrate
│   └── recommendations.md                             ← Final architecture recommendations
```

---

## Reading Order

### Quick overview (15 min)
1. This README
2. [Comparison Matrix](architecture/comparison-matrix.md) — what exists, what to build
3. [Recommendations](architecture/recommendations.md) — what we decided and why

### Full research (60 min)
1. [S3 Multipart & Presigned URLs](research/01-s3-multipart-and-presigned-urls.md) — the primary upload path
2. [tus, Uppy, Resumable.js](research/02-tus-uppy-resumable-js.md) — existing libraries evaluation
3. [Browser Storage APIs](research/03-browser-storage-apis.md) — client-side resilience
4. [S3 Constraints & Costs](research/04-s3-constraints-and-costs.md) — platform limits and pricing
5. [Chunked Encryption](research/06-chunked-encryption-patterns.md) — per-chunk crypto with Web Crypto API
6. [Compression Algorithms](research/05-compression-algorithms.md) — compress before encrypt
7. [Cloud Providers](research/07-cloud-providers-comparison.md) — multi-cloud adapter design
8. [WebRTC P2P](research/08-webrtc-p2p-transfer.md) — browser-to-browser option
9. [Lambda Streaming](research/09-lambda-streaming-responses.md) — bypassing Lambda limits
10. [Content-Addressable Storage](research/10-content-addressable-storage.md) — dedup and delta

### Architecture design
1. [Adapter Interfaces](architecture/adapter-interfaces.md) — the pluggable layer API
2. [Transfer Manifest Schema](architecture/transfer-manifest-schema.md) — single source of truth
3. [Comparison Matrix](architecture/comparison-matrix.md) — decision support
4. [Recommendations](architecture/recommendations.md) — final architecture choices

---

## Research Priority

| Priority | Items | Rationale |
|----------|-------|-----------|
| **P1** | S3 multipart, tus/Uppy/Resumable.js, browser storage, S3 constraints, chunked encryption, adapter interfaces | Foundation decisions — must know before writing code |
| **P2** | Compression algorithms, cloud providers comparison, WebRTC P2P | Important but can be deferred — adapters isolate these choices |
| **P3** | Lambda streaming, content-addressable storage | Future optimisation — architecture should support but not require |

---

## Key Principles (from brief)

1. **Encryption is just a callback** — the engine handles transfer; crypto is a pluggable adapter
2. **Transport-agnostic** — same chunking/progress/retry logic whether uploading to S3, Azure, or via WebRTC
3. **Multi-runtime from day one** — pure JS core, platform adapters injected
4. **Compress before encrypt** — invariant: compressed data encrypts; encrypted data doesn't compress
5. **Three-level progress** — simple bar / stage detail / raw technical — all from the same event stream
6. **No data loss** — build toward cross-session resume via transfer manifest + browser storage

---

## Relationship to SGraph Send

This engine is the core of SGraph Send's upload/download flow but is designed as a **standalone, extractable component**. SGraph Send adds:
- Zero-knowledge encryption policy (mandatory AES-256-GCM)
- Access token authentication
- Transfer metadata and transparency reporting
- The Send UI (upload page, download page, admin console)

The engine itself is encryption-agnostic, storage-agnostic, and UI-agnostic.
