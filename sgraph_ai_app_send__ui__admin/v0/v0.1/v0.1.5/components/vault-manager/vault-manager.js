/* =============================================================================
   SGraph Send Admin Console — Vault File Manager
   v0.1.5 — PKI-keyed personal data vault

   Zero-knowledge encrypted file system:
   - Vault root derived from PKI key hash
   - Folders are plain JSON (structure only, no names on server)
   - Files are AES-256-GCM encrypted blobs
   - Index maps GUIDs to human-readable names (encrypted)
   - Server never sees plaintext
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
        .vm-table th     { text-align: left; font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--admin-border, #2e3347); }
        .vm-table td     { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); font-size: 0.8125rem; color: var(--admin-text, #e4e6ef); }
        .vm-table tr:hover td { background: var(--admin-surface-hover, #2a2e3d); }
        .vm-table tr.vm-row-folder { cursor: pointer; }

        .vm-icon         { display: inline-flex; align-items: center; gap: 0.375rem; }
        .vm-icon svg     { width: 16px; height: 16px; flex-shrink: 0; }
        .vm-icon-folder  { color: var(--admin-warning, #fbbf24); }
        .vm-icon-file    { color: var(--admin-primary, #4f8ff7); }
        .vm-icon-lock    { color: var(--admin-success, #34d399); }

        .vm-name         { font-weight: 500; }
        .vm-meta         { font-size: 0.6875rem; color: var(--admin-text-secondary, #8b8fa7); }

        .vm-status-bar   { display: flex; align-items: center; gap: 0.75rem; font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); padding: 0.25rem 0; border-top: 1px solid var(--admin-border-subtle, #252838); }
        .vm-status-bar .vm-status-key { font-family: var(--admin-font-mono, monospace); }

        .vm-no-key       { text-align: center; padding: 3rem 1rem; }
        .vm-no-key__icon { margin-bottom: 0.75rem; color: var(--admin-text-muted, #5e6280); }
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
                <div class="vm-status-bar">
                    <span class="vm-icon vm-icon-lock">${SVG_LOCK}</span>
                    <span>Key: <span class="vm-status-key">${escapeHtml(this._selectedKey.fingerprint || '')}</span></span>
                    <span>Vault: <span class="vm-status-key">${escapeHtml(this._vaultCacheKey.substring(0, 12))}...</span></span>
                </div>
            `;

            // Event listeners
            container.querySelector('#vm-btn-refresh').addEventListener('click', () => this._browseFolder(this._currentFolder));
            container.querySelector('#vm-btn-new-folder').addEventListener('click', () => this._promptNewFolder());
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
            // Bind breadcrumb clicks
            bc.querySelectorAll('span[data-guid]').forEach(el => {
                el.addEventListener('click', () => this._navigateToFolder(el.dataset.guid));
            });
        }

        _renderFolderContents(folder) {
            const content = this.querySelector('#vm-content');
            if (!content) return;
            const children = folder.children || [];

            if (children.length === 0) {
                content.innerHTML = `
                    <div class="pk-empty">
                        <div class="pk-empty__icon">${SVG_FOLDER}</div>
                        <div class="pk-empty__text">This folder is empty</div>
                        <div class="pk-empty__hint">Upload files or create a subfolder to get started</div>
                    </div>`;
                return;
            }

            let rows = '';
            for (const childGuid of children) {
                const meta = this._index[childGuid] || {};
                const name = meta.name || childGuid;
                const type = meta.type || 'unknown';

                if (type === 'folder') {
                    rows += `<tr class="vm-row-folder" data-guid="${escapeHtml(childGuid)}">
                        <td><span class="vm-icon vm-icon-folder">${SVG_FOLDER}</span> <span class="vm-name">${escapeHtml(name)}</span></td>
                        <td class="vm-meta">Folder</td>
                        <td class="vm-meta">—</td>
                        <td></td>
                    </tr>`;
                } else {
                    const size = meta.size ? _formatSize(meta.size) : '—';
                    rows += `<tr data-guid="${escapeHtml(childGuid)}">
                        <td><span class="vm-icon vm-icon-file">${SVG_FILE}</span> <span class="vm-name">${escapeHtml(name)}</span></td>
                        <td class="vm-meta">File</td>
                        <td class="vm-meta">${escapeHtml(size)}</td>
                        <td>
                            <button class="pk-btn pk-btn--xs pk-btn--ghost vm-btn-download" data-guid="${escapeHtml(childGuid)}" title="Download">${SVG_DOWNLOAD}</button>
                            <button class="pk-btn pk-btn--xs pk-btn--danger vm-btn-delete" data-guid="${escapeHtml(childGuid)}" title="Delete">${SVG_DELETE}</button>
                        </td>
                    </tr>`;
                }
            }

            content.innerHTML = `
                <table class="vm-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Size</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;

            // Bind folder double-click
            content.querySelectorAll('.vm-row-folder').forEach(tr => {
                tr.addEventListener('dblclick', () => this._navigateToFolder(tr.dataset.guid));
            });
            // Bind download/delete
            content.querySelectorAll('.vm-btn-download').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this._downloadFile(btn.dataset.guid); });
            });
            content.querySelectorAll('.vm-btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteFile(btn.dataset.guid); });
            });
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
                // Use the first key pair
                this._selectedKey = {
                    publicKey   : keys[0].publicKey,
                    privateKey  : keys[0].privateKey,
                    fingerprint : keys[0].fingerprint || 'unknown',
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

                // Check if vault exists
                const existsResult = await adminAPI.vaultExists(this._vaultCacheKey);

                if (existsResult.exists) {
                    // Load manifest
                    this._vaultManifest = await adminAPI.vaultLookup(this._vaultCacheKey);
                    this._currentFolder = this._vaultManifest.root_folder;
                } else {
                    // Create vault
                    const result = await adminAPI.vaultCreate(this._vaultCacheKey, this._selectedKey.fingerprint);
                    this._vaultManifest = await adminAPI.vaultLookup(this._vaultCacheKey);
                    this._currentFolder = result.root_folder;
                    // Store empty index
                    const emptyIndex = JSON.stringify({ version: 1, entries: {} });
                    const encIndex   = await encryptBlob(this._selectedKey.publicKey, new TextEncoder().encode(emptyIndex));
                    await adminAPI.vaultStoreIndex(this._vaultCacheKey, arrayBufToB64(encIndex));
                }

                // Load index
                await this._loadIndex();

                // Set breadcrumb to root
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
                // Index may not exist yet or decryption failed — use empty
                this._index = {};
            }
        }

        async _saveIndex() {
            const indexJson = JSON.stringify({ version: 1, entries: this._index });
            const encrypted = await encryptBlob(this._selectedKey.publicKey, new TextEncoder().encode(indexJson));
            await adminAPI.vaultStoreIndex(this._vaultCacheKey, arrayBufToB64(encrypted));
        }

        // =====================================================================
        // Folder navigation
        // =====================================================================

        async _browseFolder(folderGuid) {
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
            // Check if this is a parent in the path (going back)
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

        _promptNewFolder() {
            const name = prompt('Folder name:');
            if (!name || !name.trim()) return;
            this._createFolder(name.trim());
        }

        async _createFolder(name) {
            try {
                const folderGuid = generateGuid();
                const folderData = { type: 'folder', id: folderGuid, children: [] };

                // Store folder on server
                await adminAPI.vaultStoreFolder(this._vaultCacheKey, folderGuid, folderData);

                // Update parent folder's children
                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(folderGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                // Update index
                this._index[folderGuid] = { name, type: 'folder', parentGuid: this._currentFolder };
                await this._saveIndex();

                this._msg('success', `Folder "${name}" created`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', 'Failed to create folder: ' + err.message);
            }
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

                // Update parent folder's children
                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(fileGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                // Update index
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

                // Trigger browser download
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

        async _deleteFile(fileGuid) {
            const meta = this._index[fileGuid] || {};
            if (!confirm(`Delete "${meta.name || fileGuid}"?`)) return;

            try {
                // Remove from parent folder's children
                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = (parent.data.children || []).filter(g => g !== fileGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                // Remove from index
                delete this._index[fileGuid];
                await this._saveIndex();

                this._msg('success', `"${meta.name || fileGuid}" deleted`);
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

    function _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    customElements.define('vault-manager', VaultManager);

})();
