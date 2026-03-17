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

(function() {

if (typeof SendAccessGate === 'undefined') {
    console.warn('[send-access-gate-v026] SendAccessGate not found — skipping overrides');
    return;
}

// Store original methods
var _v020_updateTokenBar = SendAccessGate.prototype.updateTokenBar;

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
                '<button class="v026-token-bar__change-btn" id="v026-change-token">' +
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

console.log('[send-access-gate-v026] Token bar redesigned with title, show/hide, share note');

})();
