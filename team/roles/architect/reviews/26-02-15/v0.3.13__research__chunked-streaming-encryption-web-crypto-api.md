# v0.3.13 -- Research: Chunked/Streaming Encryption with Web Crypto API

**Role:** Architect
**Date:** 2026-02-15
**Version:** v0.3.13
**Status:** Research document / Implementation guide

---

## Table of Contents

1. [The Problem](#the-problem)
2. [AES-256-GCM Per-Chunk Encryption](#aes-256-gcm-per-chunk-encryption)
3. [Web Crypto API Implementation](#web-crypto-api-implementation)
4. [Node.js crypto Module Equivalent](#nodejs-crypto-module-equivalent)
5. [Key Wrapping and Distribution](#key-wrapping-and-distribution)
6. [Streaming Encryption Considerations](#streaming-encryption-considerations)
7. [Performance](#performance)
8. [Security Considerations](#security-considerations)
9. [Migration Path from Current Implementation](#migration-path-from-current-implementation)
10. [Multi-Runtime Compatibility](#multi-runtime-compatibility)
11. [References](#references)

---

## The Problem

The current SGraph Send implementation encrypts the entire file as a single AES-256-GCM operation. The relevant code is in `sgraph_ai_app_send__ui__user/v0/v0.1/v0.1.0/js/crypto.js`:

```javascript
// Current implementation (SendCrypto.encryptFile)
async encryptFile(key, fileData) {
    const iv         = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        fileData    // <-- entire file as a single ArrayBuffer
    );
    const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.byteLength);
    return result.buffer;
}
```

This approach produces:

```
[12-byte IV][ciphertext + 16-byte auth tag]
```

### Limitations

| Problem | Impact |
|---------|--------|
| Single IV + single ciphertext + single auth tag | Cannot verify or decrypt partial data |
| Must hold entire file in memory | Memory pressure for large files (50MB+) |
| Cannot encrypt/decrypt individual chunks | No parallelism in crypto operations |
| Cannot start decryption until full download completes | Latency: user waits for full download before anything happens |
| No resume capability | A failed download of a 100MB file must restart from zero |
| Single upload request | Lambda/API Gateway body limits, timeout risks |

### What We Need

Per-chunk encryption where each chunk is independently encrypted and can be independently decrypted. This enables:

- **Parallel upload**: encrypt and upload multiple chunks simultaneously
- **Parallel download + decrypt**: download chunks in parallel, decrypt each as it arrives
- **Resume**: re-download only the chunks that failed
- **Bounded memory**: only one chunk (e.g. 1MB) in memory per encrypt/decrypt operation
- **Streaming**: start decryption while later chunks are still downloading

---

## AES-256-GCM Per-Chunk Encryption

### How It Works

Each chunk is encrypted independently with the same per-file key but its own unique IV:

```
File: [chunk_0][chunk_1][chunk_2]...[chunk_N-1]

Encrypted:
  chunk_0 -> [IV_0][ciphertext_0 + tag_0]
  chunk_1 -> [IV_1][ciphertext_1 + tag_1]
  chunk_2 -> [IV_2][ciphertext_2 + tag_2]
  ...
  chunk_N-1 -> [IV_{N-1}][ciphertext_{N-1} + tag_{N-1}]
```

Key properties:

- **Stateless**: each chunk's encryption is independent -- no dependency on previous chunks
- **Same key**: the per-file AES-256 key is generated once, used for all chunks
- **Unique IV**: each chunk gets its own 12-byte IV (mandatory for GCM security)
- **Per-chunk authentication**: GCM produces an auth tag per chunk, verifying integrity on decrypt

### IV Generation Strategy

There are two viable strategies for generating the 12-byte IV per chunk.

#### Option A: Random IVs

Generate 12 cryptographically random bytes per chunk:

```javascript
const iv = crypto.getRandomValues(new Uint8Array(12));
```

**Safety margin**: with a 96-bit IV space, the birthday bound gives a 2^-32 collision probability after 2^32 encryptions under the same key. For per-chunk encryption, this means you could encrypt 4 billion chunks with the same key before collision risk becomes non-negligible. For practical file transfers (even at 1KB chunks on a 1TB file = ~1 billion chunks), this is safe.

**Tradeoff**: the IV must be transmitted with each chunk (already the case in the encrypted chunk format). Non-deterministic -- the same plaintext chunk produces different ciphertext each time.

#### Option B: Counter-Derived IVs

Derive the IV deterministically from the chunk index:

```javascript
const iv = new Uint8Array(12);
new DataView(iv.buffer).setUint32(8, chunkIndex, false); // big-endian
```

This places the chunk index in the last 4 bytes of the IV, with the first 8 bytes zeroed.

**Properties**:
- Deterministic: same chunk index always produces the same IV
- Guaranteed unique within a file (chunk indices are sequential)
- Simpler: no random generation needed
- Requires knowing the chunk index at encrypt/decrypt time (which we always do)

**Safety**: since each file uses a different key, IV reuse across files is irrelevant. Within a file, counter-derived IVs are guaranteed unique by construction (no birthday bound concern at all).

#### Recommendation: Counter-Derived IVs

Counter-derived IVs are the recommended approach for SGraph Send:

1. **Simpler**: deterministic, no CSPRNG call per chunk
2. **No collision risk**: uniqueness is guaranteed by construction, not probabilistic
3. **Verifiable**: the recipient can verify the IV matches the expected chunk index
4. **Reproducible**: re-encrypting the same chunk with the same key produces the same ciphertext (useful for upload retry)

The only requirement is that each file uses a unique key, which SGraph Send already guarantees (a fresh key is generated per transfer via `SendCrypto.generateKey()`).

### Authentication and Integrity

GCM provides per-chunk authentication through its built-in auth tag. However, per-chunk auth alone does not protect against **structural attacks** on the chunk sequence:

| Attack | Description | Per-chunk auth prevents? |
|--------|-------------|--------------------------|
| Tampering | Modify a chunk's ciphertext | Yes (auth tag fails) |
| Reordering | Swap chunk 3 and chunk 7 | **No** |
| Duplication | Send chunk 5 twice, skip chunk 6 | **No** |
| Deletion | Remove a chunk entirely | **No** |
| Truncation | Send only the first N of M chunks | **No** |

#### Solution: Additional Authenticated Data (AAD)

GCM supports AAD (Additional Authenticated Data) -- data that is authenticated but not encrypted. By including the chunk's position and context in the AAD, we bind each encrypted chunk to its intended position in the sequence:

```javascript
const aad = new TextEncoder().encode(JSON.stringify({
    chunk_index:  chunkIndex,
    total_chunks: totalChunks,
    transfer_id:  transferId
}));
```

This means:

- **Reordering fails**: chunk 3's AAD says `chunk_index: 3`. If placed at position 7, the decryptor uses AAD with `chunk_index: 7`, which does not match, and `decrypt()` throws.
- **Duplication fails**: a duplicate chunk at the wrong position has mismatched AAD.
- **Deletion/truncation detected**: the decryptor knows `total_chunks` and can verify all chunks are present.
- **Cross-transfer replay fails**: `transfer_id` binds each chunk to its specific transfer.

The AAD is not encrypted (it is metadata), but it is authenticated. Any mismatch causes GCM decryption to fail with an authentication error.

### Encrypted Chunk Format

Each encrypted chunk has the following binary layout:

```
[IV: 12 bytes][ciphertext: variable][auth tag: 16 bytes]
```

Note: the Web Crypto API appends the auth tag to the ciphertext in the `ArrayBuffer` returned by `encrypt()`. The tag is not a separate field -- it is the last 16 bytes (when `tagLength` is 128, the default) of the ciphertext output.

**Per-chunk overhead**: 28 bytes (12 bytes IV + 16 bytes auth tag).

| Chunk Size | Overhead | Overhead % |
|-----------|----------|------------|
| 1 KB | 28 bytes | 2.7% |
| 64 KB | 28 bytes | 0.04% |
| 256 KB | 28 bytes | 0.01% |
| 1 MB | 28 bytes | 0.003% |
| 4 MB | 28 bytes | 0.0007% |

For any practical chunk size (64KB+), the overhead is negligible.

---

## Web Crypto API Implementation

### Key Operations Summary

| Operation | Method | Purpose |
|-----------|--------|---------|
| Generate key | `crypto.subtle.generateKey()` | Create AES-256-GCM key |
| Encrypt chunk | `crypto.subtle.encrypt()` | Encrypt with IV + AAD |
| Decrypt chunk | `crypto.subtle.decrypt()` | Decrypt with IV + AAD |
| Export key | `crypto.subtle.exportKey('raw', key)` | Serialize for URL hash |
| Import key | `crypto.subtle.importKey('raw', ...)` | Deserialize from URL hash |

### Encrypt a Single Chunk

```javascript
/**
 * Encrypt a single chunk with AES-256-GCM.
 *
 * @param {CryptoKey}              key         - AES-256-GCM key (same for all chunks)
 * @param {ArrayBuffer|Uint8Array} plaintext   - Raw chunk data
 * @param {number}                 chunkIndex  - Zero-based chunk position
 * @param {number}                 totalChunks - Total number of chunks in the file
 * @param {string}                 transferId  - Transfer identifier
 * @returns {Promise<Uint8Array>}  Encrypted chunk: [IV (12)][ciphertext + tag]
 */
async function encryptChunk(key, plaintext, chunkIndex, totalChunks, transferId) {
    // Counter-derived IV: chunk index in last 4 bytes (big-endian)
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setUint32(8, chunkIndex, false);

    // AAD binds this chunk to its position and transfer
    const aad = new TextEncoder().encode(JSON.stringify({
        chunk_index:  chunkIndex,
        total_chunks: totalChunks,
        transfer_id:  transferId
    }));

    // Web Crypto encrypt -- returns ciphertext with auth tag appended
    const ciphertext = await crypto.subtle.encrypt(
        {
            name:           'AES-GCM',
            iv:             iv,
            additionalData: aad,
            tagLength:      128       // 16-byte auth tag (default)
        },
        key,
        plaintext
    );

    // Bundle: [12-byte IV][ciphertext + 16-byte tag]
    const result = new Uint8Array(12 + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), 12);
    return result;
}
```

### Decrypt a Single Chunk

```javascript
/**
 * Decrypt a single chunk encrypted with encryptChunk().
 *
 * @param {CryptoKey}              key         - AES-256-GCM key
 * @param {ArrayBuffer|Uint8Array} encrypted   - [IV (12)][ciphertext + tag]
 * @param {number}                 chunkIndex  - Expected chunk position
 * @param {number}                 totalChunks - Expected total chunks
 * @param {string}                 transferId  - Expected transfer ID
 * @returns {Promise<ArrayBuffer>} Decrypted plaintext
 * @throws {Error} If auth tag verification fails (tampered, wrong key, wrong position)
 */
async function decryptChunk(key, encrypted, chunkIndex, totalChunks, transferId) {
    const data       = new Uint8Array(encrypted);
    const iv         = data.slice(0, 12);
    const ciphertext = data.slice(12);

    // AAD must match exactly what was used during encryption
    const aad = new TextEncoder().encode(JSON.stringify({
        chunk_index:  chunkIndex,
        total_chunks: totalChunks,
        transfer_id:  transferId
    }));

    return await crypto.subtle.decrypt(
        {
            name:           'AES-GCM',
            iv:             iv,
            additionalData: aad,
            tagLength:      128
        },
        key,
        ciphertext
    );
}
```

### Full File Chunked Encryption

```javascript
/**
 * Encrypt a file into individually-encrypted chunks.
 *
 * @param {CryptoKey}              key        - AES-256-GCM key
 * @param {ArrayBuffer|Uint8Array} fileData   - Entire file plaintext
 * @param {string}                 transferId - Transfer identifier
 * @param {number}                 chunkSize  - Bytes per chunk (default 1MB)
 * @returns {Promise<Uint8Array[]>} Array of encrypted chunks
 */
async function encryptFileChunked(key, fileData, transferId, chunkSize = 1024 * 1024) {
    const data        = new Uint8Array(fileData);
    const totalChunks = Math.ceil(data.byteLength / chunkSize);
    const chunks      = [];

    for (let i = 0; i < totalChunks; i++) {
        const start     = i * chunkSize;
        const end       = Math.min(start + chunkSize, data.byteLength);
        const plaintext = data.slice(start, end);

        const encrypted = await encryptChunk(key, plaintext, i, totalChunks, transferId);
        chunks.push(encrypted);
    }

    return chunks;
}
```

### Full File Chunked Decryption (with parallel support)

```javascript
/**
 * Decrypt an array of encrypted chunks back into the original file.
 * Chunks can be decrypted in any order (or in parallel).
 *
 * @param {CryptoKey}     key            - AES-256-GCM key
 * @param {Uint8Array[]}  encryptedChunks - Array of encrypted chunks (in order)
 * @param {string}        transferId      - Transfer identifier
 * @returns {Promise<Uint8Array>} Reassembled plaintext file
 */
async function decryptFileChunked(key, encryptedChunks, transferId) {
    const totalChunks = encryptedChunks.length;

    // Decrypt all chunks in parallel
    const decryptedBuffers = await Promise.all(
        encryptedChunks.map((chunk, index) =>
            decryptChunk(key, chunk, index, totalChunks, transferId)
        )
    );

    // Calculate total size and reassemble
    const totalSize = decryptedBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result    = new Uint8Array(totalSize);
    let offset      = 0;

    for (const buffer of decryptedBuffers) {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    return result;
}
```

### Key Generation and Export (unchanged from current)

```javascript
// Generate a new per-file key
const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,                               // extractable
    ['encrypt', 'decrypt']
);

// Export to raw bytes for URL hash sharing
const rawKey = await crypto.subtle.exportKey('raw', key);
// -> 32 bytes (256 bits)

// Import from raw bytes
const importedKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
);
```

---

## Node.js crypto Module Equivalent

The Node.js built-in `crypto` module handles AES-GCM differently from the Web Crypto API: the auth tag is a separate value, not appended to the ciphertext.

### Encrypt a Chunk (Node.js crypto)

```javascript
const crypto = require('node:crypto');

/**
 * Encrypt a single chunk using Node.js crypto module.
 * Output format matches Web Crypto: [IV (12)][ciphertext][auth tag (16)]
 *
 * @param {Buffer} key        - 32-byte AES-256 key
 * @param {Buffer} plaintext  - Raw chunk data
 * @param {number} chunkIndex - Zero-based chunk position
 * @param {number} totalChunks
 * @param {string} transferId
 * @returns {Buffer} Encrypted chunk: [IV][ciphertext][tag]
 */
function encryptChunkNode(key, plaintext, chunkIndex, totalChunks, transferId) {
    // Counter-derived IV
    const iv = Buffer.alloc(12);
    iv.writeUInt32BE(chunkIndex, 8);

    // AAD
    const aad = Buffer.from(JSON.stringify({
        chunk_index:  chunkIndex,
        total_chunks: totalChunks,
        transfer_id:  transferId
    }));

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);

    const encrypted = Buffer.concat([
        cipher.update(plaintext),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();  // 16 bytes by default

    // Match Web Crypto format: [IV][ciphertext][tag]
    return Buffer.concat([iv, encrypted, authTag]);
}
```

### Decrypt a Chunk (Node.js crypto)

```javascript
/**
 * Decrypt a single chunk using Node.js crypto module.
 * Expects Web Crypto format: [IV (12)][ciphertext][auth tag (16)]
 *
 * @param {Buffer} key        - 32-byte AES-256 key
 * @param {Buffer} encrypted  - [IV][ciphertext][tag]
 * @param {number} chunkIndex
 * @param {number} totalChunks
 * @param {string} transferId
 * @returns {Buffer} Decrypted plaintext
 */
function decryptChunkNode(key, encrypted, chunkIndex, totalChunks, transferId) {
    const iv         = encrypted.subarray(0, 12);
    const authTag    = encrypted.subarray(encrypted.length - 16);   // last 16 bytes
    const ciphertext = encrypted.subarray(12, encrypted.length - 16);

    const aad = Buffer.from(JSON.stringify({
        chunk_index:  chunkIndex,
        total_chunks: totalChunks,
        transfer_id:  transferId
    }));

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);   // Must set BEFORE update/final

    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()                // Throws if auth tag verification fails
    ]);
}
```

### Critical Difference: Auth Tag Handling

| Aspect | Web Crypto API | Node.js `crypto` module |
|--------|---------------|------------------------|
| Encrypt output | Single `ArrayBuffer`: ciphertext + tag concatenated | `cipher.update()` + `cipher.final()` = ciphertext only |
| Auth tag retrieval | Included in the output (last 16 bytes) | Separate call: `cipher.getAuthTag()` |
| Decrypt input | Single `ArrayBuffer`: ciphertext + tag | Ciphertext passed to `decipher.update()` |
| Auth tag for decrypt | Included in the input (last N bytes) | Separate call: `decipher.setAuthTag(tag)` |
| Tag verification | Automatic (decrypt throws `OperationError`) | Automatic (`decipher.final()` throws if tag mismatch) |

The encrypted chunk format `[IV][ciphertext][auth tag]` is the same -- the difference is only in how the API exposes it. When interoperating between Web Crypto and Node.js crypto, you must split/concatenate the auth tag accordingly.

### Node.js Web Crypto API (Preferred for Cross-Runtime Code)

Node.js also provides the Web Crypto API, which behaves identically to the browser:

```javascript
// Node.js 19+: globalThis.crypto is available
const subtle = globalThis.crypto.subtle;

// Node.js 15+: available via require
const { webcrypto } = require('node:crypto');
const subtle = webcrypto.subtle;
```

Using Node.js's Web Crypto API means the same `encryptChunk()` and `decryptChunk()` functions from the browser section work unchanged in Node.js. This is the recommended approach for cross-runtime code.

---

## Key Wrapping and Distribution

The per-file symmetric key (AES-256) is the same key used for all chunks of a single file. The question is how this key is shared between sender and recipient.

### Current SGraph Send Approach: URL-Encoded Key

The current approach stores the key in the URL hash fragment:

```
https://send.sgraph.ai/send/v0/v0.1/v0.1.4/download.html#<transfer_id>/<base64url_key>
```

The hash fragment (`#...`) is never sent to the server. The key stays client-side. This approach is unchanged by chunked encryption -- the same key encrypts all chunks, and the same key is shared via the URL.

### Alternative: Passphrase-Derived Key

For scenarios where the URL should not contain the key:

```javascript
// Sender: derive key from passphrase
const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
);

const key = await crypto.subtle.deriveKey(
    {
        name:       'PBKDF2',
        salt:       salt,           // random, stored in transfer metadata
        iterations: 600000,         // OWASP recommendation for PBKDF2-SHA256
        hash:       'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
);

// Recipient: derive the same key from the same passphrase + salt
```

The salt would be stored in the transfer metadata (it is not secret). The passphrase is shared out-of-band (separate channel).

### Alternative: RSA/ECDH Key Wrapping (Multi-Recipient)

For future multi-recipient scenarios, the per-file key can be wrapped (encrypted) with each recipient's public key:

```javascript
// Wrap the file key with recipient's RSA-OAEP public key
const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    fileKey,
    recipientPublicKey,
    { name: 'RSA-OAEP' }
);

// Each recipient gets their own wrappedKey
// They unwrap with their private key to get the file key
```

This is out of scope for the current MVP but the per-chunk encryption architecture supports it -- the key distribution mechanism is orthogonal to the encryption format.

### Transfer Manifest

With chunked encryption, the transfer metadata needs a manifest describing the chunks:

```json
{
    "transfer_id":   "a1b2c3d4e5f6",
    "total_chunks":  12,
    "chunk_size":    1048576,
    "file_size":     11534336,
    "last_chunk_size": 534528,
    "encryption": {
        "algorithm":   "AES-256-GCM",
        "iv_strategy": "counter",
        "tag_length":  128,
        "aad_format":  "json"
    }
}
```

---

## Streaming Encryption Considerations

### Web Crypto API Is Not Streaming

The Web Crypto API's `encrypt()` and `decrypt()` methods are atomic operations: they take the full plaintext (or ciphertext) and return the full result. There is no streaming interface.

```javascript
// This is the ONLY way to encrypt with Web Crypto:
const ciphertext = await crypto.subtle.encrypt(algorithm, key, plaintext);
// No partial input, no streaming, no progressive output
```

### Per-Chunk Encryption IS the Streaming Solution

With per-chunk encryption, this limitation becomes irrelevant:

```
File stream:  [====chunk_0====][====chunk_1====][====chunk_2====]...
                    |                |                |
                    v                v                v
              encrypt(chunk_0) encrypt(chunk_1) encrypt(chunk_2)   <- each is atomic, ~1MB
                    |                |                |
                    v                v                v
              upload(enc_0)    upload(enc_1)    upload(enc_2)
```

Each `encrypt()` call operates on a single chunk (e.g. 1MB). The chunk IS the streaming unit. The Web Crypto API's atomicity is a non-issue because the input to each call is small and bounded.

### Memory Usage

Memory usage is bounded by the chunk size, not the file size:

| Chunk Size | Memory per encrypt | Memory for 4 parallel | Notes |
|-----------|-------------------|----------------------|-------|
| 256 KB | ~512 KB (in + out) | ~2 MB | Minimal |
| 1 MB | ~2 MB (in + out) | ~8 MB | Good default |
| 4 MB | ~8 MB (in + out) | ~32 MB | Large files |

The "in + out" factor accounts for both the plaintext input and the ciphertext output being in memory simultaneously during the `encrypt()` call.

### Parallel Chunk Encryption

Since chunks are independent, multiple chunks can be encrypted or decrypted simultaneously:

```javascript
// Encrypt 4 chunks in parallel
const PARALLEL = 4;
const encryptedChunks = [];

for (let batch = 0; batch < totalChunks; batch += PARALLEL) {
    const batchPromises = [];
    for (let i = batch; i < Math.min(batch + PARALLEL, totalChunks); i++) {
        const start = i * chunkSize;
        const end   = Math.min(start + chunkSize, fileData.byteLength);
        batchPromises.push(encryptChunk(key, fileData.slice(start, end), i, totalChunks, transferId));
    }
    const results = await Promise.all(batchPromises);
    encryptedChunks.push(...results);
}
```

### Integration with File Reading

For very large files, combine chunked reading with chunked encryption to avoid loading the entire file into memory:

```javascript
// Read file in chunks using File.slice() (Blob API)
async function* readFileChunks(file, chunkSize) {
    let offset = 0;
    while (offset < file.size) {
        const slice  = file.slice(offset, offset + chunkSize);
        const buffer = await slice.arrayBuffer();
        yield { data: new Uint8Array(buffer), index: Math.floor(offset / chunkSize) };
        offset += chunkSize;
    }
}

// Stream-encrypt: read a chunk, encrypt it, upload it, release memory
async function streamEncryptAndUpload(file, key, transferId, chunkSize) {
    const totalChunks = Math.ceil(file.size / chunkSize);

    for await (const { data, index } of readFileChunks(file, chunkSize)) {
        const encrypted = await encryptChunk(key, data, index, totalChunks, transferId);
        await uploadChunk(transferId, index, encrypted);
        // 'data' and 'encrypted' can be GC'd now
    }
}
```

---

## Performance

### AES-256-GCM Hardware Acceleration

AES-256-GCM is hardware-accelerated on modern CPUs via AES-NI instructions. The Web Crypto API delegates to the browser's native crypto implementation, which uses AES-NI when available.

| Platform | Typical Throughput | Notes |
|----------|-------------------|-------|
| Modern desktop (Chrome/Firefox) | 1-4 GB/s | AES-NI via Web Crypto |
| Mobile (ARM with crypto extensions) | 200-800 MB/s | ARMv8 crypto |
| Node.js (server) | 2-6 GB/s | OpenSSL via native bindings |

### Overhead Analysis

For a 100MB file with 1MB chunks (100 chunks):

| Operation | Time (estimated) | Notes |
|-----------|----------|-------|
| Encryption (100 chunks) | ~25-100 ms | 1-4 GB/s throughput |
| Per-chunk overhead | 2,800 bytes total | 28 bytes x 100 chunks |
| AAD serialization | ~1 ms total | JSON.stringify x 100 |
| IV generation | ~0 ms | Counter-derived, no CSPRNG |

**Conclusion**: encryption is not the bottleneck. Network I/O and chunking overhead dominate.

### Web Workers

For the browser, crypto operations can be offloaded to a Web Worker to avoid blocking the UI thread:

```javascript
// In the main thread:
const worker = new Worker('crypto-worker.js');

worker.postMessage({
    type:        'encrypt-chunk',
    keyRaw:      exportedKeyBytes,    // CryptoKey cannot be transferred; send raw bytes
    plaintext:   chunkData,
    chunkIndex:  i,
    totalChunks: n,
    transferId:  tid
}, [chunkData.buffer]);               // Transfer ownership (zero-copy)

// In crypto-worker.js:
self.onmessage = async (e) => {
    const { keyRaw, plaintext, chunkIndex, totalChunks, transferId } = e.data;
    const key = await crypto.subtle.importKey(
        'raw', keyRaw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const encrypted = await encryptChunk(key, plaintext, chunkIndex, totalChunks, transferId);
    self.postMessage({ type: 'chunk-encrypted', chunkIndex, encrypted }, [encrypted.buffer]);
};
```

Note: `CryptoKey` objects cannot be transferred to Web Workers via `postMessage`. The raw key bytes must be exported, transferred, and re-imported in the worker. This import is fast (~0.1ms).

---

## Security Considerations

### IV Uniqueness

With counter-derived IVs:
- **Within a file**: uniqueness is guaranteed by construction (sequential chunk indices)
- **Across files**: different files use different keys, so IV values are irrelevant across key boundaries
- **Nonce reuse catastrophe**: if the same IV is ever used with the same key for different plaintext, GCM's security is completely broken (keystream reuse + authentication key recovery). Counter-derived IVs prevent this by design.

NIST SP 800-38D recommends that for random 96-bit IVs, no more than 2^32 encryptions should be performed under the same key. Counter-derived IVs are not subject to this birthday bound since they are deterministic and unique.

### AAD Binding

The AAD contains `chunk_index`, `total_chunks`, and `transfer_id`:

| Attack | Without AAD | With AAD |
|--------|-------------|----------|
| Chunk reordering | Succeeds silently | Decryption fails (index mismatch) |
| Chunk deletion | Undetected | Detected (total_chunks mismatch or missing index) |
| Chunk duplication | Undetected | Decryption fails at wrong position |
| Cross-transfer replay | Succeeds | Decryption fails (transfer_id mismatch) |
| Truncation | Undetected | Detected (fewer chunks than total_chunks) |

### Key Scope

- One key per file (per transfer). Never reuse a key across files.
- SGraph Send already follows this pattern: `SendCrypto.generateKey()` creates a fresh key per upload.
- The key is 256 bits (32 bytes), generated via `crypto.subtle.generateKey()` which uses the platform's CSPRNG.

### Auth Tag Verification

GCM automatically verifies the auth tag during decryption:
- `crypto.subtle.decrypt()` throws `OperationError` if the tag does not match
- This covers: wrong key, tampered ciphertext, tampered AAD, wrong IV
- There is no way to bypass this check in the Web Crypto API

### Chunk Size and Security

There is no security impact from the choice of chunk size. GCM is secure for any plaintext length from 0 bytes to 2^39 - 256 bits (~64 GB). The chunk size is a performance and UX trade-off, not a security one.

### Threat Model Summary

| Threat | Mitigation |
|--------|-----------|
| Server reads plaintext | Impossible -- server only has ciphertext |
| Server modifies ciphertext | GCM auth tag detects tampering |
| Server reorders chunks | AAD with chunk_index detects reordering |
| Server drops chunks | AAD with total_chunks enables detection |
| Server replays chunks from another transfer | AAD with transfer_id prevents cross-transfer replay |
| MITM modifies in transit | GCM auth tag detects tampering |
| Key compromise | Out of scope -- key is in URL hash, never sent to server |

---

## Migration Path from Current Implementation

### Current Format (v0.1.x)

```
Single encrypted blob:
[12-byte IV][ciphertext + 16-byte auth tag]
  - No AAD
  - Entire file as one operation
  - Stored as a single payload file on server
```

### New Format (chunked)

```
Per-chunk encrypted blobs:
  chunk_0: [12-byte IV][ciphertext_0 + 16-byte tag]
  chunk_1: [12-byte IV][ciphertext_1 + 16-byte tag]
  ...
  - AAD with chunk_index, total_chunks, transfer_id
  - Each chunk stored separately on server
```

### Backward Compatibility

A transfer with `total_chunks == 1` and no AAD is equivalent to the current single-blob format. The migration can support both formats:

```javascript
async function decryptTransfer(key, encryptedPayload, transferInfo) {
    if (transferInfo.total_chunks === undefined || transferInfo.total_chunks <= 1) {
        // Legacy format: single-blob decryption (no AAD, entire payload)
        return await SendCrypto.decryptFile(key, encryptedPayload);
    }

    // New format: chunked decryption
    const chunks = splitIntoChunks(encryptedPayload, transferInfo);
    return await decryptFileChunked(key, chunks, transferInfo.transfer_id);
}
```

### Migration Steps

1. **Server-side**: add chunk upload/download endpoints alongside existing single-payload endpoints
2. **Transfer metadata**: add `total_chunks`, `chunk_size`, `encryption` fields to manifest
3. **Upload component**: split file into chunks, encrypt each, upload individually
4. **Download component**: download chunks (parallel), decrypt each, reassemble
5. **Backward compat**: detect format from transfer metadata (presence of `total_chunks`)
6. **Transition period**: both old and new formats coexist; new uploads use chunked, old downloads still work

### API Changes Required

New endpoints:

```
POST /transfers/upload/{transfer_id}/chunk/{chunk_index}   -- Upload a single encrypted chunk
GET  /transfers/download/{transfer_id}/chunk/{chunk_index}  -- Download a single encrypted chunk
GET  /transfers/manifest/{transfer_id}                      -- Get chunk manifest
```

The existing single-payload endpoints remain for backward compatibility.

### Storage Changes

Current storage layout:

```
transfers/{transfer_id}/
    meta.json
    payload          <- single blob
```

New storage layout:

```
transfers/{transfer_id}/
    meta.json        <- now includes chunk manifest
    chunks/
        0            <- encrypted chunk 0
        1            <- encrypted chunk 1
        ...
        N-1          <- encrypted chunk N-1
```

---

## Multi-Runtime Compatibility

The Web Crypto API is the universal interface for AES-256-GCM across all modern JavaScript runtimes:

| Runtime | `crypto.subtle` available | How to access |
|---------|--------------------------|---------------|
| All modern browsers | Yes | `window.crypto.subtle` or `globalThis.crypto.subtle` |
| Node.js 15+ | Yes (experimental) | `require('node:crypto').webcrypto.subtle` |
| Node.js 19+ | Yes (stable, global) | `globalThis.crypto.subtle` |
| Node.js 20+ (LTS) | Yes (stable, global) | `globalThis.crypto.subtle` |
| Deno | Yes | `crypto.subtle` (global) |
| Bun | Yes | `crypto.subtle` (global) |
| Cloudflare Workers | Yes | `crypto.subtle` (global) |

### Universal Code Pattern

```javascript
// This works in all runtimes (browser, Node.js 19+, Deno, Bun, CF Workers):
const subtle = globalThis.crypto.subtle;

const key = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
);
```

For Node.js 15-18 compatibility:

```javascript
const subtle = globalThis.crypto?.subtle
    ?? (await import('node:crypto')).webcrypto.subtle;
```

### Conclusion

The `encryptChunk()` and `decryptChunk()` functions defined in this document use only the Web Crypto API and run unchanged in all target runtimes. No runtime-specific code is needed for the core encryption logic.

The Node.js `crypto` module equivalent (shown in the Node.js section) is provided for reference and for cases where the Node.js-native API is preferred (e.g., streaming via `createCipheriv`). However, for SGraph Send, the Web Crypto API is the recommended single implementation.

---

## References

- [MDN: SubtleCrypto.encrypt()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) -- Web Crypto API encrypt method documentation
- [MDN: AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) -- AES-GCM algorithm parameters including additionalData (AAD)
- [Node.js Web Crypto API Documentation](https://nodejs.org/api/webcrypto.html) -- Node.js implementation of Web Crypto
- [Node.js crypto Module Documentation](https://nodejs.org/api/crypto.html) -- Native crypto module with createCipheriv
- [NIST SP 800-38D: GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final) -- Recommendation for GCM mode
- [RFC 8452: AES-GCM-SIV](https://www.rfc-editor.org/rfc/rfc8452.html) -- Nonce-misuse resistant alternative (reference only)
- [Practical Challenges with AES-GCM (NIST 2023)](https://csrc.nist.gov/csrc/media/Events/2023/third-workshop-on-block-cipher-modes-of-operation/documents/accepted-papers/Practical%20Challenges%20with%20AES-GCM.pdf) -- Birthday bound analysis for random nonces
- [W3C Web Cryptography API Level 2](https://w3c.github.io/webcrypto/) -- W3C specification
- [GCM Random Nonce Analysis (Neil Madden)](https://neilmadden.blog/2024/05/23/galois-counter-mode-and-random-nonces/) -- Detailed analysis of GCM nonce collision risks
