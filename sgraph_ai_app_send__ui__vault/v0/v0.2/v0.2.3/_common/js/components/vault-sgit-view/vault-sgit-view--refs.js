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
                    <h3 class="sgit-section-title">Format gate (sgit-ai 0.19+)</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">Format</span>
                        <span class="sgit-kv-value">${vault.format} (${vault.format >= 2 ? '32' : '12'}-hex object ids)</span>
                        <span class="sgit-kv-key">Min client</span>
                        <span class="sgit-kv-value">${this._esc(vault.minClient || '--')}</span>
                        <span class="sgit-kv-key">Features</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc((vault.features || []).join(', ') || '--')}</span>
                        <span class="sgit-kv-key">Signing key</span>
                        <span class="sgit-kv-value sgit-mono">${vault.signer ? this._esc(vault.signer.keyId) + ' (' + this._esc(vault.signer.branchId) + ')' : 'none \u2014 commits from this session are unsigned'}</span>
                        <span class="sgit-kv-key">Published head</span>
                        <span class="sgit-kv-value">${vault.remoteHeadStatus === 'rewound' ? '<span class="sgit-badge sgit-badge--bad">REWOUND</span>' : this._esc(vault.remoteHeadStatus || 'forward')}</span>
                    </div>
                </div>
                ${(() => { const tags = Object.entries(vault.getTags ? vault.getTags() : {}); return tags.length ? `
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Tags</h3>
                    <div class="sgit-kv-grid">
                        ${tags.map(([n, id]) => `<span class="sgit-kv-key">${this._esc(n)}</span><span class="sgit-kv-value sgit-mono"><a class="sgit-obj-link" href="#" data-id="${this._esc(id)}">${this._esc(id)}</a></span>`).join('')}
                    </div>
                </div>` : ''; })()}
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
