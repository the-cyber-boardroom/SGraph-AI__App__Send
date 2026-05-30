/* =================================================================================
   SGraph App — HUD Bar Component  (app-hud)
   v0.2.3 — Minimal status bar for /en-gb/app page.

   Sits OUTSIDE sg-layout as a fixed 48px row. Receives vault/app info via
   setInfo() called from the page script when app-shell:ready fires.

   Also handles sg.ui.message() notifications dispatched from the app iframe.
   ================================================================================= */

(function () {
    'use strict';

    class AppHud extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._messages  = {};     // handle → { el, timer }
            this._debugOpen = false;
            // Nav state mirrors app-shell's history (set via setNavState on every
            // 'app-nav:change' event). The HUD never owns the history, only displays it.
            this._navState  = { path: '', canBack: false, canForward: false, historyLen: 0 };
            this._recent    = [];   // most-recent-first list of paths for the ⋯ menu
            // HUD config from app.json (resolved with defaults — see _resolvedHudCfg).
            this._hudCfg    = null;
            this._menuOpen  = false;
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${AppHud.styles}</style>
                <div class="hud-wrap">
                    <div class="hud">
                        <div class="hud-left">
                            <span class="hud-brand" data-hud-el="brand">SG<span class="hud-slash">/</span>App</span>
                            <span class="hud-vault-badge" data-hud-el="vaultName" style="display:none"></span>
                            <span class="hud-app-title" data-hud-el="appTitle"></span>
                        </div>
                        <div class="hud-center">
                            <span class="hud-msg" style="display:none"></span>
                            <span class="hud-consent" style="display:none">
                                <span class="hud-consent-text"></span>
                                <button class="hud-consent-allow">Allow</button>
                                <button class="hud-consent-deny">Deny</button>
                            </span>
                        </div>
                        <div class="hud-right">
                            <a class="hud-vault-link" data-hud-el="openVault" href="#" style="display:none" title="Open vault">Open Vault</a>
                            <button class="hud-copy-btn" data-hud-el="copyLink" style="display:none" title="Copy app link">⎘ Copy Link</button>
                            <button class="hud-print-btn" data-hud-el="print" style="display:none" title="Print this app (opens a print-friendly preview)">&#128424; Print</button>
                            <span class="hud-privs-chip" style="display:none" title="What this app is allowed to do"></span>
                            <span class="hud-ro-badge" style="display:none">👁 Read-only</span>
                            <button class="hud-debug-btn" data-hud-el="debug" title="Toggle debug panel">🔍 Debug</button>
                        </div>
                    </div>
                    <div class="navrow" data-hud-el="navBar" style="display:none">
                        <button class="navrow-back"    data-hud-el="navArrows"  title="Back"    disabled>‹</button>
                        <button class="navrow-forward" data-hud-el="navArrows"  title="Forward" disabled>›</button>
                        <button class="navrow-reload"  data-hud-el="navRefresh" title="Reload this page">↻</button>
                        <button class="navrow-home"    data-hud-el="navHome"    title="Home (app entry page)" disabled>⌂</button>
                        <span class="navrow-divider" data-hud-el="navArrows"></span>
                        <div class="navrow-addr" data-hud-el="navPath" title="Click to edit, Enter to navigate, Esc to cancel">
                            <span class="navrow-addr-icon">📄</span>
                            <span class="navrow-addr-text"></span>
                            <input class="navrow-addr-input" type="text" autocomplete="off" spellcheck="false" style="display:none" />
                        </div>
                        <button class="navrow-copy" data-hud-el="navPath" title="Copy path">⎘</button>
                        <div class="navrow-menu-wrap">
                            <button class="navrow-menu" title="Recent pages">⋯</button>
                            <div class="navrow-menu-panel" style="display:none"></div>
                        </div>
                    </div>
                </div>
                <button class="hud-escape" style="display:none" title="Exit app and return to vault">×&nbsp;Exit app</button>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.hud-copy-btn'))   this._copyLink();
                if (e.target.closest('.hud-print-btn'))  this._onPrintClick();
                if (e.target.closest('.hud-debug-btn'))  this._toggleDebug();
                if (e.target.closest('.hud-privs-chip')) this._onPrivsClick();
                // Nav row buttons — dispatch events that app-shell listens to.
                if (e.target.closest('.navrow-back'))    this._emitNavEvent('back');
                if (e.target.closest('.navrow-forward')) this._emitNavEvent('forward');
                if (e.target.closest('.navrow-reload'))  this._emitNavEvent('reload');
                if (e.target.closest('.navrow-home'))    this._emitNavEvent('home');
                // Address-bar click: enter edit mode (the explicit copy button still copies).
                if (e.target.closest('.navrow-copy'))    this._copyCurrentPath();
                if (e.target.closest('.navrow-addr') && !e.target.closest('.navrow-addr-input')) {
                    this._enterAddrEdit();
                }
                if (e.target.closest('.navrow-menu'))  { e.stopPropagation(); this._toggleMenu(); }
                if (e.target.closest('[data-recent-path]')) {
                    var path = e.target.closest('[data-recent-path]').getAttribute('data-recent-path');
                    this._emitNavEvent('jump', { path: path });
                    this._toggleMenu(false);
                }
                if (e.target.closest('.hud-escape'))     this._emitNavEvent('exit');
            });

            // Editable URL bar: Enter commits + navigates, Escape cancels, focus loss cancels.
            this.shadowRoot.addEventListener('keydown', (e) => {
                if (!e.target || !e.target.classList || !e.target.classList.contains('navrow-addr-input')) return;
                if (e.key === 'Enter')  { e.preventDefault(); this._exitAddrEdit(true);  }
                if (e.key === 'Escape') { e.preventDefault(); this._exitAddrEdit(false); }
            });
            this.shadowRoot.addEventListener('focusout', (e) => {
                if (!e.target || !e.target.classList || !e.target.classList.contains('navrow-addr-input')) return;
                if (this._editingAddr) this._exitAddrEdit(false);
            });

            // Listen for nav-state changes from app-shell (back/forward arrows + path display).
            this._navChangeHandler = (ev) => this.setNavState(ev.detail || {});
            document.addEventListener('app-nav:change', this._navChangeHandler);
        }

        disconnectedCallback() {
            if (this._navChangeHandler) document.removeEventListener('app-nav:change', this._navChangeHandler);
            if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
        }

        // Called by page script with vault/app metadata.
        setInfo(vaultName, appTitle, vaultKey, isRO) {
            this._vaultKey = vaultKey;
            this._vaultName = vaultName;

            const badge  = this.shadowRoot.querySelector('.hud-vault-badge');
            const title  = this.shadowRoot.querySelector('.hud-app-title');
            const link   = this.shadowRoot.querySelector('.hud-vault-link');
            const copy   = this.shadowRoot.querySelector('.hud-copy-btn');
            const roBadge = this.shadowRoot.querySelector('.hud-ro-badge');

            if (badge && vaultName) {
                badge.textContent = vaultName;
                badge.style.display = '';
            }
            if (title) {
                title.textContent = appTitle || '';
                title.style.display = appTitle ? '' : 'none';
            }
            if (link && vaultKey) {
                // Go straight to the vault file browser. Using /#key would route through
                // the root hash inbox, which redirects back to /app when the vault has an
                // app.json — an infinite loop. /en-gb/vault/ reads the key from
                // localStorage (saved by app-shell on open) and does not auto-open the app.
                var base = window.location.pathname.split('/en-gb/')[0];
                link.href  = base + '/en-gb/vault/';
                link.style.display = '';
            }
            if (copy && vaultKey) {
                copy.style.display = '';
            }
            const printBtn = this.shadowRoot.querySelector('.hud-print-btn');
            if (printBtn && vaultKey) {
                printBtn.style.display = '';
            }
            if (roBadge) {
                roBadge.style.display = isRO ? '' : 'none';
            }

            // Update page title
            if (appTitle) document.title = appTitle + ' — SG/App';
            else if (vaultName) document.title = vaultName + ' — SG/App';
        }

        // Render a compact summary of what the app is allowed to do, from the parsed
        // app.json permissions (AppPermissions.parsePermissions shape). Visibility only —
        // makes the otherwise-invisible grants legible to the user. Phase 4 makes it clickable
        // (permissions panel / revoke). No grants beyond default reads → chip hidden.
        setPrivileges(perm) {
            var chip = this.shadowRoot.querySelector('.hud-privs-chip');
            if (!chip) return;
            var labels = [];
            var fs = (perm && perm.fs) || {};
            var vault = (perm && perm.vault) || {};
            function granted(v) { return v === true || (Array.isArray(v) && v.length > 0); }
            if (granted(fs.write))  labels.push('write');
            if (granted(fs.move))   labels.push('move');
            if (granted(fs['delete'])) labels.push('delete');
            if (granted(fs.mkdir))  labels.push('mkdir');
            if (granted(vault.create)) labels.push('create-vault');
            if (granted(vault.unlink)) labels.push('unlink-vault');
            if (vault['delete'] === true) labels.push('delete-vault');
            if (labels.length === 0) { chip.style.display = 'none'; return; }
            chip.textContent = '🔓 ' + labels.join(' · ');
            chip.title = 'This app is allowed to: ' + labels.join(', ');
            chip.style.display = '';
        }

        // Render a consent prompt in the HUD (host chrome — the app cannot draw or dismiss this).
        // Resolves cb(true/false) only on a real user click. Called by app-shell._consent.
        requestConsent(verb, path, cb) {
            const c = this.shadowRoot.querySelector('.hud-consent');
            const t = this.shadowRoot.querySelector('.hud-consent-text');
            const allow = this.shadowRoot.querySelector('.hud-consent-allow');
            const deny  = this.shadowRoot.querySelector('.hud-consent-deny');
            if (!c || !t || !allow || !deny) { try { cb(false); } catch (_) {} return; }
            t.textContent = AppHud._consentLabel(verb, path);
            c.style.display = '';
            const done = (ok) => {
                c.style.display = 'none';
                allow.removeEventListener('click', onAllow);
                deny.removeEventListener('click', onDeny);
                try { cb(ok); } catch (_) {}
            };
            const onAllow = () => done(true);
            const onDeny  = () => done(false);
            allow.addEventListener('click', onAllow);
            deny.addEventListener('click', onDeny);
        }

        static _consentLabel(verb, path) {
            const map = {
                'vault.create': 'create a vault',
                'vault.delete': 'permanently delete a vault',
                'vault.unlink': 'unlink a vault'
            };
            const what = map[verb] || ('use ' + verb);
            return 'This app wants to ' + what + (path ? ' in “' + path + '”' : '') + '.';
        }

        // Clicking the privileges chip opens the (minimal) permissions panel: the manifest grants
        // are a fixed ceiling, but the user can reset this app's cached create/delete consents.
        _onPrivsClick() {
            const ok = window.confirm('Reset this app’s granted consents (e.g. create/delete prompts will be asked again)?');
            if (ok) this.dispatchEvent(new CustomEvent('app-hud:reset-consents', { bubbles: true, composed: true }));
        }

        // Show a transient message (called from VFS bridge sg.ui.message handler).
        showMessage(handle, text, type, ttl) {
            const msgEl = this.shadowRoot.querySelector('.hud-msg');
            if (!msgEl) return;

            if (handle && this._messages[handle]) {
                clearTimeout(this._messages[handle].timer);
            }

            const icons = { info: '•', success: '✓', warn: '⚠', error: '✗' };
            msgEl.textContent = (icons[type] || '•') + ' ' + text;
            msgEl.className   = 'hud-msg hud-msg--' + (type || 'info');
            msgEl.style.display = '';

            if (ttl !== null) {
                const ms    = typeof ttl === 'number' ? ttl : 3000;
                const timer = setTimeout(() => {
                    if (handle) delete this._messages[handle];
                    msgEl.style.display = 'none';
                    msgEl.textContent   = '';
                }, ms);
                if (handle) this._messages[handle] = { timer };
            }
        }

        clearMessage(handle) {
            if (handle && this._messages[handle]) {
                clearTimeout(this._messages[handle].timer);
                delete this._messages[handle];
            }
            const msgEl = this.shadowRoot.querySelector('.hud-msg');
            if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
        }

        _toggleDebug() {
            this._debugOpen = !this._debugOpen;
            this.dispatchEvent(new CustomEvent('app-debug:toggle', {
                bubbles: true, composed: true,
                detail: { open: this._debugOpen, split: 0.32 }
            }));
            const btn = this.shadowRoot.querySelector('.hud-debug-btn');
            if (btn) btn.classList.toggle('active', this._debugOpen);
        }

        _copyLink() {
            if (!this._vaultKey) return;
            var url = window.location.origin + '/en-gb/app#' + this._vaultKey;
            navigator.clipboard.writeText(url).then(() => {
                this.showMessage('copy', 'Link copied', 'success', 2000);
            }).catch(() => {
                this.showMessage('copy', 'Could not copy: ' + url, 'info', 5000);
            });
        }

        // Print is implemented by app-shell (it owns the iframe). The HUD just signals.
        // app-shell._onPrint() reads iframe.contentDocument, normalises blob: URLs to
        // data: URIs (so the print window is self-contained), and hands off to SgPrint.
        _onPrintClick() {
            this.showMessage('print', 'Preparing print preview…', 'info', 4000);
            this.dispatchEvent(new CustomEvent('app-hud:print', { bubbles: true, composed: true }));
        }

        // ── Nav row ───────────────────────────────────────────────────────────────────

        // Called by app-shell on every 'app-nav:change' event. Updates the path display,
        // enables/disables back/forward arrows, and maintains the most-recent list for ⋯.
        setNavState(state) {
            state = state || {};
            this._navState = {
                path:       String(state.path || ''),
                canBack:    !!state.canBack,
                canForward: !!state.canForward,
                canHome:    !!state.canHome,
                historyLen: state.historyLen | 0
            };
            this._updateRecent(this._navState.path);
            var sr = this.shadowRoot; if (!sr) return;

            var back    = sr.querySelector('.navrow-back');
            var forward = sr.querySelector('.navrow-forward');
            var home    = sr.querySelector('.navrow-home');
            if (back)    back.disabled    = !this._navState.canBack;
            if (forward) forward.disabled = !this._navState.canForward;
            if (home)    home.disabled    = !this._navState.canHome;

            var addr = sr.querySelector('.navrow-addr-text');
            // Don't overwrite the display text while the user is editing the URL — they're
            // typing into the input and an incoming nav-change shouldn't visually flicker
            // behind it. When the input commits and edit mode exits, the next nav-change
            // (the one that just landed) will already be the one we want to show.
            if (addr && !this._editingAddr) {
                var p = this._navState.path;
                var hashIdx = p.indexOf('#');
                if (hashIdx >= 0) {
                    var pathPart = p.slice(0, hashIdx);
                    var hashPart = p.slice(hashIdx);
                    addr.innerHTML = '';
                    addr.appendChild(document.createTextNode(pathPart));
                    var hashSpan = document.createElement('span');
                    hashSpan.className = 'navrow-addr-hash';
                    hashSpan.textContent = hashPart;
                    addr.appendChild(hashSpan);
                } else {
                    addr.textContent = p;
                }
            }

            // Refresh the menu if it's open so it reflects new "current" highlighting.
            if (this._menuOpen) this._renderMenu();
        }

        _updateRecent(path) {
            if (!path) return;
            // Move-to-front semantics: most recent first, cap at 12.
            var i = this._recent.indexOf(path);
            if (i >= 0) this._recent.splice(i, 1);
            this._recent.unshift(path);
            if (this._recent.length > 12) this._recent.length = 12;
        }

        _emitNavEvent(action, detail) {
            this.dispatchEvent(new CustomEvent('app-hud:nav', {
                bubbles: true, composed: true,
                detail: Object.assign({ action: action }, detail || {})
            }));
        }

        _copyCurrentPath() {
            var p = this._navState.path || '';
            if (!p) return;
            navigator.clipboard.writeText(p).then(() => {
                this.showMessage('copyPath', 'Path copied: ' + p, 'success', 2000);
            }).catch(() => {
                this.showMessage('copyPath', 'Could not copy', 'warn', 3000);
            });
        }

        // Browser-style URL bar: click flips text → input pre-filled with current path,
        // focused and selected. Enter commits via the 'jump' nav event (paths typed in
        // are treated as vault-absolute by app-shell, so no current-dir prefixing).
        // Escape or focus loss cancels and restores the read-only display.
        _enterAddrEdit() {
            var sr = this.shadowRoot; if (!sr) return;
            if (this._editingAddr) return;
            var input = sr.querySelector('.navrow-addr-input');
            var text  = sr.querySelector('.navrow-addr-text');
            var icon  = sr.querySelector('.navrow-addr-icon');
            if (!input) return;
            this._editingAddr = true;
            input.value = this._navState.path || '';
            if (text) text.style.display = 'none';
            if (icon) icon.style.display = 'none';
            input.style.display = '';
            // Defer focus/select until after the click event finishes (avoids a
            // race where focusout from another element re-triggers _exitAddrEdit).
            setTimeout(() => { input.focus(); input.select(); }, 0);
        }

        _exitAddrEdit(commit) {
            var sr = this.shadowRoot; if (!sr) return;
            if (!this._editingAddr) return;
            var input = sr.querySelector('.navrow-addr-input');
            var text  = sr.querySelector('.navrow-addr-text');
            var icon  = sr.querySelector('.navrow-addr-icon');
            this._editingAddr = false;
            var value = input ? (input.value || '').trim() : '';
            if (input) input.style.display = 'none';
            if (text)  text.style.display  = '';
            if (icon)  icon.style.display  = '';
            if (commit && value && value !== this._navState.path) {
                this._emitNavEvent('jump', { path: value });
            }
        }

        _toggleMenu(force) {
            var open = (typeof force === 'boolean') ? force : !this._menuOpen;
            this._menuOpen = open;
            var panel = this.shadowRoot && this.shadowRoot.querySelector('.navrow-menu-panel');
            if (!panel) return;
            if (open) {
                this._renderMenu();
                panel.style.display = '';
                // Outside-click close: armed on the *next* event-loop turn so the
                // click that opens the menu (which bubbles from shadow DOM up to
                // document with composed:true) doesn't immediately close it again.
                // A one-shot listener means clicks on the ⋯ button after open will
                // re-toggle through the shadow handler instead of being eaten here.
                if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
                setTimeout(() => {
                    this._docClickHandler = () => this._toggleMenu(false);
                    document.addEventListener('click', this._docClickHandler, { once: true });
                }, 0);
            } else {
                panel.style.display = 'none';
                if (this._docClickHandler) {
                    document.removeEventListener('click', this._docClickHandler);
                    this._docClickHandler = null;
                }
            }
        }

        _renderMenu() {
            var panel = this.shadowRoot && this.shadowRoot.querySelector('.navrow-menu-panel');
            if (!panel) return;
            var current = this._navState.path || '';
            var rows = this._recent.map((p) => {
                var cls = (p === current) ? 'navrow-menu-item current' : 'navrow-menu-item';
                var safe = AppHud._escapeHtml(p);
                return '<div class="' + cls + '" data-recent-path="' + safe + '" title="' + safe + '">📄 ' + safe + '</div>';
            }).join('');
            var html = '<div class="navrow-menu-section">Recent</div>'
                     + (rows || '<div class="navrow-menu-empty">No history yet</div>');
            panel.innerHTML = html;
        }

        // ── HUD config (app.json hud.* surface) ───────────────────────────────────────

        // Apply a resolved hud config to the chrome. Idempotent — safe to call repeatedly.
        // Sovereignty rules baked in:
        //   1. Consent prompts always render when active (regardless of mode/show flags).
        //   2. In 'hidden' mode the chrome row is invisible BUT a corner escape pill stays.
        //   3. The user-side override (force-show-hud) is applied OUTSIDE this method, by
        //      the page script that constructs the config — see _resolvedHudCfg().
        applyHudConfig(hudCfg) {
            this._hudCfg = hudCfg || null;
            var cfg = AppHud._resolveHudCfg(hudCfg);
            var sr  = this.shadowRoot; if (!sr) return;

            var wrap   = sr.querySelector('.hud-wrap');
            var escape = sr.querySelector('.hud-escape');

            if (cfg.mode === 'hidden') {
                if (wrap)   wrap.style.display = 'none';
                if (escape) escape.style.display = '';
                return;
            }
            if (wrap)   wrap.style.display = '';
            if (escape) escape.style.display = 'none';

            // Per-element visibility. Buttons/spans with [data-hud-el] respect the show flags.
            // Note: the visibility is "may show" — the actual setInfo()/setNavState() calls
            // still hide elements that have nothing to display (e.g. vault badge with no name).
            var els = sr.querySelectorAll('[data-hud-el]');
            els.forEach((el) => {
                var key = el.getAttribute('data-hud-el');
                if (key === 'navArrows') {
                    // Group key — same logic applies to back/forward/divider.
                    el.style.visibility = cfg.show.navArrows ? '' : 'hidden';
                    return;
                }
                if (cfg.show[key] === false) {
                    el.style.display = 'none';
                }
            });

            var navbar = sr.querySelector('.navrow');
            if (navbar) navbar.style.display = cfg.show.navBar ? '' : 'none';
        }

        // Resolve a possibly-undefined hud config from app.json into a complete one.
        // Defaults: mode='full', everything visible except print (off by default since the
        // current Print button is broken under null-origin app frames — to be re-enabled
        // when the bridge-RPC print refactor lands).
        static _resolveHudCfg(input) {
            input = input || {};
            var mode = (input.mode === 'hidden' || input.mode === 'minimal') ? input.mode : 'full';
            var defaults = (mode === 'minimal')
                ? { vaultName: true,  appTitle: true,  openVault: false, copyLink: false, print: false, debug: false,
                    navBar: false, navArrows: false, navPath: false, navRefresh: false, navHome: false }
                : { vaultName: true,  appTitle: true,  openVault: true,  copyLink: true,  print: false, debug: true,
                    navBar: true,  navArrows: true,  navPath: true,  navRefresh: true,  navHome: true  };
            var show = Object.assign({}, defaults, (input.show || {}));
            return { mode: mode, show: show };
        }

        static _escapeHtml(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
    }

    AppHud.styles = `
        :host { display: block; }
        .hud {
            display: flex; align-items: center; justify-content: space-between;
            height: 48px; padding: 0 1rem;
            background: #12122a; border-bottom: 1px solid #2a2a4a;
        }
        .hud-left  { display: flex; align-items: center; gap: 0.625rem; min-width: 0; }
        .hud-center { flex: 1; display: flex; align-items: center; justify-content: center; }
        .hud-right { display: flex; align-items: center; gap: 0.5rem; }
        .hud-brand { font-weight: 700; font-size: 1rem; color: #e2e8f0; white-space: nowrap; }
        .hud-slash { color: #4ECDC4; }
        .hud-vault-badge {
            font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 9999px;
            background: rgba(78,205,196,0.12); color: #4ECDC4;
            font-family: monospace; border: 1px solid rgba(78,205,196,0.3);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;
        }
        .hud-app-title {
            font-size: 0.875rem; font-weight: 600; color: #e2e8f0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;
        }
        .hud-msg {
            font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: 4px;
            color: #8892a4; background: rgba(255,255,255,0.05);
        }
        .hud-msg--success { color: #4ECDC4; }
        .hud-msg--error   { color: #ff6b6b; }
        .hud-msg--warn    { color: #E9C445; }
        .hud-vault-link {
            font-size: 0.75rem; color: #8892a4; text-decoration: none;
            padding: 0.2rem 0.5rem; border-radius: 4px;
            border: 1px solid #2a2a4a; white-space: nowrap;
        }
        .hud-vault-link:hover { color: #4ECDC4; border-color: #4ECDC4; }
        .hud-copy-btn {
            font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 4px;
            border: 1px solid #2a2a4a; background: transparent;
            color: #8892a4; cursor: pointer; white-space: nowrap;
        }
        .hud-copy-btn:hover { color: #4ECDC4; border-color: #4ECDC4; }
        .hud-print-btn {
            font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 4px;
            border: 1px solid #2a2a4a; background: transparent;
            color: #8892a4; cursor: pointer; white-space: nowrap;
        }
        .hud-print-btn:hover { color: #4ECDC4; border-color: #4ECDC4; }
        .hud-ro-badge {
            font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px;
            background: rgba(100,160,220,0.12); color: #64a0dc;
            border: 1px solid rgba(100,160,220,0.25); white-space: nowrap;
        }
        .hud-privs-chip {
            font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px;
            background: rgba(233,196,69,0.12); color: #E9C445;
            border: 1px solid rgba(233,196,69,0.3); white-space: nowrap; font-family: monospace; cursor: pointer;
        }
        .hud-privs-chip:hover { border-color: #E9C445; }
        .hud-consent { display: inline-flex; align-items: center; gap: 0.5rem; }
        .hud-consent-text { font-size: 0.8rem; color: #e2e8f0; }
        .hud-consent-allow, .hud-consent-deny {
            font-size: 0.75rem; padding: 0.2rem 0.7rem; border-radius: 4px; cursor: pointer;
            border: 1px solid #2a2a4a; background: transparent; white-space: nowrap;
        }
        .hud-consent-allow { background: #4ECDC4; color: #0a0a18; border-color: #4ECDC4; font-weight: 700; }
        .hud-consent-allow:hover { background: #3dbdb5; }
        .hud-consent-deny { color: #ff6b6b; border-color: rgba(255,107,107,0.4); }
        .hud-consent-deny:hover { border-color: #ff6b6b; }
        .hud-debug-btn {
            font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 4px;
            border: 1px solid #2a2a4a; background: transparent;
            color: #4a5568; cursor: pointer; white-space: nowrap;
        }
        .hud-debug-btn:hover  { color: #4ECDC4; border-color: #4ECDC4; }
        .hud-debug-btn.active { color: #4ECDC4; border-color: #4ECDC4; background: rgba(78,205,196,0.08); }

        /* ── Nav row (HUD V1: back/forward/refresh + path display + copy + recent menu) ── */
        .hud-wrap { display: block; }
        .navrow {
            display: flex; align-items: center; gap: 0.4rem;
            background: #0e0e22; border-bottom: 1px solid #2a2a4a;
            padding: 0.3rem 0.7rem;
            min-height: 32px;
        }
        .navrow button {
            background: transparent; border: 1px solid transparent;
            color: #8892a4; border-radius: 4px;
            width: 26px; height: 26px;
            display: inline-flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 0.95rem; font-family: inherit; padding: 0;
        }
        .navrow button:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .navrow button:disabled,
        .navrow button:disabled:hover {
            opacity: 0.28; cursor: default;
            background: transparent; color: #8892a4;
        }
        .navrow-divider {
            width: 1px; height: 18px; background: #2a2a4a; margin: 0 0.15rem;
            display: inline-block;
        }
        .navrow-addr {
            flex: 1; min-width: 0;
            display: flex; align-items: center; gap: 0.45rem;
            background: rgba(255,255,255,0.04);
            border: 1px solid #2a2a4a;
            border-radius: 6px;
            padding: 0.22rem 0.6rem;
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            cursor: pointer;
            overflow: hidden;
            height: 26px; box-sizing: border-box;
        }
        .navrow-addr:hover { border-color: rgba(78,205,196,0.35); }
        .navrow-addr-icon { color: rgba(255,255,255,0.32); flex-shrink: 0; font-size: 0.85rem; }
        .navrow-addr-text {
            color: #e2e8f0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            min-width: 0; flex: 1;
        }
        .navrow-addr-hash { color: #4ECDC4; }
        .navrow-addr-input {
            flex: 1; min-width: 0;
            background: transparent;
            border: none; outline: none;
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            padding: 0;
            cursor: text;
        }
        .navrow-addr-input::selection { background: rgba(78,205,196,0.35); color: #fff; }
        .navrow-addr-input:focus { outline: none; }
        .navrow-menu-wrap { position: relative; }
        .navrow-menu-panel {
            position: absolute; top: calc(100% + 4px); right: 0;
            min-width: 260px; max-width: 420px;
            background: #14142a; border: 1px solid #2a2a4a;
            border-radius: 6px; padding: 0.35rem 0;
            box-shadow: 0 12px 30px rgba(0,0,0,0.55);
            z-index: 100;
            font-size: 0.78rem;
        }
        .navrow-menu-section {
            color: rgba(255,255,255,0.38);
            font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
            padding: 0.3rem 0.7rem 0.2rem;
        }
        .navrow-menu-item {
            display: block;
            padding: 0.3rem 0.7rem;
            color: #8892a4;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.74rem;
            cursor: pointer;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .navrow-menu-item:hover  { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .navrow-menu-item.current { color: #4ECDC4; }
        .navrow-menu-empty {
            padding: 0.4rem 0.7rem 0.6rem;
            color: rgba(255,255,255,0.32);
            font-size: 0.74rem;
            font-style: italic;
        }

        /* ── Escape pill (hidden-mode sovereignty chrome — always reachable) ──────── */
        .hud-escape {
            position: fixed; top: 8px; right: 8px;
            z-index: 9999;
            background: rgba(13,17,23,0.85);
            backdrop-filter: blur(8px);
            color: #e2e8f0;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 999px;
            padding: 0.28rem 0.8rem;
            font-size: 0.72rem;
            font-family: inherit;
            cursor: pointer;
        }
        .hud-escape:hover {
            background: rgba(13,17,23,0.95);
            border-color: rgba(78,205,196,0.45);
            color: #4ECDC4;
        }
    `;

    customElements.define('app-hud', AppHud);
})();
