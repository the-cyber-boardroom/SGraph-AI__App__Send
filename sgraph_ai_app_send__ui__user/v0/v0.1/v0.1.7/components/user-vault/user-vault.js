/* =============================================================================
   SGraph Send — User Vault Component
   v0.1.7 — Zero-knowledge encrypted file vault (user-facing)

   Web Component providing a personal encrypted file vault.
   Uses VaultCrypto for PKI key management and hybrid encryption.
   Uses VaultAPI for server-side vault operations.
   Follows the Aurora design system (v0.1.6).
   ============================================================================= */

(function() {
    'use strict';

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function shortGuid() {
        return crypto.getRandomValues(new Uint8Array(4))
            .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    }

    function formatSize(bytes) {
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824)  return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    // =========================================================================
    // Component
    // =========================================================================

    class UserVault extends HTMLElement {

        constructor() {
            super();
            this._vaultKey   = null;
            this._keyPair    = null;
            this._rootFolder = null;
            this._index      = {};        // guid → { name, type, size }
            this._breadcrumb = [];        // [{ guid, name }]
            this._currentFolder = null;
            this._state      = 'loading'; // loading | no-key | locked | open
        }

        connectedCallback() {
            this._init();
        }

        async _init() {
            this._render();
            try {
                const hasKey = await VaultCrypto.hasKeyPair();
                if (!hasKey) {
                    this._state = 'no-key';
                    this._render();
                    return;
                }
                this._keyPair  = await VaultCrypto.getKeyPair();
                this._vaultKey = await VaultCrypto.deriveVaultCacheKey(this._keyPair.publicKey);
                const exists   = await VaultAPI.exists(this._vaultKey);
                if (exists && exists.exists) {
                    await this._openVault();
                } else {
                    this._state = 'locked';
                    this._render();
                }
            } catch (e) {
                this._state = 'no-key';
                this._render();
            }
        }

        // ─── Vault lifecycle ───────────────────────────────────────────────

        async _generateKeys() {
            this._state = 'loading';
            this._render();
            this._keyPair  = await VaultCrypto.generateKeyPair();
            this._vaultKey = await VaultCrypto.deriveVaultCacheKey(this._keyPair.publicKey);
            this._state    = 'locked';
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
                this._state = 'locked';
                this._render();
            }
        }

        async _openVault() {
            this._state = 'loading';
            this._render();
            const manifest = await VaultAPI.lookup(this._vaultKey);
            if (!manifest) {
                this._state = 'locked';
                this._render();
                return;
            }
            this._rootFolder    = manifest.root_folder;
            this._currentFolder = this._rootFolder;
            this._breadcrumb    = [{ guid: this._rootFolder, name: 'My Vault' }];
            await this._loadIndex();
            this._state = 'open';
            this._render();
        }

        async _loadIndex() {
            try {
                const resp = await VaultAPI.getIndex(this._vaultKey);
                if (resp && resp.encrypted_index) {
                    const packed    = VaultCrypto.b64ToArrayBuf(resp.encrypted_index);
                    const plaintext = await VaultCrypto.decrypt(this._keyPair.privateKey, packed);
                    this._index     = JSON.parse(new TextDecoder().decode(plaintext));
                }
            } catch (_) {
                this._index = {};
            }
        }

        async _saveIndex() {
            const json      = JSON.stringify(this._index);
            const data      = new TextEncoder().encode(json);
            const encrypted = await VaultCrypto.encrypt(this._keyPair.publicKey, data);
            const b64       = VaultCrypto.arrayBufToB64(encrypted);
            await VaultAPI.storeIndex(this._vaultKey, b64);
        }

        // ─── File operations ───────────────────────────────────────────────

        async _uploadFile(file) {
            const fileGuid = shortGuid();
            const data     = await file.arrayBuffer();
            const encrypted = await VaultCrypto.encrypt(this._keyPair.publicKey, new Uint8Array(data));
            const b64       = VaultCrypto.arrayBufToB64(encrypted);
            const result    = await VaultAPI.storeFile(this._vaultKey, fileGuid, b64);
            if (!result) return;
            // Update folder
            const folder = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (folder) {
                const children = folder.children || [];
                children.push(fileGuid);
                folder.children = children;
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, folder);
            }
            // Update index
            this._index[fileGuid] = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, kind: 'file' };
            await this._saveIndex();
            this._render();
        }

        async _downloadFile(guid) {
            const resp = await VaultAPI.getFile(this._vaultKey, guid);
            if (!resp || !resp.encrypted_data) return;
            const packed    = VaultCrypto.b64ToArrayBuf(resp.encrypted_data);
            const plaintext = await VaultCrypto.decrypt(this._keyPair.privateKey, packed);
            const meta      = this._index[guid] || {};
            const blob      = new Blob([plaintext], { type: meta.type || 'application/octet-stream' });
            const url       = URL.createObjectURL(blob);
            const a         = document.createElement('a');
            a.href          = url;
            a.download      = meta.name || guid;
            a.click();
            URL.revokeObjectURL(url);
        }

        async _deleteFile(guid) {
            const folder = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (folder) {
                folder.children = (folder.children || []).filter(c => c !== guid);
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, folder);
            }
            delete this._index[guid];
            await this._saveIndex();
            this._render();
        }

        // ─── Folder operations ─────────────────────────────────────────────

        async _createFolder(name) {
            const guid = shortGuid();
            const newFolder = { type: 'folder', id: guid, children: [] };
            await VaultAPI.storeFolder(this._vaultKey, guid, newFolder);
            // Add to parent
            const parent = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(guid);
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, parent);
            }
            this._index[guid] = { name, kind: 'folder' };
            await this._saveIndex();
            this._render();
        }

        async _navigateToFolder(guid, name) {
            this._currentFolder = guid;
            this._breadcrumb.push({ guid, name });
            this._render();
        }

        async _navigateBreadcrumb(idx) {
            this._breadcrumb    = this._breadcrumb.slice(0, idx + 1);
            this._currentFolder = this._breadcrumb[idx].guid;
            this._render();
        }

        // ─── Render ────────────────────────────────────────────────────────

        _render() {
            if (this._state === 'loading') {
                this.innerHTML = this._tmplLoading();
            } else if (this._state === 'no-key') {
                this.innerHTML = this._tmplNoKey();
                this._bind();
            } else if (this._state === 'locked') {
                this.innerHTML = this._tmplLocked();
                this._bind();
            } else {
                this.innerHTML = this._tmplOpen();
                this._bind();
            }
        }

        _tmplLoading() {
            return `
            <div class="card card-enter" style="text-align: center; padding: var(--space-8);">
                <div class="loading-slash">/</div>
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-3);">Loading vault...</div>
            </div>`;
        }

        _tmplNoKey() {
            return `
            <div class="card card-enter" style="padding: var(--space-6); text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #4ECDC4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: var(--space-4);">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h2 style="font-size: var(--text-h3, 1.25rem); margin: 0 0 var(--space-2) 0;">Personal Vault</h2>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0; max-width: 420px; margin-left: auto; margin-right: auto;">
                    Your vault encrypts files in the browser before upload. Only you hold the decryption key.
                    Generate a key pair to get started.
                </p>
                <button class="btn btn-primary" id="uv-generate">Generate Key Pair</button>
            </div>`;
        }

        _tmplLocked() {
            return `
            <div class="card card-enter" style="padding: var(--space-6); text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #4ECDC4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: var(--space-4);">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h2 style="font-size: var(--text-h3, 1.25rem); margin: 0 0 var(--space-2) 0;">Open Your Vault</h2>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0;">
                    Key pair found. Create a new vault or open your existing one.
                </p>
                <div style="display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-primary" id="uv-create">Create Vault</button>
                    <button class="btn btn-secondary" id="uv-open">Open Existing</button>
                </div>
            </div>`;
        }

        _tmplOpen() {
            const bc = this._breadcrumb.map((b, i) => {
                const isLast = i === this._breadcrumb.length - 1;
                if (isLast) return `<span style="color: var(--color-text-primary); font-weight: var(--weight-semibold, 600);">${escapeHtml(b.name)}</span>`;
                return `<a href="#" class="uv-bc" data-idx="${i}" style="color: var(--color-primary, #4ECDC4); text-decoration: none;">${escapeHtml(b.name)}</a><span style="color: var(--color-text-secondary); margin: 0 var(--space-1);">/</span>`;
            }).join('');

            // Gather children of current folder from index
            const items = [];
            for (const [guid, meta] of Object.entries(this._index)) {
                if (meta._parent === this._currentFolder) {
                    items.push({ guid, ...meta });
                }
            }
            // If we haven't populated _parent, load from server on next render
            // For now, show all items that belong to current folder by loading folder
            const rows = this._buildItemRows();

            return `
            <div class="card card-enter" style="padding: var(--space-4) var(--space-6);">
                <!-- Breadcrumb -->
                <div style="font-size: var(--font-size-sm); margin-bottom: var(--space-4);">${bc}</div>

                <!-- Toolbar -->
                <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); flex-wrap: wrap;">
                    <button class="btn btn-sm btn-primary" id="uv-upload-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Upload File
                    </button>
                    <button class="btn btn-sm btn-secondary" id="uv-newfolder-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                        New Folder
                    </button>
                    <input type="file" id="uv-file-input" multiple style="display: none;">
                </div>

                <!-- Drop zone -->
                <div id="uv-dropzone" style="border: 2px dashed var(--color-border, #333); border-radius: var(--radius, 8px); padding: var(--space-6); text-align: center; color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-4); transition: border-color 150ms ease;">
                    Drop files here to upload
                </div>

                <!-- File list -->
                <div id="uv-filelist">${rows}</div>
            </div>`;
        }

        _buildItemRows() {
            // We'll load folder children async, but render what's in the index
            // with _parent tracking
            const children = [];
            for (const [guid, meta] of Object.entries(this._index)) {
                if (meta._parent === this._currentFolder) {
                    children.push({ guid, ...meta });
                }
            }

            if (children.length === 0) {
                return `<div style="text-align: center; padding: var(--space-4); color: var(--color-text-secondary); font-size: var(--font-size-sm);">
                    This folder is empty. Upload files or create a sub-folder.
                </div>`;
            }

            // Sort: folders first, then files
            children.sort((a, b) => {
                if (a.kind === 'folder' && b.kind !== 'folder') return -1;
                if (a.kind !== 'folder' && b.kind === 'folder') return  1;
                return (a.name || '').localeCompare(b.name || '');
            });

            return children.map(item => {
                if (item.kind === 'folder') {
                    return `<div class="uv-row" style="display: flex; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border, #222); cursor: pointer;" data-action="open-folder" data-guid="${item.guid}" data-name="${escapeHtml(item.name || item.guid)}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--color-primary, #4ECDC4)" stroke="none" style="flex-shrink: 0; margin-right: var(--space-3);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        <span style="flex: 1; font-size: var(--font-size-sm);">${escapeHtml(item.name || item.guid)}</span>
                    </div>`;
                }
                return `<div class="uv-row" style="display: flex; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border, #222);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: var(--space-3);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span style="flex: 1; font-size: var(--font-size-sm);">${escapeHtml(item.name || item.guid)}</span>
                    <span style="font-size: var(--font-size-xs, 0.7rem); color: var(--color-text-secondary); margin-right: var(--space-3);">${item.size ? formatSize(item.size) : ''}</span>
                    <button class="btn btn-sm btn-secondary" data-action="download" data-guid="${item.guid}" style="margin-right: var(--space-1); padding: 2px 8px; font-size: var(--font-size-xs, 0.7rem);">Download</button>
                    <button class="btn btn-sm btn-secondary" data-action="delete" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--font-size-xs, 0.7rem); color: var(--color-error, #e74c3c);">Delete</button>
                </div>`;
            }).join('');
        }

        // ─── Event binding ─────────────────────────────────────────────────

        _bind() {
            // No-key state
            const genBtn = this.querySelector('#uv-generate');
            if (genBtn) genBtn.addEventListener('click', () => this._generateKeys());

            // Locked state
            const createBtn = this.querySelector('#uv-create');
            if (createBtn) createBtn.addEventListener('click', () => this._createVault());
            const openBtn = this.querySelector('#uv-open');
            if (openBtn) openBtn.addEventListener('click', () => this._openVault());

            // Open state
            const uploadBtn = this.querySelector('#uv-upload-btn');
            const fileInput = this.querySelector('#uv-file-input');
            if (uploadBtn && fileInput) {
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                    for (const f of e.target.files) this._uploadFile(f);
                });
            }

            const newFolderBtn = this.querySelector('#uv-newfolder-btn');
            if (newFolderBtn) newFolderBtn.addEventListener('click', () => {
                const name = prompt('Folder name:');
                if (name) this._createFolder(name);
            });

            // Drop zone
            const dz = this.querySelector('#uv-dropzone');
            if (dz) {
                dz.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dz.style.borderColor = 'var(--color-primary, #4ECDC4)';
                });
                dz.addEventListener('dragleave', () => {
                    dz.style.borderColor = 'var(--color-border, #333)';
                });
                dz.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dz.style.borderColor = 'var(--color-border, #333)';
                    for (const f of e.dataTransfer.files) this._uploadFile(f);
                });
            }

            // Breadcrumb navigation
            this.querySelectorAll('.uv-bc').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._navigateBreadcrumb(parseInt(el.dataset.idx));
                });
            });

            // File list actions
            this.querySelectorAll('.uv-row').forEach(el => {
                const action = el.dataset.action;
                if (action === 'open-folder') {
                    el.addEventListener('click', () => {
                        this._navigateToFolder(el.dataset.guid, el.dataset.name);
                    });
                }
            });
            this.querySelectorAll('[data-action="download"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._downloadFile(el.dataset.guid);
                });
            });
            this.querySelectorAll('[data-action="delete"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const meta = this._index[el.dataset.guid];
                    const name = meta ? meta.name : el.dataset.guid;
                    if (confirm(`Delete "${name}"?`)) this._deleteFile(el.dataset.guid);
                });
            });
        }

        // ─── Override upload to track parent ───────────────────────────────

        async _uploadFile(file) {
            const fileGuid = shortGuid();
            const data     = await file.arrayBuffer();
            const encrypted = await VaultCrypto.encrypt(this._keyPair.publicKey, new Uint8Array(data));
            const b64       = VaultCrypto.arrayBufToB64(encrypted);
            const result    = await VaultAPI.storeFile(this._vaultKey, fileGuid, b64);
            if (!result) return;
            // Update folder
            const folder = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (folder) {
                const children = folder.children || [];
                children.push(fileGuid);
                folder.children = children;
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, folder);
            }
            // Update index with parent tracking
            this._index[fileGuid] = {
                name:    file.name,
                type:    file.type || 'application/octet-stream',
                size:    file.size,
                kind:    'file',
                _parent: this._currentFolder
            };
            await this._saveIndex();
            this._render();
        }

        async _createFolder(name) {
            const guid = shortGuid();
            const newFolder = { type: 'folder', id: guid, children: [] };
            await VaultAPI.storeFolder(this._vaultKey, guid, newFolder);
            // Add to parent
            const parent = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(guid);
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, parent);
            }
            this._index[guid] = { name, kind: 'folder', _parent: this._currentFolder };
            await this._saveIndex();
            this._render();
        }
    }

    customElements.define('user-vault', UserVault);
})();
