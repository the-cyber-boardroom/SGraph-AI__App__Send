/* =================================================================================
   SGraph Vault — Shell Component (slim orchestrator)
   v0.2.0 — Delegates file browsing to shared send-browse--v0.3.2.js

   Composes:
     vault-header      — top bar (brand, vault name, buttons)
     vault-auth        — access key banner
     vault-nav         — left sidebar nav (Files, SGit, Settings)
     send-browse       — shared file browser (from SG/Send v0.3.2)
     vault-sgit-view   — SGit commit/ref/tree/object inspector
     vault-settings    — vault settings panel
     vault-status-bar  — footer with stats + message badge

   Manages vault lifecycle: entry → opened → lock.
   Uses sg-layout only where it adds value (debug panel toggle).
   ================================================================================= */

(function() {
    'use strict';

    class VaultShell extends HTMLElement {

        constructor() {
            super();
            this._vault         = null;
            this._vaultKey      = '';
            this._accessKey     = '';
            this._activeView    = 'files';
            this._loadingCount  = 0;
            this._pendingAction = null;
        }

        connectedCallback() {
            this._render();
            this._setupListeners();
            this._setupLoadingHook();
            window.sgraphVault.shell = this;
            window.sgraphVault.events.emit('shell-ready', {});
        }

        // --- Render ---------------------------------------------------------------

        _render() {
            this.innerHTML = `
                <style>${VaultShell.styles}</style>

                <!-- Entry View (before vault is opened) -->
                <div class="vs-entry">
                    <vault-entry id="entry"></vault-entry>
                </div>

                <!-- Shell (after vault is opened) -->
                <div class="vs-shell" style="display:none">
                    <vault-header></vault-header>
                    <vault-auth></vault-auth>

                    <div class="vs-body">
                        <vault-nav></vault-nav>
                        <div class="vs-content">
                            <!-- Files view: shared Browse component fills this -->
                            <div class="vs-view vs-view-files"></div>

                            <!-- SGit view -->
                            <div class="vs-view vs-view-sgit" style="display:none">
                                <vault-sgit-view></vault-sgit-view>
                            </div>

                            <!-- Settings view -->
                            <div class="vs-view vs-view-settings" style="display:none">
                                <vault-settings></vault-settings>
                            </div>
                        </div>
                    </div>

                    <vault-status-bar></vault-status-bar>
                </div>
            `;
        }

        // --- Listeners ------------------------------------------------------------

        _setupListeners() {
            // Entry events
            this.addEventListener('vault-opened',  (e) => this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey));
            this.addEventListener('vault-created', (e) => this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey));

            // Header events
            this.addEventListener('vault-header-upload', () => this._onUploadRequest());
            this.addEventListener('vault-header-lock',   () => this._onLock());
            this.addEventListener('vault-header-debug',  () => this._toggleDebug());
            this.addEventListener('vault-header-raw',    () => this._showRawVault());

            // Nav events
            this.addEventListener('vault-nav-switch', (e) => this._switchView(e.detail.view));

            // Auth events
            this.addEventListener('vault-auth-submit', (e) => this._onAuthSubmit(e.detail.key));
            this.addEventListener('vault-auth-cancel', ()  => { this._pendingAction = null; });

            // Settings events
            this.addEventListener('vault-settings-name-saved', (e) => {
                this.querySelector('vault-header')?.setVaultName(e.detail.name);
                this._updateVaultKey();
            });
            this.addEventListener('vault-settings-access-key', (e) => {
                this._accessKey = e.detail.key;
                sessionStorage.setItem('sg-vault-access-key', e.detail.key);
                if (this._vault?._sgSend) this._vault._sgSend.token = e.detail.key;
                this.querySelector('vault-header')?.setReadOnly(false);
            });

            // Status bar debug click
            this.addEventListener('vault-status-debug', () => this._toggleDebug());

            // Upload component events
            this.addEventListener('vault-file-added', () => this._onFileAdded());
            this.addEventListener('vault-upload-request', () => this._onUploadRequest());
        }

        // --- Vault Lifecycle ------------------------------------------------------

        _onVaultOpened(vault, vaultKey, accessKey) {
            this._vault     = vault;
            this._vaultKey  = vaultKey;
            this._accessKey = accessKey || '';

            // Switch views
            this.querySelector('.vs-entry').style.display = 'none';
            this.querySelector('.vs-shell').style.display = 'grid';

            // Update header
            const header = this.querySelector('vault-header');
            header?.setVaultName(vault.name || '');
            header?.showLockButton(true);
            header?.setReadOnly(!this._accessKey);

            // Create VaultDataSource, load all sub-trees, then mount browse
            this._mountBrowse();

            // Wire settings
            this.querySelector('vault-settings')?.setVault(vault, vaultKey, this._accessKey);

            // Wire SGit
            const sgit = this.querySelector('vault-sgit-view');
            if (sgit) { sgit.vault = vault; sgit.refresh(); }

            // Update status
            this.querySelector('vault-status-bar')?.updateStats(vault);

            // Ensure files view is active
            this._switchView('files');

            const mode = this._accessKey ? '' : ' (read-only)';
            window.sgraphVault.events.emit('vault-opened', { vaultName: vault.name });
            window.sgraphVault.messages.success(`Vault "${vault.name}" opened${mode}`);
        }

        _onLock() {
            this._vault     = null;
            this._vaultKey  = '';
            this._accessKey = '';

            this.querySelector('.vs-shell').style.display  = 'none';
            this.querySelector('.vs-entry').style.display   = '';

            // Remove browse component
            const filesView = this.querySelector('.vs-view-files');
            if (filesView) filesView.innerHTML = '';

            // Clear header
            const header = this.querySelector('vault-header');
            header?.setVaultName('');
            header?.showLockButton(false);

            window.history.replaceState(null, '', window.location.pathname);
            try { localStorage.removeItem('sg-vault-key'); } catch (_) {}
            window.sgraphVault.events.emit('vault-locked', {});
        }

        // --- Mount Browse Component -----------------------------------------------

        async _mountBrowse() {
            const filesView = this.querySelector('.vs-view-files');
            if (!filesView) return;
            filesView.innerHTML = '<div style="padding:2rem;color:var(--color-text-secondary);">Loading vault files...</div>';

            const dataSource = new VaultDataSource(this._vault, this._accessKey);
            dataSource.onTreeChanged = () => this._onTreeChanged();

            // Load all lazy sub-trees before building the Browse tree
            await dataSource.loadAllSubTrees();

            filesView.innerHTML = '';

            const browse = document.createElement('send-browse');
            browse.dataSource  = dataSource;
            browse.fileName    = this._vault.name || 'Vault';
            browse.downloadUrl = window.location.href;

            // Store references
            this._dataSource = dataSource;
            this._browse     = browse;

            filesView.appendChild(browse);
        }

        _onTreeChanged() {
            // Refresh status bar after file mutations
            this.querySelector('vault-status-bar')?.updateStats(this._vault);
            this._updateVaultKey();

            // Refresh settings if visible
            if (this._activeView === 'settings') {
                this.querySelector('vault-settings')?.refresh();
            }
        }

        _onFileAdded() {
            this._onTreeChanged();
            // Remount browse to pick up new tree state
            if (this._vault) this._mountBrowse();
        }

        // --- View Switching -------------------------------------------------------

        _switchView(viewId) {
            this._activeView = viewId;

            const views = this.querySelectorAll('.vs-view');
            views.forEach(v => v.style.display = 'none');

            const target = this.querySelector(`.vs-view-${viewId}`);
            if (target) target.style.display = '';

            this.querySelector('vault-nav')?.setActive(viewId);

            if (viewId === 'settings') {
                this.querySelector('vault-settings')?.refresh();
            }
            if (viewId === 'sgit') {
                const sgit = this.querySelector('vault-sgit-view');
                if (sgit && this._vault) { sgit.vault = this._vault; sgit.refresh(); }
            }
        }

        // --- Auth / Upload --------------------------------------------------------

        _requireAccessKey(onSuccess) {
            if (this._accessKey) { onSuccess(); return; }
            this._pendingAction = onSuccess;
            this.querySelector('vault-auth')?.show();
        }

        _onAuthSubmit(key) {
            this._accessKey = key;
            sessionStorage.setItem('sg-vault-access-key', key);
            if (this._vault?._sgSend) this._vault._sgSend.token = key;

            this.querySelector('vault-header')?.setReadOnly(false);
            window.sgraphVault.messages.success('Access key set — write operations enabled');

            if (this._pendingAction) {
                this._pendingAction();
                this._pendingAction = null;
            }
        }

        _onUploadRequest() {
            this._requireAccessKey(() => {
                // For now, show the upload panel inline (future: integrate into browse)
                window.sgraphVault.messages.success('Upload: use drag-and-drop or the file manager');
            });
        }

        // --- Key Management -------------------------------------------------------

        _updateVaultKey() {
            if (!this._vault) return;
            this._vaultKey = this._vault.getVaultKey();
        }

        // --- Loading Indicator ----------------------------------------------------

        _setupLoadingHook() {
            const shell = this;
            const originalFetch = window.fetch.__vaultOriginal || window.fetch;
            const wrappedFetch = async function() {
                shell._showLoading();
                try { return await originalFetch.apply(window, arguments); }
                finally { shell._hideLoading(); }
            };
            wrappedFetch.__vaultOriginal = originalFetch;
            window.fetch = wrappedFetch;
        }

        _showLoading() {
            this._loadingCount++;
            this.querySelector('vault-header')?.showLoading();
        }

        _hideLoading() {
            this._loadingCount = Math.max(0, this._loadingCount - 1);
            if (this._loadingCount === 0) {
                this.querySelector('vault-header')?.hideLoading();
            }
        }

        // --- Debug Panel ----------------------------------------------------------

        _toggleDebug() {
            // Open debug as a simple panel below the content (future: sg-layout panel)
            let debugEl = this.querySelector('.vs-debug');
            if (debugEl) {
                debugEl.remove();
                return;
            }

            debugEl = document.createElement('div');
            debugEl.className = 'vs-debug';
            debugEl.innerHTML = `
                <div class="vs-debug-tabs">
                    <button class="vs-debug-tab vs-debug-tab--active" data-tab="messages">Msgs</button>
                    <button class="vs-debug-tab" data-tab="events">Events</button>
                    <button class="vs-debug-tab" data-tab="api">API</button>
                    <button class="vs-debug-tab" data-tab="storage">Storage</button>
                </div>
                <div class="vs-debug-body">
                    <div class="vs-debug-pane" data-pane="messages"><vault-messages-panel></vault-messages-panel></div>
                    <div class="vs-debug-pane" data-pane="events" style="display:none"><vault-events-viewer></vault-events-viewer></div>
                    <div class="vs-debug-pane" data-pane="api" style="display:none"><vault-api-logger></vault-api-logger></div>
                    <div class="vs-debug-pane" data-pane="storage" style="display:none"><vault-storage-viewer></vault-storage-viewer></div>
                </div>
            `;

            debugEl.addEventListener('click', (e) => {
                const tab = e.target.closest('.vs-debug-tab');
                if (!tab) return;
                debugEl.querySelectorAll('.vs-debug-tab').forEach(t => t.classList.toggle('vs-debug-tab--active', t === tab));
                debugEl.querySelectorAll('.vs-debug-pane').forEach(p => p.style.display = p.dataset.pane === tab.dataset.tab ? '' : 'none');
            });

            const body = this.querySelector('.vs-body');
            if (body) body.after(debugEl);
        }

        // --- Raw Vault View -------------------------------------------------------

        _showRawVault() {
            if (!this._vault) return;
            const raw = {
                tree:          this._vault._tree,
                settings:      this._vault._settings,
                headCommitId:  this._vault._headCommitId,
                vaultId:       this._vault._vaultId,
                refFileId:     this._vault._refFileId
            };

            const win = window.open('', '_blank');
            if (win) {
                win.document.write(`<html><head><title>raw: vault</title></head><body><pre>${JSON.stringify(raw, null, 2)}</pre></body></html>`);
            }
        }
    }

    // --- Styles (shell layout only — components own their own styles) ----------

    VaultShell.styles = `
        .vs-entry {
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; padding: var(--space-4);
        }
        .vs-shell {
            display: grid;
            grid-template-areas:
                "header"
                "auth"
                "body"
                "debug"
                "status";
            grid-template-rows: 48px auto 1fr auto auto;
            height: 100vh; overflow: hidden;
        }
        .vs-shell > vault-header  { grid-area: header; }
        .vs-shell > vault-auth    { grid-area: auth; }
        .vs-shell > vault-status-bar { grid-area: status; }

        .vs-body {
            grid-area: body; display: flex; overflow: hidden;
        }
        .vs-body > vault-nav { flex-shrink: 0; }

        .vs-content {
            flex: 1; overflow: hidden; position: relative;
        }
        .vs-view {
            height: 100%; overflow: auto;
        }
        .vs-view-files {
            overflow: hidden; /* send-browse manages its own scroll */
        }
        .vs-view-files send-browse {
            display: block; height: 100%;
        }
        .vs-view-sgit {
            padding: var(--space-4); box-sizing: border-box;
        }

        /* Debug panel */
        .vs-debug {
            grid-area: debug; max-height: 250px; overflow: hidden;
            display: flex; flex-direction: column;
            border-top: 1px solid var(--color-border); background: var(--bg-surface);
        }
        .vs-debug-tabs {
            display: flex; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
        }
        .vs-debug-tab {
            flex: 1; padding: 0.5rem; font-size: var(--text-small); font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.04em; background: transparent;
            border: none; border-bottom: 2px solid transparent;
            color: var(--color-text-secondary); cursor: pointer;
        }
        .vs-debug-tab:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vs-debug-tab--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
        .vs-debug-body { flex: 1; overflow-y: auto; }
        .vs-debug-pane { height: 100%; }
    `;

    if (!customElements.get('vault-shell')) {
        customElements.define('vault-shell', VaultShell);
    }
})();
