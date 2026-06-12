/* =================================================================================
   SGraph App — Shell Component  (app-shell)
   v0.2.3 — Lightweight vault app host for /en-gb/app page.

   Lifecycle (with hash):
     connectedCallback → parse hash → open vault → read app.json →
     [optional auth intercept] → pre-fetch resources → mount iframe + VFS bridge

   Lifecycle (no hash — entry form):
     connectedCallback → _showEntryForm() → user submits key →
     _initWithKey() → same flow as above

   No vault-loader scripts are loaded on this page. Credential parsing is inline.
   VFS bridge surface is identical to send-browse so SG/App code runs unchanged.
   ================================================================================= */

(function () {
    'use strict';

    class AppShell extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._vault           = null;
            this._dataSource      = null;
            this._appJson         = null;
            this._effectiveAppJson = null;    // the manifest actually mounted (folder app.json or deep-link override)
            this._mountStrategy    = null;    // 'app' | 'file' | 'redirect' — replayed by _remountCurrent on auto-pull
            this._mountedFilePath  = null;    // the file path when _mountStrategy === 'file'
            this._vaultKey        = null;
            this._writable        = false;
            this._htmlDir         = '';
            this._iframeEl        = null;
            this._objectUrls      = [];
            this._vfsBridgeHandler = null;
            this._iframeStatus    = 'loading';
            this._resourcesLoaded = [];
            this._t               = {};
            // Nav history for the HUD back/forward arrows. Entries are "path[#fragment]"
            // strings (e.g. "scenarios/graph.html#c-adequacy"). _navIndex points at the
            // current entry; -1 means no navigation yet.
            this._navHistory      = [];
            this._navIndex        = -1;
        }

        connectedCallback() {
            this._resetConsentsHandler = () => this._resetConsents();
            document.addEventListener('app-hud:reset-consents', this._resetConsentsHandler);
            this._printHandler = () => this._onPrint();
            document.addEventListener('app-hud:print', this._printHandler);
            // HUD nav row → app-shell. The HUD never owns history; it dispatches actions
            // and reads back state via 'app-nav:change' events (emitted by _emitNavChange).
            this._navHudHandler = (ev) => {
                var action = ev && ev.detail && ev.detail.action;
                if (action === 'back')    this._navBack();
                if (action === 'forward') this._navForward();
                if (action === 'reload')  this._navReload();
                if (action === 'home')    this._navHome();
                if (action === 'jump' && ev.detail.path) {
                    // Recent-pages menu paths are vault-absolute (stored from history).
                    this._navigateToPath(ev.detail.path, { pushHistory: true, alreadyResolved: true });
                }
                if (action === 'exit')    this._exitApp();
            };
            document.addEventListener('app-hud:nav', this._navHudHandler);
            // Auto-sync parity with /vault: re-check the published head when the tab regains
            // focus, so an app left open picks up code/data another session pushed. Debounced
            // in _scheduleBehindCheck. Gated by the shared 'sg-vault-autosync' flag.
            this._visibilityHandler = () => {
                if (document.hidden) return;
                this._scheduleBehindCheck(500);
                this._scheduleInboxCheck(500);          // inbox check rides the same focus trigger (no-op unless an app opted in)
            };
            document.addEventListener('visibilitychange', this._visibilityHandler);
            this._init();
        }

        // Escape-pill action when HUD is in 'hidden' mode. Sends the user back to the vault
        // file browser (same destination as the chrome row's 'Open Vault' link).
        _exitApp() {
            var base = window.location.pathname.split('/en-gb/')[0];
            window.location.assign(base + '/en-gb/vault/');
        }

        disconnectedCallback() {
            if (this._resetConsentsHandler) { document.removeEventListener('app-hud:reset-consents', this._resetConsentsHandler); this._resetConsentsHandler = null; }
            if (this._printHandler) { document.removeEventListener('app-hud:print', this._printHandler); this._printHandler = null; }
            if (this._navHudHandler) { document.removeEventListener('app-hud:nav', this._navHudHandler); this._navHudHandler = null; }
            if (this._visibilityHandler) { document.removeEventListener('visibilitychange', this._visibilityHandler); this._visibilityHandler = null; }
            clearTimeout(this._autoPushTimer);
            clearTimeout(this._behindCheckTimer);
            clearTimeout(this._inboxCheckTimer);
            if (this._embedOpenHandler)  { window.removeEventListener('message', this._embedOpenHandler); this._embedOpenHandler = null; }
            if (this._embedReadyHandler) { this.removeEventListener('app-shell:ready', this._embedReadyHandler); this._embedReadyHandler = null; }
            if (this._vfsBridgeHandler) {
                window.removeEventListener('message', this._vfsBridgeHandler);
                this._vfsBridgeHandler = null;
            }
            this._objectUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
        }

        // Called by app-debug-pane to get diagnostic state.
        getDebugState() {
            return {
                appJson:         this._appJson,
                writable:        !!(this._writable && this._dataSource && this._dataSource.writable),
                writableCrypto:  this._writable,
                writableAuth:    !!(this._dataSource && this._dataSource.writable),
                entry:           this._appJson && this._appJson.entry ? this._appJson.entry : null,
                iframeStatus:    this._iframeStatus,
                resourcesLoaded: this._resourcesLoaded,
                timing:          this._t
            };
        }

        // ── Init flow ─────────────────────────────────────────────────────────────────

        _init() {
            // ── Embed mode: ?embed=1 → bypass URL hash + localStorage, wait for
            // parent to postMessage the key. See embed-protocol.js for the protocol
            // and the rationale (storage partitioning + key-in-URL avoidance).
            // Has to run BEFORE the localStorage read so a stray saved key from a
            // previous non-embed session doesn't auto-open the wrong vault here.
            if (typeof EmbedProtocol !== 'undefined' && EmbedProtocol.isEmbedMode()) {
                this._initEmbed();
                return;
            }

            // The hash on /en-gb/app is a FILE PATH for App Mode — NOT a vault key.
            // Vault key always comes from localStorage (set by /#vault-key → root inbox).
            // /en-gb/app#vault-key is no longer supported; use /#vault-key instead.
            var rawHash = window.location.hash.slice(1).trim();
            if (rawHash) {
                // Save as App Mode deep-link so vault can open this file in App Mode
                // if app-shell redirects to /en-gb/vault/ (no app.json case).
                try { sessionStorage.setItem('sg-vault-deep-link', 'app:' + rawHash); } catch (_) {}
                // Remove the hash — file path is now captured in sessionStorage
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            // Key always from localStorage (set by root inbox /#vault-key handler)
            var saved = '';
            try { saved = sessionStorage.getItem('sg-vault-key') || localStorage.getItem('sg-vault-key') || ''; } catch (_) {}

            // Public Vault Preview: /en-gb/app/<public-id> (or ?p=<id>) ALWAYS renders the
            // deliberately-public preview + a key prompt — even if a key is saved.
            // The saved key (sg-vault-key) is the LAST vault opened, which is NOT
            // necessarily the vault this public-id is about; auto-opening it would open
            // the wrong vault. We only auto-offer a key we stored FOR this public-id
            // (sg-pvp-key:<id>), via the card's "key saved on this device" button.
            var publicId = this._publicIdFromPath();
            if (publicId && typeof PublicPreviewRead !== 'undefined') {
                this._initPublicPreview(publicId);
                return;
            }

            if (saved) {
                this._showLoading('Opening vault…');
                this._initWithKey(saved, null).catch((err) => {
                    console.error('[app-shell] init failed:', err);
                    this._showEntryForm();
                    var errEl = this.shadowRoot.getElementById('ef-err');
                    if (errEl) errEl.textContent = err.message;
                    var keyEl = this.shadowRoot.getElementById('ef-key-input');
                    if (keyEl) { keyEl.value = saved; keyEl.dispatchEvent(new Event('input')); }
                });
                return;
            }
            this._showEntryForm();
        }

        // ── Embed mode init ────────────────────────────────────────────────────────────
        //
        // The vault is loaded inside an iframe (typically inside another origin's app
        // or inside a null-origin App Iframe). The parent passes the vault key via
        // postMessage rather than via URL hash, so the key stays out of the URL and
        // out of partitioned localStorage. See embed-protocol.js for the wire format.
        //
        // Sequence:
        //   1. We post {sg:'vault-embed-ready', v:1} to the parent.
        //   2. Parent responds with {sg:'vault-open', key, mode?, deepLink?}.
        //   3. We open the vault with the supplied key (one-shot — listener removed
        //      after the first valid message so a misbehaving parent can't re-key
        //      mid-session).
        //   4. Once mounted (app-shell:ready fires), we post {sg:'vault-ready', ...}
        //      back so the parent knows the vault is interactive.
        _initEmbed() {
            var self           = this;
            var expectedParent = EmbedProtocol.getExpectedParentOrigin();
            var targetOrigin   = expectedParent || '*';

            // Sentinel for downstream code (_initWithKey) to skip the storage-
            // persist step. The key stays in memory only for the embed session.
            this._embedMode = true;

            this._setStatus('Waiting for vault key…');

            // Post the ready ping. Wrapped in try because window.parent may throw
            // in pathological setups (sandboxed top-level page with no parent, etc.).
            try {
                window.parent.postMessage(EmbedProtocol.readyMessage(), targetOrigin);
            } catch (_) {}

            // One-shot listener for the open message. Removed on first valid message
            // so subsequent stray postMessages (e.g. a misbehaving parent re-keying)
            // can't reset the vault under the user.
            this._embedOpenHandler = function (event) {
                if (!EmbedProtocol.validateSource(event, expectedParent, window.parent)) return;
                var parsed = EmbedProtocol.parseOpenMessage(event.data);
                if (!parsed) return;

                window.removeEventListener('message', self._embedOpenHandler);
                self._embedOpenHandler = null;

                // Deep-link goes to INSTANCE MEMORY, not sessionStorage. In a null-
                // origin parent (App Iframe srcdoc), storage access throws — the
                // catch would swallow the SET silently, then _continue's GET would
                // also throw silently, and the deep-link would be lost without any
                // signal. _continue prefers self._embedDeepLink when it's set, so
                // the embed deep-link is null-origin-safe.
                if (parsed.deepLink) {
                    self._embedDeepLink = parsed.deepLink;
                }

                self._showLoading('Opening vault…');
                self._initWithKey(parsed.key, null).catch(function (err) {
                    console.error('[app-shell] embed init failed:', err);
                    self._showError('Vault open failed: ' + (err && err.message || err));
                });
            };
            window.addEventListener('message', this._embedOpenHandler);

            // Forward 'app-shell:ready' to the parent. This fires AFTER _initWithKey
            // resolves and the app is mounted, so the parent knows the vault is live.
            this._embedReadyHandler = function (event) {
                var detail = (event && event.detail) || {};
                var fileCount = 0;
                try {
                    if (self._dataSource && self._dataSource.getFileList) {
                        fileCount = self._dataSource.getFileList().length;
                    }
                } catch (_) {}
                try {
                    window.parent.postMessage(EmbedProtocol.vaultReadyMessage({
                        vaultName: detail.vaultName,
                        fileCount: fileCount,
                        hasApp:    !!self._appJson
                    }), targetOrigin);
                } catch (_) {}
            };
            this.addEventListener('app-shell:ready', this._embedReadyHandler);
        }

        // ── Public Vault Preview (Mode A: preview + ask for the key) ───────────────────

        _sendEndpoint() {
            return (window.SG_ENDPOINT
                || (function(){ try{ return sessionStorage.getItem('sg-vault-endpoint'); }catch(_){ return null; } })()
                || 'https://dev.send.sgraph.ai').replace(/\/$/, '');
        }

        _publicIdFromPath() {
            try {
                var m   = window.location.pathname.match(/\/app\/([^\/?#]+)/);   // /en-gb/app/<public-id>
                var seg = m && decodeURIComponent(m[1]);
                if (seg && seg !== 'index.html') return seg;
                return new URLSearchParams(window.location.search).get('p') || '';  // ?p=<id> (local dev)
            } catch (_) { return ''; }
        }

        async _initPublicPreview(publicId) {
            var self     = this;
            var endpoint = this._sendEndpoint();
            this.shadowRoot.innerHTML =
                '<style>.pvp-host{min-height:100vh;display:flex;align-items:center;justify-content:center;'
                + 'padding:24px;background:#0a0a18;box-sizing:border-box}</style><div class="pvp-host"></div>';
            var card = document.createElement('sg-public-preview-card');
            this.shadowRoot.querySelector('.pvp-host').appendChild(card);

            var transferId = '', readKey = '';
            try {
                transferId = await PublicPreviewCrypto.deriveTransferId(publicId);
                readKey    = await PublicPreviewCrypto.readKeyBase64url(publicId);
            } catch (_) {}
            // A key we previously stored FOR this public-id (owner published it, or a
            // returning visitor opened it on this device). This IS the right vault.
            var lsKey = 'sg-pvp-key:' + publicId;
            var localKey = '';
            try { localKey = localStorage.getItem(lsKey) || ''; } catch (_) {}

            var common = { publicId: publicId, transferId: transferId, readKey: readKey, apiBase: endpoint,
                           showKeyPrompt: true, hasLocalKey: !!localKey };
            card.setState(Object.assign({ status: 'loading' }, common));

            var res = { status: 'error', preview: null };
            try { res = await PublicPreviewRead.fetchPreview(endpoint, publicId); } catch (_) {}
            // Tab title reflects the vault on the unlock screen. Set BEFORE the first render
            // so the user sees the right tab label as soon as the card paints. If a later
            // mount (vault opened → app launched) sets its own title via _mountApp /
            // _mountVaultFile, that takes precedence — this is just the unlock-screen default.
            if (res && res.preview && res.preview.title) {
                document.title = 'SG/Vault — ' + res.preview.title;
            }
            var render = function (extra) { card.setState(Object.assign({ status: res.status, preview: res.preview }, common, extra || {})); };
            render();

            // The vault this preview is ABOUT (stamped at publish). Used to reject a
            // valid-but-wrong-vault key. Absent on older previews → no check (graceful).
            var expectedVaultId = (res.preview && res.preview.vault_id) || '';

            // Manual key entry → open (verifying it's the right vault), remember on success.
            card.addEventListener('pvp-open-vault', function (e) {
                self._initWithKey(e.detail.key, null, expectedVaultId)
                    .then(function () { try { localStorage.setItem(lsKey, e.detail.key); } catch (_) {} })
                    .catch(function (err) {
                        if (err && err.code === 'wrong-vault') render({ wrongVaultKey: e.detail.key });
                        else render({ keyError: "That key didn't open this vault. Check it and try again." });
                    });
            });

            // "Open — key saved on this device" → open with the stored key for this id.
            card.addEventListener('pvp-open-local', function () {
                self._initWithKey(localKey, null, expectedVaultId).catch(function (err) {
                    try { localStorage.removeItem(lsKey); } catch (_) {}           // stale/wrong — drop it
                    common.hasLocalKey = false;
                    if (err && err.code === 'wrong-vault') render({ wrongVaultKey: localKey });
                    else render({ keyError: "The saved key didn't open this vault. Enter the current key." });
                });
            });
        }

        async _initWithKey(key, presetAccessKey, expectedVaultId) {
            this._t.start = performance.now();
            this._vaultKey = key;

            var endpoint = (window.SG_ENDPOINT
                || (function(){ try{ return sessionStorage.getItem('sg-vault-endpoint'); }catch(_){ return null; } })()
                || 'https://dev.send.sgraph.ai').replace(/\/$/, '');
            var sgSend   = new SGSend({ endpoint: endpoint });

            this._emitVaultEvent('open-start', { label: 'Opening vault', key: this._maskKey(key), isRO: key.startsWith('ro-') });
            var vault, isRO = false;
            this._setStatus('Opening vault…');

            if (key.startsWith('ro-')) {
                var creds = await this._resolveROToken(sgSend, key);
                vault     = await SGVault.openReadOnly(sgSend, creds.vaultId, creds.readKeyB64, creds.refFileId);
                isRO      = true;
            } else {
                vault = await SGVault.open(sgSend, key);
                // App Mode is a viewer. SGVault.open() loads the tree from this browser's
                // working clone ref, which can lag behind the published (named) head when
                // commits were pushed from another clone — e.g. the sgit CLI or another
                // session. The vault UI hides this via auto-sync; app-shell has none, so it
                // would render stale content. Reload the view from the published head when
                // the clone is cleanly behind it.
                await this._syncViewToPublishedHead(vault);
            }

            // Wrong-vault guard: the key is valid but opens a DIFFERENT vault than the
            // one this public preview is about. Refuse BEFORE any side effects (no key
            // persisted, no UI built) so the user can't land in the wrong vault.
            if (expectedVaultId && vault._vaultId && vault._vaultId !== expectedVaultId) {
                throw Object.assign(new Error('This key opens a different vault.'), { code: 'wrong-vault' });
            }

            this._vault    = vault;
            this._writable = !isRO;
            this._t.vaultOpened = performance.now();
            this._emitVaultEvent('open-ok', { label: 'Vault opened', vaultName: vault.name || '', ms: Math.round(this._t.vaultOpened - this._t.start) });

            // Persist vault key for reload recovery. Per-tab: sessionStorage is this tab's
            // truth; localStorage holds the last-opened key as a fresh-tab fallback.
            // EMBED MODE: do NOT persist — the parent has the key and re-sends it via
            // postMessage on reload. Writing here would leak the key into the iframe's
            // (potentially partitioned) storage past the embed session — defeating the
            // whole point of the embed flow. The protocol assumes ephemeral, parent-driven
            // re-handshake on reload.
            if (!isRO && !this._embedMode) {
                try { sessionStorage.setItem('sg-vault-key', key); localStorage.setItem('sg-vault-key', key); } catch (_) {}
            }

            // Key never stays in address bar
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            // Build data source. Resolve the server access token (write gate): the entry-form
            // preset, else a saved per-vault / backend key. Thread it onto the write transport so
            // write PUTs carry x-sgraph-access-token (reads are tokenless).
            this._setStatus('Reading vault…');
            // Token resolution priority (writes only): explicit entry-form input → EMBEDDED token
            // in .vault/access-token.json (Q2: embedded wins over the localStorage cache, since it
            // is the current vault-bound intent) → legacy app.json.accessToken (below) → cache.
            // This is what makes a key-only link open WRITABLE: the patient holds the vault key
            // (reads decrypt), the embedded token authorises backend writes — never in the URL.
            var accessKey = null;
            if (!isRO) {
                if (presetAccessKey) {
                    accessKey = presetAccessKey;
                } else {
                    accessKey = await this._readEmbeddedAccessToken(vault);     // .vault/access-token.json
                    if (!accessKey) accessKey = this._resolveAccessToken(vault._vaultId || this._vaultKey);
                }
            }
            this._applyAccessToken(accessKey);
            this._dataSource = new VaultDataSource(vault, accessKey);
            if (accessKey) this._writable = true;
            await this._dataSource.loadAllSubTrees();
            this._t.treeLoaded = performance.now();
            this._emitVaultEvent('tree-loaded', { label: 'File tree loaded', fileCount: this._dataSource.getFileList().filter(function(f){return !f.dir;}).length, ms: Math.round(this._t.treeLoaded - this._t.vaultOpened) });

            // Read app.json
            var appJson = await this._readAppJson();
            this._appJson = appJson;
            this._perm    = AppPermissions.parsePermissions(appJson);   // grant lookup (floor is unconditional)
            this._appId   = '';
            try { if (appJson) this._appId = await AppPermissions.appId(JSON.stringify(appJson)); } catch (_) {}   // consent-cache identity (A4)
            this._t.appJsonFetched = performance.now();
            if (appJson) this._emitVaultEvent('app-json', { label: 'app.json found', entry: appJson.entry || 'index.html', title: appJson.title || '', ms: Math.round(this._t.appJsonFetched - this._t.treeLoaded) });
            else         this._emitVaultEvent('app-json-missing', { label: 'No app.json' });

            // In-vault write token: the vault can carry its own server access token in app.json
            // (`accessToken`, or `auth.token`). Adopt it only when no browser-side token was found,
            // so an app opened straight from its vault key (e.g. a root-inbox deep link, with no
            // token in this tab) can still save. Full-key opens only — a read-only (ro-) open never
            // gains write capability here. NOTE: any holder of the vault read key can decrypt this
            // token, so embedding it means "whoever can read the vault may also write to it".
            var vaultToken = (appJson && (appJson.accessToken || (appJson.auth && appJson.auth.token))) || '';
            if (!isRO && !accessKey && vaultToken) {
                accessKey = String(vaultToken);
                this._applyAccessToken(accessKey);
                this._dataSource._accessKey = accessKey;
                this._dataSource.writable   = true;
                this._writable              = true;
                this._emitVaultEvent('access-token-from-vault', { label: 'Write token loaded from vault app.json' });
            }

            // Update page title
            var appTitle  = appJson && appJson.title  ? appJson.title  : '';
            var vaultName = vault.name || '';
            if (appTitle) document.title = appTitle + ' — SG/App';
            else if (vaultName) document.title = vaultName + ' — SG/App';

            // Notify HUD
            // isRO covers BOTH the crypto tier (ro-token open, no read_key) AND the auth tier
            // (full key but no access token → server rejects writes). The HUD should show
            // "read-only" in either case — surfacing only the crypto state left a key-only
            // open with no token mis-labelled as writable and the chip absent.
            var effectiveRO = isRO || !(this._dataSource && this._dataSource.writable);
            this.dispatchEvent(new CustomEvent('app-shell:ready', {
                bubbles: true, composed: true,
                detail: {
                    vaultName: vaultName, appTitle: appTitle, vaultKey: this._vaultKey,
                    isRO: effectiveRO, perm: this._perm,
                    hudCfg: (appJson && appJson.hud) || null   // see AppHud._resolveHudCfg
                }
            }));

            // Auto-sync parity with /vault: after the app is up, check whether another session
            // published newer commits and fast-forward the view if so (clean-behind only). The
            // 1.5s delay lets the iframe settle first; the check is debounced + a no-op when in sync.
            this._lastBehindCheckTime = 0;
            setTimeout(() => { this._scheduleBehindCheck(0); }, 1500);

            // Auth intercept (auth.required with no cached key and no preset key)
            if (!isRO && !accessKey && appJson && appJson.auth && appJson.auth.required) {
                var vaultId   = vault._vaultId || this._vaultKey;
                var cachedKey = this._getCachedAccessKey(vaultId);
                if (!cachedKey) {
                    await this._showAuthPrompt(vault, appJson);
                    return;  // _showAuthPrompt calls _continue() when key accepted
                }
                this._applyAccessToken(cachedKey);
                this._dataSource = new VaultDataSource(vault, cachedKey);
                this._writable   = true;
            }

            await this._continue(appJson);
        }

        // ── Auto-sync (parity with /vault) ──────────────────────────────────────────────
        // /vault has an auto-sync engine (vault-shell.js _checkAndAutoSync) that auto-PUSHES
        // local commits and auto-PULLS upstream changes, gated by localStorage 'sg-vault-autosync'.
        // /app historically had NEITHER, so app writes (sg.fs.write) committed to the working
        // clone but never pushed → the clone DIVERGED from the named ref → going to /vault showed
        // "↑N to push" and /app refresh showed stale code (a diverged clone can't fast-forward to
        // the published head). Porting the same behaviour, reading the SAME flag, fixes both.
        _isAutoSyncEnabled() {
            try { var v = localStorage.getItem('sg-vault-autosync'); return v === null ? true : v === 'true'; }
            catch (_) { return true; }
        }

        // Debounced auto-push (Commit Queue style): coalesce a burst of app writes into one push
        // ~2.5s after the last write. Skips when read-only, auto-sync off, nothing to push, or
        // diverged (a diverged push would clobber published commits — surface it instead).
        _scheduleAutoPush() {
            if (!this._vault || !this._vault.writable) return;
            if (!this._isAutoSyncEnabled()) { this._surfaceUnpushed('autosync-off'); return; }
            clearTimeout(this._autoPushTimer);
            this._autoPushTimer = setTimeout(() => { this._autoPushNow(); }, 2500);
        }

        async _autoPushNow() {
            if (!this._vault || !this._vault.writable || !this._isAutoSyncEnabled()) return;
            try {
                var ahead = await this._vault.getAheadCount();
                if (!ahead) return;
                // Diverged guard: named advanced under us (another session pushed) AND we have
                // local commits → don't push (would lose their work). Surface + let the behind
                // check fast-forward when it can.
                var liveNamed = await this._vault._refManager.readRef(this._vault._refFileId);
                var diverged  = liveNamed && liveNamed !== this._vault._namedHeadId;
                if (diverged) { this._surfaceUnpushed('diverged'); return; }
                await this._vault.push();
                this._emitVaultEvent('auto-push', { label: 'Auto-pushed ' + ahead + ' commit(s)', count: ahead });
                this._clearUnpushedNotice();
            } catch (e) {
                console.warn('[app-shell] auto-push failed:', e && e.message);
                this._surfaceUnpushed('error');
            }
        }

        // Debounced behind-check: read the live named ref; if the clone is cleanly behind, fast-
        // forward the view (reuse _syncViewToPublishedHead) and remount the app so new code shows.
        _scheduleBehindCheck(delayMs) {
            var DEBOUNCE_MS = 30 * 1000;
            if (Date.now() - (this._lastBehindCheckTime || 0) < DEBOUNCE_MS) return;
            clearTimeout(this._behindCheckTimer);
            this._behindCheckTimer = setTimeout(() => { this._checkBehind(); }, delayMs || 0);
        }

        async _checkBehind() {
            if (!this._vault) return;
            this._lastBehindCheckTime = Date.now();
            try {
                var liveNamed = await this._vault._refManager.readRef(this._vault._refFileId);
                if (!liveNamed || liveNamed === this._vault._namedHeadId) return;   // up to date
                this._vault._namedHeadId = liveNamed;
                // If we have unpushed local commits, this is divergence — surface, don't clobber.
                var ahead = await this._vault.getAheadCount();
                if (ahead > 0) { this._surfaceUnpushed('diverged'); return; }
                // Clean behind → fast-forward the view and remount so the new code renders.
                // _remountCurrent replays the SAME mount the user is looking at (the opened
                // "as an app" file / folder manifest), expanding lazy sub-trees first — the old
                // path re-ran _continue with the stale root app.json + a consumed deep-link, so it
                // remounted the DEFAULT app (or 404'd the entry on the now-lazy sub-tree).
                await this._syncViewToPublishedHead(this._vault);
                try { await this._remountCurrent(); } catch (_) {}
                this._emitVaultEvent('auto-pull', { label: 'View synced to published head', head: liveNamed });
            } catch (_) { /* network errors are silent — retried on next focus */ }
        }

        // ── Inbox check-on-events → host_events-gated push to the app ────────────────────
        // Built only when the mounted app declared an inbox host_event (default-deny). Runs
        // on the same quasi-events as the behind-check (focus, app open). Each emit is filtered
        // through app.json.host_events before it reaches the iframe — an app cannot receive an
        // event it didn't declare. auto_fetch is off here: apps pull ciphertext on demand via
        // sg.inbox.fetch when they get the notification.
        async _initInboxChecker(appJson) {
            this._hostEvents = AppHostEvents.parse(appJson);
            if (typeof SGInbox === 'undefined' || typeof SGInboxChecker === 'undefined' || typeof AppHostEvents === 'undefined') return;
            var wantsInbox = AppHostEvents.allows(this._hostEvents, 'inbox.new-messages')
                          || AppHostEvents.allows(this._hostEvents, 'inbox.error');
            if (!wantsInbox || !this._vault) { this._inboxChecker = null; return; }
            // Reuse the checker across re-mounts of the same vault (seen-set persists).
            if (this._inboxChecker && this._inboxCheckerVaultId === this._vault._vaultId) {
                this._scheduleInboxCheck(0, 'app-remount');
                return;
            }
            var inbox = await this._getInbox();
            if (!inbox) { this._inboxChecker = null; return; }
            var self = this;
            var bus = { emit: function (name, payload) { self._pushHostEvent(name, payload); } };
            this._inboxChecker = new SGInboxChecker(inbox, bus, function () {
                return { enabled: AppHostEvents.allows(self._hostEvents, 'inbox.new-messages'), auto_fetch: false };
            });
            this._inboxCheckerVaultId = this._vault._vaultId;
            this._scheduleInboxCheck(0, 'app-open');
        }

        _scheduleInboxCheck(delayMs, trigger) {
            if (!this._inboxChecker) return;
            var DEBOUNCE_MS = 1000;
            var since = Date.now() - (this._lastInboxCheckTime || 0);
            var wait  = Math.max(delayMs || 0, DEBOUNCE_MS - since);
            var label = trigger || 'visibility';
            clearTimeout(this._inboxCheckTimer);
            this._inboxCheckTimer = setTimeout(() => {
                this._lastInboxCheckTime = Date.now();
                if (this._inboxChecker) this._inboxChecker.check(label);
            }, Math.max(0, wait));
        }

        // Push a kernel event to the app iframe, gated by app.json.host_events.
        _pushHostEvent(name, payload) {
            try {
                if (!AppHostEvents.allows(this._hostEvents, name)) { this._emitBridgeCall('event.' + name, { ok: false, err: 'not in host_events' }); return; }
                var win = this._iframeEl && this._iframeEl.contentWindow;
                if (win) { win.postMessage({ type: 'sg-event', name: name, payload: payload }, '*'); this._emitBridgeCall('event.' + name, { ok: true, pushed: true }); }
            } catch (_) { /* iframe gone / cross-origin — drop */ }
        }

        // Make the "unpushed commits" state VISIBLE — a persistent HUD warning (ttl=null), since
        // the small status pill is easy to miss. Cleared on a successful push.
        _surfaceUnpushed(reason) {
            var hud = document.getElementById('app-hud') || document.querySelector('app-hud');
            if (!hud || typeof hud.showMessage !== 'function') return;
            var text = reason === 'diverged'
                ? 'Unsynced changes — the vault changed elsewhere. Open in the vault view to merge.'
                : (reason === 'autosync-off'
                    ? 'Auto-sync is off — your changes are saved locally but not pushed.'
                    : 'Could not push your changes — they are saved locally. Will retry.');
            hud.showMessage('unpushed', text, 'warn', null);   // null ttl = persistent
        }
        _clearUnpushedNotice() {
            var hud = document.getElementById('app-hud') || document.querySelector('app-hud');
            if (hud && typeof hud.clearMessage === 'function') { try { hud.clearMessage('unpushed'); } catch (_) {} }
        }

        // ── Sync view to published head ────────────────────────────────────────────────
        // SGVault.open() loads the tree from this browser's working clone ref (ref-pid-snw-*),
        // which can be behind the published named ref (ref-pid-muw-*) when commits were pushed
        // from another clone — e.g. the sgit CLI or another browser session. App Mode is a
        // read-only viewer and should always reflect the latest published content, so reload
        // the tree from the named head when the clone is cleanly behind it.
        //
        // No-op when already in sync, or when the clone is ahead / diverged (those keep the
        // working head so previews of unpushed local edits still work). Writes no refs — this
        // is purely a view operation, safe for read-only opens too.
        async _syncViewToPublishedHead(vault) {
            try {
                if (!vault || !vault._namedHeadId) return;
                if (vault._headCommitId === vault._namedHeadId) return;
                // clone head reachable from named head ⇒ clone is a clean ancestor (behind)
                var cloneBehind = await vault._isAncestor(vault._headCommitId, vault._namedHeadId);
                if (!cloneBehind) return;
                await vault._loadTreeFromCommit(vault._namedHeadId);
                vault._headCommitId = vault._namedHeadId;
                this._emitVaultEvent('view-synced', { label: 'View synced to published head', head: vault._namedHeadId });
            } catch (e) {
                console.warn('[app-shell] sync-to-published failed:', e.message);
            }
        }

        async _continue(appJson) {
            // A specific file was requested ("Open as App" on a file, via /#key|app:path or the
            // direct /en-gb/app/#path link form, OR via vault-open's deepLink field in embed
            // mode) — read it now and clear so a reload starts fresh.
            //
            // Embed flow prefers instance memory because sessionStorage throws in null-origin
            // iframes (App Iframe srcdoc parents). The non-embed flow still reads from
            // sessionStorage where the hash handlers put it. The embed deep-link is a raw
            // path (no 'app:' prefix); the legacy session-storage form has the prefix.
            var deepLink = '';
            if (typeof this._embedDeepLink === 'string') {
                deepLink = 'app:' + this._embedDeepLink;
                this._embedDeepLink = null;
            } else {
                try { deepLink = sessionStorage.getItem('sg-vault-deep-link') || ''; } catch (_) {}
                try { sessionStorage.removeItem('sg-vault-deep-link'); } catch (_) {}
            }
            var deepPath = deepLink.indexOf('app:') === 0 ? deepLink.slice(4) : '';

            // The decision (deep-link × app.json present × deep-link is HTML) is delegated to
            // AppNavHelpers.decideMountStrategy — pure, unit-tested. **The bug it fixes**
            // (2026-05-31): a deep-link to ANY HTML file other than the default entry used to
            // fall through to _mountVaultFile (bare file, no app.json resources loaded), so
            // /en-gb/app/#patient/index.html rendered unstyled. Now an HTML deep-link in an
            // app vault routes through _mountApp with the deep-link overriding appJson.entry,
            // so the app's CSS/JS still load.
            var deepIsHtml = deepPath && (deepPath.lastIndexOf('.html') === deepPath.length - 5 ||
                                          deepPath.lastIndexOf('.htm')  === deepPath.length - 4);

            // Per-folder app.json (Bug 2): if the deep-linked HTML lives in a sub-folder that has
            // its OWN app.json, that folder is its own app — use THAT manifest (its resources/
            // auth/hud/permissions/host_events, paths resolved relative to the folder), not the
            // root manifest. "Open as App" on tools/release-tester/index.html now loads
            // tools/release-tester/app.json, not the vault-root app.json.
            if (deepIsHtml && deepPath.indexOf('/') > -1) {
                var folderJson = await this._resolveFolderAppJson(deepPath);
                if (folderJson) {
                    await this._setActiveManifest(folderJson);   // its OWN permissions / host_events / appId
                    await this._mountAppFlow(folderJson);
                    return;
                }
            }

            var decision = AppNavHelpers.decideMountStrategy({ deepPath: deepPath, appJson: appJson });

            if (decision.strategy === 'redirect') {
                // No default app and no file path — App Mode lives on /en-gb/app, not the
                // vault page; bounce there so the user can browse files instead.
                this._mountStrategy = 'redirect';
                var base = window.location.pathname.split('/en-gb/')[0];
                window.location.replace(base + '/en-gb/vault/');
                return;
            }
            if (decision.strategy === 'file') {
                this._mountStrategy   = 'file';
                this._mountedFilePath = decision.filePath;
                await this._mountVaultFile(decision.filePath);
                return;
            }
            // decision.strategy === 'app' — appJson may be the original or a deep-link-
            // overridden clone with .entry set to the requested HTML file.
            await this._mountAppFlow(decision.appJson);
        }

        // Fetch resources for `appJson` and mount it. Records the effective manifest + strategy so
        // an auto-refresh remount (_remountCurrent) replays the SAME app/entry, not the root default.
        async _mountAppFlow(appJson) {
            this._mountStrategy    = 'app';
            this._effectiveAppJson = appJson;
            this._setStatus('Loading resources…');
            var resourcesData = await this._fetchResources(appJson);
            this._t.resourcesLoaded = performance.now();
            this._emitVaultEvent('resources-loaded', { label: 'Resources pre-fetched', cssCount: resourcesData.css.length, jsCount: resourcesData.js.length, ms: Math.round(this._t.resourcesLoaded - (this._t.appJsonFetched || this._t.treeLoaded)) });
            await this._mountApp(appJson, resourcesData);
        }

        // Read a sub-folder's app.json (next to the opened HTML) and resolve it into the manifest
        // to mount. Returns null when the folder has no app.json. Path resolution is the pure
        // AppNavHelpers.resolveFolderManifest (folder-relative resources, entry = the opened file).
        async _resolveFolderAppJson(deepPath) {
            var slash = deepPath.lastIndexOf('/');
            if (slash < 0) return null;
            var folder    = deepPath.slice(0, slash);
            var candidate = folder + '/app.json';
            var fileList  = this._dataSource.getFileList();
            var fileEntry = fileList.find(function (f) { return f.path === candidate; });
            if (!fileEntry) return null;
            try {
                var buf        = await this._dataSource.getFileBytes(fileEntry.path);
                var folderJson = JSON.parse(new TextDecoder().decode(buf));
                return AppNavHelpers.resolveFolderManifest(folderJson, folder, deepPath);
            } catch (e) {
                console.warn('[app-shell] folder app.json parse error at ' + candidate + ':', e.message);
                return null;
            }
        }

        // Make `appJson` the active app manifest — its permissions, host_events, consent identity
        // and title govern the running app. Used when a folder app.json takes over from the root.
        async _setActiveManifest(appJson) {
            this._appJson = appJson;
            this._perm    = AppPermissions.parsePermissions(appJson);
            this._appId   = '';
            try { this._appId = await AppPermissions.appId(JSON.stringify(appJson)); } catch (_) {}
            try { if (typeof AppHostEvents !== 'undefined') this._hostEvents = AppHostEvents.parse(appJson); } catch (_) {}
        }

        // Re-mount the CURRENT view after an auto-pull fast-forward — replays the same strategy
        // (app/file) and the same entry/manifest the user is looking at, NOT the root default.
        // Crucially expands lazy sub-trees first: _syncViewToPublishedHead reloads the tree with
        // sub-folders unloaded, so without this the entry-file lookup (and folder app.json) 404.
        async _remountCurrent() {
            try { await this._dataSource.loadAllSubTrees(); } catch (_) {}
            if (this._mountStrategy === 'file' && this._mountedFilePath) {
                await this._mountVaultFile(this._mountedFilePath);
            } else if (this._effectiveAppJson) {
                await this._mountAppFlow(this._effectiveAppJson);
            } else if (this._appJson) {
                await this._mountAppFlow(this._appJson);
            }
        }


        // ── Entry form (hashless /en-gb/app) ──────────────────────────────────────────

        _showEntryForm() {
            var self = this;

            // Check for a saved backend access key and endpoint to auto-fill
            var savedAccessKey = '';
            var savedEndpoint   = '';
            try { savedAccessKey = localStorage.getItem('sg-backend-access-key') || ''; } catch (_) {}
            try { savedEndpoint   = sessionStorage.getItem('sg-vault-endpoint') || ''; } catch (_) {}

            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: flex; align-items: center; justify-content: center;
                        width: 100%; height: 100%;
                        background: #0a0a18;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    }
                    .ef-card {
                        background: #12122a; border: 1px solid #2a2a4a; border-radius: 10px;
                        padding: 2rem; width: 100%; max-width: 440px; box-sizing: border-box;
                        margin: 1rem;
                    }
                    .ef-brand { font-size: 1.25rem; font-weight: 700; color: #e2e8f0; margin-bottom: 0.25rem; }
                    .ef-brand span { color: #4ECDC4; }
                    .ef-subtitle { font-size: 0.8rem; color: #4a5568; margin-bottom: 1.75rem; }
                    .ef-label { display: block; font-size: 0.8rem; font-weight: 600; color: #8892a4; margin-bottom: 0.4rem; }
                    .ef-input {
                        width: 100%; padding: 0.6rem 0.75rem; background: #0a0a18;
                        border: 1px solid #2a2a4a; border-radius: 5px;
                        color: #e2e8f0; font-size: 0.875rem; font-family: monospace;
                        outline: none; box-sizing: border-box; transition: border-color 0.15s;
                    }
                    .ef-input:focus { border-color: #4ECDC4; box-shadow: 0 0 0 2px rgba(78,205,196,0.15); }
                    .ef-hint { font-size: 0.75rem; color: #4a5568; margin-top: 0.35rem; }
                    .ef-mode-badge {
                        display: inline-block; font-size: 0.7rem; padding: 0.1rem 0.45rem;
                        border-radius: 9999px; margin-top: 0.35rem; font-weight: 600;
                    }
                    .ef-mode-full { background: rgba(78,205,196,0.12); color: #4ECDC4; border: 1px solid rgba(78,205,196,0.3); }
                    .ef-mode-ro   { background: rgba(100,160,220,0.12); color: #64a0dc; border: 1px solid rgba(100,160,220,0.25); }
                    .ef-section-toggle {
                        display: flex; align-items: center; gap: 0.4rem;
                        margin-top: 1.25rem; cursor: pointer;
                        font-size: 0.8rem; font-weight: 600; color: #6a7888;
                        background: none; border: none; padding: 0; text-align: left; width: 100%;
                    }
                    .ef-section-toggle:hover { color: #8892a4; }
                    .ef-toggle-arrow { font-size: 0.65rem; transition: transform 0.15s; }
                    .ef-toggle-arrow.open { transform: rotate(90deg); }
                    .ef-access-section { display: none; margin-top: 0.75rem; }
                    .ef-access-section.open { display: block; }
                    .ef-saved-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem; }
                    .ef-saved-badge { font-size: 0.7rem; color: #4ECDC4; white-space: nowrap; }
                    .ef-clear-btn {
                        font-size: 0.7rem; color: #4a5568; background: none; border: none;
                        cursor: pointer; padding: 0; text-decoration: underline;
                    }
                    .ef-clear-btn:hover { color: #ff6b6b; }
                    .ef-remember { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; font-size: 0.8rem; color: #6a7888; cursor: pointer; }
                    .ef-err { margin-top: 0.75rem; color: #ff6b6b; font-size: 0.8rem; min-height: 1rem; }
                    .ef-submit {
                        margin-top: 1.5rem; width: 100%; padding: 0.7rem;
                        background: #4ECDC4; border: none; border-radius: 5px;
                        color: #0a0a18; font-weight: 700; font-size: 0.9rem;
                        cursor: pointer; transition: background 0.15s;
                    }
                    .ef-submit:hover:not(:disabled) { background: #3dbdb5; }
                    .ef-submit:disabled { opacity: 0.55; cursor: default; }
                    .ef-vault-link { display: block; margin-top: 1rem; text-align: center; font-size: 0.75rem; color: #4a5568; }
                    .ef-vault-link a { color: #6a7888; text-decoration: none; }
                    .ef-vault-link a:hover { color: #4ECDC4; }
                </style>
                <div class="ef-card">
                    <div class="ef-brand">SG<span>/</span>App</div>
                    <div class="ef-subtitle">Open a vault-hosted app</div>

                    <label class="ef-label" for="ef-key-input">Vault key or read-only token</label>
                    <input id="ef-key-input" class="ef-input" type="text"
                        placeholder="apple-river-1234  or  ro-coral-stamp-5678"
                        autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
                    <div class="ef-hint">Paste a full vault key for read+write, or a read-only token (ro-…) for view-only access.</div>
                    <div class="ef-mode-indicator"></div>

                    <button class="ef-section-toggle" type="button" id="ef-access-toggle">
                        <span class="ef-toggle-arrow" id="ef-toggle-arrow">&#9654;</span>
                        Backend access key <span style="font-weight:400;color:#4a5568">(optional)</span>
                    </button>
                    <div class="ef-access-section${savedAccessKey ? ' open' : ''}" id="ef-access-section">
                        <label class="ef-label" for="ef-access-input" style="margin-top:0.5rem">Access key</label>
                        <input id="ef-access-input" class="ef-input" type="password"
                            placeholder="e.g. apple-river-1234"
                            autocomplete="off">
                        ${savedAccessKey ? '<div class="ef-saved-row"><span class="ef-saved-badge">&#10003; saved locally</span><button class="ef-clear-btn" id="ef-clear-btn" type="button">Clear saved key</button></div>' : ''}
                        <label class="ef-remember">
                            <input type="checkbox" id="ef-remember-check"${savedAccessKey ? ' checked' : ''}>
                            Remember on this device
                        </label>
                        <div class="ef-hint" style="margin-top:0.5rem">
                            Controls server-side write permission. Separate from the vault encryption key.
                        </div>
                        <label class="ef-label" for="ef-endpoint-input" style="margin-top:0.85rem">Server endpoint</label>
                        <input id="ef-endpoint-input" class="ef-input" type="url"
                            value="${savedEndpoint}"
                            placeholder="https://dev.send.sgraph.ai"
                            autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
                        <div class="ef-hint">Leave blank to use the default backend (dev.send.sgraph.ai).</div>
                    </div>

                    <div class="ef-err" id="ef-err"></div>
                    <button class="ef-submit" id="ef-submit" type="button">Open vault</button>
                    <div class="ef-vault-link">Vault interface: <a href="/en-gb/vault/" target="_blank">Open SG/Vault &#8599;</a></div>
                </div>
            `;

            var root        = this.shadowRoot;
            var keyInput    = root.getElementById('ef-key-input');
            var modeEl      = root.querySelector('.ef-mode-indicator');
            var toggle      = root.getElementById('ef-access-toggle');
            var arrow       = root.getElementById('ef-toggle-arrow');
            var section     = root.getElementById('ef-access-section');
            var accessInput   = root.getElementById('ef-access-input');
            var endpointInput = root.getElementById('ef-endpoint-input');
            var rememberCh  = root.getElementById('ef-remember-check');
            var errEl       = root.getElementById('ef-err');
            var submitBtn   = root.getElementById('ef-submit');
            var clearBtn    = root.getElementById('ef-clear-btn');

            // Auto-fill saved access key into password field
            if (savedAccessKey && accessInput) accessInput.value = savedAccessKey;

            // Auto-expand access section if there's a saved key
            if (savedAccessKey && arrow) arrow.classList.add('open');

            // Mode badge as user types the vault key
            keyInput.addEventListener('input', function () {
                var v = keyInput.value.trim();
                if (!v || !modeEl) { if (modeEl) modeEl.innerHTML = ''; return; }
                if (v.startsWith('ro-')) {
                    modeEl.innerHTML = '<span class="ef-mode-badge ef-mode-ro">&#128065; Read-only token</span>';
                } else if (v.indexOf('-') > 0 || (v.indexOf(':') > 0 && !/\s/.test(v))) {
                    modeEl.innerHTML = '<span class="ef-mode-badge ef-mode-full">&#128273; Full vault key</span>';
                } else {
                    modeEl.innerHTML = '';
                }
            });

            // Toggle access key section
            toggle.addEventListener('click', function () {
                var open = section.classList.toggle('open');
                arrow.classList.toggle('open', open);
                if (open && accessInput) accessInput.focus();
            });

            // Clear saved key
            if (clearBtn) {
                clearBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    try { localStorage.removeItem('sg-backend-access-key'); } catch (_) {}
                    if (accessInput) accessInput.value = '';
                    if (rememberCh)  rememberCh.checked = false;
                    clearBtn.remove();
                    var badge = root.querySelector('.ef-saved-badge');
                    if (badge) badge.remove();
                });
            }

            // Submit handler
            var doSubmit = function () {
                var vaultKey  = keyInput.value.trim();
                var accessKey = accessInput ? accessInput.value.trim() : '';
                var remember  = rememberCh  ? rememberCh.checked       : false;
                errEl.textContent = '';

                var customEndpoint = endpointInput ? endpointInput.value.trim() : '';

                if (!vaultKey) {
                    errEl.textContent = 'Please enter a vault key or read-only token.';
                    keyInput.focus();
                    return;
                }

                // Persist endpoint override
                try {
                    if (customEndpoint) sessionStorage.setItem('sg-vault-endpoint', customEndpoint);
                    else sessionStorage.removeItem('sg-vault-endpoint');
                } catch (_) {}

                // Persist / clear access key based on remember checkbox
                if (accessKey) {
                    if (remember) {
                        try { localStorage.setItem('sg-backend-access-key', accessKey); } catch (_) {}
                    } else {
                        try { localStorage.removeItem('sg-backend-access-key'); } catch (_) {}
                    }
                }

                submitBtn.disabled = true;
                self._showLoading('Opening vault…');

                self._initWithKey(vaultKey, accessKey || null).catch(function (err) {
                    console.error('[app-shell] initWithKey failed:', err);
                    // Re-show entry form with error message pre-populated
                    self._showEntryForm();
                    var newErr = self.shadowRoot.getElementById('ef-err');
                    if (newErr) newErr.textContent = err.message;
                    var newKey = self.shadowRoot.getElementById('ef-key-input');
                    if (newKey) { newKey.value = vaultKey; newKey.dispatchEvent(new Event('input')); }
                });
            };

            submitBtn.addEventListener('click', doSubmit);
            keyInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSubmit(); });
            if (accessInput) accessInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSubmit(); });

            keyInput.focus();
        }


        // ── Credential helpers ────────────────────────────────────────────────────────

        // Resolve `ro-word-word-NNNN` → read creds. The encrypted { vault_id, read_key,
        // ref_file_id } payload lives at a deterministic transfer-id derived from the
        // (bare) token; download it and decrypt with the token as PBKDF2 passphrase.
        async _resolveROToken(sgSend, token) {
            var endpoint   = sgSend.endpoint || window.location.origin;
            var bare       = String(token || '').replace(/^ro-/, '');
            var transferId = await SGVaultCrypto.deriveRoTokenTransferId(bare);
            var resp = await fetch(endpoint + '/api/transfers/download/' + encodeURIComponent(transferId));
            if (!resp.ok) throw new Error('RO token not found or expired (HTTP ' + resp.status + ')');
            var cipherBytes = new Uint8Array(await resp.arrayBuffer());

            var enc         = new TextEncoder();
            var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(bare), 'PBKDF2', false, ['deriveKey']);
            var aesKey      = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: enc.encode('sgraph-ro-token-v1'), iterations: 100000, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            var iv    = cipherBytes.slice(0, 12);
            var ct    = cipherBytes.slice(12);
            var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, ct);
            var p     = JSON.parse(new TextDecoder().decode(plain)); // stored snake_case
            return { vaultId: p.vault_id, readKeyB64: p.read_key, refFileId: p.ref_file_id };
        }

        _getCachedAccessKey(vaultId) {
            try {
                return localStorage.getItem('sg-access-key:' + vaultId) ||
                       sessionStorage.getItem('sg-access-key:' + vaultId) || null;
            } catch (_) { return null; }
        }

        // Resolve a server access token for this vault, in priority order:
        //   per-vault cache → /vault-mode shared token → generic backend key.
        _resolveAccessToken(vaultId) {
            var t = this._getCachedAccessKey(vaultId);
            if (t) return t;
            // Parity with /vault mode: VaultLoaderStorage (vault-loader-storage.js) keeps the server
            // access token under these keys. /vault and /app are the same origin, so a token the user
            // established in /vault mode authorises writes here too. That module is not loaded on the
            // /app page, so read the raw keys directly rather than calling VaultLoaderStorage.
            try {
                var shared = sessionStorage.getItem('sg-vault-access-key')
                          || localStorage.getItem('sg-vault-access-key-saved');
                if (shared) return shared;
            } catch (_) {}
            try { return localStorage.getItem('sg-backend-access-key') || null; } catch (_) { return null; }
        }

        // ── Embedded access token (.vault/access-token.json) ────────────────────────────
        // A backend access token can live INSIDE the vault, encrypted under read_key and under
        // the .vault/** floor (so a sandboxed app can't read it via the bridge — only the kernel
        // does, to authorise writes). This lets a KEY-ONLY link/QR open writable: the holder has
        // the vault key (reads), the embedded token upgrades to writes. The token is NEVER in the
        // URL. A vault without this file opens read-only from a key-only link (today's behaviour).
        async _readEmbeddedAccessToken(vault) {
            try {
                // `.vault` is a lazy sub-tree after open (listFolder returns [] until expanded),
                // so expand it on demand before reading — otherwise the token is missed and the
                // app opens read-only despite the embedded token being present.
                if (vault.needsLoading && vault.needsLoading('/.vault')) {
                    await vault.loadSubTreeOnDemand('/.vault');
                }
                var listed = vault.listFolder('/.vault') || [];
                if (!listed.some(function (e) { return e.name === 'access-token.json'; })) return null;
                var bytes = await vault.getFile('/.vault', 'access-token.json');   // read_key decrypt
                var obj   = JSON.parse(new TextDecoder().decode(bytes));
                return (obj && obj.token) ? String(obj.token) : null;
            } catch (_) { return null; }
        }

        async _writeEmbeddedAccessToken(vault, token, source) {
            if (!vault || !vault.writable) throw Object.assign(new Error('Read-only vault'), { code: 'EREADONLY' });
            if (!vault.listFolder('/.vault')) { try { await vault.createFolder('/.vault'); } catch (_) {} }
            var rec   = { token: String(token), created: Date.now(), source: source || 'explicit' };
            var bytes = new TextEncoder().encode(JSON.stringify(rec));
            var exists = (vault.listFolder('/.vault') || []).some(function (e) { return e.name === 'access-token.json'; });
            if (exists) await vault.updateFile('/.vault', 'access-token.json', bytes);
            else        await vault.addFile('/.vault', 'access-token.json', bytes);
        }

        // Resolve a create/setAccessToken `accessToken` option to a concrete token string.
        //   'inherit'    → this (parent/doctor) vault's current access token
        //   '<explicit>' → use the supplied token string as-is
        //   'new'        → ENOTIMPL (mint endpoint exists but uses a separate API-key workflow,
        //                  not wired here — use 'inherit' or an explicit token for now)
        _resolveEmbedToken(spec) {
            if (spec === 'inherit') {
                var t = (this._dataSource && this._dataSource._accessKey)
                        || this._resolveAccessToken(this._vault && this._vault._vaultId);
                if (!t) throw Object.assign(new Error('nothing to inherit — this vault has no access token'), { code: 'ENOTOKEN' });
                return t;
            }
            if (spec === 'new') throw Object.assign(new Error("accessToken:'new' not wired yet — use 'inherit' or an explicit token"), { code: 'ENOTIMPL' });
            if (typeof spec === 'string' && spec) return spec;
            return null;
        }

        // Thread the access token onto the vault's transport so write PUTs carry
        // x-sgraph-access-token. The VaultDataSource accessKey only flips the `writable`
        // flag; the actual write requests authorise via vault._sgSend.token (read at request
        // time by SGSend._authHeaders). Without this, writes 401 "Access token required".
        _applyAccessToken(token) {
            try { if (token && this._vault && this._vault._sgSend) this._vault._sgSend.token = token; }
            catch (_) {}
        }

        // Combined per-verb gate for the iframe bridge: the §3.4 floor (non-grantable) THEN the
        // app.json grant (§3.2/3.3). verb is 'fs.read' | 'fs.write' | 'fs.move' | 'fs.delete' |
        // 'fs.mkdir' | 'vault.create' | 'vault.unlink' | 'vault.delete'. Consent for the powerful
        // vault verbs is layered on top in Phase 4. Fails safe (deny) on any error.
        _can(verb, path) {
            try {
                var act = verb.indexOf('.') > -1 ? verb.slice(verb.indexOf('.') + 1) : verb;
                if (AppPermissions.isFloor(act, path)) return false;
                return AppPermissions.can(this._perm, verb, path);
            } catch (_) { return false; }
        }

        // Lazily build (and cache per vault) the SGInbox transport for the open vault.
        // enum_key is derived from the read_key's raw bytes (owner sessions; RO sessions
        // get a null enum_key and the read verbs fail closed). Re-derives if the vault changed.
        async _getInbox() {
            var vault = this._vault;
            if (!vault || typeof SGInbox === 'undefined') return null;
            if (this._inbox && this._inboxVaultId === vault._vaultId) return this._inbox;
            var sgSend   = vault._sgSend || null;
            var endpoint = (sgSend && sgSend.endpoint)
                || (window.SG_ENDPOINT
                    || (function () { try { return sessionStorage.getItem('sg-vault-endpoint'); } catch (_) { return null; } })()
                    || 'https://dev.send.sgraph.ai');
            var rawBytes = await vault.readKeyRawBytes();
            var enumKey  = rawBytes ? await SGInbox.deriveEnumKey(rawBytes) : null;
            this._inbox = new SGInbox({
                endpoint:    endpoint,
                vaultId:     vault._vaultId,
                enumKey:     enumKey,
                writeKeyHex: vault.writeKeyHex,
                accessToken: (sgSend && sgSend.token) || null
            });
            this._inboxVaultId = vault._vaultId;
            return this._inbox;
        }

        // Consent cache key — scoped by (vault, app identity, verb) so a different app in the same
        // vault never inherits a prior app's consent (A4). Single source of truth for _can-layered
        // consent and the HUD chip/panel.
        _consentCacheKey(verb) {
            var vaultId = (this._vault && this._vault._vaultId) || this._vaultKey || '';
            return 'sg-app-grant:' + vaultId + ':' + (this._appId || '') + ':' + verb;
        }

        // Resolve consent for a powerful verb. One-time per (vault, app, verb), cached in
        // localStorage; vault.delete ALWAYS re-confirms (irreversible). The prompt is rendered on
        // the HUD (host chrome, §3.5) — the sandboxed app cannot satisfy it. Serialised so two
        // concurrent requests don't collide on the single HUD slot (A10).
        async _consent(verb, path) {
            // Effective policy: app.json permissions.consent[verb] overrides the per-verb default.
            //   default 'always' for key-return / destroy; 'once' for the rest.
            //   'auto' → no prompt (the app.json author opted into trusting the grant alone).
            var policy = (this._perm && this._perm.consent && this._perm.consent[verb]) || null;
            var defaultAlways = (verb === 'vault.delete' || verb === 'vault.createKey');
            var mode = policy || (defaultAlways ? 'always' : 'once');
            if (mode === 'auto') return true;                              // pre-granted in app.json — no prompt
            var ckey = this._consentCacheKey(verb);
            if (mode === 'once') { try { if (localStorage.getItem(ckey) === '1') return true; } catch (_) {} }
            var granted = await this._hudConsent(verb, path);
            if (granted && mode === 'once') { try { localStorage.setItem(ckey, '1'); } catch (_) {} }
            return granted;
        }

        _hudConsent(verb, path) {
            var run = function () {
                return new Promise(function (resolve) {
                    var hud = document.getElementById('app-hud') || document.querySelector('app-hud');
                    if (!hud || typeof hud.requestConsent !== 'function') { resolve(false); return; }
                    hud.requestConsent(verb, path, function (ok) { resolve(!!ok); });
                });
            };
            var next = (this._consentQueue || Promise.resolve()).then(run, run);
            this._consentQueue = next.catch(function () {});
            return next;
        }

        // ── Vault lifecycle helpers (vault.create / vault.unlink) ───────────────────────
        // High-entropy passphrase that NEVER matches the simple-token shape ^[a-z]+-[a-z]+-\d{4}$,
        // so SGVault.open derives via the strong PBKDF2 path (proper vault key, never a simple token).
        _genVaultPassphrase() {
            var b = crypto.getRandomValues(new Uint8Array(20)), s = '';
            for (var i = 0; i < b.length; i++) s += b[i].toString(36);
            return 'k' + s;
        }
        _genRefId() {
            var b = crypto.getRandomValues(new Uint8Array(6)), hex = '';
            for (var i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
            return 'lk-' + hex;
        }
        _slugify(label) {
            var s = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            return s || ('link-' + Math.random().toString(36).slice(2, 8));
        }

        // ── Owner-secret store (owner-tier custody for child write-keys) ─────────────
        // Secrets live at .vault/owner/secrets/<ref>.json, sealed with a key derived from
        // THIS vault's write_key (SGVaultOwnerSecrets). RO sessions (write_key=null) cannot
        // derive the key → cannot open them. The outer vault-file read_key encryption is
        // incidental; the inner seal provides the owner tier. Distinct from ro-links.json
        // (read-tier, readable by any parent reader).
        _secretsFolder() { return '/.vault/owner/secrets'; }

        async _ownerSecretKey() {
            if (this._ownerSecretCryptoKey) return this._ownerSecretCryptoKey;
            var wk = this._vault && this._vault.writeKeyHex;
            if (!wk) throw Object.assign(new Error('Read-only: owner secrets unavailable'), { code: 'EREADONLY' });
            this._ownerSecretCryptoKey = await SGVaultOwnerSecrets.deriveKey(wk);
            return this._ownerSecretCryptoKey;
        }

        async _ensureSecretsFolder() {
            var v = this._vault, parts = ['.vault', 'owner', 'secrets'], cur = '';
            for (var i = 0; i < parts.length; i++) {
                var next = cur ? cur + '/' + parts[i] : parts[i];
                if (!v.listFolder('/' + next)) { try { await v.createFolder('/' + next); } catch (_) {} }
                cur = next;
            }
        }

        async _ownerSecretPut(refId, secret) {
            var v = this._vault;
            if (!v || !v.writable) throw Object.assign(new Error('Read-only vault'), { code: 'EREADONLY' });
            var key = await this._ownerSecretKey();
            var rec = await SGVaultOwnerSecrets.seal(key, secret);
            await this._ensureSecretsFolder();
            var folder = this._secretsFolder(), name = refId + '.json';
            var bytes  = new TextEncoder().encode(JSON.stringify(rec));
            var exists = (v.listFolder(folder) || []).some(function (e) { return e.name === name; });
            if (exists) await v.updateFile(folder, name, bytes); else await v.addFile(folder, name, bytes);
            if (typeof v.push === 'function') { try { await v.push(); } catch (_) {} }
        }

        async _ownerSecretGet(refId) {
            var v = this._vault, folder = this._secretsFolder(), name = refId + '.json';
            if (!(v.listFolder(folder) || []).some(function (e) { return e.name === name; })) return null;
            var bytes = await v.getFile(folder, name);               // read_key (outer) decrypt
            var rec   = JSON.parse(new TextDecoder().decode(bytes));
            var key   = await this._ownerSecretKey();
            return await SGVaultOwnerSecrets.open(key, rec);         // owner-tier (inner) decrypt
        }

        async _ownerSecretList() {
            var v = this._vault, folder = this._secretsFolder(), out = [], key;
            try { key = await this._ownerSecretKey(); } catch (_) { return out; }
            var listed = v.listFolder(folder) || [];
            for (var i = 0; i < listed.length; i++) {
                var e = listed[i];
                if (e.type !== 'file' || !/\.json$/.test(e.name)) continue;
                try {
                    var bytes = await v.getFile(folder, e.name);
                    var sec   = await SGVaultOwnerSecrets.open(key, JSON.parse(new TextDecoder().decode(bytes)));
                    out.push({ ref_id: e.name.replace(/\.json$/, ''), vault_id: sec.vault_id, label: sec.label });
                } catch (_) {}
            }
            return out;
        }

        async _ownerSecretRemove(refId) {
            var v = this._vault, folder = this._secretsFolder(), name = refId + '.json';
            if ((v.listFolder(folder) || []).some(function (e) { return e.name === name; })) {
                await v.removeFile(folder, name);
                if (typeof v.push === 'function') { try { await v.push(); } catch (_) {} }
            }
        }

        // ── Create a child vault (read-through link / standalone / return-key / seedFrom) ──
        // opts = { label, link:{path}|false, returnKey:bool, custody:bool(default true),
        //          seedFrom, accessToken:'inherit'|'<explicit>'|undefined }
        // The returned `key` (when requested) is the OPENABLE composed form `passphrase:vault_id`
        // — the bare passphrase has no colon and would fail SGVaultCrypto.parseVaultKey.
        // accessToken embeds a backend token in the new vault (.vault/access-token.json) so a
        // key-only link opens it WRITABLE — the token is never put in the link.
        async _createChildVault(opts) {
            opts = opts || {};
            var parentVault = this._vault, sgSend = parentVault && parentVault._sgSend;
            if (!sgSend || typeof SGVault === 'undefined') throw new Error('Cannot create vaults here');
            var label     = String(opts.label || 'vault');
            var wantsLink = !!(opts.link && opts.link.path != null);
            var wantsKey  = !!opts.returnKey;
            var custody   = opts.custody !== false;                 // default: kernel custodies the key
            if (!wantsLink && !wantsKey && !custody) throw Object.assign(new Error('unreachable vault: needs link, returnKey, or custody'), { code: 'EINVAL' });

            // Resolve the embed token BEFORE creating (fail fast on a bad 'inherit'/'new').
            var embedToken = opts.accessToken ? this._resolveEmbedToken(opts.accessToken) : null;

            var passphrase = this._genVaultPassphrase();            // strong shape; never simple-token
            var child      = await SGVault.create(sgSend, passphrase, { name: label });
            var vaultId    = child._vaultId;
            var key        = child._passphrase + ':' + child._vaultId;   // composed openable key
            var refId      = this._genRefId();

            if (embedToken) {
                await this._writeEmbeddedAccessToken(child, embedToken, opts.accessToken === 'inherit' ? 'inherit' : 'explicit');
            }

            if (opts.seedFrom) {
                try { await this._seedVaultTree(child, opts.seedFrom); }
                catch (e) { console.warn('[app-shell] seedFrom failed:', e && e.message); }
            }

            // Publish the child (embedded token + any seed) to its named ref so a fresh open elsewhere
            // sees them. _seedVaultTree also pushes; a re-push of the same head is harmless.
            if (embedToken && typeof child.push === 'function') { try { await child.push(); } catch (_) {} }

            var result = { vault_id: vaultId, ref_id: refId };

            if (custody) {
                try { await this._ownerSecretPut(refId, { vault_id: vaultId, key: key, label: label, created: Date.now() }); }
                catch (e) { if (!wantsKey) throw e; }               // if returning the key, custody failure is non-fatal
            }

            if (wantsLink) {
                var dir = opts.link.path ? ('/' + AppPermissions.normalizePath(opts.link.path)) : '/';
                if (dir !== '/' && !parentVault.listFolder(dir)) { try { await this._dataSource.createFolder(dir); } catch (_) {} }
                var fileName = this._slugify(label) + '.link.json';
                var linkObj  = { vault_id: vaultId, ref_id: refId, label: label };
                await this._dataSource.saveFile(dir, fileName, new TextEncoder().encode(JSON.stringify(linkObj, null, 2)).buffer);
                var rawRk  = new Uint8Array(await crypto.subtle.exportKey('raw', child._readKey));
                var record = { type: 'vault', label: label, pin: { mode: 'latest' }, vault_id: vaultId,
                               read_key: btoa(String.fromCharCode.apply(null, rawRk)), ref_file_id: child._refFileId };
                await VaultLinks.saveRoRecord(parentVault, refId, record);   // read-tier owner record; commits + pushes
                if (this._dataSource.scan) { try { await this._dataSource.scan(); } catch (_) {} }
                result.ref_file_id = child._refFileId;
            }

            if (wantsKey) result.key = key;                         // raw key returned only on demand
            result.writable_link = !!embedToken;                    // key-only link opens writable
            return result;
        }

        // Retrieve a custodied key to re-share. As powerful as createKey → consent always re-confirms.
        async _getVaultKey(refId) {
            var sec = await this._ownerSecretGet(String(refId));
            if (!sec || !sec.key) throw Object.assign(new Error('no key on file for ' + refId), { code: 'ENOKEY' });
            return { key: sec.key };
        }

        // Set / rotate the embedded access token of a vault (Q4). ref = a custodied ref_id
        // (resolved kernel-side via the owner-secret store) or a raw key. value = 'inherit' or an
        // explicit token. Opens the target writable, writes .vault/access-token.json, pushes.
        async _setVaultAccessToken(ref, value) {
            var token = this._resolveEmbedToken(value);
            if (!token) throw Object.assign(new Error('no token to set'), { code: 'EINVAL' });
            var key = (ref && String(ref).indexOf(':') > -1) ? String(ref) : null;
            if (!key) { var sec = await this._ownerSecretGet(String(ref)); key = sec && sec.key; }
            if (!key) throw Object.assign(new Error('cannot resolve vault for ' + ref), { code: 'ENOKEY' });
            var target = await SGVault.open(this._vault._sgSend, key);
            await this._writeEmbeddedAccessToken(target, token, value === 'inherit' ? 'inherit' : 'explicit');
            if (typeof target.push === 'function') { try { await target.push(); } catch (_) {} }
            return { set: true, vault_id: target._vaultId };
        }

        // Launch a vault as an app. A raw key (contains ':') is used directly; a ref is resolved
        // from the owner-secret store kernel-side (the key never crosses the iframe boundary).
        async _openAppVault(ref, opts) {
            opts = opts || {};
            var key = (ref && String(ref).indexOf(':') > -1) ? String(ref) : null;
            if (!key) { var sec = await this._ownerSecretGet(String(ref)); key = sec && sec.key; }
            if (!key) throw Object.assign(new Error('cannot resolve key for ' + ref), { code: 'ENOKEY' });
            var url = location.origin + '/en-gb/app/#' + encodeURIComponent(key) +
                      (opts.deepLink ? ('/' + String(opts.deepLink).replace(/^\//, '')) : '');
            if (opts.target === 'replace') { location.href = url; return { opened: 'replace' }; }
            if (opts.target === 'embed')   { throw Object.assign(new Error('embed target deferred'), { code: 'ENOTIMPL' }); }
            window.open(url, '_blank');
            return { opened: 'tab' };
        }

        // Roster: custodied secrets (owner-tier, rw) ∪ read-through links (read-tier, ro).
        async _listChildVaults() {
            var self = this;
            var rows = await this._ownerSecretList();
            var seen = {}, out = rows.map(function (r) { seen[r.ref_id] = true; return { ref_id: r.ref_id, vault_id: r.vault_id, label: r.label, tier: 'rw' }; });
            try {
                var links = await VaultLinks.loadRoLinks(self._vault).catch(function () { return {}; });
                Object.keys(links || {}).forEach(function (refId) {
                    if (seen[refId]) return;
                    var rec = links[refId] || {};
                    out.push({ ref_id: refId, vault_id: rec.vault_id || null, label: rec.label || refId, tier: 'ro' });
                });
            } catch (_) {}
            return out;
        }

        // Destroy a child vault. Key custody is solved (owner-secret store); the server-side
        // teardown requires SGVault.destroy() — if absent, the custody record + link are removed
        // and { server_teardown:false } is reported (the server vault is retained until the
        // teardown endpoint ships — see the dev plan §16 server dependency).
        async _deleteChildVault(refId) {
            var sec = await this._ownerSecretGet(String(refId));
            var serverTeardown = false;
            if (sec && sec.key) {
                try {
                    var child = await SGVault.open(this._vault._sgSend, sec.key);
                    if (typeof child.destroy === 'function') { await child.destroy(); serverTeardown = true; }
                } catch (e) { console.warn('[app-shell] vault.delete server teardown failed:', e && e.message); }
            }
            await this._ownerSecretRemove(String(refId));
            return { deleted: true, vault_id: sec && sec.vault_id, server_teardown: serverTeardown };
        }

        // ── seedFrom: copy a template tree into the freshly-created (writable) child ──────
        // source 'self:<path>' → a folder in THIS vault; '<ref_id>' → a custodied/linked
        // source; '<raw key>' (contains ':') → open read-only by possession (Q4). The walk
        // SKIPS any .vault/** segment so a template copy can never exfiltrate owner secrets.
        async _seedVaultTree(childVault, source) {
            var src = String(source || ''), entries;
            if (src.indexOf('self:') === 0) {
                entries = await this._collectTree(this._vault, AppPermissions.normalizePath(src.slice(5)));
            } else {
                entries = await this._collectTree(await this._resolveReadableVault(src), '');
            }
            for (var i = 0; i < entries.length; i++) {
                var rel = entries[i].relPath, slash = rel.lastIndexOf('/');
                var dir = slash > 0 ? '/' + rel.slice(0, slash) : '/', name = slash > 0 ? rel.slice(slash + 1) : rel;
                if (dir !== '/' && !childVault.listFolder(dir)) { try { await childVault.createFolder(dir); } catch (_) {} }
                try { await childVault.addFile(dir, name, entries[i].bytes); }
                catch (_) { try { await childVault.updateFile(dir, name, entries[i].bytes); } catch (__) {} }
            }
            // addFile commits to the child's CLONE ref only — push so the seeded content is on
            // the child's published (named) ref, i.e. visible to anyone who opens the new vault.
            if (entries.length && typeof childVault.push === 'function') { try { await childVault.push(); } catch (_) {} }
        }

        // Walk a vault's tree under basePath → [{ relPath, bytes }]; skips .vault/** (floor).
        async _collectTree(vault, basePath) {
            var out = [], stack = [{ abs: basePath ? ('/' + basePath) : '/', rel: '' }];
            while (stack.length) {
                var node = stack.pop(), listed = vault.listFolder(node.abs) || [];
                for (var i = 0; i < listed.length; i++) {
                    var e = listed[i], rel = node.rel ? node.rel + '/' + e.name : e.name;
                    if (AppPermissions.hasVaultSegment(rel)) continue;          // floor
                    var abs = node.abs === '/' ? '/' + e.name : node.abs + '/' + e.name;
                    if (e.type === 'folder') { stack.push({ abs: abs, rel: rel }); }
                    else { try { out.push({ relPath: rel, bytes: await vault.getFile(node.abs, e.name) }); } catch (_) {} }
                }
            }
            return out;
        }

        // Resolve a ref_id or raw key to a readable SGVault (raw key = possession authority, Q4).
        async _resolveReadableVault(refOrKey) {
            var s = String(refOrKey);
            if (s.indexOf(':') > -1) return await SGVault.open(this._vault._sgSend, s);
            var sec = await this._ownerSecretGet(s);
            if (sec && sec.key) return await SGVault.open(this._vault._sgSend, sec.key);
            var link = await VaultLinks.effectiveLink(this._vault, s).catch(function () { return null; });
            if (link && link.read_key) return await SGVault.openReadOnly(this._vault._sgSend, link.vault_id, link.read_key, link.ref_file_id);
            throw Object.assign(new Error('cannot resolve source vault: ' + s), { code: 'ENOKEY' });
        }

        // Remove a sub-vault pointer (the <name>.link.json). The child vault stays on the server
        // (reversible). The orphaned read-tier owner record is harmless and left in place.
        async _unlinkChildVault(path) {
            var norm  = AppPermissions.normalizePath(path);
            var slash = norm.lastIndexOf('/');
            var dir   = slash > 0 ? '/' + norm.slice(0, slash) : '/';
            var name  = norm.slice(slash + 1);
            await this._dataSource.deleteFile(dir, name);
            if (this._dataSource.scan) { try { await this._dataSource.scan(); } catch (_) {} }
            return { unlinked: true };
        }

        // Print the running app (HUD print button).
        //
        // The app iframe is sandboxed with allow-same-origin, so the parent can read
        // iframe.contentDocument. We clone the live DOM, then rewrite every blob: URL
        // to a data: URI — blob URLs are scoped to the iframe's window and would die
        // in the print window, so they must be inlined. The result is a self-contained
        // Print is now an RPC into the iframe: ViV Phase 3 flipped app frames to null-origin
        // srcdoc, so iframe.contentDocument throws SecurityError from the parent (the previous
        // implementation worked under same-origin blob: frames and broke silently after Phase 3
        // — Commit A hid the button by default; this restores it).
        //
        // The iframe-side listener (see _buildVfsBridgeScript: __sgPrintReq) does the DOM clone,
        // the blob:→data: URL inlining (which has to happen there anyway, because the blob URLs
        // belong to the iframe and would dangle in a separate print window), and the <script>
        // stripping. The parent just kicks it off, awaits the snapshot, and hands the HTML to
        // SgPrint.printHtml.
        async _onPrint() {
            try {
                if (typeof window.SgPrint === 'undefined' || typeof SgPrint.printHtml !== 'function') {
                    console.error('[app-shell] SgPrint not loaded — add sg-print.js to the app page');
                    return;
                }
                var iframe = this._iframeEl;
                if (!iframe || !iframe.contentWindow) {
                    console.warn('[app-shell] print: no iframe to request snapshot from');
                    return;
                }
                var id   = (Math.random() * 1e9 | 0).toString(36) + Date.now().toString(36);
                var html = await new Promise(function (res, rej) {
                    var timer = setTimeout(function () {
                        window.removeEventListener('message', h);
                        rej(new Error('print snapshot timed out (5s)'));
                    }, 5000);
                    function h(e) {
                        if (!e.data || e.data.__sgPrintReply !== id) return;
                        clearTimeout(timer);
                        window.removeEventListener('message', h);
                        if (e.data.ok) res(e.data.html);
                        else rej(new Error(e.data.err || 'print snapshot failed'));
                    }
                    window.addEventListener('message', h);
                    iframe.contentWindow.postMessage({ __sgPrintReq: id }, '*');
                });
                var title = (this._appJson && this._appJson.title) || (this._vault && this._vault.name) || 'App';
                SgPrint.printHtml(html, title);
            } catch (err) {
                console.error('[app-shell] print failed:', err);
            }
        }

        // ── ViV Phase 2: mount / unmount / mounts ─────────────────────────────────────
        // Spawn a child kernel (null-origin srcdoc iframe) bound to another vault, fed
        // its secrets over a SecureChannel. After mount, sg.vfs.* calls with the prefix
        // relay through the child's kernel — see _handleVfsViv below.
        // The mount table + broker + relay logic lives in KernelParent (testable, no DOM);
        // app-shell supplies only the DOM-coupled spawnChannel (iframe + srcdoc) and the
        // credential resolver. _mounts / _brokerSidecar alias the KernelParent internals so
        // the message-handler `self._mounts.resolve(...)` checks keep working unchanged.
        _ensureKernelParent() {
            if (this._kernelParent) return this._kernelParent;
            if (typeof KERNEL_SHELL_HTML === 'undefined') {
                throw Object.assign(new Error('kernel-shell-bundle not loaded; run scripts/build-kernel-shell-bundle.py'), { code: 'EUNREACH' });
            }
            if (typeof SecureChannel === 'undefined' || typeof KernelMounts === 'undefined'
                || typeof KernelBroker === 'undefined' || typeof KernelParent === 'undefined'
                || typeof VivCustody === 'undefined') {
                throw Object.assign(new Error('ViV modules missing — load secure-channel + kernel-mounts + kernel-broker + kernel-parent + viv-custody'), { code: 'EUNREACH' });
            }
            var self = this;
            // Classify THIS kernel's App-A iframe origin for the B10 custody gate.
            // Phase 3 SHIPPED: the 4 app-frame sites now use `allow-scripts allow-forms`
            // (no allow-same-origin), so VivCustody classifies App-A as 'null-origin' and
            // the gate no longer refuses parent-held mounts (null-origin App-A cannot read
            // the parent's secrets — that was the whole point of the coupling rule).
            var sandboxSpec = (this._iframeEl && this._iframeEl.getAttribute && this._iframeEl.getAttribute('sandbox')) || null;
            var appOrigin   = VivCustody.classifyAppFrameOrigin(sandboxSpec);
            // Synthetic-only escape hatch. NEVER set this for real-data trials. The
            // pack §05 invariant is fail-closed by design; this is the one named opt-in.
            var unsafeOk = (window.SG_VIV_ALLOW_UNSAFE_SYNTHETIC === true);
            this._kernelParent = new KernelParent({
                kernelId: 'k-' + ((this._vault && this._vault._vaultId) || 'top'),
                brokerUi: { prompt: this._brokerPromptOnHud.bind(this) },
                resolveCredentials: function (ref) { return self._resolveChildCredentials(ref); },
                spawnChannel: function (ref, creds) { return self._spawnChildChannel(ref, creds); },
                appFrameOrigin:       appOrigin,
                allowUnsafeSynthetic: unsafeOk
            });
            // Aliases for the legacy message-handler branches + debug surface.
            this._mounts        = this._kernelParent.mounts;
            this._brokerSidecar = this._kernelParent.broker;
            // Live provider for the ViV Mounts debug tab (gap-doc B4). The pane reads this
            // on each `app-debug:bridge-call` (relayed ops emit one) + on manual refresh.
            var kp = this._kernelParent;
            window._appDebug = window._appDebug || {};
            window._appDebug.vivProvider = function () {
                return { mounts: kp.list(), entries: kp.broker.log() };
            };
            // Multi-kernel audit provider (Phase 5.1 — VivAuditView). The top kernel exposes
            // its own mounts + broker log directly; each DIRECT child is polled via
            // monitorChild (B7 monitored-mode) — children default to CLOSED, so most surface
            // as honest "monitoring closed" placeholders rather than empty rows. Async: each
            // monitorChild is a channel round-trip. Returns the source descriptor list
            // VivAuditView.aggregate() consumes.
            window._appDebug.vivAuditProvider = async function () {
                // SecureChannel.request has no timeout (settles only on reply / channel-close),
                // so an alive-but-unresponsive child would otherwise hang the whole audit poll.
                // Bound each monitorChild round-trip; a timeout surfaces as 'unreachable'.
                function _withTimeout(p, ms) {
                    return Promise.race([ p, new Promise(function (_, reject) {
                        setTimeout(function () { reject(Object.assign(new Error('monitor timeout'), { code: 'ETIMEDOUT' })); }, ms);
                    }) ]);
                }
                var sources = [{
                    kernelId: kp.kernelId || 'top',
                    label:    'top (this app)',
                    mounts:   kp.list(),
                    entries:  kp.broker.log(),
                    monitor:  'top'
                }];
                var children = kp.list();
                for (var i = 0; i < children.length; i++) {
                    var m = children[i];
                    try {
                        var res = await _withTimeout(kp.monitorChild(m.mountId), 3000);   // { mode, entries }
                        sources.push({
                            kernelId: m.mountId,
                            label:    m.label || m.ref || m.mountId,
                            mounts:   [],
                            entries:  (res && res.entries) || [],
                            monitor:  (res && res.mode === 'opt-in') ? 'opt-in' : 'closed'
                        });
                    } catch (err) {
                        sources.push({
                            kernelId: m.mountId,
                            label:    m.label || m.ref || m.mountId,
                            mounts:   [],
                            entries:  null,
                            monitor:  (err && err.code === 'ECONSENT') ? 'closed' : 'unreachable'
                        });
                    }
                }
                return sources;
            };
            return this._kernelParent;
        }

        // DOM-coupled child bring-up: build the null-origin srcdoc iframe, run the handshake,
        // deliver secrets (WITH the parent's own endpoint — M5), wait for the child's 'ready'.
        // Cleans up the iframe + channel on any failure. This is the only piece that can't be
        // unit-tested (it touches document/iframe); KernelParent + bootKernelOnPort cover the rest.
        async _spawnChildChannel(ref, creds) {
            var iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts';            // null origin
            iframe.style.cssText = 'display:none;';      // headless mount; visible UI mounts are Phase 5
            iframe.srcdoc = KERNEL_SHELL_HTML;
            document.body.appendChild(iframe);

            var channel;
            try {
                channel = await SecureChannel.create(iframe, { sensitiveKey: true, cid: 'ch-' + ref });
                // M5: tell the child WHICH server to hit — its own Edge 1. Without this the
                // child falls back to the hardcoded dev endpoint regardless of where we are.
                await channel.send('secrets', {
                    vaultKey:    creds.vaultKey,
                    accessToken: creds.accessToken || null,
                    endpoint:    this._sendEndpoint()
                }, { sensitive: true });
                await new Promise(function (resolve, reject) {
                    var t = setTimeout(function () { reject(Object.assign(new Error('child kernel boot timeout'), { code: 'EUNREACH' })); }, 10000);
                    channel.on('ready', function (p) { clearTimeout(t); resolve(p); });
                });
            } catch (err) {
                if (channel) { try { channel.close(); } catch (_) {} }
                try { iframe.remove(); } catch (_) {}
                throw err;
            }
            // Stash the iframe on the channel so unmount can tear it down.
            channel._mountIframe = iframe;
            return channel;
        }

        async _mountChildVault(opts) {
            var kp = this._ensureKernelParent();
            return kp.mount({ prefix: opts.prefix, ref: opts.ref, label: opts.label });
        }

        async _unmountChildVault(mountId) {
            if (!this._kernelParent) return { unmounted: false };
            var res = await this._kernelParent.unmount(mountId);
            // Tear down the iframe stashed on the channel (DOM cleanup KernelParent can't do).
            try {
                var iframe = res && res.channel && res.channel._mountIframe;
                if (iframe) iframe.remove();
            } catch (_) {}
            return { unmounted: !!res.unmounted, mountId: res.mountId };
        }

        _listMounts() {
            if (!this._kernelParent) return [];
            return this._kernelParent.list();
        }

        // Trial-only stub. The clinic vault's app.json + an owner record (clinic.json)
        // can provide child credentials. Real production: Kernel-A holds them
        // (port-transfer model — architect pack §3 "Cleaner future variant").
        // Resolved creds are tagged custody:'parent-held' so the B10 gate can refuse
        // the unsafe combination (this resolver + a same-origin App-A) by default.
        async _resolveChildCredentials(ref) {
            if (this._resolveChildCredentialsImpl) return this._resolveChildCredentialsImpl(ref);
            try {
                var bytes = await this._dataSource.getFileBytes('clinic.json');
                var clinic = JSON.parse(new TextDecoder().decode(bytes));
                var entry = clinic && clinic[ref];
                if (entry && entry.vaultKey) {
                    return {
                        vaultKey:    entry.vaultKey,
                        accessToken: entry.accessToken || null,
                        custody:     'parent-held'
                    };
                }
            } catch (_) {}
            return null;
        }

        // HUD prompt for broker.mediate(ask). Reuses the existing consent bar infrastructure.
        async _brokerPromptOnHud(req) {
            return new Promise((resolve) => {
                var hud = document.getElementById('app-hud') || document.querySelector('app-hud');
                if (!hud || typeof hud.requestConsent !== 'function') { resolve('deny'); return; }
                hud.requestConsent('vfs.' + req.op, req.path + ' (in ' + req.mountId + ')', function (ok) {
                    resolve(ok ? 'allow' : 'deny');
                });
            });
        }

        // Cross-mount aware vfs handler. Local path → existing data-source ops; cross-mount
        // path → broker.mediate + relay over the child's SecureChannel.
        async _handleVfsViv(op, args) {
            if (!this._kernelParent) return null;   // no mounts yet → caller does local op
            return this._kernelParent.relay(op, args);
        }

        // Clear this app's cached consents for the current vault (HUD permissions panel "reset").
        _resetConsents() {
            var prefix = 'sg-app-grant:' + ((this._vault && this._vault._vaultId) || this._vaultKey || '') + ':' + (this._appId || '') + ':';
            try {
                var rm = [];
                for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(prefix) === 0) rm.push(k); }
                rm.forEach(function (k) { try { localStorage.removeItem(k); } catch (_) {} });
            } catch (_) {}
        }

        _setCachedAccessKey(vaultId, key, persist) {
            // Embed mode: never persist. The parent owns credentials lifecycle
            // (same reasoning as the vault-key skip in _initWithKey). Null-origin
            // embed parents would throw here too — the existing catch keeps things
            // quiet, but skipping the call entirely is cleaner and signals intent.
            if (this._embedMode) return;
            try {
                if (persist) localStorage.setItem('sg-access-key:' + vaultId, key);
                else         sessionStorage.setItem('sg-access-key:' + vaultId, key);
            } catch (_) {}
        }

        // ── app.json ──────────────────────────────────────────────────────────────────

        async _readAppJson() {
            var fileList = this._dataSource.getFileList();
            // Prefer .vault/app.json (new location), fall back to app.json (legacy)
            var candidates = ['.vault/app.json', 'app.json'];
            for (var i = 0; i < candidates.length; i++) {
                var p     = candidates[i];
                var entry = fileList.find(function (f) { return f.path === p || f.path === p.replace(/^\//, ''); });
                if (!entry) continue;
                try {
                    var buf = await this._dataSource.getFileBytes(entry.path);
                    return JSON.parse(new TextDecoder().decode(buf));
                } catch (e) {
                    console.warn('[app-shell] app.json parse error at', p, ':', e.message);
                }
            }
            return null;
        }

        // ── Auth prompt ───────────────────────────────────────────────────────────────

        async _showAuthPrompt(vault, appJson) {
            var promptText = (appJson.auth && appJson.auth.prompt) || 'Enter your access key to continue';
            var appTitle   = appJson.title || vault.name || 'App';
            var vaultId    = vault._vaultId || this._vaultKey;

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:#0a0a18; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
                    .auth-card { background:#12122a; border:1px solid #2a2a4a; border-radius:8px; padding:2rem; min-width:300px; max-width:400px; width:90%; }
                    .auth-card h2 { margin:0 0 0.4rem; font-size:1.1rem; color:#e2e8f0; }
                    .auth-card p { margin:0 0 1.25rem; font-size:0.85rem; color:#8892a4; }
                    .auth-card input[type=password] { width:100%; padding:0.5rem 0.75rem; background:#0a0a18; border:1px solid #4ECDC4; border-radius:4px; color:#e2e8f0; font-size:0.875rem; font-family:monospace; outline:none; box-sizing:border-box; }
                    .auth-card input:focus { box-shadow:0 0 0 2px rgba(78,205,196,0.2); }
                    .auth-remember { display:flex; align-items:center; gap:0.5rem; margin-top:0.6rem; font-size:0.8rem; color:#8892a4; cursor:pointer; }
                    .auth-err { margin-top:0.5rem; color:#ff6b6b; font-size:0.8rem; min-height:1.1em; }
                    .auth-submit { margin-top:1rem; width:100%; padding:0.6rem; background:#4ECDC4; border:none; border-radius:4px; color:#0a0a18; font-weight:700; font-size:0.875rem; cursor:pointer; }
                    .auth-submit:hover:not(:disabled) { background:#3dbdb5; }
                    .auth-submit:disabled { opacity:0.6; cursor:default; }
                </style>
                <div class="auth-card">
                    <h2>${this._escHtml(appTitle)}</h2>
                    <p>${this._escHtml(promptText)}</p>
                    <input type="password" class="auth-input" placeholder="Access key…" autocomplete="off">
                    <label class="auth-remember"><input type="checkbox" class="auth-rcheck"> Remember on this device</label>
                    <div class="auth-err"></div>
                    <button class="auth-submit">Continue</button>
                </div>
            `;

            await new Promise((resolve) => {
                var root   = this.shadowRoot;
                var input  = root.querySelector('.auth-input');
                var errEl  = root.querySelector('.auth-err');
                var rCheck = root.querySelector('.auth-rcheck');
                var btn    = root.querySelector('.auth-submit');
                var endpoint = (window.SG_ENDPOINT
                    || (function(){ try{ return sessionStorage.getItem('sg-vault-endpoint'); }catch(_){ return null; } })()
                    || 'https://dev.send.sgraph.ai').replace(/\/$/, '');

                var submit = async () => {
                    var key = input.value.trim();
                    if (!key) return;
                    btn.disabled = true;
                    errEl.textContent = '';
                    try {
                        var resp = await fetch(endpoint + '/api/transfers/check-token/' + encodeURIComponent(key));
                        var data = await resp.json();
                        if (!data.valid) throw new Error('Access key is invalid or has expired');
                        this._setCachedAccessKey(vaultId, key, rCheck.checked);
                        this._applyAccessToken(key);
                        this._dataSource = new VaultDataSource(vault, key);
                        this._writable   = true;
                        resolve();
                        await this._continue(appJson);
                    } catch (err) {
                        errEl.textContent = err.message;
                        btn.disabled      = false;
                    }
                };

                btn.addEventListener('click', submit);
                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
                input.focus();
            });
        }

        // ── Resource pre-fetch ────────────────────────────────────────────────────────

        async _fetchResources(appJson) {
            if (!appJson || !appJson.resources) return { css: [], js: [] };

            var cssPaths = appJson.resources.css || [];
            var jsPaths  = appJson.resources.js  || [];
            var fileList = this._dataSource.getFileList();
            var self     = this;

            var fetchVaultText = async function (path) {
                var norm  = path.startsWith('/') ? path.slice(1) : path;
                var entry = fileList.find(function (f) { return f.path === norm; });
                if (!entry) throw new Error('Resource not found in vault: ' + path);
                var buf  = await self._dataSource.getFileBytes(entry.path);
                self._resourcesLoaded.push({ path: path, type: path.endsWith('.css') ? 'css' : 'js' });
                return new TextDecoder().decode(buf);
            };

            var [cssTexts, jsTexts] = await Promise.all([
                Promise.all(cssPaths.map(fetchVaultText)),
                Promise.all(jsPaths.map(fetchVaultText))
            ]);

            return { css: cssTexts, js: jsTexts };
        }

        // ── Iframe mount ──────────────────────────────────────────────────────────────

        async _mountApp(appJson, resourcesData) {
            var entryFile = (appJson && appJson.entry) || 'index.html';
            var fileList  = this._dataSource.getFileList();
            var entry     = fileList.find(function (f) {
                return !f.dir && (f.path === entryFile || f.path.endsWith('/' + entryFile));
            });

            if (!entry) {
                this._showError('Entry file not found: ' + entryFile);
                return;
            }

            // _page.json entries are rendered via PageLayoutRenderer, not an HTML iframe
            if (entryFile.endsWith('_page.json')) {
                await this._mountPageLayout(entry);
                return;
            }

            this._setStatus('Loading app…');

            var htmlBytes = await this._dataSource.getFileBytes(entry.path);
            var htmlText  = new TextDecoder().decode(htmlBytes);

            // Empty-entry guard. A 0-byte or whitespace-only entry file (e.g. a broken
            // reassembled app, a failed write, or a placeholder that never got content)
            // would otherwise mount a blank iframe with NO clue for the user — the worst
            // case. Catch it here with a clear host-drawn error instead.
            if (!htmlText || !htmlText.trim()) {
                this._showError('Entry file "' + entryFile + '" is empty — the app has no content to display.');
                return;
            }

            // Track html dir for relative path resolution
            this._htmlDir = entry.path.includes('/')
                ? entry.path.substring(0, entry.path.lastIndexOf('/') + 1) : '';

            // Build resource injection block (pre-fetched CSS/JS)
            var resBlock = '';
            if (resourcesData) {
                resourcesData.css.forEach(function (css) {
                    resBlock += '<style data-sg-preload>' + css.replace(/<\/style>/gi, '<\\/style>') + '</style>';
                });
                resourcesData.js.forEach(function (js) {
                    resBlock += '<script data-sg-preload>' + js.replace(/<\/script>/gi, '<\\/script>') + '<\/script>';
                });
            }

            // Inject bridge + resources into <head> via the unified bootstrap builder (Phase 4).
            var bridgeScript = this._buildVfsBridgeScript(entry.path);
            var injected     = AppFrameBootstrap.build({ kind: 'app', htmlText: htmlText, bridgeScript: bridgeScript, resBlock: resBlock });

            // Phase 3 (pack §5.3 security gate): null-origin app frame. We deliver the
            // app via `srcdoc`, NOT a parent-origin `blob:` URL — a null-origin sandbox
            // refuses to load a blob: minted by another origin (pack §5.5; probe P1).
            // Dropping `allow-same-origin` means app code can no longer read
            // localStorage / window.parent / ambient-fetch vault paths; every vault
            // access goes through the postMessage bridge (sg.*), which never needed it.
            var iframe         = document.createElement('iframe');
            iframe.sandbox     = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';
            iframe.style.cssText = 'border:none;width:100%;height:100%;display:block;flex:1;';
            iframe.srcdoc      = injected;
            iframe.addEventListener('load', () => {
                this._iframeStatus  = 'ready';
                this._t.iframeReady = performance.now();
                this._emitVaultEvent('iframe-ready', { label: 'App iframe ready', entry: entryFile, ms: Math.round(this._t.iframeReady - this._t.start) });
            });
            this._iframeEl    = iframe;
            this._iframeStatus = 'loading';

            this.shadowRoot.innerHTML = `<style>:host{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#0a0a18;}</style>`;
            this.shadowRoot.appendChild(iframe);

            this._setupVfsBridgeHandlers(iframe, this._dataSource);

            // Seed nav history with this entry so the HUD back/forward arrows have an origin.
            // Subsequent in-vault link clicks push onto this stack via _pushNavHistory.
            // _appEntryPath is remembered separately so the Home button can jump back to
            // the app's root regardless of how deep nav has wandered.
            this._appEntryPath = entry.path;
            this._navHistory   = [entry.path];
            this._navIndex     = 0;
            this._emitNavChange();

            // Start the inbox checker if this app opted into inbox host_events (no-op otherwise).
            this._initInboxChecker(appJson);
        }

        // _page.json: render via PageLayoutRenderer.
        // Fetches the renderer + its dependencies + CSS from /_common/ in the parent
        // context (no CSP/CORS issues), then inlines everything into a self-contained
        // blob iframe. PageLayoutRenderer references SendHelpers, FileTypeDetect,
        // MarkdownParser and the _resolvePath/_findEntry helpers as bare globals — each
        // dependency is inlined as its own <script> so its top-level binding is visible.
        async _mountPageLayout(entry) {
            this._setStatus('Loading page…');

            var fileList   = this._dataSource.getFileList();
            var folderPath = entry.path.includes('/')
                ? entry.path.substring(0, entry.path.lastIndexOf('/') + 1) : '';
            var bridgeScript = this._buildVfsBridgeScript(entry.path);

            function _fetchText(url) { return fetch(url).then(function (r) { return r.text(); }); }

            var deps = await Promise.all([
                _fetchText('/_common/js/base/send-helpers.js'),
                _fetchText('/_common/js/file-type-detect.js'),
                _fetchText('/_common/lib/markdown/markdown-parser.js'),
                _fetchText('/_common/lib/markdown/markdown-renderer.js'),
                _fetchText('/_common/js/page-layout-renderer.js'),
                _fetchText('/_common/js/components/send-download/send-browse.css'),
                _fetchText('/_common/js/components/send-download/send-browse-v031.css'),
                _fetchText('/_common/js/components/send-download/send-browse-v031--page-layout.css')
            ]);
            var sendHelpersJs = deps[0], fileTypeJs = deps[1], mdParserJs = deps[2],
                mdRendererJs  = deps[3], plrJs = deps[4],
                css1 = deps[5], css2 = deps[6], css3 = deps[7];

            // Unified app-frame bootstrap (Phase 4). Path-resolution helpers, the
            // PageLayoutRenderer wiring and the `.vault`-segment fileList filter now live
            // in AppFrameBootstrap.build({kind:'page-layout'}); the mount method only
            // fetches deps and passes them in.
            var html = AppFrameBootstrap.build({
                kind: 'page-layout',
                bridgeScript: bridgeScript,
                deps: {
                    sendHelpersJs: sendHelpersJs, fileTypeJs: fileTypeJs,
                    mdParserJs: mdParserJs, mdRendererJs: mdRendererJs, plrJs: plrJs,
                    css1: css1, css2: css2, css3: css3
                },
                fileList:   fileList,
                folderPath: folderPath,
                entryPath:  entry.path
            });

            // Phase 3: null-origin frame — srcdoc, no allow-same-origin (see _mountApp).
            var iframe         = document.createElement('iframe');
            iframe.sandbox     = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';
            iframe.style.cssText = 'border:none;width:100%;height:100%;display:block;flex:1;';
            iframe.srcdoc      = html;
            iframe.addEventListener('load', () => {
                this._iframeStatus  = 'ready';
                this._t.iframeReady = performance.now();
                this._emitVaultEvent('iframe-ready', { label: 'Page layout ready', entry: entry.path, ms: Math.round(this._t.iframeReady - this._t.start) });
            });
            this._iframeEl     = iframe;
            this._iframeStatus = 'loading';

            this.shadowRoot.innerHTML = '<style>:host{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#0a0a18;}</style>';
            this.shadowRoot.appendChild(iframe);
            this._setupVfsBridgeHandlers(iframe, this._dataSource);
        }

        // ── Render a single vault file on /en-gb/app (no app.json) ───────────────────
        // Supports: .md / .markdown (inline render), .html / .htm (VFS bridge iframe),
        // everything else (shows a plain "cannot preview" message).

        async _mountVaultFile(filePath) {
            this._setStatus('Loading…');

            var fileList = this._dataSource ? this._dataSource.getFileList() : [];
            var entry = fileList.find(function (f) {
                return !f.dir && (f.path === filePath || f.path.endsWith('/' + filePath));
            });
            if (!entry) {
                // Try a loose filename match
                var filename = filePath.split('/').pop();
                entry = fileList.find(function (f) { return !f.dir && f.path.split('/').pop() === filename; });
            }
            if (!entry) {
                this._showError('File not found: ' + filePath);
                return;
            }

            // Reflect the opened file in the URL hash (the resolved path — non-sensitive; the vault
            // key stays in localStorage, never the address bar). This makes reloads re-open the same
            // file and the link copy-shareable. _init re-reads this hash on reload; _continue →
            // _mountVaultFile re-mounts and re-sets it. The default app (no deep-link) keeps no hash.
            try { window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + entry.path); } catch (_) {}

            var ext = entry.path.split('.').pop().toLowerCase();
            var bridgeScript = this._buildVfsBridgeScript(entry.path);

            // ── HTML / HTM — inject VFS bridge and render in iframe ──────────────────
            if (ext === 'html' || ext === 'htm') {
                this._setStatus('Loading app…');
                var htmlBytes = await this._dataSource.getFileBytes(entry.path);
                var htmlText  = new TextDecoder().decode(htmlBytes);
                var injected  = AppFrameBootstrap.build({ kind: 'html', htmlText: htmlText, bridgeScript: bridgeScript });
                // Phase 3: null-origin frame — srcdoc, no allow-same-origin (see _mountApp).
                var iframe         = document.createElement('iframe');
                iframe.sandbox     = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';
                iframe.style.cssText = 'border:none;width:100%;height:100%;display:block;flex:1;';
                iframe.srcdoc      = injected;
                iframe.addEventListener('load', () => {
                    this._iframeStatus  = 'ready';
                    this._t.iframeReady = performance.now();
                });
                this._iframeEl     = iframe;
                this._iframeStatus = 'loading';
                this.shadowRoot.innerHTML = '<style>:host{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#0a0a18;}</style>';
                this.shadowRoot.appendChild(iframe);
                this._setupVfsBridgeHandlers(iframe, this._dataSource);
                return;
            }

            // ── Markdown — inline render ─────────────────────────────────────────────
            if (ext === 'md' || ext === 'markdown') {
                function _fetchText(url) { return fetch(url).then(function (r) { return r.text(); }); }
                var deps = await Promise.all([
                    _fetchText('/_common/lib/markdown/markdown-parser.js'),
                    _fetchText('/_common/lib/markdown/markdown-renderer.js'),
                    _fetchText('/_common/js/components/send-download/send-browse.css'),
                    _fetchText('/_common/css/shared-components.css')
                ]);
                var mdParserJs = deps[0], mdRendererJs = deps[1], css1 = deps[2], css2 = deps[3];

                var mdBytes = await this._dataSource.getFileBytes(entry.path);
                var mdText  = new TextDecoder().decode(mdBytes);

                // Unified app-frame bootstrap (Phase 4) — markdown render + bridge
                // image-resolution IIFE now live in AppFrameBootstrap.build({kind:
                // 'markdown'}); the mount method only fetches deps and the md bytes.
                var html = AppFrameBootstrap.build({
                    kind: 'markdown',
                    bridgeScript: bridgeScript,
                    deps: { mdParserJs: mdParserJs, mdRendererJs: mdRendererJs, css1: css1, css2: css2 },
                    mdText: mdText
                });

                // Phase 3: null-origin frame — srcdoc, no allow-same-origin (see _mountApp).
                var iframe         = document.createElement('iframe');
                iframe.sandbox     = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';
                iframe.style.cssText = 'border:none;width:100%;height:100%;display:block;flex:1;';
                iframe.srcdoc      = html;
                iframe.addEventListener('load', () => {
                    this._iframeStatus  = 'ready';
                    this._t.iframeReady = performance.now();
                    this._emitVaultEvent('iframe-ready', { label: 'Vault file ready', entry: entry.path, ms: Math.round(this._t.iframeReady - this._t.start) });
                });
                this._iframeEl     = iframe;
                this._iframeStatus = 'loading';
                this.shadowRoot.innerHTML = '<style>:host{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#0a0a18;}</style>';
                this.shadowRoot.appendChild(iframe);
                this._setupVfsBridgeHandlers(iframe, this._dataSource);
                return;
            }

            // ── Unsupported type — show a helpful message ────────────────────────────
            this.shadowRoot.innerHTML =
                '<style>:host{display:flex;align-items:center;justify-content:center;' +
                'width:100%;height:100%;background:#0a0a18;color:#e2e8f0;font-family:system-ui,sans-serif;}</style>' +
                '<div style="text-align:center;padding:2rem;">' +
                    '<p style="color:#94a3b8;">Cannot preview <strong>' + entry.path + '</strong> as an app.</p>' +
                    '<p style="font-size:13px;color:#64748b;">Supported: .md, .markdown, .html, .htm</p>' +
                '</div>';
        }

        // ── In-app navigation (HUD back/forward + bridge nav requests) ────────────────
        //
        // The iframe's click interceptor (see _buildVfsBridgeScript below) catches every
        // in-vault link and posts {__sgVfsNavReq: href} to the parent. The message handler
        // hands it to `_navigateToPath`, which resolves the path against the current dir,
        // pushes a history entry, swaps the srcdoc, and (if the href had a #fragment) tells
        // the new doc to scroll to it via __sgVfsScrollToHash. Back/forward arrows on the
        // HUD bypass the bridge entirely and re-issue from history with pushHistory:false.

        _navigateToPath(href, opts) {
            opts = opts || {};
            var pushHistory     = (opts.pushHistory !== false);
            // History entries (back/forward, home) carry already-resolved vault-absolute
            // paths — re-running _resolvePath against the *current* this._htmlDir would
            // double-prefix them (e.g. back from "shared/test-lab/" to "home/index.html"
            // would resolve to "shared/test-lab/home/index.html", which doesn't exist).
            // The bridge click-interceptor path is always relative-to-current-dir and so
            // does need resolution — that's the default (alreadyResolved !== true).
            var alreadyResolved = (opts.alreadyResolved === true);
            var iframeEl   = this._iframeEl;
            var dataSource = this._dataSource;
            if (!iframeEl || !dataSource) return;

            // Delegates the parsing + resolution to AppNavHelpers so the two pinned
            // regression rules (hash-link strip, path-doubling alreadyResolved) live in
            // ONE place with characterization tests. See test__app_shell_nav_helpers.js.
            var nav      = AppNavHelpers.resolveNavigation({
                href:            href,
                htmlDir:         this._htmlDir,
                alreadyResolved: alreadyResolved
            });
            var resolved = nav.resolved;
            var fragment = nav.fragment;
            if (AppPermissions.isFloor('read', resolved)) {
                console.warn('[app-shell] nav blocked (protected path):', resolved);
                this._renderBrokenLinkOverlay(resolved, 'blocked');
                if (pushHistory) this._pushNavHistory(resolved);
                this._emitNavChange();
                return;
            }
            var match = this._findEntry(dataSource.getFileList(), resolved);
            if (!match) {
                console.warn('[app-shell] nav not found:', resolved);
                this._renderBrokenLinkOverlay(resolved, 'missing');
                if (pushHistory) this._pushNavHistory(resolved);
                this._emitNavChange();
                return;
            }
            var self = this;
            dataSource.getFileBytes(match.path).then(function (buf) {
                var htmlText = new TextDecoder().decode(buf);
                self._htmlDir = match.path.includes('/')
                    ? match.path.substring(0, match.path.lastIndexOf('/') + 1) : '';
                var navBridge = self._buildVfsBridgeScript(match.path);
                // Phase 3 flipped app frames to null-origin `srcdoc` (ee6f4995). srcdoc
                // OVERRIDES src, so we must REPLACE srcdoc — not assign a blob: src.
                var injected  = AppFrameBootstrap.build({ kind: 'html', htmlText: htmlText, bridgeScript: navBridge });
                iframeEl.removeAttribute('src');
                iframeEl.srcdoc = injected;
                var entry = match.path + (fragment ? '#' + fragment : '');
                if (pushHistory) self._pushNavHistory(entry);
                // Scroll-to-anchor: reach into the null-origin iframe via postMessage. The
                // bridge script's __sgVfsScrollToHash listener applies it on DOMContentLoaded.
                if (fragment) {
                    var onLoad = function () {
                        iframeEl.removeEventListener('load', onLoad);
                        try { iframeEl.contentWindow.postMessage({ __sgVfsScrollToHash: fragment }, '*'); } catch (_) {}
                    };
                    iframeEl.addEventListener('load', onLoad);
                }
                self._emitNavChange();
                console.log('[app-shell] nav →', entry);
            }).catch(function (err) { console.error('[app-shell] nav fetch failed:', err); });
        }

        _pushNavHistory(entry) {
            // Truncate any forward entries — the new nav replaces them (browser convention).
            if (this._navIndex < this._navHistory.length - 1) {
                this._navHistory.length = this._navIndex + 1;
            }
            // Don't push a duplicate of the current entry (refresh shouldn't grow history).
            var last = this._navHistory[this._navHistory.length - 1];
            if (last !== entry) this._navHistory.push(entry);
            this._navIndex = this._navHistory.length - 1;
        }

        _navBack() {
            if (this._navIndex <= 0) return false;
            this._navIndex -= 1;
            this._navigateToPath(this._navHistory[this._navIndex], { pushHistory: false, alreadyResolved: true });
            return true;
        }

        _navForward() {
            if (this._navIndex >= this._navHistory.length - 1) return false;
            this._navIndex += 1;
            this._navigateToPath(this._navHistory[this._navIndex], { pushHistory: false, alreadyResolved: true });
            return true;
        }

        _navReload() {
            var entry = this._navHistory[this._navIndex];
            if (!entry) return false;
            this._navigateToPath(entry, { pushHistory: false, alreadyResolved: true });
            return true;
        }

        // Jump back to the app's entry file (from app.json — captured at _mountApp time).
        // Pushes a new history entry rather than rewinding the stack — going Home from
        // page-deep-in-the-tree shouldn't erase your forward stack the way Back/Forward do.
        _navHome() {
            if (!this._appEntryPath) return false;
            // No-op if we're already on Home (don't pollute history with duplicates).
            if (this._currentNavPath() === this._appEntryPath) return true;
            this._navigateToPath(this._appEntryPath, { pushHistory: true, alreadyResolved: true });
            return true;
        }

        _canNavBack()    { return this._navIndex > 0; }
        _canNavForward() { return this._navIndex < this._navHistory.length - 1; }
        _currentNavPath() { return this._navHistory[this._navIndex] || ''; }

        // Notify the HUD that nav state has changed so it can update arrows + the address bar.
        _emitNavChange() {
            var cur  = this._currentNavPath();
            var home = this._appEntryPath || '';
            document.dispatchEvent(new CustomEvent('app-nav:change', {
                bubbles: true, composed: true,
                detail: {
                    path:       cur,
                    canBack:    this._canNavBack(),
                    canForward: this._canNavForward(),
                    canHome:    !!home && (cur !== home),
                    historyLen: this._navHistory.length
                }
            }));
        }

        // Friendly dead-end page for navigations that can't be served. Two reasons:
        //   'missing'  → the path is not in the vault file list at all
        //   'blocked'  → the path is in a protected segment (AppPermissions floor)
        // Rendered as a srcdoc so the user can hit the HUD's ‹ back arrow to escape.
        _renderBrokenLinkOverlay(missingPath, reason) {
            var iframe = this._iframeEl;
            if (!iframe) return;
            var esc = function (s) {
                return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            };
            var isBlocked = (reason === 'blocked');
            var title  = isBlocked ? 'Access denied' : 'Page not found in this vault';
            var icon   = isBlocked ? '🔒' : '🔗';
            var detail = isBlocked
                ? 'The app tried to navigate to a protected path. The platform blocks reads to vault internals from app code.'
                : 'The link points to a file that does not exist in this vault. The author may have renamed or moved it.';
            var html = ''
              + '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title>'
              + '<style>'
              +   'html,body{margin:0;padding:0;}'
              +   'body{background:#0d1117;color:#e6e6e6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
              +     'display:flex;align-items:center;justify-content:center;min-height:100vh;}'
              +   '.err{text-align:center;max-width:540px;padding:2rem 2.5rem;}'
              +   '.ico{font-size:3rem;margin:0 0 0.6rem;opacity:0.75;line-height:1;}'
              +   'h1{color:' + (isBlocked ? '#f0ad4e' : '#ff8a8a') + ';font-size:1.15rem;font-weight:600;margin:0 0 0.5rem;}'
              +   'p{color:rgba(255,255,255,0.62);font-size:0.9rem;line-height:1.55;margin:0.4rem 0;}'
              +   'code{background:rgba(255,255,255,0.08);padding:0.18rem 0.55rem;border-radius:3px;'
              +     'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.82em;word-break:break-all;color:#fff;}'
              +   '.hint{color:rgba(255,255,255,0.38);font-size:0.78rem;margin-top:1.3rem;}'
              + '</style></head><body><div class="err">'
              + '<div class="ico">' + icon + '</div>'
              + '<h1>' + esc(title) + '</h1>'
              + '<p>' + esc(detail) + '</p>'
              + '<p><code>' + esc(missingPath) + '</code></p>'
              + '<p class="hint">Use the &lsaquo; back arrow in the toolbar to return to where you came from.</p>'
              + '</div></body></html>';
            iframe.removeAttribute('src');
            iframe.srcdoc = html;
        }

        // ── VFS bridge (injected into iframe) ─────────────────────────────────────────

        _buildVfsBridgeScript(currentPath) {
            // EFFECTIVE writability — match what the bridge ACTUALLY enforces (and what the
            // SG/Vault editor preview reports via send-browse). Two distinct gates:
            //   • this._writable      = read_key tier: do we have a full key (not an ro-token)?
            //   • dataSource.writable = access-token tier: is the server-side write gate open?
            // Both must be true for a write to land. Reporting only the crypto tier (the old
            // behaviour) meant a key-only open with no access token surfaced sg.app.writable
            // as TRUE; the app then tried to write, the host rejected, and the user saw a
            // red "Read-only vault" error — exactly the parity bug vs the Vault UI preview.
            var writable  = !!(this._writable && this._dataSource && this._dataSource.writable);
            var vaultName = (this._vault && this._vault.name)     || '';
            var vaultId   = (this._vault && this._vault._vaultId) || '';
            var fileList  = this._dataSource ? this._dataSource.getFileList() : [];
            var fileCount = fileList.filter(function (f) { return !f.dir; }).length;
            // htmlDir: directory prefix of the entry HTML file (e.g. "pages/" for "pages/index.html",
            // "" for root-level "index.html"). Injected into the bridge so the img.src patch can
            // resolve relative image paths to absolute vault paths before sending to the parent.
            var htmlDir   = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/') + 1) : '';

            return '<script>(function(){' +

                // App-error surfacing (ViV Phase 4 re-spec). Under null-origin app frames
                // the parent can no longer reach in to inject window.onerror; instead the
                // frame self-reports uncaught errors OUT over postMessage (null-origin safe).
                // The parent handler routes {type:"sg-app-error"} to the HUD. See probe P5.
                'window.onerror=function(m,s,l,c){try{window.parent.postMessage({type:"sg-app-error",message:String(m)+(l?" (line "+l+(c?":"+c:"")+")":"")},"*");}catch(_){}return false;};' +
                'window.addEventListener("unhandledrejection",function(e){try{var r=e&&e.reason;window.parent.postMessage({type:"sg-app-error",message:"Unhandled rejection: "+String((r&&r.message)||r)},"*");}catch(_){}});' +

                // Kernel→app event channel (sg.on / sg.off). The kernel postMessages
                // {type:"sg-event",name,payload} ONLY for events this app declared in
                // app.json.host_events (gate is enforced parent-side). We fan them out to
                // subscribers here. Registering for a name the kernel never sends is a
                // harmless no-op (no enumeration leak). "*" is a wildcard over received events.
                'var _sgEvtH={};' +
                'function _sgOn(name,cb){if(typeof cb!=="function"||!name)return function(){};(_sgEvtH[name]=_sgEvtH[name]||[]).push(cb);return function(){_sgOff(name,cb);};}' +
                'function _sgOff(name,cb){var a=_sgEvtH[name];if(!a)return;var i=a.indexOf(cb);if(i>=0)a.splice(i,1);if(a.length===0)delete _sgEvtH[name];}' +
                'function _sgDispatch(name,payload){if(!name)return;var a=(_sgEvtH[name]||[]).slice(),i;for(i=0;i<a.length;i++){try{a[i](payload);}catch(_){}}' +
                  'var s=(_sgEvtH["*"]||[]).slice();for(i=0;i<s.length;i++){try{s[i](name,payload);}catch(_){}}}' +
                'window.addEventListener("message",function(e){if(e&&e.data&&e.data.type==="sg-event")_sgDispatch(e.data.name,e.data.payload);});' +
                // Blank-app self-check: if the app never paints anything visible, surface a
                // hint (mirrors the old same-origin display:none probe, now from inside).
                //
                // Detects MORE than display:none — an app can be blank without it: an empty
                // body (no children), a visibility:hidden / opacity:0 reveal that never fired,
                // or nothing rendered at all (scrollHeight 0). The previous check only caught
                // display:none, so an empty/hidden body left the user staring at a blank screen
                // with no console error and no host clue (the worst case).
                //
                // Delay 2500 ms (2026-05-31): apps with a "hidden until init JS runs" reveal
                // pattern (Private Health Score is one) need time to paint; 2.5 s is well past
                // every reasonable init time but short enough to still be useful when the app
                // GENUINELY never renders. A working app that has painted by then has body
                // children + non-zero height, so it never trips this — no false positives.
                'window.addEventListener("DOMContentLoaded",function(){setTimeout(function(){try{' +
                  'var b=document.body;if(!b)return;' +
                  'var cs=getComputedStyle(b);' +
                  'var reason=cs.display==="none"?"hidden (display:none)":' +
                    '(cs.visibility==="hidden"?"hidden (visibility:hidden)":' +
                    '(parseFloat(cs.opacity)===0?"hidden (opacity:0)":' +
                    '(b.children.length===0?"empty (rendered no content)":' +
                    '((b.scrollHeight||0)<2&&!(b.textContent||"").trim()?"blank (no visible content)":null))));' +
                  'if(reason){window.parent.postMessage({type:"sg-app-error",message:"App loaded but is showing nothing — "+reason+". Its initialisation may have failed."},"*");}' +
                '}catch(_){}},2500);});' +

                // Nav intercept: relative .html/.htm links → postMessage to parent.
                // The extension check runs on the path portion only (strip ?query / #frag) so
                // "page.html#section" still routes through the bridge — otherwise the browser
                // would do a real GET, the static host 403s, and the iframe lands on a dead end.
                // The ORIGINAL href (with the fragment) is forwarded so the parent can scroll
                // to the anchor inside the new srcdoc after navigation.
                //
                // External links (http://, https://, //) are opened in a NEW TAB via window.open.
                // The iframe's sandbox now includes allow-popups + allow-popups-to-escape-sandbox,
                // so the new window is unrestricted. Doing it from inside the iframe (synchronous
                // within the click gesture) avoids the popup-blocker hit that a postMessage round-
                // trip to the parent would incur — postMessage is async, the gesture is lost, and
                // window.open() in the parent would be blocked.
                'document.addEventListener("click",function(e){' +
                  'var a=e.target.closest("a");if(!a)return;' +
                  'var h=a.getAttribute("href");if(!h)return;' +
                  'if(h.startsWith("#")||h.startsWith("mailto:"))return;' +
                  'if(h.startsWith("http")||h.startsWith("//")){' +
                    'e.preventDefault();e.stopPropagation();' +
                    'try{window.open(h,"_blank","noopener,noreferrer");}catch(_){}' +
                    'return;' +
                  '}' +
                  'var hp=h.split("?")[0].split("#")[0];' +
                  'if(hp.endsWith(".html")||hp.endsWith(".htm")){' +
                    'e.preventDefault();e.stopPropagation();' +
                    'window.parent.postMessage({__sgVfsNavReq:h},"*");' +
                  '}' +
                '},true);' +

                // Scroll-to-anchor after navigation: parent posts {__sgVfsScrollToHash:"section"}
                // (no leading '#') once the new srcdoc has loaded. Null-origin frames can't be
                // scripted by the parent directly, so this listener inside the iframe is how
                // links like "page.html#section" land on the right element after the swap.
                'window.addEventListener("message",function(e){' +
                  'if(!e.data||typeof e.data.__sgVfsScrollToHash!=="string")return;' +
                  'var frag=e.data.__sgVfsScrollToHash;if(!frag)return;' +
                  'var apply=function(){try{var el=document.getElementById(frag);if(el){el.scrollIntoView();return;}location.hash="#"+frag;}catch(_){}};' +
                  'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);else apply();' +
                '});' +

                // Print snapshot RPC. ViV Phase 3 flipped app frames to null-origin srcdoc, which
                // means the parent can't read iframe.contentDocument any more (SecurityError). So
                // print now runs INSIDE the iframe: the parent posts {__sgPrintReq: id}, this
                // listener clones documentElement, fetches every blob: url (img.src and stylesheet
                // link.href) and inlines them as data: URIs (so the print window is self-contained
                // — blob: URLs created in this iframe wouldn't survive a window.open anyway),
                // strips <script> tags (they would error or hang in the print preview with no
                // bridge), and posts the resulting HTML back via {__sgPrintReply: id, ok, html|err}.
                'window.addEventListener("message",function(e){' +
                  'if(!e.data||!e.data.__sgPrintReq)return;' +
                  'var id=e.data.__sgPrintReq;' +
                  '(async function(){' +
                    'try{' +
                      'var clone=document.documentElement.cloneNode(true);' +
                      'function _b2d(u){return fetch(u).then(function(r){return r.blob();}).then(function(b){return new Promise(function(res,rej){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.onerror=function(){rej(fr.error);};fr.readAsDataURL(b);});});}' +
                      'var imgs=Array.prototype.slice.call(clone.querySelectorAll(\'img[src^="blob:"]\'));' +
                      'var lnks=Array.prototype.slice.call(clone.querySelectorAll(\'link[rel="stylesheet"][href^="blob:"]\'));' +
                      'await Promise.all(imgs.map(async function(g){try{g.src=await _b2d(g.src);}catch(_){}}).concat(lnks.map(async function(l){try{l.href=await _b2d(l.href);}catch(_){}})));' +
                      'clone.querySelectorAll("script").forEach(function(s){s.remove();});' +
                      'var html="<!DOCTYPE html>\\n"+clone.outerHTML;' +
                      'window.parent.postMessage({__sgPrintReply:id,ok:true,html:html},"*");' +
                    '}catch(err){' +
                      'window.parent.postMessage({__sgPrintReply:id,ok:false,err:String(err&&err.message||err)},"*");' +
                    '}' +
                  '})();' +
                '});' +

                // Core VFS bridge
                '(function(){' +
                  // Generic postMessage→Promise for write and list
                  'function _vfsMsg(type,payload){' +
                    'return new Promise(function(res,rej){' +
                      'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                      'payload[type]=id;' +
                      'var rk=type==="__sgVfsWriteReq"?"__sgVfsWriteReply":"__sgVfsListReply";' +
                      'function h(e){if(!e.data||e.data[rk]!==id)return;window.removeEventListener("message",h);' +
                        'if(e.data.ok)res(e.data);else rej(new Error(e.data.err||"VFS error"));}' +
                      'window.addEventListener("message",h);window.parent.postMessage(payload,"*");' +
                    '});' +
                  '}' +
                  // sg.vfs.write
                  'function _write(path,content){' +
                    'var bytes;' +
                    'if(typeof content==="string"){bytes=new TextEncoder().encode(content);}' +
                    'else{bytes=content instanceof Uint8Array?content:new Uint8Array(content);}' +
                    // chunk MUST be a multiple of 3 — otherwise each chunk\'s btoa() output ends
                    // in \'=\' padding and the concatenated string has \'=\'s mid-stream, which the
                    // host\'s atob() rejects as invalid (surfacing as "Bad encoding"). 8192 was 2
                    // mod 3, so any payload over 8 KB failed. 8190 = 3*2730 — well under the
                    // String.fromCharCode.apply argument limit on every browser we care about.
                    'var b64="",chunk=8190;' +
                    'for(var i=0;i<bytes.length;i+=chunk)b64+=btoa(String.fromCharCode.apply(null,bytes.subarray(i,i+chunk)));' +
                    'return _vfsMsg("__sgVfsWriteReq",{path:path,data:b64,encoding:"base64"}).then(function(d){return{path:path,size:d.size};});' +
                  '}' +
                  // sg.vfs.read (strict)
                  'function _read(path){' +
                    'return new Promise(function(res,rej){' +
                      'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                      'function h(e){if(!e.data||e.data.__sgVfsReadReply!==id)return;window.removeEventListener("message",h);' +
                        'if(e.data.ok)res(e.data.buf);' +
                        'else rej(new Error(e.data.err==="ENOENT"?"No such file: "+e.data.path:(e.data.err||"Read failed")));' +
                      '}' +
                      'window.addEventListener("message",h);window.parent.postMessage({__sgVfsReadReq:id,path:path},"*");' +
                    '});' +
                  '}' +
                  'function _readText(path){return _read(path).then(function(buf){return new TextDecoder().decode(buf);});}' +
                  // sg.vfs.list
                  'function _list(path){' +
                    'return _vfsMsg("__sgVfsListReq",{path:path||""})' +
                      '.then(function(d){return d.entries||[];})' +
                      '.catch(function(err){if(err.message==="ENOENT")throw new Error("No such path: "+(path||""));throw err;});' +
                  '}' +
                  // sg.loadCss / sg.loadJs
                  'function _loadCss(path){return _readText(path).then(function(css){var s=document.createElement("style");s.setAttribute("data-sg-loaded",path);s.textContent=css;document.head.appendChild(s);return s;});}' +
                  'function _loadJs(path){return _readText(path).then(function(js){return new Promise(function(res,rej){var s=document.createElement("script");s.setAttribute("data-sg-loaded",path);try{s.textContent=js;document.head.appendChild(s);res(s);}catch(e){rej(e);}});});}' +
                  // Generic command helper (git / auth round-trips)
                  'function _sgCmd(cmdType,payload){' +
                    'return new Promise(function(res,rej){' +
                      'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                      'payload.__sgCmdId=id;payload.__sgCmdType=cmdType;' +
                      'function h(e){if(!e.data||e.data.__sgCmdReply!==id)return;window.removeEventListener("message",h);' +
                        'if(e.data.ok)res(e.data.result);else rej(new Error(e.data.err||"Command failed"));}' +
                      'window.addEventListener("message",h);window.parent.postMessage(payload,"*");' +
                    '});' +
                  '}' +
                  // window.sg.*
                  'window.sg={' +
                    'vfs:{write:_write,read:_read,readText:_readText,list:_list},' +
                    // sg.fs.* — mutations gated by app.json permissions (move/delete/mkdir)
                    'fs:{' +
                      'move:function(from,to){return _sgCmd("fs",{action:"move",from:from,to:to});},' +
                      'delete:function(path){return _sgCmd("fs",{action:"delete",path:path});},' +
                      'mkdir:function(path){return _sgCmd("fs",{action:"mkdir",path:path});}' +
                    '},' +
                    // sg.vault.* — create / manage child vaults. create(opts) takes an opts object
                    // (matches mount(opts)): { label, link:{path}|false, returnKey, custody, seedFrom }.
                    'vault:{' +
                      'create:function(opts){opts=opts||{};return _sgCmd("vault",{action:"create",label:opts.label,link:opts.link,returnKey:opts.returnKey,custody:opts.custody,seedFrom:opts.seedFrom,accessToken:opts.accessToken});},' +
                      // getKey(ref) → {key}: retrieve a custodied key to re-share (always-confirm consent).
                      'getKey:function(ref){return _sgCmd("vault",{action:"getKey",ref:ref});},' +
                      // setAccessToken(ref,value): embed/rotate a backend token (value="inherit"|"<token>").
                      'setAccessToken:function(ref,value){return _sgCmd("vault",{action:"setAccessToken",ref:ref,value:value});},' +
                      // openApp(ref,opts): launch a vault as an app. ref = raw key or a custodied ref.
                      'openApp:function(ref,opts){opts=opts||{};return _sgCmd("vault",{action:"openApp",ref:ref,deepLink:opts.deepLink,target:opts.target});},' +
                      // list() → {vaults:[{ref_id,vault_id,label,tier}]}: roster of managed vaults.
                      'list:function(){return _sgCmd("vault",{action:"list"});},' +
                      'unlink:function(path){return _sgCmd("vault",{action:"unlink",path:path});},' +
                      'delete:function(ref){return _sgCmd("vault",{action:"delete",ref:ref});},' +
                      // ViV Phase 2: mount a child vault for cross-vault reads via this kernel (rw mount → separate brief).
                      'mount:function(opts){return _sgCmd("vault",{action:"mount",prefix:opts&&opts.prefix,ref:opts&&opts.ref,label:opts&&opts.label});},' +
                      'unmount:function(mountId){return _sgCmd("vault",{action:"unmount",mountId:mountId});},' +
                      'mounts:function(){return _sgCmd("vault",{action:"mounts"});},' +
                      // Cross-vault peer wake — ask a mounted child to check its inbox now (C6).
                      'notify:function(mountId,name,payload){return _sgCmd("vault",{action:"notify",mountId:mountId,name:name,payload:payload});}' +
                    '},' +
                    // sg.inbox.* — append-only inbox transport (six verbs, 1:1 with the server).
                    // The kernel holds the keys and attaches the gate header per verb; app.json
                    // permissions.inbox.* decides which verbs are callable.
                    'inbox:{' +
                      'configure:function(o){o=o||{};return _sgCmd("inbox",{action:"configure",append_anchors:o.append_anchors});},' +
                      'append:function(o){o=o||{};return _sgCmd("inbox",{action:"append",vault_id:o.vault_id,append_token:o.append_token,payload:o.payload});},' +
                      'list:function(o){o=o||{};return _sgCmd("inbox",{action:"list",inbox:o.inbox,after_file_id:o.after_file_id,limit:o.limit,include_content:o.include_content});},' +
                      'fetch:function(o){o=o||{};return _sgCmd("inbox",{action:"fetch",inbox:o.inbox,file_ids:o.file_ids});},' +
                      'markProcessed:function(o){o=o||{};return _sgCmd("inbox",{action:"markProcessed",inbox:o.inbox,file_ids:o.file_ids});},' +
                      'purge:function(o){o=o||{};return _sgCmd("inbox",{action:"purge",folder:o.folder,inbox:o.inbox,file_ids:o.file_ids});}' +
                    '},' +
                    // sg.on / sg.off — kernel→app events (see the _sgEvtH registry above).
                    'on:_sgOn,off:_sgOff,' +
                    'loadCss:_loadCss,loadJs:_loadJs,' +
                    // sg.history.* — read past commits / trees / blobs (read-only)
                    'history:{' +
                      'log:function(o){return _sgCmd("history",{action:"log",opts:o||{}});},' +
                      'list:function(c,p){return _sgCmd("history",{action:"list",commitId:c,path:p||""});},' +
                      'read:function(c,p){return _sgCmd("history",{action:"read",commitId:c,path:p});},' +
                      'readText:function(c,p){return _sgCmd("history",{action:"read",commitId:c,path:p}).then(function(b){return new TextDecoder().decode(b);});},' +
                      'readBlob:function(id){return _sgCmd("history",{action:"readBlob",blobId:id});}' +
                    '},' +
                    'app:{' +
                      // context: 'app' here ('/en-gb/app/' full surface). The SG/Vault editor's
                      // inline preview should set 'preview' so apps can feature-detect deliberately
                      // (cross-repo parity work — see brief v0.33.5__brief__vault-preview-app-parity).
                      'context:"app",' +
                      'selfPath:'  + JSON.stringify(currentPath) + ',' +
                      'writable:'  + (writable  ? 'true' : 'false') + ',' +
                      'vaultName:' + JSON.stringify(vaultName) + ',' +
                      'vaultId:'   + JSON.stringify(vaultId)   + ',' +
                      'fileCount:' + fileCount + ',' +
                      'totalSize:0' +
                    '},' +
                    'sync:{' +
                      'status:function(){return _sgCmd("git",{action:"status"}).then(function(s){return{current:!s.ahead&&!s.behind&&!s.diverged,serverHasNewer:s.behind>0||!!s.diverged,localHasUnsynced:s.ahead>0,writable:!!s.writable};});},' +
                      'check:function(){return _sgCmd("git",{action:"check"});},' +
                      'push:function(){return _sgCmd("git",{action:"push"});},' +
                      'pull:function(){return _sgCmd("git",{action:"pull"});},' +
                      'refresh:function(){return _sgCmd("git",{action:"syncRefresh"});}' +
                    '},' +
                    'git:(function(){var _w=false;function w(){if(!_w){_w=true;console.warn("[sg-vfs] sg.git.* is deprecated, use sg.sync.*");}}return{status:function(){w();return _sgCmd("git",{action:"status"});},check:function(){w();return _sgCmd("git",{action:"check"});},push:function(){w();return _sgCmd("git",{action:"push"});},pull:function(){w();return _sgCmd("git",{action:"pull"});}};})(),' +
                    'auth:{' +
                      'hasKey:' + (writable ? 'true' : 'false') + ',' +
                      'setKey:function(key){return _sgCmd("auth",{action:"setKey",key:key});},' +
                      'check:function(key){return _sgCmd("auth",{action:"check",key:key});},' +
                      'clear:function(){return _sgCmd("auth",{action:"clear"});}' +
                    '},' +
                    'ui:{' +
                      'message:function(text,type,opts){opts=opts||{};var h=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);var ttl=opts.ttl===null?null:(typeof opts.ttl==="number"?opts.ttl:3000);window.parent.postMessage({__sgUiMsg:{handle:h,text:String(text||""),msgType:type||"info",ttl:ttl}},"*");return h;},' +
                      'dismiss:function(h){window.parent.postMessage({__sgUiMsg:{handle:h,dismiss:true}},"*");},' +
                      // ask the user (on the HUD) to grant a declared-but-consent-gated verb; resolves {granted}
                      'requestPermission:function(verb,path){return _sgCmd("ui",{action:"requestPermission",verb:verb,path:path});}' +
                    '},' +
                    // sg.state.* — device-local preferences (theme, panel widths, "don't show again"
                    // dismissals). Backed by the TOP-LEVEL kernel's localStorage, namespaced as
                    // sg-app-state:<vaultId>:<appEntryPath>:<key>. Values are JSON-encoded, capped at
                    // 64 KiB per key. Apps that want VAULT-PERSISTENT state (travels with the vault,
                    // visible to other devices opening the same vault key) should continue to use
                    // sg.fs.write(".app-state/...") directly. **Doctrine deviation note:** the ViV
                    // impl pack's repair checklist (item #1) prescribes sg.vfs("app-state/<key>.json");
                    // we deliberately chose localStorage for the device-local-prefs use case to avoid
                    // a vault write on every theme toggle. Documented in
                    // team/comms/changelog/05/30/changelog__app-state-print-rpc.md.
                    'state:{' +
                      'get:function(key){return _sgCmd("state",{action:"get",key:String(key||"")});},' +
                      'set:function(key,value){return _sgCmd("state",{action:"set",key:String(key||""),value:value});},' +
                      'remove:function(key){return _sgCmd("state",{action:"remove",key:String(key||"")});},' +
                      'clear:function(){return _sgCmd("state",{action:"clear"});},' +
                      'keys:function(){return _sgCmd("state",{action:"keys"});}' +
                    '}' +
                  '};' +
                  'window.sgVault={writeFile:_write,readFile:_readText,listFiles:function(){return _list("");},writable:window.sg.app.writable,selfPath:window.sg.app.selfPath};' +

                  // ── img.src auto-patch ────────────────────────────────────────────────
                  // Intercept HTMLImageElement.prototype.src setter so vault-relative paths
                  // like  img.src = "photos/web/hero.webp"  are transparently decrypted and
                  // served as blob: URLs — without the HTML author needing to call sg.vfs.read.
                  //
                  // Path logic:
                  //   • Absolute-protocol URLs (blob:, data:, http:, https:, //) → pass through
                  //   • Absolute vault paths  (/photos/…)  → strip leading /, exact VFS match
                  //   • Relative paths        (photos/…)   → resolve against this page's dir
                  //     (_hd injected at bridge-build time), then prefix "/" so the parent
                  //     handler treats the result as absolute (avoids double-resolution).
                  //
                  // The resolved path is sent to the parent via _read() which postMessages
                  // {__sgVfsReadReq, path} — this call will appear in the Bridge debug tab.
                  '(function(){' +
                    'var _hd=' + JSON.stringify(htmlDir) + ';' +
                    'function _rp(b,r){if(!b)return r;var p=(b+r).split("/"),o=[];' +
                      'for(var i=0;i<p.length;i++){if(p[i]==="..")o.pop();' +
                      'else if(p[i]!=="."&&p[i]!=="")o.push(p[i]);}return o.join("/");}' +
                    'function _mt(e){return({webp:"image/webp",jpg:"image/jpeg",jpeg:"image/jpeg",' +
                      'png:"image/png",gif:"image/gif",svg:"image/svg+xml",' +
                      'avif:"image/avif",ico:"image/x-icon",bmp:"image/bmp",tiff:"image/tiff",' +
                      'tif:"image/tiff",heic:"image/heic",heif:"image/heif"}[e]||"application/octet-stream");}' +
                    'try{' +
                      'var _d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");' +
                      'if(_d&&_d.set){' +
                        'Object.defineProperty(HTMLImageElement.prototype,"src",{' +
                          'get:_d.get,' +
                          'configurable:true,' +
                          'set:function(v){' +
                            'var _i=this;' +
                            // Pass through anything with a protocol scheme or protocol-relative URL
                            'if(!v||v.indexOf(":")!==-1||v.slice(0,2)==="//"){_d.set.call(_i,v);return;}' +
                            // Resolve to absolute vault path (prefix "/" = absolute, skip parent re-resolution)
                            'var vp=v.charAt(0)==="/"?v:("/"+_rp(_hd,v));' +
                            '_read(vp)' +
                              '.then(function(b){' +
                                'var ext=vp.split("/").pop().split(".").pop().toLowerCase();' +
                                'var u=URL.createObjectURL(new Blob([b],{type:_mt(ext)}));' +
                                '_d.set.call(_i,u);' +
                              '})' +
                              '.catch(function(err){' +
                                // Fall back to native so non-vault images (CDN, etc.) still work
                                'console.warn("[sg-vfs] img.src not in vault, falling back:",vp,err.message);' +
                                '_d.set.call(_i,v);' +
                              '});' +
                          '}' +
                        '});' +
                      '}' +
                    '}catch(e){console.warn("[sg-vfs] img.src patch failed:",e.message);}' +
                  '})();' +

                  'console.log("[sg-vfs] ready | writable=' + (writable ? 'true' : 'false') + ' | vaultName=' + vaultName.replace(/'/g, "\\'") + ' | page: /en-gb/app");' +
                '})();' +
              '})();<\/script>';
        }

        // ── VFS bridge parent-side handlers ───────────────────────────────────────────

        _setupVfsBridgeHandlers(iframeEl, dataSource) {
            var self = this;

            // Transparency for sub-vaults: wrap the data source in a CompositeDataSource so the
            // app's runtime sg.vfs.* calls can read inner-vault files by path (auto-opened
            // read-only via stored ro-records — no prompt). Identical behaviour when the vault
            // has no sub-vaults (the composite delegates everything to the root). Degrades
            // gracefully if the script isn't loaded.
            var compositeReady = Promise.resolve();
            if (typeof CompositeDataSource !== 'undefined' && !(dataSource instanceof CompositeDataSource)) {
                try {
                    var composite = new CompositeDataSource(dataSource, { keyProvider: null });  // null = no prompt in app context
                    compositeReady = composite.scan().catch(function () {});   // register *.link.json mounts
                    dataSource = composite;
                } catch (_) { /* keep the plain data source */ }
            }

            // Sub-vault transparency for app reads: before serving a list/read, make sure the
            // sub-vault covering that path is opened (read-only, silent). getFileList only exposes
            // an OPENED mount's inner files, so without this a read of a collapsed sub-vault path
            // would ENOENT at the file-list pre-check before getFileBytes (which auto-opens) runs.
            // No-op for ordinary paths and when there are no sub-vaults.
            function ensureMountOpen(p) {
                try {
                    if (dataSource && typeof dataSource._mountForPath === 'function'
                        && typeof dataSource.loadFolder === 'function'
                        && dataSource._mountForPath(p)) {
                        return Promise.resolve(dataSource.loadFolder(p)).catch(function () {});
                    }
                } catch (_) {}
                return Promise.resolve();
            }

            // Operator REPL surface (ViV pack §3.4). Thin async glue over the SAME composite
            // data source the running app sees (so read-through sub-vaults resolve identically)
            // + the KernelParent for mount/broker inspection. Refreshed on every mount/nav.
            // Pure parse/format is SgReplCore; this only executes. No new mechanism — a consumer.
            function _replSplit(p) {
                var n = (window.SgReplCore ? SgReplCore.normPath(p) : String(p || '').replace(/^\/+/, ''));
                var i = n.lastIndexOf('/');
                return { folder: i === -1 ? '' : n.slice(0, i), file: i === -1 ? n : n.slice(i + 1), path: n };
            }
            window._appDebug = window._appDebug || {};
            window._appDebug.repl = {
                get writable() { return !!dataSource.writable; },
                list: function (p) { var n = (window.SgReplCore ? SgReplCore.normPath(p) : ''); return ensureMountOpen(n).then(function () { return dataSource.getFileList(); }); },
                read: function (p) {
                    var s = _replSplit(p);
                    if (!s.file) throw new Error('not a file: ' + s.path);
                    return ensureMountOpen(s.path).then(function () { return dataSource.getFileBytes(s.path); })
                        .then(function (buf) { return new TextDecoder().decode(buf); });
                },
                write: function (p, text) {
                    if (!dataSource.writable) return Promise.reject(new Error('read-only vault'));
                    var s = _replSplit(p);
                    if (!s.file) return Promise.reject(new Error('not a file: ' + s.path));
                    if (AppPermissions.isFloor('write', s.path)) return Promise.reject(new Error('protected path (.vault floor)'));
                    var bytes = new TextEncoder().encode(String(text == null ? '' : text)).buffer;
                    return Promise.resolve(dataSource.saveFile(s.folder, s.file, bytes)).then(function () { return { ok: true, path: s.path }; });
                },
                del: function (p) {
                    if (!dataSource.writable) return Promise.reject(new Error('read-only vault'));
                    var s = _replSplit(p);
                    if (!s.file) return Promise.reject(new Error('not a file: ' + s.path));
                    if (AppPermissions.isFloor('write', s.path)) return Promise.reject(new Error('protected path (.vault floor)'));
                    return Promise.resolve(dataSource.deleteFile(s.folder, s.file)).then(function () { return { ok: true, path: s.path }; });
                },
                mounts:    function () { var kp = self._kernelParent; return kp ? kp.list() : []; },
                brokerLog: function () { var kp = self._kernelParent; return kp && kp.broker ? kp.broker.log() : []; }
            };

            var handler = function (e) {
                if (!e.data)                              return;
                if (e.source !== iframeEl.contentWindow)  return;

                var fileList = dataSource.getFileList();

                // ── Navigation ────────────────────────────────────────────────
                // All in-vault link clicks land here. The body is in `_navigateToPath` so the
                // HUD back/forward arrows can re-issue navigations without going through the
                // bridge (they call `_navBack` / `_navForward` directly on the AppShell instance).
                if (e.data.__sgVfsNavReq) {
                    self._navigateToPath(e.data.__sgVfsNavReq, { pushHistory: true });
                    return;
                }

                // ── Write ─────────────────────────────────────────────────────
                if (e.data.__sgVfsWriteReq) {
                    var writeId  = e.data.__sgVfsWriteReq;
                    var writeSrc = e.source;
                    function wReply(ok, payload) {
                        try { writeSrc.postMessage(Object.assign({ __sgVfsWriteReply: writeId, ok: ok }, payload), '*'); } catch (_) {}
                    }
                    if (!dataSource.writable) { wReply(false, { err: 'Read-only vault' }); return; }
                    var wBytes;
                    try {
                        var bin = atob(e.data.data || '');
                        wBytes  = new Uint8Array(bin.length);
                        for (var i = 0; i < bin.length; i++) wBytes[i] = bin.charCodeAt(i);
                    } catch (err) {
                        // atob() rejects if the base64 string has '=' padding mid-stream — which is
                        // what happened when the sender chunked at a non-multiple of 3. The sender
                        // now uses chunk=8190, but surface a precise error if anything else corrupts
                        // the payload (so the next ticket isn\'t another 8-KB witch-hunt).
                        var rawLen = (e.data.data || '').length;
                        wReply(false, { err: 'Bad base64 payload (' + rawLen + ' chars): ' + (err && err.message || err) + '. The sg.vfs.write encoder must chunk in multiples of 3.', code: 'EBADENC' });
                        return;
                    }
                    // Pre-Lambda-413 friendly guard. A single sg.vfs.write becomes one POST
                    // /api/vault/batch carrying the new blob + new tree + commit + ref + index,
                    // each base64-encoded inside JSON. AWS Lambda URL Functions cap the request
                    // payload at 6 MB; base64 inflates ~1.33x and the other batch entries take
                    // ~10–50 KB. 3 MB plaintext leaves comfortable headroom; above that, the
                    // app would get an opaque 413 mid-batch (with a partial corrupted state).
                    // A presigned-PUT large-write path is the proper fix — until then, refuse
                    // here with a clear EFBIG so the app author knows exactly what to do.
                    var MAX_WRITE_BYTES = 3 * 1024 * 1024;
                    if (wBytes.byteLength > MAX_WRITE_BYTES) {
                        wReply(false, {
                            err:  'File too large for a single write: ' + wBytes.byteLength
                                + ' bytes > ' + MAX_WRITE_BYTES + ' (~3 MB). The vault batch '
                                + 'endpoint carries the blob+tree+commit+ref base64-in-JSON, so '
                                + 'AWS Lambda\'s 6 MB request cap with ~1.33x base64 inflation '
                                + 'means a single write tops out around 3 MB. Large-file write '
                                + '(presigned-PUT) is not yet supported.',
                            code: 'EFBIG',
                            limit: MAX_WRITE_BYTES,
                            actual: wBytes.byteLength
                        });
                        self._emitBridgeCall('vfs.write', { path: e.data.path || '', ok: false, err: 'EFBIG', bytes: wBytes.byteLength });
                        return;
                    }
                    var wPath     = e.data.path || '';
                    var wResolved = wPath.startsWith('/') ? wPath.slice(1) : self._resolvePath(self._htmlDir, wPath);
                    // Floor is unconditional regardless of mount membership — the .vault floor
                    // is enforced before the path leaves this parent.
                    if (AppPermissions.isFloor('write', wResolved)) { wReply(false, { err: 'Protected path', code: 'EPROTECTED' }); self._emitBridgeCall('vfs.write', { path: wResolved, ok: false, err: 'EPROTECTED' }); return; }
                    // ViV Phase 2 / pack §4.4: mount resolve BEFORE the parent's own fs.write
                    // grant. Crossing a mount, the parent's authorization is the broker (Edge 2)
                    // plus the child's policy — NOT a literal fs.write match on the local path.
                    // (M2 fix: previously we applied the parent's fs.write to the mounts/* path,
                    // which forced the parent app.json to add a path it has no business writing to.)
                    if (self._mounts && self._mounts.resolve(wResolved)) {
                        self._handleVfsViv('write', { path: wResolved, data: wBytes })
                            .then(function () { wReply(true, { size: wBytes.byteLength, mounted: true }); self._emitBridgeCall('vfs.write', { path: wResolved, ok: true, mounted: true }); })
                            .catch(function (err) { wReply(false, { err: err.message || 'Write failed', code: err.code || 'EPROTO' }); self._emitBridgeCall('vfs.write', { path: wResolved, ok: false, err: err.code || err.message }); });
                        return;
                    }
                    if (!self._can('fs.write', wResolved)) { wReply(false, { err: 'Permission denied', code: 'EPERM' }); self._emitBridgeCall('vfs.write', { path: wResolved, ok: false, err: 'EPERM' }); return; }
                    var wSlash    = wResolved.lastIndexOf('/');
                    var wDir      = wSlash > 0 ? '/' + wResolved.slice(0, wSlash) : '/';
                    var wFile     = wResolved.slice(wSlash + 1);
                    var wSize     = wBytes.byteLength;
                    var _t0w = performance.now();
                    dataSource.saveFile(wDir, wFile, wBytes.buffer)
                        .then(function () {
                            wReply(true, { size: wSize });
                            self._emitBridgeCall('vfs.write', { path: wResolved, bytes: wSize, ms: Math.round(performance.now() - _t0w), ok: true });
                            self._scheduleAutoPush();   // sync app writes to the server (debounced)
                        })
                        .catch(function (err) {
                            wReply(false, { err: err.message || 'Write failed' });
                            self._emitBridgeCall('vfs.write', { path: wResolved, ms: Math.round(performance.now() - _t0w), ok: false, err: err.message });
                        });
                    return;
                }

                // ── List ──────────────────────────────────────────────────────
                if (e.data.__sgVfsListReq) {
                    var listId  = e.data.__sgVfsListReq;
                    var listSrc = e.source;
                    var prefix  = (e.data.path || '').replace(/^\//, '');
                    // Floor: never reveal .vault/** — reject a direct list of it (no existence oracle).
                    if (AppPermissions.hasVaultSegment(prefix)) { try { listSrc.postMessage({ __sgVfsListReply: listId, ok: false, err: 'ENOENT', path: prefix }, '*'); } catch (_) {} return; }
                    // M3 fix: ViV Phase 2 — cross-mount list. If the prefix is under a mount,
                    // relay through the child kernel (parity with read/write above).
                    if (prefix && self._mounts && self._mounts.resolve(prefix)) {
                        self._handleVfsViv('list', { path: prefix })
                            .then(function (entries) {
                                var listed = (entries || []).map(function (f) {
                                    return { path: f.path, name: f.name || f.path, size: f.size || 0, type: f.dir ? 'folder' : 'file' };
                                });
                                self._emitBridgeCall('vfs.list', { path: prefix, count: listed.length, ok: true, mounted: true });
                                try { listSrc.postMessage({ __sgVfsListReply: listId, ok: true, entries: listed, mounted: true }, '*'); } catch (_) {}
                            })
                            .catch(function (err) {
                                self._emitBridgeCall('vfs.list', { path: prefix, ok: false, err: err.code || err.message });
                                try { listSrc.postMessage({ __sgVfsListReply: listId, ok: false, err: err.message || 'List failed', code: err.code || 'EPROTO', path: prefix }, '*'); } catch (_) {}
                            });
                        return;
                    }
                    compositeReady.then(function () { return prefix ? ensureMountOpen(prefix) : null; }).then(function () {
                        var entries = dataSource.getFileList().filter(function (f) {
                            return !AppPermissions.hasVaultSegment(f.path) && self._can('fs.read', f.path);   // floor + read grant
                        });
                        if (prefix) {
                            var normPfx  = prefix.endsWith('/') ? prefix : prefix + '/';
                            var filtered = entries.filter(function (f) {
                                return f.path === prefix || f.path === normPfx || f.path.startsWith(normPfx);
                            });
                            if (filtered.length === 0) {
                                try { e.source.postMessage({ __sgVfsListReply: listId, ok: false, err: 'ENOENT', path: prefix }, '*'); } catch (_) {}
                                return;
                            }
                            entries = filtered;
                        }
                        var listed = entries.map(function (f) {
                            return { path: f.path, name: f.name || f.path, size: f.size || 0, type: f.dir ? 'folder' : 'file' };
                        });
                        self._emitBridgeCall('vfs.list', { path: (e.data.path || ''), count: listed.length, ok: true });
                        try { e.source.postMessage({ __sgVfsListReply: listId, ok: true, entries: listed }, '*'); } catch (_) {}
                    });
                    return;
                }

                // ── Read (strict) ─────────────────────────────────────────────
                if (e.data.__sgVfsReadReq) {
                    var readId  = e.data.__sgVfsReadReq;
                    var readSrc = e.source;
                    function rReply(ok, payload) {
                        try { readSrc.postMessage(Object.assign({ __sgVfsReadReply: readId, ok: ok }, payload), '*'); } catch (_) {}
                    }
                    var rPath     = e.data.path || '';
                    var rResolved = rPath.startsWith('/') ? rPath.slice(1) : self._resolvePath(self._htmlDir, rPath);
                    if (AppPermissions.isFloor('read', rResolved)) { rReply(false, { err: 'Protected path', code: 'EPROTECTED' }); self._emitBridgeCall('vfs.read', { path: rResolved, ok: false, err: 'EPROTECTED' }); return; }
                    // M2 (read mirror): mount resolve BEFORE the parent's own fs.read grant.
                    if (self._mounts && self._mounts.resolve(rResolved)) {
                        self._handleVfsViv('read', { path: rResolved })
                            .then(function (buf) { rReply(true, { buf: buf, path: rResolved, mounted: true }); self._emitBridgeCall('vfs.read', { path: rResolved, ok: true, bytes: (buf && buf.byteLength) || 0, mounted: true }); })
                            .catch(function (err) { rReply(false, { err: err.message || 'Read failed', code: err.code || 'EPROTO' }); self._emitBridgeCall('vfs.read', { path: rResolved, ok: false, err: err.code || err.message }); });
                        return;
                    }
                    if (!self._can('fs.read', rResolved)) { rReply(false, { err: 'Permission denied', code: 'EPERM' }); self._emitBridgeCall('vfs.read', { path: rResolved, ok: false, err: 'EPERM' }); return; }
                    compositeReady.then(function () { return ensureMountOpen(rResolved); }).then(function () {
                        var rMatch = self._findEntryStrict(dataSource.getFileList(), rResolved);
                        if (!rMatch) { rReply(false, { err: 'ENOENT', path: rResolved }); return; }
                        var _t0r = performance.now();
                        return dataSource.getFileBytes(rMatch.path).then(function (buf) {
                            rReply(true, { buf: buf, path: rMatch.path });
                            self._emitBridgeCall('vfs.read', { path: rResolved, bytes: buf.byteLength, ms: Math.round(performance.now() - _t0r), ok: true });
                        }).catch(function (err) {
                            rReply(false, { err: err.message || 'Read failed' });
                            self._emitBridgeCall('vfs.read', { path: rResolved, ms: Math.round(performance.now() - _t0r), ok: false, err: err.message });
                        });
                    });
                    return;
                }

                // ── git / auth commands ───────────────────────────────────────
                if (e.data.__sgCmdType) {
                    var cmdId  = e.data.__sgCmdId;
                    var cmdSrc = e.source;
                    function cmdReply(ok, result, errMsg) {
                        try { cmdSrc.postMessage({ __sgCmdReply: cmdId, ok: ok, result: result || null, err: errMsg || null }, '*'); } catch (_) {}
                    }
                    var vault    = self._vault;
                    var endpoint = (window.SG_ENDPOINT
                        || (function(){ try{ return sessionStorage.getItem('sg-vault-endpoint'); }catch(_){ return null; } })()
                        || 'https://dev.send.sgraph.ai').replace(/\/$/, '');

                    if (e.data.__sgCmdType === 'history') {
                        var ha = e.data.action;
                        if (ha === 'log') {
                            vault.logCommits(e.data.opts || {}).then(function (r) { cmdReply(true, r); }).catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        if (ha === 'list') {
                            vault.listTreeAt(e.data.commitId, e.data.path || '').then(function (r) { cmdReply(true, r); }).catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        if (ha === 'read') {
                            vault.readFileAt(e.data.commitId, e.data.path).then(function (buf) { cmdReply(true, buf); }).catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        if (ha === 'readBlob') {
                            vault.readBlob(e.data.blobId).then(function (buf) { cmdReply(true, buf); }).catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        cmdReply(false, null, 'Unknown history action: ' + ha);
                        return;
                    }

                    // ── inbox transport (configure / append / list / fetch / markProcessed / purge) ──
                    // The kernel holds the keys; SGInbox attaches the gate header per verb.
                    // app.json permissions.inbox.* decides which verbs the app may call.
                    if (e.data.__sgCmdType === 'inbox') {
                        var ibAct = e.data.action;
                        var ibCap = { configure: 'inbox.configure', append: 'inbox.append', list: 'inbox.list',
                                      fetch: 'inbox.read', markProcessed: 'inbox.markProcessed', purge: 'inbox.purge' }[ibAct];
                        if (!ibCap) { cmdReply(false, null, 'Unknown inbox action: ' + ibAct); return; }
                        if (!self._can(ibCap, '')) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('inbox.' + ibAct, { ok: false, err: 'EPERM' }); return; }
                        var ibData = e.data;
                        self._getInbox().then(function (inbox) {
                            if (!inbox) throw new Error('inbox transport unavailable');
                            switch (ibAct) {
                                case 'configure':     return inbox.configure({ append_anchors: ibData.append_anchors });
                                case 'append':        return inbox.append({ vault_id: ibData.vault_id, append_token: ibData.append_token, payload: ibData.payload });
                                case 'list':          return inbox.list({ inbox: ibData.inbox, after_file_id: ibData.after_file_id, limit: ibData.limit, include_content: ibData.include_content });
                                case 'fetch':         return inbox.fetch({ inbox: ibData.inbox, file_ids: ibData.file_ids });
                                case 'markProcessed': return inbox.markProcessed({ inbox: ibData.inbox, file_ids: ibData.file_ids });
                                case 'purge':         return inbox.purge({ folder: ibData.folder, inbox: ibData.inbox, file_ids: ibData.file_ids });
                            }
                        }).then(function (r) {
                            cmdReply(true, r); self._emitBridgeCall('inbox.' + ibAct, { ok: true });
                        }).catch(function (err) {
                            cmdReply(false, null, (err && err.message) || String(err));
                            self._emitBridgeCall('inbox.' + ibAct, { ok: false, err: (err && err.code) || (err && err.message) || 'error' });
                        });
                        return;
                    }

                    // ── fs mutations (move / delete / mkdir) ──────────────────────
                    if (e.data.__sgCmdType === 'fs') {
                        var fsAct = e.data.action;
                        if (!dataSource.writable) { cmdReply(false, null, 'Read-only vault'); return; }   // EREADONLY (no token)
                        var _np = function (p) { return AppPermissions.normalizePath(p || ''); };
                        var _split = function (n) { var s = n.lastIndexOf('/'); return { dir: s > 0 ? '/' + n.slice(0, s) : '/', name: n.slice(s + 1) }; };
                        if (fsAct === 'move') {
                            var mFrom = _np(e.data.from), mTo = _np(e.data.to);
                            if (!self._can('fs.move', mFrom) || !self._can('fs.move', mTo)) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('fs.move', { from: mFrom, to: mTo, ok: false, err: 'EPERM' }); return; }
                            var f = _split(mFrom), t = _split(mTo);
                            var p = (f.dir === t.dir)
                                ? dataSource.renameFile(f.dir, f.name, t.name)
                                : dataSource.moveFile(f.dir, f.name, t.dir).then(function () { if (t.name !== f.name) return dataSource.renameFile(t.dir, f.name, t.name); });
                            p.then(function () { cmdReply(true, { moved: true }); self._emitBridgeCall('fs.move', { from: mFrom, to: mTo, ok: true }); self._scheduleAutoPush(); })
                             .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('fs.move', { from: mFrom, to: mTo, ok: false, err: err.message }); });
                            return;
                        }
                        if (fsAct === 'delete') {
                            var dPath = _np(e.data.path); var d = _split(dPath);
                            if (!self._can('fs.delete', dPath)) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('fs.delete', { path: dPath, ok: false, err: 'EPERM' }); return; }
                            dataSource.deleteFile(d.dir, d.name)
                                .then(function () { cmdReply(true, { deleted: true }); self._emitBridgeCall('fs.delete', { path: dPath, ok: true }); self._scheduleAutoPush(); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('fs.delete', { path: dPath, ok: false, err: err.message }); });
                            return;
                        }
                        if (fsAct === 'mkdir') {
                            var kPath = _np(e.data.path);
                            if (!self._can('fs.mkdir', kPath)) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('fs.mkdir', { path: kPath, ok: false, err: 'EPERM' }); return; }
                            dataSource.createFolder('/' + kPath)
                                .then(function () { cmdReply(true, { created: true }); self._emitBridgeCall('fs.mkdir', { path: kPath, ok: true }); self._scheduleAutoPush(); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('fs.mkdir', { path: kPath, ok: false, err: err.message }); });
                            return;
                        }
                        cmdReply(false, null, 'Unsupported fs action: ' + fsAct);
                        return;
                    }

                    // ── ui: runtime permission request (consent on the HUD) ───────
                    if (e.data.__sgCmdType === 'ui') {
                        var uiAct = e.data.action;
                        if (uiAct === 'requestPermission') {
                            var rVerb = String(e.data.verb || ''), rPath = e.data.path || '';
                            var rAct  = rVerb.indexOf('.') > -1 ? rVerb.slice(rVerb.indexOf('.') + 1) : rVerb;
                            if (AppPermissions.isFloor(rAct, rPath)) { cmdReply(false, null, 'Protected path'); return; }
                            // app.json is a hard ceiling: can only request a verb the manifest declares.
                            if (!AppPermissions.can(self._perm, rVerb, rPath)) { cmdReply(false, null, 'Permission not declared'); self._emitBridgeCall('ui.requestPermission', { verb: rVerb, ok: false, err: 'EPERM' }); return; }
                            if (rVerb === 'vault.create' || rVerb === 'vault.delete') {
                                self._consent(rVerb, rPath).then(function (ok) { cmdReply(true, { granted: ok }); self._emitBridgeCall('ui.requestPermission', { verb: rVerb, ok: true, granted: ok }); });
                            } else {
                                cmdReply(true, { granted: true }); self._emitBridgeCall('ui.requestPermission', { verb: rVerb, ok: true, granted: true });
                            }
                            return;
                        }
                        cmdReply(false, null, 'Unsupported ui action: ' + uiAct);
                        return;
                    }

                    // ── vault lifecycle (create / unlink / delete) ────────────────
                    if (e.data.__sgCmdType === 'vault') {
                        var vAct  = e.data.action;
                        if (!dataSource.writable) { cmdReply(false, null, 'Read-only vault'); return; }   // EREADONLY
                        var vPath = AppPermissions.normalizePath(e.data.path || '');
                        if (vAct === 'create') {
                            var cLink      = e.data.link;
                            var cLinkPath  = (cLink && cLink.path != null) ? AppPermissions.normalizePath(cLink.path) : '';
                            var cReturnKey = e.data.returnKey === true;
                            var cOpts = { label: String(e.data.label || 'vault'), link: cLink,
                                          returnKey: cReturnKey, custody: e.data.custody !== false, seedFrom: e.data.seedFrom,
                                          accessToken: e.data.accessToken };
                            // gate: linked create needs vault.create on the path; standalone needs vault.standalone
                            if (cLink && cLink.path != null) {
                                if (!self._can('vault.create', cLinkPath)) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.create', { path: cLinkPath, ok: false, err: 'EPERM' }); return; }
                            } else {
                                if (!self._can('vault.standalone', '')) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.create', { ok: false, err: 'EPERM', standalone: true }); return; }
                            }
                            // gate: returning the key needs the stronger grant (createKey on the path, or standalone)
                            if (cReturnKey) {
                                var keyOk = (cLink && cLink.path != null) ? self._can('vault.createKey', cLinkPath) : self._can('vault.standalone', '');
                                if (!keyOk) { cmdReply(false, null, 'Permission denied (createKey)'); self._emitBridgeCall('vault.create', { path: cLinkPath, ok: false, err: 'EPERM' }); return; }
                            }
                            // gate: embedding a backend access token needs vault.embedAccessToken
                            if (cOpts.accessToken) {
                                if (!self._can('vault.embedAccessToken', cLinkPath)) { cmdReply(false, null, 'Permission denied (embedAccessToken)'); self._emitBridgeCall('vault.create', { path: cLinkPath, ok: false, err: 'EPERM' }); return; }
                            }
                            // gate: seedFrom (skip for raw keys — possession is authority, Q4)
                            if (cOpts.seedFrom && String(cOpts.seedFrom).indexOf(':') === -1) {
                                var sgPath = String(cOpts.seedFrom).indexOf('self:') === 0 ? AppPermissions.normalizePath(String(cOpts.seedFrom).slice(5)) : String(cOpts.seedFrom);
                                if (!self._can('vault.seedFrom', sgPath)) { cmdReply(false, null, 'Permission denied (seedFrom)'); self._emitBridgeCall('vault.create', { ok: false, err: 'EPERM', seedFrom: cOpts.seedFrom }); return; }
                            }
                            // key-return ALWAYS re-confirms (vault.createKey); plain create one-time cached
                            var cVerb = cReturnKey ? 'vault.createKey' : 'vault.create';
                            self._consent(cVerb, cLinkPath).then(function (ok) {
                                if (!ok) { cmdReply(false, null, 'Consent declined'); self._emitBridgeCall('vault.create', { path: cLinkPath, ok: false, err: 'ECONSENT' }); return; }
                                return self._createChildVault(cOpts).then(function (res) {
                                    cmdReply(true, res);
                                    self._emitBridgeCall('vault.create', { path: cLinkPath, ok: true, vault_id: res.vault_id, returnedKey: !!res.key, custody: cOpts.custody, writableLink: !!res.writable_link });   // NEVER log the key/token
                                });
                            }).catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.create', { path: cLinkPath, ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'getKey') {
                            var gkRef    = String(e.data.ref || '');
                            var ckGrant  = self._perm && self._perm.vault && self._perm.vault.createKey;
                            var canGetKey = (ckGrant === true) || (Array.isArray(ckGrant) && ckGrant.length > 0);
                            if (!canGetKey) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.getKey', { ref: gkRef, ok: false, err: 'EPERM' }); return; }
                            self._consent('vault.createKey', gkRef).then(function (ok) {
                                if (!ok) { cmdReply(false, null, 'Consent declined'); self._emitBridgeCall('vault.getKey', { ref: gkRef, ok: false, err: 'ECONSENT' }); return; }
                                return self._getVaultKey(gkRef).then(function (res) {
                                    cmdReply(true, res); self._emitBridgeCall('vault.getKey', { ref: gkRef, ok: true, returnedKey: true });   // NEVER log the key
                                });
                            }).catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.getKey', { ref: gkRef, ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'openApp') {
                            if (!self._can('vault.openApp', '')) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.openApp', { ok: false, err: 'EPERM' }); return; }
                            self._openAppVault(e.data.ref, { deepLink: e.data.deepLink, target: e.data.target })
                                .then(function (res) { cmdReply(true, res); self._emitBridgeCall('vault.openApp', { ok: true, opened: res.opened }); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.openApp', { ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'list') {
                            self._listChildVaults()
                                .then(function (res) { cmdReply(true, { vaults: res }); self._emitBridgeCall('vault.list', { ok: true, count: res.length }); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.list', { ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'setAccessToken') {
                            var stRef = String(e.data.ref || '');
                            if (!self._can('vault.embedAccessToken', '')) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.setAccessToken', { ref: stRef, ok: false, err: 'EPERM' }); return; }
                            self._consent('vault.embedAccessToken', stRef).then(function (ok) {
                                if (!ok) { cmdReply(false, null, 'Consent declined'); self._emitBridgeCall('vault.setAccessToken', { ref: stRef, ok: false, err: 'ECONSENT' }); return; }
                                return self._setVaultAccessToken(stRef, e.data.value).then(function (res) {
                                    cmdReply(true, res); self._emitBridgeCall('vault.setAccessToken', { ref: stRef, ok: true });   // NEVER log the token
                                });
                            }).catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.setAccessToken', { ref: stRef, ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'unlink') {
                            if (!self._can('vault.unlink', vPath)) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.unlink', { path: vPath, ok: false, err: 'EPERM' }); return; }
                            self._unlinkChildVault(vPath)
                                .then(function (res) { cmdReply(true, res); self._emitBridgeCall('vault.unlink', { path: vPath, ok: true }); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.unlink', { path: vPath, ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'delete') {
                            // Key custody is solved by the owner-secret store; the key is retrieved
                            // kernel-side to authorise teardown. Server-side destroy needs
                            // SGVault.destroy() — if absent, the custody record + link are removed and
                            // { server_teardown:false } is reported (the server vault is retained until
                            // the teardown endpoint ships — see dev plan §16). Always-confirm consent.
                            var dRef = String(e.data.ref || e.data.path || '');
                            if (!self._can('vault.delete', dRef)) { cmdReply(false, null, 'Permission denied'); self._emitBridgeCall('vault.delete', { ref: dRef, ok: false, err: 'EPERM' }); return; }
                            self._consent('vault.delete', dRef).then(function (ok) {
                                if (!ok) { cmdReply(false, null, 'Consent declined'); self._emitBridgeCall('vault.delete', { ref: dRef, ok: false, err: 'ECONSENT' }); return; }
                                return self._deleteChildVault(dRef).then(function (res) {
                                    cmdReply(true, res); self._emitBridgeCall('vault.delete', { ref: dRef, ok: true, server_teardown: res.server_teardown });
                                });
                            }).catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.delete', { ref: dRef, ok: false, err: err.message }); });
                            return;
                        }
                        // ── ViV Phase 2: vault.mount / unmount / mounts ────────────────
                        if (vAct === 'mount') {
                            var mPrefix = AppPermissions.normalizePath(e.data.prefix || '');
                            var mRef    = String(e.data.ref || '');
                            var mLabel  = String(e.data.label || mRef || 'mount');
                            if (!mPrefix || !mRef) { cmdReply(false, null, 'mount: prefix + ref required'); return; }
                            if (!self._can('vault.mount', mPrefix)) {
                                cmdReply(false, null, 'Permission denied');
                                self._emitBridgeCall('vault.mount', { prefix: mPrefix, ref: mRef, ok: false, err: 'EPERM' });
                                return;
                            }
                            self._mountChildVault({ prefix: mPrefix, ref: mRef, label: mLabel })
                                .then(function (res) { cmdReply(true, res); self._emitBridgeCall('vault.mount', { prefix: mPrefix, ref: mRef, ok: true, mountId: res.mountId }); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.mount', { prefix: mPrefix, ref: mRef, ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'unmount') {
                            var uMountId = String(e.data.mountId || '');
                            self._unmountChildVault(uMountId)
                                .then(function (res) { cmdReply(true, res); self._emitBridgeCall('vault.unmount', { mountId: uMountId, ok: true }); })
                                .catch(function (err) { cmdReply(false, null, err.message); self._emitBridgeCall('vault.unmount', { mountId: uMountId, ok: false, err: err.message }); });
                            return;
                        }
                        if (vAct === 'mounts') {
                            cmdReply(true, self._listMounts());
                            return;
                        }
                        cmdReply(false, null, 'Unsupported vault action: ' + vAct);
                        return;
                    }

                    if (e.data.__sgCmdType === 'git') {
                        var action = e.data.action;
                        if (action === 'status') {
                            cmdReply(true, { ahead: 0, behind: 0, diverged: false, writable: !!dataSource.writable });
                            return;
                        }
                        if (action === 'push') {
                            if (!dataSource.writable) { cmdReply(false, null, 'Read-only vault'); return; }
                            vault.push()
                                .then(function () { cmdReply(true, { pushed: true }); })
                                .catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        if (action === 'pull') {
                            if (!dataSource.writable) { cmdReply(false, null, 'Read-only vault'); return; }
                            vault.pull()
                                .then(function (changed) {
                                    if (changed) dataSource.loadAllSubTrees();
                                    cmdReply(true, { pulled: !!changed });
                                })
                                .catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        cmdReply(false, null, 'Unsupported git action: ' + action);
                        return;
                    }

                    // sg.state.* — device-local prefs in the top-level kernel's localStorage.
                    // See the bridge-side sg.state JSDoc for the rationale (deliberate doctrine
                    // deviation from the ViV impl pack's sg.vfs('app-state/*') prescription).
                    // Namespace: sg-app-state:<vaultId>:<entryPath>:<key>.
                    //   vaultId  → vault._vaultId (a derived non-secret identifier; NOT the
                    //              vault key, which is sensitive — never put that in localStorage).
                    //   entryPath → self._appEntryPath (the app's entry HTML path, e.g.
                    //               "home/index.html").
                    // Operations are wrapped in try/catch so a single quota/parse error doesn't
                    // poison the bridge handler.
                    if (e.data.__sgCmdType === 'state') {
                        var sAction = e.data.action;
                        var vId     = (vault && vault._vaultId) ? String(vault._vaultId) : 'unknown';
                        var ent     = self._appEntryPath || '';
                        var ns      = 'sg-app-state:' + vId + ':' + ent + ':';
                        try {
                            if (sAction === 'get') {
                                var gk  = String(e.data.key || '');
                                var raw = window.localStorage.getItem(ns + gk);
                                cmdReply(true, raw === null ? null : JSON.parse(raw));
                                return;
                            }
                            if (sAction === 'set') {
                                var sk  = String(e.data.key || '');
                                var sv  = (e.data.value === undefined) ? null : e.data.value;
                                var enc = JSON.stringify(sv);
                                // 64 KiB per key is plenty for prefs; keeps a runaway app from
                                // exhausting localStorage (which is per-origin, shared with the
                                // vault browser and any other apps on this domain).
                                if (enc.length > 65536) { cmdReply(false, null, 'value too large (max 64 KiB)'); return; }
                                window.localStorage.setItem(ns + sk, enc);
                                cmdReply(true, { ok: true });
                                return;
                            }
                            if (sAction === 'remove') {
                                window.localStorage.removeItem(ns + String(e.data.key || ''));
                                cmdReply(true, { ok: true });
                                return;
                            }
                            if (sAction === 'clear') {
                                // Snapshot keys first — mutating localStorage during iteration
                                // shifts indices and can skip entries.
                                var toRm = [];
                                for (var ci = 0; ci < window.localStorage.length; ci++) {
                                    var ck = window.localStorage.key(ci);
                                    if (ck && ck.indexOf(ns) === 0) toRm.push(ck);
                                }
                                toRm.forEach(function (k) { window.localStorage.removeItem(k); });
                                cmdReply(true, { ok: true, removed: toRm.length });
                                return;
                            }
                            if (sAction === 'keys') {
                                var ks = [];
                                for (var ki = 0; ki < window.localStorage.length; ki++) {
                                    var kk = window.localStorage.key(ki);
                                    if (kk && kk.indexOf(ns) === 0) ks.push(kk.slice(ns.length));
                                }
                                cmdReply(true, ks);
                                return;
                            }
                            cmdReply(false, null, 'Unsupported state action: ' + sAction);
                        } catch (sErr) {
                            cmdReply(false, null, (sErr && sErr.message) || 'state op failed');
                        }
                        return;
                    }

                    if (e.data.__sgCmdType === 'auth') {
                        var authAction = e.data.action;
                        if (authAction === 'setKey') {
                            var newKey = String(e.data.key || '').trim();
                            if (!newKey) { cmdReply(true, { ok: true, valid: false }); return; }
                            self._applyAccessToken(newKey);   // thread token onto write transport (the fix)
                            try { self._setCachedAccessKey(vault._vaultId || self._vaultKey, newKey, false); } catch (_) {}
                            self._dataSource = new VaultDataSource(vault, newKey);
                            dataSource       = self._dataSource;
                            self._writable   = true;
                            fetch(endpoint + '/api/transfers/check-token/' + encodeURIComponent(newKey))
                                .then(function (r) { return r.json(); })
                                .then(function (d) { cmdReply(true, { ok: true, valid: !!d.valid, remaining: d.remaining }); })
                                .catch(function () { cmdReply(true, { ok: true, valid: null }); });
                            return;
                        }
                        if (authAction === 'check') {
                            var checkKey = String(e.data.key || '').trim();
                            if (!checkKey) { cmdReply(true, { valid: false }); return; }
                            fetch(endpoint + '/api/transfers/check-token/' + encodeURIComponent(checkKey))
                                .then(function (r) { return r.json(); })
                                .then(function (d) { cmdReply(true, { valid: !!d.valid }); })
                                .catch(function (err) { cmdReply(false, null, err.message); });
                            return;
                        }
                        if (authAction === 'clear') {
                            self._dataSource = new VaultDataSource(vault, null);
                            dataSource       = self._dataSource;
                            self._writable   = false;
                            cmdReply(true, { cleared: true });
                            return;
                        }
                        cmdReply(false, null, 'Unknown auth action: ' + authAction);
                        return;
                    }

                    cmdReply(false, null, 'Unknown command type');
                    return;
                }

                // ── sg.ui.message / dismiss ───────────────────────────────────
                if (e.data.__sgUiMsg) {
                    var uiMsg = e.data.__sgUiMsg;
                    if (!uiMsg.dismiss) self._emitBridgeCall('ui.message', { text: uiMsg.text, msgType: uiMsg.msgType });
                    var hud   = document.getElementById('app-hud') || document.querySelector('app-hud');
                    if (!hud) return;
                    if (uiMsg.dismiss) {
                        if (typeof hud.clearMessage === 'function') hud.clearMessage(uiMsg.handle);
                    } else {
                        if (typeof hud.showMessage === 'function') {
                            hud.showMessage(uiMsg.handle, uiMsg.text, uiMsg.msgType, uiMsg.ttl);
                        }
                    }
                    return;
                }

                // ── App-error surfacing (ViV Phase 4 re-spec) ──────────────────
                // Null-origin app frames self-report uncaught errors via postMessage
                // (window.onerror in the injected bridge). Record + surface on the HUD
                // as a persistent error toast (ttl null). Replaces the old same-origin
                // contentWindow.onerror injection which is dead under null-origin.
                if (e.data.type === 'sg-app-error') {
                    self._lastIframeError = String(e.data.message || 'App error');
                    self._emitVaultEvent('app-error', { label: 'App error', message: self._lastIframeError });
                    var ehud = document.getElementById('app-hud') || document.querySelector('app-hud');
                    if (ehud && typeof ehud.showMessage === 'function') {
                        ehud.showMessage('sg-app-error', self._lastIframeError, 'error', null);
                    }
                    return;
                }
            };

            window.addEventListener('message', handler);
            this._vfsBridgeHandler = handler;
        }

        // ── Path helpers ──────────────────────────────────────────────────────────────

        _resolvePath(base, href) {
            // Pure path math — delegates to AppNavHelpers so the rules are unit-testable
            // (see test__app_shell_nav_helpers.js). Kept as a method so existing callers
            // don't change.
            return AppNavHelpers.resolvePath(base, href);
        }

        _findEntry(fileList, path) {
            var norm = path.replace(/^\//, '');
            return fileList.find(function (f) {
                return f.path === norm || f.path.endsWith('/' + norm);
            }) || null;
        }

        _findEntryStrict(fileList, path) {
            var norm = path.replace(/^\//, '');
            return fileList.find(function (f) { return f.path === norm; }) || null;
        }

        // ── UI helpers ────────────────────────────────────────────────────────────────

        _showLoading(msg) {
            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:#0a0a18; }
                    .sp { display:inline-block; width:24px; height:24px; border:2px solid #2a2a4a; border-top-color:#4ECDC4; border-radius:50%; animation:spin 0.8s linear infinite; margin-right:0.75rem; }
                    @keyframes spin { to { transform:rotate(360deg); } }
                    .st { font-size:0.875rem; color:#8892a4; font-family:-apple-system,sans-serif; }
                </style>
                <div style="display:flex;align-items:center;">
                    <div class="sp"></div><span class="st">${this._escHtml(msg)}</span>
                </div>
            `;
        }

        _setStatus(msg) {
            var el = this.shadowRoot.querySelector('.st');
            if (el) el.textContent = msg;
            else    this._showLoading(msg);
        }

        _showError(msg) {
            this._iframeStatus = 'error';
            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:#0a0a18; }
                    .err { text-align:center; color:#ff6b6b; padding:2rem; font-family:-apple-system,sans-serif; }
                    .err-icon { font-size:2rem; margin-bottom:0.75rem; }
                    .err-msg { font-size:0.875rem; }
                </style>
                <div class="err"><div class="err-icon">✗</div><div class="err-msg">${this._escHtml(msg)}</div></div>
            `;
        }

        _escHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // ── Debug event emitters ──────────────────────────────────────────────────────

        _emitVaultEvent(type, data) {
            var detail = Object.assign({ type: type, ts: Date.now() }, data || {});
            document.dispatchEvent(new CustomEvent('app-debug:vault-event', { detail: detail }));
        }

        _emitBridgeCall(method, detail) {
            document.dispatchEvent(new CustomEvent('app-debug:bridge-call', {
                detail: Object.assign({ method: method, ts: Date.now() }, detail || {})
            }));
        }

        _maskKey(key) {
            if (!key || key.length < 6) return '***';
            var parts = key.split('-');
            if (parts.length < 2) return key.slice(0, 3) + '***';
            return parts[0] + '-***';
        }

    }

    customElements.define('app-shell', AppShell);
})();
