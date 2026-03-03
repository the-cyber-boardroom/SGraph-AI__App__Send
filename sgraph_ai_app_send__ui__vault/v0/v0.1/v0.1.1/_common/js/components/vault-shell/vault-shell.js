/* =============================================================================
   SGraph Vault — Shell Component
   v0.1.3 — Light DOM, EventBus, 5-column layout with left navigation

   Pattern adapted from Admin Console v0.1.3 admin-shell.js.
   Five-column layout:
     Nav  |  Left (tree)  |  Main content (preview/browser)  |  resize  |  Right sidebar (debug)

   Nav panel provides top-level view switching: Files, Settings, (future views).

   Design guidelines:
     - Avoid modal windows unless truly necessary (e.g. destructive confirm).
       Prefer inline panels, top-level views, or expanding sections.
     - Show visual loading indicators for all API requests to give feedback
       during cold starts or slow network conditions.

   Manages vault lifecycle: entry → browser → lock.
   ============================================================================= */

(function() {
    'use strict';

    class VaultShell extends HTMLElement {

        constructor() {
            super();
            this._vault         = null;
            this._vaultKey      = '';
            this._accessKey     = '';
            this._debugOpen     = false;
            this._activeDebugTab = 'messages';
            this._debugWidth    = 320;
            this._selectedFile  = null;
            this._currentPath   = '/';
            this._pendingUploadAction = null;
            this._activeView    = 'files';       // 'files' | 'settings'
            this._loadingCount  = 0;             // track concurrent API requests
            this._appVersion    = '';            // fetched from /api/health
            this._loadPreferences();
        }

        connectedCallback() {
            this.render();
            this._setupListeners();
            this._setupResize();
            this._setupMessageBadge();
            this._applyDebugWidth();
            this._updateDebugSidebar();
            this._fetchAppVersion();

            // Hook loading bar into fetch interceptor (api-call events)
            this._setupLoadingHook();

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

        // --- App Version --------------------------------------------------------

        async _fetchAppVersion() {
            try {
                // Try the admin API health endpoint to get the app version
                const origin = window.location.origin;
                const resp = await fetch(`${origin}/api/health`, { method: 'GET' });
                if (resp.ok) {
                    const data = await resp.json();
                    this._appVersion = data.version || '';
                    this._updateVersionDisplay();
                }
            } catch (_) {
                // Silently fail — version display will just show vault UI version
            }
        }

        _updateVersionDisplay() {
            const el = this.querySelector('.vs-header-version');
            if (!el) return;
            const vaultVersion = 'v0.1.3';
            el.textContent = this._appVersion
                ? `${vaultVersion} / ${this._appVersion}`
                : vaultVersion;
        }

        // --- View Switching (nav) -----------------------------------------------

        _switchView(viewId) {
            this._activeView = viewId;

            // Toggle view containers
            const filesView    = this.querySelector('.vs-view-files');
            const settingsView = this.querySelector('.vs-view-settings');
            const sidebar      = this.querySelector('.vs-sidebar');

            if (filesView)    filesView.style.display    = viewId === 'files' ? '' : 'none';
            if (settingsView) settingsView.style.display = viewId === 'settings' ? '' : 'none';
            if (sidebar)      sidebar.style.display      = viewId === 'files' ? '' : 'none';

            // Update nav active state
            this.querySelectorAll('.vs-nav-item').forEach(item => {
                item.classList.toggle('vs-nav-item--active', item.dataset.view === viewId);
            });

            // Populate settings view when switching to it
            if (viewId === 'settings') this._populateSettings();
        }

        _populateSettings() {
            if (!this._vault) return;

            const nameInput = this.querySelector('.vs-settings-name-input');
            if (nameInput) nameInput.value = this._vault.name || '';

            const keyInput = this.querySelector('.vs-settings-key-input');
            if (keyInput) keyInput.value = this._vaultKey;

            const accessInput = this.querySelector('.vs-settings-access-input');
            if (accessInput) accessInput.value = this._accessKey || '';

            // Stats
            const stats = this._vault.getStats();
            const statsEl = this.querySelector('.vs-settings-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="vs-stats-grid">
                        <span class="vs-stats-label">Files</span><span class="vs-stats-value">${stats.files}</span>
                        <span class="vs-stats-label">Folders</span><span class="vs-stats-value">${stats.folders}</span>
                        <span class="vs-stats-label">Total size</span><span class="vs-stats-value">${VaultHelpers.formatBytes(stats.totalSize)}</span>
                        <span class="vs-stats-label">Created</span><span class="vs-stats-value">${this._vault.created ? VaultHelpers.formatTimestamp(this._vault.created) : '--'}</span>
                    </div>
                `;
            }
        }

        // --- Loading Indicator --------------------------------------------------

        _setupLoadingHook() {
            // Wrap the global fetch to show/hide loading bar automatically
            const shell = this;
            const originalFetch = window.fetch.__vaultOriginal || window.fetch;

            const wrappedFetch = async function() {
                shell._showLoading();
                try {
                    return await originalFetch.apply(window, arguments);
                } finally {
                    shell._hideLoading();
                }
            };
            wrappedFetch.__vaultOriginal = originalFetch;
            window.fetch = wrappedFetch;
        }

        _showLoading() {
            this._loadingCount++;
            const bar = this.querySelector('.vs-loading-bar');
            if (bar) bar.style.display = '';
        }

        _hideLoading() {
            this._loadingCount = Math.max(0, this._loadingCount - 1);
            if (this._loadingCount === 0) {
                const bar = this.querySelector('.vs-loading-bar');
                if (bar) bar.style.display = 'none';
            }
        }

        // --- Vault Lifecycle ----------------------------------------------------

        _onVaultOpened(vault, vaultKey, accessKey) {
            this._vault     = vault;
            this._vaultKey  = vaultKey;
            this._accessKey = accessKey || '';
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

            // Show read-only indicator if no access key
            const readOnlyBadge = this.querySelector('.vs-readonly-badge');
            if (readOnlyBadge) readOnlyBadge.style.display = this._accessKey ? 'none' : '';

            // Ensure we're on the files view
            this._switchView('files');

            window.sgraphVault.events.emit('vault-opened', { vaultName: vault.name });
            const mode = this._accessKey ? '' : ' (read-only)';
            window.sgraphVault.messages.success(`Vault "${vault.name}" opened${mode}`);
        }

        _onLock() {
            this._vault     = null;
            this._vaultKey  = '';
            this._accessKey = '';
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
            if (props) props.setFile(fileName, fileEntry, folderPath);

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

            // Keep dropzone path in sync
            const dropzone = this.querySelector('vault-upload-dropzone');
            if (dropzone) dropzone.targetPath = path;

            window.sgraphVault.events.emit('folder-selected', { path });
        }

        // --- Upload Flow --------------------------------------------------------

        _requireAccessKey(onSuccess) {
            if (this._accessKey) {
                onSuccess();
                return;
            }
            // Show auth token prompt modal
            this._pendingUploadAction = onSuccess;
            const modal = this.querySelector('.vs-auth-modal');
            if (modal) {
                modal.style.display = '';
                const input = modal.querySelector('.vs-auth-input');
                if (input) { input.value = ''; input.focus(); }
            }
        }

        _onAuthSubmit() {
            const modal = this.querySelector('.vs-auth-modal');
            const input = modal?.querySelector('.vs-auth-input');
            const key   = input?.value?.trim();
            if (!key) return;

            this._accessKey = key;
            sessionStorage.setItem('sg-vault-access-key', key);

            // Update the SGSend token on the vault
            if (this._vault?._sgSend) {
                this._vault._sgSend.token = key;
            }

            // Hide modal + read-only badge
            if (modal) modal.style.display = 'none';
            const badge = this.querySelector('.vs-readonly-badge');
            if (badge) badge.style.display = 'none';

            window.sgraphVault.messages.success('Access key set — uploads enabled');

            // Execute pending action
            if (this._pendingUploadAction) {
                this._pendingUploadAction();
                this._pendingUploadAction = null;
            }
        }

        _onAuthCancel() {
            const modal = this.querySelector('.vs-auth-modal');
            if (modal) modal.style.display = 'none';
            this._pendingUploadAction = null;
        }

        _onUploadRequest() {
            this._requireAccessKey(() => {
                const uploadPanel = this.querySelector('.vs-upload-panel');
                if (uploadPanel) uploadPanel.style.display = '';
                const uploader = this.querySelector('vault-upload');
                if (uploader) uploader.targetPath = this._currentPath;
            });
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
            this._showLoading();
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
            } finally {
                this._hideLoading();
            }
        }

        // --- Delete & Rename ----------------------------------------------------

        async _onDeleteFile(fileName, folderPath) {
            if (!this._vault || !fileName) return;
            this._showLoading();
            try {
                await this._vault.removeFile(folderPath || this._currentPath, fileName);
                window.sgraphVault.messages.success(`"${fileName}" deleted`);
                this._selectedFile = null;
                const props = this.querySelector('vault-file-properties');
                if (props) props.clearFile();
                const preview = this.querySelector('vault-file-preview');
                if (preview) preview.clearPreview();
                const tree = this.querySelector('vault-tree-view');
                if (tree) tree.refresh();
                this._updateVaultKey();
                this._updateStatusBar();
            } catch (err) {
                window.sgraphVault.messages.error(`Delete failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onRenameFile(oldName, newName, folderPath) {
            if (!this._vault || !oldName || !newName) return;
            const path = folderPath || this._currentPath;
            this._showLoading();
            try {
                await this._vault.renameFile(path, oldName, newName);
                window.sgraphVault.messages.success(`Renamed "${oldName}" to "${newName}"`);
                // Re-select the renamed file
                const folder = this._vault._findNode(path);
                if (folder && folder.children[newName]) {
                    const entry = folder.children[newName];
                    this._selectedFile = { folderPath: path, fileName: newName, ...entry };
                    const props = this.querySelector('vault-file-properties');
                    if (props) props.setFile(newName, entry, path);
                }
                const tree = this.querySelector('vault-tree-view');
                if (tree) tree.refresh();
                this._updateVaultKey();
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onRenameFolder(oldPath, newName) {
            if (!this._vault || !oldPath || !newName) return;
            this._showLoading();
            try {
                await this._vault.renameFolder(oldPath, newName);
                window.sgraphVault.messages.success(`Folder renamed to "${newName}"`);
                const tree = this.querySelector('vault-tree-view');
                if (tree) tree.refresh();
                this._updateVaultKey();
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                this._hideLoading();
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

        // --- Settings Panel (now inline view, not modal) -------------------------

        _toggleSettings() {
            // Toggle between settings and files view
            if (this._activeView === 'settings') {
                this._switchView('files');
            } else {
                this._switchView('settings');
            }
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
                this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey);
            });
            this.addEventListener('vault-created', (e) => {
                this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey);
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
                const file = e.detail.file;
                const path = e.detail.path || this._currentPath;
                this._requireAccessKey(() => {
                    const uploadPanel = this.querySelector('.vs-upload-panel');
                    if (uploadPanel) uploadPanel.style.display = '';
                    const uploader = this.querySelector('vault-upload');
                    if (uploader) uploader.uploadFile(file, path);
                });
            });
            this.addEventListener('vault-key-changed', () => this._updateVaultKey());
            this.addEventListener('vault-error', (e) => {
                window.sgraphVault.messages.error(e.detail.message);
            });
            this.addEventListener('file-download-request', (e) => {
                this._onDownload(e.detail.fileName);
            });
            this.addEventListener('file-delete-request', (e) => {
                this._onDeleteFile(e.detail.fileName, e.detail.folderPath);
            });
            this.addEventListener('file-rename-request', (e) => {
                this._onRenameFile(e.detail.oldName, e.detail.newName, e.detail.folderPath);
            });
            this.addEventListener('folder-rename-request', (e) => {
                this._onRenameFolder(e.detail.oldPath, e.detail.newName);
            });

            // Click delegation
            this.addEventListener('click', (e) => {
                // Nav item clicks
                const navItem = e.target.closest('.vs-nav-item[data-view]');
                if (navItem) {
                    e.preventDefault();
                    this._switchView(navItem.dataset.view);
                    return;
                }
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
                if (e.target.closest('.vs-auth-submit')) {
                    this._onAuthSubmit();
                    return;
                }
                if (e.target.closest('.vs-auth-cancel')) {
                    this._onAuthCancel();
                    return;
                }
                if (e.target.closest('.vs-auth-overlay')) {
                    if (e.target.classList.contains('vs-auth-overlay')) {
                        this._onAuthCancel();
                    }
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

            // Settings panel handlers (now inline view, not modal)
            this.addEventListener('click', (e) => {
                if (e.target.closest('.vs-settings-copy-key')) {
                    const keyInput = this.querySelector('.vs-settings-key-input');
                    if (keyInput) {
                        navigator.clipboard.writeText(keyInput.value).then(() => {
                            window.sgraphVault.messages.success('Vault key copied');
                        });
                    }
                    return;
                }
                if (e.target.closest('.vs-settings-save-access')) {
                    const accessInput = this.querySelector('.vs-settings-access-input');
                    const key = accessInput?.value?.trim();
                    if (key) {
                        this._accessKey = key;
                        sessionStorage.setItem('sg-vault-access-key', key);
                        if (this._vault?._sgSend) this._vault._sgSend.token = key;
                        const badge = this.querySelector('.vs-readonly-badge');
                        if (badge) badge.style.display = 'none';
                        window.sgraphVault.messages.success('Access key updated');
                    }
                    return;
                }
                if (e.target.closest('.vs-settings-json-toggle')) {
                    const jsonEl = this.querySelector('.vs-settings-json');
                    if (jsonEl) {
                        const hidden = jsonEl.style.display === 'none';
                        jsonEl.style.display = hidden ? '' : 'none';
                        e.target.closest('.vs-settings-json-toggle').textContent = hidden ? '(hide)' : '(show)';
                        if (hidden && this._vault) {
                            const settingsEl = this.querySelector('.vs-settings-json-settings');
                            const treeEl     = this.querySelector('.vs-settings-json-tree');
                            if (settingsEl) settingsEl.textContent = JSON.stringify(this._vault._settings, null, 2);
                            if (treeEl)     treeEl.textContent = JSON.stringify(this._vault._tree, null, 2);
                        }
                    }
                    return;
                }
            });

            // Auth modal enter key
            this.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.classList?.contains('vs-auth-input')) {
                    this._onAuthSubmit();
                }
            });
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
                            <span class="vs-readonly-badge" style="display:none">Read-only</span>
                            <button class="vs-upload-btn">Upload</button>
                            <button class="vs-debug-toggle">Debug</button>
                            <button class="vs-lock-btn" style="display:none">Lock</button>
                            <span class="vs-header-version">v0.1.3</span>
                        </div>
                        <!-- Loading bar (shown during API requests) -->
                        <div class="vs-loading-bar" style="display:none"><div class="vs-loading-bar-inner"></div></div>
                    </header>

                    <!-- Left navigation -->
                    <nav class="vs-nav">
                        <a class="vs-nav-item vs-nav-item--active" data-view="files" href="#">
                            <span class="vs-nav-icon">&#128194;</span>
                            <span class="vs-nav-label">Files</span>
                        </a>
                        <a class="vs-nav-item" data-view="settings" href="#">
                            <span class="vs-nav-icon">&#9881;</span>
                            <span class="vs-nav-label">Settings</span>
                        </a>
                    </nav>

                    <!-- Tree sidebar (visible in files view) -->
                    <div class="vs-sidebar">
                        <vault-tree-view></vault-tree-view>
                    </div>

                    <main class="vs-main">
                        <!-- Files view (default) -->
                        <div class="vs-view-files">
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
                        </div>

                        <!-- Settings view (shown when nav selects Settings) -->
                        <div class="vs-view-settings" style="display:none">
                            <div class="vs-settings-panel">
                                <h2 class="vs-settings-panel-title">Vault Settings</h2>

                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Vault Name</label>
                                    <input class="vs-settings-name-input" type="text" placeholder="Vault name">
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Vault Key</label>
                                    <div class="vs-settings-key-row">
                                        <input class="vs-settings-key-input" type="text" readonly>
                                        <button class="vs-settings-copy-key">Copy</button>
                                    </div>
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Access Key</label>
                                    <div class="vs-settings-key-row">
                                        <input class="vs-settings-access-input" type="password" placeholder="Enter access key for uploads">
                                        <button class="vs-settings-save-access">Set</button>
                                    </div>
                                    <p class="vs-settings-hint">Only needed for uploading files.</p>
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Statistics</label>
                                    <div class="vs-settings-stats"></div>
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Raw JSON <button class="vs-settings-json-toggle">(show)</button></label>
                                    <div class="vs-settings-json" style="display:none">
                                        <h4>vault-settings.json</h4>
                                        <pre class="vs-settings-json-settings"></pre>
                                        <h4>vault-tree.json</h4>
                                        <pre class="vs-settings-json-tree"></pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    <div class="vs-debug-resize"></div>

                    <aside class="vs-debug-sidebar">
                        <div class="vs-debug-tabs">
                            <button class="vs-debug-tab vs-debug-tab--active" data-tab="messages">Msgs</button>
                            <button class="vs-debug-tab" data-tab="events">Events</button>
                            <button class="vs-debug-tab" data-tab="api">API</button>
                            <button class="vs-debug-tab" data-tab="storage">Storage</button>
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
                            <div class="vs-debug-panel" data-panel="storage" style="display:none">
                                <vault-storage-viewer></vault-storage-viewer>
                            </div>
                        </div>
                    </aside>

                    <footer class="vs-statusbar">
                        <span class="vs-status-stats"></span>
                        <span class="vs-status-spacer"></span>
                        <button class="vs-msg-badge" title="Messages" style="display:none">0</button>
                    </footer>
                </div>

                <!-- Auth Token Prompt Modal (kept as modal — destructive action gate) -->
                <div class="vs-auth-overlay vs-auth-modal" style="display:none">
                    <div class="vs-auth-dialog">
                        <h3 class="vs-auth-title">Access Key Required</h3>
                        <p class="vs-auth-desc">An access key is needed to upload files. Enter it below.</p>
                        <input class="vs-auth-input" type="password" placeholder="Paste your access key" autocomplete="off">
                        <div class="vs-auth-actions">
                            <button class="vs-auth-cancel">Cancel</button>
                            <button class="vs-auth-submit">Continue</button>
                        </div>
                    </div>
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
                    --sidebar-width: 240px;
                    --nav-width: 56px;
                    display: grid;
                    grid-template-areas:
                        "header  header  header  header  header"
                        "nav     sidebar main   resize  debug"
                        "status  status  status  status  status";
                    grid-template-columns: var(--nav-width) var(--sidebar-width) 1fr 4px var(--debug-width);
                    grid-template-rows: 48px 1fr auto;
                    height: 100vh;
                    overflow: hidden;
                }

                .vs-shell--no-debug {
                    grid-template-columns: var(--nav-width) var(--sidebar-width) 1fr 0 0;
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
                    position: relative;
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

                /* --- Loading Bar --- */
                .vs-loading-bar {
                    position: absolute;
                    bottom: -2px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    overflow: hidden;
                    z-index: 30;
                }

                .vs-loading-bar-inner {
                    width: 30%;
                    height: 100%;
                    background: var(--color-primary);
                    animation: vs-loading-slide 1.2s ease-in-out infinite;
                }

                @keyframes vs-loading-slide {
                    0%   { transform: translateX(-100%); }
                    50%  { transform: translateX(230%); }
                    100% { transform: translateX(-100%); }
                }

                /* --- Left Navigation --- */
                .vs-nav {
                    grid-area: nav;
                    background: var(--bg-surface);
                    border-right: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                    padding: var(--space-2) 0;
                    gap: var(--space-1);
                    overflow: hidden;
                }

                .vs-nav-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.125rem;
                    padding: 0.5rem 0.25rem;
                    font-size: 0.625rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    color: var(--color-text-secondary);
                    text-decoration: none;
                    cursor: pointer;
                    border-left: 3px solid transparent;
                    transition: background var(--transition), color var(--transition);
                }

                .vs-nav-item:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-nav-item--active {
                    color: var(--color-primary);
                    background: rgba(79, 143, 247, 0.08);
                    border-left-color: var(--color-primary);
                }

                .vs-nav-icon {
                    font-size: 1.125rem;
                    line-height: 1;
                }

                .vs-nav-label {
                    line-height: 1;
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

                /* --- Read-only Badge --- */
                .vs-readonly-badge {
                    font-size: var(--text-small);
                    padding: 0.125rem 0.5rem;
                    border-radius: 9999px;
                    background: rgba(233, 196, 69, 0.15);
                    color: #E9C445;
                    font-weight: 600;
                    letter-spacing: 0.02em;
                }

                /* --- Auth Modal --- */
                .vs-auth-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 100;
                    backdrop-filter: blur(4px);
                }

                .vs-auth-dialog {
                    background: var(--bg-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius);
                    padding: var(--space-6);
                    max-width: 420px;
                    width: 90%;
                }

                .vs-auth-title {
                    font-size: var(--text-h3);
                    font-weight: 700;
                    color: var(--color-text);
                    margin: 0 0 var(--space-2);
                }

                .vs-auth-desc {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                    margin: 0 0 var(--space-4);
                }

                .vs-auth-input {
                    width: 100%;
                    padding: 0.625rem 0.75rem;
                    font-size: var(--text-body);
                    font-family: var(--font-mono);
                    background: var(--bg-primary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text);
                    outline: none;
                    box-sizing: border-box;
                }

                .vs-auth-input:focus {
                    border-color: var(--color-primary);
                }

                .vs-auth-actions {
                    display: flex;
                    gap: var(--space-2);
                    justify-content: flex-end;
                    margin-top: var(--space-4);
                }

                .vs-auth-cancel, .vs-auth-submit {
                    padding: 0.375rem 1rem;
                    border-radius: var(--radius-sm);
                    font-size: var(--text-sm);
                    cursor: pointer;
                    border: 1px solid var(--color-border);
                    font-family: var(--font-family);
                }

                .vs-auth-cancel {
                    background: transparent;
                    color: var(--color-text-secondary);
                }

                .vs-auth-submit {
                    background: var(--color-primary);
                    color: var(--bg-primary);
                    border-color: var(--color-primary);
                    font-weight: 600;
                }

                /* --- Settings Panel (inline view) --- */
                .vs-settings-panel {
                    max-width: 640px;
                }

                .vs-settings-panel-title {
                    font-size: var(--text-h3);
                    font-weight: 700;
                    color: var(--color-text);
                    margin: 0 0 var(--space-5);
                }

                .vs-settings-section {
                    margin-bottom: var(--space-5);
                }

                .vs-settings-section:last-child { margin-bottom: 0; }

                .vs-settings-label {
                    display: block;
                    font-size: var(--text-sm);
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-2);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .vs-settings-name-input,
                .vs-settings-key-input,
                .vs-settings-access-input {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    font-size: var(--text-sm);
                    font-family: var(--font-mono);
                    background: var(--bg-primary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text);
                    outline: none;
                    box-sizing: border-box;
                }

                .vs-settings-key-row {
                    display: flex;
                    gap: var(--space-2);
                }

                .vs-settings-key-row input { flex: 1; }

                .vs-settings-copy-key, .vs-settings-save-access {
                    padding: 0.5rem 0.75rem;
                    font-size: var(--text-small);
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--color-border);
                    background: transparent;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    white-space: nowrap;
                    font-family: var(--font-family);
                }

                .vs-settings-copy-key:hover, .vs-settings-save-access:hover {
                    background: var(--bg-secondary);
                    color: var(--color-primary);
                    border-color: var(--color-primary);
                }

                .vs-settings-hint {
                    font-size: var(--text-xs, 0.75rem);
                    color: var(--color-text-secondary);
                    margin-top: var(--space-1);
                }

                .vs-stats-grid {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: var(--space-1) var(--space-4);
                    font-size: var(--text-sm);
                }

                .vs-stats-label {
                    color: var(--color-text-secondary);
                }

                .vs-stats-value {
                    color: var(--color-text);
                    font-family: var(--font-mono);
                }

                .vs-settings-json-toggle {
                    background: none;
                    border: none;
                    color: var(--color-primary);
                    cursor: pointer;
                    font-size: var(--text-small);
                    padding: 0;
                }

                .vs-settings-json h4 {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                    margin: var(--space-3) 0 var(--space-1);
                }

                .vs-settings-json pre {
                    background: var(--bg-primary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    padding: var(--space-3);
                    font-size: var(--text-small);
                    font-family: var(--font-mono);
                    color: var(--color-text);
                    overflow-x: auto;
                    max-height: 300px;
                    overflow-y: auto;
                    margin: 0;
                    white-space: pre-wrap;
                    word-break: break-all;
                }

                /* --- Responsive --- */
                @media (max-width: 1024px) {
                    .vs-shell {
                        grid-template-columns: var(--nav-width) var(--sidebar-width) 1fr 0 0;
                    }
                    .vs-debug-sidebar, .vs-debug-resize { display: none; }
                }

                @media (max-width: 768px) {
                    .vs-shell {
                        grid-template-columns: var(--nav-width) 1fr;
                        grid-template-areas:
                            "header header"
                            "nav    main"
                            "status status";
                    }
                    .vs-sidebar { display: none; }
                    .vs-debug-sidebar, .vs-debug-resize { display: none; }
                }
            `;
        }
    }

    customElements.define('vault-shell', VaultShell);
})();
