/* =================================================================================
   SGraph Public Vault Previews — Owner write path
   v0.1.0 — publish / update / unpublish + owner-vault bookkeeping

   Storage: the preview is an ordinary SG/Send transfer at the deterministic
   transfer-id, encrypted under the public-derived key. The owner holds a RANDOM
   delete_auth (NEVER derived from the public string) stored inside their own
   encrypted vault at .vault/owner/public-previews/<public-id>.json — so a later edit on
   any device can delete-then-recreate at the same id (the share link never changes).

   Depends on: PublicPreviewCrypto, PublicPreviewSchema, an SGSend instance (with the
   owner's access token), and an opened SGVault (for bookkeeping).
   ================================================================================= */

const PublicPreviewWrite = {

    BK_FOLDER:  '.vault/owner/public-previews',
    BK_SCHEMA:  'sgraph-public-preview-bookkeeping/v1',

    // --- bookkeeping helpers ---------------------------------------------------
    async _ensureFolder(vault, path) {
        const parts = path.split('/').filter(Boolean)
        let cur = ''
        for (const part of parts) {
            const next = cur ? `${cur}/${part}` : part
            if (!vault.listFolder(next)) {
                try { await vault.createFolder(next) } catch (_) { /* race / already exists */ }
            }
            cur = next
        }
    },

    async readBookkeeping(vault, publicId) {
        try {
            const buf = await vault.getFile(this.BK_FOLDER, `${publicId}.json`)
            return JSON.parse(new TextDecoder().decode(buf))
        } catch (_) {
            return null
        }
    },

    async _writeBookkeeping(vault, publicId, obj) {
        await this._ensureFolder(vault, this.BK_FOLDER)
        const bytes = new TextEncoder().encode(JSON.stringify(obj, null, 2))
        const fileName = `${publicId}.json`
        const exists = vault.listFolder(this.BK_FOLDER)?.some(e => e.name === fileName)
        if (exists) await vault.updateFile(this.BK_FOLDER, fileName, bytes)
        else        await vault.addFile(this.BK_FOLDER, fileName, bytes)
    },

    // --- publish ---------------------------------------------------------------
    // expiry: { expiresAtMs?: number|null, maxAccessCount?: number|null, autoDelete?: bool }
    async publishPreview({ sgSend, vault, publicId, preview, expiry = {} }) {
        const idCheck = PublicPreviewSchema.validatePublicId(publicId)
        if (!idCheck.ok) throw Object.assign(new Error(idCheck.reason), { code: 'bad-id' })
        const id = idCheck.id

        const full = Object.assign(PublicPreviewSchema.emptyPreview(), preview, { schema: PublicPreviewSchema.SCHEMA_ID })
        if (vault && vault._vaultId) full.vault_id = vault._vaultId   // lets the open page reject a valid-but-WRONG-vault key
        if (expiry.expiresAtMs || expiry.maxAccessCount) {
            full.expiry = { expires_at_ms: expiry.expiresAtMs || null, max_access_count: expiry.maxAccessCount || null }
        }
        const vCheck = PublicPreviewSchema.validatePreview(full)
        if (!vCheck.ok) throw Object.assign(new Error(vCheck.reason), { code: 'bad-preview' })

        const transferId     = await PublicPreviewCrypto.deriveTransferId(id)
        const writeKey       = await PublicPreviewCrypto.deriveWriteKey(id)
        const deleteAuth     = PublicPreviewCrypto.randomDeleteAuth()
        const deleteAuthHash = await PublicPreviewCrypto.sha256Hex(deleteAuth)

        const plaintext = new TextEncoder().encode(JSON.stringify(full))
        const cipher    = await PublicPreviewCrypto.encrypt(plaintext.buffer, writeKey)

        try {
            await sgSend.upload(cipher, {
                transferId,
                deleteAuthHash,
                allowRecreate: true,                                 // delete clears the meta → delete-then-recreate works (same share link on edit)
                contentType:  'application/json',
                expiresAt:    expiry.expiresAtMs || 0,
                maxDownloads: expiry.maxAccessCount || 0,
                autoDelete:   !!expiry.autoDelete
            })
        } catch (err) {
            if (/\(409\)/.test(err.message)) {
                // transfer-id already exists. If we don't hold its delete_auth, the readable name is taken.
                throw Object.assign(new Error('That public id is already taken. Choose another.'), { code: 'id-taken' })
            }
            throw err
        }

        const prior = await this.readBookkeeping(vault, id)
        const bookkeeping = {
            schema:          this.BK_SCHEMA,
            public_id:       id,
            transfer_id:     transferId,
            delete_auth:     deleteAuth,
            current_version: (prior?.current_version || 0) + 1,
            expiry:          { expires_at_ms: expiry.expiresAtMs || null, max_access_count: expiry.maxAccessCount || null, auto_delete: !!expiry.autoDelete },
            published_at_ms: Date.now(),
            api_base:        sgSend.endpoint,
            active:          true
        }
        await this._writeBookkeeping(vault, id, bookkeeping)
        return { transferId, publicId: id, deleteAuth }
    },

    // --- update (delete-then-recreate at the same id; same share link) ---------
    // Works because publishPreview creates with allow_recreate:true, so
    // delete_transfer clears the metadata (not just a tombstone) and the same
    // transfer-id can be recreated. The share link is unchanged across edits.
    async updatePreview({ sgSend, vault, publicId, preview, expiry = {} }) {
        const id = PublicPreviewSchema.validatePublicId(publicId).id || publicId
        const bk = await this.readBookkeeping(vault, id)
        if (bk && bk.transfer_id && bk.delete_auth) {
            try { await sgSend.deleteTransfer(bk.transfer_id, bk.delete_auth) }
            catch (err) { if (!/\(404\)|not_found/.test(err.message)) throw err }   // already gone is fine
        }
        return this.publishPreview({ sgSend, vault, publicId: id, preview, expiry })
    },

    // --- unpublish -------------------------------------------------------------
    async unpublishPreview({ sgSend, vault, publicId }) {
        const id = PublicPreviewSchema.validatePublicId(publicId).id || publicId
        const bk = await this.readBookkeeping(vault, id)
        if (bk && bk.transfer_id && bk.delete_auth) {
            try { await sgSend.deleteTransfer(bk.transfer_id, bk.delete_auth) }
            catch (err) { if (!/\(404\)|not_found/.test(err.message)) throw err }
            bk.active = false
            bk.unpublished_at_ms = Date.now()
            await this._writeBookkeeping(vault, id, bk)
        }
        return { publicId: id }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PublicPreviewWrite }
