/* =================================================================================
   SGraph Vault -- Settings View Component
   v0.2.1 -- Adds Read Key display (hex-exported AES key for sgit read-only access)

   Shadow DOM. Receives vault instance via setVault().
   Emits (composed: true):
     'vault-settings-name-saved'  -- { name }
     'vault-settings-access-key'  -- { key }
   ================================================================================= */

(function() {
    'use strict';

    class VaultSettings extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._vault    = null;
            this._vaultKey = '';
            this._accessKey = '';
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultSettings.styles}</style>
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
                        <label class="vset-label">Vault URL</label>
                        <div class="vset-row">
                            <input class="vset-input vset-url-input" type="text" readonly>
                            <button class="vset-btn vset-copy-url">Copy</button>
                        </div>
                        <p class="vset-hint">Direct browser link to this vault. Treat it like the vault key — anyone with it can read all files.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Read Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-readkey-input" type="text" readonly placeholder="Loading…">
                            <button class="vset-btn vset-copy-readkey">Copy</button>
                        </div>
                        <p class="vset-hint">Raw AES-256 key (hex). Pass to <code>sgit clone</code> for read-only access without the vault passphrase.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Access Key</label>
                        <div class="vset-row">
                            <input class="vset-input vset-access-input" type="password" placeholder="Enter access key to enable writes">
                            <button class="vset-btn vset-validate-access">Check</button>
                            <button class="vset-btn vset-save-access">Set</button>
                            <button class="vset-btn vset-clear-access" title="Clear access key">Clear</button>
                        </div>
                        <div class="vset-access-status"></div>
                        <p class="vset-hint">Needed for writing files. Leave empty to open in read-only mode. <em>Check</em> validates the key and shows remaining uses.</p>
                    </div>

                    <div class="vset-section vset-share-section" style="display:none">
                        <label class="vset-label">Read-only sharing</label>
                        <p class="vset-hint">Create read-only links to share this vault with others. Recipients can browse files but cannot modify anything.</p>
                        <div class="vset-row vset-share-row">
                            <button class="vset-btn vset-btn--primary vset-open-token-mgr">Manage read-only tokens ↗</button>
                        </div>
                        <p class="vset-hint">Opens the Token Manager in a new tab. Your vault will be pre-loaded automatically.</p>
                    </div>

                    <div class="vset-section vset-pvp-section" style="display:none">
                        <label class="vset-label">Public preview</label>
                        <p class="vset-hint">A deliberately-public title, description and thumbnail for this vault — shareable as a link with a proper social-share card. Opt-in; the vault's contents stay encrypted.</p>
                        <div class="vset-row vset-share-row">
                            <button class="vset-btn vset-btn--primary vset-open-pvp">Create / edit public preview ↗</button>
                        </div>
                        <p class="vset-hint">Opens the editor in a new tab. Your vault will be pre-loaded automatically.</p>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Statistics</label>
                        <div class="vset-stats"></div>
                    </div>

                    <div class="vset-section">
                        <label class="vset-label">Sync</label>
                        <div class="vset-sync-row">
                            <label class="vset-toggle-label">
                                <input class="vset-autosync-cb" type="checkbox" checked>
                                Auto-sync
                            </label>
                            <p class="vset-hint">When enabled, vault silently pulls new commits from the published branch whenever you switch to the Files view. Only applies when there are no local unpushed commits. No background polling.</p>
                        </div>
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

        async refresh() {
            if (!this._vault) return;
            const root = this.shadowRoot;

            const nameInput = root.querySelector('.vset-name-input');
            if (nameInput) nameInput.value = this._vault.name || '';

            const keyInput = root.querySelector('.vset-key-input');
            if (keyInput) keyInput.value = this._vaultKey;

            const urlInput = root.querySelector('.vset-url-input');
            if (urlInput) {
                const base = window.location.origin;
                urlInput.value = `${base}/#${this._vaultKey}`;
            }

            // Export read key as hex for display
            const rkInput = root.querySelector('.vset-readkey-input');
            if (rkInput && this._vault._readKey) {
                try {
                    const raw    = await crypto.subtle.exportKey('raw', this._vault._readKey);
                    const bytes  = new Uint8Array(raw);
                    const hex    = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                    rkInput.value = hex;
                } catch (_) {
                    rkInput.value = '(unavailable)';
                }
            }

            const accessInput = root.querySelector('.vset-access-input');
            if (accessInput) accessInput.value = this._accessKey || '';

            // Share + public-preview sections: only visible in owner mode (opened with a passphrase, not an ro-token)
            const ownerMode = !!this._vault._passphrase;
            const shareSection = root.querySelector('.vset-share-section');
            if (shareSection) shareSection.style.display = ownerMode ? '' : 'none';
            const pvpSection = root.querySelector('.vset-pvp-section');
            if (pvpSection) pvpSection.style.display = ownerMode ? '' : 'none';

            const stats = this._vault.getStats();
            const statsEl = root.querySelector('.vset-stats');
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
            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.vset-save-name'))       return this._saveName();
                if (e.target.closest('.vset-copy-key'))        return this._copyWithFlash('.vset-copy-key', '.vset-key-input');
                if (e.target.closest('.vset-copy-url'))        return this._copyWithFlash('.vset-copy-url', '.vset-url-input');
                if (e.target.closest('.vset-copy-readkey'))    return this._copyWithFlash('.vset-copy-readkey', '.vset-readkey-input');
                if (e.target.closest('.vset-save-access'))     return this._saveAccess();
                if (e.target.closest('.vset-clear-access'))    return this._clearAccess();
                if (e.target.closest('.vset-validate-access')) return this._validateAccess();
                if (e.target.closest('.vset-json-toggle'))        return this._toggleJson(e);
                if (e.target.closest('.vset-open-token-mgr'))  return this._openTokenManager();
                if (e.target.closest('.vset-open-pvp'))        return this._openPublicPreview();
            });
        }

        _copyWithFlash(btnSel, inputSel) {
            const btn   = this.shadowRoot.querySelector(btnSel);
            const input = this.shadowRoot.querySelector(inputSel);
            if (!btn || !input) return;
            navigator.clipboard.writeText(input.value).then(() => {
                const orig = btn.textContent;
                btn.textContent  = 'Copied ✓';
                btn.style.color  = '#4ecdc4';
                setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
            });
        }

        async _saveName() {
            if (!this._vault) return;
            const input = this.shadowRoot.querySelector('.vset-name-input');
            const name = input?.value?.trim();
            if (!name) return;

            const btn = this.shadowRoot.querySelector('.vset-save-name');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

            try {
                await this._vault.setName(name);
                this.dispatchEvent(new CustomEvent('vault-settings-name-saved', {
                    detail: { name }, bubbles: true, composed: true
                }));
                window.sgraphVault.messages.success(`Vault renamed to "${name}"`);
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            }
        }

        _saveAccess() {
            const input = this.shadowRoot.querySelector('.vset-access-input');
            const key = input?.value?.trim() ?? '';
            this._accessKey = key;
            this.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                detail: { key }, bubbles: true, composed: true
            }));
            window.sgraphVault.messages.success(key ? 'Access key set — write mode enabled' : 'Access key cleared — vault is read-only');
            this._setAccessStatus('');
        }

        _clearAccess() {
            const input = this.shadowRoot.querySelector('.vset-access-input');
            if (input) input.value = '';
            this._accessKey = '';
            this.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                detail: { key: '' }, bubbles: true, composed: true
            }));
            window.sgraphVault.messages.success('Access key cleared — vault is read-only');
            this._setAccessStatus('');
        }

        async _validateAccess() {
            const input  = this.shadowRoot.querySelector('.vset-access-input');
            const btn    = this.shadowRoot.querySelector('.vset-validate-access');
            const key    = input?.value?.trim();
            if (!key) { this._setAccessStatus('Enter a key first', 'warn'); return; }

            const orig = btn.textContent;
            btn.disabled = true; btn.textContent = '…';
            this._setAccessStatus('Checking…', 'info');

            try {
                // The check-token API lives on the SG-Send backend (e.g. dev.send.sgraph.ai),
                // not on the vault static-site origin (dev.vault.sgraph.ai). window.location.origin
                // pointed at the wrong host and the path used an underscore — the request landed
                // on S3 and came back as <Error><Code>AccessDenied</Code>.
                const endpoint = this._vault?._sgSend?.endpoint || 'https://dev.send.sgraph.ai';
                const resp = await fetch(`${endpoint}/api/transfers/check-token/${encodeURIComponent(key)}`);
                if (!resp.ok) {
                    this._setAccessStatus('Server error — could not validate', 'error');
                    return;
                }
                const data = await resp.json();
                if (!data.valid) {
                    this._setAccessStatus(`✗ Invalid — ${data.reason || data.status || 'not found'}`, 'error');
                } else if (data.remaining === 0) {
                    this._setAccessStatus(`⚠ Valid but exhausted (${data.status})`, 'warn');
                } else {
                    const rem = data.remaining > 0 ? ` · ${data.remaining} uses remaining` : ' · unlimited';
                    this._setAccessStatus(`✓ Valid${rem}`, 'ok');
                }
            } catch (err) {
                this._setAccessStatus(`✗ Check failed: ${err.message}`, 'error');
            } finally {
                btn.disabled = false; btn.textContent = orig;
            }
        }

        _setAccessStatus(msg, type) {
            const el = this.shadowRoot.querySelector('.vset-access-status');
            if (!el) return;
            el.textContent = msg;
            el.className = 'vset-access-status' + (type ? ' vset-access-status--' + type : '');
        }

        _openTokenManager() {
            const base = window.location.pathname.split('/en-gb/')[0];
            window.open(base + '/en-gb/vault/token/', '_blank');
        }

        _openPublicPreview() {
            const base = window.location.pathname.split('/en-gb/')[0];
            window.open(base + '/en-gb/vault/public-preview/', '_blank');
        }

        _toggleJson(e) {
            const jsonEl = this.shadowRoot.querySelector('.vset-json');
            if (!jsonEl) return;
            const hidden = jsonEl.style.display === 'none';
            jsonEl.style.display = hidden ? '' : 'none';
            e.target.closest('.vset-json-toggle').textContent = hidden ? '(hide)' : '(show)';
            if (hidden && this._vault) {
                const sEl = this.shadowRoot.querySelector('.vset-json-settings');
                const tEl = this.shadowRoot.querySelector('.vset-json-tree');
                if (sEl) sEl.textContent = JSON.stringify(this._vault._settings, null, 2);
                if (tEl) tEl.textContent = JSON.stringify(this._vault._tree, null, 2);
            }
        }
    }

    VaultSettings.styles = `
        :host { display: block; overflow-y: auto; height: 100%; box-sizing: border-box; }
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
        .vset-btn--primary {
            background: var(--color-primary, #4ecdc4); color: #000;
            border-color: var(--color-primary, #4ecdc4); font-weight: 600;
        }
        .vset-btn--primary:hover { opacity: 0.88; background: var(--color-primary, #4ecdc4); }
        .vset-hint { font-size: var(--text-small); color: var(--color-text-secondary); margin: var(--space-1) 0 0; }
        .vset-hint--warn { color: var(--color-primary); }
        .vset-access-status { font-size: var(--text-small); margin-top: var(--space-1); min-height: 1.2em; }
        .vset-access-status--ok    { color: #4ecdc4; }
        .vset-access-status--warn  { color: #E9C445; }
        .vset-access-status--error { color: #ff6b6b; }
        .vset-access-status--info  { color: var(--color-text-secondary); }
        .vset-hint code { font-family: var(--font-mono); background: var(--bg-primary); padding: 0.1em 0.3em; border-radius: 3px; }
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

    customElements.define('vault-settings', VaultSettings);
})();
