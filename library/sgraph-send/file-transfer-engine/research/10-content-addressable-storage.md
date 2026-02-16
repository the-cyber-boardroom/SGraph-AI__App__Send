# Content-Addressable Storage and Delta Uploads for SGraph Send

**Version:** v0.3.13
**Date:** 15 February 2026
**Role:** Architect (Explorer Team)
**Priority:** P3 (future -- architecture should support it, not implementing now)
**Builds on:**
- [v0.3.2 Large File Transfer Architecture](../26-02-14/v0.3.2__action-plan__explorer-next-steps.md) (Section 2)
- [v0.1.2 Data Model and Storage](../../v0.1.2/v0.1.2__data-model-and-storage.md)
- AD-4 from [v0.3.2 Action Plan](../26-02-14/v0.3.2__action-plan__explorer-next-steps.md) (chunk-then-encrypt decision)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What is Content-Addressable Storage](#2-what-is-content-addressable-storage)
3. [How CAS Applies to SGraph Send](#3-how-cas-applies-to-sgraph-send)
4. [Chunking Strategies](#4-chunking-strategies)
5. [Delta/Diff Uploads](#5-deltadiff-uploads)
6. [Storage Layout Design](#6-storage-layout-design)
7. [Security Analysis: CAS and Zero-Knowledge](#7-security-analysis-cas-and-zero-knowledge)
8. [Implementation Plan: Client-Side (Browser)](#8-implementation-plan-client-side-browser)
9. [Implementation Plan: Server-Side (Python)](#9-implementation-plan-server-side-python)
10. [Garbage Collection](#10-garbage-collection)
11. [Performance Analysis](#11-performance-analysis)
12. [Reference Systems](#12-reference-systems)
13. [Recommendations and Phasing](#13-recommendations-and-phasing)

---

## 1. Executive Summary

Content-addressable storage (CAS) identifies data objects by the cryptographic hash of their content rather than by name or path. When applied to a chunked file transfer system, CAS enables three capabilities:

1. **Upload resumption** -- if an upload fails partway through, only the remaining chunks need to be sent.
2. **Within-transfer deduplication** -- if the same data block appears multiple times in a file, it is stored once.
3. **Delta uploads** -- when re-uploading a modified version of a file, only the changed chunks are transferred.

This research document examines how CAS and delta upload capabilities could integrate with SGraph Send's existing architecture. The key constraint is SGraph Send's zero-knowledge encryption model: the server never sees plaintext, and each transfer uses a unique random key. This constraint fundamentally shapes the design -- cross-transfer deduplication is architecturally incompatible with zero-knowledge, but within-transfer deduplication and upload resumption work naturally.

**Bottom line:** The existing chunked upload architecture proposed in AD-4 can be extended to support CAS with modest changes. The primary benefit for SGraph Send users is not storage savings but operational resilience: resumable uploads and efficient re-uploads of modified files.

---

## 2. What is Content-Addressable Storage

### 2.1 Core Concept

In a content-addressable store, every object is identified by a hash of its content:

```
content_hash = SHA-256(object_bytes)
storage_key  = content_hash
```

Two properties follow directly:

- **Deterministic addressing:** The same content always produces the same hash, therefore the same storage key.
- **Natural deduplication:** Storing the same content twice is a no-op -- the second write targets the same key and produces the same bytes.

### 2.2 The Merkle DAG Pattern

CAS systems typically organise objects into a Merkle DAG (directed acyclic graph). A file is represented as a tree:

```
                    ┌─────────────────────┐
                    │      Manifest        │
                    │  hash: sha256:aaa... │
                    │  references:         │
                    │    chunk_0: fff...   │
                    │    chunk_1: bbb...   │
                    │    chunk_2: fff...   │  <-- same hash as chunk_0
                    └──────┬──────┬───────┘
                           │      │
              ┌────────────┘      └────────────┐
              ▼                                ▼
     ┌────────────────┐               ┌────────────────┐
     │    Chunk 0/2    │               │    Chunk 1      │
     │ hash: sha256:   │               │ hash: sha256:   │
     │   fff...        │               │   bbb...        │
     │ (4 MB data)     │               │ (4 MB data)     │
     └────────────────┘               └────────────────┘
```

Chunk 0 and Chunk 2 have the same content, so they share a single storage object. The manifest references both by hash.

### 2.3 Systems That Use CAS

| System | Object Type | Hash | Chunking | Purpose |
|--------|------------|------|----------|---------|
| **Git** | blobs, trees, commits | SHA-1 (migrating to SHA-256) | Per-file (not per-chunk) | Version control |
| **Docker** | layers | SHA-256 | Per-layer | Container images |
| **IPFS** | blocks | SHA-256 (multihash) | Content-defined (256 KB default) | Distributed storage |
| **restic** | blobs | SHA-256 | Content-defined (CDC, 512 KB--8 MB) | Encrypted backup |
| **Borg** | chunks | SHA-256 or BLAKE2b | Content-defined (Buzhash) | Encrypted backup |
| **Perkeep** | blobs | SHA-224 | Per-blob (variable) | Personal data store |
| **Nix** | store paths | SHA-256 | Per-derivation | Package management |

The most relevant systems for SGraph Send are **restic** and **Borg** -- both are encrypted backup tools that use CAS with content-defined chunking. Their design decisions directly inform ours.

---

## 3. How CAS Applies to SGraph Send

### 3.1 Current Transfer Flow

The current architecture (and the chunked architecture proposed in AD-4) works as follows:

```
Current (single-blob):
  Browser: encrypt(entire file) -> upload(single blob) -> server stores at transfers/{id}/payload

Proposed chunked (AD-4):
  Browser: for each chunk:
    encrypt(chunk_i) -> upload(chunk_i) -> server stores at transfers/{id}/chunks/{index}
```

In both cases, chunks are addressed by their **position** (index), not by their **content**. This means:

- If the upload is interrupted, the client must track which indices were uploaded and retry the rest.
- If a file is modified and re-uploaded, all chunks are re-uploaded even if most are unchanged.
- If the same data appears at two positions in the file, it is stored twice.

### 3.2 CAS-Enhanced Transfer Flow

With CAS, the flow changes:

```
CAS-enhanced chunked:
  Browser: for each chunk:
    encrypted_chunk = encrypt(chunk_i)
    chunk_hash      = SHA-256(encrypted_chunk)
    if server.has_chunk(chunk_hash):
      skip upload                          <-- key optimisation
    else:
      upload(encrypted_chunk, chunk_hash)
    manifest.append(chunk_hash)
  Browser: upload(manifest)
```

The server stores chunks at content-hash-based keys:

```
chunks/{hash_prefix}/{full_hash}     (content-addressed)
manifests/{transfer_id}/manifest.json (transfer-specific)
```

### 3.3 Benefits for SGraph Send

| Benefit | Mechanism | User Impact |
|---------|-----------|-------------|
| **Resumable uploads** | Before uploading a chunk, check if its hash already exists on the server | Upload interrupted at 80%? Resume uploads only the remaining 20% |
| **Re-upload efficiency** | Modified file shares most chunks with the original | Editing a 100 MB document and re-sending: only upload the changed pages |
| **Within-file dedup** | Identical blocks within one file stored once | A file with repeated sections (e.g., template pages) stores less data |
| **Integrity verification** | Hash is computed from encrypted content; server can verify chunks match manifest | Detects corruption during upload or storage |

### 3.4 What CAS Cannot Do in SGraph Send

**Cross-transfer deduplication is not possible.** Because each transfer uses a unique random AES-256-GCM key, the same plaintext file encrypted with different keys produces different ciphertext. Different ciphertext means different hashes. CAS dedup only works within a single transfer (same key).

This is the correct trade-off. Cross-transfer dedup would require either:
- Convergent encryption (deterministic key from content) -- leaks information about whether a file exists
- Server-side plaintext hashing before encryption -- violates zero-knowledge

Neither is acceptable. Section 7 provides the full security analysis.

---

## 4. Chunking Strategies

### 4.1 Fixed-Size Chunking

Split the data at fixed byte boundaries:

```javascript
// Browser-side fixed-size chunking
function* fixedSizeChunks(data, chunkSize = 4 * 1024 * 1024) {    // 4 MB default
    for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, data.byteLength);
        yield {
            index  : Math.floor(offset / chunkSize),
            offset : offset,
            data   : data.slice(offset, end)
        };
    }
}
```

**Advantages:**
- Trivially simple to implement
- Deterministic: same file always produces the same chunks
- Predictable chunk count: `Math.ceil(fileSize / chunkSize)`

**Disadvantages:**
- Poor dedup sensitivity to insertions: inserting one byte at position 0 shifts every chunk boundary, changing every chunk hash
- This means: editing the first line of a 100 MB file invalidates all chunks, not just the first one

```
Original:     [AAAA][BBBB][CCCC][DDDD]     4 chunks
Insert "X":   [XAAA][ABBB][BCCC][CDDD][D]  5 chunks -- none match the originals
```

### 4.2 Content-Defined Chunking (CDC)

Chunk boundaries are determined by the content itself, using a rolling hash:

```
Scan the data with a sliding window.
When hash(window) meets a condition (e.g., low N bits are zero), mark a chunk boundary.
```

Because boundaries depend on local content, inserting bytes only affects the chunks adjacent to the insertion point:

```
Original:     [AAAA][BBB][CCCCC][DD]        4 chunks (variable size)
Insert "X":   [AAAA][XB][BB][CCCCC][DD]     5 chunks -- chunks 1+2 changed, but 0, 3, 4 unchanged
                ^^^^              ^^^^
                same              same
```

This is the key advantage for delta uploads: modifying a file produces mostly identical chunks.

### 4.3 Rolling Hash Algorithms for CDC

| Algorithm | Speed | Quality | Complexity | Used By |
|-----------|-------|---------|------------|---------|
| **Rabin fingerprint** | Moderate (~300 MB/s JS) | Excellent | Medium (~200 lines) | LBFS, many academic systems |
| **Buzhash** | Fast (~500 MB/s JS) | Good | Low (~100 lines) | Borg backup |
| **Gear/FastCDC** | Very fast (~800 MB/s JS, ~2 GB/s WASM) | Excellent | Medium (~150 lines) | restic (via Rust), modern backup tools |

**FastCDC** is the recommended algorithm. Published in 2020, it achieves near-identical dedup quality to Rabin with 2-3x higher throughput. A pure JavaScript implementation is feasible; a Rust-to-WASM compilation would be faster.

### 4.4 CDC Implementation Sketch (Buzhash -- Simplest)

```javascript
// Buzhash-based content-defined chunking
// This is the simplest CDC algorithm, suitable for an Explorer implementation

const BUZHASH_TABLE = new Uint32Array(256);
// Initialize with random values (done once at load time)
for (let i = 0; i < 256; i++) {
    BUZHASH_TABLE[i] = Math.floor(Math.random() * 0xFFFFFFFF);
}

function* contentDefinedChunks(data, options = {}) {
    const minChunk  = options.minChunk  || 512 * 1024;        // 512 KB minimum
    const maxChunk  = options.maxChunk  || 8 * 1024 * 1024;   // 8 MB maximum
    const avgChunk  = options.avgChunk  || 2 * 1024 * 1024;   // 2 MB target average
    const mask      = avgChunk - 1;                            // Assumes avgChunk is power of 2
    const windowSize = 48;                                     // Rolling window size

    const bytes = new Uint8Array(data);
    let chunkStart = 0;
    let index = 0;

    while (chunkStart < bytes.length) {
        let hash = 0;
        let pos = chunkStart + minChunk;                       // Skip minimum chunk size

        if (pos >= bytes.length) {
            // Remaining data is smaller than minChunk: emit as final chunk
            yield {
                index  : index,
                offset : chunkStart,
                data   : data.slice(chunkStart)
            };
            break;
        }

        // Seed the rolling hash with the window at position pos
        for (let i = 0; i < windowSize && (pos - windowSize + i) < bytes.length; i++) {
            hash ^= BUZHASH_TABLE[bytes[pos - windowSize + i]];
        }

        // Scan forward looking for a chunk boundary
        while (pos < bytes.length && (pos - chunkStart) < maxChunk) {
            // Roll the hash: remove oldest byte, add newest byte
            hash = ((hash << 1) | (hash >>> 31));              // Rotate left
            hash ^= BUZHASH_TABLE[bytes[pos]];

            if ((hash & mask) === 0) {
                break;                                         // Found a boundary
            }
            pos++;
        }

        const chunkEnd = Math.min(pos + 1, bytes.length);
        yield {
            index  : index,
            offset : chunkStart,
            data   : data.slice(chunkStart, chunkEnd)
        };

        chunkStart = chunkEnd;
        index++;
    }
}
```

### 4.5 Chunk Size Selection

The AD-4 proposal recommended 5 MB fixed chunks. For CDC, the parameters are:

| Parameter | Recommended Value | Rationale |
|-----------|------------------|-----------|
| **Minimum chunk size** | 512 KB | Prevents degenerate cases (very small chunks from repetitive data) |
| **Average chunk size** | 2 MB | Balances dedup quality (more chunks = better dedup) against HTTP overhead |
| **Maximum chunk size** | 8 MB | Prevents degenerate cases (very large chunks from non-chunking data) |

For fixed-size chunking (Phase 1), a 4 MB chunk size is recommended. This aligns with the average CDC chunk size while being a round power-of-two.

### 4.6 Comparison: Fixed vs CDC for Common Scenarios

| Scenario | Fixed (4 MB) | CDC (2 MB avg) | Savings with CDC |
|----------|-------------|----------------|------------------|
| Upload 100 MB file, no changes | 25 chunks | ~50 chunks | None (both upload everything) |
| Re-upload same file | 0 chunks (all hashes match) | 0 chunks | None (CAS handles both) |
| Edit first 1 KB of 100 MB file | 25 chunks (all changed) | 1-2 chunks changed | ~96% bandwidth saved |
| Edit middle 500 KB of 100 MB | 24-25 chunks (all changed from that point) | 1-3 chunks changed | ~94% bandwidth saved |
| Append 10 KB to 100 MB file | 1 new chunk | 1 new chunk | Similar |

**Conclusion:** Fixed-size chunking gets all CAS benefits (resumption, exact-match dedup) but none of the delta benefits. CDC is required for efficient delta uploads of modified files.

---

## 5. Delta/Diff Uploads

### 5.1 Concept

Delta upload means: the user has already uploaded File v1. They modify the file locally and want to upload File v2. Instead of re-uploading the entire file, only the differences are transmitted.

With CAS and chunking, delta upload is implicit:

```
File v1 chunks: [A][B][C][D][E]     -- all uploaded, hashes stored in manifest
File v2 chunks: [A][B][X][D][E]     -- chunk C changed to X, others identical

Upload delta:
  1. Chunk File v2
  2. Compute hashes: hash(A), hash(B), hash(X), hash(D), hash(E)
  3. Check server: A exists? yes. B exists? yes. X exists? no. D exists? yes. E exists? yes.
  4. Upload only chunk X
  5. Create new manifest: [hash(A), hash(B), hash(X), hash(D), hash(E)]
```

### 5.2 Chunk-Level Delta (Recommended for SGraph Send)

This is the natural result of CAS + chunking. No special delta algorithm is needed.

**Client-side flow:**

```javascript
async function deltaUpload(file, transferId, encryptionKey, existingManifest) {
    const chunks = contentDefinedChunks(file);           // or fixedSizeChunks
    const newManifest = [];
    const existingHashes = new Set(existingManifest.map(c => c.hash));

    for (const chunk of chunks) {
        const encrypted = await encryptChunk(encryptionKey, chunk.data);
        const hash = await sha256(encrypted);

        if (existingHashes.has(hash)) {
            // Chunk already on server -- skip upload
            newManifest.push({ index: chunk.index, hash: hash, size: encrypted.byteLength });
        } else {
            // New chunk -- upload it
            await uploadChunk(transferId, hash, encrypted);
            newManifest.push({ index: chunk.index, hash: hash, size: encrypted.byteLength });
        }
    }

    await uploadManifest(transferId, newManifest);
}
```

**Critical requirement:** For delta upload to work across versions, the same encryption key must be used. This is inherent in SGraph Send's model -- the sender retains the key and can re-use it when updating a transfer.

### 5.3 Byte-Level Delta (Not Recommended)

Byte-level delta algorithms (rsync, xdelta, bsdiff) compute minimal binary patches:

```
rsync algorithm:
  1. Server computes rolling checksums of v1 blocks
  2. Client scans v2 with rolling checksum, finds matching blocks
  3. Client sends: block references + literal bytes for non-matching regions
  4. Server reconstructs v2
```

**Why this is not suitable for SGraph Send:**

1. **Server-side computation required.** The rsync algorithm requires the server to read the existing file and compute checksums. In SGraph Send, the server stores encrypted data and cannot compute meaningful checksums over plaintext.
2. **Complexity.** Implementing rsync in the browser is feasible but significantly more complex than chunk-level CAS.
3. **Diminishing returns.** Chunk-level CAS captures 80-95% of the benefit for typical file modifications. Byte-level delta is worth the complexity only for very large files with very small changes.

### 5.4 When Delta Upload Applies in SGraph Send

| Scenario | Delta Useful? | Mechanism |
|----------|--------------|-----------|
| First upload of a file | No | All chunks are new |
| Re-upload identical file (resume) | Yes | All chunks already exist, zero upload |
| Upload modified version with same key | Yes | Only changed chunks uploaded |
| Upload same file with new key | No | Different key = different ciphertext = different hashes |
| Upload same file as different transfer | No | New transfer = new key = different hashes |
| Two users upload the same file | No | Different keys = no cross-transfer dedup |

---

## 6. Storage Layout Design

### 6.1 Current Layout

From the [v0.1.2 data model](../../v0.1.2/v0.1.2__data-model-and-storage.md):

```
transfers/{transfer_id}/
    meta.json
    payload                      (single encrypted blob)
    events/
    requests/
```

### 6.2 AD-4 Chunked Layout (Position-Addressed)

From the [v0.3.2 action plan](../26-02-14/v0.3.2__action-plan__explorer-next-steps.md):

```
transfers/{transfer_id}/
    meta.json
    chunks/
        000                      (chunk by index)
        001
        002
    events/
    requests/
```

### 6.3 Proposed CAS Layout

```
chunks/                                          CAS chunk store (shared across transfer)
    ab/                                          First 2 hex chars of hash (for S3 key distribution)
        abcdef1234567890...abcdef1234567890      Full SHA-256 hash as filename
    cd/
        cdef1234567890...cdef1234567890abcd
    ...

transfers/{transfer_id}/
    meta.json                                    Transfer metadata (extended)
    manifest.json                                Chunk manifest (CAS references)
    events/
    requests/
```

### 6.4 Manifest Schema

```json
{
    "transfer_id"   : "abc123def456",
    "version"       : 1,
    "chunk_strategy": "fixed",
    "chunk_params"  : {
        "chunk_size": 4194304
    },
    "total_size"    : 104857600,
    "chunk_count"   : 25,
    "chunks"        : [
        {
            "index"  : 0,
            "hash"   : "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            "size"   : 4194304,
            "offset" : 0
        },
        {
            "index"  : 1,
            "hash"   : "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "size"   : 4194304,
            "offset" : 4194304
        },
        {
            "index"  : 2,
            "hash"   : "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            "size"   : 4194304,
            "offset" : 8388608
        }
    ]
}
```

Note: chunk 0 and chunk 2 reference the same hash. The chunk is stored once; the manifest references it twice.

### 6.5 Extended Meta Schema

The transfer `meta.json` gains a `storage_mode` field:

```json
{
    "transfer_id"       : "abc123def456",
    "status"            : "completed",
    "storage_mode"      : "cas_chunked",
    "file_size_bytes"   : 104857600,
    "content_type_hint" : "application/pdf",
    "chunk_strategy"    : "fixed",
    "chunk_count"       : 25,
    "unique_chunks"     : 24,
    "created_at"        : 1739030400000,
    "download_count"    : 0,
    "events"            : []
}
```

`storage_mode` values:
- `"single"` -- current model (single payload blob)
- `"chunked"` -- AD-4 model (position-addressed chunks)
- `"cas_chunked"` -- CAS model (content-addressed chunks with manifest)

### 6.6 S3 Key Distribution

The 2-character hex prefix (`chunks/ab/`) distributes keys across S3 partitions. S3 uses the key prefix for partitioning; without a prefix, all chunks starting with "sha256:" would land on the same partition, creating a hot spot.

With a 2-hex-char prefix: 256 partitions. With 3: 4,096. Two characters is sufficient for the expected data volume.

### 6.7 Memory-FS Compatibility

The CAS layout uses the same `Storage_FS` interface as the current layout:

```python
# Store a chunk
storage_fs.file__save(f'chunks/{hash[:2]}/{hash}', encrypted_bytes)

# Check if chunk exists
storage_fs.file__exists(f'chunks/{hash[:2]}/{hash}')

# Read a chunk
storage_fs.file__bytes(f'chunks/{hash[:2]}/{hash}')

# Store manifest
storage_fs.file__save(f'transfers/{transfer_id}/manifest.json', manifest_json)
```

No changes to the `Storage_FS` abstraction are needed. This is a file path convention, not a storage API change.

---

## 7. Security Analysis: CAS and Zero-Knowledge

### 7.1 The Convergent Encryption Problem

In naive CAS systems, the same plaintext always produces the same ciphertext (because the encryption key is derived from the content itself). This enables **confirmation attacks**: an attacker can encrypt a known file and check whether its hash exists in the store, confirming that someone has uploaded that file.

**SGraph Send avoids this entirely.** Each transfer generates a random AES-256-GCM key. The same plaintext encrypted with different keys produces different ciphertext:

```
File: "secret.pdf"
Transfer 1: key_1 = random() -> ciphertext_1 = AES(key_1, "secret.pdf") -> hash_1
Transfer 2: key_2 = random() -> ciphertext_2 = AES(key_2, "secret.pdf") -> hash_2

hash_1 != hash_2  (different key -> different ciphertext -> different hash)
```

No information about file content leaks through CAS hashes because the hashes are of **encrypted** data, and the encryption is non-deterministic (random key + random IV per chunk).

### 7.2 What the Server Learns

With CAS, the server can observe:

| Observable | Current (single blob) | CAS Chunked | Information Leaked |
|-----------|----------------------|-------------|-------------------|
| Total transfer size | Yes | Yes | Same as current |
| Number of chunks | No | Yes | Reveals structure (but structure of ciphertext, not plaintext) |
| Chunk sizes | No | Yes (fixed: all equal; CDC: variable) | With fixed chunking: nothing new. With CDC: chunk boundary distribution reveals something about content structure |
| Chunk hash repetition within a transfer | No | Yes | Reveals that two regions of the file have identical encrypted content (same key + same plaintext + same chunk boundaries). Minimal information leakage since the key is random. |
| Chunk reuse across uploads of the same transfer | No | Yes | Reveals how much of the file changed between versions. Minimal concern since this is a single sender updating their own transfer. |

### 7.3 Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Cross-transfer confirmation attack | N/A | Not applicable -- random key per transfer means no cross-transfer hash correlation |
| Within-transfer chunk repetition reveals structure | Low | Reveals only that identical plaintext blocks exist at different positions in the same file. Attacker would need the key to exploit this. |
| Chunk count reveals file structure | Low | Fixed-size chunking reveals only file size (already known). CDC chunk sizes reveal content boundaries but of ciphertext, which correlates weakly with plaintext structure. |
| Delta upload reveals change volume | Low | Attacker can see how many chunks changed between versions of the same transfer. This reveals the approximate location and volume of edits but not their content. |

### 7.4 Recommendation

**CAS is safe for SGraph Send** because:

1. Encryption uses random keys (no convergent encryption).
2. CAS operates on **ciphertext**, not plaintext.
3. Cross-transfer dedup is impossible by construction (different keys = different hashes).
4. Information leakage is limited to structural metadata (chunk counts, change volume) that is low-value to an attacker.

**One constraint:** Do not implement CAS dedup across different transfers, even if they use the same key. This would require the server to correlate transfers, which contradicts the isolation model. Each transfer's chunks should be logically scoped to that transfer, even though they live in a shared CAS namespace. In practice, different transfers will always have different keys, so their chunk hashes will never collide anyway.

---

## 8. Implementation Plan: Client-Side (Browser)

### 8.1 Chunk Hash Computation

Web Crypto API provides hardware-accelerated SHA-256:

```javascript
async function sha256Hex(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray  = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
}
```

Performance: ~1 GB/s on modern hardware. Not a bottleneck.

### 8.2 Chunk Existence Check

Before uploading each chunk, the client checks whether the server already has it:

```javascript
async function chunkExists(transferId, chunkHash) {
    const response = await fetch(
        `${ApiClient.baseUrl}/transfers/chunk-exists/${transferId}/${chunkHash}`,
        { method: 'HEAD', headers: ApiClient.authHeaders() }
    );
    return response.status === 200;
}
```

For efficiency, the client can send a batch of hashes:

```javascript
async function checkChunkBatch(transferId, hashes) {
    const response = await fetch(
        `${ApiClient.baseUrl}/transfers/check-chunks/${transferId}`,
        {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json', ...ApiClient.authHeaders() },
            body    : JSON.stringify({ hashes: hashes })
        }
    );
    const result = await response.json();
    return result.existing;    // Set of hashes that already exist
}
```

### 8.3 CAS-Aware Upload Flow

```javascript
async function casUpload(file, encryptionKey) {
    // 1. Read and chunk the file
    const fileBuffer = await file.arrayBuffer();
    const chunks     = Array.from(fixedSizeChunks(fileBuffer, 4 * 1024 * 1024));

    // 2. Encrypt each chunk and compute hashes
    const preparedChunks = [];
    for (const chunk of chunks) {
        const encrypted = await SendCrypto.encryptChunk(encryptionKey, chunk.data);
        const hash      = await sha256Hex(new Uint8Array(encrypted));
        preparedChunks.push({
            index     : chunk.index,
            offset    : chunk.offset,
            hash      : `sha256:${hash}`,
            encrypted : encrypted,
            size      : encrypted.byteLength
        });
    }

    // 3. Create the transfer
    const transfer = await ApiClient.createChunkedTransfer({
        file_size_bytes : fileBuffer.byteLength,
        chunk_count     : preparedChunks.length,
        chunk_strategy  : 'fixed',
        storage_mode    : 'cas_chunked'
    });

    // 4. Check which chunks already exist (batch)
    const allHashes     = preparedChunks.map(c => c.hash);
    const existingSet   = new Set(
        await ApiClient.checkChunkBatch(transfer.transfer_id, allHashes)
    );

    // 5. Upload only new chunks
    let uploaded = 0;
    let skipped  = 0;
    for (const chunk of preparedChunks) {
        if (existingSet.has(chunk.hash)) {
            skipped++;
        } else {
            await ApiClient.uploadChunk(transfer.transfer_id, chunk.hash, chunk.encrypted);
            uploaded++;
        }
        emitProgress((uploaded + skipped) / preparedChunks.length);
    }

    // 6. Upload manifest and complete
    const manifest = preparedChunks.map(c => ({
        index  : c.index,
        hash   : c.hash,
        size   : c.size,
        offset : c.offset
    }));
    await ApiClient.uploadManifest(transfer.transfer_id, manifest);
    await ApiClient.completeTransfer(transfer.transfer_id);

    return {
        transferId     : transfer.transfer_id,
        chunksTotal    : preparedChunks.length,
        chunksUploaded : uploaded,
        chunksSkipped  : skipped
    };
}
```

### 8.4 Streaming Chunking (Future Enhancement)

For very large files, the entire file should not be loaded into memory. Using the `ReadableStream` API:

```javascript
async function* streamingChunks(file, chunkSize) {
    const stream = file.stream();
    const reader = stream.getReader();
    let buffer   = new Uint8Array(0);
    let index    = 0;

    while (true) {
        const { done, value } = await reader.read();

        if (value) {
            // Append to buffer
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;
        }

        // Emit full chunks
        while (buffer.length >= chunkSize) {
            yield {
                index : index++,
                data  : buffer.slice(0, chunkSize).buffer
            };
            buffer = buffer.slice(chunkSize);
        }

        if (done) {
            // Emit final partial chunk
            if (buffer.length > 0) {
                yield {
                    index : index,
                    data  : buffer.buffer
                };
            }
            break;
        }
    }
}
```

This keeps memory usage at approximately `2 * chunkSize` regardless of file size.

---

## 9. Implementation Plan: Server-Side (Python)

### 9.1 New API Endpoints

These endpoints extend `Routes__Transfers`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/transfers/create-chunked` | POST | Create a chunked/CAS transfer |
| `/transfers/check-chunks/{id}` | POST | Batch check which chunks exist |
| `/transfers/upload-chunk/{id}/{hash}` | POST | Upload a single chunk by hash |
| `/transfers/upload-manifest/{id}` | POST | Upload the chunk manifest |
| `/transfers/download-chunk/{id}/{hash}` | GET | Download a single chunk by hash |

### 9.2 Transfer Service Extensions

```python
# New methods on Transfer__Service (sketch -- not Type_Safe yet)

class Transfer__Service__CAS(Transfer__Service):

    def chunk_path(self, chunk_hash):
        """CAS path for a chunk: chunks/{prefix}/{hash}"""
        clean_hash = chunk_hash.replace('sha256:', '')
        prefix     = clean_hash[:2]
        return f'chunks/{prefix}/{clean_hash}'

    def manifest_path(self, transfer_id):
        """Path for transfer manifest"""
        return f'transfers/{transfer_id}/manifest.json'

    def has_chunk(self, chunk_hash):
        """Check if a CAS chunk exists"""
        return self.storage_fs.file__exists(self.chunk_path(chunk_hash))

    def check_chunks_batch(self, chunk_hashes):
        """Return the subset of hashes that already exist"""
        return [h for h in chunk_hashes if self.has_chunk(h)]

    def save_chunk(self, chunk_hash, chunk_bytes):
        """Store a chunk at its CAS path (idempotent)"""
        path = self.chunk_path(chunk_hash)
        if not self.storage_fs.file__exists(path):
            self.storage_fs.file__save(path, chunk_bytes)
        return True

    def load_chunk(self, chunk_hash):
        """Load a chunk by its CAS hash"""
        return self.storage_fs.file__bytes(self.chunk_path(chunk_hash))

    def save_manifest(self, transfer_id, manifest):
        """Save the chunk manifest for a transfer"""
        self.storage_fs.file__save(
            self.manifest_path(transfer_id),
            json.dumps(manifest).encode()
        )

    def load_manifest(self, transfer_id):
        """Load the chunk manifest for a transfer"""
        return self.storage_fs.file__json(self.manifest_path(transfer_id))

    def verify_transfer_completeness(self, transfer_id):
        """Verify all manifest chunks exist in the CAS store"""
        manifest = self.load_manifest(transfer_id)
        if not manifest:
            return False
        for chunk_entry in manifest.get('chunks', []):
            if not self.has_chunk(chunk_entry['hash']):
                return False
        return True

    def get_download_stream(self, transfer_id):
        """Yield chunks in order for download reassembly"""
        manifest = self.load_manifest(transfer_id)
        if not manifest:
            return None
        for chunk_entry in sorted(manifest['chunks'], key=lambda c: c['index']):
            chunk_bytes = self.load_chunk(chunk_entry['hash'])
            if chunk_bytes is None:
                raise ValueError(f"Missing chunk: {chunk_entry['hash']}")
            yield chunk_bytes
```

### 9.3 Backward Compatibility

The CAS system must coexist with existing single-blob transfers. The `storage_mode` field in `meta.json` determines the download path:

```python
def get_download_payload(self, transfer_id, downloader_ip, user_agent):
    meta = self.load_meta(transfer_id)
    storage_mode = meta.get('storage_mode', 'single')

    if storage_mode == 'single':
        # Current path: read single payload blob
        return self.storage_fs.file__bytes(self.payload_path(transfer_id))

    elif storage_mode == 'cas_chunked':
        # CAS path: reassemble from manifest
        chunks = []
        for chunk_bytes in self.get_download_stream(transfer_id):
            chunks.append(chunk_bytes)
        return b''.join(chunks)

    elif storage_mode == 'chunked':
        # AD-4 path: reassemble from positional chunks
        # ... existing chunked implementation ...
        pass
```

---

## 10. Garbage Collection

### 10.1 The Problem

In a CAS store, chunks are shared resources. A chunk may be referenced by:
- One manifest (common case)
- Multiple manifests of the same transfer (if the transfer was updated)
- Potentially multiple transfers (impossible in practice due to different encryption keys, but the system should be correct regardless)

When a transfer is deleted, its manifest is removed. But the chunks it referenced may still be needed by other manifests. Deleting a chunk that is still referenced would corrupt other transfers.

### 10.2 Reference Counting

Track how many manifests reference each chunk:

```python
# On manifest save: increment ref count for each chunk
for chunk_entry in manifest['chunks']:
    ref_path = f'chunks_refs/{chunk_entry["hash"]}'
    current  = int(storage_fs.file__str(ref_path) or '0')
    storage_fs.file__save(ref_path, str(current + 1).encode())

# On transfer delete: decrement ref count, delete chunk if zero
for chunk_entry in manifest['chunks']:
    ref_path = f'chunks_refs/{chunk_entry["hash"]}'
    current  = int(storage_fs.file__str(ref_path) or '1')
    if current <= 1:
        storage_fs.file__delete(self.chunk_path(chunk_entry['hash']))
        storage_fs.file__delete(ref_path)
    else:
        storage_fs.file__save(ref_path, str(current - 1).encode())
```

**Drawback:** Reference counting is fragile. A crash between deleting a manifest and decrementing refs leaves orphans. Race conditions in concurrent operations can corrupt counts.

### 10.3 Mark-and-Sweep (Recommended)

A periodic background process scans all manifests and builds the set of referenced chunks. Any chunk not in the set is unreferenced and can be deleted:

```python
def garbage_collect_chunks(storage_fs):
    """Mark-and-sweep GC for CAS chunks"""

    # MARK: scan all manifests, collect all referenced chunk hashes
    referenced = set()
    for path in storage_fs.files__paths():
        if path.endswith('/manifest.json'):
            manifest = storage_fs.file__json(path)
            if manifest:
                for chunk_entry in manifest.get('chunks', []):
                    referenced.add(chunk_entry['hash'])

    # SWEEP: find all chunk files, delete unreferenced ones
    deleted_count = 0
    for path in storage_fs.files__paths():
        if str(path).startswith('chunks/'):
            # Extract hash from path: chunks/{prefix}/{hash}
            parts      = str(path).split('/')
            chunk_hash = parts[-1] if len(parts) >= 3 else None
            if chunk_hash and f'sha256:{chunk_hash}' not in referenced:
                storage_fs.file__delete(path)
                deleted_count += 1

    return deleted_count
```

### 10.4 Practical Recommendation

**For the Explorer phase: do not implement garbage collection.** Reasons:

1. Storage is cheap (S3 costs ~$0.023/GB/month).
2. Each transfer already has an expiry date in the roadmap (Phase 7). When a transfer expires, delete its manifest. Orphaned chunks accumulate but the storage cost is negligible.
3. GC introduces complexity and edge cases (concurrent uploads during sweep, etc.).
4. The Villager team can add GC as a production hardening task.

**When GC becomes necessary:** Implement mark-and-sweep as a scheduled Lambda function (e.g., daily). Run it during low-traffic periods. Use S3 lifecycle rules as a safety net: tag unreferenced chunks with a deletion date, and let S3 auto-delete after a grace period (e.g., 7 days).

---

## 11. Performance Analysis

### 11.1 Client-Side Operations

| Operation | Throughput | Bottleneck? |
|-----------|-----------|-------------|
| SHA-256 hashing (Web Crypto) | ~1 GB/s | No |
| AES-256-GCM encryption (Web Crypto) | ~500 MB/s | No |
| Fixed-size chunking | ~10 GB/s (memory copy) | No |
| Content-defined chunking (Buzhash JS) | ~500 MB/s | No |
| Content-defined chunking (FastCDC WASM) | ~2 GB/s | No |
| FileReader.readAsArrayBuffer | Disk-speed limited | For very large files, yes (solved by streaming) |
| Network upload (per chunk) | Varies | Yes -- this is the primary bottleneck |

### 11.2 Server-Side Operations

| Operation | S3 Latency | In-Memory Latency |
|-----------|-----------|-------------------|
| Chunk existence check (HEAD) | ~50-100 ms | <1 ms |
| Batch chunk check (N HEADs) | ~50-100 ms * N (parallelizable) | <1 ms |
| Chunk write (PUT) | ~50-200 ms | <1 ms |
| Chunk read (GET) | ~50-100 ms | <1 ms |
| Manifest write | ~50-200 ms | <1 ms |

### 11.3 CAS Overhead vs. Benefit

For a first-time upload of a 100 MB file with 4 MB chunks (25 chunks):

| Step | Without CAS | With CAS | Overhead |
|------|------------|----------|----------|
| Chunk computation | N/A | ~100 ms | +100 ms |
| Hash computation | N/A | 25 * ~4 ms = 100 ms | +100 ms |
| Existence check (batch) | N/A | 1 request, ~100 ms | +100 ms |
| Upload | 25 chunk uploads | 25 chunk uploads | Same |
| Manifest upload | N/A | 1 write, ~100 ms | +100 ms |
| **Total overhead** | | | **~400 ms** |

For a re-upload where 20 of 25 chunks are unchanged:

| Step | Without CAS | With CAS | Savings |
|------|------------|----------|---------|
| Upload | 25 chunks (~100 MB) | 5 chunks (~20 MB) | **80 MB saved** |
| Network time (10 Mbps) | ~80 seconds | ~16 seconds | **64 seconds saved** |

The CAS overhead is negligible (~400 ms) compared to the potential savings (seconds to minutes of upload time).

### 11.4 Optimising S3 Existence Checks

S3 HEAD requests are the most expensive per-chunk operation. Optimisation strategies:

1. **Batch API:** Use the batch check endpoint (`POST /check-chunks`) to send all hashes in one request. Server parallelises S3 HEAD requests using `asyncio` or thread pool.

2. **Bloom filter cache:** Maintain an in-memory Bloom filter of known chunk hashes. False positives trigger unnecessary HEAD requests but no incorrect behaviour. False negatives are impossible (a chunk reported as missing will be uploaded and stored).

3. **Local manifest cache:** If the client is re-uploading a file it previously uploaded, it can keep the previous manifest locally and diff against it before contacting the server.

---

## 12. Reference Systems

### 12.1 restic (Most Relevant)

restic is an encrypted backup tool that closely mirrors SGraph Send's architecture:

| Feature | restic | SGraph Send (proposed) |
|---------|--------|----------------------|
| Encryption | AES-256-CTR + Poly1305 | AES-256-GCM |
| Chunking | CDC (Rabin, transitioning to FastCDC) | Fixed (Phase 1), CDC (Phase 4) |
| CAS | Yes, SHA-256 addressed | Yes, SHA-256 addressed |
| Dedup scope | Within repository (same master key) | Within transfer (same transfer key) |
| Storage backend | S3, local, SFTP, etc. | Memory-FS (S3, memory, disk) |
| GC | `restic prune` (mark-and-sweep) | Deferred |

**Key lesson from restic:** Their migration from Rabin to FastCDC was motivated by performance (3x faster chunking) with negligible dedup quality loss. Start with fixed-size for simplicity; upgrade to FastCDC when CDC becomes a priority.

### 12.2 Borg

| Feature | Borg | Relevance |
|---------|------|-----------|
| Chunking | Buzhash CDC | Simplest CDC algorithm to implement |
| Encryption | AES-256-CTR + HMAC-SHA-256 | Similar approach |
| Dedup | Content-addressed chunks | Same model |
| Compression | LZ4, LZMA, zstd (per chunk) | Future enhancement for SGraph Send |

**Key lesson from Borg:** Buzhash is the simplest CDC algorithm to implement correctly. If we need CDC before FastCDC WASM is ready, Buzhash is the pragmatic choice.

### 12.3 Git

| Feature | Git | Relevance |
|---------|-----|-----------|
| CAS | SHA-1 object store | Proven CAS model at massive scale |
| Delta | Packfile delta compression | Byte-level delta within packs; not applicable to our use case |
| GC | `git gc` packs loose objects | Mark-and-sweep model |

**Key lesson from Git:** CAS at scale requires periodic compaction (Git's packfiles). For SGraph Send, this is less relevant because chunks are large (MB, not KB like Git objects) and S3 handles scale natively.

### 12.4 IPFS

| Feature | IPFS | Relevance |
|---------|------|-----------|
| CAS | Multihash-addressed blocks | SHA-256 is one of the supported hashes |
| Chunking | Default 256 KB (configurable) | Smaller chunks than our recommendation |
| Merkle DAG | Files are trees of blocks | Our manifest is a flat list, not a tree |

**Key lesson from IPFS:** The Merkle DAG pattern (manifest references chunks by hash) is well-proven. IPFS's 256 KB chunks are too small for file transfer (too many HTTP requests); our 2-4 MB range is better for this use case.

---

## 13. Recommendations and Phasing

### 13.1 Phase 1: Fixed-Size Chunking with Hash-Based Storage Keys (Next)

**What to build:**
- Server stores chunks at `chunks/{hash_prefix}/{hash}` instead of `transfers/{id}/chunks/{index}`
- Manifest file per transfer references chunks by hash
- Batch chunk existence check endpoint
- Client computes chunk hash before upload, skips if exists

**Why this matters now:**
- Gets the storage layout right from the start (path convention is hard to change later)
- Enables upload resumption (the primary user-facing benefit)
- Zero additional client-side libraries needed (SHA-256 via Web Crypto)

**What to defer:**
- Content-defined chunking (use fixed-size for now)
- Delta upload UI (the CAS mechanism works, but no UI to "update an existing transfer")
- Garbage collection (storage is cheap)

### 13.2 Phase 2: Upload Resumption UI

**What to build:**
- Client-side storage of in-progress upload state (transfer_id, manifest so far)
- On upload failure: detect partially uploaded transfer, resume from last successful chunk
- UI indicator: "Resuming upload... 15 of 25 chunks already uploaded"

**Depends on:** Phase 1 CAS storage layout

### 13.3 Phase 3: Transfer Update / Delta Upload

**What to build:**
- "Update this transfer" flow: sender can re-encrypt a modified file with the same key
- Client diffs chunk hashes against previous manifest
- Only new chunks are uploaded; new manifest replaces old one
- Old manifest is retained in `transfers/{id}/manifests/{version}.json` for audit

**Depends on:** Phase 1 CAS storage, CDC implementation

### 13.4 Phase 4: Content-Defined Chunking (CDC)

**What to build:**
- FastCDC implementation (Rust -> WASM, or pure JavaScript Buzhash as fallback)
- Client selects chunking strategy based on file size and use case
- `chunk_strategy` field in manifest: `"fixed"` or `"cdc_fastcdc"` or `"cdc_buzhash"`
- Backward compatible: server handles both strategies transparently

**Depends on:** Phase 3 (delta uploads are the primary motivation for CDC)

### 13.5 Phase 5: Garbage Collection

**What to build:**
- Scheduled Lambda function for mark-and-sweep GC
- S3 lifecycle rules as safety net
- Admin console GC status indicator

**Depends on:** Transfer expiry implementation (Phase 7 of main roadmap)

### 13.6 Decisions Required

| Decision | Options | Recommendation | Impact |
|----------|---------|----------------|--------|
| **CAS-1: Start with hash-based storage keys?** | (A) Yes, from Phase 1 of chunking. (B) No, use positional keys first, migrate later. | **Option A.** Migrating storage keys later is painful. Getting the layout right from the start costs nothing extra. | Affects all subsequent chunk-related work. |
| **CAS-2: Fixed or CDC for Phase 1?** | (A) Fixed-size. (B) CDC from the start. | **Option A.** Fixed-size is simpler, gets CAS benefits (resumption, exact-match dedup), defers CDC complexity. | Affects Explorer implementation timeline. |
| **CAS-3: Chunk size?** | (A) 4 MB. (B) 5 MB. (C) Configurable, default 4 MB. | **Option C.** 4 MB default (power-of-two aligned), client can override. | Minor; affects chunk count and HTTP overhead trade-off. |
| **CAS-4: Garbage collection timing?** | (A) Implement with CAS. (B) Defer to Villager. | **Option B.** Storage cost of orphaned chunks is negligible during Explorer phase. | Reduces Explorer scope. |

---

## Appendix A: Quick Reference -- Key Differences from AD-4 Proposal

The AD-4 proposal in [v0.3.2 Action Plan Section 2](../26-02-14/v0.3.2__action-plan__explorer-next-steps.md) established the chunked upload architecture. This CAS research extends it:

| Aspect | AD-4 (Position-Addressed) | CAS Extension |
|--------|--------------------------|---------------|
| Chunk storage path | `transfers/{id}/chunks/{index}` | `chunks/{hash_prefix}/{hash}` |
| Chunk identity | By position (index) | By content (SHA-256 hash) |
| Duplicate detection | None | Automatic (same hash = same chunk) |
| Upload resumption | Client tracks uploaded indices | Client checks hashes; server confirms |
| Manifest | Implicit (chunk count in meta) | Explicit JSON file with hash list |
| Download reassembly | Read chunks 0..N in order | Read manifest, fetch chunks by hash in order |
| Delta upload | Not supported | Natural (only upload chunks with new hashes) |
| GC needed | No (chunks scoped to transfer) | Eventually (shared chunks may orphan) |

**The two approaches are compatible.** The server can support both `storage_mode: "chunked"` (AD-4) and `storage_mode: "cas_chunked"` simultaneously, determined per transfer. Existing chunked transfers continue to work; new transfers can opt into CAS.

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **CAS** | Content-Addressable Storage -- objects identified by the hash of their content |
| **CDC** | Content-Defined Chunking -- chunk boundaries determined by content, not position |
| **Manifest** | A JSON file listing the chunks that compose a transfer, each identified by hash |
| **Rolling hash** | A hash function that can be efficiently updated as a sliding window moves through data |
| **Convergent encryption** | Deriving the encryption key from the content itself; enables cross-user dedup but leaks information |
| **Mark-and-sweep** | A garbage collection strategy: mark all referenced objects, then delete unreferenced ones |
| **FastCDC** | A modern CDC algorithm (2020) that is 2-3x faster than Rabin fingerprinting with similar dedup quality |
| **Buzhash** | A simple rolling hash algorithm used by Borg backup for CDC |

---

*Research document complete. This serves as the architectural foundation for CAS integration. No implementation should begin until CAS-1 through CAS-4 decisions are approved.*
