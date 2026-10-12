/* =================================================================================
   SGraph Vault — Ref Manager
   v0.3.0 — Encrypted ref pointers with self-describing IDs

   A ref is a small encrypted file that points to a commit ID. It acts as the
   HEAD pointer for a branch. The ref file ID is deterministic (derived via HMAC
   from the vault's read key), using the four-segment format:
     - Named HEAD:    ref-pid-muw-{HMAC[:12]}  (multi-writer)
     - Clone branch:  ref-pid-snw-{HMAC[:12]}  (single-writer)

   Wire format: AES-256-GCM encrypted JSON: { "commit_id": "obj-cas-imm-..." }

   Also owns the branch index (shared with the sgit CLI — see upsertBranchIndex) and the
   public signing keys at bare/keys/.

   Depends on: SGSend, SGSendCrypto, SGVaultBranchIndex, SGVaultSigning, Web Crypto API
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
        const encrypted = new Uint8Array(await SGSendCrypto.encrypt(payload, this._readKey))
        await this._putOrStage(filePath, encrypted)
        if (!(this._objectStore && this._objectStore.batching)) this._rememberRaw(refFileId, encrypted)   // a flushed write is what the server holds
        else this._pendingRaw(refFileId, encrypted)
    }

    // A staged ref write lands at flushBatch(); until then the server still holds the old bytes.
    // SGVault._withBatch calls commitPendingRaw() after a successful flush.
    _pendingRaw(refFileId, bytes) {
        if (!this._rawPending) this._rawPending = Object.create(null)
        this._rawPending[refFileId] = bytes
    }
    commitPendingRaw() {
        if (!this._rawPending) return
        for (const [id, bytes] of Object.entries(this._rawPending)) this._rememberRaw(id, bytes)
        this._rawPending = null
    }
    discardPendingRaw() { this._rawPending = null }

    // --- Read ref: decrypt and return commit_id ----------------------------------

    async readRef(refFileId) {
        const filePath  = `bare/refs/${refFileId}`
        const encrypted = await this._sgSend.vaultRead(this._vaultId, filePath)
        this._rememberRaw(refFileId, encrypted)
        if (!encrypted) return null
        const decrypted = await SGSendCrypto.decrypt(encrypted, this._readKey)
        const parsed    = JSON.parse(new TextDecoder().decode(decrypted))
        return parsed.commit_id
    }

    // --- Raw ciphertext cache (for compare-and-swap) ------------------------------
    // Refs are AES-GCM with a fresh IV per write, so two writes of the same commit_id
    // are different bytes. The server's CAS compares raw bytes, so we keep the exact
    // ciphertext we last READ per ref id. `null` = "we read it and it was absent".

    _rememberRaw(refFileId, encrypted) {
        if (!this._rawRefs) this._rawRefs = Object.create(null)
        this._rawRefs[refFileId] = encrypted ? new Uint8Array(encrypted) : null
    }

    lastRawRef(refFileId) {
        return (this._rawRefs && refFileId in this._rawRefs) ? this._rawRefs[refFileId] : undefined
    }

    // --- Write ref, compare-and-swap -------------------------------------------------
    // Succeeds only if the server still holds the exact bytes we last read for this ref
    // (or nothing, if we last saw it absent). On success the cache is updated to the
    // bytes we just wrote; on conflict the cache is updated to the server's CURRENT
    // bytes (so the next readRef→merge→retry cycle can succeed) and 'ECAS' is thrown.
    // Throws 'ENOMATCH' if the ref was never read through this manager.

    async writeRefIfMatch(refFileId, commitId) {
        const raw = this.lastRawRef(refFileId)
        if (raw === undefined) {
            const e = new Error('writeRefIfMatch: ref never read: ' + refFileId); e.code = 'ENOMATCH'; throw e
        }
        const filePath  = `bare/refs/${refFileId}`
        const payload   = new TextEncoder().encode(JSON.stringify({ commit_id: commitId }))
        const encrypted = new Uint8Array(await SGSendCrypto.encrypt(payload, this._readKey))
        const results   = await this._sgSend.vaultBatch(this._vaultId, this._writeKey, [{
            op      : 'write-if-match',
            file_id : filePath,
            data    : SGSend._abToB64(encrypted),
            match   : raw ? SGSend._abToB64(raw) : null
        }])
        const r = results && results[0]
        if (r && r.status === 'ok') {
            this._rawRefs[refFileId] = encrypted
            return true
        }
        if (r && r.status === 'conflict') {
            this._rawRefs[refFileId] = r.current ? SGSend._b64ToBytes(r.current) : null
            const e = new Error('writeRefIfMatch: ref moved on server: ' + refFileId); e.code = 'ECAS'; throw e
        }
        const e = new Error('writeRefIfMatch: unexpected batch result ' + JSON.stringify(r || null)); e.code = 'EUNREACH'; throw e
    }

    // --- Branch index: a SHARED document (sgit-ai 0.19+ contract) ------------------
    //
    // Decrypted JSON (Schema__Branch_Index):
    //   { "schema": "branch_index_v1",
    //     "branches": [ { branch_id, name, branch_type: "named"|"clone", head_ref_id,
    //                     public_key_id, private_key_id, created_at, creator_branch, display_name } ],
    //     "format": 1|2, "min_client": "X.Y.Z", "features": [...],     ← the gate (absent = format 1)
    //     "tags": [ { name, tag_id, timestamp_ms, deleted } ] }         ← 0.21 signed tags (+ tombstones)
    //
    // Two clients write it. The rule both now follow: read the server copy, MERGE (branches by
    // id, the gate as the server has it, tags per name, unknown members kept), write with
    // compare-and-swap against the exact bytes read, re-read and re-merge on conflict. The old
    // single-entry overwrite erased every CLI clone branch, its keys, the tags and the gate on
    // every web push (the CLI repaired it on its next pull — sgit.ai history-integrity §6).

    async readBranchIndex(branchIndexFileId) {
        const { index } = await this.readBranchIndexRaw(branchIndexFileId)
        return index
    }

    // { raw: Uint8Array|null (exact server bytes, the CAS match), index: object|null }
    async readBranchIndexRaw(branchIndexFileId) {
        const filePath  = `bare/indexes/${branchIndexFileId}`
        const encrypted = await this._sgSend.vaultRead(this._vaultId, filePath)
        if (!encrypted) return { raw: null, index: null }
        const raw = new Uint8Array(encrypted)
        let index = null
        try {
            const decrypted = await SGSendCrypto.decrypt(raw, this._readKey)
            index = JSON.parse(new TextDecoder().decode(decrypted))
        } catch (_) { index = null }                                 // present but unreadable: caller decides
        return { raw, index }
    }

    // Write the whole index with compare-and-swap. `raw` null = the server has none (plain write).
    // Returns true on success; on a CAS miss throws 'ECAS' with e.current = the server's bytes now.
    async writeBranchIndexIfMatch(branchIndexFileId, index, raw) {
        const filePath  = `bare/indexes/${branchIndexFileId}`
        const payload   = new TextEncoder().encode(JSON.stringify(index))
        const encrypted = new Uint8Array(await SGSendCrypto.encrypt(payload, this._readKey))
        const results   = await this._sgSend.vaultBatch(this._vaultId, this._writeKey, [{
            op      : raw ? 'write-if-match' : 'write',
            file_id : filePath,
            data    : SGSend._abToB64(encrypted),
            match   : raw ? SGSend._abToB64(raw) : null
        }])
        const r = results && results[0]
        if (r && r.status === 'ok') return true
        if (r && r.status === 'conflict') {
            const e = new Error('branch index moved on server: ' + branchIndexFileId); e.code = 'ECAS'
            e.current = r.current ? SGSend._b64ToBytes(r.current) : null; throw e
        }
        const e = new Error('branch index write: unexpected batch result ' + JSON.stringify(r || null)); e.code = 'EUNREACH'; throw e
    }

    // Merge our entries into the server's copy and write it back (CAS, up to 3 rounds).
    //   entries  : [branch meta objects] — upserted by branch_id (ours win per field over a
    //              same-id entry; every other entry, the gate, tags and unknown members are kept)
    //   opts.namedRefId : ensure a named entry 'current' exists pointing at this ref (never
    //              replaces an existing named entry)
    // Returns { index, written } — the merged index as the server now holds it.
    async upsertBranchIndex(branchIndexFileId, entries, opts) {
        if (!branchIndexFileId) return { index: null, written: false }
        opts = opts || {}
        const BI = SGVaultBranchIndex
        const ours = { schema: 'branch_index_v1', branches: [] }
        for (const e of entries || []) if (e && e.branch_id) ours.branches.push(Object.assign({}, e))

        let { raw, index: remote } = await this.readBranchIndexRaw(branchIndexFileId)
        for (let attempt = 0; attempt < 3; attempt++) {
            if (raw && !remote) {                                      // present but undecryptable: never overwrite
                const e = new Error('branch index on the server does not decrypt; nothing was written'); e.code = 'EINDEX'; throw e
            }
            let merged = remote ? BI.merge(ours, remote) : BI.merge(ours, null)
            // our entries win per field (the CLI's merge lets the remote win; this is OUR registration)
            for (const mine of ours.branches) {
                const cur = merged.branches.find(b => String(b.branch_id) === String(mine.branch_id))
                if (cur) Object.assign(cur, mine)
            }
            if (opts.namedRefId && !merged.branches.some(b => b.branch_type === 'named')) {
                const hex = (branchIndexFileId.match(/[0-9a-f]+$/) || ['00000000'])[0]
                merged.branches.push({ branch_id: 'branch-named-' + hex, branch_type: 'named', head_ref_id: opts.namedRefId, name: 'current' })
            }
            if (remote && BI.same(merged, remote)) {
                return { index: merged, written: false }               // nothing to add: no write
            }
            try {
                await this.writeBranchIndexIfMatch(branchIndexFileId, merged, raw)
                this._lastIndex = merged
                return { index: merged, written: true }
            } catch (err) {
                if (!err || err.code !== 'ECAS') throw err
                if (err.current) {                                     // the conflict reply carries the current bytes
                    raw = err.current
                    try { remote = JSON.parse(new TextDecoder().decode(await SGSendCrypto.decrypt(raw, this._readKey))) } catch (_) { remote = null }
                } else {
                    ({ raw, index: remote } = await this.readBranchIndexRaw(branchIndexFileId))
                }
            }
        }
        const e = new Error('the branch index changed on the server 3 times while this write was retried; nothing was written. Try again.')
        e.code = 'ECAS'; throw e
    }

    // Kept for callers that only know the named ref: upserts the named entry (interop with the
    // sgit CLI: `branch_id` MUST match ^branch-(named|clone)-[0-9a-f]{8,64}$ and `name` MUST be
    // "current" — hardcoded in the CLI's workflow steps).
    async writeBranchIndex(branchIndexFileId, refFileId) {
        if (!branchIndexFileId || !refFileId) return
        return this.upsertBranchIndex(branchIndexFileId, [], { namedRefId: refFileId })
    }

    // --- Signing keys: bare/keys/<key-rnd-imm-…> --------------------------------------
    // {"type":"public","pem":"-----BEGIN PUBLIC KEY-----…"} encrypted under the read key, exactly
    // what Vault__Key_Manager.store_public_key writes and Vault__Key_Fetch accepts.

    async readPublicKeyPem(keyId) {
        if (!keyId || !SGVaultSigning.KEY_ID_RE.test(String(keyId))) return null
        const encrypted = await this._sgSend.vaultRead(this._vaultId, `bare/keys/${keyId}`)
        if (!encrypted) return null
        try {
            const data = JSON.parse(new TextDecoder().decode(await SGSendCrypto.decrypt(encrypted, this._readKey)))
            if (data && data.type === 'public' && typeof data.pem === 'string' && data.pem.includes('PUBLIC KEY')) return data.pem
        } catch (_) {}
        return null
    }

    async publicKeyExists(keyId) {
        const encrypted = await this._sgSend.vaultRead(this._vaultId, `bare/keys/${keyId}`)
        return !!encrypted
    }

    async writePublicKey(keyId, plainBytes) {
        const encrypted = new Uint8Array(await SGSendCrypto.encrypt(plainBytes, this._readKey))
        await this._sgSend.vaultWrite(this._vaultId, `bare/keys/${keyId}`, this._writeKey, encrypted)
    }
}