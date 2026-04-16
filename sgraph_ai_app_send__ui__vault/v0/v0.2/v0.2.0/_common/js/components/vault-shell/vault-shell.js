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
            this._syncState     = { ahead: 0, behind: 0, diverged: false };
            this._autoSyncEnabled = true;   // overridden from localStorage in _initAutoSync()
            this._autoSyncCheckPending = false;
        }

        connectedCallback() {
            this._render();
            this._setupListeners();
            this._setupLoadingHook();
            this._initAutoSync();
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

                        <div class="vs-main">
                            <!-- Sync notice banner (upstream changes / diverged) -->
                            <div class="vs-sync-notice" style="display:none"></div>

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

                        <!-- Debug sidebar (right column, toggled by Debug button) -->
                        <div class="vs-debug-sidebar" hidden>
                            <div class="vs-debug-handle" title="Drag to resize"></div>
                            <sg-layout id="vault-debug-layout"></sg-layout>
                        </div>
                    </div>

                    <vault-status-bar></vault-status-bar>
                </div>
            `;
        }

        // --- Listeners ------------------------------------------------------------

        _setupListeners() {
            // Entry events
            this.addEventListener('vault-opened',  (e) => this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey, e.detail.deepLink));
            this.addEventListener('vault-created', (e) => this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey));

            // Header events
            this.addEventListener('vault-header-push',    () => this._onPush());
            this.addEventListener('vault-header-pull',    () => this._onPull());
            this.addEventListener('vault-header-refresh', () => this._onRefresh());
            this.addEventListener('vault-header-upload',  () => this._onUploadRequest());
            this.addEventListener('vault-header-lock',    () => this._onLock());
            this.addEventListener('vault-header-debug',   () => this._toggleDebug());
            this.addEventListener('vault-header-raw',     () => this._showRawVault());

            // Nav events
            this.addEventListener('vault-nav-switch', (e) => {
                this._switchView(e.detail.view);
                if (e.detail.view === 'files') this._scheduleAutoSyncCheck();
            });

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

            // Branch switch: remount browse to reflect new branch content
            this.addEventListener('branch-switched', () => this._mountBrowse());

            // Upload component events
            this.addEventListener('vault-file-added', () => this._onFileAdded());
            this.addEventListener('vault-upload-request', () => this._onUploadRequest());

            // Sync notice actions
            this.addEventListener('click', (e) => {
                if (e.target.closest('.vs-sync-merge-btn')) {
                    this._switchView('sgit');
                    setTimeout(() => this.querySelector('vault-sgit-view')?._switchTab('repair'), 50);
                }
                if (e.target.closest('.vs-sync-pull-btn')) this._onPull();
                if (e.target.closest('.vs-sync-notice-close')) {
                    const n = this.querySelector('.vs-sync-notice');
                    if (n) n.style.display = 'none';
                }
            });

            // Soft checkout from history
            this.addEventListener('vault-sgit-checkout', (e) => this._onCheckout(e.detail.commitId));
        }

        // --- Vault Lifecycle ------------------------------------------------------

        _onVaultOpened(vault, vaultKey, accessKey, deepLink) {
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
            this._mountBrowse(deepLink);

            // Wire settings
            this.querySelector('vault-settings')?.setVault(vault, vaultKey, this._accessKey);

            // Wire SGit
            const sgit = this.querySelector('vault-sgit-view');
            if (sgit) { sgit.vault = vault; sgit.refresh(); }

            // Update status
            this.querySelector('vault-status-bar')?.updateStats(vault);

            // Show ahead/behind counts + diverged state if writable
            this._refreshSyncState();

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

            // Refresh the entry screen so recent vaults list is up to date
            this.querySelector('vault-entry')?.refresh?.();
        }

        // --- Mount Browse Component -----------------------------------------------

        async _onRefresh() {
            if (!this._vaultKey) return;
            this.querySelector('vault-header')?.showLoading();
            try {
                const entry   = this.querySelector('vault-entry');
                const sgSend  = entry._getSGSend();
                const vault   = await SGVault.open(sgSend, this._vaultKey);
                this._vault   = vault;

                // Remount browse with fresh vault data
                await this._mountBrowse();

                // Refresh other views
                this.querySelector('vault-settings')?.setVault(vault, this._vaultKey, this._accessKey);
                this.querySelector('vault-status-bar')?.updateStats(vault);
                this.querySelector('vault-header')?.setVaultName(vault.name || '');

                this._refreshSyncState();
                window.sgraphVault.messages.success('Vault refreshed');
            } catch (err) {
                window.sgraphVault.messages.error(`Refresh failed: ${err.message}`);
            } finally {
                this.querySelector('vault-header')?.hideLoading();
            }
        }

        async _mountBrowse(deepLink) {
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

            // Compatibility shim: page layout overlay uses zipTree with entry.entry.async()
            // Create fake entries that delegate to dataSource.getFileBytes()
            browse.zipTree = dataSource.getFileList().map(function(e) {
                return {
                    path: e.path,
                    name: e.name,
                    dir:  e.dir,
                    size: e.size,
                    entry: {
                        async: function() { return dataSource.getFileBytes(e.path); }
                    }
                };
            });

            // Store references
            this._dataSource = dataSource;
            this._browse     = browse;

            // If a deep link path was provided, open that file instead of auto-open first
            if (deepLink) {
                const origAutoOpen = browse._autoOpenFirstFile;
                browse._autoOpenFirstFile = function() {
                    // Open the deep-linked file, fall back to default if not found
                    if (this._openFileTab) {
                        this._openFileTab(deepLink);
                    } else if (origAutoOpen) {
                        origAutoOpen.call(this);
                    }
                };
            }

            filesView.appendChild(browse);
        }

        _onTreeChanged() {
            // Refresh status bar after file mutations
            this.querySelector('vault-status-bar')?.updateStats(this._vault);
            this._updateVaultKey();
            this._refreshSyncState();

            // Refresh settings if visible
            if (this._activeView === 'settings') {
                this.querySelector('vault-settings')?.refresh();
            }

            // After a local write, check if published branch also moved
            this._scheduleAutoSyncCheck();
        }

        _onFileAdded() {
            this._onTreeChanged();
            // Remount browse to pick up new tree state
            if (this._vault) this._mountBrowse();
        }

        async _refreshSyncState() {
            if (!this._vault || !this._accessKey) return;
            try {
                const [ahead, behind] = await Promise.all([
                    this._vault.getAheadCount(),
                    this._vault.getBehindCount()
                ]);
                const diverged = ahead > 0 && behind > 0;
                this._syncState = { ahead, behind, diverged };
                const header = this.querySelector('vault-header');
                header?.setAheadCount(ahead);
                header?.setBehindCount(behind);
                header?.setDiverged(diverged);
                this._updateSyncNotice();
            } catch (_) {}
        }

        async _onPush() {
            if (!this._vault || !this._accessKey) return;

            // Guard: diverged vault — pushing silently discards published-only commits
            const { diverged, behind } = this._syncState || {};
            if (diverged) {
                const ok = confirm(
                    '\u26a0  Diverged vault\n\n' +
                    `Pushing will overwrite the published branch and permanently discard ` +
                    `${behind} published commit(s) not in your working branch.\n\n` +
                    'To safely merge, use SGit \u2192 Repair tab to reconcile changes first.\n\n' +
                    'Force-push anyway?'
                );
                if (!ok) return;
            }

            const header = this.querySelector('vault-header');
            header?.setPushBusy(true);
            try {
                await this._vault.push();
                await this._refreshSyncState();
                window.sgraphVault.messages.success('Pushed \u2014 named branch updated');
            } catch (err) {
                window.sgraphVault.messages.error(`Push failed: ${err.message}`);
            } finally {
                header?.setPushBusy(false);
            }
        }

        async _onPull() {
            if (!this._vault || !this._accessKey) return;
            const header = this.querySelector('vault-header');
            header?.setPullBusy(true);
            try {
                const changed = await this._vault.pull();
                if (changed) {
                    await this._mountBrowse();
                    this.querySelector('vault-status-bar')?.updateStats(this._vault);
                    await this._refreshSyncState();
                    window.sgraphVault.messages.success('Pulled \u2014 vault updated from named branch');
                } else {
                    window.sgraphVault.messages.success('Already up to date');
                }
            } catch (err) {
                window.sgraphVault.messages.error(`Pull failed: ${err.message}`);
            } finally {
                header?.setPullBusy(false);
            }
        }

        // --- Auto-sync (activity-triggered, no polling) --------------------------------

        _scheduleAutoSyncCheck() {
            if (this._autoSyncCheckPending) return
            this._autoSyncCheckPending = true
            setTimeout(() => {
                this._autoSyncCheckPending = false
                this._checkAndAutoSync()
            }, 800)   // debounce: wait 800ms after nav switch before checking
        }

        async _checkAndAutoSync() {
            if (!this._vault || !this._accessKey) return
            if (!this._autoSyncEnabled) return

            let liveNamedHead
            try {
                liveNamedHead = await this._vault._refManager.readRef(this._vault._refFileId)
            } catch (_) { return }

            if (!liveNamedHead || liveNamedHead === this._vault._namedHeadId) return

            // There are upstream changes
            const { ahead } = this._syncState || {}
            if (ahead > 0) {
                // We have local commits too — diverged or ahead. Don't auto-merge silently.
                // Refresh sync state so the banner updates (it will show the diverged notice).
                await this._refreshSyncState()
                return
            }

            // We are cleanly behind — safe to auto-pull
            window.sgraphVault.messages.info('Syncing vault\u2026')
            try {
                const result = await this._vault.merge(liveNamedHead)
                if (result.merged) {
                    await this._mountBrowse()
                    await this._refreshSyncState()
                    if (result.conflicts?.length > 0) {
                        window.sgraphVault.messages.warn(
                            `Synced \u2014 ${result.conflicts.length} conflict(s) saved as _conflict copies`
                        )
                    } else {
                        window.sgraphVault.messages.success('Vault synced \u2014 new content from published branch')
                    }
                }
            } catch (err) {
                window.sgraphVault.messages.error(`Auto-sync failed: ${err.message}`)
            }
        }

        setAutoSync(enabled) {
            this._autoSyncEnabled = enabled
            try { localStorage.setItem('sg-vault-autosync', String(enabled)) } catch (_) {}
        }

        _initAutoSync() {
            try {
                const stored = localStorage.getItem('sg-vault-autosync')
                this._autoSyncEnabled = stored === null ? true : stored === 'true'
            } catch (_) {}
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
                // Trigger file picker via the Browse upload button
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.addEventListener('change', async () => {
                    if (!input.files || !input.files.length || !this._dataSource) return;
                    for (const file of input.files) {
                        try {
                            const buffer = await file.arrayBuffer();
                            await this._dataSource.saveFile('/', file.name, buffer);
                            window.sgraphVault.messages.success(`Uploaded "${file.name}"`);
                        } catch (err) {
                            window.sgraphVault.messages.error(`Upload failed: ${err.message}`);
                        }
                    }
                    // Remount browse to refresh tree
                    this._mountBrowse();
                });
                input.click();
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

        // --- Sync Notice Banner ---------------------------------------------------

        _updateSyncNotice() {
            const notice = this.querySelector('.vs-sync-notice');
            if (!notice) return;
            const { ahead, behind, diverged } = this._syncState || {};

            if (diverged) {
                notice.style.display = '';
                notice.className = 'vs-sync-notice vs-sync-notice--diverged';
                notice.innerHTML = `
                    <span class="vs-sync-notice-icon">⚡</span>
                    <span class="vs-sync-notice-text">
                        Vault diverged — ${ahead} local commit${ahead !== 1 ? 's' : ''} ahead,
                        ${behind} published commit${behind !== 1 ? 's' : ''} behind.
                        Merge before pushing.
                    </span>
                    <button class="vs-sync-notice-btn vs-sync-merge-btn">Repair / Merge →</button>
                    <button class="vs-sync-notice-close" title="Dismiss">✕</button>
                `;
            } else if (behind > 0) {
                notice.style.display = '';
                notice.className = 'vs-sync-notice vs-sync-notice--behind';
                notice.innerHTML = `
                    <span class="vs-sync-notice-icon">⬇</span>
                    <span class="vs-sync-notice-text">
                        ${behind} new commit${behind !== 1 ? 's' : ''} on published branch.
                    </span>
                    <button class="vs-sync-notice-btn vs-sync-pull-btn">Sync now →</button>
                    <button class="vs-sync-notice-close" title="Dismiss">✕</button>
                `;
            } else {
                notice.style.display = 'none';
                notice.innerHTML = '';
            }
        }

        // --- Soft Checkout --------------------------------------------------------

        async _onCheckout(commitId) {
            if (!this._vault || !commitId) return;
            try {
                // Load the commit object to verify it exists
                const commit = await this._vault._commitManager.loadCommit(commitId);
                if (!commit) throw new Error('Commit not found: ' + commitId);

                // Update the clone ref to point to this commit
                const cloneRefId = this._vault._cloneRefFileId || this._vault._cloneRef;
                if (cloneRefId) {
                    await this._vault._refManager.writeRef(cloneRefId, commitId);
                }
                // Also update in-memory head
                this._vault._headCommitId = commitId;

                // Remount browse to reflect the checked-out tree
                await this._mountBrowse();
                await this._refreshSyncState();

                const short = commitId.slice(0, 8);
                window.sgraphVault.messages.success(`Loaded commit ${short} as working state`);
                this._switchView('files');
            } catch (err) {
                window.sgraphVault.messages.error(`Checkout failed: ${err.message}`);
            }
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

        /* Main content column: sync banner + content stacked */
        .vs-main {
            flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0;
        }

        /* Sync notice banner */
        .vs-sync-notice {
            display: flex; align-items: center; gap: var(--space-2);
            padding: 0.4rem var(--space-3); font-size: var(--text-small);
            flex-shrink: 0; border-bottom: 1px solid var(--color-border);
        }
        .vs-sync-notice--diverged {
            background: rgba(255,80,80,0.12); color: #ff6b6b;
            border-bottom-color: rgba(255,80,80,0.3);
        }
        .vs-sync-notice--behind {
            background: rgba(78,205,196,0.1); color: #4ecdc4;
            border-bottom-color: rgba(78,205,196,0.3);
        }
        .vs-sync-notice-icon { font-size: 1rem; flex-shrink: 0; }
        .vs-sync-notice-text { flex: 1; }
        .vs-sync-notice-btn {
            padding: 0.25rem 0.75rem; border-radius: 4px; border: 1px solid currentColor;
            background: transparent; color: inherit; cursor: pointer; font-size: var(--text-small);
            font-weight: 600; white-space: nowrap;
        }
        .vs-sync-notice-btn:hover { background: rgba(255,255,255,0.1); }
        .vs-sync-notice-close {
            padding: 0.1rem 0.4rem; background: transparent; border: none;
            color: inherit; opacity: 0.6; cursor: pointer; font-size: 0.9rem; flex-shrink: 0;
        }
        .vs-sync-notice-close:hover { opacity: 1; }

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
