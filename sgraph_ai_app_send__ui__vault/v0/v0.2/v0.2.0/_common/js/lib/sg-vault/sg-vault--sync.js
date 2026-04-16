/* =================================================================================
   SGraph Vault — Sync Operations
   v0.2.0 — push, pull, getAheadCount, getBehindCount

   Extends SGVault.prototype. Must load after sg-vault.js.

   Two-ref model:
     Named ref (ref-pid-muw-*) — published state, advances only on push()
     Clone ref (ref-pid-snw-*) — working state, advances on every _commit()

   Conflict model: fast-forward only. pull() refuses if clone has unpushed commits.
   ================================================================================= */

(function() {
    'use strict';

    Object.assign(SGVault.prototype, {

        // --- Ahead count: commits on clone not yet on named branch ---------------

        async getAheadCount() {
            if (!this._namedHeadId || this._headCommitId === this._namedHeadId) return 0

            let count  = 0
            let cursor = this._headCommitId
            const max  = 100

            while (cursor && cursor !== this._namedHeadId && count < max) {
                count++
                try {
                    const commit = await this._commitManager.loadCommit(cursor)
                    cursor = commit.parents?.[0] || null
                } catch (_) { break }
            }

            return count
        },

        // --- Push: fast-forward named branch ref to clone HEAD ------------------

        async push() {
            if (!this._cloneRefFileId) throw new Error('No clone branch initialised')
            if (!this.writable)        throw new Error('Read-only: no write key')
            await this._refManager.writeRef(this._refFileId, this._headCommitId)
            this._namedHeadId = this._headCommitId
        },

        // --- Behind count: new commits on named branch not yet in clone ----------

        async getBehindCount() {
            const serverNamedHead = await this._refManager.readRef(this._refFileId)
            if (!serverNamedHead || serverNamedHead === this._namedHeadId) return 0

            let count  = 0
            let cursor = serverNamedHead
            const max  = 100

            while (cursor && cursor !== this._namedHeadId && count < max) {
                count++
                try {
                    const commit = await this._commitManager.loadCommit(cursor)
                    cursor = commit.parents?.[0] || null
                } catch (_) { break }
            }

            return count
        },

        // --- Pull: fast-forward clone to named branch HEAD (no merge) -----------

        async pull() {
            if (!this.writable) throw new Error('Read-only: no write key')

            if (this._headCommitId !== this._namedHeadId) {
                throw new Error('Cannot pull: you have unpushed local commits. Push first, then pull.')
            }

            const serverNamedHead = await this._refManager.readRef(this._refFileId)
            if (!serverNamedHead || serverNamedHead === this._headCommitId) return false

            this._namedHeadId  = serverNamedHead
            this._headCommitId = serverNamedHead

            await this._refManager.writeRef(this._cloneRefFileId, serverNamedHead)
            await this._loadTreeFromCommit(serverNamedHead)

            return true
        }

    });
})();
