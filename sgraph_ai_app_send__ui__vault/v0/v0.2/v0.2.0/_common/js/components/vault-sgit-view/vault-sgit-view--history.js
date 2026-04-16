/* =============================================================================
   SGraph Vault — SGit View: History Tab
   v0.2.0 — Commit log, graph rendering, commit rows

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        async _renderHistory(container) {
            container.innerHTML = '<div class="sgit-loading">Loading commit history...</div>';

            const vault   = this._vault;
            const commits = [];
            let currentId = vault._headCommitId;
            const max     = 50;

            while (currentId && commits.length < max) {
                try {
                    let commit = this._commitCache.get(currentId);
                    if (!commit) {
                        commit = await vault._commitManager.loadCommit(currentId);
                        this._commitCache.set(currentId, commit);
                    }
                    commits.push({ id: currentId, ...commit });
                    currentId = commit.parents?.[0] || null;
                } catch (err) {
                    commits.push({ id: currentId, _error: err.message });
                    break;
                }
            }

            if (commits.length === 0) {
                container.innerHTML = '<div class="sgit-empty">No commits found</div>';
                return;
            }

            container.innerHTML = `
                <div class="sgit-commit-list">
                    <div class="sgit-commit-header">
                        <span class="sgit-ch-graph">Graph</span>
                        <span class="sgit-ch-msg">Description</span>
                        <span class="sgit-ch-id">Commit</span>
                        <span class="sgit-ch-date">Date</span>
                    </div>
                    ${commits.map((c, i) => this._renderCommitRow(c, i, commits.length)).join('')}
                </div>
            `;
        },

        _renderCommitRow(commit, index, total) {
            if (commit._error) {
                return `<div class="sgit-commit-row sgit-commit-row--error">
                    <span class="sgit-ch-graph"><span class="sgit-graph-dot sgit-graph-dot--error"></span></span>
                    <span class="sgit-ch-msg">Error: ${this._esc(commit._error)}</span>
                    <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(commit.id)}">${this._esc(this._short(commit.id))}</a></span>
                    <span class="sgit-ch-date">--</span>
                </div>`;
            }

            const isHead  = index === 0;
            const msg     = commit.message || '(no message)';
            const date    = commit.timestamp_ms
                ? new Date(commit.timestamp_ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '--';
            const branch  = commit.branch_id || '';
            const hasLine = index < total - 1;

            return `<div class="sgit-commit-row${isHead ? ' sgit-commit-row--head' : ''}">
                <span class="sgit-ch-graph">
                    <span class="sgit-graph-line-top${index === 0 ? ' sgit-graph-line--hidden' : ''}"></span>
                    <span class="sgit-graph-dot${isHead ? ' sgit-graph-dot--head' : ''}"></span>
                    <span class="sgit-graph-line-bottom${!hasLine ? ' sgit-graph-line--hidden' : ''}"></span>
                </span>
                <span class="sgit-ch-msg">
                    ${isHead ? '<span class="sgit-badge sgit-badge--head">HEAD</span>' : ''}
                    ${branch ? `<span class="sgit-badge sgit-badge--branch">${this._esc(this._shortBranch(branch))}</span>` : ''}
                    <span class="sgit-commit-msg">${this._esc(msg)}</span>
                    <a class="sgit-obj-link sgit-commit-tree-link" href="#" data-id="${this._esc(commit.tree_id)}" title="View tree">tree</a>
                </span>
                <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(commit.id)}">${this._esc(this._short(commit.id))}</a></span>
                <span class="sgit-ch-date">${date}</span>
            </div>`;
        },

        _shortBranch(branchId) {
            if (!branchId) return '';
            return branchId.length > 20 ? branchId.substring(0, 18) + '...' : branchId;
        }

    });
})();
