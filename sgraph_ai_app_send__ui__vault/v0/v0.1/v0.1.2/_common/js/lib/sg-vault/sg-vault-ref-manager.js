/* =================================================================================
   SGraph Vault — Ref Manager
   v0.3.0 — Encrypted ref pointers with self-describing IDs

   A ref is a small encrypted file that points to a commit ID. It acts as the
   HEAD pointer for a branch. The ref file ID is deterministic (derived via HMAC
   from the vault's read key), using the four-segment format:
     - Named HEAD:    ref-pid-muw-{HMAC[:12]}  (multi-writer)
     - Clone branch:  ref-pid-snw-{HMAC[:12]}  (single-writer)

   Wire format: AES-256-GCM encrypted JSON: { "commit_id": "obj-cas-imm-..." }

   Depends on: SGSend, SGSendCrypto, Web Crypto API
   ================================================================================= */

class SGVaultRefManager {

    constructor(sgSend, vaultId, writeKey, readKey) {
        this._sgSend   = sgSend
        this._vaultId  = vaultId
        this._writeKey = writeKey
        this._readKey  = readKey
    }

    // --- Write ref: encrypt commit_id and store at bare/refs/{refFileId} --------

    async writeRef(refFileId, commitId) {
        const filePath  = `bare/refs/${refFileId}`
        const payload   = new TextEncoder().encode(JSON.stringify({ commit_id: commitId }))
        const encrypted = await SGSendCrypto.encrypt(payload, this._readKey)
        await this._sgSend.vaultWrite(this._vaultId, filePath, this._writeKey, new Uint8Array(encrypted))
    }

    // --- Read ref: decrypt and return commit_id ----------------------------------

    async readRef(refFileId) {
        const filePath  = `bare/refs/${refFileId}`
        const encrypted = await this._sgSend.vaultRead(this._vaultId, filePath)
        if (!encrypted) return null
        const decrypted = await SGSendCrypto.decrypt(encrypted, this._readKey)
        const parsed    = JSON.parse(new TextDecoder().decode(decrypted))
        return parsed.commit_id
    }
}
