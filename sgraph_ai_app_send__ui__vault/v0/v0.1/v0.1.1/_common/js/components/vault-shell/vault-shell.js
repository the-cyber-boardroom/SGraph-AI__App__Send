/* =============================================================================
   SGraph Vault — Shell Component
   v0.1.1 — Light DOM, EventBus, 3-column layout

   Pattern adapted from Admin Console v0.1.3 admin-shell.js.
   Three-column layout:
     Left (tree)  |  Main content (preview/browser)  |  Right sidebar (debug)

   Manages vault lifecycle: entry → browser → lock.
   ============================================================================= */

(function() {
    'use strict';

    class VaultShell extends HTMLElement {

        constructor() {
            super();
            this._vault         = null;
            this._vaultKey      = '';
            this._debugOpen     = false;
            this._activeDebugTab = 'messages';
            this._debugWidth    = 320;
            this._selectedFile  = null;
            this._currentPath   = '/';
            this._loadPreferences();
        }

        connectedCallback() {
            this.render();
            this._setupListeners();
            this._setupResize();
            this._setupMessageBadge();
            this._applyDebugWidth();
            this._updateDebugSidebar();

            window.sgraphVault.shell = this;
            window.sgraphVault.events.emit('shell-ready', {});
        }

        disconnectedCallback() {
            if (this._resizeCleanup) this._resizeCleanup();
            if (this._badgeUnsub) this._badgeUnsub();
        }

        // --- Preferences --------------------------------------------------------

        _loadPreferences() {
            try {
                const raw = localStorage.getItem('sgraph-vault-prefs');
                if (raw) {
                    const prefs = JSON.parse(raw);
                    if (prefs.debugWidth) this._debugWidth = prefs.debugWidth;
                    if (prefs.debugOpen !== undefined) this._debugOpen = prefs.debugOpen;
                }
            } catch (_) { /* ignore */ }
        }

        _savePreferences() {
            try {
                localStorage.setItem('sgraph-vault-prefs', JSON.stringify({
                    debugWidth: this._debugWidth,
                    debugOpen:  this._debugOpen
                }));
            } catch (_) { /* ignore */ }
        }

        // --- Public API ---------------------------------------------------------

        openSidebar(tabId) {
            this._debugOpen = true;
            this._updateDebugSidebar();
            if (tabId) this._switchDebugTab(tabId);
        }

        // --- Vault Lifecycle ----------------------------------------------------

        _onVaultOpened(vault, vaultKey) {
            this._vault    = vault;
            this._vaultKey = vaultKey;
            this._currentPath = '/';
            this._selectedFile = null;

            // Switch views
            this.querySelector('.vs-view-entry').style.display = 'none';
            this.querySelector('.vs-shell').style.display      = 'grid';

            // Update header
            this.querySelector('.vs-header-vault-name').textContent = vault.name || '';
            this.querySelector('.vs-lock-btn').style.display = '';

            // Wire tree
            const tree = this.querySelector('vault-tree-view');
            if (tree) {
                tree.vault = vault;
                tree.refresh();
            }

            // Wire upload + share
            const uploader = this.querySelector('vault-upload');
            if (uploader) uploader.vault = vault;
            const share = this.querySelector('vault-share');
            if (share) share.vaultKey = vaultKey;

            // Update status bar
            this._updateStatusBar();

            window.sgraphVault.events.emit('vault-opened', { vaultName: vault.name });
            window.sgraphVault.messages.success(`Vault "${vault.name}" opened`);
        }

        _onLock() {
            this._vault    = null;
            this._vaultKey = '';
            this._selectedFile = null;
            this._currentPath = '/';

            this.querySelector('.vs-shell').style.display       = 'none';
            this.querySelector('.vs-view-entry').style.display  = '';
            this.querySelector('.vs-header-vault-name').textContent = '';
            this.querySelector('.vs-lock-btn').style.display = 'none';

            // Hide upload panel
            const uploadPanel = this.querySelector('.vs-upload-panel');
            if (uploadPanel) uploadPanel.style.display = 'none';

            window.history.replaceState(null, '', window.location.pathname);
            window.sgraphVault.events.emit('vault-locked', {});
        }

        // --- File Selection -----------------------------------------------------

        _onFileSelected(folderPath, fileName, fileEntry) {
            this._selectedFile = { folderPath, fileName, ...fileEntry };
            this._currentPath  = folderPath;

            // Update properties banner
            const props = this.querySelector('vault-file-properties');
            if (props) props.setFile(fileName, fileEntry);

            // Update preview
            const preview = this.querySelector('vault-file-preview');
            if (preview) preview.loadFile(this._vault, folderPath, fileName, fileEntry);

            window.sgraphVault.events.emit('file-selected', { folderPath, fileName });
        }

        _onFolderSelected(path) {
            this._currentPath  = path;
            this._selectedFile = null;

            const props = this.querySelector('vault-file-properties');
            if (props) props.clearFile();

            const preview = this.querySelector('vault-file-preview');
            if (preview) preview.clearPreview();

            window.sgraphVault.events.emit('folder-selected', { path });
        }

        // --- Upload Flow --------------------------------------------------------

        _onUploadRequest() {
            const uploadPanel = this.querySelector('.vs-upload-panel');
            if (uploadPanel) uploadPanel.style.display = '';
            const uploader = this.querySelector('vault-upload');
            if (uploader) uploader.targetPath = this._currentPath;
        }

        _onFileAdded() {
            const tree = this.querySelector('vault-tree-view');
            if (tree) tree.refresh();
            this._updateVaultKey();
            this._updateStatusBar();
        }

        // --- Download ---------------------------------------------------------------

        async _onDownload(fileName) {
            if (!this._vault || !fileName) return;
            try {
                const data = await this._vault.getFile(this._currentPath, fileName);
                const blob = new Blob([data]);
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                window.sgraphVault.messages.error(`Download failed: ${err.message}`);
            }
        }

        // --- Key Management -----------------------------------------------------

        _updateVaultKey() {
            if (!this._vault || !this._vaultKey) return;
            const parts = this._vaultKey.split(':');
            const settingsId = this._vault._settingsTransferId;
            const vaultId    = this._vault._vaultId;
            parts.splice(-2, 2, vaultId, settingsId);
            this._vaultKey = parts.join(':');

            const share = this.querySelector('vault-share');
            if (share) share.updateKey(this._vaultKey);
        }

        // --- Status Bar ---------------------------------------------------------

        _updateStatusBar() {
            if (!this._vault) return;
            const stats    = this._vault.getStats();
            const statusEl = this.querySelector('.vs-status-stats');
            if (statusEl) {
                statusEl.textContent = VaultI18n.t('vault.stats.summary', {
                    folders: stats.folders,
                    files:   stats.files,
                    size:    VaultHelpers.formatBytes(stats.totalSize)
                });
            }
        }

        // --- Listeners ----------------------------------------------------------

        _setupListeners() {
            // Entry component events (bubbled from Shadow DOM)
            this.addEventListener('vault-opened', (e) => {
                this._onVaultOpened(e.detail.vault, e.detail.vaultKey);
            });
            this.addEventListener('vault-created', (e) => {
                this._onVaultOpened(e.detail.vault, e.detail.vaultKey);
            });

            // Tree events
            this.addEventListener('tree-file-selected', (e) => {
                this._onFileSelected(e.detail.folderPath, e.detail.fileName, e.detail.fileEntry);
            });
            this.addEventListener('tree-folder-selected', (e) => {
                this._onFolderSelected(e.detail.path);
            });

            // Upload events
            this.addEventListener('vault-file-added', () => this._onFileAdded());
            this.addEventListener('vault-upload-request', () => this._onUploadRequest());
            this.addEventListener('vault-upload-file', (e) => {
                // Show upload panel and forward file to uploader
                const uploadPanel = this.querySelector('.vs-upload-panel');
                if (uploadPanel) uploadPanel.style.display = '';
                const uploader = this.querySelector('vault-upload');
                if (uploader) {
                    const path = e.detail.path || this._currentPath;
                    uploader.uploadFile(e.detail.file, path);
                }
            });
            this.addEventListener('vault-key-changed', () => this._updateVaultKey());
            this.addEventListener('vault-error', (e) => {
                window.sgraphVault.messages.error(e.detail.message);
            });
            this.addEventListener('file-download-request', (e) => {
                this._onDownload(e.detail.fileName);
            });

            // Click delegation
            this.addEventListener('click', (e) => {
                if (e.target.closest('.vs-lock-btn')) {
                    this._onLock();
                    return;
                }
                if (e.target.closest('.vs-upload-btn')) {
                    this._onUploadRequest();
                    return;
                }
                if (e.target.closest('.vs-debug-toggle')) {
                    this._debugOpen = !this._debugOpen;
                    this._updateDebugSidebar();
                    return;
                }
                const tab = e.target.closest('.vs-debug-tab');
                if (tab) {
                    this._switchDebugTab(tab.dataset.tab);
                    return;
                }
            });

            // Drop zone over main area
            const main = this.querySelector('.vs-main');
            if (main) {
                main.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const dropzone = this.querySelector('vault-upload-dropzone');
                    if (dropzone && this._vault) dropzone.show();
                });
            }
        }

        _switchDebugTab(tabId) {
            this._activeDebugTab = tabId;
            this.querySelectorAll('.vs-debug-tab').forEach(t => {
                t.classList.toggle('vs-debug-tab--active', t.dataset.tab === tabId);
            });
            this.querySelectorAll('.vs-debug-panel').forEach(p => {
                p.style.display = p.dataset.panel === tabId ? '' : 'none';
            });
        }

        _updateDebugSidebar() {
            const debugSidebar = this.querySelector('.vs-debug-sidebar');
            const resizeHandle = this.querySelector('.vs-debug-resize');
            const shell        = this.querySelector('.vs-shell');
            if (debugSidebar) debugSidebar.classList.toggle('vs-debug-sidebar--hidden', !this._debugOpen);
            if (resizeHandle) resizeHandle.style.display = this._debugOpen ? '' : 'none';
            if (shell) shell.classList.toggle('vs-shell--no-debug', !this._debugOpen);
            this._savePreferences();
        }

        _applyDebugWidth() {
            const shell = this.querySelector('.vs-shell');
            if (shell) shell.style.setProperty('--debug-width', this._debugWidth + 'px');
        }

        _setupResize() {
            const handle = this.querySelector('.vs-debug-resize');
            if (!handle) return;

            let isResizing = false;
            let startX, startWidth;

            const onMouseDown = (e) => {
                if (!this._debugOpen) return;
                isResizing = true;
                startX = e.clientX;
                const sidebar = this.querySelector('.vs-debug-sidebar');
                startWidth = sidebar ? sidebar.offsetWidth : this._debugWidth;
                handle.classList.add('vs-debug-resize--active');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff = startX - e.clientX;
                const newWidth = Math.min(Math.max(startWidth + diff, 280), 800);
                this._debugWidth = newWidth;
                this._applyDebugWidth();
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                handle.classList.remove('vs-debug-resize--active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                this._savePreferences();
            };

            handle.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            this._resizeCleanup = () => {
                handle.removeEventListener('mousedown', onMouseDown);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
        }

        _setupMessageBadge() {
            const badge = this.querySelector('.vs-msg-badge');
            if (!badge) return;

            const update = () => {
                const svc = window.sgraphVault.messages;
                if (!svc) return;
                const msgs = svc.getMessages();
                const errorCount = msgs.filter(m => m.type === 'error').length;
                const total = msgs.length;
                badge.textContent = total || '';
                badge.style.display = total > 0 ? 'inline-flex' : 'none';
                badge.classList.toggle('vs-msg-badge--error', errorCount > 0);
            };

            badge.addEventListener('click', () => this.openSidebar('messages'));

            const onMsg = () => update();
            window.sgraphVault.events.on('message-added', onMsg);
            window.sgraphVault.events.on('messages-cleared', onMsg);
            this._badgeUnsub = () => {
                window.sgraphVault.events.off('message-added', onMsg);
                window.sgraphVault.events.off('messages-cleared', onMsg);
            };
            update();
        }

        // --- Render -------------------------------------------------------------

        render() {
            this.innerHTML = `
                <style>${VaultShell.styles}</style>

                <!-- Entry View (shown before vault is opened) -->
                <div class="vs-view-entry">
                    <vault-entry id="entry"></vault-entry>
                </div>

                <!-- Shell (shown after vault is opened) -->
                <div class="vs-shell" style="display:none">
                    <header class="vs-header">
                        <div class="vs-header-title">
                            <span class="vs-header-brand">SG<span class="vs-header-slash">/</span>Vault</span>
                            <span class="vs-header-vault-name"></span>
                        </div>
                        <div class="vs-header-right">
                            <button class="vs-upload-btn">Upload</button>
                            <button class="vs-debug-toggle">Debug</button>
                            <button class="vs-lock-btn" style="display:none">Lock</button>
                            <span class="vs-header-version">v0.1.1</span>
                        </div>
                    </header>

                    <nav class="vs-sidebar">
                        <vault-tree-view></vault-tree-view>
                    </nav>

                    <main class="vs-main">
                        <vault-file-properties></vault-file-properties>
                        <vault-file-preview></vault-file-preview>
                        <vault-upload-dropzone></vault-upload-dropzone>

                        <!-- Upload panel (shown on demand) -->
                        <div class="vs-upload-panel" style="display:none">
                            <vault-upload></vault-upload>
                        </div>

                        <!-- Share panel -->
                        <div class="vs-share-panel">
                            <vault-share></vault-share>
                        </div>
                    </main>

                    <div class="vs-debug-resize"></div>

                    <aside class="vs-debug-sidebar">
                        <div class="vs-debug-tabs">
                            <button class="vs-debug-tab vs-debug-tab--active" data-tab="messages">Msgs</button>
                            <button class="vs-debug-tab" data-tab="events">Events</button>
                            <button class="vs-debug-tab" data-tab="api">API</button>
                        </div>
                        <div class="vs-debug-content">
                            <div class="vs-debug-panel" data-panel="messages">
                                <vault-messages-panel></vault-messages-panel>
                            </div>
                            <div class="vs-debug-panel" data-panel="events" style="display:none">
                                <vault-events-viewer></vault-events-viewer>
                            </div>
                            <div class="vs-debug-panel" data-panel="api" style="display:none">
                                <vault-api-logger></vault-api-logger>
                            </div>
                        </div>
                    </aside>

                    <footer class="vs-statusbar">
                        <span class="vs-status-stats"></span>
                        <span class="vs-status-spacer"></span>
                        <button class="vs-msg-badge" title="Messages" style="display:none">0</button>
                    </footer>
                </div>
            `;
        }

        // --- Styles -------------------------------------------------------------

        static get styles() {
            return `
                /* --- Entry View --- */
                .vs-view-entry {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: var(--space-4);
                }

                /* --- Shell Grid --- */
                .vs-shell {
                    --debug-width: 320px;
                    --sidebar-width: 260px;
                    display: grid;
                    grid-template-areas:
                        "header  header  header  header"
                        "sidebar main   resize  debug"
                        "status  status  status  status";
                    grid-template-columns: var(--sidebar-width) 1fr 4px var(--debug-width);
                    grid-template-rows: 48px 1fr auto;
                    height: 100vh;
                    overflow: hidden;
                }

                .vs-shell--no-debug {
                    grid-template-columns: var(--sidebar-width) 1fr 0 0;
                }

                .vs-shell--no-debug .vs-debug-sidebar,
                .vs-shell--no-debug .vs-debug-resize {
                    display: none;
                }

                /* --- Header --- */
                .vs-header {
                    grid-area: header;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 var(--space-4);
                    background: var(--bg-surface);
                    border-bottom: 1px solid var(--color-border);
                    z-index: 20;
                }

                .vs-header-title {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3);
                }

                .vs-header-brand {
                    font-weight: 700;
                    font-size: var(--text-h3);
                    color: var(--color-text);
                }

                .vs-header-slash { color: var(--color-primary); }

                .vs-header-vault-name {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                    font-family: var(--font-mono);
                }

                .vs-header-right {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2);
                }

                .vs-header-version {
                    font-size: var(--text-small);
                    color: var(--color-text-secondary);
                    font-family: var(--font-mono);
                }

                .vs-upload-btn, .vs-lock-btn, .vs-debug-toggle {
                    font-size: var(--text-small);
                    padding: 0.25rem 0.625rem;
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--color-border);
                    background: transparent;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    font-family: var(--font-family);
                }

                .vs-upload-btn:hover, .vs-lock-btn:hover, .vs-debug-toggle:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-upload-btn {
                    background: var(--color-primary);
                    color: var(--bg-primary);
                    border-color: var(--color-primary);
                    font-weight: 600;
                }

                .vs-upload-btn:hover {
                    background: var(--color-primary-hover);
                    color: var(--bg-primary);
                }

                /* --- Left Sidebar (Tree) --- */
                .vs-sidebar {
                    grid-area: sidebar;
                    background: var(--bg-surface);
                    border-right: 1px solid var(--color-border);
                    overflow-y: auto;
                }

                /* --- Main Content --- */
                .vs-main {
                    grid-area: main;
                    overflow-y: auto;
                    padding: var(--space-4);
                    background: var(--bg-primary);
                    position: relative;
                }

                .vs-upload-panel {
                    margin-top: var(--space-4);
                }

                .vs-share-panel {
                    margin-top: var(--space-4);
                }

                /* --- Debug Resize Handle --- */
                .vs-debug-resize {
                    grid-area: resize;
                    width: 4px;
                    cursor: col-resize;
                    background: transparent;
                    transition: background 0.15s;
                    z-index: 10;
                }

                .vs-debug-resize:hover,
                .vs-debug-resize--active {
                    background: var(--color-primary);
                }

                /* --- Debug Sidebar --- */
                .vs-debug-sidebar {
                    grid-area: debug;
                    background: var(--bg-surface);
                    border-left: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .vs-debug-sidebar--hidden { display: none; }

                .vs-debug-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--color-border);
                    flex-shrink: 0;
                }

                .vs-debug-tab {
                    flex: 1;
                    padding: 0.5rem;
                    font-size: var(--text-small);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    background: transparent;
                    border: none;
                    border-bottom: 2px solid transparent;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    transition: background var(--transition), color var(--transition);
                }

                .vs-debug-tab:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-debug-tab--active {
                    color: var(--color-primary);
                    border-bottom-color: var(--color-primary);
                }

                .vs-debug-content { flex: 1; overflow-y: auto; }
                .vs-debug-panel { height: 100%; }

                /* --- Status Bar --- */
                .vs-statusbar {
                    grid-area: status;
                    display: flex;
                    align-items: center;
                    gap: var(--space-4);
                    padding: 0.25rem var(--space-4);
                    font-size: var(--text-small);
                    color: var(--color-text-secondary);
                    background: var(--bg-surface);
                    border-top: 1px solid var(--color-border);
                    font-family: var(--font-mono);
                }

                .vs-status-spacer { flex: 1; }

                .vs-msg-badge {
                    display: none;
                    align-items: center;
                    justify-content: center;
                    min-width: 1.25rem;
                    height: 1.25rem;
                    padding: 0 0.375rem;
                    border-radius: 9999px;
                    font-size: 0.6875rem;
                    font-weight: 600;
                    font-family: var(--font-mono);
                    background: var(--color-border);
                    color: var(--color-text-secondary);
                    border: none;
                    cursor: pointer;
                }

                .vs-msg-badge--error {
                    background: var(--color-error);
                    color: #fff;
                }

                /* --- Responsive --- */
                @media (max-width: 1024px) {
                    .vs-shell {
                        grid-template-columns: var(--sidebar-width) 1fr 0 0;
                    }
                    .vs-debug-sidebar, .vs-debug-resize { display: none; }
                }

                @media (max-width: 768px) {
                    .vs-shell {
                        grid-template-columns: 1fr;
                        grid-template-areas: "header" "main" "status";
                    }
                    .vs-sidebar { display: none; }
                    .vs-debug-sidebar, .vs-debug-resize { display: none; }
                }
            `;
        }
    }

    customElements.define('vault-shell', VaultShell);
})();
