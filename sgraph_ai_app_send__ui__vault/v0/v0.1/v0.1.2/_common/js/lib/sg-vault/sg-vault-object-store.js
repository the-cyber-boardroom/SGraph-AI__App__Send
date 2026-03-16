/* =================================================================================
   SGraph Vault — Content-Addressed Object Store
   v0.2.0 — Encrypted blob storage with SHA-256 content addressing

   Objects are stored as encrypted ciphertext. The object ID is derived from the
   SHA-256 hash of the ciphertext: "obj-" + hex(SHA256(ciphertext))[:12].
   This means the server only ever sees encrypted data, and identical ciphertext
   (which is practically impossible due to random IVs) would deduplicate.

   Depends on: SGSend (sg-send.js), Web Crypto API
   ================================================================================= */

class SGVaultObjectStore {

    constructor(sgSend, vaultId, writeKey) {
        this._sgSend  = sgSend
        this._vaultId = vaultId
        this._writeKey = writeKey
    }

    // --- Store an encrypted blob, return its content-addressed ID ----------------

    async store(ciphertext) {
        const objectId = await this.computeObjectId(ciphertext)
        await this._sgSend.vaultWrite(this._vaultId, objectId, this._writeKey, new Uint8Array(ciphertext))
        return objectId
    }

    // --- Load encrypted blob by object ID ----------------------------------------

    async load(objectId) {
        const data = await this._sgSend.vaultRead(this._vaultId, objectId)
        if (!data) throw new Error(`Object not found: ${objectId}`)
        return data
    }

    // --- Compute content-addressed object ID from ciphertext ---------------------

    async computeObjectId(ciphertext) {
        const bytes = ciphertext instanceof ArrayBuffer ? new Uint8Array(ciphertext) : ciphertext
        const hash  = await crypto.subtle.digest('SHA-256', bytes)
        const hex   = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        return 'obj-' + hex.slice(0, 12)
    }

    // --- Delete an object by ID --------------------------------------------------

    async delete(objectId) {
        return this._sgSend.vaultDelete(this._vaultId, objectId, this._writeKey)
    }
}
