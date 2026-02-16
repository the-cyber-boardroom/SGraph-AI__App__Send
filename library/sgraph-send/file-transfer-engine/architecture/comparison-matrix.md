# Comparison Matrix — Build vs Buy vs Integrate

**Version:** v0.3.12
**Date:** 15 February 2026
**Status:** Decision support document

---

## Executive Summary

After evaluating 5 existing libraries, 5 cloud storage providers, 6 compression options, and 3 browser storage APIs, the recommendation is:

**Build the transfer engine core from scratch**, borrowing proven patterns from tus-js-client and Uppy, with S3-compatible storage as the primary backend and pluggable adapters for everything else.

No existing library satisfies more than 3 of our 7 hard requirements. The combination of client-side encryption pipeline, multi-runtime support, pluggable multi-cloud transport, and the transfer manifest concept is unique to our use case.

---

## 1. Upload Libraries — Build vs Adopt

### Requirements Scorecard

| Requirement | tus-js-client | Uppy + tus | Uppy + S3 | Resumable.js | Flow.js | Build from scratch |
|-------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Compress → encrypt → upload pipeline | None | None | None | None | None | **Full** |
| Multi-runtime (browser + Node + Deno + Bun) | Partial | Browser only | Browser only | Browser only | Browser only | **Full** |
| Direct-to-S3 via presigned URLs | None | Via plugin | **Yes** | None | None | **Full** |
| Granular 3-level progress events | Partial | Partial | Partial | Basic | Basic | **Full** |
| Pause / resume / cancel | **Yes** | **Yes** | Partial | Partial | Partial | **Full** |
| Pluggable transport (S3, Azure, WebRTC) | Custom httpStack | Via plugins | S3 only | None | None | **Full** |
| Transfer manifest (our state model) | None | None | None | None | None | **Full** |
| **Score (out of 7)** | **2** | **2.5** | **2.5** | **1** | **1** | **7** |

### Decision: **Build from scratch**

**Borrow from tus-js-client:**
- Retry backoff array pattern (`[0, 1000, 3000, 5000]`)
- `httpStack` interface (pluggable transport)
- `fingerprint` function for upload deduplication
- `onBeforeRequest` / `onAfterResponse` middleware hooks

**Borrow from Uppy's S3 plugin:**
- `getUploadParameters()` / `createMultipartUpload()` function interfaces
- `shouldUseMultipart(file)` conditional logic
- Companion server pattern for presigned URL generation

---

## 2. Cloud Storage — Provider Comparison

### Cost per 1 GB Transfer (10 MB chunks, 1-day storage, 1 download)

| Provider | Storage | Upload Requests | Download Requests | Egress | **Total** |
|----------|---------|-----------------|-------------------|--------|-----------|
| **Cloudflare R2** | $0.00002 | $0.00045 | $0.00004 | **$0.00** | **$0.0005** |
| Backblaze B2 | $0.00001 | $0.00050 | $0.00040 | $0.01 | $0.011 |
| Azure Blob (Hot) | $0.00003 | $0.00065 | $0.00004 | $0.087 | $0.088 |
| **AWS S3** | $0.00004 | $0.00050 | $0.00004 | $0.09 | **$0.091** |
| GCS Standard | $0.00003 | $0.00050 | $0.00004 | $0.12 | $0.121 |

**Key finding: Egress is 98-99% of per-transfer cost.** R2's zero egress makes it 95x cheaper than S3.

### Capability Comparison

| Capability | AWS S3 | Azure Blob | GCS | R2 | B2 |
|-----------|--------|-----------|-----|----|----|
| Multipart / block upload | 10K parts | 50K blocks | Resumable | 10K parts (S3) | 10K parts (S3) |
| Max object size | 5 TB | 190.7 TB | 5 TB | 5 TB | 10 TB |
| Presigned / SAS URLs | Yes | Yes (SAS) | Yes | Yes (S3) | Yes (S3) |
| Browser-direct upload | Yes | Yes | Yes | Yes | Yes |
| S3 API compatible | Native | **No** | Partial (XML) | **Yes** | **Yes** |
| Transfer Acceleration | Yes ($0.04/GB) | CDN | CDN | Auto (200+ PoPs) | No |
| JS SDK | @aws-sdk | @azure/storage-blob | @google-cloud/storage | @aws-sdk | @aws-sdk |

### Decision: **S3 adapter first, configurable endpoint**

- A single S3 adapter covers AWS S3 + Cloudflare R2 + Backblaze B2 + GCS (XML API) — 4 of 5 providers
- Azure needs its own adapter (only when enterprise Azure deployments required)
- Default: AWS S3 (existing infrastructure). Switch to R2 for cost optimization with config change only.

---

## 3. Compression — Algorithm Comparison

### Performance Estimates (10 MB text/JSON)

| Algorithm | Library | Ratio | Compress Speed | Bundle Size | Streaming | Multi-runtime |
|-----------|---------|-------|----------------|-------------|-----------|---------------|
| gzip | **CompressionStream** | ~70% | ~100 MB/s | **0 KB (native)** | Yes | Browser + Node |
| gzip | **fflate** | ~70% | ~150 MB/s | ~8 KB | Yes | All runtimes |
| zstd | **zstd-wasm** | ~75% | ~200 MB/s | ~300 KB (WASM) | Partial | All runtimes |
| zstd | **CompressionStream** | ~75% | ~200 MB/s | **0 KB (native)** | Yes | Chrome 125+ only |
| brotli | **brotli-wasm** | ~78% | ~30 MB/s | ~680 KB (WASM) | No | All runtimes |
| lz4 | **lz4js** | ~55% | ~400 MB/s | ~15 KB | No | All runtimes |

