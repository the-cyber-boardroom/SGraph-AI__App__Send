/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Access Gate Component
   v0.3.0 — Consolidated from v0.2.0 base + v0.2.6 overlay

   This file combines the base class and the token bar redesign overlay into a
   single file. The overlay pattern is preserved — prototype mutation on
   SendAccessGate.prototype.

   Generated: 2026-03-22
   ═══════════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════════
// BASE CLASS (from v0.2.0)
// ═══════════════════════════════════════════════════════════════════════════════

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
                               data-testid="access-gate-input"
                               class="input"
                               style="width: 100%; padding-right: 2.5rem;"
                               placeholder="${this.t('access_gate.placeholder')}"
                               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
                        <button type="button" id="toggle-token-vis"
                                data-testid="access-gate-visibility-toggle"
                                title="${this.t('access_gate.show_token')}"
                                style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 0.25rem; font-size: 1rem; color: var(--color-text-secondary); line-height: 1;">&#128065;</button>
                    </div>
                    <button class="btn btn-primary" id="access-token-submit" data-testid="access-gate-submit">${this.t('access_gate.button')}</button>
                </div>
                <p style="font-size: var(--text-small, 0.75rem); color: var(--color-text-secondary); margin-top: 0.5rem;">${this.t('access_gate.browser_scope_hint')}</p>
                <div id="access-token-error" data-testid="access-gate-error" class="status status--error hidden" style="margin-top: 0.75rem;">
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
        bar.setAttribute('data-testid', 'token-status-bar');
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

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.6 — Token bar redesign: title, show/hide, share note
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Access Gate Component
   v0.2.6 — Overlay on v0.2.0

   Changes:
     - Token status bar redesigned with:
       - Section title "Access Token"
       - Show/hide current token with copy button
       - Share note encouraging sharing with colleagues
       - Improved "Change Token" button styling
     - Token bar uses card styling consistent with upload wizard

   Loads AFTER v0.2.0 — overrides via prototype mutation.
   ============================================================================= */

// Store original methods
var _v020_updateTokenBar = SendAccessGate.prototype.updateTokenBar;
var _v020_showContent    = SendAccessGate.prototype.showContent;

// ─── Processing states where Change Token is dangerous ──────────────────────
var BUSY_STATES = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing'];

// ─── Override: showContent — watch upload state to hide bar during processing ─
SendAccessGate.prototype.showContent = function() {
    _v020_showContent.call(this);
    var self = this;

    // Watch for upload state changes via MutationObserver on the upload component
    var upload = this.querySelector('send-upload');
    if (upload) {
        var observer = new MutationObserver(function() {
            var bar = self.querySelector('#token-status-bar');
            if (!bar) return;
            var state = upload.state || 'idle';
            var isBusy = BUSY_STATES.indexOf(state) !== -1;
            bar.style.display = isBusy ? 'none' : '';
        });
        observer.observe(upload, { childList: true, subtree: true });
        this._v026_observer = observer;
    }
};

