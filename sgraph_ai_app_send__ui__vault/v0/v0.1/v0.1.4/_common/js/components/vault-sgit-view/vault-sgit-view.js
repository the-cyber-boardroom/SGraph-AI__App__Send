/* =============================================================================
   SGraph Vault — SGit View Component
   v0.1.4 — Displays vault's git-like internals: branches, commits, raw objects

   Light DOM component showing the sgit data model underneath the vault.
   Shows HEAD ref, commit chain, tree objects, and blob references.
   ============================================================================= */

(function() {
    'use strict';

    class VaultSgitView extends HTMLElement {

        constructor() {
            super();
            this._vault = null;
        }

        set vault(v) { this._vault = v; }
        get vault()  { return this._vault; }

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vsg-container">
                    <h2 class="vsg-title">SGit</h2>
                    <p class="vsg-subtitle">Vault internal git objects and references</p>
                    <div class="vsg-content">
                        <div class="vsg-empty">Open a vault to see SGit data</div>
                    </div>
                </div>
            `;
        }

        refresh() {
            if (!this._vault) return;
            const content = this.querySelector('.vsg-content');
            if (!content) return;

            const vault = this._vault;
            const stats = vault.getStats();

            content.innerHTML = `
                <div class="vsg-section">
                    <h3 class="vsg-section-title">References <a class="vsg-raw-link" data-raw="refs" href="#">raw</a></h3>
                    <div class="vsg-kv-grid">
                        <span class="vsg-kv-key">HEAD ref ID</span>
                        <span class="vsg-kv-value vsg-mono">${this._esc(vault._refFileId || '--')}</span>
                        <span class="vsg-kv-key">HEAD commit</span>
                        <span class="vsg-kv-value vsg-mono">${this._esc(vault._headCommitId || '--')}</span>
                        <span class="vsg-kv-key">Branch index ID</span>
                        <span class="vsg-kv-value vsg-mono">${this._esc(vault._branchIndexFileId || '--')}</span>
                    </div>
                </div>

                <div class="vsg-section">
                    <h3 class="vsg-section-title">Vault Identity <a class="vsg-raw-link" data-raw="identity" href="#">raw</a></h3>
                    <div class="vsg-kv-grid">
                        <span class="vsg-kv-key">Vault ID</span>
                        <span class="vsg-kv-value vsg-mono">${this._esc(vault._vaultId || '--')}</span>
                        <span class="vsg-kv-key">Version</span>
                        <span class="vsg-kv-value">${this._esc(vault._settings?.version || '--')}</span>
                        <span class="vsg-kv-key">Created</span>
                        <span class="vsg-kv-value">${this._esc(vault._settings?.created || '--')}</span>
                    </div>
                </div>

                <div class="vsg-section">
                    <h3 class="vsg-section-title">Object Store <a class="vsg-raw-link" data-raw="objects" href="#">raw</a></h3>
                    <div class="vsg-kv-grid">
                        <span class="vsg-kv-key">Files</span>
                        <span class="vsg-kv-value">${stats.files}</span>
                        <span class="vsg-kv-key">Folders</span>
                        <span class="vsg-kv-value">${stats.folders}</span>
                        <span class="vsg-kv-key">Total size</span>
                        <span class="vsg-kv-value">${typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(stats.totalSize) : stats.totalSize + ' B'}</span>
                    </div>
                </div>

                <div class="vsg-section">
                    <h3 class="vsg-section-title">Tree (flat entries) <a class="vsg-raw-link" data-raw="tree-flat" href="#">raw</a></h3>
                    <div class="vsg-entries"></div>
                </div>

                <div class="vsg-section">
                    <h3 class="vsg-section-title">Nested Tree <a class="vsg-raw-link" data-raw="tree-nested" href="#">raw</a></h3>
                    <pre class="vsg-json">${this._esc(JSON.stringify(vault._tree, null, 2))}</pre>
                </div>

                <div class="vsg-section">
                    <h3 class="vsg-section-title">Settings Object <a class="vsg-raw-link" data-raw="settings" href="#">raw</a></h3>
                    <pre class="vsg-json">${this._esc(JSON.stringify(vault._settings, null, 2))}</pre>
                </div>
            `;

            // Render flat entries
            const entriesEl = content.querySelector('.vsg-entries');
            if (entriesEl && vault._flattenTree) {
                const entries = vault._flattenTree();
                if (entries.length === 0) {
                    entriesEl.innerHTML = '<div class="vsg-empty">No entries</div>';
                } else {
                    entriesEl.innerHTML = `
                        <table class="vsg-table">
                            <thead>
                                <tr><th>Name</th><th>Size</th><th>Blob ID</th><th>Content Hash</th></tr>
                            </thead>
                            <tbody>
                                ${entries.map(e => `
                                    <tr>
                                        <td>${this._esc(e.name)}</td>
                                        <td>${typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(e.size || 0) : (e.size || 0) + ' B'}</td>
                                        <td class="vsg-mono vsg-truncate">${this._esc(e.blob_id || '--')}</td>
                                        <td class="vsg-mono vsg-truncate">${this._esc(e.content_hash || '--')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            }

            // Bind raw link clicks
            content.querySelectorAll('.vsg-raw-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const rawType = link.dataset.raw;
                    this._openRawTab(rawType);
                });
            });
        }

        _openRawTab(rawType) {
            if (!this._vault) return;
            const vault = this._vault;
            let data, title;

            switch (rawType) {
                case 'refs':
                    data = { refFileId: vault._refFileId, headCommitId: vault._headCommitId, branchIndexFileId: vault._branchIndexFileId };
                    title = 'raw: refs';
                    break;
                case 'identity':
                    data = { vaultId: vault._vaultId, settings: vault._settings };
                    title = 'raw: identity';
                    break;
                case 'objects':
                    data = { stats: vault.getStats(), entries: vault._flattenTree ? vault._flattenTree() : [] };
                    title = 'raw: objects';
                    break;
                case 'tree-flat':
                    data = vault._flattenTree ? vault._flattenTree() : [];
                    title = 'raw: flat-tree';
                    break;
                case 'tree-nested':
                    data = vault._tree;
                    title = 'raw: nested-tree';
                    break;
                case 'settings':
                    data = vault._settings;
                    title = 'raw: settings';
                    break;
                default:
                    return;
            }

            // Open in new browser tab as JSON
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        }

        _esc(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        getStyles() {
            return `
                .vsg-container { max-width: 900px; }
                .vsg-title { font-size: var(--text-h3, 1.25rem); font-weight: 700; color: var(--color-text, #E0E0E0); margin: 0 0 0.25rem; }
                .vsg-subtitle { font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); margin: 0 0 1.5rem; }
                .vsg-content {}
                .vsg-empty { color: var(--color-text-secondary, #8892A0); font-size: var(--text-sm, 0.875rem); padding: 1rem 0; }
                .vsg-section { margin-bottom: 1.5rem; }
                .vsg-section-title { font-size: var(--text-sm, 0.875rem); font-weight: 600; color: var(--color-text-secondary, #8892A0); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
                .vsg-raw-link { font-size: 0.625rem; color: var(--color-text-secondary, #8892A0); text-decoration: none; opacity: 0.6; font-weight: 400; text-transform: none; letter-spacing: 0; }
                .vsg-raw-link:hover { color: var(--color-primary, #4ECDC4); opacity: 1; }
                .vsg-kv-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; font-size: var(--text-sm, 0.875rem); }
                .vsg-kv-key { color: var(--color-text-secondary, #8892A0); font-weight: 600; }
                .vsg-kv-value { color: var(--color-text, #E0E0E0); }
                .vsg-mono { font-family: var(--font-mono, 'JetBrains Mono', monospace); font-size: var(--text-small, 0.75rem); }
                .vsg-json { background: var(--bg-secondary, #16213E); padding: 1rem; border-radius: 6px; font-family: var(--font-mono, monospace); font-size: var(--text-small, 0.75rem); color: var(--color-text-secondary, #8892A0); overflow-x: auto; max-height: 300px; overflow-y: auto; border: 1px solid var(--color-border, rgba(78,205,196,0.15)); margin: 0; white-space: pre-wrap; word-break: break-all; }
                .vsg-table { width: 100%; border-collapse: collapse; font-size: var(--text-small, 0.75rem); }
                .vsg-table th { text-align: left; font-weight: 600; color: var(--color-text-secondary, #8892A0); padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.15)); }
                .vsg-table td { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.08)); color: var(--color-text, #E0E0E0); }
                .vsg-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            `;
        }
    }

    customElements.define('vault-sgit-view', VaultSgitView);
})();
