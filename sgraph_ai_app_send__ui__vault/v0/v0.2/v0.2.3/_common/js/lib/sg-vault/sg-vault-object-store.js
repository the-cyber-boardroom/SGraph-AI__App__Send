/* =================================================================================
   SGraph Vault — Content-Addressed Object Store
   v0.3.0 — Encrypted blob storage with self-describing content-addressed IDs

   Objects are stored as encrypted ciphertext. The object ID follows the
   four-segment format: "obj-cas-imm-" + hex(SHA256(ciphertext))[:12] on a format-1 vault
   and [:32] on a format-2 vault (sgit-ai 0.19 gate; see setFormat).
     - obj: data object (blob, tree, or commit)
     - cas: content-addressed (SHA256 of ciphertext)
     - imm: immutable (written once, never changes)

   Immutable block cache (Cache API):
     imm blocks are content-addressed — same objectId guarantees same ciphertext
     forever. They are cached in the browser's Cache API under:
       cache:  "sg-vault-blocks"
       key:    https://sgvault/{vaultId}/bare/data/{objectId}
                             ╰─────────────────────────────╯
                             e.g. jrinl85l/bare/data/obj-cas-imm-a2ad790bd3f1

     Only blocks whose objectId contains "-imm-" are cached.
     muw/snw refs are never passed to load() so they are never cached.

   Depends on: SGSend (sg-send.js), Web Crypto API
   ================================================================================= */

const SG_VAULT_CACHE_NAME = 'sg-vault-blocks'
const SG_VAULT_CACHE_URL  = 'https://sgvault/'   // synthetic scheme — not a real network request

// --- In-memory imm-block cache (universal tier) ----------------------------------
// The Cache API tier below is PERSISTENT but unavailable in null-origin sandboxed
// iframes (`sandbox="allow-scripts"` with no `allow-same-origin`) — `caches`,
// `localStorage`, and `indexedDB` all throw/are absent there. The ViV kernel and
// embedded apps run in exactly that context, so the Cache API tier is inert for them
// and every imm read re-hit the network. This in-memory Map needs no storage API, so
// it works EVERYWHERE (including null-origin). It is session-scoped (cleared on reload)
// and content-addressed-safe (imm objectId = SHA256(ciphertext), so a key never maps to
// stale bytes). Module-level: shared across object-store instances, byte-capped LRU.
const SG_MEM_CACHE      = new Map()                 // "vaultId/filePath" → ArrayBuffer
const SG_MEM_MAX_BYTES  = 64 * 1024 * 1024          // 64 MB ceiling (oldest evicted first)
let   SG_MEM_BYTES      = 0

function _sgMemGet(key) {
    const ab = SG_MEM_CACHE.get(key)
    if (ab === undefined) return null
    SG_MEM_CACHE.delete(key); SG_MEM_CACHE.set(key, ab)   // LRU touch (move to newest)
    return ab.slice(0)                                     // copy: callers may transfer/detach
}
function _sgMemPut(key, ab) {
    if (!ab || typeof ab.byteLength !== 'number') return
    if (ab.byteLength > SG_MEM_MAX_BYTES) return          // single block too big to cache
    if (SG_MEM_CACHE.has(key)) { SG_MEM_BYTES -= SG_MEM_CACHE.get(key).byteLength; SG_MEM_CACHE.delete(key) }
    const copy = ab.slice(0)
    SG_MEM_CACHE.set(key, copy); SG_MEM_BYTES += copy.byteLength
    while (SG_MEM_BYTES > SG_MEM_MAX_BYTES && SG_MEM_CACHE.size) {
        const oldest = SG_MEM_CACHE.keys().next().value
        SG_MEM_BYTES -= SG_MEM_CACHE.get(oldest).byteLength
        SG_MEM_CACHE.delete(oldest)
    }
}

class SGVaultObjectStore {

    constructor(sgSend, vaultId, writeKey) {
        this._sgSend  = sgSend
        this._vaultId = vaultId
        this._writeKey = writeKey
        this._batch   = null                                                     // write-buffer (array) when a batch scope is open
        this._idHexLen = 12                                                      // vault format 1; setFormat(2) → 32 (sgit-ai 0.19+)
    }

