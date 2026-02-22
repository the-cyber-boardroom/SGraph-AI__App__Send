/* =============================================================================
   SGraph Send Admin Console — Vault File Manager
   v0.1.5 — PKI-keyed personal data vault

   Zero-knowledge encrypted file system:
   - Vault root derived from PKI key hash
   - Folders are plain JSON (structure only, no names on server)
   - Files are AES-256-GCM encrypted blobs
   - Index maps GUIDs to human-readable names (encrypted)
   - Server never sees plaintext

   Features:
   - Inline folder creation (no browser prompt())
   - Inline delete confirmation (no browser confirm())
   - Sortable table columns (name, size)
   - Vault statistics in status bar (file/folder count, total size)
   - In-place rename (double-click name)
   - Upload progress feedback via message center
   ============================================================================= */

(function() {
    'use strict';

    const { escapeHtml, arrayBufToB64, b64ToArrayBuf, PKI_SHARED_STYLES } = window.sgraphAdmin.pki;

    // =========================================================================
    // Vault crypto helpers
    // =========================================================================

    async function deriveVaultCacheKey(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const hash     = await crypto.subtle.digest('SHA-256', exported);
        const hex      = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        const keyHash  = hex.substring(0, 32);
        const combined = new TextEncoder().encode(keyHash + '/filesystem');
        const derived  = await crypto.subtle.digest('SHA-256', combined);
        const derivedHex = [...new Uint8Array(derived)].map(b => b.toString(16).padStart(2, '0')).join('');
        return derivedHex.substring(0, 32);
    }

    async function generateAesKey() {
        return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }

    async function encryptBlob(publicKey, data) {
        const aesKey     = await generateAesKey();
        const iv         = crypto.getRandomValues(new Uint8Array(12));
        const encrypted  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
        const rawAesKey  = await crypto.subtle.exportKey('raw', aesKey);
        const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
        // Pack: [4 bytes wrappedKey length][wrappedKey][12 bytes IV][ciphertext]
        const wkLen  = new Uint32Array([wrappedKey.byteLength]);
        const packed = new Uint8Array(4 + wrappedKey.byteLength + 12 + encrypted.byteLength);
        packed.set(new Uint8Array(wkLen.buffer), 0);
        packed.set(new Uint8Array(wrappedKey), 4);
        packed.set(iv, 4 + wrappedKey.byteLength);
        packed.set(new Uint8Array(encrypted), 4 + wrappedKey.byteLength + 12);
        return packed;
    }

    async function decryptBlob(privateKey, packed) {
        const bytes  = new Uint8Array(packed);
        const wkLen  = new Uint32Array(bytes.slice(0, 4).buffer)[0];
        const wrappedKey = bytes.slice(4, 4 + wkLen);
        const iv         = bytes.slice(4 + wkLen, 4 + wkLen + 12);
        const ciphertext = bytes.slice(4 + wkLen + 12);
        const rawAesKey  = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);
        const aesKey     = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    }

    function generateGuid() {
        return [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function formatSize(bytes) {
        if (bytes == null) return '\u2014';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    // =========================================================================
    // Component
    // =========================================================================

    const VM_STYLES = `
        ${PKI_SHARED_STYLES}

        :host, vault-manager { display: block; height: 100%; }

        .vm-container   { height: 100%; display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem; }
        .vm-toolbar     { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .vm-breadcrumb  { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8125rem; color: var(--admin-text-secondary, #8b8fa7); flex: 1; min-width: 0; overflow: hidden; }
        .vm-breadcrumb span { cursor: pointer; padding: 0.125rem 0.25rem; border-radius: 3px; white-space: nowrap; }
        .vm-breadcrumb span:hover { background: var(--admin-surface-hover, #2a2e3d); color: var(--admin-text, #e4e6ef); }
        .vm-breadcrumb .vm-bc-sep { cursor: default; color: var(--admin-text-muted, #5e6280); }
        .vm-breadcrumb .vm-bc-sep:hover { background: none; }
        .vm-breadcrumb .vm-bc-current { color: var(--admin-text, #e4e6ef); font-weight: 600; cursor: default; }
        .vm-breadcrumb .vm-bc-current:hover { background: none; }

        .vm-actions     { display: flex; gap: 0.375rem; }
        .vm-content     { flex: 1; overflow-y: auto; }

        .vm-table        { width: 100%; border-collapse: collapse; }
        .vm-table th     { text-align: left; font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--admin-border, #2e3347); cursor: pointer; user-select: none; }
        .vm-table th:hover { color: var(--admin-text-secondary, #8b8fa7); }
        .vm-table th.vm-sort-active { color: var(--admin-primary, #4f8ff7); }
        .vm-table th:last-child { cursor: default; }
        .vm-table td     { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); font-size: 0.8125rem; color: var(--admin-text, #e4e6ef); }
        .vm-table tr:hover td { background: var(--admin-surface-hover, #2a2e3d); }
        .vm-table tr.vm-row-folder { cursor: pointer; }

        .vm-icon         { display: inline-flex; align-items: center; gap: 0.375rem; }
        .vm-icon svg     { width: 16px; height: 16px; flex-shrink: 0; }
        .vm-icon-folder  { color: var(--admin-warning, #fbbf24); }
        .vm-icon-file    { color: var(--admin-primary, #4f8ff7); }
        .vm-icon-lock    { color: var(--admin-success, #34d399); }

        .vm-name         { font-weight: 500; }
        .vm-name-editable { cursor: text; }
        .vm-name-editable:hover { text-decoration: underline dotted; text-underline-offset: 2px; }
        .vm-meta         { font-size: 0.6875rem; color: var(--admin-text-secondary, #8b8fa7); }

        .vm-rename-input { background: var(--admin-bg, #1a1d2e); border: 1px solid var(--admin-primary, #4f8ff7); border-radius: 3px; color: var(--admin-text, #e4e6ef); font-size: 0.8125rem; font-weight: 500; padding: 0.125rem 0.375rem; outline: none; width: 100%; max-width: 300px; }

        .vm-inline-confirm { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; }
        .vm-inline-confirm span { color: var(--admin-error, #ef4444); }
        .vm-inline-confirm .vm-confirm-yes { color: var(--admin-error, #ef4444); border-color: var(--admin-error, #ef4444); }

        .vm-new-folder-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); background: var(--admin-surface-hover, #2a2e3d); }
        .vm-new-folder-row input { flex: 1; max-width: 300px; }

        .vm-status-bar   { display: flex; align-items: center; gap: 0.75rem; font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); padding: 0.25rem 0; border-top: 1px solid var(--admin-border-subtle, #252838); flex-wrap: wrap; }
        .vm-status-bar .vm-status-key { font-family: var(--admin-font-mono, monospace); }

        .vm-no-key       { text-align: center; padding: 3rem 1rem; }
        .vm-no-key__icon { margin-bottom: 0.75rem; color: var(--admin-text-muted, #5e6280); }
        .vm-no-key__icon svg { width: 40px; height: 40px; }
        .pk-empty__icon svg  { width: 40px; height: 40px; }
        .vm-no-key__title { font-size: 1.125rem; font-weight: 600; color: var(--admin-text, #e4e6ef); margin-bottom: 0.5rem; }
        .vm-no-key__text { font-size: 0.875rem; color: var(--admin-text-secondary, #8b8fa7); line-height: 1.6; max-width: 480px; margin: 0 auto 1rem; }

        .vm-drop-zone    { border: 2px dashed var(--admin-border, #2e3347); border-radius: var(--admin-radius-lg, 10px); padding: 2rem; text-align: center; color: var(--admin-text-secondary, #8b8fa7); font-size: 0.875rem; transition: border-color 150ms, background 150ms; cursor: pointer; }
        .vm-drop-zone:hover, .vm-drop-zone.vm-drag-over { border-color: var(--admin-primary, #4f8ff7); background: var(--admin-primary-bg, rgba(79,143,247,0.05)); }
        .vm-drop-zone input[type="file"] { display: none; }
    `;

    const SVG_FOLDER = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>';
    const SVG_FILE   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>';
    const SVG_LOCK   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>';
    const SVG_PLUS   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>';
    const SVG_UPLOAD = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
    const SVG_REFRESH = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>';
    const SVG_DOWNLOAD = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    const SVG_DELETE  = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
    const SVG_RENAME = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>';

    class VaultManager extends HTMLElement {

        static get appId()    { return 'vault'; }
        static get navLabel() { return 'My Vault'; }
        static get navIcon()  { return SVG_LOCK; }

        constructor() {
            super();
            this._selectedKey    = null;   // { publicKey, privateKey, fingerprint, ... }
            this._vaultCacheKey  = null;
            this._vaultManifest  = null;
            this._currentFolder  = null;   // current folder GUID
            this._folderPath     = [];     // breadcrumb: [{guid, name}]
            this._index          = {};     // GUID -> { name, type, parentGuid }
            this._loading        = false;
            this._sortBy         = 'name'; // name | size
            this._sortAsc        = true;
            this._pendingDelete  = null;   // guid awaiting delete confirmation
            this._showNewFolder  = false;  // inline new-folder input visible
            this._renamingGuid   = null;   // guid of item being renamed
            this._lastFolder     = null;   // cached folder data for current view
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() { /* cleanup */ }

        onActivated() {
            this._loadKeys();
        }

        onDeactivated() { /* nothing */ }

        // =====================================================================
        // Rendering
        // =====================================================================

        render() {
            this.innerHTML = `<style>${VM_STYLES}</style><div class="vm-container"><div class="pk-loading"><span class="pk-spinner"></span> Loading keys...</div></div>`;
        }

        _renderNoKey() {
            this.querySelector('.vm-container').innerHTML = `
                <div class="vm-no-key">
                    <div class="vm-no-key__icon">${SVG_LOCK}</div>
                    <div class="vm-no-key__title">No PKI Key Found</div>
                    <p class="vm-no-key__text">
                        The vault requires a PKI key pair. Generate or import one in the
                        <span class="pk-btn pk-btn--xs pk-btn--ghost" onclick="window.sgraphAdmin.router.navigateTo('pki-keys')">PKI Keys</span>
                        section first.
                    </p>
                </div>
            `;
        }

        _renderVault() {
            const container = this.querySelector('.vm-container');
            container.innerHTML = `
                <div class="vm-toolbar">
                    <div class="vm-breadcrumb" id="vm-breadcrumb"></div>
                    <div class="vm-actions">
                        <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-refresh" title="Refresh">${SVG_REFRESH}</button>
                        <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-new-folder" title="New folder">${SVG_PLUS} Folder</button>
                        <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-btn-upload" title="Upload file">${SVG_UPLOAD} Upload</button>
                    </div>
                </div>
                <div class="vm-content" id="vm-content"></div>
                <div class="vm-drop-zone" id="vm-drop-zone">
                    Drop files here to encrypt &amp; upload
                    <input type="file" id="vm-file-input" multiple>
                </div>
                <div class="vm-status-bar" id="vm-status-bar">
                    <span class="vm-icon vm-icon-lock">${SVG_LOCK}</span>
                    <span>Key: <span class="vm-status-key">${escapeHtml(this._selectedKey.fingerprint || '')}</span></span>
                    <span>Vault: <span class="vm-status-key">${escapeHtml(this._vaultCacheKey.substring(0, 12))}...</span></span>
                    <span id="vm-stats"></span>
                </div>
            `;

            // Event listeners
            container.querySelector('#vm-btn-refresh').addEventListener('click', () => this._browseFolder(this._currentFolder));
            container.querySelector('#vm-btn-new-folder').addEventListener('click', () => this._toggleNewFolderInput());
            container.querySelector('#vm-btn-upload').addEventListener('click', () => container.querySelector('#vm-file-input').click());
            container.querySelector('#vm-file-input').addEventListener('change', (e) => this._handleFileUpload(e.target.files));

            const dropZone = container.querySelector('#vm-drop-zone');
            dropZone.addEventListener('click', () => container.querySelector('#vm-file-input').click());
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('vm-drag-over'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('vm-drag-over'));
            dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('vm-drag-over'); this._handleFileUpload(e.dataTransfer.files); });

            this._browseFolder(this._currentFolder);
        }

        _renderBreadcrumb() {
            const bc = this.querySelector('#vm-breadcrumb');
            if (!bc) return;
            let html = `<span onclick="this.getRootNode().host ? this.getRootNode().host._navigateToRoot() : document.querySelector('vault-manager')._navigateToRoot()">Vault</span>`;
            for (let i = 0; i < this._folderPath.length; i++) {
                const item = this._folderPath[i];
                const isCurrent = (i === this._folderPath.length - 1);
                html += `<span class="vm-bc-sep">/</span>`;
                if (isCurrent) {
                    html += `<span class="vm-bc-current">${escapeHtml(item.name)}</span>`;
                } else {
                    html += `<span data-guid="${escapeHtml(item.guid)}">${escapeHtml(item.name)}</span>`;
                }
            }
            bc.innerHTML = html;
            bc.querySelectorAll('span[data-guid]').forEach(el => {
                el.addEventListener('click', () => this._navigateToFolder(el.dataset.guid));
            });
        }

        _renderFolderContents(folder) {
            const content = this.querySelector('#vm-content');
            if (!content) return;
            this._lastFolder = folder;
            const children = folder.children || [];

            if (children.length === 0 && !this._showNewFolder) {
                content.innerHTML = `
                    <div class="pk-empty">
                        <div class="pk-empty__icon">${SVG_FOLDER}</div>
                        <div class="pk-empty__text">This folder is empty</div>
                        <div class="pk-empty__hint">Upload files or create a subfolder to get started</div>
                    </div>`;
                this._updateStats(children);
                return;
            }

            // Build sorted item list with metadata
            const items = children.map(guid => {
                const meta = this._index[guid] || {};
                return { guid, name: meta.name || guid, type: meta.type || 'unknown', size: meta.size || 0, mime: meta.mime };
            });

            // Sort: folders first, then by selected column
            items.sort((a, b) => {
                const aIsFolder = a.type === 'folder';
                const bIsFolder = b.type === 'folder';
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return  1;
                const dir = this._sortAsc ? 1 : -1;
                if (this._sortBy === 'size') return (a.size - b.size) * dir;
                return a.name.localeCompare(b.name) * dir;
            });

            const arrow = this._sortAsc ? ' \u2191' : ' \u2193';
            let rows = '';

            // Inline new folder row
            if (this._showNewFolder) {
                rows += `<tr class="vm-new-folder-row">
                    <td colspan="4" style="padding: 0;">
                        <div class="vm-new-folder-row">
                            <span class="vm-icon vm-icon-folder">${SVG_FOLDER}</span>
                            <input type="text" class="vm-rename-input" id="vm-new-folder-input" placeholder="Folder name" autofocus>
                            <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-new-folder-save">Create</button>
                            <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-new-folder-cancel">Cancel</button>
                        </div>
                    </td>
                </tr>`;
            }

            for (const item of items) {
                const isDeleting = this._pendingDelete === item.guid;
                const isRenaming = this._renamingGuid  === item.guid;

                if (item.type === 'folder') {
                    rows += `<tr class="vm-row-folder" data-guid="${escapeHtml(item.guid)}">
                        <td>
                            <span class="vm-icon vm-icon-folder">${SVG_FOLDER}</span>
                            ${isRenaming
                                ? `<input type="text" class="vm-rename-input" data-rename-guid="${escapeHtml(item.guid)}" value="${escapeHtml(item.name)}">`
                                : `<span class="vm-name vm-name-editable" data-name-guid="${escapeHtml(item.guid)}">${escapeHtml(item.name)}</span>`
                            }
                        </td>
                        <td class="vm-meta">Folder</td>
                        <td class="vm-meta">\u2014</td>
                        <td>
                            ${isDeleting
                                ? `<span class="vm-inline-confirm">
                                       <span>Delete?</span>
                                       <button class="pk-btn pk-btn--xs pk-btn--ghost vm-confirm-yes" data-confirm-guid="${escapeHtml(item.guid)}">Yes</button>
                                       <button class="pk-btn pk-btn--xs pk-btn--ghost vm-confirm-no">No</button>
                                   </span>`
                                : `<button class="pk-btn pk-btn--xs pk-btn--ghost vm-btn-rename" data-guid="${escapeHtml(item.guid)}" title="Rename">${SVG_RENAME}</button>
                                   <button class="pk-btn pk-btn--xs pk-btn--danger vm-btn-delete" data-guid="${escapeHtml(item.guid)}" title="Delete">${SVG_DELETE}</button>`
                            }
                        </td>
                    </tr>`;
                } else {
                    const size = item.size ? formatSize(item.size) : '\u2014';
                    rows += `<tr data-guid="${escapeHtml(item.guid)}">
                        <td>
                            <span class="vm-icon vm-icon-file">${SVG_FILE}</span>
                            ${isRenaming
                                ? `<input type="text" class="vm-rename-input" data-rename-guid="${escapeHtml(item.guid)}" value="${escapeHtml(item.name)}">`
                                : `<span class="vm-name vm-name-editable" data-name-guid="${escapeHtml(item.guid)}">${escapeHtml(item.name)}</span>`
                            }
                        </td>
                        <td class="vm-meta">File</td>
                        <td class="vm-meta">${escapeHtml(size)}</td>
                        <td>
                            ${isDeleting
                                ? `<span class="vm-inline-confirm">
                                       <span>Delete?</span>
                                       <button class="pk-btn pk-btn--xs pk-btn--ghost vm-confirm-yes" data-confirm-guid="${escapeHtml(item.guid)}">Yes</button>
                                       <button class="pk-btn pk-btn--xs pk-btn--ghost vm-confirm-no">No</button>
                                   </span>`
                                : `<button class="pk-btn pk-btn--xs pk-btn--ghost vm-btn-download" data-guid="${escapeHtml(item.guid)}" title="Download">${SVG_DOWNLOAD}</button>
                                   <button class="pk-btn pk-btn--xs pk-btn--ghost vm-btn-rename" data-guid="${escapeHtml(item.guid)}" title="Rename">${SVG_RENAME}</button>
                                   <button class="pk-btn pk-btn--xs pk-btn--danger vm-btn-delete" data-guid="${escapeHtml(item.guid)}" title="Delete">${SVG_DELETE}</button>`
                            }
                        </td>
                    </tr>`;
                }
            }

            content.innerHTML = `
                <table class="vm-table">
                    <thead><tr>
                        <th id="vm-th-name" class="${this._sortBy === 'name' ? 'vm-sort-active' : ''}">Name${this._sortBy === 'name' ? arrow : ''}</th>
                        <th>Type</th>
                        <th id="vm-th-size" class="${this._sortBy === 'size' ? 'vm-sort-active' : ''}">Size${this._sortBy === 'size' ? arrow : ''}</th>
                        <th></th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;

            this._bindFolderEvents(content);
            this._updateStats(children);
        }

        _bindFolderEvents(content) {
            // Sort column headers
            const thName = content.querySelector('#vm-th-name');
            const thSize = content.querySelector('#vm-th-size');
            if (thName) thName.addEventListener('click', () => this._toggleSort('name'));
            if (thSize) thSize.addEventListener('click', () => this._toggleSort('size'));

            // Folder double-click to navigate
            content.querySelectorAll('.vm-row-folder').forEach(tr => {
                tr.addEventListener('dblclick', (e) => {
                    if (e.target.closest('button') || e.target.closest('input')) return;
                    this._navigateToFolder(tr.dataset.guid);
                });
            });

            // Download
            content.querySelectorAll('.vm-btn-download').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this._downloadFile(btn.dataset.guid); });
            });

            // Delete: show inline confirmation
            content.querySelectorAll('.vm-btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._pendingDelete = btn.dataset.guid;
                    this._renderFolderContents(this._lastFolder);
                    this._renderBreadcrumb();
                });
            });

            // Confirm delete
            content.querySelectorAll('.vm-confirm-yes').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._deleteItem(btn.dataset.confirmGuid);
                });
            });

            // Cancel delete
            content.querySelectorAll('.vm-confirm-no').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._pendingDelete = null;
                    this._renderFolderContents(this._lastFolder);
                    this._renderBreadcrumb();
                });
            });

            // Rename button
            content.querySelectorAll('.vm-btn-rename').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._renamingGuid = btn.dataset.guid;
                    this._renderFolderContents(this._lastFolder);
                    this._renderBreadcrumb();
                    const input = content.querySelector(`[data-rename-guid="${btn.dataset.guid}"]`);
                    if (input) { input.focus(); input.select(); }
                });
            });

            // Double-click name to rename
            content.querySelectorAll('.vm-name-editable').forEach(el => {
                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this._renamingGuid = el.dataset.nameGuid;
                    this._renderFolderContents(this._lastFolder);
                    this._renderBreadcrumb();
                    const input = content.querySelector(`[data-rename-guid="${el.dataset.nameGuid}"]`);
                    if (input) { input.focus(); input.select(); }
                });
            });

            // Rename input: Enter/Escape/blur
            content.querySelectorAll('.vm-rename-input[data-rename-guid]').forEach(input => {
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') this._commitRename(input.dataset.renameGuid, input.value);
                    else if (e.key === 'Escape') { this._renamingGuid = null; this._renderFolderContents(this._lastFolder); this._renderBreadcrumb(); }
                });
                input.addEventListener('blur', () => {
                    if (this._renamingGuid === input.dataset.renameGuid) {
                        this._commitRename(input.dataset.renameGuid, input.value);
                    }
                });
                input.addEventListener('click', (e) => e.stopPropagation());
            });

            // Inline new folder: save/cancel/Enter/Escape
            const nfInput  = content.querySelector('#vm-new-folder-input');
            const nfSave   = content.querySelector('#vm-new-folder-save');
            const nfCancel = content.querySelector('#vm-new-folder-cancel');
            if (nfInput) {
                nfInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const name = nfInput.value.trim();
                        if (name) this._createFolder(name);
                    } else if (e.key === 'Escape') {
                        this._showNewFolder = false;
                        this._renderFolderContents(this._lastFolder);
                        this._renderBreadcrumb();
                    }
                });
                setTimeout(() => nfInput.focus(), 0);
            }
            if (nfSave) nfSave.addEventListener('click', () => {
                const name = (nfInput ? nfInput.value.trim() : '');
                if (name) this._createFolder(name);
            });
            if (nfCancel) nfCancel.addEventListener('click', () => {
                this._showNewFolder = false;
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            });
        }

        _updateStats(children) {
            const el = this.querySelector('#vm-stats');
            if (!el) return;
            let files = 0, folders = 0, totalSize = 0;
            for (const guid of children) {
                const meta = this._index[guid] || {};
                if (meta.type === 'folder') folders++;
                else { files++; totalSize += (meta.size || 0); }
            }
            el.textContent = `${folders} folder${folders !== 1 ? 's' : ''}, ${files} file${files !== 1 ? 's' : ''}, ${formatSize(totalSize)} encrypted`;
        }

        // =====================================================================
        // Key + Vault initialization
        // =====================================================================

        async _loadKeys() {
            const pki = window.sgraphAdmin.pki;
            if (!pki.hasWebCrypto()) {
                this.querySelector('.vm-container').innerHTML = pki.renderInsecureContextError();
                return;
            }

            try {
                const keys = await pki.db.getAll('keys');
                if (!keys || keys.length === 0) {
                    this._renderNoKey();
                    return;
                }
                const fingerprint = keys[0].fingerprint || await pki.computeFingerprint(keys[0].publicKey);
                this._selectedKey = {
                    publicKey   : keys[0].publicKey,
                    privateKey  : keys[0].privateKey,
                    fingerprint : fingerprint,
                    record      : keys[0]
                };
                await this._initVault();
            } catch (err) {
                this._showError('Failed to load keys: ' + err.message);
            }
        }

        async _initVault() {
            try {
                this._vaultCacheKey = await deriveVaultCacheKey(this._selectedKey.publicKey);

                const existsResult = await adminAPI.vaultExists(this._vaultCacheKey);

                if (existsResult.exists) {
                    this._vaultManifest = await adminAPI.vaultLookup(this._vaultCacheKey);
                    this._currentFolder = this._vaultManifest.root_folder;
                } else {
                    const result = await adminAPI.vaultCreate(this._vaultCacheKey, this._selectedKey.fingerprint);
                    this._vaultManifest = await adminAPI.vaultLookup(this._vaultCacheKey);
                    this._currentFolder = result.root_folder;
                    const emptyIndex = JSON.stringify({ version: 1, entries: {} });
                    const encIndex   = await encryptBlob(this._selectedKey.publicKey, new TextEncoder().encode(emptyIndex));
                    await adminAPI.vaultStoreIndex(this._vaultCacheKey, arrayBufToB64(encIndex));
                }

                await this._loadIndex();
                this._folderPath = [{ guid: this._currentFolder, name: 'Root' }];
                this._renderVault();
            } catch (err) {
                this._showError('Failed to initialize vault: ' + err.message);
            }
        }

        async _loadIndex() {
            try {
                const result = await adminAPI.vaultGetIndex(this._vaultCacheKey);
                if (result && result.data) {
                    const packed    = b64ToArrayBuf(result.data);
                    const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);
                    const indexJson = JSON.parse(new TextDecoder().decode(decrypted));
                    this._index = indexJson.entries || {};
                }
            } catch (_) {
                this._index = {};
            }
        }

        async _saveIndex() {
            const indexJson = JSON.stringify({ version: 1, entries: this._index });
            const encrypted = await encryptBlob(this._selectedKey.publicKey, new TextEncoder().encode(indexJson));
            await adminAPI.vaultStoreIndex(this._vaultCacheKey, arrayBufToB64(encrypted));
        }

        // =====================================================================
        // Sort
        // =====================================================================

        _toggleSort(col) {
            if (this._sortBy === col) {
                this._sortAsc = !this._sortAsc;
            } else {
                this._sortBy  = col;
                this._sortAsc = true;
            }
            if (this._lastFolder) {
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            }
        }

        // =====================================================================
        // Folder navigation
        // =====================================================================

        async _browseFolder(folderGuid) {
            this._pendingDelete = null;
            this._renamingGuid  = null;
            this._showNewFolder = false;
            try {
                const folder = await adminAPI.vaultGetFolder(this._vaultCacheKey, folderGuid);
                if (folder && folder.data) {
                    this._renderFolderContents(folder.data);
                } else {
                    this._renderFolderContents({ children: [] });
                }
                this._renderBreadcrumb();
            } catch (err) {
                this._renderFolderContents({ children: [] });
                this._renderBreadcrumb();
            }
        }

        _navigateToRoot() {
            this._currentFolder = this._vaultManifest.root_folder;
            this._folderPath    = [{ guid: this._currentFolder, name: 'Root' }];
            this._browseFolder(this._currentFolder);
        }

        async _navigateToFolder(folderGuid) {
            const pathIdx = this._folderPath.findIndex(p => p.guid === folderGuid);
            if (pathIdx >= 0) {
                this._folderPath = this._folderPath.slice(0, pathIdx + 1);
            } else {
                const meta = this._index[folderGuid] || {};
                this._folderPath.push({ guid: folderGuid, name: meta.name || folderGuid });
            }
            this._currentFolder = folderGuid;
            this._browseFolder(folderGuid);
        }

        // =====================================================================
        // Folder operations
        // =====================================================================

        _toggleNewFolderInput() {
            this._showNewFolder = !this._showNewFolder;
            if (this._lastFolder) {
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            }
        }

        async _createFolder(name) {
            try {
                const folderGuid = generateGuid();
                const folderData = { type: 'folder', id: folderGuid, children: [] };

                await adminAPI.vaultStoreFolder(this._vaultCacheKey, folderGuid, folderData);

                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(folderGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                this._index[folderGuid] = { name, type: 'folder', parentGuid: this._currentFolder };
                await this._saveIndex();

                this._showNewFolder = false;
                this._msg('success', `Folder "${name}" created`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', 'Failed to create folder: ' + err.message);
            }
        }

        // =====================================================================
        // Rename
        // =====================================================================

        async _commitRename(guid, newName) {
            this._renamingGuid = null;
            if (!newName || !newName.trim()) {
                if (this._lastFolder) { this._renderFolderContents(this._lastFolder); this._renderBreadcrumb(); }
                return;
            }
            const meta = this._index[guid];
            if (meta) {
                meta.name = newName.trim();
                await this._saveIndex();
                this._msg('success', `Renamed to "${meta.name}"`);
            }
            if (this._lastFolder) { this._renderFolderContents(this._lastFolder); this._renderBreadcrumb(); }
        }

        // =====================================================================
        // File operations
        // =====================================================================

        async _handleFileUpload(fileList) {
            if (!fileList || fileList.length === 0) return;
            for (const file of fileList) {
                await this._uploadFile(file);
            }
        }

        async _uploadFile(file) {
            try {
                this._msg('info', `Encrypting "${file.name}"...`);

                const fileGuid  = generateGuid();
                const data      = await file.arrayBuffer();
                const encrypted = await encryptBlob(this._selectedKey.publicKey, data);
                const b64       = arrayBufToB64(encrypted);

                this._msg('info', `Uploading "${file.name}"...`);
                await adminAPI.vaultStoreFile(this._vaultCacheKey, fileGuid, b64);

                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(fileGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                this._index[fileGuid] = { name: file.name, type: 'file', size: file.size, parentGuid: this._currentFolder, mime: file.type };
                await this._saveIndex();

                this._msg('success', `"${file.name}" uploaded and encrypted`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', `Upload failed: ${err.message}`);
            }
        }

        async _downloadFile(fileGuid) {
            try {
                const meta = this._index[fileGuid] || {};
                this._msg('info', `Downloading "${meta.name || fileGuid}"...`);

                const result = await adminAPI.vaultGetFile(this._vaultCacheKey, fileGuid);
                if (!result || !result.data) {
                    this._msg('error', 'File data not found');
                    return;
                }

                const packed    = b64ToArrayBuf(result.data);
                const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);

                const blob = new Blob([decrypted], { type: meta.mime || 'application/octet-stream' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = meta.name || fileGuid;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this._msg('success', `"${meta.name || fileGuid}" decrypted and downloaded`);
            } catch (err) {
                this._msg('error', `Download failed: ${err.message}`);
            }
        }

        async _deleteItem(guid) {
            const meta = this._index[guid] || {};
            try {
                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = (parent.data.children || []).filter(g => g !== guid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                delete this._index[guid];
                await this._saveIndex();

                this._pendingDelete = null;
                this._msg('success', `"${meta.name || guid}" deleted`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', `Delete failed: ${err.message}`);
            }
        }

        // =====================================================================
        // Helpers
        // =====================================================================

        _msg(type, text) {
            if (window.sgraphAdmin && window.sgraphAdmin.messages) {
                if (type === 'success') window.sgraphAdmin.messages.success(text);
                else if (type === 'error') window.sgraphAdmin.messages.error(text);
                else window.sgraphAdmin.messages.info(text);
            }
        }

        _showError(text) {
            const c = this.querySelector('.vm-container');
            if (c) c.innerHTML = `<div class="pk-section"><p style="color:var(--admin-error)">${escapeHtml(text)}</p></div>`;
        }
    }

    customElements.define('vault-manager', VaultManager);

})();
