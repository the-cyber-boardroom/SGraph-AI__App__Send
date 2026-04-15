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

    async _cacheGet(objectId, filePath) {
        if (!objectId.includes('-imm-') || typeof caches === 'undefined') return null
        try {
            const cache = await caches.open(SG_VAULT_CACHE_NAME)
            const hit   = await cache.match(this._cacheKey(filePath))
            if (hit) return hit.arrayBuffer()
        } catch (_) { /* storage unavailable — fall through to network */ }
        return null
    }

    async _cachePut(objectId, filePath, data) {
        if (!objectId.includes('-imm-') || typeof caches === 'undefined') return
        try {
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

    // --- Delete an object by ID --------------------------------------------------

    async delete(objectId) {
        const filePath = `bare/data/${objectId}`
        return this._sgSend.vaultDelete(this._vaultId, filePath, this._writeKey)
    }
}