// ─── Override: updateTokenBar — redesigned with title, show/hide, share note ─
SendAccessGate.prototype.updateTokenBar = function(bar, remaining) {
    var self = this;
    var token = typeof ApiClient !== 'undefined' ? ApiClient.getAccessToken() : '';
    var maskedToken = token ? token.replace(/./g, '\u2022') : '';

    var infoText = remaining !== null
        ? '<strong>' + remaining + '</strong> ' + this.t('access_gate.uses_remaining', { remaining: '' }).trim()
        : 'Token active';

    bar.style.cssText = 'margin-top: 1rem; margin-bottom: 1rem; padding: 0; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius, 12px); overflow: hidden;';

    bar.innerHTML =
        '<div class="v026-token-bar">' +
            '<div class="v026-token-bar__header">' +
                '<span class="v026-token-bar__title">Access Token</span>' +
                '<span class="v026-token-bar__remaining">' + infoText + '</span>' +
            '</div>' +
            '<div class="v026-token-bar__token-row" id="v026-token-reveal" style="display: none;">' +
                '<span class="v026-token-bar__token-value" id="v026-token-value">' + maskedToken + '</span>' +
                '<button class="v026-token-bar__icon-btn" id="v026-toggle-vis" title="Show token">' +
                    '&#128065;' +
                '</button>' +
                '<button class="v026-token-bar__icon-btn" id="v026-copy-token" title="Copy token">' +
                    '&#128203;' +
                '</button>' +
            '</div>' +
            '<div class="v026-token-bar__actions">' +
                '<button class="v026-token-bar__show-btn" id="v026-show-token-row">Show current token</button>' +
                '<div class="v026-token-bar__share-note">' +
                    '&#128100; Share your access token with friends and colleagues so they can send files too' +
                '</div>' +
                '<button class="v026-token-bar__change-btn" id="v026-change-token" data-testid="token-change-btn">' +
                    this.t('access_gate.change_token') +
                '</button>' +
            '</div>' +
        '</div>';

    // Show token row toggle
    var showBtn = bar.querySelector('#v026-show-token-row');
    var tokenRow = bar.querySelector('#v026-token-reveal');
    if (showBtn && tokenRow) {
        showBtn.addEventListener('click', function() {
            var isVisible = tokenRow.style.display !== 'none';
            tokenRow.style.display = isVisible ? 'none' : 'flex';
            showBtn.textContent = isVisible ? 'Show current token' : 'Hide current token';
        });
    }

    // Toggle visibility (masked vs plain)
    var toggleBtn = bar.querySelector('#v026-toggle-vis');
    var tokenValueEl = bar.querySelector('#v026-token-value');
    var isRevealed = false;
    if (toggleBtn && tokenValueEl && token) {
        toggleBtn.addEventListener('click', function() {
            isRevealed = !isRevealed;
            tokenValueEl.textContent = isRevealed ? token : maskedToken;
            toggleBtn.innerHTML = isRevealed ? '&#128064;' : '&#128065;';
            toggleBtn.title = isRevealed ? 'Hide token' : 'Show token';
        });
    }

    // Copy token
    var copyBtn = bar.querySelector('#v026-copy-token');
    if (copyBtn && token) {
        copyBtn.addEventListener('click', function() {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(token).then(function() {
                    copyBtn.innerHTML = '&#10003;';
                    copyBtn.title = 'Copied!';
                    setTimeout(function() {
                        copyBtn.innerHTML = '&#128203;';
                        copyBtn.title = 'Copy token';
                    }, 2000);
                });
            }
        });
    }

    // Change token
    var changeBtn = bar.querySelector('#v026-change-token');
    if (changeBtn) {
        changeBtn.addEventListener('click', function() {
            if (typeof ApiClient !== 'undefined') ApiClient.clearAccessToken();
            self.showGate();
        });
    }
};

// ─── Styles ──────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v026-token-bar-styles')) return;
    var style = document.createElement('style');
    style.id = 'v026-token-bar-styles';
    style.textContent = '\
        .v026-token-bar {\
            padding: var(--space-4, 1rem);\
        }\
        .v026-token-bar__header {\
            display: flex;\
            justify-content: space-between;\
            align-items: center;\
            margin-bottom: var(--space-3, 0.75rem);\
        }\
        .v026-token-bar__title {\
            font-size: var(--text-sm, 0.875rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
        }\
        .v026-token-bar__remaining {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
        }\
        .v026-token-bar__remaining strong {\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Token reveal row */\
        .v026-token-bar__token-row {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);\
            background: rgba(78, 205, 196, 0.04);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-3, 0.75rem);\
        }\
        .v026-token-bar__token-value {\
            flex: 1;\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text, #E0E0E0);\
            letter-spacing: 0.05em;\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
        }\
        .v026-token-bar__icon-btn {\
            background: none;\
            border: none;\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem);\
            font-size: 1rem;\
            color: var(--color-text-secondary, #8892A0);\
            border-radius: var(--radius-xs, 4px);\
            transition: color 0.2s, background 0.2s;\
            line-height: 1;\
        }\
        .v026-token-bar__icon-btn:hover {\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
        }\
        \
        /* Actions row */\
        .v026-token-bar__actions {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            flex-wrap: wrap;\
        }\
        .v026-token-bar__show-btn {\
            background: none;\
            border: none;\
            cursor: pointer;\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-primary, #4ECDC4);\
            padding: 0;\
            text-decoration: underline;\
            text-underline-offset: 2px;\
        }\
        .v026-token-bar__show-btn:hover {\
            opacity: 0.8;\
        }\
        .v026-token-bar__share-note {\
            flex: 1;\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-text-secondary, #8892A0);\
            min-width: 150px;\
            line-height: 1.4;\
        }\
        .v026-token-bar__change-btn {\
            background: transparent;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            color: var(--color-text-secondary, #8892A0);\
            padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-small, 0.75rem);\
            cursor: pointer;\
            transition: border-color 0.2s, color 0.2s, background 0.2s;\
            white-space: nowrap;\
        }\
        .v026-token-bar__change-btn:hover {\
            border-color: var(--color-primary, #4ECDC4);\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.06);\
        }\
        \
        @media (max-width: 480px) {\
            .v026-token-bar__actions { flex-direction: column; align-items: stretch; }\
            .v026-token-bar__share-note { text-align: center; }\
            .v026-token-bar__change-btn { width: 100%; text-align: center; }\
        }\
    ';
    document.head.appendChild(style);
})();
