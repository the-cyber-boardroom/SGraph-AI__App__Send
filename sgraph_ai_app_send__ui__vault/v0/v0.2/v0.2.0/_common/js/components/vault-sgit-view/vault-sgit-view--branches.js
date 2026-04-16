/* =============================================================================
   SGraph Vault — SGit View: Branches Tab
   v0.2.0 — Branch list with live HEAD commit, current badge, switch button

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.

   _renderBranches(): reads vault.getBranches(), shows each branch with:
     - name, type badge, current badge (if active), HEAD commit ID (short)
     - Switch button: calls _switchBranch(headRefId) → dispatches branch-switched

   _switchBranch(): calls vault.switchBranch(), refreshes SGit view,
     dispatches 'branch-switched' (bubbles: true) so vault-shell remounts browse.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        async _renderBranches(container) {
            const vault    = this._vault;
            const branches = vault.getBranches ? vault.getBranches() : [];

            if (branches.length === 0) {
                container.innerHTML = `
                    <div class="sgit-section">
                        <h3 class="sgit-section-title">Branches</h3>
                        <div class="sgit-empty">
                            No branch index found. This vault was created by the web UI (single branch).
                            CLI-created vaults list branches here.
                        </div>
                    </div>
                `;
                return;
            }

            const currentRefId = vault._refFileId;

            // Fetch live HEAD commit ID for each branch (may differ from vault's current HEAD)
            container.innerHTML = '<div class="sgit-loading">Loading branches...</div>';

            const rows = await Promise.all(branches.map(async (b) => {
                let headCommitId = '--';
                try {
                    const id = await vault._refManager.readRef(b.head_ref_id);
                    headCommitId = id ? this._short(id) : '--';
                } catch (_) {}

                const isCurrent = b.head_ref_id === currentRefId;
                const typeIcon  = b.branch_type === 'named' ? '&#127775;' : '&#128268;';

                return `
                    <div class="sgit-branch-row">
                        <span class="sgit-branch-icon">${typeIcon}</span>
                        <div class="sgit-branch-info">
                            <div class="sgit-branch-name">
                                ${this._esc(b.name)}
                                ${isCurrent ? '<span class="sgit-badge sgit-badge--current">current</span>' : ''}
                                <span class="sgit-badge sgit-badge--branch">${this._esc(b.branch_type)}</span>
                            </div>
                            <div class="sgit-branch-meta">
                                ref: ${this._esc(b.head_ref_id)} &nbsp;·&nbsp; HEAD: ${this._esc(headCommitId)}
                                ${b.created_at ? ` &nbsp;·&nbsp; ${new Date(b.created_at).toLocaleDateString('en-GB')}` : ''}
                            </div>
                        </div>
                        <button class="sgit-branch-switch" data-ref-id="${this._esc(b.head_ref_id)}"
                            ${isCurrent ? 'disabled' : ''}>
                            ${isCurrent ? 'Active' : 'Switch'}
                        </button>
                    </div>
                `;
            }));

            container.innerHTML = `
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Branches (${branches.length})</h3>
                    <div class="sgit-branch-list">${rows.join('')}</div>
                </div>
            `;
        },

        async _switchBranch(headRefId) {
            if (!headRefId || !this._vault) return;

            const container = this.querySelector('.sgit-body');
            if (container) container.innerHTML = '<div class="sgit-loading">Switching branch...</div>';

            try {
                await this._vault.switchBranch(headRefId);

                // Refresh commit cache and re-render
                this._commitCache.clear();
                this._switchTab('branches');

                // Notify vault-shell to remount browse with the new branch's tree
                this.dispatchEvent(new CustomEvent('branch-switched', {
                    bubbles: true, composed: true,
                    detail:  { headRefId }
                }));
            } catch (err) {
                if (container) container.innerHTML = `<div class="sgit-error">Switch failed: ${this._esc(err.message)}</div>`;
            }
        }

    });
})();
