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

    constructor(sgSend, vaultId, writeKey, readKey, objectStore = null) {
        this._sgSend      = sgSend
        this._vaultId     = vaultId
        this._writeKey    = writeKey
        this._readKey     = readKey
        this._objectStore = objectStore       // when set + batching, ref writes JOIN the commit batch
    }

    // Stage into the object store's active batch (one POST /batch) if one is open, else PUT now.
    async _putOrStage(filePath, bytes) {
        if (this._objectStore && this._objectStore.batching) {
            this._objectStore._stage(filePath, bytes)
        } else {
            await this._sgSend.vaultWrite(this._vaultId, filePath, this._writeKey, bytes)
        }
    }

    // --- Write ref: encrypt commit_id and store at bare/refs/{refFileId} --------

    async writeRef(refFileId, commitId) {
        const filePath  = `bare/refs/${refFileId}`
        const payload   = new TextEncoder().encode(JSON.stringify({ commit_id: commitId }))
        const encrypted = await SGSendCrypto.encrypt(payload, this._readKey)
        await this._putOrStage(filePath, new Uint8Array(encrypted))
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

    // --- Read branch index: decrypt and return parsed index ----------------------
    //
    // Branch index format (decrypted JSON):
    //   { "schema": "branch_index_v1", "branches": [
    //     { "branch_id": "branch-named-...", "branch_type": "named",
    //       "head_ref_id": "ref-pid-muw-...", "name": "...", "created_at": ... }
    //   ]}
    //
    // branch_type values: "named" | "clone"
    // head_ref_id format: ref-pid-(muw|snw)-[0-9a-f]{12}

    async readBranchIndex(branchIndexFileId) {
        const filePath  = `bare/indexes/${branchIndexFileId}`
        const encrypted = await this._sgSend.vaultRead(this._vaultId, filePath)
        if (!encrypted) return null
        const decrypted = await SGSendCrypto.decrypt(encrypted, this._readKey)
        return JSON.parse(new TextDecoder().decode(decrypted))
    }

    // --- Write a single-branch index (interop with the sgit CLI) -----------------
    //
    // Web-created vaults historically never wrote a CLI-format branch index, so
    // `sgit clone <web-vault>` hard-errored with "No branch index found" (the CLI now
    // has a fallback, but writing the index makes web vaults clonable by ANY CLI
    // version and discoverable by agents). Written on create() and on every push()
    // so the index always points at the current named ref. Stored at the same path
    // the CLI reads (`bare/indexes/`), encrypted under read_key like every ref.
    //
    // Stable plaintext per refFileId (no timestamp); the encrypted blob still carries a
    // fresh AES-GCM IV per write, so the index is small and cheap to re-write each push.
    // head_ref_id points at the NAMED ref (ref-pid-muw-*) — never the clone ref — so the
    // CLI keeps cloning the canonical published branch (see the CLI interop briefs).
    async writeBranchIndex(branchIndexFileId, refFileId) {
        if (!branchIndexFileId || !refFileId) return
        const filePath = `bare/indexes/${branchIndexFileId}`
        const index    = { schema: 'branch_index_v1', branches: [
            { branch_id: 'branch-named-main', branch_type: 'named', head_ref_id: refFileId, name: 'main' }
        ]}
        const payload   = new TextEncoder().encode(JSON.stringify(index))
        const encrypted = await SGSendCrypto.encrypt(payload, this._readKey)
        await this._putOrStage(filePath, new Uint8Array(encrypted))
    }
}
