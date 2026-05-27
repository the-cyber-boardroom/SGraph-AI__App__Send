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
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${AppHud.styles}</style>
                <div class="hud">
                    <div class="hud-left">
                        <span class="hud-brand">SG<span class="hud-slash">/</span>App</span>
                        <span class="hud-vault-badge" style="display:none"></span>
                        <span class="hud-app-title"></span>
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
                        <a class="hud-vault-link" href="#" style="display:none" title="Open vault">Open Vault</a>
                        <button class="hud-copy-btn" style="display:none" title="Copy app link">⎘ Copy Link</button>
                        <span class="hud-privs-chip" style="display:none" title="What this app is allowed to do"></span>
                        <span class="hud-ro-badge" style="display:none">👁 Read-only</span>
                        <button class="hud-debug-btn" title="Toggle debug panel">🔍 Debug</button>
                    </div>
                </div>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.hud-copy-btn'))  this._copyLink();
                if (e.target.closest('.hud-debug-btn')) this._toggleDebug();
                if (e.target.closest('.hud-privs-chip')) this._onPrivsClick();
            });
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
    `;

    customElements.define('app-hud', AppHud);
})();