*Note: Already-compressed files (JPEG, MP4, ZIP) get ~0% compression — engine must auto-detect and skip.*

### Decision: **Layered approach**

1. **Default (zero dependency):** `CompressionStream` API with gzip — works in all modern browsers and Node.js, no bundle cost
2. **Better compression:** fflate as optional upgrade — 8 KB, streaming, all runtimes, ~70% ratio on text
3. **Strong compression (Phase 3):** zstd-wasm for large files on slow connections — best ratio-to-speed trade-off
4. **Auto-skip:** Detect already-compressed files via magic bytes + content-type hint, skip compression entirely

---

## 4. Browser Storage — Resilience Strategy

| Feature | IndexedDB | OPFS | Cache API | localStorage |
|---------|-----------|------|-----------|--------------|
| Max storage | 60-80% disk | 60-80% disk | 60-80% disk | 5-10 MB |
| Binary data | Yes (Blob/ArrayBuffer) | Yes (native file) | Yes (Response) | No (strings) |
| Random access | No (full read/write) | **Yes (seek + range)** | No | No |
| Performance (large files) | Good (~45 MB/s write) | **Excellent (2-7x faster)** | N/A | Terrible |
| Browser support | Universal | Good (all modern since 2023) | Universal | Universal |

### Decision: **Dual-storage pattern**

- **OPFS** (via Web Worker) for large binary data — encrypted file chunks, 2-7x faster than IndexedDB
- **IndexedDB** (via `idb` library, ~1 KB) for structured metadata — transfer manifests, chunk status, history
- **Fallback:** If OPFS unavailable, store chunks as Blobs in IndexedDB

---

## 5. Encryption — Per-Chunk Strategy

| Aspect | Current (single-blob) | New (per-chunk) |
|--------|----------------------|-----------------|
| Unit | Entire file | Individual chunk |
| IV strategy | Single random IV | Counter-derived (chunk index in last 4 bytes) |
| AAD | None | `{chunk_index, total_chunks, transfer_id}` |
| Memory usage | Entire file | One chunk at a time |
| Parallel encrypt | No | Yes |
| Resume after failure | Start over | Continue from last chunk |
| Overhead per chunk | N/A | 28 bytes (12 IV + 16 tag) |
| Multi-runtime | Web Crypto only | `crypto.subtle` — all runtimes |

### Decision: **Per-chunk AES-256-GCM with counter-derived IVs and AAD**

- Same key for all chunks within a file (generated once per transfer)
- Counter-derived IVs: deterministic, no collision risk, simpler than random
- AAD prevents chunk reordering, deletion, duplication
- Backward compatible: `total_chunks == 1` with no AAD = legacy format

---

## 6. Transport — Download Path

| Path | Max Size | Auth | Egress Cost | Latency | Lambda Cost |
|------|----------|------|-------------|---------|-------------|
| **S3 Presigned URL** | 5 TB | Time-limited URL | S3 egress | Low | ~$0.00 |
| **CloudFront Signed URL** | 5 TB | Signed URL/Cookie | CF egress (cheaper) | Lower | ~$0.00 |
| Lambda (buffered) | 6 MB | Custom | S3 + Lambda | Higher | Duration-based |
| Lambda (streaming) | 200 MB | IAM | S3 + Lambda | Medium | Duration-based |

### Decision: **Presigned URLs for both upload and download**

- Lambda generates URLs and manages state only — never touches file data
- Small file fallback (<5 MB): keep current Lambda-through path for simplicity
- Lambda streaming: not needed (zero-knowledge model means no server-side processing)

---

## 7. WebRTC P2P — Phase 3 Option

| Aspect | WebRTC P2P | S3 Direct |
|--------|------------|-----------|
| Server bandwidth cost | Zero (or TURN: $0.05/GB) | S3 egress ($0.09/GB) |
| Requires both online | Yes | No |
| Throughput | 10-30 MB/s typical | 50-200+ MB/s |
| Reliability | Depends on NAT | Very high (S3 SLA) |
| Implementation complexity | Medium-High | Low-Medium |

### Decision: **Phase 3, not Phase 1**

- S3 direct is simpler, faster, and more reliable
- WebRTC is a cost optimization for when both parties are online simultaneously
- Library: PeerJS or raw WebRTC API (simple-peer is unmaintained since 2022)
- TURN: Cloudflare Realtime ($0.05/GB)

---

## Summary of Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| AD-1 | Upload library | Build from scratch | No library covers >3 of 7 requirements |
| AD-2 | Primary storage | AWS S3 via presigned URLs | Existing infrastructure, S3 adapter covers 4 providers |
| AD-3 | Cost optimization | Cloudflare R2 (config change only) | 95x cheaper egress, same S3 API |
| AD-4 | Compression default | CompressionStream API (gzip) | Zero dependencies, all modern browsers |
| AD-5 | Compression upgrade | fflate (8 KB) → zstd-wasm (300 KB) | Progressive enhancement |
| AD-6 | Browser storage | OPFS (binary) + IndexedDB (metadata) | Best performance + best compatibility |
| AD-7 | Encryption | Per-chunk AES-256-GCM, counter IVs, AAD | Independent chunks, parallel, resumable |
| AD-8 | Transport: upload | Browser → S3 presigned URLs (bypass Lambda) | No payload limits, Lambda only generates URLs |
| AD-9 | Transport: download | S3/CloudFront signed URLs | No payload limits, cheapest path |
| AD-10 | P2P transfer | Phase 3 — WebRTC with S3 fallback | Optimization, not foundation |
| AD-11 | Multi-runtime | Pure JS core, platform adapters injected | Test everywhere, deploy anywhere |
| AD-12 | Transfer state | Transfer manifest as single source of truth | Enables resume, progress, streaming |
