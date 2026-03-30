/* =================================================================================
   SGraph Vault — Settings View Component
   v0.2.0 — Vault name, keys, stats, raw JSON

   Light DOM. Receives vault instance via setVault().
   Emits:
     'vault-settings-name-saved'  — { name }
     'vault-settings-access-key'  — { key }
   ================================================================================= */

(function() {
    'use strict';

    class VaultSettings extends HTMLElement {

        constructor() {
            super();
            this._vault    = null;
            this._vaultKey = '';
            this._accessKey = '';
        }

        connectedCallback() {
            VaultSettings._injectStyles();
            this.innerHTML = `
                <div class="vset-panel">
                    <h2 class="vset-title">Vault Settings</h2>

                    <div class="vset-section">
                        <label class="vset-label">Vault Name</label>
                        <div class="vset-row">
                            <input class="vset-input vset-name-input" type="text" placeholder="Vault name">
                            <button class="vset-btn vset-save-name">Save</button>
                        </div>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Vault Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-key-input" type="text" readonly>
                            <button class="vset-btn vset-copy-key">Copy</button>
                        </div>
                        <p class="vset-hint vset-hint--warn">Anyone with this key can access all files in this vault.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Access Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-access-input" type="password" placeholder="Enter access key for uploads">
                            <button class="vset-btn vset-save-access">Set</button>
                        </div>
                        <p class="vset-hint">Only needed for uploading files.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Statistics</label>
                        <div class="vset-stats"></div>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Raw JSON <button class="vset-json-toggle">(show)</button></label>
                        <div class="vset-json" style="display:none">
                            <h4>vault-settings.json</h4>
                            <pre class="vset-json-settings"></pre>
                            <h4>vault-tree.json</h4>
                            <pre class="vset-json-tree"></pre>
                        </div>
                    </div>
                </div>
            `;

            this._setupListeners();
        }

        setVault(vault, vaultKey, accessKey) {
            this._vault     = vault;
            this._vaultKey  = vaultKey;
            this._accessKey = accessKey;
            this.refresh();
        }

        refresh() {
            if (!this._vault) return;

            const nameInput = this.querySelector('.vset-name-input');
            if (nameInput) nameInput.value = this._vault.name || '';

            const keyInput = this.querySelector('.vset-key-input');
            if (keyInput) keyInput.value = this._vaultKey;

            const accessInput = this.querySelector('.vset-access-input');
            if (accessInput) accessInput.value = this._accessKey || '';

            const stats = this._vault.getStats();
            const statsEl = this.querySelector('.vset-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="vset-stats-grid">
                        <span class="vset-stats-label">Files</span><span class="vset-stats-value">${stats.files}</span>
                        <span class="vset-stats-label">Folders</span><span class="vset-stats-value">${stats.folders}</span>
                        <span class="vset-stats-label">Total size</span><span class="vset-stats-value">${VaultHelpers.formatBytes(stats.totalSize)}</span>
                        <span class="vset-stats-label">Created</span><span class="vset-stats-value">${this._vault.created ? VaultHelpers.formatTimestamp(this._vault.created) : '--'}</span>
                    </div>
                `;
            }
        }

        _setupListeners() {
            this.addEventListener('click', (e) => {
                if (e.target.closest('.vset-save-name'))  return this._saveName();
                if (e.target.closest('.vset-copy-key'))   return this._copyKey();
                if (e.target.closest('.vset-save-access')) return this._saveAccess();
                if (e.target.closest('.vset-json-toggle')) return this._toggleJson(e);
            });
        }

        async _saveName() {
            if (!this._vault) return;
            const input = this.querySelector('.vset-name-input');
            const name = input?.value?.trim();
            if (!name) return;

            const btn = this.querySelector('.vset-save-name');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

            try {
                await this._vault.setName(name);
                this.dispatchEvent(new CustomEvent('vault-settings-name-saved', {
                    detail: { name }, bubbles: true
                }));
                window.sgraphVault.messages.success(`Vault renamed to "${name}"`);
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            }
        }

        _copyKey() {
            const input = this.querySelector('.vset-key-input');
            if (input) {
                navigator.clipboard.writeText(input.value).then(() => {
                    window.sgraphVault.messages.success('Vault key copied');
                });
            }
        }

        _saveAccess() {
            const input = this.querySelector('.vset-access-input');
            const key = input?.value?.trim();
            if (!key) return;
            this._accessKey = key;
            this.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                detail: { key }, bubbles: true
            }));
            window.sgraphVault.messages.success('Access key updated');
        }

        _toggleJson(e) {
            const jsonEl = this.querySelector('.vset-json');
            if (!jsonEl) return;
            const hidden = jsonEl.style.display === 'none';
            jsonEl.style.display = hidden ? '' : 'none';
            e.target.closest('.vset-json-toggle').textContent = hidden ? '(hide)' : '(show)';
            if (hidden && this._vault) {
                const sEl = this.querySelector('.vset-json-settings');
                const tEl = this.querySelector('.vset-json-tree');
                if (sEl) sEl.textContent = JSON.stringify(this._vault._settings, null, 2);
                if (tEl) tEl.textContent = JSON.stringify(this._vault._tree, null, 2);
            }
        }
    }

    VaultSettings.styles = `
        .vset-panel { max-width: 640px; padding: var(--space-4); }
        .vset-title { font-size: var(--text-h3); font-weight: 700; color: var(--color-text); margin: 0 0 var(--space-5); }
        .vset-section { margin-bottom: var(--space-5); }
        .vset-section:last-child { margin-bottom: 0; }
        .vset-label {
            display: block; font-size: var(--text-sm); font-weight: 600;
            color: var(--color-text-secondary); margin-bottom: var(--space-2);
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        .vset-input {
            width: 100%; padding: 0.5rem 0.75rem; font-size: var(--text-sm);
            font-family: var(--font-mono); background: var(--bg-primary);
            border: 1px solid var(--color-border); border-radius: var(--radius-sm);
            color: var(--color-text); outline: none; box-sizing: border-box;
        }
        .vset-row { display: flex; gap: var(--space-2); }
        .vset-row input { flex: 1; }
        .vset-btn {
            padding: 0.5rem 0.75rem; font-size: var(--text-sm); border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family);
        }
        .vset-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vset-hint { font-size: var(--text-small); color: var(--color-text-secondary); margin: var(--space-1) 0 0; }
        .vset-hint--warn { color: var(--color-primary); }
        .vset-stats-grid {
            display: grid; grid-template-columns: auto 1fr;
            gap: var(--space-1) var(--space-3); font-size: var(--text-sm);
        }
        .vset-stats-label { color: var(--color-text-secondary); font-weight: 600; }
        .vset-stats-value { color: var(--color-text); font-family: var(--font-mono); }
        .vset-json pre {
            background: var(--bg-primary); padding: var(--space-3); border-radius: var(--radius-sm);
            font-size: var(--text-small); overflow-x: auto; color: var(--color-text-secondary);
            font-family: var(--font-mono); border: 1px solid var(--color-border);
            max-height: 300px; overflow-y: auto;
        }
        .vset-json h4 { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); margin: var(--space-3) 0 var(--space-1); }
        .vset-json-toggle { font-size: var(--text-small); color: var(--color-primary); background: none; border: none; cursor: pointer; font-family: var(--font-family); }
    `;

    VaultSettings._injectStyles = function() {
        if (document.querySelector('style[data-vault-settings]')) return;
        const s = document.createElement('style');
        s.setAttribute('data-vault-settings', '');
        s.textContent = VaultSettings.styles;
        document.head.appendChild(s);
    };

    customElements.define('vault-settings', VaultSettings);
})();
