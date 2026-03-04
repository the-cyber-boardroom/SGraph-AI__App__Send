/* =============================================================================
   SGraph Workspace — Vault Panel
   v0.1.0 — File browser using SGVault (same model as vault.sgraph.ai)

   Uses SGSend + SGVault (imported from vault.sgraph.ai) to:
   - Open a vault via vault key (passphrase:vault_id)
   - Create a new vault with passphrase
   - Browse folders and files via the encrypted vault tree
   - Emit 'file-selected' on click → document-viewer loads the content

   All vault data is stored as encrypted transfers on send.sgraph.ai.
   Encryption: AES-256-GCM with PBKDF2-derived key (600k iterations).
   The server never sees plaintext, file names, or decryption keys.
   ============================================================================= */

(function() {
    'use strict';

    // --- Helpers -------------------------------------------------------------

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatSize(bytes) {
        if (bytes == null) return '';
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824)  return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    const ICON_FOLDER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--ws-primary, #4ECDC4)" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const ICON_FILE   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ws-text-secondary, #8892A0)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    const STORAGE_KEY = 'sgraph-workspace-vault';

    // --- Component -----------------------------------------------------------

    class VaultPanel extends HTMLElement {

        constructor() {
            super();
            this._state       = 'entry';     // entry | loading | open | error
            this._vault       = null;        // SGVault instance
            this._sgSend      = null;        // SGSend instance
            this._vaultKey    = null;        // full vault key string
            this._accessToken = '';          // x-sgraph-access-token (for uploads)
            this._currentPath = '/';
            this._breadcrumb  = [{ path: '/', name: 'Vault' }];
            this._selectedFile = null;
            this._errorMsg    = null;
            this._loadSaved();
        }

        connectedCallback() {
            this._render();

            // Check dependencies
            if (typeof SGSendCrypto === 'undefined' || typeof SGSend === 'undefined' || typeof SGVault === 'undefined') {
                this._state = 'error';
                this._errorMsg = 'Vault libraries not loaded (SGSendCrypto, SGSend, SGVault).';
                this._render();
                return;
            }

            if (!SGSendCrypto.isAvailable()) {
                this._state = 'error';
                this._errorMsg = 'Secure context (HTTPS or localhost) required for encryption.';
                this._render();
                return;
            }

            // Auto-open if saved vault key exists
            if (this._vaultKey) {
                this._openVault(this._vaultKey);
            }
        }

        // --- Settings persistence ------------------------------------------------

        _loadSaved() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const s = JSON.parse(raw);
                    this._vaultKey    = s.vaultKey    || null;
                    this._accessToken = s.accessToken || '';
                }
            } catch (_) { /* ignore */ }
        }

        _saveSetting() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    vaultKey:    this._vaultKey,
                    accessToken: this._accessToken || '',
                }));
            } catch (_) { /* ignore */ }
        }

        _clearSaved() {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
        }

        // --- Vault operations ----------------------------------------------------

        async _openVault(vaultKey) {
            this._state = 'loading';
            this._render();

            try {
                const endpoint = window.sgraphWorkspace.config.sendEndpoint;
                this._sgSend   = new SGSend({ endpoint, token: this._accessToken });
                this._vault    = await SGVault.open(this._sgSend, vaultKey);
                this._vaultKey = vaultKey;

                this._currentPath = '/';
                this._breadcrumb  = [{ path: '/', name: this._vault.name || 'Vault' }];

                this._state = 'open';
                this._saveSetting();
                this._render();

                const stats = this._vault.getStats();
                window.sgraphWorkspace.events.emit('vault-opened', {
                    vaultId: this._vault.vaultId,
                    name:    this._vault.name,
                    files:   stats.files,
                    folders: stats.folders,
                });
                window.sgraphWorkspace.messages.success(
                    `Vault "${this._vault.name}" opened — ${stats.files} files`
                );
            } catch (e) {
                console.error('[vault-panel] Open vault failed:', e);
                this._state    = 'error';
                this._errorMsg = e.message;
                this._vaultKey = null;
                this._clearSaved();
                this._render();
            }
        }

        async _createVault() {
            const passInput = this.querySelector('#vp-passphrase');
            const nameInput = this.querySelector('#vp-vault-name');
            const passphrase = passInput ? passInput.value.trim() : '';
            const name       = nameInput ? nameInput.value.trim() : '';

            if (!passphrase) {
                window.sgraphWorkspace.messages.warning('Passphrase is required');
                return;
            }

            this._state = 'loading';
            this._render();

            try {
                const endpoint = window.sgraphWorkspace.config.sendEndpoint;
                this._sgSend = new SGSend({ endpoint, token: this._accessToken });
                this._vault  = await SGVault.create(this._sgSend, passphrase, {
                    name: name || 'Workspace Vault',
                });

                this._vaultKey    = this._vault.getVaultKey(passphrase);
                this._currentPath = '/';
                this._breadcrumb  = [{ path: '/', name: this._vault.name }];

                this._state = 'open';
                this._saveSetting();
                this._render();

                window.sgraphWorkspace.events.emit('vault-created', {
                    vaultId:  this._vault.vaultId,
                    name:     this._vault.name,
                    vaultKey: this._vaultKey,
                });
                window.sgraphWorkspace.messages.success(
                    `Vault "${this._vault.name}" created. Save your vault key!`
                );
            } catch (e) {
                console.error('[vault-panel] Create vault failed:', e);
                this._state    = 'error';
                this._errorMsg = e.message;
                this._render();
            }
        }

        async _refreshVault() {
            if (!this._vaultKey) return;
            window.sgraphWorkspace.messages.info('Refreshing vault...');
            try {
                const endpoint = window.sgraphWorkspace.config.sendEndpoint;
                this._sgSend   = new SGSend({ endpoint, token: this._accessToken });
                this._vault    = await SGVault.open(this._sgSend, this._vaultKey);
                this._render();
                const stats = this._vault.getStats();
                window.sgraphWorkspace.messages.success(
                    `Vault refreshed — ${stats.files} files`
                );
            } catch (e) {
                console.error('[vault-panel] Refresh failed:', e);
                window.sgraphWorkspace.messages.error('Refresh failed: ' + e.message);
            }
        }

        _lockVault() {
            this._vault       = null;
            this._sgSend      = null;
            this._vaultKey    = null;
            this._currentPath = '/';
            this._breadcrumb  = [{ path: '/', name: 'Vault' }];
            this._selectedFile = null;
            this._state       = 'entry';
            this._clearSaved();
            this._render();
            window.sgraphWorkspace.events.emit('vault-locked');
            window.sgraphWorkspace.messages.info('Vault locked');
        }

        // --- Navigation --------------------------------------------------------

        _navigateToFolder(path, name) {
            this._currentPath = path;
            this._breadcrumb.push({ path, name });
            this._selectedFile = null;
            this._render();
        }

        _navigateBreadcrumb(idx) {
            this._breadcrumb    = this._breadcrumb.slice(0, idx + 1);
            this._currentPath   = this._breadcrumb[idx].path;
            this._selectedFile  = null;
            this._render();
        }

        // --- File selection (emits event for document-viewer) ------------------

        _selectFile(name, entry) {
            this._selectedFile = name;
            this._render();

            window.sgraphWorkspace.events.emit('file-selected', {
                name,
                folderPath: this._currentPath,
                size:       entry.size,
                type:       entry.type,
                fileId:     entry.file_id,
            });
            window.sgraphWorkspace.messages.info('Loading "' + name + '"...');
        }

        // --- Public API (for document-viewer to load/save files) ---------------

        getVault()    { return this._vault; }
        getSgSend()   { return this._sgSend; }
        getState()    { return this._state; }

        /**
         * Save a new file into the vault (encrypt + upload via Transfer API).
         * Returns { fileId, fileName, folderPath } on success.
         */
        async saveFile(bytes, filename) {
            if (!this._vault || this._state !== 'open') {
                throw new Error('Vault is not open');
            }

            const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            const result = await this._vault.addFile(this._currentPath, filename, data);

            // Re-render to show the new file
            this._render();

            return result;
        }

        /**
         * Get file content by path and name (decrypt via vault).
         */
        async getFile(folderPath, fileName) {
            if (!this._vault) throw new Error('Vault is not open');
            return this._vault.getFile(folderPath, fileName);
        }

        // --- Render: State-based -----------------------------------------------

        _render() {
            switch (this._state) {
                case 'entry':    this.innerHTML = this._tmplEntry(); break;
                case 'loading':  this.innerHTML = this._tmplLoading(); break;
                case 'open':     this.innerHTML = this._tmplOpen(); break;
                case 'error':    this.innerHTML = this._tmplError(); break;
            }
            this._bind();
        }

        _tmplLoading() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-spinner">/</div>
                <div class="vp-hint">Opening vault...</div>
            </div>`;
        }

        _tmplEntry() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-section">
                    <label class="vp-label">Access Token</label>
                    <input type="password" class="vp-input" id="vp-access-token"
                           placeholder="x-sgraph-access-token"
                           value="${esc(this._accessToken || '')}">
                    <div class="vp-hint-small">Required for vault read/write access</div>
                </div>
                <div class="vp-section">
                    <label class="vp-label">Vault Key</label>
                    <input type="password" class="vp-input" id="vp-vault-key"
                           placeholder="passphrase:vault_id">
                    <button class="vp-btn vp-btn--primary" id="vp-open">Open Vault</button>
                </div>
                <div class="vp-divider">or</div>
                <div class="vp-section">
                    <label class="vp-label">Create New Vault</label>
                    <input type="text" class="vp-input" id="vp-vault-name"
                           placeholder="Vault name">
                    <input type="password" class="vp-input" id="vp-passphrase"
                           placeholder="Passphrase (required)">
                    <button class="vp-btn vp-btn--primary" id="vp-create">Create Vault</button>
                </div>
            </div>`;
        }

        _tmplError() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-hint vp-hint--error">${esc(this._errorMsg || 'Unknown error')}</div>
                <button class="vp-btn" id="vp-back">Back</button>
            </div>`;
        }

        _tmplOpen() {
            // Breadcrumb
            const bc = this._breadcrumb.map((b, i) => {
                const isLast = i === this._breadcrumb.length - 1;
                return isLast
                    ? `<span class="vp-bc-current">${esc(b.name)}</span>`
                    : `<a href="#" class="vp-bc-link" data-idx="${i}">${esc(b.name)}</a><span class="vp-bc-sep">/</span>`;
            }).join('');

            // List current folder contents from SGVault tree
            const items = this._vault.listFolder(this._currentPath) || [];

            // Sort: folders first, then by name
            items.sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return  1;
                return (a.name || '').localeCompare(b.name || '');
            });

            let itemsHtml = '';
            if (items.length === 0) {
                itemsHtml = `<div class="vp-empty">Empty folder</div>`;
            } else {
                itemsHtml = items.map(item => {
                    const isSelected = item.name === this._selectedFile;
                    const isFolder   = item.type === 'folder';
                    return `<div class="vp-item ${isSelected ? 'vp-item--selected' : ''}"
                                data-name="${esc(item.name)}"
                                data-kind="${item.type}">
                        <span class="vp-item-icon">${isFolder ? ICON_FOLDER : ICON_FILE}</span>
                        <span class="vp-item-name">${esc(item.name)}</span>
                        ${!isFolder && item.size ? `<span class="vp-item-size">${formatSize(item.size)}</span>` : ''}
                    </div>`;
                }).join('');
            }

            // Stats
            const stats = this._vault.getStats();

            return `<style>${VaultPanel.styles}</style>
                <div class="vp-browser">
                    <div class="vp-browser-header">
                        <div class="vp-breadcrumb">${bc}</div>
                        <button class="vp-header-btn" id="vp-refresh" title="Refresh vault">&#x21bb;</button>
                        <button class="vp-header-btn" id="vp-lock" title="Lock vault">&#128274;</button>
                    </div>
                    <div class="vp-items">${itemsHtml}</div>
                    <div class="vp-stats">
                        ${stats.folders} folder${stats.folders !== 1 ? 's' : ''} &middot;
                        ${stats.files} file${stats.files !== 1 ? 's' : ''}
                        ${stats.totalSize ? ' &middot; ' + formatSize(stats.totalSize) : ''}
                    </div>
                </div>`;
        }

        // --- Event binding -----------------------------------------------------

        _bind() {
            // Access token input — save on change
            const tokenInput = this.querySelector('#vp-access-token');
            if (tokenInput) {
                tokenInput.addEventListener('input', () => {
                    this._accessToken = tokenInput.value.trim();
                    this._saveSetting();
                });
            }

            // Open vault button
            const openBtn = this.querySelector('#vp-open');
            if (openBtn) {
                openBtn.addEventListener('click', () => {
                    this._accessToken = (this.querySelector('#vp-access-token')?.value || '').trim();
                    this._saveSetting();
                    const keyInput = this.querySelector('#vp-vault-key');
                    const key = keyInput ? keyInput.value.trim() : '';
                    if (!key) {
                        window.sgraphWorkspace.messages.warning('Enter a vault key');
                        return;
                    }
                    this._openVault(key);
                });
                // Enter key in vault key input
                const keyInput = this.querySelector('#vp-vault-key');
                if (keyInput) {
                    keyInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') openBtn.click();
                    });
                }
            }

            // Create vault button
            const createBtn = this.querySelector('#vp-create');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    this._accessToken = (this.querySelector('#vp-access-token')?.value || '').trim();
                    this._saveSetting();
                    this._createVault();
                });
            }

            // Back from error
            const backBtn = this.querySelector('#vp-back');
            if (backBtn) backBtn.addEventListener('click', () => {
                this._state    = 'entry';
                this._errorMsg = null;
                this._render();
            });

            // Refresh vault
            const refreshBtn = this.querySelector('#vp-refresh');
            if (refreshBtn) refreshBtn.addEventListener('click', () => this._refreshVault());

            // Lock vault
            const lockBtn = this.querySelector('#vp-lock');
            if (lockBtn) lockBtn.addEventListener('click', () => this._lockVault());

            // Breadcrumb navigation
            this.querySelectorAll('.vp-bc-link').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._navigateBreadcrumb(parseInt(el.dataset.idx));
                });
            });

            // Item clicks
            this.querySelectorAll('.vp-item').forEach(el => {
                el.addEventListener('click', () => {
                    const name = el.dataset.name;
                    if (el.dataset.kind === 'folder') {
                        const newPath = this._currentPath === '/'
                            ? '/' + name
                            : this._currentPath + '/' + name;
                        this._navigateToFolder(newPath, name);
                    } else {
                        // Get entry from vault tree
                        const items = this._vault.listFolder(this._currentPath) || [];
                        const entry = items.find(i => i.name === name);
                        if (entry) this._selectFile(name, entry);
                    }
                });
            });
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .vp-state {
                    display: flex; flex-direction: column;
                    padding: 0.75rem; gap: 0.75rem;
                }
                .vp-section {
                    display: flex; flex-direction: column; gap: 0.375rem;
                }
                .vp-label {
                    font-size: 0.75rem; font-weight: 600;
                    color: var(--ws-text-secondary, #8892A0);
                }
                .vp-input {
                    width: 100%; padding: 0.375rem 0.5rem;
                    background: var(--ws-bg, #1A1A2E); color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    font-size: 0.75rem; font-family: var(--ws-font-mono, monospace);
                    outline: none; box-sizing: border-box;
                }
                .vp-input:focus { border-color: var(--ws-primary, #4ECDC4); }
                .vp-divider {
                    text-align: center; font-size: 0.6875rem;
                    color: var(--ws-text-muted, #5a6478);
                    position: relative;
                }
                .vp-spinner {
                    font-size: 1.5rem; font-weight: 800; color: var(--ws-primary, #4ECDC4);
                    animation: vp-spin 1s ease-in-out infinite; text-align: center;
                }
                @keyframes vp-spin { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                .vp-hint { font-size: 0.8125rem; color: var(--ws-text-secondary, #8892A0); text-align: center; }
                .vp-hint--error { color: var(--ws-error, #E94560); }
                .vp-hint-small { font-size: 0.6875rem; color: var(--ws-text-muted, #5a6478); }
                .vp-btn {
                    padding: 0.375rem 0.75rem; border-radius: var(--ws-radius, 6px);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    background: transparent; color: var(--ws-text-secondary, #8892A0);
                    font-size: 0.8125rem; cursor: pointer; font-family: inherit;
                }
                .vp-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text, #F0F0F5); }
                .vp-btn--primary {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border-color: var(--ws-primary, #4ECDC4);
                }
                .vp-btn--primary:hover { background: rgba(78,205,196,0.2); }

                .vp-browser { display: flex; flex-direction: column; height: 100%; }
                .vp-browser-header {
                    display: flex; align-items: center;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .vp-breadcrumb {
                    flex: 1; padding: 0.5rem 0.75rem; font-size: 0.75rem;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .vp-header-btn {
                    background: none; border: none; cursor: pointer;
                    font-size: 0.75rem; padding: 0.375rem 0.5rem;
                    color: var(--ws-text-muted, #5a6478);
                    border-radius: var(--ws-radius, 6px);
                }
                .vp-header-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text, #F0F0F5); }
                .vp-bc-link { color: var(--ws-primary, #4ECDC4); text-decoration: none; }
                .vp-bc-link:hover { text-decoration: underline; }
                .vp-bc-sep { color: var(--ws-text-muted, #5a6478); margin: 0 0.25rem; }
                .vp-bc-current { color: var(--ws-text, #F0F0F5); font-weight: 600; }

                .vp-items { flex: 1; overflow-y: auto; }
                .vp-empty {
                    padding: 1.5rem 0.75rem; text-align: center;
                    font-size: 0.8125rem; color: var(--ws-text-muted, #5a6478);
                }
                .vp-item {
                    display: flex; align-items: center; gap: 0.5rem;
                    padding: 0.375rem 0.75rem; cursor: pointer;
                    transition: background 100ms;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                }
                .vp-item:hover { background: var(--ws-surface-hover, #253254); }
                .vp-item--selected { background: var(--ws-primary-bg, rgba(78,205,196,0.1)); }
                .vp-item-icon { flex-shrink: 0; display: flex; }
                .vp-item-name {
                    flex: 1; font-size: 0.8125rem; color: var(--ws-text, #F0F0F5);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .vp-item-size {
                    font-size: 0.6875rem; color: var(--ws-text-muted, #5a6478);
                    font-family: var(--ws-font-mono, monospace); flex-shrink: 0;
                }
                .vp-stats {
                    padding: 0.375rem 0.75rem; font-size: 0.6875rem;
                    color: var(--ws-text-muted, #5a6478);
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0; font-family: var(--ws-font-mono, monospace);
                }
            `;
        }
    }

    customElements.define('vault-panel', VaultPanel);
})();
