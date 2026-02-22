/* =============================================================================
   SGraph Send — User Vault Component
   v0.1.7 — Zero-knowledge encrypted file vault (user-facing)

   Web Component providing a personal encrypted file vault.
   Uses VaultCrypto for PKI key management and hybrid encryption.
   Uses VaultAPI for server-side vault operations.
   Follows the Aurora design system (v0.1.6).

   Features:
   - Key generation with progress feedback (RSA-4096 takes seconds)
   - Inline folder creation (no browser prompt())
   - Inline delete confirmation (no browser confirm())
   - Sortable columns (name, size)
   - Vault statistics bar (file/folder count, total size)
   - In-place file/folder rename
   - Upload progress feedback
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
        if (bytes == null) return '';
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
            this._vaultKey      = null;
            this._keyPair       = null;
            this._rootFolder    = null;
            this._index         = {};        // guid -> { name, type, size, kind, _parent }
            this._breadcrumb    = [];        // [{ guid, name }]
            this._currentFolder = null;
            this._state         = 'loading'; // loading | generating | no-key | insecure | locked | open
            this._sortBy        = 'name';    // name | size
            this._sortAsc       = true;
            this._pendingDelete = null;      // guid of item awaiting delete confirmation
            this._showNewFolder = false;     // inline new-folder input visible
            this._renamingGuid  = null;      // guid of item being renamed
            this._statusMsg     = null;      // { type: 'info'|'success'|'error', text }
            this._statusTimer   = null;
        }

        connectedCallback() {
            this._init();
        }

        async _init() {
            this._render();
            if (!VaultCrypto.isSecureContext()) {
                this._state = 'insecure';
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

        // --- Status messages -------------------------------------------------

        _showStatus(type, text) {
            this._statusMsg = { type, text };
            if (this._statusTimer) clearTimeout(this._statusTimer);
            this._statusTimer = setTimeout(() => {
                this._statusMsg = null;
                const el = this.querySelector('#uv-status');
                if (el) el.remove();
            }, 4000);
            const el = this.querySelector('#uv-status');
            if (el) {
                el.className = 'uv-status uv-status--' + type;
                el.textContent = text;
            }
        }

        // --- Vault lifecycle -------------------------------------------------

        async _generateKeys() {
            this._state = 'generating';
            this._render();
            try {
                this._keyPair  = await VaultCrypto.generateKeyPair();
                this._vaultKey = await VaultCrypto.deriveVaultCacheKey(this._keyPair.publicKey);
                this._state    = 'locked';
            } catch (e) {
                console.error('[user-vault] Key generation failed:', e);
                this._state = 'no-key';
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
                console.error('[user-vault] Vault creation failed — API returned null');
                this._state = 'locked';
                this._render();
                this._showStatus('error', 'Vault creation failed. Check console for details.');
            }
        }

        async _openVault() {
            this._state = 'loading';
            this._render();
            const manifest = await VaultAPI.lookup(this._vaultKey);
            if (!manifest) {
                console.error('[user-vault] Vault lookup failed — API returned null');
                this._state = 'locked';
                this._render();
                this._showStatus('error', 'Could not open vault. Check console for details.');
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
                if (resp && resp.data) {
                    const packed    = VaultCrypto.b64ToArrayBuf(resp.data);
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

        // --- File operations -------------------------------------------------

        async _uploadFile(file) {
            this._showStatus('info', 'Encrypting "' + file.name + '"...');
            const fileGuid  = shortGuid();
            const data      = await file.arrayBuffer();
            const encrypted = await VaultCrypto.encrypt(this._keyPair.publicKey, new Uint8Array(data));
            const b64       = VaultCrypto.arrayBufToB64(encrypted);
            this._showStatus('info', 'Uploading "' + file.name + '"...');
            const result    = await VaultAPI.storeFile(this._vaultKey, fileGuid, b64);
            if (!result) {
                this._showStatus('error', 'Upload failed for "' + file.name + '"');
                return;
            }
            const folder = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (folder) {
                const children = folder.children || [];
                children.push(fileGuid);
                folder.children = children;
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, folder);
            }
            this._index[fileGuid] = {
                name:    file.name,
                type:    file.type || 'application/octet-stream',
                size:    file.size,
                kind:    'file',
                _parent: this._currentFolder
            };
            await this._saveIndex();
            this._showStatus('success', '"' + file.name + '" encrypted and uploaded');
            this._render();
        }

        async _downloadFile(guid) {
            const meta = this._index[guid] || {};
            this._showStatus('info', 'Downloading "' + (meta.name || guid) + '"...');
            const resp = await VaultAPI.getFile(this._vaultKey, guid);
            if (!resp || !resp.data) {
                this._showStatus('error', 'File data not found');
                return;
            }
            const packed    = VaultCrypto.b64ToArrayBuf(resp.data);
            const plaintext = await VaultCrypto.decrypt(this._keyPair.privateKey, packed);
            const blob      = new Blob([plaintext], { type: meta.type || 'application/octet-stream' });
            const url       = URL.createObjectURL(blob);
            const a         = document.createElement('a');
            a.href          = url;
            a.download      = meta.name || guid;
            a.click();
            URL.revokeObjectURL(url);
            this._showStatus('success', '"' + (meta.name || guid) + '" decrypted and downloaded');
        }

        async _deleteItem(guid) {
            const meta = this._index[guid] || {};
            const folder = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (folder) {
                folder.children = (folder.children || []).filter(c => c !== guid);
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, folder);
            }
            delete this._index[guid];
            await this._saveIndex();
            this._pendingDelete = null;
            this._showStatus('success', '"' + (meta.name || guid) + '" deleted');
            this._render();
        }

        // --- Folder operations -----------------------------------------------

        async _createFolder(name) {
            const guid = shortGuid();
            const newFolder = { type: 'folder', id: guid, children: [] };
            await VaultAPI.storeFolder(this._vaultKey, guid, newFolder);
            const parent = await VaultAPI.getFolder(this._vaultKey, this._currentFolder);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(guid);
                await VaultAPI.storeFolder(this._vaultKey, this._currentFolder, parent);
            }
            this._index[guid] = { name, kind: 'folder', _parent: this._currentFolder };
            await this._saveIndex();
            this._showNewFolder = false;
            this._showStatus('success', 'Folder "' + name + '" created');
            this._render();
        }

        _navigateToFolder(guid, name) {
            this._currentFolder = guid;
            this._breadcrumb.push({ guid, name });
            this._pendingDelete = null;
            this._showNewFolder = false;
            this._renamingGuid  = null;
            this._render();
        }

        _navigateBreadcrumb(idx) {
            this._breadcrumb    = this._breadcrumb.slice(0, idx + 1);
            this._currentFolder = this._breadcrumb[idx].guid;
            this._pendingDelete = null;
            this._showNewFolder = false;
            this._renamingGuid  = null;
            this._render();
        }

        // --- Rename ----------------------------------------------------------

        async _renameItem(guid, newName) {
            if (!newName || !newName.trim()) {
                this._renamingGuid = null;
                this._render();
                return;
            }
            const meta = this._index[guid];
            if (meta) {
                meta.name = newName.trim();
                await this._saveIndex();
                this._showStatus('success', 'Renamed to "' + meta.name + '"');
            }
            this._renamingGuid = null;
            this._render();
        }

        // --- Sort ------------------------------------------------------------

        _toggleSort(col) {
            if (this._sortBy === col) {
                this._sortAsc = !this._sortAsc;
            } else {
                this._sortBy  = col;
                this._sortAsc = true;
            }
            this._render();
        }

        // --- Statistics ------------------------------------------------------

        _getStats() {
            let files = 0, folders = 0, totalSize = 0;
            for (const [, meta] of Object.entries(this._index)) {
                if (meta._parent === this._currentFolder) {
                    if (meta.kind === 'folder') folders++;
                    else { files++; totalSize += (meta.size || 0); }
                }
            }
            return { files, folders, totalSize };
        }

        // =====================================================================
        // Render
        // =====================================================================

        _render() {
            if (this._state === 'insecure') {
                this.innerHTML = this._tmplInsecure();
            } else if (this._state === 'loading') {
                this.innerHTML = this._tmplLoading('Loading vault...');
            } else if (this._state === 'generating') {
                this.innerHTML = this._tmplLoading('Generating RSA-4096 key pair... this may take a few seconds');
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

        _tmplLoading(msg) {
            return `
            <div class="card card-enter" style="text-align: center; padding: var(--space-8);">
                <div class="loading-slash">/</div>
                <div style="font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-secondary); margin-top: var(--space-3);">${escapeHtml(msg)}</div>
            </div>`;
        }

        _tmplInsecure() {
            const localhostUrl = location.href.replace(location.hostname, 'localhost');
            return `
            <div class="card card-enter" style="padding: var(--space-6); text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-error, #E94560)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: var(--space-4);">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h2 style="font-size: var(--text-h3, 1.25rem); margin: 0 0 var(--space-2) 0;">Secure Context Required</h2>
                <p style="font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-secondary); margin: 0 0 var(--space-4) 0; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.6;">
                    The vault uses the Web Crypto API for zero-knowledge encryption, which requires a
                    <strong style="color: var(--color-text, #E0E0E0);">secure context</strong> (HTTPS or localhost).
                </p>
                <p style="font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-secondary); margin: 0 0 var(--space-4) 0;">
                    Current origin: <code style="background: var(--bg-secondary, #16213E); padding: 2px 6px; border-radius: 4px; font-size: var(--text-small, 0.8rem);">${escapeHtml(location.origin)}</code>
                </p>
                <p style="font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0;">
                    Try accessing this page via:
                </p>
                <a href="${escapeHtml(localhostUrl)}" style="display: inline-block; padding: var(--space-2) var(--space-4); background: var(--color-primary, #4ECDC4); color: var(--bg-primary, #0A1628); border-radius: var(--radius-sm, 6px); text-decoration: none; font-size: var(--font-size-sm, 0.875rem); font-weight: 600;">
                    Open on localhost
                </a>
            </div>`;
        }

        _tmplNoKey() {
            return `
            <div class="card card-enter" style="padding: var(--space-6); text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #4ECDC4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: var(--space-4);">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h2 style="font-size: var(--text-h3, 1.25rem); margin: 0 0 var(--space-2) 0;">Personal Vault</h2>
                <p style="font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0; max-width: 420px; margin-left: auto; margin-right: auto;">
                    Your vault encrypts files in the browser before upload. Only you hold the decryption key.
                    Generate a key pair to get started.
                </p>
                <button class="btn btn-primary" id="uv-generate">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    Generate Key Pair
                </button>
                <p style="font-size: var(--text-small, 0.8rem); color: var(--color-text-secondary); margin-top: var(--space-3); opacity: 0.7;">
                    RSA-4096 — may take a few seconds to generate
                </p>
            </div>`;
        }

        _tmplLocked() {
            return `
            <div class="card card-enter" style="padding: var(--space-6); text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #4ECDC4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: var(--space-4);">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h2 style="font-size: var(--text-h3, 1.25rem); margin: 0 0 var(--space-2) 0;">Open Your Vault</h2>
                <p style="font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-secondary); margin: 0 0 var(--space-5) 0;">
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
                if (isLast) return `<span style="color: var(--color-text, #E0E0E0); font-weight: var(--weight-semibold, 600);">${escapeHtml(b.name)}</span>`;
                return `<a href="#" class="uv-bc" data-idx="${i}" style="color: var(--color-primary, #4ECDC4); text-decoration: none;">${escapeHtml(b.name)}</a><span style="color: var(--color-text-secondary); margin: 0 var(--space-1);">/</span>`;
            }).join('');

            const rows  = this._buildItemRows();
            const stats = this._getStats();
            const arrow = this._sortAsc ? '\u2191' : '\u2193';

            return `
            <div class="card card-enter" style="padding: var(--space-4) var(--space-6);">
                <!-- Status message -->
                <div id="uv-status" style="display: none;"></div>

                <!-- Breadcrumb -->
                <div style="font-size: var(--font-size-sm, 0.875rem); margin-bottom: var(--space-4);">${bc}</div>

                <!-- Toolbar -->
                <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); flex-wrap: wrap; align-items: center;">
                    <button class="btn btn-sm btn-primary" id="uv-upload-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Upload File
                    </button>
                    <button class="btn btn-sm btn-secondary" id="uv-newfolder-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                        New Folder
                    </button>
                    <input type="file" id="uv-file-input" multiple style="display: none;">
                    <!-- Sort controls -->
                    <div style="margin-left: auto; display: flex; gap: var(--space-1); align-items: center;">
                        <span style="font-size: var(--text-small, 0.8rem); color: var(--color-text-secondary);">Sort:</span>
                        <button class="btn btn-sm btn-secondary" id="uv-sort-name" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); ${this._sortBy === 'name' ? 'color: var(--color-primary, #4ECDC4);' : ''}">
                            Name ${this._sortBy === 'name' ? arrow : ''}
                        </button>
                        <button class="btn btn-sm btn-secondary" id="uv-sort-size" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); ${this._sortBy === 'size' ? 'color: var(--color-primary, #4ECDC4);' : ''}">
                            Size ${this._sortBy === 'size' ? arrow : ''}
                        </button>
                    </div>
                </div>

                <!-- Inline new folder input -->
                ${this._showNewFolder ? `
                <div id="uv-newfolder-row" style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); padding: var(--space-2); background: var(--color-surface, #1E2A4A); border-radius: var(--radius-sm, 6px);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--color-primary, #4ECDC4)" stroke="none" style="flex-shrink: 0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <input type="text" id="uv-newfolder-input" placeholder="Folder name" style="flex: 1; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px); padding: var(--space-1) var(--space-2); color: var(--color-text); font-size: var(--font-size-sm, 0.875rem); outline: none;" autofocus>
                    <button class="btn btn-sm btn-primary" id="uv-newfolder-save" style="padding: 2px 12px;">Create</button>
                    <button class="btn btn-sm btn-secondary" id="uv-newfolder-cancel" style="padding: 2px 8px;">Cancel</button>
                </div>` : ''}

                <!-- Drop zone -->
                <div id="uv-dropzone" style="border: 2px dashed var(--color-border, #333); border-radius: var(--radius, 8px); padding: var(--space-6); text-align: center; color: var(--color-text-secondary); font-size: var(--font-size-sm, 0.875rem); margin-bottom: var(--space-4); transition: border-color 150ms ease, background 150ms ease; cursor: pointer;">
                    Drop files here to encrypt &amp; upload
                </div>

                <!-- File list -->
                <div id="uv-filelist">${rows}</div>

                <!-- Stats bar -->
                <div style="display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--color-border, #333); font-size: var(--text-small, 0.8rem); color: var(--color-text-secondary);">
                    <span>${stats.folders} folder${stats.folders !== 1 ? 's' : ''}</span>
                    <span style="color: var(--color-border);">|</span>
                    <span>${stats.files} file${stats.files !== 1 ? 's' : ''}</span>
                    <span style="color: var(--color-border);">|</span>
                    <span>${formatSize(stats.totalSize)} encrypted</span>
                    <span style="margin-left: auto;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #4ECDC4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        Zero-knowledge encrypted
                    </span>
                </div>
            </div>`;
        }

        _buildItemRows() {
            const children = [];
            for (const [guid, meta] of Object.entries(this._index)) {
                if (meta._parent === this._currentFolder) {
                    children.push({ guid, ...meta });
                }
            }

            if (children.length === 0) {
                return `<div style="text-align: center; padding: var(--space-6); color: var(--color-text-secondary); font-size: var(--font-size-sm, 0.875rem);">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: var(--space-2); opacity: 0.5;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <div>This folder is empty</div>
                    <div style="font-size: var(--text-small, 0.8rem); margin-top: var(--space-1);">Upload files or create a sub-folder to get started</div>
                </div>`;
            }

            // Sort: folders always first, then apply sort
            children.sort((a, b) => {
                if (a.kind === 'folder' && b.kind !== 'folder') return -1;
                if (a.kind !== 'folder' && b.kind === 'folder') return  1;
                const dir = this._sortAsc ? 1 : -1;
                if (this._sortBy === 'size') {
                    return ((a.size || 0) - (b.size || 0)) * dir;
                }
                return (a.name || '').localeCompare(b.name || '') * dir;
            });

            return children.map(item => {
                const isDeleting = this._pendingDelete === item.guid;
                const isRenaming = this._renamingGuid  === item.guid;

                if (item.kind === 'folder') {
                    return `<div class="uv-row" style="display: flex; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border, #222); cursor: pointer; transition: background 100ms;" data-action="open-folder" data-guid="${item.guid}" data-name="${escapeHtml(item.name || item.guid)}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--color-primary, #4ECDC4)" stroke="none" style="flex-shrink: 0; margin-right: var(--space-3);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        ${isRenaming
                            ? `<input type="text" class="uv-rename-input" data-guid="${item.guid}" value="${escapeHtml(item.name || '')}" style="flex: 1; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-primary, #4ECDC4); border-radius: var(--radius-sm, 6px); padding: var(--space-1) var(--space-2); color: var(--color-text); font-size: var(--font-size-sm, 0.875rem); outline: none;">`
                            : `<span class="uv-item-name" data-guid="${item.guid}" style="flex: 1; font-size: var(--font-size-sm, 0.875rem);" title="Double-click to rename">${escapeHtml(item.name || item.guid)}</span>`
                        }
                        <span style="font-size: var(--text-small, 0.8rem); color: var(--color-text-secondary); margin-right: var(--space-3);">Folder</span>
                        ${isDeleting
                            ? `<span style="font-size: var(--text-small, 0.8rem); color: var(--color-error, #E94560); margin-right: var(--space-1);">Delete?</span>
                               <button class="btn btn-sm" data-action="confirm-delete" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); color: var(--color-error, #E94560); border: 1px solid var(--color-error, #E94560); background: transparent; border-radius: var(--radius-sm, 6px); cursor: pointer;">Yes</button>
                               <button class="btn btn-sm" data-action="cancel-delete" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); margin-left: 2px; color: var(--color-text-secondary); background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px); cursor: pointer;">No</button>`
                            : `<button class="btn btn-sm btn-secondary" data-action="rename" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); margin-right: var(--space-1);">Rename</button>
                               <button class="btn btn-sm btn-secondary" data-action="delete" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); color: var(--color-error, #E94560);">Delete</button>`
                        }
                    </div>`;
                }

                return `<div class="uv-row" style="display: flex; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border, #222); transition: background 100ms;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: var(--space-3);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    ${isRenaming
                        ? `<input type="text" class="uv-rename-input" data-guid="${item.guid}" value="${escapeHtml(item.name || '')}" style="flex: 1; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-primary, #4ECDC4); border-radius: var(--radius-sm, 6px); padding: var(--space-1) var(--space-2); color: var(--color-text); font-size: var(--font-size-sm, 0.875rem); outline: none;">`
                        : `<span class="uv-item-name" data-guid="${item.guid}" style="flex: 1; font-size: var(--font-size-sm, 0.875rem);" title="Double-click to rename">${escapeHtml(item.name || item.guid)}</span>`
                    }
                    <span style="font-size: var(--text-small, 0.8rem); color: var(--color-text-secondary); margin-right: var(--space-3); min-width: 60px; text-align: right;">${item.size ? formatSize(item.size) : ''}</span>
                    ${isDeleting
                        ? `<span style="font-size: var(--text-small, 0.8rem); color: var(--color-error, #E94560); margin-right: var(--space-1);">Delete?</span>
                           <button class="btn btn-sm" data-action="confirm-delete" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); color: var(--color-error, #E94560); border: 1px solid var(--color-error, #E94560); background: transparent; border-radius: var(--radius-sm, 6px); cursor: pointer;">Yes</button>
                           <button class="btn btn-sm" data-action="cancel-delete" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); margin-left: 2px; color: var(--color-text-secondary); background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px); cursor: pointer;">No</button>`
                        : `<button class="btn btn-sm btn-secondary" data-action="download" data-guid="${item.guid}" style="margin-right: var(--space-1); padding: 2px 8px; font-size: var(--text-small, 0.8rem);">Download</button>
                           <button class="btn btn-sm btn-secondary" data-action="rename" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); margin-right: var(--space-1);">Rename</button>
                           <button class="btn btn-sm btn-secondary" data-action="delete" data-guid="${item.guid}" style="padding: 2px 8px; font-size: var(--text-small, 0.8rem); color: var(--color-error, #E94560);">Delete</button>`
                    }
                </div>`;
            }).join('');
        }

        // --- Event binding ---------------------------------------------------

        _bind() {
            // No-key state
            const genBtn = this.querySelector('#uv-generate');
            if (genBtn) genBtn.addEventListener('click', () => this._generateKeys());

            // Locked state
            const createBtn = this.querySelector('#uv-create');
            if (createBtn) createBtn.addEventListener('click', () => this._createVault());
            const openBtn = this.querySelector('#uv-open');
            if (openBtn) openBtn.addEventListener('click', () => this._openVault());

            // Open state: upload
            const uploadBtn = this.querySelector('#uv-upload-btn');
            const fileInput = this.querySelector('#uv-file-input');
            if (uploadBtn && fileInput) {
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                    for (const f of e.target.files) this._uploadFile(f);
                });
            }

            // New folder: show inline input
            const newFolderBtn = this.querySelector('#uv-newfolder-btn');
            if (newFolderBtn) newFolderBtn.addEventListener('click', () => {
                this._showNewFolder = true;
                this._render();
                const input = this.querySelector('#uv-newfolder-input');
                if (input) input.focus();
            });

            // Inline new folder: save/cancel
            const nfSave   = this.querySelector('#uv-newfolder-save');
            const nfCancel = this.querySelector('#uv-newfolder-cancel');
            const nfInput  = this.querySelector('#uv-newfolder-input');
            if (nfSave && nfInput) {
                nfSave.addEventListener('click', () => {
                    const name = nfInput.value.trim();
                    if (name) this._createFolder(name);
                });
            }
            if (nfCancel) {
                nfCancel.addEventListener('click', () => {
                    this._showNewFolder = false;
                    this._render();
                });
            }
            if (nfInput) {
                nfInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const name = nfInput.value.trim();
                        if (name) this._createFolder(name);
                    } else if (e.key === 'Escape') {
                        this._showNewFolder = false;
                        this._render();
                    }
                });
            }

            // Sort buttons
            const sortName = this.querySelector('#uv-sort-name');
            const sortSize = this.querySelector('#uv-sort-size');
            if (sortName) sortName.addEventListener('click', () => this._toggleSort('name'));
            if (sortSize) sortSize.addEventListener('click', () => this._toggleSort('size'));

            // Drop zone
            const dz = this.querySelector('#uv-dropzone');
            if (dz) {
                dz.addEventListener('click', () => {
                    const fi = this.querySelector('#uv-file-input');
                    if (fi) fi.click();
                });
                dz.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dz.style.borderColor = 'var(--color-primary, #4ECDC4)';
                    dz.style.background  = 'var(--accent-subtle, rgba(78, 205, 196, 0.12))';
                });
                dz.addEventListener('dragleave', () => {
                    dz.style.borderColor = 'var(--color-border, #333)';
                    dz.style.background  = '';
                });
                dz.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dz.style.borderColor = 'var(--color-border, #333)';
                    dz.style.background  = '';
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

            // File list: folder navigation
            this.querySelectorAll('.uv-row[data-action="open-folder"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    // Don't navigate when clicking buttons inside the row
                    if (e.target.closest('button') || e.target.closest('input')) return;
                    this._navigateToFolder(el.dataset.guid, el.dataset.name);
                });
            });

            // File list: download
            this.querySelectorAll('[data-action="download"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._downloadFile(el.dataset.guid);
                });
            });

            // File list: delete (shows inline confirmation)
            this.querySelectorAll('[data-action="delete"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._pendingDelete = el.dataset.guid;
                    this._render();
                });
            });

            // File list: confirm delete
            this.querySelectorAll('[data-action="confirm-delete"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._deleteItem(el.dataset.guid);
                });
            });

            // File list: cancel delete
            this.querySelectorAll('[data-action="cancel-delete"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._pendingDelete = null;
                    this._render();
                });
            });

            // Rename button
            this.querySelectorAll('[data-action="rename"]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._renamingGuid = el.dataset.guid;
                    this._render();
                    const input = this.querySelector('.uv-rename-input[data-guid="' + el.dataset.guid + '"]');
                    if (input) { input.focus(); input.select(); }
                });
            });

            // Rename input: Enter to save, Escape to cancel
            this.querySelectorAll('.uv-rename-input').forEach(el => {
                el.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        this._renameItem(el.dataset.guid, el.value);
                    } else if (e.key === 'Escape') {
                        this._renamingGuid = null;
                        this._render();
                    }
                });
                el.addEventListener('blur', () => {
                    if (this._renamingGuid === el.dataset.guid) {
                        this._renameItem(el.dataset.guid, el.value);
                    }
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            });

            // Double-click name to rename
            this.querySelectorAll('.uv-item-name').forEach(el => {
                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this._renamingGuid = el.dataset.guid;
                    this._render();
                    const input = this.querySelector('.uv-rename-input[data-guid="' + el.dataset.guid + '"]');
                    if (input) { input.focus(); input.select(); }
                });
            });
        }
    }

    customElements.define('user-vault', UserVault);
})();
