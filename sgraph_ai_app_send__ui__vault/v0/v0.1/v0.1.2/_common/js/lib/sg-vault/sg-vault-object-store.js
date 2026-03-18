/* =================================================================================
   SGraph Vault — Content-Addressed Object Store
   v0.3.0 — Encrypted blob storage with self-describing content-addressed IDs

   Objects are stored as encrypted ciphertext. The object ID follows the
   four-segment format: "obj-cas-imm-" + hex(SHA256(ciphertext))[:12].
     - obj: data object (blob, tree, or commit)
     - cas: content-addressed (SHA256 of ciphertext)
     - imm: immutable (written once, never changes)

   Depends on: SGSend (sg-send.js), Web Crypto API
   ================================================================================= */

class SGVaultObjectStore {

    constructor(sgSend, vaultId, writeKey) {
        this._sgSend  = sgSend
        this._vaultId = vaultId
        this._writeKey = writeKey
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
    //     Reads from bare/data/{objectId}

    async load(objectId) {
        const filePath = `bare/data/${objectId}`
        const data = await this._sgSend.vaultRead(this._vaultId, filePath)
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
        return 'obj-cas-imm-' + hex.slice(0, 12)
    }

    // --- Delete an object by ID --------------------------------------------------

    async delete(objectId) {
        const filePath = `bare/data/${objectId}`
        return this._sgSend.vaultDelete(this._vaultId, filePath, this._writeKey)
    }
}