    // --- Vault format (sgit-ai 0.19 format gate) -----------------------------------
    // Format 1: 'obj-cas-imm-' + sha256[:12] (48-bit ids). Format 2: sha256[:32] (128-bit) for
    // every NEW object; existing objects keep their ids, so a raised vault mixes both widths
    // and every reader takes ids as opaque. The format is read from the branch index by
    // SGVault.open() and re-applied whenever the index is refreshed.
    get idHexLen() { return this._idHexLen }
    setFormat(format) {
        const f = Number(format) || 1
        this._idHexLen = (typeof SGVaultBranchIndex !== 'undefined')
            ? SGVaultBranchIndex.idHexLen({ format: f })
            : (f >= 2 ? 32 : 12)
    }

    // --- Write-batch scope (collapse a commit's PUTs into one POST /batch) --------
    //
    // A commit emits many writes — blob + tree + commit objects + clone/named refs +
    // branch index. As individual PUTs each is a non-simple cross-origin request, so the
    // browser sends a CORS preflight FIRST, and each object URL is unique (content-addressed)
    // so the preflight can never be cached. Batching them into one POST to the FIXED url
    // `…/batch/{vault_id}` turns N PUTs (+N preflights) into 1 POST (+1 preflight that DOES
    // cache via Access-Control-Max-Age). Re-entrant: nested begin/flush share the outermost
    // scope so an addFile's blob and the _commit it triggers land in a single batch.
    get batching() { return Array.isArray(this._batch) }

    beginBatch() { if (!this._batch) this._batch = [] }

    // Stage a raw write (objects via store(), refs/index via the ref manager). filePath is the
    // server file_id (e.g. bare/data/obj-…, bare/refs/ref-…). bytes is a Uint8Array/ArrayBuffer.
    _stage(filePath, bytes) {
        const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
        this._batch.push({ filePath, bytes: u8 })
    }

    discardBatch() { this._batch = null }

    async flushBatch() {
        const staged = this._batch
        this._batch = null
        if (!staged || !staged.length) return
        // Ordering is a correctness requirement: a ref/index must never be written before the
        // object it points at. Objects (bare/data/) first, then indexes, then refs. The server
        // processes batch ops in array order; vaultBatch chunks at 50 preserving order.
        const rank = (p) => p.startsWith('bare/data/') ? 0 : (p.startsWith('bare/indexes/') ? 1 : 2)
        staged.sort((a, b) => rank(a.filePath) - rank(b.filePath))
        const ops = staged.map(s => ({ op: 'write', file_id: s.filePath, data: SGVaultObjectStore._abToB64(s.bytes) }))
        await this._sgSend.vaultBatch(this._vaultId, this._writeKey, ops)
        // Populate the imm cache only AFTER a successful flush (so the cache reflects server truth).
        for (const s of staged) {
            const id = s.filePath.startsWith('bare/data/') ? s.filePath.slice('bare/data/'.length) : ''
            if (id.includes('-imm-')) this._cachePut(id, s.filePath, s.bytes.buffer.slice(s.bytes.byteOffset, s.bytes.byteOffset + s.bytes.byteLength))
        }
    }

    // --- Cache helpers (Cache API, imm blocks only) ------------------------------

    _cacheKey(filePath) {
        return SG_VAULT_CACHE_URL + this._vaultId + '/' + filePath
    }
    _memKey(filePath) {
        return this._vaultId + '/' + filePath
    }

    async _cacheGet(objectId, filePath) {
        // -muw- (mutable) objects bypass the cache entirely — short-circuit before
        // touching any cache so we don't pay the feature-detect cost on every read.
        if (!objectId.includes('-imm-')) return null

        // Tier 1: in-memory (works EVERYWHERE incl. null-origin sandboxed iframes).
        const mem = _sgMemGet(this._memKey(filePath))
        if (mem) return mem

        // Tier 2: Cache API (persistent, but unavailable in null-origin sandboxes).
        try {
            // `typeof caches` is NOT a safe probe for the sandboxed-context case:
            // in an iframe without `allow-same-origin`, `window.caches` is a defined
            // accessor that THROWS a SecurityError on read. `typeof` only suppresses
            // the ReferenceError for genuinely undeclared identifiers — once the
            // binding exists, the throw escapes. Hence the check MUST be inside the
            // try, not outside (bug 2026-06-07: blocked vault-open in null-origin
            // embed iframes; the catch's network-fallback path is the correct sink).
            if (typeof caches === 'undefined') return null
            const cache = await caches.open(SG_VAULT_CACHE_NAME)
            const hit   = await cache.match(this._cacheKey(filePath))
            if (hit) {
                const ab = await hit.arrayBuffer()
                _sgMemPut(this._memKey(filePath), ab)   // promote into the fast in-memory tier
                return ab
            }
        } catch (_) { /* sandboxed / unavailable — fall through to network */ }
        return null
    }

