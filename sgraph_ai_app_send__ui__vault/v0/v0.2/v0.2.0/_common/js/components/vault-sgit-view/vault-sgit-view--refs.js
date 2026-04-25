/* =============================================================================
   SGraph Vault — SGit View: Refs Tab
   v0.2.0 — Vault identity, ref IDs, object store stats, settings JSON

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        _renderRefs(container) {
            const vault = this._vault;
            const stats = vault.getStats();

            container.innerHTML = `
                <div class="sgit-section">
                    <h3 class="sgit-section-title">References</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">HEAD ref</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc(vault._refFileId || '--')}</span>
                        <span class="sgit-kv-key">HEAD commit</span>
                        <span class="sgit-kv-value sgit-mono"><a class="sgit-obj-link" href="#" data-id="${this._esc(vault._headCommitId)}">${this._esc(vault._headCommitId || '--')}</a></span>
                        <span class="sgit-kv-key">Branch index</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc(vault._branchIndexFileId || '--')}</span>
                    </div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Vault Identity</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">Vault ID</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc(vault._vaultId || '--')}</span>
                        <span class="sgit-kv-key">Version</span>
                        <span class="sgit-kv-value">${this._esc(vault._settings?.version || '--')}</span>
                        <span class="sgit-kv-key">Created</span>
                        <span class="sgit-kv-value">${this._esc(vault._settings?.created || '--')}</span>
                    </div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Object Store</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">Files</span>
                        <span class="sgit-kv-value">${stats.files}</span>
                        <span class="sgit-kv-key">Folders</span>
                        <span class="sgit-kv-value">${stats.folders}</span>
                        <span class="sgit-kv-key">Total size</span>
                        <span class="sgit-kv-value">${typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(stats.totalSize) : stats.totalSize + ' B'}</span>
                    </div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Settings</h3>
                    <pre class="sgit-json">${this._esc(JSON.stringify(vault._settings, null, 2))}</pre>
                </div>
            `;
        }

    });
})();
