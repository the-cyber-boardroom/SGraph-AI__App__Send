/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Access Gate Component
   v0.2.0 — Consolidated from v0.1.0 + v0.1.4

   Gates the page behind an access token. If the token is not in localStorage,
   shows a form asking for it. Once validated, reveals the slotted content.
   Token status bar shows remaining uses and "Change Token" button.

   Usage:
     <send-access-gate>
         <send-upload></send-upload>
     </send-access-gate>
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendAccessGate extends HTMLElement {

    connectedCallback() {
        this._onTokenInvalid = () => this.showGate(I18n.t('access_gate.invalid'));
        document.addEventListener('access-token-invalid', this._onTokenInvalid);

        this._onLocaleChanged = () => {
            const bar = this.querySelector('#token-status-bar');
            if (bar) {
                this.updateTokenBar(bar, this._cachedRemaining);
            } else if (!ApiClient.hasAccessToken()) {
                // In gate mode — re-render with new translations
                this.showGate();
            }
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
        if (this._onTokenInvalid) document.removeEventListener('access-token-invalid', this._onTokenInvalid);
        if (this._onLocaleChanged) document.removeEventListener('locale-changed', this._onLocaleChanged);
    }

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
                    <h2 style="font-size: var(--text-h3); margin-bottom: 0.25rem;">${this.t('access_gate.title')}</h2>
                    <p style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 1.5rem;">
                        ${this.t('access_gate.subtitle')}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <div style="position: relative; flex: 1;">
                        <input type="password"
                               id="access-token-input"
                               class="input"
                               style="width: 100%; padding-right: 2.5rem;"
                               placeholder="${this.t('access_gate.placeholder')}"
                               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
                        <button type="button" id="toggle-token-vis"
                                title="${this.t('access_gate.show_token')}"
                                style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 0.25rem; font-size: 1rem; color: var(--color-text-secondary); line-height: 1;">&#128065;</button>
                    </div>
                    <button class="btn btn-primary" id="access-token-submit">${this.t('access_gate.button')}</button>
                </div>
                <p style="font-size: var(--text-small, 0.75rem); color: var(--color-text-secondary); margin-top: 0.5rem;">${this.t('access_gate.browser_scope_hint')}</p>
                <div id="access-token-error" class="status status--error hidden" style="margin-top: 0.75rem;">
                    ${this.t('access_gate.invalid')}
                </div>
            </div>

            <div class="card" style="margin-top: 1.5rem; text-align: center;">
                <h3 style="font-size: var(--text-body); margin-bottom: 0.25rem;">${this.t('access_gate.signup_title')}</h3>
                <p style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 1rem;">
                    ${this.t('access_gate.signup_subtitle')}
                </p>
                <form class="launchlist-form" action="https://getlaunchlist.com/s/zSa8gI" method="POST">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
                        <input name="name" type="text" class="input" placeholder="${this.t('form.name_placeholder')}" style="flex: 1; min-width: 120px;">
                        <input name="email" type="email" class="input" placeholder="${this.t('form.email_placeholder')}" required style="flex: 1; min-width: 180px;">
                        <button type="submit" class="btn btn-primary">${this.t('form.signup_button')}</button>
                    </div>
                </form>
            </div>
        `;

        const input  = this.querySelector('#access-token-input');
        const submit = this.querySelector('#access-token-submit');

        submit.addEventListener('click', () => this.submitToken());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitToken(); });

        const toggleBtn = this.querySelector('#toggle-token-vis');
        toggleBtn.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type        = isHidden ? 'text' : 'password';
            toggleBtn.title   = isHidden ? this.t('access_gate.hide_token') : this.t('access_gate.show_token');
            toggleBtn.innerHTML = isHidden ? '&#128064;' : '&#128065;';
        });

        input.focus();
    }

    async submitToken() {
        const input  = this.querySelector('#access-token-input');
        const error  = this.querySelector('#access-token-error');
        const submit = this.querySelector('#access-token-submit');
        const token  = (input.value || '').trim().toLowerCase();

        if (!token) { error.classList.remove('hidden'); return; }

        // Reject tokens with non-ASCII or non-alphanumeric characters (prevents ISO-8859-1 header errors)
        if (!/^[a-z0-9_-]+$/.test(token)) {
            error.textContent = this.t('access_gate.invalid_format');
            error.classList.remove('hidden');
            return;
        }

        if (submit) submit.disabled = true;
        try {
            const result = await ApiClient.checkToken(token);
            if (!result.valid) {
                const reason = result.reason || result.status || '';
                if (reason === 'not_found')  error.textContent = this.t('access_gate.not_found');
                else if (reason === 'exhausted' || result.status === 'exhausted') error.textContent = this.t('access_gate.exhausted');
                else if (reason === 'revoked' || result.status === 'revoked')     error.textContent = this.t('access_gate.revoked');
                else error.textContent = this.t('access_gate.invalid');
                error.classList.remove('hidden');
                if (submit) submit.disabled = false;
                return;
            }
        } catch (e) {
            // checkToken unavailable (network error or service down) — accept token optimistically.
            // Format validation above already ensured it is structurally valid.
            // If the token is actually invalid, the next upload attempt will return 401.
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

        // Token status bar
        const bar = document.createElement('div');
        bar.id = 'token-status-bar';
        bar.style.cssText = 'margin-top: 1rem; margin-bottom: 1rem; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; font-size: var(--text-sm); background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius);';
        bar.innerHTML = '<span style="color: var(--color-text-secondary);">...</span>';

        const upload = this.querySelector('send-upload');
        if (upload && upload.nextSibling) {
            upload.parentNode.insertBefore(bar, upload.nextSibling);
        } else {
            this.appendChild(bar);
        }

        this.loadTokenInfo();
    }

    async loadTokenInfo() {
        const bar = this.querySelector('#token-status-bar');
        if (!bar) return;

        const token = ApiClient.getAccessToken();
        if (!token) return;

        let remaining = null;
        try {
            const result = await ApiClient.checkToken(token);
            if (result.valid && result.remaining !== undefined) remaining = result.remaining;
        } catch (e) { /* checkToken unavailable */ }

        this._cachedRemaining = remaining;
        this.updateTokenBar(bar, remaining);
    }

    updateTokenBar(bar, remaining) {
        const infoText = remaining !== null
            ? `<strong>${remaining}</strong> ${this.t('access_gate.uses_remaining', { remaining: '' }).trim()}`
            : 'Token active';

        bar.innerHTML = `
            <span style="color: var(--color-text-secondary);">${infoText}</span>
            <button class="btn btn-sm" id="reset-token-btn" style="font-size: var(--text-small);">${this.t('access_gate.change_token')}</button>
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
