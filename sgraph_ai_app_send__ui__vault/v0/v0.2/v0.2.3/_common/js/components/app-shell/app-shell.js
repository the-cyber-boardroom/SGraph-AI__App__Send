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
            this._vaultKey        = null;
            this._writable        = false;
            this._htmlDir         = '';
            this._iframeEl        = null;
            this._objectUrls      = [];
            this._vfsBridgeHandler = null;
            this._iframeStatus    = 'loading';
            this._resourcesLoaded = [];
            this._t               = {};
        }

        connectedCallback() {
            this._init();
        }

        disconnectedCallback() {
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
                writable:        this._writable,
                entry:           this._appJson && this._appJson.entry ? this._appJson.entry : null,
                iframeStatus:    this._iframeStatus,
                resourcesLoaded: this._resourcesLoaded,
                timing:          this._t
            };
        }

        // ── Init flow ─────────────────────────────────────────────────────────────────

        _init() {
            var rawHash = window.location.hash.slice(1).trim();
            if (!rawHash) {
                this._showEntryForm();
                return;
            }
            this._showLoading('Opening vault…');
            this._initWithKey(rawHash, null).catch((err) => {
                console.error('[app-shell] init failed:', err);
                this._showError(err.message);
            });
        }

        async _initWithKey(key, presetAccessKey) {
            this._t.start = performance.now();
            this._vaultKey = key;

            var endpoint = (window.SG_ENDPOINT || window.location.origin).replace(/\/$/, '');
            var sgSend   = new SGSend({ endpoint: endpoint });

            var vault, isRO = false;
            this._setStatus('Opening vault…');

            if (key.startsWith('ro-')) {
                var creds = await this._resolveROToken(sgSend, key);
                vault     = await SGVault.openReadOnly(sgSend, creds.vaultId, creds.readKeyB64, creds.refFileId);
                isRO      = true;
            } else {
                vault = await SGVault.open(sgSend, key);
            }

            this._vault    = vault;
            this._writable = !isRO;
            this._t.vaultOpened = performance.now();

            // Key never stays in address bar
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            // Build data source — use presetAccessKey if supplied (from entry form)
            this._setStatus('Reading vault…');
            var accessKey = (!isRO && presetAccessKey) ? presetAccessKey : null;
            this._dataSource = new VaultDataSource(vault, accessKey);
            if (accessKey) this._writable = true;
            await this._dataSource.loadAllSubTrees();
            this._t.treeLoaded = performance.now();

            // Read app.json
            var appJson = await this._readAppJson();
            this._appJson = appJson;
            this._t.appJsonFetched = performance.now();

            // Update page title
            var appTitle  = appJson && appJson.title  ? appJson.title  : '';
            var vaultName = vault.name || '';
            if (appTitle) document.title = appTitle + ' — SG/App';
            else if (vaultName) document.title = vaultName + ' — SG/App';

            // Notify HUD
            this.dispatchEvent(new CustomEvent('app-shell:ready', {
                bubbles: true, composed: true,
                detail: { vaultName: vaultName, appTitle: appTitle, vaultKey: this._vaultKey, isRO: isRO }
            }));

            // Auth intercept (auth.required with no cached key and no preset key)
            if (!isRO && !accessKey && appJson && appJson.auth && appJson.auth.required) {
                var vaultId   = vault._vaultId || this._vaultKey;
                var cachedKey = this._getCachedAccessKey(vaultId);
                if (!cachedKey) {
                    await this._showAuthPrompt(vault, appJson);
                    return;  // _showAuthPrompt calls _continue() when key accepted
                }
                this._dataSource = new VaultDataSource(vault, cachedKey);
                this._writable   = true;
            }

            await this._continue(appJson);
        }

        async _continue(appJson) {
            this._setStatus('Loading resources…');
            var resourcesData = await this._fetchResources(appJson);
            this._t.resourcesLoaded = performance.now();
            await this._mountApp(appJson, resourcesData);
        }


        // ── Entry form (hashless /en-gb/app) ──────────────────────────────────────────

        _showEntryForm() {
            var self = this;

            // Check for a saved backend access key to auto-fill
            var savedAccessKey = '';
            try { savedAccessKey = localStorage.getItem('sg-backend-access-key') || ''; } catch (_) {}

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
            var accessInput = root.getElementById('ef-access-input');
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
                } else if (v.indexOf('-') > 0) {
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

                if (!vaultKey) {
                    errEl.textContent = 'Please enter a vault key or read-only token.';
                    keyInput.focus();
                    return;
                }

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

        async _resolveROToken(sgSend, token) {
            var endpoint = sgSend.endpoint || window.location.origin;
            var resp = await fetch(endpoint + '/api/transfers/check-token/' + encodeURIComponent(token));
            if (!resp.ok) throw new Error('RO token not found or expired (HTTP ' + resp.status + ')');
            var data = await resp.json();
            if (!data.ciphertext) throw new Error('Invalid RO token response');

            var enc         = new TextEncoder();
            var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveKey']);
            var aesKey      = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: enc.encode('sgraph-ro-token-v1'), iterations: 100000, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            var cipherBytes = Uint8Array.from(atob(data.ciphertext), function (c) { return c.charCodeAt(0); });
            var iv          = cipherBytes.slice(0, 12);
            var ct          = cipherBytes.slice(12);
            var plain       = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, ct);
            return JSON.parse(new TextDecoder().decode(plain)); // { vaultId, readKeyB64, refFileId }
        }

        _getCachedAccessKey(vaultId) {
            try {
                return localStorage.getItem('sg-access-key:' + vaultId) ||
                       sessionStorage.getItem('sg-access-key:' + vaultId) || null;
            } catch (_) { return null; }
        }

        _setCachedAccessKey(vaultId, key, persist) {
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
                var endpoint = (window.SG_ENDPOINT || window.location.origin).replace(/\/$/, '');

                var submit = async () => {
                    var key = input.value.trim();
                    if (!key) return;
                    btn.disabled = true;
                    errEl.textContent = '';
                    try {
                        var resp = await fetch(endpoint + '/api/transfers/check_token/' + encodeURIComponent(key));
                        var data = await resp.json();
                        if (!data.valid) throw new Error('Access key is invalid or has expired');
                        this._setCachedAccessKey(vaultId, key, rCheck.checked);
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

            this._setStatus('Loading app…');

            var htmlBytes = await this._dataSource.getFileBytes(entry.path);
            var htmlText  = new TextDecoder().decode(htmlBytes);

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

            // Inject bridge + resources into <head>
            var bridgeScript = this._buildVfsBridgeScript(entry.path);
            var injected     = htmlText.replace(/(<head[^>]*>)/i, '$1' + bridgeScript + resBlock);
            if (injected === htmlText) injected = bridgeScript + resBlock + htmlText;

            var blob    = new Blob([injected], { type: 'text/html' });
            var blobUrl = URL.createObjectURL(blob);
            this._objectUrls.push(blobUrl);

            var iframe         = document.createElement('iframe');
            iframe.sandbox     = 'allow-scripts allow-forms allow-same-origin';
            iframe.style.cssText = 'border:none;width:100%;height:100%;display:block;flex:1;';
            iframe.src         = blobUrl;
            iframe.addEventListener('load', () => {
                this._iframeStatus  = 'ready';
                this._t.iframeReady = performance.now();
            });
            this._iframeEl    = iframe;
            this._iframeStatus = 'loading';

            this.shadowRoot.innerHTML = `<style>:host{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#0a0a18;}</style>`;
            this.shadowRoot.appendChild(iframe);

            this._setupVfsBridgeHandlers(iframe, this._dataSource);
        }

        // ── VFS bridge (injected into iframe) ─────────────────────────────────────────

        _buildVfsBridgeScript(currentPath) {
            var writable  = this._writable;
            var vaultName = (this._vault && this._vault.name)     || '';
            var vaultId   = (this._vault && this._vault._vaultId) || '';
            var fileList  = this._dataSource ? this._dataSource.getFileList() : [];
            var fileCount = fileList.filter(function (f) { return !f.dir; }).length;

            return '<script>(function(){' +

                // Nav intercept: relative .html links → postMessage to parent
                'document.addEventListener("click",function(e){' +
                  'var a=e.target.closest("a");if(!a)return;' +
                  'var h=a.getAttribute("href");if(!h)return;' +
                  'if(h.startsWith("http")||h.startsWith("//")||h.startsWith("#")||h.startsWith("mailto:"))return;' +
                  'if(h.endsWith(".html")||h.endsWith(".htm")){' +
                    'e.preventDefault();e.stopPropagation();' +
                    'window.parent.postMessage({__sgVfsNavReq:h},"*");' +
                  '}' +
                '},true);' +

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
                    'var b64="",chunk=8192;' +
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
                    'loadCss:_loadCss,loadJs:_loadJs,' +
                    'app:{' +
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
                      'dismiss:function(h){window.parent.postMessage({__sgUiMsg:{handle:h,dismiss:true}},"*");}' +
                    '}' +
                  '};' +
                  'window.sgVault={writeFile:_write,readFile:_readText,listFiles:function(){return _list("");},writable:window.sg.app.writable,selfPath:window.sg.app.selfPath};' +
                  'console.log("[sg-vfs] ready | writable=' + (writable ? 'true' : 'false') + ' | vaultName=' + vaultName.replace(/'/g, "\\'") + ' | page: /en-gb/app");' +
                '})();' +
              '})();<\/script>';
        }

        // ── VFS bridge parent-side handlers ───────────────────────────────────────────

        _setupVfsBridgeHandlers(iframeEl, dataSource) {
            var self = this;

            var handler = function (e) {
                if (!e.data)                              return;
                if (e.source !== iframeEl.contentWindow)  return;

                var fileList = dataSource.getFileList();

                // ── Navigation ────────────────────────────────────────────────
                if (e.data.__sgVfsNavReq) {
                    var navHref     = e.data.__sgVfsNavReq;
                    var navResolved = self._resolvePath(self._htmlDir, navHref);
                    var navMatch    = self._findEntry(fileList, navResolved);
                    if (!navMatch) { console.warn('[app-shell] nav not found:', navResolved); return; }
                    dataSource.getFileBytes(navMatch.path).then(function (buf) {
                        var htmlText = new TextDecoder().decode(buf);
                        var newDir   = navMatch.path.includes('/')
                            ? navMatch.path.substring(0, navMatch.path.lastIndexOf('/') + 1) : '';
                        self._htmlDir  = newDir;
                        var navBridge  = self._buildVfsBridgeScript(navMatch.path);
                        var injected   = htmlText.replace(/(<head[^>]*>)/i, '$1' + navBridge);
                        if (injected === htmlText) injected = navBridge + htmlText;
                        var blob = new Blob([injected], { type: 'text/html' });
                        var url  = URL.createObjectURL(blob);
                        self._objectUrls.push(url);
                        iframeEl.src = url;
                        console.log('[app-shell] nav →', navMatch.path);
                    }).catch(function (err) { console.error('[app-shell] nav fetch failed:', err); });
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
                    } catch (_) { wReply(false, { err: 'Bad encoding' }); return; }
                    var wPath     = e.data.path || '';
                    var wResolved = wPath.startsWith('/') ? wPath.slice(1) : self._resolvePath(self._htmlDir, wPath);
                    var wSlash    = wResolved.lastIndexOf('/');
                    var wDir      = wSlash > 0 ? '/' + wResolved.slice(0, wSlash) : '/';
                    var wFile     = wResolved.slice(wSlash + 1);
                    var wSize     = wBytes.byteLength;
                    dataSource.saveFile(wDir, wFile, wBytes.buffer)
                        .then(function () { wReply(true, { size: wSize }); })
                        .catch(function (err) { wReply(false, { err: err.message || 'Write failed' }); });
                    return;
                }

                // ── List ──────────────────────────────────────────────────────
                if (e.data.__sgVfsListReq) {
                    var listId  = e.data.__sgVfsListReq;
                    var entries = fileList;
                    var prefix  = (e.data.path || '').replace(/^\//, '');
                    if (prefix) {
                        var normPfx  = prefix.endsWith('/') ? prefix : prefix + '/';
                        var filtered = entries.filter(function (f) {
                            return f.path === prefix || f.path.startsWith(normPfx);
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
                    try { e.source.postMessage({ __sgVfsListReply: listId, ok: true, entries: listed }, '*'); } catch (_) {}
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
                    var rMatch    = self._findEntryStrict(fileList, rResolved);
                    if (!rMatch) { rReply(false, { err: 'ENOENT', path: rResolved }); return; }
                    dataSource.getFileBytes(rMatch.path).then(function (buf) {
                        rReply(true, { buf: buf, path: rMatch.path });
                    }).catch(function (err) { rReply(false, { err: err.message || 'Read failed' }); });
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
                    var endpoint = (window.SG_ENDPOINT || window.location.origin).replace(/\/$/, '');

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

                    if (e.data.__sgCmdType === 'auth') {
                        var authAction = e.data.action;
                        if (authAction === 'setKey') {
                            var newKey = String(e.data.key || '').trim();
                            if (!newKey) { cmdReply(true, { ok: true, valid: false }); return; }
                            self._dataSource = new VaultDataSource(vault, newKey);
                            dataSource       = self._dataSource;
                            self._writable   = true;
                            fetch(endpoint + '/api/transfers/check_token/' + encodeURIComponent(newKey))
                                .then(function (r) { return r.json(); })
                                .then(function (d) { cmdReply(true, { ok: true, valid: !!d.valid, remaining: d.remaining }); })
                                .catch(function () { cmdReply(true, { ok: true, valid: null }); });
                            return;
                        }
                        if (authAction === 'check') {
                            var checkKey = String(e.data.key || '').trim();
                            if (!checkKey) { cmdReply(true, { valid: false }); return; }
                            fetch(endpoint + '/api/transfers/check_token/' + encodeURIComponent(checkKey))
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
            };

            window.addEventListener('message', handler);
            this._vfsBridgeHandler = handler;
        }

        // ── Path helpers ──────────────────────────────────────────────────────────────

        _resolvePath(base, href) {
            if (href.startsWith('/')) return href.slice(1);
            if (!base)               return href;
            var parts    = (base + href).split('/');
            var resolved = [];
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (p === '..')  { if (resolved.length) resolved.pop(); }
                else if (p !== '.') { resolved.push(p); }
            }
            return resolved.join('/');
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
    }

    customElements.define('app-shell', AppShell);
})();
