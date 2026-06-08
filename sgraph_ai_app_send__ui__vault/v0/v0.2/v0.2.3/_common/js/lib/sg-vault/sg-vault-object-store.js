/* =================================================================================
   SGraph Vault — Content-Addressed Object Store
   v0.3.0 — Encrypted blob storage with self-describing content-addressed IDs

   Objects are stored as encrypted ciphertext. The object ID follows the
   four-segment format: "obj-cas-imm-" + hex(SHA256(ciphertext))[:12].
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
        await this._sgSend.vaultWrite(this._vaultId, filePath, this._writeKey, new Uint8Array(ciphertext))
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
        return 'obj-cas-imm-' + hex.slice(0, 12)
    }

    // --- Batch-load multiple objects by ID ---------------------------------------
    //     Checks the immutable block cache first; fetches uncached IDs in one
    //     or more batch requests (chunked at 50). Returns Map<objectId, ArrayBuffer>.
    //     Missing objects are omitted from the map (caller must handle).

    async batchLoad(objectIds) {
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

        const CHUNK = 50
        for (let i = 0; i < toFetch.length; i += CHUNK) {
            const chunk = toFetch.slice(i, i + CHUNK)
            const ops   = chunk.map(({ filePath }) => ({ op: 'read', file_id: filePath }))
            const raw   = await this._sgSend.vaultBatch(this._vaultId, null, ops)

            for (let j = 0; j < chunk.length; j++) {
                const r                    = raw[j]
                const { objectId, filePath } = chunk[j]
                if (r && r.status === 'ok' && r.data) {
                    const bytes = SGVaultObjectStore._b64ToAb(r.data)
                    result.set(objectId, bytes)
                    await this._cachePut(objectId, filePath, bytes)
                }
            }
        }

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
}
