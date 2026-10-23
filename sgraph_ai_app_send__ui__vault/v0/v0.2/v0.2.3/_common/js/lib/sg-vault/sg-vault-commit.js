/* =================================================================================
   SGraph Vault — Commit & Tree Object Management
   v0.4.0 — sgit-ai 0.21 parity: signed commit_v1, deterministic CLI-identical trees

   Commit schema (commit_v1 — the ten members the sgit CLI's Schema__Object_Commit holds):
     { schema, tree_id, message_enc, branch_id, signature, author_key_id, author_signature,
       parents, timestamp_ms, attestations }
     - message_enc: AES-GCM encrypted commit message (base64, random IV)
     - signature:   ECDSA P-256 / SHA-256 over the RFC 8785 (JCS) form of the commit minus
                    `signature`, raw r||s base64 (SGVaultSigning); null when unsigned
     - author_key_id: bare/keys/<key-rnd-imm-…> of the signing key; null when unsigned
     - branch_id:   this device's clone branch (branch-clone-<16 hex>) when signed, else null
     Older web commits were `commit_v2` with 7 members; loadCommit reads both.

   Tree schema (tree_v1) — byte-identical to the CLI's Vault__Sub_Tree._store_tree:
     plaintext = Python json.dumps(tree.json()) (", " / ": " separators), member order
       {"schema": "tree_v1", "entries": [ {blob_id, tree_id, name_enc, size_enc,
                                           content_hash_enc, content_type_enc, large}, … ]}
     entries: files sorted by name, then folders sorted by name (code-point order);
     folder entries carry only tree_id + name_enc (the rest null / false);
     every *_enc field and the tree itself use the DETERMINISTIC IV
       IV = HMAC-SHA256(read_key, plaintext)[:12]
     so identical folder content gives the identical tree id in the browser and in sgit.

   All objects are stored via SGVaultObjectStore (content-addressed, format-aware ids).

   Depends on: SGVaultObjectStore, SGSendCrypto, SGVaultPyJson, SGVaultPyMimetypes,
               SGVaultJcs, SGVaultSigning, Web Crypto API
   ================================================================================= */

class SGVaultCommit {

    // hmacKey: the read key imported for HMAC (deterministic IVs). Read-only sessions, which
    // never write trees, may pass null.
    constructor(objectStore, readKey, hmacKey = null) {
        this._objectStore = objectStore
        this._readKey     = readKey
        this._hmacKey     = hmacKey
    }

    // --- Create a commit object, store it, return its object ID ------------------
    //   signer (optional): an SGVaultSigner — the commit is signed with its key and carries
    //   its branch id and key id. Without one the commit is unsigned (signature null).

    async createCommit({ parentIds = [], treeId, message = '', branchId = null, signer = null, timestampMs = null }) {
        // Encrypt commit message (random IV, as the CLI's encrypt_metadata)
        const msgPlain  = new TextEncoder().encode(message)
        const msgCipher = await SGSendCrypto.encrypt(msgPlain, this._readKey)
        const msgEnc    = SGVaultCommit._arrayBufferToBase64(msgCipher)

        let bid = signer ? signer.branchId : branchId
        if (bid != null && !SGVaultSigning.BRANCH_ID_RE.test(String(bid))) {
            if (signer) throw new Error(`refusing to sign a commit with branch_id "${bid}": the sgit CLI would rewrite it and the signature would read as bad`)
            bid = null                                             // metadata only on an unsigned commit
        }

        // Member order = the CLI's Schema__Object_Commit (irrelevant to the signature, which is
        // over the sorted JCS form, but keeps the stored bytes identical to a CLI commit).
        const commit = {
            schema:           'commit_v1',
            tree_id:          treeId,
            message_enc:      msgEnc,
            branch_id:        bid,
            signature:        null,
            author_key_id:    signer ? signer.keyId : null,
            author_signature: null,
            parents:          (parentIds || []).filter(Boolean),
            timestamp_ms:     timestampMs != null ? Number(timestampMs) : Date.now(),
            attestations:     []
        }
        if (signer) commit.signature = await signer.sign(SGVaultSigning.signingBytes(commit))

        const plaintext  = new TextEncoder().encode(JSON.stringify(commit))
        const ciphertext = await SGSendCrypto.encrypt(plaintext, this._readKey)
        return this._objectStore.store(ciphertext)
    }

    // --- Load and decrypt a commit object ----------------------------------------

