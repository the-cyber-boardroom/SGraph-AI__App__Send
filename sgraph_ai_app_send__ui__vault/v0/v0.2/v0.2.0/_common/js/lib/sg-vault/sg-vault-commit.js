/* =================================================================================
   SGraph Vault — Commit & Tree Object Management
   v0.3.0 — Encrypted-only metadata, encrypted commit messages

   Commit schema (commit_v2):
     { schema, parents[], tree_id, timestamp_ms, message_enc, branch_id, signature }
     - message_enc: AES-GCM encrypted commit message (base64)
     - No plaintext message field

   Tree schema (tree_v1):
     { schema, entries[] }
     Each entry: { name_enc, size_enc, content_hash_enc, blob_id, tree_id }
       - All metadata fields are encrypted (no plaintext name/size/content_hash)
       - blob_id points to a content-addressed object (for files)
       - tree_id points to a sub-tree object (for directories)

   All objects are stored via SGVaultObjectStore (content-addressed).

   Depends on: SGVaultObjectStore, SGSendCrypto, Web Crypto API
   ================================================================================= */

class SGVaultCommit {

    constructor(objectStore, readKey) {
        this._objectStore = objectStore
        this._readKey     = readKey
    }

    // --- Create a commit object, store it, return its object ID ------------------

    async createCommit({ parentIds = [], treeId, message = '', branchId = 'main' }) {
        // Encrypt commit message
        const msgPlain  = new TextEncoder().encode(message)
        const msgCipher = await SGSendCrypto.encrypt(msgPlain, this._readKey)
        const msgEnc    = SGVaultCommit._arrayBufferToBase64(msgCipher)

        const commit = {
            schema:       'commit_v2',
            parents:      parentIds,
            tree_id:      treeId,
            timestamp_ms: Date.now(),
            message_enc:  msgEnc,
            branch_id:    branchId,
            signature:    null
        }

        const plaintext  = new TextEncoder().encode(JSON.stringify(commit))
        const ciphertext = await SGSendCrypto.encrypt(plaintext, this._readKey)
        return this._objectStore.store(ciphertext)
    }

    // --- Load and decrypt a commit object ----------------------------------------

    async loadCommit(commitId) {
        const ciphertext = await this._objectStore.load(commitId)
        const plaintext  = await SGSendCrypto.decrypt(ciphertext, this._readKey)
        const commit     = JSON.parse(new TextDecoder().decode(plaintext))

        // Decrypt message_enc if present (commit_v2), fall back to plaintext message (commit_v1)
        if (commit.message_enc) {
            const msgCipher = SGVaultCommit._base64ToArrayBuffer(commit.message_enc)
            const msgPlain  = await SGSendCrypto.decrypt(msgCipher, this._readKey)
            commit.message  = new TextDecoder().decode(msgPlain)
        }

        return commit
    }

    // --- Create a tree object from flat entries, store it, return object ID ------

    async createTree(entries) {
        const encryptedEntries = await Promise.all(
            entries.map(entry => this._encryptTreeEntry(entry))
        )

        const tree = {
            schema:  'tree_v1',
            entries: encryptedEntries
        }

        const plaintext  = new TextEncoder().encode(JSON.stringify(tree))
        const ciphertext = await SGSendCrypto.encrypt(plaintext, this._readKey)
        return this._objectStore.store(ciphertext)
    }

    // --- Load and decrypt a tree object, returning entries with plaintext fields --

    async loadTree(treeId) {
        const ciphertext = await this._objectStore.load(treeId)
        const plaintext  = await SGSendCrypto.decrypt(ciphertext, this._readKey)
        const tree       = JSON.parse(new TextDecoder().decode(plaintext))

        tree.entries = await Promise.all(
            tree.entries.map(entry => this._decryptTreeEntry(entry))
        )

        return tree
    }

    // --- Encrypt individual tree entry fields ------------------------------------
    //     Only encrypted fields are stored — no plaintext name/size/content_hash

    async _encryptTreeEntry(entry) {
        const enc = async (value) => {
            if (value === null || value === undefined) return null
            const plain  = new TextEncoder().encode(String(value))
            const cipher = await SGSendCrypto.encrypt(plain, this._readKey)
            return SGVaultCommit._arrayBufferToBase64(cipher)
        }

        const result = {
            name_enc:         await enc(entry.name),
            blob_id:          entry.blob_id  || null,
            tree_id:          entry.tree_id  || null
        }

        // Only include size/hash for blobs (files), not for sub-trees (directories)
        if (entry.blob_id) {
            result.size_enc         = await enc(entry.size)
            result.content_hash_enc = await enc(entry.content_hash)
        }

        return result
    }

    // --- Decrypt individual tree entry fields ------------------------------------

    async _decryptTreeEntry(entry) {
        const dec = async (b64) => {
            if (!b64) return null
            const cipher = SGVaultCommit._base64ToArrayBuffer(b64)
            const plain  = await SGSendCrypto.decrypt(cipher, this._readKey)
            return new TextDecoder().decode(plain)
        }

        return {
            name:         await dec(entry.name_enc),
            size:         await dec(entry.size_enc) | 0,
            content_hash: await dec(entry.content_hash_enc),
            blob_id:      entry.blob_id  || null,
            tree_id:      entry.tree_id  || null
        }
    }

    // --- Compute content hash for dedup detection --------------------------------

    async computeContentHash(plaintext) {
        const bytes = plaintext instanceof ArrayBuffer ? new Uint8Array(plaintext) : plaintext
        const hash  = await crypto.subtle.digest('SHA-256', bytes)
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 12)
    }

    // --- Base64 helpers ----------------------------------------------------------

    static _arrayBufferToBase64(buffer) {
        const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    static _base64ToArrayBuffer(b64) {
        const binary = atob(b64)
        const bytes  = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes.buffer
    }
}
