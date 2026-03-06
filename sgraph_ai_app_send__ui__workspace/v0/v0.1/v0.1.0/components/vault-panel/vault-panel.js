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
            window.sgraphWorkspace.events.emit('activity-start', { label: 'Opening vault...' });

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
            window.sgraphWorkspace.events.emit('activity-end');
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
            window.sgraphWorkspace.events.emit('activity-start', { label: 'Creating vault...' });

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
            window.sgraphWorkspace.events.emit('activity-end');
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

        // --- Inline action mode (replaces context menu) --------------------------

        _startInlineInput(mode, defaultValue) {
            // mode: 'new-folder' | 'new-file' | 'rename'
            this._inlineMode  = mode;
            this._inlineValue = defaultValue || '';
            this._render();
            const input = this.querySelector('.vp-inline-input');
            if (input) { input.focus(); input.select(); }
        }

        _cancelInlineInput() {
            this._inlineMode  = null;
            this._inlineValue = '';
            this._render();
        }

        async _confirmInlineInput() {
            const input = this.querySelector('.vp-inline-input');
            const value = input ? input.value.trim() : '';
            if (!value) { this._cancelInlineInput(); return; }

            const mode = this._inlineMode;
            const targetName = this._inlineTarget;
            this._inlineMode = null;
            this._inlineValue = '';

            if (mode === 'new-folder') await this._doCreateFolder(value);
            else if (mode === 'new-file') await this._doCreateFile(value);
            else if (mode === 'rename') await this._doRename(targetName, value);
        }

        async _doCreateFolder(name) {
            if (!this._vault || this._state !== 'open') return;
            try {
                // Build full path for subfolder
                const fullPath = this._currentPath === '/'
                    ? '/' + name
                    : this._currentPath + '/' + name;
                // Check if already exists
                const items = this._vault.listFolder(this._currentPath) || [];
                if (items.some(i => i.type === 'folder' && i.name === name)) {
                    window.sgraphWorkspace.messages.warning(`Folder "${name}" already exists`);
                    return;
                }
                this._vault.createFolder(fullPath);
                this._render();
                window.sgraphWorkspace.messages.success(`Folder "${name}" created`);
                window.sgraphWorkspace.events.emit('folder-created', { name, path: this._currentPath });
            } catch (e) {
                console.error('[vault-panel] Create folder failed:', e);
                window.sgraphWorkspace.messages.error('Create folder failed: ' + e.message);
            }
        }

        async _doCreateFile(filename) {
            if (!this._vault || this._state !== 'open') return;
            try {
                const content = new TextEncoder().encode('');
                await this._vault.addFile(this._currentPath, filename, content);
                this._render();
                window.sgraphWorkspace.messages.success(`"${filename}" created`);
                window.sgraphWorkspace.events.emit('file-created', { name: filename, path: this._currentPath });
            } catch (e) {
                console.error('[vault-panel] Create file failed:', e);
                window.sgraphWorkspace.messages.error('Create failed: ' + e.message);
            }
        }

        async _doRename(oldName, newName) {
            if (!this._vault || !oldName || newName === oldName) return;
            try {
                await this._vault.renameFile(this._currentPath, oldName, newName);
                this._render();
                window.sgraphWorkspace.messages.success(`Renamed to "${newName}"`);
            } catch (e) {
                console.error('[vault-panel] Rename failed:', e);
                window.sgraphWorkspace.messages.error('Rename failed: ' + e.message);
            }
        }

        async _duplicateFile(name) {
            if (!this._vault || !name) return;
            try {
                const content = await this._vault.getFile(this._currentPath, name);
                const dot = name.lastIndexOf('.');
                const base = dot > 0 ? name.slice(0, dot) : name;
                const ext  = dot > 0 ? name.slice(dot) : '';
                let copyName = `${base}-copy${ext}`;
                const items = this._vault.listFolder(this._currentPath) || [];
                const names = new Set(items.map(i => i.name));
                let n = 2;
                while (names.has(copyName)) { copyName = `${base}-copy-${n}${ext}`; n++; }
                await this._vault.addFile(this._currentPath, copyName, new Uint8Array(content));
                this._render();
                window.sgraphWorkspace.messages.success(`Duplicated as "${copyName}"`);
            } catch (e) {
                console.error('[vault-panel] Duplicate failed:', e);
                window.sgraphWorkspace.messages.error('Duplicate failed: ' + e.message);
            }
        }

        async _deleteItem(name, kind) {
            if (!this._vault || !name) return;
            if (!confirm(`Delete "${name}"?`)) return;
            try {
                if (kind === 'folder') {
                    await this._vault.deleteFolder(this._currentPath, name);
                } else {
                    await this._vault.deleteFile(this._currentPath, name);
                }
                this._selectedFile = null;
                this._render();
                window.sgraphWorkspace.messages.success(`"${name}" deleted`);
            } catch (e) {
                console.error('[vault-panel] Delete failed:', e);
                window.sgraphWorkspace.messages.error('Delete failed: ' + e.message);
            }
        }

        // --- Demo data -----------------------------------------------------------

        async _loadDemoData() {
            if (!this._vault || this._state !== 'open') return;
            window.sgraphWorkspace.events.emit('activity-start', { label: 'Loading demo data...' });
            const enc = (s) => new TextEncoder().encode(s);

            const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Demo Page</title>
<style>
  body { font-family: sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
  h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
  .article { margin: 1.5rem 0; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
  .article h2 { color: #2980b9; margin-top: 0; }
  .article .meta { color: #7f8c8d; font-size: 0.85rem; }
  .ad-banner { background: #fff3cd; padding: 0.75rem; text-align: center; border: 1px dashed #ffc107; margin: 1rem 0; }
  .tracking { display: none; }
  footer { color: #95a5a6; font-size: 0.8rem; margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; }
</style>
</head>
<body>
<div class="tracking" data-analytics="page-view"></div>
<div class="ad-banner">Advertisement: Buy Our Product!</div>
<h1>Tech News Daily</h1>
<div class="article" data-category="ai">
  <h2>New AI Framework Released</h2>
  <div class="meta">March 5, 2026 | AI & Machine Learning</div>
  <p>A groundbreaking new framework for building AI applications was released today, promising 10x faster training times and simplified deployment workflows.</p>
</div>
<div class="ad-banner">Special Offer: 50% Off Premium!</div>
<div class="article" data-category="security">
  <h2>Major Security Vulnerability Patched</h2>
  <div class="meta">March 4, 2026 | Security</div>
  <p>A critical vulnerability affecting millions of web servers was patched yesterday. Administrators are urged to update immediately.</p>
</div>
<div class="article" data-category="web">
  <h2>WebAssembly 3.0 Specification Approved</h2>
  <div class="meta">March 3, 2026 | Web Standards</div>
  <p>The W3C has approved the WebAssembly 3.0 specification, bringing garbage collection and improved threading support to the web platform.</p>
</div>
<div class="tracking" data-pixel="exit"></div>
<script>console.log('tracking-script');</script>
<footer>Tech News Daily &copy; 2026. All rights reserved.</footer>
</body>
</html>`;

            const demoScript1 = `// Remove ads and tracking elements
document.querySelectorAll('.ad-banner, .tracking, script').forEach(el => el.remove());`;

            const demoScript2 = `// Extract articles as JSON
var articles = [];
document.querySelectorAll('.article').forEach(function(el) {
    articles.push({
        title:    el.querySelector('h2')?.textContent || '',
        meta:     el.querySelector('.meta')?.textContent || '',
        body:     el.querySelector('p')?.textContent || '',
        category: el.dataset.category || 'unknown'
    });
});
return articles;`;

            const demoScript3 = `// Filter: only show AI articles, remove others
document.querySelectorAll('.article').forEach(function(el) {
    if (el.dataset.category !== 'ai') {
        el.remove();
    }
});
// Also clean up ads
document.querySelectorAll('.ad-banner, .tracking, script').forEach(el => el.remove());`;

            try {
                // Create demo folder
                const demoPath = this._currentPath === '/'
                    ? '/demo-transforms'
                    : this._currentPath + '/demo-transforms';
                const items = this._vault.listFolder(this._currentPath) || [];
                if (!items.some(i => i.type === 'folder' && i.name === 'demo-transforms')) {
                    this._vault.createFolder(demoPath);
                }

                await this._vault.addFile(demoPath, 'source.html', enc(demoHtml));
                await this._vault.addFile(demoPath, 'clean-ads.js', enc(demoScript1));
                await this._vault.addFile(demoPath, 'extract-articles.js', enc(demoScript2));
                await this._vault.addFile(demoPath, 'filter-ai-only.js', enc(demoScript3));

                this._render();
                window.sgraphWorkspace.messages.success('Demo data loaded into "demo-transforms" folder');
            } catch (e) {
                console.error('[vault-panel] Load demo data failed:', e);
                window.sgraphWorkspace.messages.error('Load demo data failed: ' + e.message);
            }
            window.sgraphWorkspace.events.emit('activity-end');
        }

        // --- Navigation --------------------------------------------------------

        _navigateToFolder(path, name) {
            this._currentPath = path;
            this._breadcrumb.push({ path, name });
            this._selectedFile = null;
            this._render();

            window.sgraphWorkspace.events.emit('folder-navigated', { path });

            // Auto-load source.html if present in the folder
            if (this._vault) {
                const items = this._vault.listFolder(path) || [];
                const sourceFile = items.find(i => i.type !== 'folder' && i.name === 'source.html');
                if (sourceFile) {
                    this._selectFile('source.html', sourceFile);
                }
            }
        }

        _navigateBreadcrumb(idx) {
            this._breadcrumb    = this._breadcrumb.slice(0, idx + 1);
            this._currentPath   = this._breadcrumb[idx].path;
            this._selectedFile  = null;
            this._render();

            window.sgraphWorkspace.events.emit('folder-navigated', { path: this._currentPath });
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

        getVault()       { return this._vault; }
        getSgSend()      { return this._sgSend; }
        getState()       { return this._state; }
        getCurrentPath() { return this._currentPath; }

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
                    const isSource   = !isFolder && item.name === 'source.html';
                    const isView     = !isFolder && /^view-/.test(item.name);
                    const extraClass = isSource ? ' vp-item--source' : isView ? ' vp-item--view' : '';
                    const badge      = isSource ? '<span class="vp-item-badge vp-item-badge--source">SRC</span>'
                                     : isView   ? '<span class="vp-item-badge vp-item-badge--view">VIEW</span>'
                                     : '';
                    return `<div class="vp-item ${isSelected ? 'vp-item--selected' : ''}${extraClass}"
                                data-name="${esc(item.name)}"
                                data-kind="${item.type}">
                        <span class="vp-item-icon">${isFolder ? ICON_FOLDER : ICON_FILE}</span>
                        <span class="vp-item-name">${esc(item.name)}</span>
                        ${badge}
                        ${!isFolder && item.size ? `<span class="vp-item-size">${formatSize(item.size)}</span>` : ''}
                    </div>`;
                }).join('');
            }

            // Stats
            const stats = this._vault.getStats();

            // Inline input row (for new folder / new file / rename)
            const inlineHtml = this._inlineMode ? `
                <div class="vp-inline-row">
                    <input type="text" class="vp-inline-input" value="${esc(this._inlineValue || '')}"
                           placeholder="${this._inlineMode === 'new-folder' ? 'Folder name' : this._inlineMode === 'new-file' ? 'File name' : 'New name'}">
                    <button class="vp-inline-ok" title="Confirm">OK</button>
                    <button class="vp-inline-cancel" title="Cancel">&times;</button>
                </div>` : '';

            return `<style>${VaultPanel.styles}</style>
                <div class="vp-browser">
                    <div class="vp-browser-header">
                        <div class="vp-breadcrumb">${bc}</div>
                        <button class="vp-header-btn" id="vp-refresh" title="Refresh vault">&#x21bb;</button>
                        <button class="vp-header-btn" id="vp-lock" title="Lock vault">&#128274;</button>
                    </div>
                    <div class="vp-items">${itemsHtml}</div>
                    ${inlineHtml}
                    <div class="vp-toolbar">
                        <button class="vp-tb-btn" data-action="new-file" title="New File">+ File</button>
                        <button class="vp-tb-btn" data-action="new-folder" title="New Folder">+ Folder</button>
                        <button class="vp-tb-btn" data-action="demo-data" title="Load demo transformation files">+ Demo</button>
                        ${this._selectedFile ? `
                            <span class="vp-tb-sep"></span>
                            <button class="vp-tb-btn" data-action="rename" title="Rename selected">Rename</button>
                            <button class="vp-tb-btn" data-action="duplicate" title="Duplicate selected">Dup</button>
                            <button class="vp-tb-btn vp-tb-btn--danger" data-action="delete" title="Delete selected">Del</button>
                        ` : ''}
                    </div>
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

            // Toolbar buttons
            this.querySelectorAll('.vp-tb-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    if (action === 'new-file')   this._startInlineInput('new-file', 'new-file.txt');
                    if (action === 'new-folder') this._startInlineInput('new-folder', 'new-folder');
                    if (action === 'demo-data')  this._loadDemoData();
                    if (action === 'rename' && this._selectedFile) {
                        this._inlineTarget = this._selectedFile;
                        this._startInlineInput('rename', this._selectedFile);
                    }
                    if (action === 'duplicate' && this._selectedFile) this._duplicateFile(this._selectedFile);
                    if (action === 'delete' && this._selectedFile) {
                        const items = this._vault.listFolder(this._currentPath) || [];
                        const entry = items.find(i => i.name === this._selectedFile);
                        this._deleteItem(this._selectedFile, entry?.type || 'file');
                    }
                });
            });

            // Inline input confirm/cancel
            const inlineOk = this.querySelector('.vp-inline-ok');
            const inlineCancel = this.querySelector('.vp-inline-cancel');
            const inlineInput = this.querySelector('.vp-inline-input');
            if (inlineOk) inlineOk.addEventListener('click', () => this._confirmInlineInput());
            if (inlineCancel) inlineCancel.addEventListener('click', () => this._cancelInlineInput());
            if (inlineInput) {
                inlineInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this._confirmInlineInput();
                    if (e.key === 'Escape') this._cancelInlineInput();
                });
            }
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

                .vp-browser { display: flex; flex-direction: column; height: 100%; position: relative; }
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
                .vp-item-badge {
                    font-size: 0.5625rem; font-weight: 700; letter-spacing: 0.04em;
                    padding: 0.0625rem 0.25rem; border-radius: 3px;
                    flex-shrink: 0;
                }
                .vp-item-badge--source {
                    background: rgba(78,205,196,0.15); color: var(--ws-primary, #4ECDC4);
                }
                .vp-item-badge--view {
                    background: rgba(139,92,246,0.15); color: #a78bfa;
                }
                .vp-item--source .vp-item-name { color: var(--ws-primary, #4ECDC4); font-weight: 600; }

                .vp-toolbar {
                    display: flex; align-items: center; gap: 0.25rem;
                    padding: 0.25rem 0.5rem; flex-shrink: 0;
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-wrap: wrap;
                }
                .vp-tb-btn {
                    padding: 0.1875rem 0.5rem; border-radius: var(--ws-radius, 6px);
                    font-size: 0.625rem; font-weight: 600;
                    cursor: pointer; font-family: inherit;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    transition: background 80ms;
                }
                .vp-tb-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text, #F0F0F5); }
                .vp-tb-btn--danger { color: var(--ws-error, #E94560); }
                .vp-tb-btn--danger:hover { background: var(--ws-error-bg, rgba(233,69,96,0.08)); }
                .vp-tb-sep { width: 1px; height: 14px; background: var(--ws-border-subtle, #222d4d); }
                .vp-inline-row {
                    display: flex; align-items: center; gap: 0.25rem;
                    padding: 0.375rem 0.5rem;
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                    background: var(--ws-surface-raised, #1c2a4a);
                }
                .vp-inline-input {
                    flex: 1; padding: 0.25rem 0.5rem;
                    font-size: 0.75rem; font-family: var(--ws-font-mono, monospace);
                    background: var(--ws-bg, #1A1A2E); color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; box-sizing: border-box;
                }
                .vp-inline-ok {
                    padding: 0.1875rem 0.5rem; font-size: 0.625rem; font-weight: 600;
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    border-radius: var(--ws-radius, 6px); cursor: pointer; font-family: inherit;
                }
                .vp-inline-ok:hover { background: rgba(78,205,196,0.2); }
                .vp-inline-cancel {
                    padding: 0.1875rem 0.375rem; font-size: 0.75rem;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px); cursor: pointer; font-family: inherit;
                }
                .vp-inline-cancel:hover { color: var(--ws-text, #F0F0F5); }
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