    async loadCommit(commitId) {
        const ciphertext = await this._objectStore.load(commitId)
        const plaintext  = await SGSendCrypto.decrypt(ciphertext, this._readKey)
        const commit     = JSON.parse(new TextDecoder().decode(plaintext))

        // Decrypt message_enc if present, fall back to a plaintext message (very old commits)
        if (commit.message_enc) {
            try {
                const msgCipher = SGVaultCommit._base64ToArrayBuffer(commit.message_enc)
                const msgPlain  = await SGSendCrypto.decrypt(msgCipher, this._readKey)
                commit.message  = new TextDecoder().decode(msgPlain)
            } catch (_) { commit.message = '(message could not be decrypted)' }
        }

        return commit
    }

    // --- Create a tree object from flat entries, store it, return object ID ------
    //     entries: [{ name, size, content_hash, content_type?, large?, blob_id, tree_id }]

    async createTree(entries) {
        const files   = entries.filter(e => e.blob_id)
        const folders = entries.filter(e => !e.blob_id && e.tree_id)
        const byName  = (a, b) => SGVaultJcs.cmpCodePoints(String(a.name), String(b.name))
        files.sort(byName); folders.sort(byName)

        const encryptedEntries = []
        for (const e of files)   encryptedEntries.push(await this._encryptTreeEntry(e))
        for (const e of folders) encryptedEntries.push(await this._encryptTreeEntry(e))

        const tree = { schema: 'tree_v1', entries: encryptedEntries }
        const plaintext  = new TextEncoder().encode(SGVaultPyJson.dumps(tree))
        const ciphertext = await this._encryptDeterministic(plaintext)
        return this._objectStore.store(ciphertext)
    }

    // --- Load and decrypt a tree object, returning entries with plaintext fields --

    async loadTree(treeId) {
        const ciphertext = await this._objectStore.load(treeId)
        return this.parseTree(ciphertext)
    }

    // Decrypt a tree object already in hand (bulk loaders fetch many at once, then parse).
    async parseTree(ciphertext) {
        const plaintext  = await SGSendCrypto.decrypt(ciphertext, this._readKey)
        const tree       = JSON.parse(new TextDecoder().decode(plaintext))
        tree.entries = await Promise.all(
            (tree.entries || []).map(entry => this._decryptTreeEntry(entry))
        )
        return tree
    }

    // --- Encrypt individual tree entry fields (deterministic, CLI member order) ----

    async _encryptTreeEntry(entry) {
        const enc = async (value) => {
            if (value === null || value === undefined) return null
            const plain  = new TextEncoder().encode(String(value))
            const cipher = await this._encryptDeterministic(plain)
            return SGVaultCommit._arrayBufferToBase64(cipher)
        }

        if (entry.blob_id) {
            // Missing or null → guess as the CLI does (`entry.get('content_type') or
            // mimetypes.guess_type(...) or application/octet-stream`), so an entry carried forward
            // from a pre-2026-10 tree (no content_type_enc) gets the same bytes the CLI would write.
            // `omit_content_type` keeps it null (only the CLI's synthetic test vector needs that).
            const contentType = entry.omit_content_type ? null
                              : (entry.content_type || SGVaultPyMimetypes.contentTypeFor(entry.name))
            return {
                blob_id:          entry.blob_id,
                tree_id:          null,
                name_enc:         await enc(entry.name),
                size_enc:         await enc(String(entry.size | 0)),
                content_hash_enc: await enc(entry.content_hash == null ? '' : entry.content_hash),
                content_type_enc: await enc(contentType),
                large:            !!entry.large
            }
        }
        return {                                                   // a folder: Schema__Object_Tree_Entry(tree_id, name_enc)
            blob_id:          null,
            tree_id:          entry.tree_id || null,
            name_enc:         await enc(entry.name),
            size_enc:         null,
            content_hash_enc: null,
            content_type_enc: null,
            large:            false
        }
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
            content_type: await dec(entry.content_type_enc),
            large:        !!entry.large,
            blob_id:      entry.blob_id  || null,
            tree_id:      entry.tree_id  || null
        }
    }

    // Trees and entry fields: HMAC-derived IV when the HMAC key is known (every writable
    // session); a session without it cannot write trees deterministically — refuse rather
    // than silently fall back to random IVs, which would make tree ids differ from the CLI's.
    async _encryptDeterministic(plain) {
        if (!this._hmacKey) throw new Error('SGVaultCommit: no HMAC key — cannot write deterministic trees (read-only session?)')
        return SGSendCrypto.encryptDeterministic(plain, this._readKey, this._hmacKey)
    }

    // --- Compute content hash for dedup detection (sha256[:12], same as the CLI) ------

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
