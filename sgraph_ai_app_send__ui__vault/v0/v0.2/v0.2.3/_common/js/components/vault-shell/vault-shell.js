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
            this._isROMode      = false;     // true when vault opened via ro-token (no passphrase, no write key)
            this._autoSyncEnabled = true;   // overridden from localStorage in _initAutoSync()
            this._autoSyncCheckPending = false;
            this._lastBehindCheckTime  = 0;
            this._behindCheckTimer     = null;
            // Inbox check-on-events (no polling) — mirrors the behind-check machinery.
            // Dormant until the owner enables the inbox (config.enabled), so vaults
            // without an inbox never hit the server or surface errors.
            this._inboxChecker         = null;
            this._inboxConfig          = { enabled: false, auto_fetch: false };
            this._lastInboxCheckTime   = 0;
            this._inboxCheckTimer      = null;
            this._visibilityHandler    = () => {
                if (document.hidden) return;
                this._scheduleBehindCheck(500);
                this._scheduleInboxCheck(500);
            };
        }

        connectedCallback() {
            this._render();
            this._setupListeners();
            this._setupLoadingHook();
            this._initAutoSync();
            document.addEventListener('visibilitychange', this._visibilityHandler);
            window.sgraphVault.shell = this;
            window.sgraphVault.events.emit('shell-ready', {});
            // Restore the debug pane (right-side, resizable) from the last session — matches
            // /app mode: open/width/active-tab persisted to sessionStorage, survives reload.
            this._restoreDebugState();
        }

        disconnectedCallback() {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            clearTimeout(this._behindCheckTimer);
            clearTimeout(this._inboxCheckTimer);
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
                                <!-- Settings view: lightweight tabs (Vault Settings | Public preview) -->
                                <div class="vs-view vs-view-settings" style="display:none">
                                    <div class="vs-stabs">
                                        <button class="vs-stab vs-stab--active" data-stab="settings">Vault Settings</button>
                                        <button class="vs-stab" data-stab="preview">Public preview</button>
                                    </div>
                                    <div class="vs-spane" data-spane="settings"><vault-settings></vault-settings></div>
                                    <div class="vs-spane" data-spane="preview" style="display:none">
                                        <div class="vs-pvp-split">
                                            <div class="vs-pvp-edit"><sg-public-preview-editor embedded></sg-public-preview-editor></div>
                                            <div class="vs-pvp-live">
                                                <div class="vs-pvp-livehead">Live preview</div>
                                                <sg-public-preview-card></sg-public-preview-card>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Right-side debug pane (built lazily by _ensureDebugContent) -->
                        <div class="vs-debug-sidebar" hidden></div>
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
            this.addEventListener('vault-header-check',   () => this._checkBehindOnly(true));
            this.addEventListener('vault-header-push',    () => this._onPush());
            this.addEventListener('vault-header-pull',    () => this._onPull());
            this.addEventListener('vault-header-refresh', () => this._onRefresh());
            this.addEventListener('vault-header-lock',    () => this._onLock());
            this.addEventListener('vault-header-debug',   () => this._toggleDebug());
            this.addEventListener('vault-header-raw',     () => this._showRawVault());
            this.addEventListener('vault-header-rename',  (e) => this._onVaultRename(e.detail?.name));

            // Nav events
            this.addEventListener('vault-nav-switch', (e) => {
                this._switchView(e.detail.view);
                if (e.detail.view === 'files') this._scheduleAutoSyncCheck();
            });

            // Settings sub-tabs: Vault Settings | Public preview
            this.addEventListener('click', (e) => {
                const tab = e.target.closest && e.target.closest('.vs-stab');
                if (tab) this._switchSettingsTab(tab.dataset.stab);
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
                VaultLoader.storage.setAccessKey(e.detail.key || null);
                if (this._vault?._sgSend) this._vault._sgSend.token = e.detail.key;
                // Update the live dataSource so edit/write buttons activate immediately
                if (this._dataSource) {
                    this._dataSource._accessKey = e.detail.key;
                    this._dataSource.writable   = !!e.detail.key;
                }
                this.querySelector('vault-header')?.setReadOnly(!e.detail.key);
                this.querySelector('vault-browse-edit, send-browse')?._remountIfNeeded?.();
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
                if (e.target.closest('.vs-sync-merge-btn')) this._onAutoMerge();
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

        async _onVaultOpened(vault, vaultKey, accessKey, deepLink) {
            this._vault     = vault;
            this._vaultKey  = vaultKey;
            this._accessKey = accessKey || '';

            // Embedded access token (parity with /app): if the vault carries .vault/access-token.json
            // AND it's a writable open (read_key available to decrypt; true RO-token opens have
            // _passphrase === null and can't read the .vault/ floor cleanly), adopt it as the access
            // key. The /app shell already does this (app-shell.js:_readEmbeddedAccessToken); /vault
            // didn't, so a vault created with create({ accessToken:'inherit' }) opened READ-ONLY
            // here even though the token was right there in the tree. Explicit accessKey (from the
            // entry form) still wins — embedded only fills the gap.
            if (!this._accessKey && vault && vault._passphrase !== null) {
                try {
                    const embedded = await this._readEmbeddedAccessToken(vault);
                    if (embedded) {
                        this._accessKey = embedded;
                        if (vault._sgSend) vault._sgSend.token = embedded;
                    }
                } catch (_) {}
            }

            // Switch views
            this.querySelector('.vs-entry').style.display = 'none';
            this.querySelector('.vs-shell').style.display = 'grid';

            // Update header
            const header = this.querySelector('vault-header');
            header?.setVaultName(vault.name || '');
            header?.showLockButton(true);

            // Distinguish true RO mode (ro-token, no passphrase) from owner without access key.
            this._isROMode = (!vault.writable && vault._passphrase === null);
            if (this._isROMode) {
                header?.setROMode(true);
            } else {
                header?.setReadOnly(!this._accessKey);
            }

            // Auto-fast-forward the per-client clone ref to the published named ref
            // before first render. Without this, a CLI push (which only updates the
            // named ref) leaves this browser's clone ref stale, and the Files panel
            // renders the previous commit's tree until the user clicks Refresh.
            await this._syncToNamedHead(vault);

            // Create VaultDataSource, load all sub-trees, then mount browse
            this._mountBrowse(deepLink);

            // Wire settings
            this.querySelector('vault-settings')?.setVault(vault, vaultKey, this._accessKey);

            // Hand the live vault to the embedded Public-preview editor — no re-open, no
            // localStorage race. Set the access token on the shared sgSend so publish/delete work.
            const pvpEditor = this.querySelector('sg-public-preview-editor');
            if (pvpEditor && typeof pvpEditor.setContext === 'function') {
                if (vault._sgSend && this._accessKey) vault._sgSend.token = this._accessKey;
                pvpEditor.setContext({ sgSend: vault._sgSend, vault: vault, vaultKey: vaultKey });
            }
            // Seed the side-by-side live card (it self-updates from the editor's
            // pvp-preview-changed events; this just avoids a stuck loading skeleton).
            const pvpLive = this.querySelector('.vs-spane[data-spane="preview"] sg-public-preview-card');
            if (pvpLive && typeof pvpLive.setState === 'function') {
                pvpLive.setState({ status: 'ok', preview: { schema: 'sgraph-public-preview/v1', title: '' }, showKeyPrompt: false });
            }

            // Wire SGit
            const sgit = this.querySelector('vault-sgit-view');
            if (sgit) { sgit.vault = vault; sgit.refresh(); }

            // Update status
            this.querySelector('vault-status-bar')?.updateStats(vault);

            // Show ahead/behind counts + diverged state if writable
            this._refreshSyncState();

            // Check server for upstream changes shortly after open
            this._scheduleBehindCheck(1500);

            // Build the inbox checker for this vault and run one check on open. It is a
            // no-op while config.enabled is false (the default until the owner turns the
            // inbox on in Settings — see C5), so this never touches the server for vaults
            // that have no inbox configured.
            await this._initInbox(vault);

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
            this._isROMode  = false;
            clearTimeout(this._inboxCheckTimer);
            this._inboxChecker = null;
            this._inboxConfig  = { enabled: false, auto_fetch: false };

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
            try { sessionStorage.removeItem('sg-vault-key'); localStorage.removeItem('sg-vault-key'); } catch (_) {}
            window.sgraphVault.events.emit('vault-locked', {});

            // Refresh the entry screen so recent vaults list is up to date
            this.querySelector('vault-entry')?.refresh?.();
        }

        // --- Sync Helper ----------------------------------------------------------
        // Aligns the in-memory working tree with the published named ref before render.
        // Read the optional embedded backend access token at .vault/access-token.json. The /app
        // shell has its own copy of this (app-shell.js:_readEmbeddedAccessToken); kept in sync
        // here intentionally so both shells produce the same writable-from-key-only behaviour.
        // The .vault/ folder is read_key-encrypted like the rest of the tree, so a writable open
        // can decrypt it. Returns the token string or null when the file is absent / malformed.
        async _readEmbeddedAccessToken(vault) {
            try {
                // `.vault` is a LAZY sub-tree right after open (_loadTreeFromCommit marks every
                // top-level folder _loaded:false). listFolder('/.vault') therefore returns [] —
                // and the token is never found — until the sub-tree is expanded. This was the
                // real reason the editor stayed read-only despite the token being present.
                if (vault.needsLoading && vault.needsLoading('/.vault')) {
                    await vault.loadSubTreeOnDemand('/.vault');
                }
                const listed = vault.listFolder('/.vault') || [];
                if (!listed.some((e) => e.name === 'access-token.json')) return null;
                const bytes = await vault.getFile('/.vault', 'access-token.json');
                const obj   = JSON.parse(new TextDecoder().decode(bytes));
                return (obj && obj.token) ? String(obj.token) : null;
            } catch (_) { return null; }
        }

        // Writable vaults fast-forward the clone ref (vault.merge); read-only vaults
        // load the named commit's tree in memory only — without this, a read-only
        // collaborator's Refresh button silently caught the merge error and left the
        // Files panel stuck on the stale clone-ref tree.
        async _syncToNamedHead(vault) {
            if (!vault || !vault._namedHeadId)                  return;
            if (vault._headCommitId === vault._namedHeadId)     return;

            if (vault.writable) {
                try { await vault.merge(vault._namedHeadId); } catch (_) { /* diverged — three-way merge already attempted */ }
                return;
            }

            // Read-only: bring the in-memory tree up to the published head without writing the ref.
            try {
                await vault._loadTreeFromCommit(vault._namedHeadId);
                vault._headCommitId = vault._namedHeadId;
            } catch (_) { /* leave tree as-is if the named commit can't be loaded */ }
        }

        // --- Mount Browse Component -----------------------------------------------

        async _onRefresh() {
            if (!this._vaultKey) return;
            this.querySelector('vault-header')?.showLoading();
            try {
                let vault;
                if (this._isROMode) {
                    // RO-token vaults: re-open via VaultLoader so format 5 dispatch runs correctly.
                    // SGVault.open() cannot handle ro-word-word-NNNN keys.
                    const result = await VaultLoader.open(this._vaultKey);
                    vault = result.vault;
                } else {
                    const entry  = this.querySelector('vault-entry');
                    const sgSend = entry._getSGSend();
                    vault = await SGVault.open(sgSend, this._vaultKey);

                    // Auto-merge if clone ref is behind named ref — Refresh should always
                    // show the latest published content, not just reload from the old clone.
                    await this._syncToNamedHead(vault);
                }
                this._vault = vault;

                // Remount browse with fresh vault data
                await this._mountBrowse();

                // Refresh other views
                this.querySelector('vault-settings')?.setVault(vault, this._vaultKey, this._accessKey);
                this.querySelector('vault-status-bar')?.updateStats(vault);
                this.querySelector('vault-header')?.setVaultName(vault.name || '');

                this._refreshSyncState();
                this.querySelector('vault-header')?.setRefreshAvailable(false);
                // Refresh the SGit view too — it holds its own _vault reference (now stale after
                // the re-open) and only re-renders on tab switch, so without this the history/tree
                // stayed stale until you navigated away and back (or reloaded the page).
                if (this._activeView === 'sgit') {
                    const sgit = this.querySelector('vault-sgit-view');
                    if (sgit) { sgit.vault = this._vault; sgit.refresh(); }
                }
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

            const rootDataSource = new VaultDataSource(this._vault, this._accessKey);

            // Load all lazy sub-trees before building the Browse tree
            await rootDataSource.loadAllSubTrees();

            // Wrap so `*.link.json` sub-vaults splice in as inline, expandable folders.
            // Key comes from an ro-links record (silent), else localStorage, else the
            // <sg-link-card> prompt (public-info-before-key); child opens read-only.
            // Falls back to the plain data source if the composite script isn't loaded.
            const _endpoint = (this._vault && this._vault._sgSend && this._vault._sgSend.endpoint)
                || (window.VaultLoaderStorage && VaultLoaderStorage.getEndpoint && VaultLoaderStorage.getEndpoint())
                || 'https://dev.send.sgraph.ai';
            const _keyProvider = (mount) => new Promise((resolve) => {
                const label = (mount.link && mount.link.label) || mount.nodeName;
                // Rich surface: the link card (public info → key → save choice → open / new window)
                if (window.customElements && customElements.get('sg-link-card')) {
                    const card = document.createElement('sg-link-card');
                    const done = (val) => { try { card.remove(); } catch (_) {} resolve(val); };
                    card.addEventListener('sg-link-open', (e) => {
                        if (e.detail.save === 'local' && mount.link && mount.link.vault_id) {
                            try { VaultLinks.setStoredChildKey(mount.link.vault_id, e.detail.key); } catch (_) {}
                        }
                        done(e.detail.key);
                    });
                    card.addEventListener('sg-link-open-new-window', (e) => {
                        if (e.detail.key) window.open('/#' + encodeURIComponent(e.detail.key), '_blank', 'noopener');
                        done(null);   // opened elsewhere; cancel the inline open
                    });
                    card.addEventListener('sg-link-cancel', () => done(null));
                    document.body.appendChild(card);
                    card.openCard({ label: label, vaultId: mount.link && mount.link.vault_id,
                                    publicId: mount.link && mount.link.public_id, apiBase: _endpoint });
                    return;
                }
                // Fallback: plain prompt
                const key = window.prompt('Enter the key for linked vault "' + label + '" (opens read-only):', '');
                resolve(key && key.trim() ? key.trim() : null);
            });
            const dataSource = (typeof CompositeDataSource !== 'undefined')
                ? new CompositeDataSource(rootDataSource, { keyProvider: _keyProvider })
                : rootDataSource;
            dataSource.onTreeChanged = () => this._onTreeChanged();
            if (typeof dataSource.scan === 'function') {
                try { await dataSource.scan(); } catch (err) { console.warn('[vault-shell] sub-vault scan failed:', err && err.message); }
            }

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

            // Keep vault header in sync — .vault-settings.json edits update _vault.name
            if (this._vault) {
                this.querySelector('vault-header')?.setVaultName(this._vault.name || '');
            }

            // Refresh settings if visible
            if (this._activeView === 'settings') {
                this.querySelector('vault-settings')?.refresh();
            }

            // After a local write, check if published branch also moved
            this._scheduleAutoSyncCheck();

            // Notify debug panes (e.g. Sub-vaults) that the mount table may have changed
            // (sub-vault opened/expanded → status collapsed → mounted).
            try { window.sgraphVault.events.emit('tree-changed', {}); } catch (_) {}
        }

        _onFileAdded() {
            this._onTreeChanged();
            // Remount browse to pick up new tree state
            if (this._vault) this._mountBrowse();
        }

        async _refreshSyncState() {
            if (!this._vault || !this._accessKey) return;
            try {
                const cloneHead = this._vault._headCommitId;
                const namedHead = this._vault._namedHeadId;

                let ahead = 0, behind = 0, diverged = false;

                if (cloneHead && namedHead && cloneHead !== namedHead) {
                    // Check if namedHead is reachable from cloneHead (clone is AHEAD)
                    const namedReachable = await this._vault._isAncestor(namedHead, cloneHead);
                    if (namedReachable) {
                        ahead = await this._vault.getAheadCount();
                    } else {
                        // Check if cloneHead is reachable from namedHead (clone is BEHIND)
                        const cloneReachable = await this._vault._isAncestor(cloneHead, namedHead);
                        if (cloneReachable) {
                            behind = await this._vault.getBehindCount();
                        } else {
                            // Neither reachable from the other — truly diverged
                            diverged = true;
                            ahead  = await this._countToFork(cloneHead, namedHead);
                            behind = await this._countToFork(namedHead, cloneHead);
                        }
                    }
                }

                this._syncState   = { ahead, behind, diverged };
                this._lastSyncedAt = Date.now();
                const header = this.querySelector('vault-header');
                header?.setAheadCount(ahead);
                header?.setBehindCount(behind);
                header?.setDiverged(diverged);
                this._updateSyncNotice();
            } catch (_) {}
        }

        // Count commits from fromId until we hit any commit in the other head's
        // first-parent chain (= fork point). Used for diverged branch counts.
        async _countToFork(fromId, otherHeadId) {
            const otherChain = new Set();
            let c = otherHeadId;
            for (let i = 0; i < 100 && c; i++) {
                otherChain.add(c);
                try { const cm = await this._vault._commitManager.loadCommit(c); c = cm.parents?.[0] || null; }
                catch (_) { break; }
            }
            let n = 0, cur = fromId;
            while (cur && n < 100) {
                if (otherChain.has(cur)) break;
                n++;
                try { const cm = await this._vault._commitManager.loadCommit(cur); cur = cm.parents?.[0] || null; }
                catch (_) { break; }
            }
            return n;
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
                if (this._activeView === 'sgit') {
                    const sgit = this.querySelector('vault-sgit-view');
                    if (sgit) { sgit.vault = this._vault; sgit.refresh(); }
                }
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
                const prevHead = this._vault._headCommitId;
                const changed = await this._vault.pull();
                if (changed) {
                    await this._mountBrowse();
                    this.querySelector('vault-status-bar')?.updateStats(this._vault);
                    await this._refreshSyncState();
                    window.dispatchEvent(new CustomEvent('sg-vault-synced', {
                        detail: { prevHead, newHead: this._vault._headCommitId }
                    }));
                    window.sgraphVault.messages.success('Pulled \u2014 vault updated from named branch');
                    if (this._activeView === 'sgit') {
                        const sgit = this.querySelector('vault-sgit-view');
                        if (sgit) { sgit.vault = this._vault; sgit.refresh(); }
                    }
                } else {
                    window.sgraphVault.messages.success('Already up to date');
                }
            } catch (err) {
                window.sgraphVault.messages.error(`Pull failed: ${err.message}`);
            } finally {
                header?.setPullBusy(false);
            }
        }

        // Non-destructive in-place refresh — pulls upstream changes and refreshes
        // chrome WITHOUT destroying the active SG/App iframe.
        // Called by sg.sync.refresh() via the VFS bridge.
        async _refreshInPlace() {
            if (!this._vault) throw new Error('No vault');
            const prevHead = this._vault._headCommitId;

            // Push any unsynced local commits first so pull doesn't diverge
            const { ahead } = this._syncState || {};
            if (ahead > 0 && this._accessKey) {
                await this._vault.push();
            }

            const changed = await this._vault.pull();
            const newHead  = this._vault._headCommitId;

            // Refresh chrome (status bar + sync state) without remounting the iframe
            this.querySelector('vault-status-bar')?.updateStats(this._vault);
            await this._refreshSyncState();

            // Notify the active VFS bridge so it can refresh fileList and cache
            if (changed) {
                window.dispatchEvent(new CustomEvent('sg-vault-synced', {
                    detail: { prevHead, newHead }
                }));
                // Keep the SGit view in sync (same gap as _onRefresh — it doesn't re-render itself).
                if (this._activeView === 'sgit') {
                    const sgit = this.querySelector('vault-sgit-view');
                    if (sgit) { sgit.vault = this._vault; sgit.refresh(); }
                }
            }

            return { from: prevHead, to: newHead, changed: !!changed };
        }

        async _onAutoMerge() {
            if (!this._vault || !this._accessKey) return;
            // Read LIVE named head — _namedHeadId may be stale if CLI pushed since vault was opened
            let namedHead;
            try {
                namedHead = await this._vault._refManager.readRef(this._vault._refFileId);
            } catch (err) {
                window.sgraphVault.messages.error(`Sync failed: ${err.message}`);
                return;
            }
            if (!namedHead) return;
            const header = this.querySelector('vault-header');
            header?.setPullBusy(true);
            const syncBtn = this.querySelector('.vs-sync-merge-btn, .vs-sync-pull-btn');
            if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = 'Syncing…'; }
            window.sgraphVault.messages.info('Merging collaborator changes\u2026');
            try {
                const mergeHead = this._vault._headCommitId;
                const result = await this._vault.merge(namedHead);
                if (result?.merged) {
                    // Refresh whatever view the user is already on — don't navigate away
                    if (this._activeView === 'sgit') {
                        const sgit = this.querySelector('vault-sgit-view');
                        if (sgit) { sgit.vault = this._vault; sgit.refresh(); }
                        // Rebuild browse data in background so Files view is ready
                        this._mountBrowse();
                    } else {
                        await this._mountBrowse();
                    }
                    await this._refreshSyncState();
                    window.dispatchEvent(new CustomEvent('sg-vault-synced', {
                        detail: { prevHead: mergeHead, newHead: this._vault._headCommitId }
                    }));

                    if (result.conflicts?.length > 0) {
                        window.sgraphVault.messages.warn(
                            `Merged \u2014 ${result.conflicts.length} conflict(s) saved as _conflict copies`
                        );
                    } else {
                        window.sgraphVault.messages.success('Synced \u2014 collaborator changes merged successfully');
                    }
                } else {
                    await this._refreshSyncState();
                    window.sgraphVault.messages.success('Already up to date');
                }
            } catch (err) {
                window.sgraphVault.messages.error(`Sync failed: ${err.message}`);
            } finally {
                header?.setPullBusy(false);
            }
        }

        // --- Behind check (cheap ref read, event/visibility-triggered) -----------------

        _scheduleBehindCheck(delayMs) {
            const DEBOUNCE_MS = 30 * 1000;
            if (Date.now() - this._lastBehindCheckTime < DEBOUNCE_MS) return;
            clearTimeout(this._behindCheckTimer);
            this._behindCheckTimer = setTimeout(() => this._checkBehindOnly(false), delayMs || 0);
        }

        async _checkBehindOnly(isExplicit) {
            if (!this._vault) return;
            this._lastBehindCheckTime = Date.now();
            const header = this.querySelector('vault-header');
            header?.setCheckBusy(true);
            try {
                const liveRef = await this._vault._refManager.readRef(this._vault._refFileId);
                const changed = liveRef && liveRef !== this._vault._namedHeadId;
                if (changed) {
                    this._vault._namedHeadId = liveRef;
                }
                if (this._accessKey) {
                    await this._refreshSyncState();
                } else if (changed) {
                    // Read-only vault: highlight Refresh so user knows new content is available
                    header?.setRefreshAvailable(true);
                    if (isExplicit) window.sgraphVault.messages.info('New content available — click Refresh to update');
                } else if (isExplicit) {
                    window.sgraphVault.messages.success('Already up to date');
                }
            } catch (_) { /* silent — network errors don't need user notification */ } finally {
                header?.setCheckBusy(false);
            }
        }

        // --- Inbox check (check-on-events, no polling) ---------------------------------

        // Build an SGInbox + SGInboxChecker for the open vault. enum_key is derived from
        // the read_key's raw bytes (owner sessions only — RO sessions get a null enum_key
        // and the checker stays effectively idle). Config persistence + the enable toggle
        // live in Settings (C5); until then this is dormant (config.enabled = false).
        async _initInbox(vault) {
            this._inboxChecker = null;
            if (typeof SGInbox === 'undefined' || typeof SGInboxChecker === 'undefined') return;
            try {
                const sgSend   = vault._sgSend || null;
                const endpoint = (sgSend && sgSend.endpoint) || '';
                const rawBytes = await vault.readKeyRawBytes();
                const enumKey  = rawBytes ? await SGInbox.deriveEnumKey(rawBytes) : null;
                const inbox    = new SGInbox({
                    endpoint,
                    vaultId    : vault.vaultId,
                    enumKey,
                    writeKeyHex: vault.writeKeyHex,
                    accessToken: (sgSend && sgSend.token) || this._accessKey || null
                });
                this._inboxChecker = new SGInboxChecker(inbox, window.sgraphVault.events, () => this._inboxConfig);
                // One check on open (no-op while disabled).
                this._scheduleInboxCheck(0, 'vault-open');
            } catch (_) { /* inbox is best-effort; never block vault open */ }
        }

        _scheduleInboxCheck(delayMs, trigger) {
            if (!this._inboxChecker) return;
            const DEBOUNCE_MS = 1000;                                            // shorter floor than the behind-check: inbox list is cheap
            const since = Date.now() - this._lastInboxCheckTime;
            const wait  = Math.max(delayMs || 0, DEBOUNCE_MS - since);
            const label = trigger || 'visibility';
            clearTimeout(this._inboxCheckTimer);
            this._inboxCheckTimer = setTimeout(() => {
                this._lastInboxCheckTime = Date.now();
                if (this._inboxChecker) this._inboxChecker.check(label);
            }, Math.max(0, wait));
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

            // --- Auto-push: push local unpushed commits before checking upstream ----
            // Refresh sync state so ahead/diverged counts are accurate.
            await this._refreshSyncState()
            const { ahead, diverged } = this._syncState || {}
            if (ahead > 0) {
                if (diverged) {
                    // Diverged — the banner will show; don't auto-push and risk data loss.
                    return
                }
                // We have local commits ahead of the named branch — push them.
                window.sgraphVault.messages.info('Auto-sync: pushing local commits\u2026')
                try {
                    await this._vault.push()
                    await this._refreshSyncState()
                    window.sgraphVault.messages.success('Auto-sync: local commits pushed to published branch')
                } catch (err) {
                    window.sgraphVault.messages.error(`Auto-sync push failed: ${err.message}`)
                }
                return
            }

            // --- Auto-pull: check for upstream changes and merge if cleanly behind --
            let liveNamedHead
            try {
                liveNamedHead = await this._vault._refManager.readRef(this._vault._refFileId)
            } catch (_) { return }

            if (!liveNamedHead || liveNamedHead === this._vault._namedHeadId) return

            // We are cleanly behind — safe to auto-pull
            window.sgraphVault.messages.info('Syncing vault\u2026')
            try {
                const autoSyncPrevHead = this._vault._headCommitId
                const result = await this._vault.merge(liveNamedHead)
                if (result.merged) {
                    await this._mountBrowse()
                    await this._refreshSyncState()
                    window.dispatchEvent(new CustomEvent('sg-vault-synced', {
                        detail: { prevHead: autoSyncPrevHead, newHead: this._vault._headCommitId }
                    }))
                    if (this._activeView === 'sgit') {
                        const sgit = this.querySelector('vault-sgit-view')
                        if (sgit) { sgit.vault = this._vault; sgit.refresh() }
                    }
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

        _switchSettingsTab(name) {
            this.querySelectorAll('.vs-stab').forEach(b => b.classList.toggle('vs-stab--active', b.dataset.stab === name));
            this.querySelectorAll('.vs-spane').forEach(p => { p.style.display = (p.dataset.spane === name) ? '' : 'none'; });
        }

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
            VaultLoader.storage.setAccessKey(key);
            if (this._vault?._sgSend) this._vault._sgSend.token = key;
            if (this._dataSource) {
                this._dataSource._accessKey = key;
                this._dataSource.writable   = !!key;
            }
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

        async _onVaultRename(name) {
            if (!name || !this._vault || !this._accessKey) return;
            try {
                await this._vault.setName(name);
                this.querySelector('vault-header')?.setVaultName(name);
                this._updateVaultKey();
                window.sgraphVault.messages.success(`Vault renamed to "${name}"`);
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
                this.querySelector('vault-header')?.setVaultName(this._vault.name || '');
            }
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

        // ── Debug pane (right-side, resizable, reload-persistent — mirrors /app mode) ──
        // Tabs: Sub-vaults (read-through CompositeDataSource mounts — the /vault analogue
        // of /app's ViV Mounts), Msgs, Events, API, Storage. State (open / width / active
        // tab) persists to sessionStorage so it survives a page reload, same as /app.

        static get _DBG_KEYS() { return { open: 'vault-debug-open', width: 'vault-debug-width', tab: 'vault-debug-tab' }; }

        // Build the sidebar content once (tab bar + lazily-instantiated panes).
        _ensureDebugContent() {
            const sidebar = this.querySelector('.vs-debug-sidebar');
            if (!sidebar || sidebar.dataset.built === '1') return sidebar;

            sidebar.innerHTML = `
                <div class="vs-debug-handle" title="Drag to resize"></div>
                <div class="vs-debug-inner">
                    <div class="vs-debug-tabs">
                        <button class="vs-debug-tab vs-debug-tab--active" data-tab="subvaults">Sub-vaults</button>
                        <button class="vs-debug-tab" data-tab="messages">Msgs</button>
                        <button class="vs-debug-tab" data-tab="events">Events</button>
                        <button class="vs-debug-tab" data-tab="api">API</button>
                        <button class="vs-debug-tab" data-tab="storage">Storage</button>
                        <button class="vs-debug-close" title="Close debug panel">✕</button>
                    </div>
                    <div class="vs-debug-body">
                        <div class="vs-debug-pane" data-pane="subvaults"><vault-subvaults-panel></vault-subvaults-panel></div>
                        <div class="vs-debug-pane" data-pane="messages" style="display:none"><vault-messages-panel></vault-messages-panel></div>
                        <div class="vs-debug-pane" data-pane="events" style="display:none"><vault-events-viewer></vault-events-viewer></div>
                        <div class="vs-debug-pane" data-pane="api" style="display:none"><vault-api-logger></vault-api-logger></div>
                        <div class="vs-debug-pane" data-pane="storage" style="display:none"><vault-storage-viewer></vault-storage-viewer></div>
                    </div>
                </div>
            `;

            sidebar.addEventListener('click', (e) => {
                if (e.target.closest('.vs-debug-close')) { this._setDebugOpen(false); return; }
                const tab = e.target.closest('.vs-debug-tab');
                if (tab) this._setDebugTab(tab.dataset.tab);
            });

            this._initDebugResize(sidebar);
            sidebar.dataset.built = '1';
            return sidebar;
        }

        _setDebugTab(tab) {
            const sidebar = this.querySelector('.vs-debug-sidebar');
            if (!sidebar) return;
            sidebar.querySelectorAll('.vs-debug-tab').forEach(t => t.classList.toggle('vs-debug-tab--active', t.dataset.tab === tab));
            sidebar.querySelectorAll('.vs-debug-pane').forEach(p => p.style.display = p.dataset.pane === tab ? '' : 'none');
            try { sessionStorage.setItem(VaultShell._DBG_KEYS.tab, tab); } catch (_) {}
        }

        _setDebugWidth(px) {
            const sidebar = this.querySelector('.vs-debug-sidebar');
            if (!sidebar) return;
            const w = Math.max(260, Math.min(720, px | 0));
            sidebar.style.flex = '0 0 ' + w + 'px';
            try { sessionStorage.setItem(VaultShell._DBG_KEYS.width, String(w)); } catch (_) {}
        }

        _setDebugOpen(open) {
            const sidebar = this._ensureDebugContent();
            if (!sidebar) return;
            sidebar.hidden = !open;
            if (open) {
                let w = 360;
                try { w = parseInt(sessionStorage.getItem(VaultShell._DBG_KEYS.width) || '360', 10) || 360; } catch (_) {}
                this._setDebugWidth(w);
                let tab = 'subvaults';
                try { tab = sessionStorage.getItem(VaultShell._DBG_KEYS.tab) || 'subvaults'; } catch (_) {}
                this._setDebugTab(tab);
            }
            try { sessionStorage.setItem(VaultShell._DBG_KEYS.open, open ? '1' : '0'); } catch (_) {}
        }

        _toggleDebug() {
            const sidebar = this.querySelector('.vs-debug-sidebar');
            const isOpen = sidebar && !sidebar.hidden && sidebar.dataset.built === '1';
            this._setDebugOpen(!isOpen);
        }

        _restoreDebugState() {
            let open = false;
            try { open = sessionStorage.getItem(VaultShell._DBG_KEYS.open) === '1'; } catch (_) {}
            if (open) this._setDebugOpen(true);
        }

        // Pointer-drag resize via the left-edge handle (sidebar grows as the pointer moves left).
        _initDebugResize(sidebar) {
            const handle = sidebar.querySelector('.vs-debug-handle');
            if (!handle) return;
            let startX = 0, startW = 0, dragging = false;
            const onMove = (e) => {
                if (!dragging) return;
                const dx = startX - e.clientX;          // moving left → wider
                this._setDebugWidth(startW + dx);
                e.preventDefault();
            };
            const onUp = () => {
                dragging = false;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.body.style.userSelect = '';
            };
            handle.addEventListener('pointerdown', (e) => {
                dragging = true;
                startX = e.clientX;
                startW = sidebar.getBoundingClientRect().width;
                document.body.style.userSelect = 'none';
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
                e.preventDefault();
            });
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
                    <span class="vs-sync-notice-icon">↕</span>
                    <span class="vs-sync-notice-text">
                        New changes from collaborators — ${ahead} local commit${ahead !== 1 ? 's' : ''}, ${behind} published commit${behind !== 1 ? 's' : ''}.
                    </span>
                    <button class="vs-sync-notice-btn vs-sync-merge-btn">Sync now →</button>
                    <button class="vs-sync-notice-close" title="Dismiss">✕</button>
                `;
            } else if (behind > 0) {
                notice.style.display = '';
                notice.className = 'vs-sync-notice vs-sync-notice--behind';
                notice.innerHTML = `
                    <span class="vs-sync-notice-icon">↓</span>
                    <span class="vs-sync-notice-text">
                        ${behind} new commit${behind !== 1 ? 's' : ''} from collaborators.
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
            background: rgba(180,150,80,0.1); color: #b8a060;
            border-bottom-color: rgba(180,150,80,0.2);
        }
        .vs-sync-notice--behind {
            background: rgba(78,205,196,0.08); color: var(--color-text-secondary);
            border-bottom-color: rgba(78,205,196,0.15);
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
        .vs-stabs {
            display: flex; gap: 4px; padding: var(--space-3, 12px) var(--space-4, 16px) 0;
            border-bottom: 1px solid var(--color-border, #2a2a44); position: sticky; top: 0;
            background: var(--bg-primary, #0a0a18); z-index: 1;
        }
        .vs-stab {
            padding: 0.55rem 1rem; border: 0; border-bottom: 2px solid transparent; background: transparent;
            color: var(--color-text-secondary, #9aa4bf); cursor: pointer; font: inherit; font-weight: 600;
        }
        .vs-stab:hover { color: var(--color-text, #e2e8f0); }
        .vs-stab--active { color: var(--color-primary, #4f8ff7); border-bottom-color: var(--color-primary, #4f8ff7); }
        .vs-spane { padding-top: var(--space-2, 8px); }
        .vs-pvp-split { display: flex; gap: 8px; align-items: flex-start; }
        .vs-pvp-edit { flex: 1 1 0; min-width: 0; }
        .vs-pvp-live { flex: 1 1 0; min-width: 0; position: sticky; top: 48px; padding: 16px 20px; }
        .vs-pvp-livehead { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em;
            color: var(--color-text-secondary, #9aa4bf); margin: 0 0 12px; }
        @media (max-width: 980px) { .vs-pvp-split { flex-direction: column; } .vs-pvp-live { position: static; } }
        .vs-view-files {
            overflow: hidden; /* send-browse manages its own scroll */
        }
        .vs-view-files send-browse {
            display: block; height: 100%;
        }
        /* The send-browse action-bar row is redundant in the vault: the vault name is
           in the top header, file size is in the bottom status bar, copy-link/email
           live on the Settings page, and the Gallery view doesn't apply here. File
           create actions move to the tree-panel controls (vault-browse-edit). */
        .vs-view-files .sb-header { display: none; }
        .vs-view-sgit {
            padding: var(--space-4); box-sizing: border-box;
        }

        /* Debug pane — right-side, resizable, reload-persistent (mirrors /app mode).
           Lives as the last flex child of .vs-body (a flex row), so it sits to the
           right of vault-nav + .vs-main. Width is driven by inline flex-basis (drag /
           sessionStorage); a left-edge handle resizes it. */
        .vs-debug-sidebar {
            flex: 0 0 360px; min-width: 260px; position: relative;
            display: flex; overflow: hidden;
            border-left: 1px solid var(--color-border); background: var(--bg-surface);
        }
        .vs-debug-sidebar[hidden] { display: none; }
        .vs-debug-handle {
            position: absolute; left: 0; top: 0; width: 6px; height: 100%;
            cursor: col-resize; z-index: 5; background: transparent;
        }
        .vs-debug-handle:hover { background: var(--color-primary); opacity: 0.4; }
        .vs-debug-inner {
            flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0;
            padding-left: 6px;
        }
        .vs-debug-tabs {
            display: flex; align-items: stretch; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
        }
        .vs-debug-tab {
            flex: 1; padding: 0.45rem 0.3rem; font-size: var(--text-small); font-weight: 600;
            letter-spacing: 0.02em; background: transparent;
            border: none; border-bottom: 2px solid transparent;
            color: var(--color-text-secondary); cursor: pointer; white-space: nowrap;
        }
        .vs-debug-tab:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vs-debug-tab--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
        .vs-debug-close {
            flex: 0 0 auto; padding: 0.45rem 0.6rem; background: transparent; border: none;
            border-left: 1px solid var(--color-border);
            color: var(--color-text-secondary); cursor: pointer; font-size: 0.85rem;
        }
        .vs-debug-close:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vs-debug-body { flex: 1; overflow-y: auto; min-height: 0; }
        .vs-debug-pane { height: 100%; }
    `;

    if (!customElements.get('vault-shell')) {
        customElements.define('vault-shell', VaultShell);
    }
})();