    async _cachePut(objectId, filePath, data) {
        if (!objectId.includes('-imm-')) return
        // Tier 1: in-memory — always (the only tier that works in null-origin iframes).
        _sgMemPut(this._memKey(filePath), data)
        // Tier 2: Cache API — persistent, best-effort.
        try {
            if (typeof caches === 'undefined') return     // sandbox-safe; see _cacheGet
            const cache = await caches.open(SG_VAULT_CACHE_NAME)
            // data.slice(0) copies the ArrayBuffer — the original is returned to caller
            await cache.put(
                this._cacheKey(filePath),
                new Response(data.slice(0), {
                    status:  200,
                    headers: { 'Content-Type': 'application/octet-stream' }
                })
            )
        } catch (_) { /* quota exceeded or storage unavailable — ignore */ }
    }

    // Test/diagnostic accessor for the module-level in-memory cache.
    static _memStats() { return { entries: SG_MEM_CACHE.size, bytes: SG_MEM_BYTES } }

    // --- Store an encrypted blob, return its content-addressed ID ----------------
    //     Stored at bare/data/{objectId} on server

    async store(ciphertext) {
        const objectId = await this.computeObjectId(ciphertext)
        const filePath = `bare/data/${objectId}`
        const bytes    = new Uint8Array(ciphertext)
        if (this.batching) {
            this._stage(filePath, bytes)                                         // one POST /batch at flush time
            return objectId                                                      // id is the content hash — no network needed
        }
        await this._sgSend.vaultWrite(this._vaultId, filePath, this._writeKey, bytes)
        await this._cachePut(objectId, filePath, ciphertext)                      // serve our own write back from cache
        return objectId
    }

    // --- Load encrypted blob by object ID ----------------------------------------
    //     Reads from bare/data/{objectId}; serves from cache if available.

    async load(objectId) {
        const filePath = `bare/data/${objectId}`
        const cached   = await this._cacheGet(objectId, filePath)
        if (cached) return cached

        const data = await this._sgSend.vaultRead(this._vaultId, filePath)
        if (!data) throw new Error(`Object not found: ${objectId}`)
        await this._cachePut(objectId, filePath, data)
        return data
    }

    // --- Load large blob via presigned S3 URL (bypasses Lambda response limit) ---
    //     Falls back to direct read if presigned URL is not available (memory mode).
    //     Also checks/fills the imm block cache.

    async loadLarge(objectId) {
        const filePath = `bare/data/${objectId}`
        const cached   = await this._cacheGet(objectId, filePath)
        if (cached) return cached

        const data = await this._sgSend.vaultReadLarge(this._vaultId, filePath)
        if (!data) throw new Error(`Object not found: ${objectId}`)
        await this._cachePut(objectId, filePath, data)
        return data
    }

    // --- Compute content-addressed object ID from ciphertext ---------------------

    async computeObjectId(ciphertext) {
        const bytes = ciphertext instanceof ArrayBuffer ? new Uint8Array(ciphertext) : ciphertext
        const hash  = await crypto.subtle.digest('SHA-256', bytes)
        const hex   = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        return 'obj-cas-imm-' + hex.slice(0, this._idHexLen)
    }

    // --- Batch-load multiple objects by ID ---------------------------------------
    //     Checks the immutable block cache first; fetches uncached IDs through the batch
    //     endpoint, 50 ids per POST (the Lambda's measured comfort zone; the server caps at
    //     100), with up to `concurrency` POSTs in flight at once — the sgit CLI's
    //     batch_read fans out the same way (16 workers, measured ~2x the throughput of 8 on
    //     the live API; HTTP/2 multiplexes them on one connection). A chunk the server
    //     refuses is split in two and
    //     retried, down to a single GET, exactly as the CLI does on a 502.
    //     Returns Map<objectId, ArrayBuffer>. Missing objects are omitted (caller handles).
    //     opts.failures (a Map) records WHY an id is missing — 'not_found' (the server says so),
    //     'error' (the server answered but could not read it), or the message of the request
    //     that failed — so a caller can tell an absent object from a network problem (the CLI's
    //     batch_read does the same with its `failures` dict). Without it a failure is silent.
    //     opts.onProgress(done, total) is called after every chunk lands.
    //     Cache writes are not awaited: the in-memory tier is filled synchronously, the Cache API
    //     tier in the background (one awaited put per object was ~2 ms × 10,000 on a big vault).

