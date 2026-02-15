# Compression Algorithms for File Transfer Engine — Research Document

**Version:** v0.3.13
**Date:** 2026-02-15
**Role:** Dev
**Purpose:** Evaluate compression options for the compress → encrypt → upload pipeline

---

## Table of Contents

1. [The Compression Pipeline](#1-the-compression-pipeline)
2. [Available Libraries](#2-available-libraries)
3. [CompressionStream API (Native Browser)](#3-compressionstream-api-native-browser)
4. [fflate](#4-fflate)
5. [Zstandard (zstd)](#5-zstandard-zstd)
6. [Brotli](#6-brotli)
7. [LZ4](#7-lz4)
8. [Snappy](#8-snappy)
9. [Compression Ratio Benchmarks](#9-compression-ratio-benchmarks)
10. [Content-Type Detection for Auto-Skip](#10-content-type-detection-for-auto-skip)
11. [Streaming Compression Patterns](#11-streaming-compression-patterns)
12. [Multi-Runtime Compatibility](#12-multi-runtime-compatibility)
13. [Recommendations](#13-recommendations)

---

## 1. The Compression Pipeline

**Critical invariant:** `compress → encrypt → upload` and `download → decrypt → decompress`.

Encrypted data is indistinguishable from random — it does **not** compress. If you encrypt first then compress, you get zero compression benefit and waste CPU. This ordering must be enforced at the engine level.

```
File → [Compress] → [Encrypt per-chunk] → [Upload chunks to S3]
S3   → [Download chunks] → [Decrypt per-chunk] → [Decompress] → File
```

The compression adapter operates on the plaintext **before** chunking and encryption. The engine calls:
1. `compressionAdapter.shouldCompress(contentType, firstBytes)` — auto-skip check
2. `compressionAdapter.compress(data)` — compress the entire file (or stream chunks)
3. Then the compressed output is chunked, encrypted per-chunk, and uploaded

---

## 2. Available Libraries

### Summary Table

| Library | Algorithm | Bundle Size | Streaming | Browser | Node.js | Deno/Bun | License |
|---------|-----------|-------------|-----------|---------|---------|----------|---------|
| **CompressionStream** | gzip, deflate, zstd* | **0 KB (native)** | Yes | Yes | Yes | Yes | N/A |
| **fflate** | gzip, deflate, zlib, zip | **~8 KB** min+gz | Yes | Yes | Yes | Yes | MIT |
| **zstd-wasm** | zstd | ~300-400 KB (WASM) | Partial | Yes | Yes | Yes | BSD |
| **brotli-wasm** | brotli | ~680 KB (WASM) | No | Yes | Yes | Yes | MIT |
| **lz4js** | lz4 | ~15 KB | No | Yes | Yes | Yes | MIT |
| **snappyjs** | snappy | ~10 KB | No | Yes | Yes | Yes | MIT |

*CompressionStream zstd support: Chrome 125+, Firefox 129+, Safari partial (26.1+).

---

## 3. CompressionStream API (Native Browser)

### What It Is

Built-in browser API for streaming compression/decompression. Zero bundle cost.

```javascript
// Compress
const compressed = blob.stream()
    .pipeThrough(new CompressionStream('gzip'))

// Decompress
const decompressed = compressedStream
    .pipeThrough(new DecompressionStream('gzip'))
```

### Supported Formats

| Format | CompressionStream | DecompressionStream |
|--------|:-:|:-:|
| `gzip` | Yes | Yes |
| `deflate` | Yes | Yes |
| `deflate-raw` | Yes | Yes |
| `zstd` | Chrome 125+ | Chrome 125+ |

### Browser Support

| Browser | CompressionStream | zstd format |
|---------|:-:|:-:|
| Chrome | 80+ | 125+ |
| Firefox | 113+ | 129+ |
| Safari | 16.4+ | 26.1+ (partial) |
| Edge | 80+ | 125+ |

### Node.js Support

```javascript
// Node.js 18+ via web streams
const { CompressionStream, DecompressionStream } = globalThis;
// Or use node:zlib for traditional streaming
const zlib = require('node:zlib');
const gzip = zlib.createGzip();
```

Node.js 21.7.0+ also has native zstd support via `zlib.createZstdCompress()`.

### Strengths
- **Zero bundle cost** — already in the browser
- **Streaming** — operates on ReadableStream, perfect for large files
- **Hardware-optimized** — native implementation, typically faster than JS
- **Standard API** — same interface across browsers

### Weaknesses
- Only gzip/deflate universally — zstd support is newer and incomplete
- No compression level control (gzip level is implementation-defined, typically level 6)
- No way to detect the compression ratio before committing

### Verdict: **Default choice for zero-dependency compression**

---

## 4. fflate

### What It Is

Fast, lightweight, pure JavaScript compression library. Supports DEFLATE, GZIP, Zlib, and ZIP.

- **NPM:** `fflate`
- **Bundle:** ~8 KB minified + gzipped (tree-shakeable — even smaller for partial use)
- **GitHub:** ~4K stars, actively maintained
- **Weekly downloads:** ~2M+
- **License:** MIT

### Key Features

- **Synchronous API:** `gzipSync(data)`, `gunzipSync(data)`
- **Asynchronous API (Web Workers):** `gzip(data, callback)`, `AsyncGzip` stream
- **Streaming API:** `Gzip`, `Gunzip`, `Deflate`, `Inflate` — push-based streams
- **Compression levels:** 0 (none) to 9 (maximum), default 6
- **ZIP support:** create and extract ZIP archives

### Streaming API Example

```javascript
import { Gzip } from 'fflate';

const gzipStream = new Gzip({ level: 6 });
const compressedChunks = [];

gzipStream.ondata = (chunk, final) => {
    compressedChunks.push(chunk);
    if (final) {
        // All data compressed
        const result = concatenate(compressedChunks);
    }
};

// Push data chunks
gzipStream.push(chunk1);
gzipStream.push(chunk2);
gzipStream.push(lastChunk, true); // true = final
```

### Async (Web Worker) Version

```javascript
import { AsyncGzip } from 'fflate';

const gzipStream = new AsyncGzip({ level: 6 });

gzipStream.ondata = (err, chunk, final) => {
    if (err) { /* handle error */ }
    // Process compressed chunk
    if (final) { /* done */ }
};

gzipStream.push(data, true);
```

### Performance

- Comparable to native zlib in most benchmarks
- ~100-200 MB/s compression throughput (level 6)
- ~300-500 MB/s decompression throughput
- AsyncGzip offloads to Web Worker — non-blocking

### Strengths
- Tiny bundle (8 KB)
- Streaming support (sync and async)
- Compression level control
- Pure JS — works everywhere
- Well-maintained, widely used

### Weaknesses
- Only deflate-based algorithms (no zstd, no brotli)
- Compression ratio limited to what gzip/deflate can achieve (~60-70% on text)

### Verdict: **Best upgrade from CompressionStream — tiny, streaming, all runtimes**

---

## 5. Zstandard (zstd)

### What It Is

Facebook's modern compression algorithm. Typically faster than gzip with better compression ratios.

### Available Implementations

#### zstd-wasm / zstd-codec

- **NPM:** `zstd-wasm`, `zstd-codec`, `@aspect-build/zstd`
- **WASM binary:** ~300-400 KB
- **Compression levels:** 1-22 (default 3)
- **Dictionary support:** yes (can train on similar data for better ratios)
- **Streaming:** partial — some wrappers support it, others require full-buffer

```javascript
import { ZstdInit } from '@aspect-build/zstd';

const { compress, decompress } = await ZstdInit();
const compressed = compress(data, 3); // level 3
const decompressed = decompress(compressed);
```

#### Native Node.js (21.7.0+)

```javascript
const zlib = require('node:zlib');

// Streaming compression
const compressor = zlib.createZstdCompress({ level: 3 });
readableStream.pipe(compressor).pipe(writableStream);

// Sync
const compressed = zlib.zstdCompressSync(data, { level: 3 });
const decompressed = zlib.zstdDecompressSync(compressed);
```

#### CompressionStream (Chrome 125+)

```javascript
const compressed = blob.stream()
    .pipeThrough(new CompressionStream('zstd'));
```

### Performance

- Level 1: ~400 MB/s compress, ~800 MB/s decompress
- Level 3: ~200 MB/s compress, ~800 MB/s decompress
- Level 19: ~10 MB/s compress, ~800 MB/s decompress
- Decompression speed is ~constant regardless of compression level

### Compression Ratio (vs gzip level 6)

- zstd level 1: ~similar ratio, ~3x faster
- zstd level 3: ~10% better ratio, ~2x faster
- zstd level 19: ~15-20% better ratio, ~10x slower

### Strengths
- Best ratio-to-speed trade-off of any modern algorithm
- Streaming support (native Node.js, CompressionStream in Chrome)
- Dictionary compression for repeated similar content
- Decompression is always fast regardless of compression level

### Weaknesses
- WASM binary adds ~300-400 KB to bundle
- CompressionStream zstd not universal yet (Safari partial)
- NPM ecosystem fragmented (multiple packages, varying quality)

### Verdict: **Strong compression option for Phase 3 — best when ratio matters**

---

## 6. Brotli

### What It Is

Google's compression algorithm, designed for web content. Excellent compression ratios but slower compression.

### Available Implementations

#### brotli-wasm (httptoolkit)

- **NPM:** `brotli-wasm`
- **WASM binary:** ~680 KB (includes static dictionary — large)
- **API:** `compress(data, options)`, `decompress(data)`
- **No streaming support**
- **License:** MIT

```javascript
import brotli from 'brotli-wasm';

const instance = await brotli;
const compressed = instance.compress(data, { quality: 6 });
const decompressed = instance.decompress(compressed);
```

#### brotli-dec-wasm (decompression only)

- **WASM binary:** ~200 KB (much smaller — no static dictionary for compression)
- Useful if you only need to decompress (e.g., receiving brotli-compressed downloads)

#### Browser DecompressionStream

Browsers can decompress brotli via `Content-Encoding: br` header automatically, but the CompressionStream API does **not** support brotli for compression.

### Performance

- Compression: ~20-50 MB/s (level 6), ~5 MB/s (level 11)
- Decompression: ~200-400 MB/s
- Ratio: ~5-15% better than gzip on text content

### Strengths
- Best compression ratio for text/HTML content
- Built-in browser decompression (HTTP Content-Encoding)

### Weaknesses
- **~680 KB WASM binary** — largest of all options
- **Slow compression** — significantly slower than gzip or zstd
- **No streaming** in the WASM wrapper
- **No CompressionStream support** — can't use the native browser API for compression

### Verdict: **Not recommended for file transfer.** The large bundle and slow compression don't justify the ~5% ratio improvement over zstd. Brotli excels for static web content served via CDN, not for user-initiated file uploads.

---

## 7. LZ4

### What It Is

Extremely fast compression with moderate ratios. Designed for speed-first use cases.

- **NPM:** `lz4js`, `lz4-wasm`
- **Bundle:** ~15 KB (lz4js pure JS)
- **Streaming:** No (buffer-based)

### Performance

- Compression: ~400-600 MB/s
- Decompression: ~1-2 GB/s
- Ratio: ~50-60% on text (lower than gzip)

### Strengths
- Fastest compression/decompression
- Minimal CPU usage

### Weaknesses
- Lower compression ratio than gzip, zstd, brotli
- No streaming API in JS implementations
- Less commonly used in browser contexts

### Verdict: **Niche use case — only if compression speed matters more than ratio.** For most file transfers, network speed (not CPU) is the bottleneck, so spending a bit more CPU for better compression (gzip/zstd) saves more time overall.

---

## 8. Snappy

### What It Is

Google's speed-focused compression. Similar niche to LZ4.

- **NPM:** `snappyjs`
- **Bundle:** ~10 KB
- **No streaming**

### Performance

- Similar to LZ4 (fast, moderate ratio)
- Less commonly used in browser/JS contexts

### Verdict: **Not recommended.** LZ4 fills the same niche with better ecosystem support.

---

## 9. Compression Ratio Benchmarks

Approximate ratios for common file types (higher = more compression):

| File Type | gzip (6) | zstd (3) | zstd (19) | brotli (6) | lz4 | Already compressed? |
|-----------|----------|----------|-----------|------------|-----|:---:|
| Text/JSON | 70-80% | 72-82% | 78-88% | 75-85% | 55-65% | No |
| HTML/XML | 75-85% | 77-87% | 82-90% | 80-88% | 60-70% | No |
| Source code | 65-75% | 68-78% | 75-85% | 72-82% | 50-60% | No |
| CSV data | 70-85% | 72-87% | 80-90% | 75-88% | 55-70% | No |
| PDF | 5-20% | 5-22% | 8-25% | 8-22% | 2-10% | Mostly |
| JPEG/PNG | 0-2% | 0-3% | 0-3% | 0-2% | 0-1% | **Yes** |
| MP4/WebM | 0-1% | 0-1% | 0-1% | 0-1% | 0-1% | **Yes** |
| ZIP/RAR/7z | 0-1% | 0-1% | 0-1% | 0-1% | 0-1% | **Yes** |
| DOCX/XLSX | 0-3% | 0-3% | 0-4% | 0-3% | 0-1% | **Yes** (ZIP-based) |
| Executables | 30-45% | 35-50% | 45-60% | 40-55% | 20-30% | No |
| Database dumps | 70-90% | 72-92% | 80-95% | 75-92% | 55-75% | No |

**Key insight:** Already-compressed formats get ~0% reduction. Attempting to compress them wastes CPU for zero benefit. The engine must detect and skip these.

---

## 10. Content-Type Detection for Auto-Skip

### Strategy: Magic Bytes + Content-Type Hint

Check the first few bytes of the file (magic bytes / file signature) and optionally the MIME type hint to determine if compression should be skipped.

### Already-Compressed MIME Types (Skip List)

```javascript
const SKIP_COMPRESSION_TYPES = new Set([
    // Images (compressed)
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/avif', 'image/heic', 'image/heif',
    // Video (compressed)
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    'video/x-matroska', 'video/avi',
    // Audio (compressed)
    'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/aac',
    'audio/flac', 'audio/mp4',
    // Archives (already compressed)
    'application/zip', 'application/gzip', 'application/x-bzip2',
    'application/x-xz', 'application/zstd', 'application/x-7z-compressed',
    'application/x-rar-compressed', 'application/x-tar+gzip',
    // Office formats (ZIP-based internally)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Other compressed
    'application/x-apple-diskimage',
    'application/java-archive',
]);
```

### Magic Bytes Detection

For when MIME type is unavailable or unreliable:

```javascript
const COMPRESSED_SIGNATURES = [
    { bytes: [0xFF, 0xD8, 0xFF],             name: 'JPEG' },
    { bytes: [0x89, 0x50, 0x4E, 0x47],       name: 'PNG' },
    { bytes: [0x47, 0x49, 0x46, 0x38],       name: 'GIF' },
    { bytes: [0x50, 0x4B, 0x03, 0x04],       name: 'ZIP/DOCX/XLSX' },
    { bytes: [0x1F, 0x8B],                    name: 'GZIP' },
    { bytes: [0x28, 0xB5, 0x2F, 0xFD],       name: 'ZSTD' },
    { bytes: [0x42, 0x5A, 0x68],             name: 'BZIP2' },
    { bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A], name: 'XZ' },
    { bytes: [0x37, 0x7A, 0xBC, 0xAF],       name: '7z' },
    { bytes: [0x52, 0x61, 0x72, 0x21],       name: 'RAR' },
    { bytes: [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70], name: 'MP4/MOV' }, // null = any byte
    { bytes: [0x1A, 0x45, 0xDF, 0xA3],       name: 'WebM/MKV' },
    { bytes: [0x4F, 0x67, 0x67, 0x53],       name: 'OGG' },
    { bytes: [0x49, 0x44, 0x33],             name: 'MP3 (ID3)' },
    { bytes: [0xFF, 0xFB],                    name: 'MP3' },
    { bytes: [0xFF, 0xF3],                    name: 'MP3' },
    { bytes: [0x66, 0x4C, 0x61, 0x43],       name: 'FLAC' },
];

function isAlreadyCompressed(firstBytes) {
    const header = new Uint8Array(firstBytes.slice(0, 12));
    return COMPRESSED_SIGNATURES.some(sig =>
        sig.bytes.every((b, i) => b === null || header[i] === b)
    );
}
```

### Combined Auto-Skip Function

```javascript
function shouldCompress(contentType, firstBytes) {
    // Check MIME type first (fast)
    if (contentType && SKIP_COMPRESSION_TYPES.has(contentType)) {
        return false;
    }
    // Check magic bytes (reliable)
    if (firstBytes && firstBytes.byteLength >= 12) {
        if (isAlreadyCompressed(firstBytes)) {
            return false;
        }
    }
    // Default: compress
    return true;
}
```

### Library Option: magic-bytes.js

- **NPM:** `magic-bytes.js`
- **Bundle:** small
- **Capability:** detects file type from first ~100 bytes
- **Use case:** if we want more comprehensive detection than our custom list

---

## 11. Streaming Compression Patterns

### Pattern 1: CompressionStream API (Recommended Default)

```javascript
async function compressWithStream(inputBlob) {
    const compressedStream = inputBlob.stream()
        .pipeThrough(new CompressionStream('gzip'));

    return new Response(compressedStream).blob();
}

async function decompressWithStream(compressedBlob) {
    const decompressedStream = compressedBlob.stream()
        .pipeThrough(new DecompressionStream('gzip'));

    return new Response(decompressedStream).blob();
}
```

### Pattern 2: fflate Streaming (For Level Control)

```javascript
import { Gzip, Gunzip } from 'fflate';

function compressWithFflate(data, level = 6) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const gz = new Gzip({ level });

        gz.ondata = (chunk, final) => {
            chunks.push(chunk);
            if (final) {
                resolve(concatenateUint8Arrays(chunks));
            }
        };

        // Process in 1MB pieces to avoid blocking
        const PIECE_SIZE = 1024 * 1024;
        for (let i = 0; i < data.byteLength; i += PIECE_SIZE) {
            const piece = new Uint8Array(data, i, Math.min(PIECE_SIZE, data.byteLength - i));
            const isFinal = (i + PIECE_SIZE >= data.byteLength);
            gz.push(piece, isFinal);
        }
    });
}
```

### Pattern 3: Integration with Chunked Upload Pipeline

```javascript
async function compressAndChunk(file, compressionAdapter, chunkSize) {
    // Step 1: Check if compression is beneficial
    if (!compressionAdapter.shouldCompress(file.type, await file.slice(0, 12).arrayBuffer())) {
        // Skip compression — chunk the raw file
        return { compressed: false, data: file, ratio: 1.0 };
    }

    // Step 2: Compress the entire file
    const plaintext = new Uint8Array(await file.arrayBuffer());
    const compressed = await compressionAdapter.compress(plaintext);

    // Step 3: Check if compression actually helped
    const ratio = compressed.byteLength / plaintext.byteLength;
    if (ratio > 0.95) {
        // Less than 5% reduction — not worth the decompression cost
        return { compressed: false, data: file, ratio: 1.0 };
    }

    return {
        compressed: true,
        data: new Blob([compressed]),
        ratio: ratio,
        algorithm: compressionAdapter.name,
    };
}
```

---

## 12. Multi-Runtime Compatibility

| Library | Browser | Node.js | Deno | Bun |
|---------|:---:|:---:|:---:|:---:|
| CompressionStream (gzip) | Chrome 80+, FF 113+, Safari 16.4+ | 18+ (web streams) | Yes | Yes |
| CompressionStream (zstd) | Chrome 125+, FF 129+ | 21.7+ (zlib) | Partial | Partial |
| fflate | Yes | Yes | Yes | Yes |
| zstd-wasm | Yes (WASM) | Yes (WASM or native zlib) | Yes (WASM) | Yes (WASM) |
| brotli-wasm | Yes (WASM) | Yes (WASM or native zlib) | Yes (WASM) | Yes (WASM) |
| lz4js | Yes | Yes | Yes | Yes |

**Best multi-runtime option:** fflate (pure JS, no WASM dependency, works everywhere).

**Best zero-dependency option:** CompressionStream API (native, but gzip-only universally).

---

## 13. Recommendations

### Layered Approach

| Tier | Library | Algorithm | Bundle Cost | When to Use |
|------|---------|-----------|-------------|-------------|
| **Default** | CompressionStream API | gzip | **0 KB** | Always available, zero dependency |
| **Upgrade** | fflate | gzip (level control) | **~8 KB** | When level control or streaming needed |
| **Strong** | zstd-wasm (or native) | zstd | **~300 KB** | Large files on slow connections (Phase 3) |
| **Skip** | — | none | 0 KB | Already-compressed files (auto-detected) |

### Implementation Priority

1. **Phase 1:** CompressionStream API with gzip as default. Auto-skip for compressed files. No extra dependencies.
2. **Phase 2:** Add fflate as optional upgrade (compression level control, async Web Worker support).
3. **Phase 3:** Add zstd-wasm for strong compression option. Lazy-load the WASM module.
4. **Never:** Brotli for upload compression (too slow, too large). LZ4/Snappy (niche, gzip is better trade-off).

### Auto-Skip Strategy

1. Check MIME type hint from file input (fast, not always reliable)
2. Check first 12 bytes for magic byte signatures (reliable)
3. If already compressed → skip
4. If compressed but ratio < 5% improvement → skip and record in manifest
5. Record compression stats in transfer manifest: `{ compression: "gzip", size_original, size_compressed }`

### Key Configuration Options

```javascript
const compressionConfig = {
    enabled: true,              // Global on/off
    algorithm: 'gzip',          // 'gzip' | 'zstd' | 'none'
    level: 6,                   // 1-9 for gzip, 1-22 for zstd
    autoSkip: true,             // Auto-detect already-compressed files
    minRatio: 0.95,             // Skip if compression saves < 5%
    maxInputSize: 4 * 1024 * 1024 * 1024,  // Skip for files > 4 GB (memory)
};
```

---

## Sources

- [fflate — GitHub](https://github.com/101arrowz/fflate)
- [fflate — npm](https://www.npmjs.com/package/fflate)
- [CompressionStream API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)
- [Compression Streams on all browsers — web.dev](https://web.dev/blog/compressionstreams)
- [zstd Content-Encoding — Can I Use](https://caniuse.com/zstd)
- [CompressionStream — Can I Use](https://caniuse.com/mdn-api_compressionstream)
- [brotli-wasm — GitHub](https://github.com/httptoolkit/brotli-wasm)
- [WASM Compression Benchmarks — nickb.dev](https://nickb.dev/blog/wasm-compression-benchmarks-and-the-cost-of-missing-compression-apis/)
- [magic-bytes.js — GitHub](https://github.com/LarsKoelpin/magic-bytes)
- [Node.js zlib zstd support](https://nodejs.org/api/zlib.html)
- [Zstd vs Brotli vs GZip — SpeedVitals](https://speedvitals.com/blog/zstd-vs-brotli-vs-gzip/)
