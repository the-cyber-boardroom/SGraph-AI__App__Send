/* =================================================================================
   SGraph Vault — Branch Operations
   v0.2.0 — getBranches, getCurrentBranchName, switchBranch

   Extends SGVault.prototype. Must load after sg-vault.js.

   Branch index (branch_index_v1) is read during open() and stored as _branchIndex.
   Only CLI-created vaults have a populated branch index; web-UI-created vaults
   return an empty branch list (single implicit branch via _refFileId).

   switchBranch(headRefId):
     1. Read target branch's named ref live → commitId
     2. Set _refFileId, _namedHeadId, _headCommitId to target
     3. Rebuild in-memory tree from target commit
   ================================================================================= */

(function() {
    'use strict';

    Object.assign(SGVault.prototype, {

        // --- Return all branches from the branch index --------------------------

        getBranches() {
            if (!this._branchIndex?.branches) return []
            return this._branchIndex.branches.map(b => ({
                branch_id:   b.branch_id,
                branch_type: b.branch_type,
                head_ref_id: b.head_ref_id,
                name:        b.name || b.branch_type || b.branch_id,
                created_at:  b.created_at || null
            }))
        },

        // --- Return the name of the currently active branch ---------------------

        getCurrentBranchName() {
            if (!this._branchIndex?.branches) return null
            const current = this._branchIndex.branches.find(b => b.head_ref_id === this._refFileId)
            return current?.name || current?.branch_type || null
        },

        // --- Switch to a different branch by its head_ref_id -------------------

        async switchBranch(headRefId) {
            const commitId = await this._refManager.readRef(headRefId)
            if (!commitId) throw new Error(`Branch ref not found: ${headRefId}`)

            this._refFileId    = headRefId
            this._namedHeadId  = commitId
            this._headCommitId = commitId

            await this._loadTreeFromCommit(commitId)
        }

    });
})();