    static BATCH_CHUNK       = 50
    static BATCH_CONCURRENCY = 16

    async batchLoad(objectIds, opts) {
        opts = opts || {}
        if (!objectIds || !objectIds.length) return new Map()

        const unique  = [...new Set(objectIds)]
        const result  = new Map()
        const toFetch = []

        for (const objectId of unique) {
            const filePath = `bare/data/${objectId}`
            const cached   = await this._cacheGet(objectId, filePath)
            if (cached) result.set(objectId, cached)
            else        toFetch.push({ objectId, filePath })
        }

        if (!toFetch.length) return result

        const CHUNK    = opts.chunk || SGVaultObjectStore.BATCH_CHUNK
        const failures = opts.failures instanceof Map ? opts.failures : null
        const chunks   = []
        for (let i = 0; i < toFetch.length; i += CHUNK) chunks.push(toFetch.slice(i, i + CHUNK))
        let done = 0
        const report = () => { if (opts.onProgress) { try { opts.onProgress(done, toFetch.length) } catch (_) {} } }

        const fetchChunk = async (chunk) => {
            const ops = chunk.map(({ filePath }) => ({ op: 'read', file_id: filePath }))
            let raw
            try {
                raw = await this._sgSend.vaultBatch(this._vaultId, null, ops)
            } catch (err) {
                if (chunk.length > 1) {                                           // refused chunk: split in two (CLI rule)
                    const mid = Math.ceil(chunk.length / 2)
                    await fetchChunk(chunk.slice(0, mid)); await fetchChunk(chunk.slice(mid))
                    return
                }
                try {                                                             // a single object: plain GET
                    const data = await this._sgSend.vaultRead(this._vaultId, chunk[0].filePath)
                    if (data) { result.set(chunk[0].objectId, data); this._cachePut(chunk[0].objectId, chunk[0].filePath, data) }
                    else if (failures) failures.set(chunk[0].objectId, 'not_found')
                } catch (e) { if (failures) failures.set(chunk[0].objectId, (e && e.message) || 'request failed') }
                done += 1; report(); return
            }
            // results arrive in request order; match by file_id when the server echoes it, else by position
            const byFile = new Map()
            for (let j = 0; j < (raw || []).length; j++) { const r = raw[j]; if (r && r.file_id) byFile.set(r.file_id, r) }
            for (let j = 0; j < chunk.length; j++) {
                const { objectId, filePath } = chunk[j]
                const r = byFile.get(filePath) || (raw && raw[j])
                if (r && r.status === 'ok' && r.data) {
                    const bytes = SGVaultObjectStore._b64ToAb(r.data)
                    result.set(objectId, bytes)
                    this._cachePut(objectId, filePath, bytes)                      // not awaited: see above
                } else if (failures) {
                    failures.set(objectId, (r && r.status) || 'no result')
                }
            }
            done += chunk.length; report()
        }

        // bounded pool: `concurrency` chunks in flight, each worker pulling the next chunk
        const concurrency = Math.max(1, Math.min(opts.concurrency || SGVaultObjectStore.BATCH_CONCURRENCY, chunks.length))
        let next = 0
        const worker = async () => { while (next < chunks.length) { const c = chunks[next++]; await fetchChunk(c) } }
        await Promise.all(Array.from({ length: concurrency }, worker))

        return result
    }

    // --- Delete an object by ID --------------------------------------------------

    async delete(objectId) {
        const filePath = `bare/data/${objectId}`
        return this._sgSend.vaultDelete(this._vaultId, filePath, this._writeKey)
    }

    // --- Base64 → ArrayBuffer (used by batchLoad) --------------------------------

    static _b64ToAb(b64) {
        const bin   = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return bytes.buffer
    }

    // ArrayBuffer/Uint8Array → base64 (for batch write op `data`)
    static _abToB64(buf) {
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        return btoa(binary)
    }
}
