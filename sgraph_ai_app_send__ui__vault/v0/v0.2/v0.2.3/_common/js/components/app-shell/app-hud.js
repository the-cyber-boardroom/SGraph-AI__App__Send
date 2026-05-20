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
            this._messages = {};  // handle → { el, timer }
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
                    </div>
                    <div class="hud-right">
                        <a class="hud-vault-link" href="#" style="display:none" title="Open vault in a new tab">Open Vault ↗</a>
                        <button class="hud-copy-btn" style="display:none" title="Copy app link">⎘ Copy Link</button>
                        <span class="hud-ro-badge" style="display:none">👁 Read-only</span>
                    </div>
                </div>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.hud-copy-btn')) this._copyLink();
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
                var base = window.location.pathname.split('/en-gb/')[0];
                link.href   = base + '/en-gb/vault/#' + vaultKey;
                link.target = '_blank';
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
    `;

    customElements.define('app-hud', AppHud);
})();
