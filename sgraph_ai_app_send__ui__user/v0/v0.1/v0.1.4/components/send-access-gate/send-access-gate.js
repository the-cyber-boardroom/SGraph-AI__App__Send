/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Access Gate Web Component
   v0.1.4 — osbot-* audit + IFD bump

   Changes from v0.1.0:
   - Token status bar (uses remaining + Change Token) below send section
   - i18n support via I18n.t()
   - Locale-changed listener to re-render token bar

   Gates the send page behind an access token. If the token is not in
   localStorage, shows a form asking for it. Once entered, stores it
   and reveals the upload component.

   If a 401 is received during upload (token expired or wrong), the
   upload component catches 'ACCESS_TOKEN_INVALID' and dispatches
   'access-token-invalid' on the document, which this gate listens for.

   Usage:
     <send-access-gate>
         <send-upload></send-upload>
     </send-access-gate>
   ═══════════════════════════════════════════════════════════════════════════ */

class SendAccessGate extends HTMLElement {

    connectedCallback() {
        this._onTokenInvalid = () => this.showGate('Your access token is no longer valid. Please enter a new token.');
        document.addEventListener('access-token-invalid', this._onTokenInvalid);

        this._onLocaleChanged = () => {
            const bar = this.querySelector('#token-status-bar');
            if (bar) this.updateTokenBar(bar, this._cachedRemaining);
        };
        document.addEventListener('locale-changed', this._onLocaleChanged);

        this._cachedRemaining = null;

        if (ApiClient.hasAccessToken()) {
            this.showContent();
        } else {
            this.showGate();
        }
    }

    disconnectedCallback() {
        if (this._onTokenInvalid) {
            document.removeEventListener('access-token-invalid', this._onTokenInvalid);
        }
        if (this._onLocaleChanged) {
            document.removeEventListener('locale-changed', this._onLocaleChanged);
        }
    }

    // ─── Shorthand ─────────────────────────────────────────────────────────

    t(key, params) { return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key; }

    showGate(reason) {
        this._originalContent = this._originalContent || this.innerHTML;
        const reasonHtml = reason
            ? `<div class="status status--warning" style="margin-bottom: 1rem;">${reason}</div>`
            : '';
        this.innerHTML = `
            <div class="card">
                ${reasonHtml}
                <div style="text-align: center; padding: 1rem 0;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">&#128274;</div>
                    <h2 style="font-size: var(--font-size-lg); margin-bottom: 0.25rem;">Beta Access</h2>
                    <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 1.5rem;">
                        Enter your access token to start sending files.
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text"
                           id="access-token-input"
                           class="input"
                           placeholder="Paste your access token"
                           autocomplete="off"
                           spellcheck="false">
                    <button class="btn btn-primary" id="access-token-submit">Go</button>
                </div>
                <div id="access-token-error" class="status status--error hidden" style="margin-top: 0.75rem;">
                    Invalid or missing token. Please check and try again.
                </div>
            </div>

            <div class="card" style="margin-top: 1.5rem; text-align: center;">
                <h3 style="font-size: var(--font-size-base); margin-bottom: 0.25rem;">Join the Early Access Program</h3>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 1rem;">
                    Sign up to get notified when SGraph Send is available.
                </p>
                <form class="launchlist-form" action="https://getlaunchlist.com/s/zSa8gI" method="POST">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
                        <input name="name" type="text" class="input" placeholder="Name" style="flex: 1; min-width: 120px;">
                        <input name="email" type="email" class="input" placeholder="Email" required style="flex: 1; min-width: 180px;">
                        <button type="submit" class="btn btn-primary">Sign Up</button>
                    </div>
                </form>
            </div>
        `;

        const input  = this.querySelector('#access-token-input');
        const submit = this.querySelector('#access-token-submit');

        submit.addEventListener('click', () => this.submitToken());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submitToken();
        });

        input.focus();
    }

    async submitToken() {
        const input  = this.querySelector('#access-token-input');
        const error  = this.querySelector('#access-token-error');
        const submit = this.querySelector('#access-token-submit');
        const token  = (input.value || '').trim();

        if (!token) {
            error.classList.remove('hidden');
            return;
        }

        // Validate token against admin service before accepting
        if (submit) submit.disabled = true;
        try {
            const result = await ApiClient.checkToken(token);
            if (!result.valid) {
                const reason = result.reason || result.status || '';
                if (reason === 'not_found') {
                    error.textContent = 'Token not found. Please check and try again.';
                } else if (reason === 'exhausted' || result.status === 'exhausted') {
                    error.textContent = 'This token has been fully used. Please request a new one.';
                } else if (reason === 'revoked' || result.status === 'revoked') {
                    error.textContent = 'This token has been revoked.';
                } else {
                    error.textContent = 'Invalid or missing token. Please check and try again.';
                }
                error.classList.remove('hidden');
                if (submit) submit.disabled = false;
                return;
            }
        } catch (e) {
            // Token check endpoint unavailable — fall through (backwards compat with env-var mode)
        }
        if (submit) submit.disabled = false;

        ApiClient.setAccessToken(token);
        this.showContent();
    }

    showContent() {
        if (this._originalContent) {
            this.innerHTML = this._originalContent;
        } else {
            this._originalContent = this.innerHTML;
        }

        // Add token status bar AFTER the send-upload element (below the send section)
        const bar = document.createElement('div');
        bar.id = 'token-status-bar';
        bar.style.cssText = 'margin-top: 1rem; margin-bottom: 1rem; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.875rem; background: var(--color-drop-zone-bg, #f8f9fa); border: 1px solid var(--color-border, #dee2e6); border-radius: var(--radius, 0.5rem);';
        bar.innerHTML = '<span style="color: var(--color-text-secondary, #6c757d);">...</span>';

        const upload = this.querySelector('send-upload');
        if (upload && upload.nextSibling) {
            upload.parentNode.insertBefore(bar, upload.nextSibling);
        } else {
            this.appendChild(bar);
        }

        this.loadTokenInfo();

        // Re-trigger custom element upgrades for slotted content
        this.querySelectorAll('send-upload').forEach(el => {
            if (!el._initialized) {
                el._initialized = true;
            }
        });
    }

    async loadTokenInfo() {
        const bar = this.querySelector('#token-status-bar');
        if (!bar) return;

        const token = ApiClient.getAccessToken();
        if (!token) return;

        let remaining = null;
        try {
            const result = await ApiClient.checkToken(token);
            if (result.valid && result.remaining !== undefined) {
                remaining = result.remaining;
            }
        } catch (e) {
            // checkToken unavailable — show generic status
        }

        this._cachedRemaining = remaining;
        this.updateTokenBar(bar, remaining);
    }

    updateTokenBar(bar, remaining) {
        const infoText = remaining !== null
            ? `<strong>${remaining}</strong> ${this.t('access_gate.uses_remaining', { remaining: '' }).trim()}`
            : 'Token active';

        bar.innerHTML = `
            <span style="color: var(--color-text-secondary, #6c757d);">${infoText}</span>
            <button class="btn btn-sm" id="reset-token-btn" style="font-size: 0.8rem;">${this.t('access_gate.change_token')}</button>
        `;

        const btn = bar.querySelector('#reset-token-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                ApiClient.clearAccessToken();
                this.showGate();
            });
        }
    }
}

customElements.define('send-access-gate', SendAccessGate);
