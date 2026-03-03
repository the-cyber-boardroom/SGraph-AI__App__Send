/* =============================================================================
   SGraph Workspace — Vault Panel
   v0.1.0 — Read-only file browser sidebar

   Uses VaultCrypto + VaultAPI (imported from vault.sgraph.ai) to:
   - Initialise PKI keys and open the vault
   - Load + decrypt the vault index
   - Navigate folders via breadcrumb
   - Emit 'file-selected' on click → document-viewer loads the content

   Unlike user-vault.js, this panel is READ-ONLY — no upload, delete, or
   rename. Those operations happen on vault.sgraph.ai. This panel is for
   browsing and selecting files for transformation.
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

    // --- Component -----------------------------------------------------------

    class VaultPanel extends HTMLElement {

        constructor() {
            super();
            this._state         = 'loading';   // loading | no-crypto | no-key | locked | open | error
            this._vaultKey      = null;
            this._keyPair       = null;
            this._index         = {};           // guid -> { name, type, size, kind, _parent }
            this._rootFolder    = null;
            this._currentFolder = null;
            this._breadcrumb    = [];
            this._selectedGuid  = null;
            this._errorMsg      = null;
        }

        connectedCallback() {
            this._init();
        }

        // --- Initialisation ----------------------------------------------------

        async _init() {
            this._render();

            // Check dependencies
            if (typeof VaultCrypto === 'undefined' || typeof VaultAPI === 'undefined') {
                this._state = 'no-crypto';
                this._render();
                return;
            }

            if (!VaultCrypto.isSecureContext()) {
                this._state = 'no-crypto';
                this._errorMsg = 'Secure context (HTTPS) required for vault encryption.';
                this._render();
                return;
            }

            try {
                const hasKey = await VaultCrypto.hasKeyPair();
                if (!hasKey) {
                    this._state = 'no-key';
                    this._render();
                    return;
                }

                this._keyPair  = await VaultCrypto.getKeyPair();
                this._vaultKey = await VaultCrypto.deriveVaultCacheKey(this._keyPair.publicKey);

                // Configure VaultAPI endpoint from workspace config
                const apiUrl = window.sgraphWorkspace.config.vaultApi;
                if (apiUrl) VaultAPI.adminUrl = apiUrl;

                const exists = await VaultAPI.exists(this._vaultKey);
                if (exists && exists.exists) {
                    await this._openVault();
                } else {
                    this._state = 'locked';
                    this._render();
                }
            } catch (e) {
                console.error('[vault-panel] Init failed:', e);
                this._state    = 'error';
                this._errorMsg = e.message;
                this._render();
            }
        }

        async _openVault() {
            this._state = 'loading';
            this._render();

            const manifest = await VaultAPI.lookup(this._vaultKey);
            if (!manifest) {
                this._state    = 'error';
                this._errorMsg = 'Could not open vault — API returned null.';
                this._render();
                return;
            }

            this._rootFolder    = manifest.root_folder;
            this._currentFolder = this._rootFolder;
            this._breadcrumb    = [{ guid: this._rootFolder, name: 'Vault' }];

            await this._loadIndex();
            this._state = 'open';
            this._render();

            window.sgraphWorkspace.events.emit('vault-opened', {
                vaultKey: this._vaultKey,
                items:    Object.keys(this._index).length
            });
            window.sgraphWorkspace.messages.success('Vault opened');
        }

        async _loadIndex() {
            try {
                const resp = await VaultAPI.getIndex(this._vaultKey);
                if (resp && resp.data) {
                    const packed    = VaultCrypto.b64ToArrayBuf(resp.data);
                    const plaintext = await VaultCrypto.decrypt(this._keyPair.privateKey, packed);
                    this._index     = JSON.parse(new TextDecoder().decode(plaintext));
                }
            } catch (_) {
                this._index = {};
            }
        }

        // --- Key generation (if needed) ----------------------------------------

        async _generateKeys() {
            this._state = 'loading';
            this._render();
            try {
                this._keyPair  = await VaultCrypto.generateKeyPair();
                this._vaultKey = await VaultCrypto.deriveVaultCacheKey(this._keyPair.publicKey);
                this._state    = 'locked';
            } catch (e) {
                this._state    = 'error';
                this._errorMsg = 'Key generation failed: ' + e.message;
            }
            this._render();
        }

        async _createVault() {
            this._state = 'loading';
            this._render();
            const fp     = await VaultCrypto.getFingerprint(this._keyPair.publicKey);
            const result = await VaultAPI.create(this._vaultKey, fp);
            if (result) {
                await this._openVault();
            } else {
                this._state    = 'error';
                this._errorMsg = 'Vault creation failed.';
                this._render();
            }
        }

        // --- Navigation --------------------------------------------------------

        _navigateToFolder(guid, name) {
            this._currentFolder = guid;
            this._breadcrumb.push({ guid, name });
            this._selectedGuid = null;
            this._render();
        }

        _navigateBreadcrumb(idx) {
            this._breadcrumb    = this._breadcrumb.slice(0, idx + 1);
            this._currentFolder = this._breadcrumb[idx].guid;
            this._selectedGuid  = null;
            this._render();
        }

        // --- File selection (emits event for document-viewer) ------------------

        _selectFile(guid) {
            const meta = this._index[guid];
            if (!meta || meta.kind === 'folder') return;

            this._selectedGuid = guid;
            this._render();

            // Emit event with everything the document-viewer needs
            window.sgraphWorkspace.events.emit('file-selected', {
                guid,
                name:     meta.name,
                type:     meta.type,
                size:     meta.size,
                vaultKey: this._vaultKey,
            });
            window.sgraphWorkspace.messages.info('Loading "' + meta.name + '"...');
        }

        // --- Public API (for document-viewer to decrypt files) -----------------

        getKeyPair()  { return this._keyPair; }
        getVaultKey() { return this._vaultKey; }

        // --- Render: State-based -----------------------------------------------

        _render() {
            switch (this._state) {
                case 'loading':    this.innerHTML = this._tmplLoading(); break;
                case 'no-crypto':  this.innerHTML = this._tmplNoCrypto(); break;
                case 'no-key':     this.innerHTML = this._tmplNoKey(); break;
                case 'locked':     this.innerHTML = this._tmplLocked(); break;
                case 'open':       this.innerHTML = this._tmplOpen(); break;
                case 'error':      this.innerHTML = this._tmplError(); break;
            }
            this._bind();
        }

        _tmplLoading() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-spinner">/</div>
                <div class="vp-hint">Loading vault...</div>
            </div>`;
        }

        _tmplNoCrypto() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-hint">${esc(this._errorMsg || 'Vault dependencies not loaded.')}</div>
                <div class="vp-hint-small">Ensure vault-crypto.js and vault-api.js are available.</div>
            </div>`;
        }

        _tmplNoKey() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-hint">No encryption key found.</div>
                <button class="vp-btn vp-btn--primary" id="vp-generate">Generate Key Pair</button>
                <div class="vp-hint-small">RSA-4096 — may take a few seconds</div>
            </div>`;
        }

        _tmplLocked() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-hint">Key pair found.</div>
                <button class="vp-btn vp-btn--primary" id="vp-create">Create Vault</button>
                <button class="vp-btn" id="vp-open">Open Existing</button>
            </div>`;
        }

        _tmplError() {
            return `<style>${VaultPanel.styles}</style>
            <div class="vp-state">
                <div class="vp-hint vp-hint--error">${esc(this._errorMsg || 'Unknown error')}</div>
                <button class="vp-btn" id="vp-retry">Retry</button>
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

            // Children of current folder
            const children = [];
            for (const [guid, meta] of Object.entries(this._index)) {
                if (meta._parent === this._currentFolder) {
                    children.push({ guid, ...meta });
                }
            }

            // Sort: folders first, then by name
            children.sort((a, b) => {
                if (a.kind === 'folder' && b.kind !== 'folder') return -1;
                if (a.kind !== 'folder' && b.kind === 'folder') return  1;
                return (a.name || '').localeCompare(b.name || '');
            });

            let items = '';
            if (children.length === 0) {
                items = `<div class="vp-empty">Empty folder</div>`;
            } else {
                items = children.map(item => {
                    const isSelected = item.guid === this._selectedGuid;
                    const isFolder   = item.kind === 'folder';
                    return `<div class="vp-item ${isSelected ? 'vp-item--selected' : ''}"
                                data-guid="${item.guid}"
                                data-name="${esc(item.name || item.guid)}"
                                data-kind="${item.kind || 'file'}">
                        <span class="vp-item-icon">${isFolder ? ICON_FOLDER : ICON_FILE}</span>
                        <span class="vp-item-name">${esc(item.name || item.guid)}</span>
                        ${!isFolder && item.size ? `<span class="vp-item-size">${formatSize(item.size)}</span>` : ''}
                    </div>`;
                }).join('');
            }

            // Stats
            let files = 0, folders = 0, totalSize = 0;
            for (const c of children) {
                if (c.kind === 'folder') folders++;
                else { files++; totalSize += (c.size || 0); }
            }

            return `<style>${VaultPanel.styles}</style>
                <div class="vp-browser">
                    <div class="vp-breadcrumb">${bc}</div>
                    <div class="vp-items">${items}</div>
                    <div class="vp-stats">
                        ${folders} folder${folders !== 1 ? 's' : ''} &middot;
                        ${files} file${files !== 1 ? 's' : ''}
                        ${totalSize ? ' &middot; ' + formatSize(totalSize) : ''}
                    </div>
                </div>`;
        }

        // --- Event binding -----------------------------------------------------

        _bind() {
            const genBtn = this.querySelector('#vp-generate');
            if (genBtn) genBtn.addEventListener('click', () => this._generateKeys());

            const createBtn = this.querySelector('#vp-create');
            if (createBtn) createBtn.addEventListener('click', () => this._createVault());

            const openBtn = this.querySelector('#vp-open');
            if (openBtn) openBtn.addEventListener('click', () => this._openVault());

            const retryBtn = this.querySelector('#vp-retry');
            if (retryBtn) retryBtn.addEventListener('click', () => this._init());

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
                    if (el.dataset.kind === 'folder') {
                        this._navigateToFolder(el.dataset.guid, el.dataset.name);
                    } else {
                        this._selectFile(el.dataset.guid);
                    }
                });
            });
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .vp-state {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; padding: 1.5rem 0.75rem; text-align: center; gap: 0.5rem;
                }
                .vp-spinner {
                    font-size: 1.5rem; font-weight: 800; color: var(--ws-primary, #4ECDC4);
                    animation: vp-spin 1s ease-in-out infinite;
                }
                @keyframes vp-spin { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                .vp-hint { font-size: 0.8125rem; color: var(--ws-text-secondary, #8892A0); }
                .vp-hint--error { color: var(--ws-error, #E94560); }
                .vp-hint-small { font-size: 0.75rem; color: var(--ws-text-muted, #5a6478); }
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
                .vp-breadcrumb {
                    padding: 0.5rem 0.75rem; font-size: 0.75rem;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
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
