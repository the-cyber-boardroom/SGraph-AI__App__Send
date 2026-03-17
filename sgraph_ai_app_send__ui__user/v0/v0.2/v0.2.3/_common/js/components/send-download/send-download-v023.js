/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Component
   v0.2.3 — Surgical overrides on v0.2.2

   Changes:
     - Friendly token support: word-word-NNNN in URL hash auto-resolves
     - Token entry form when no transfer ID in URL (replaces v0.2.2 manual entry)
     - Accepts friendly tokens in manual entry form too
     - Derives transfer ID (SHA-256 → 12 hex) + AES key (PBKDF2) from token
     - Falls through to v0.2.2 for standard #transferId/key URLs

   Uses shared FriendlyCrypto module (friendly-crypto.js).

   Loads AFTER v0.2.2 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ═══════════════════════════════════════════════════════════════════════════════ */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v023] SendDownload not found — skipping');
    return;
}
if (typeof FriendlyCrypto === 'undefined') {
    console.warn('[send-download-v023] FriendlyCrypto not found — skipping');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
var _v022_connectedCallback = SendDownload.prototype.connectedCallback;
var _v022_parseUrl          = SendDownload.prototype.parseUrl;
var _v022_handleHashChange  = SendDownload.prototype.handleHashChange;
var _v022_renderError       = SendDownload.prototype.renderError;
var _v022_setupEvents       = SendDownload.prototype.setupEventListeners;

// ─── Override: parseUrl — detect friendly tokens in hash ─────────────────────
SendDownload.prototype.parseUrl = function() {
    this._friendlyToken = null;

    var hash = window.location.hash.substring(1);
    if (hash && FriendlyCrypto.isFriendlyToken(hash)) {
        this._friendlyToken = hash;
        // Don't set transferId yet — will derive asynchronously
        return;
    }

    // Also check query param
    var params = new URLSearchParams(window.location.search);
    var tokenParam = params.get('token') || null;
    if (tokenParam && FriendlyCrypto.isFriendlyToken(tokenParam)) {
        this._friendlyToken = tokenParam;
        return;
    }

    // Standard URL — delegate to v0.2.2
    _v022_parseUrl.call(this);
};

// ─── Override: connectedCallback — async-aware for friendly tokens ───────────
SendDownload.prototype.connectedCallback = function() {
    this._friendlyToken = null;
    this._friendlyResolved = false;

    // Capture original URL (v0.2.1 feature)
    this._originalDownloadUrl = window.location.href;

    this.parseUrl();

    if (this._friendlyToken) {
        // Friendly token detected — show loading, derive async
        this.state = 'loading';
        this.render();
        this._resolveFriendlyToken(this._friendlyToken);
    } else if (!this.transferId) {
        // No transfer ID — show entry form
        this.state = 'error';
        this.errorMessage = this.t('download.error.no_id');
        this.render();
        this.setupEventListeners();
    } else {
        // Standard URL — proceed normally
        this.loadTransferInfo();
    }

    document.addEventListener('locale-changed', this._localeHandler);
    this._boundHashChange = function() { this.handleHashChange(); }.bind(this);
    window.addEventListener('hashchange', this._boundHashChange);
};

// ─── Resolve friendly token → transfer ID + key ────────────────────────────
SendDownload.prototype._resolveFriendlyToken = async function(friendlyToken) {
    try {
        // Derive transfer ID (SHA-256 → 12 hex chars)
        this.transferId = await FriendlyCrypto.deriveTransferId(friendlyToken);

        // Derive AES key (PBKDF2) and export as base64url
        var key = await FriendlyCrypto.deriveKey(friendlyToken);
        this.hashKey = await FriendlyCrypto.exportKey(key);

        this._friendlyResolved = true;

        // Now proceed with normal flow
        this.loadTransferInfo();
    } catch (e) {
        this.state = 'error';
        this.errorMessage = 'Failed to resolve token: ' + (e.message || 'unknown error');
        this.render();
        this.setupEventListeners();
    }
};

// ─── Override: handleHashChange — check for friendly token ───────────────────
SendDownload.prototype.handleHashChange = function() {
    // Reset friendly state
    this._friendlyToken = null;
    this._friendlyResolved = false;

    // Reset all download state
    this.transferId = null; this.transferInfo = null; this.transparencyData = null;
    this.hashKey = null; this.tokenName = null; this.decryptedText = null;
    this.decryptedBytes = null; this.fileName = null; this.tokenRemaining = undefined;
    this.state = 'loading'; this.errorMessage = null;
    this._renderType = null; this._objectUrl = null; this._showRaw = false;
    this._stageTimestamps = {};

    this.parseUrl();

    if (this._friendlyToken) {
        this.state = 'loading';
        this.render();
        this._resolveFriendlyToken(this._friendlyToken);
    } else if (!this.transferId) {
        this.state = 'error';
        this.errorMessage = this.t('download.error.no_id');
        this.render();
        this.setupEventListeners();
    } else {
        this.loadTransferInfo();
    }
};

// ─── Override: renderError — friendly token entry form ───────────────────────
SendDownload.prototype.renderError = function() {
    if (this.state !== 'error') return '';

    // Show friendly token entry form when no transfer ID
    var isNoId = !this.transferId && !this._friendlyToken;
    if (isNoId) {
        return '\
            <div class="v023-entry">\
                <div class="v023-entry__header">\
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="1.5" stroke-linecap="round">\
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>\
                        <polyline points="7 10 12 15 17 10"/>\
                        <line x1="12" y1="15" x2="12" y2="3"/>\
                    </svg>\
                    <h2>Receive a file</h2>\
                </div>\
                <p class="v023-entry__desc">Enter the token or link you were given to decrypt and view your file.</p>\
                <div class="v023-entry__form">\
                    <input type="text" class="input v023-entry__input" id="v023-token-input" \
                           placeholder="e.g. apple-mango-5623 or paste a link" \
                           autocomplete="off" spellcheck="false" autocapitalize="none">\
                    <button class="btn btn-primary v023-entry__btn" id="v023-token-btn">Open</button>\
                </div>\
                <div class="v023-entry__examples">\
                    <div class="v023-entry__example">\
                        <span class="v023-entry__example-label">Token</span>\
                        <code>apple-mango-5623</code>\
                    </div>\
                    <div class="v023-entry__example">\
                        <span class="v023-entry__example-label">Link</span>\
                        <code>send.sgraph.ai/.../download/#apple-mango-5623</code>\
                    </div>\
                    <div class="v023-entry__example">\
                        <span class="v023-entry__example-label">Transfer ID + key</span>\
                        <code>d6a1c7da620d/F5w9JGd...</code>\
                    </div>\
                </div>\
                <div id="v023-entry-error" class="v023-entry__error" style="display: none;"></div>\
            </div>';
    }

    // Non-entry errors — show standard error
    return '<div class="status status--error">' + this.escapeHtml(this.errorMessage || 'Unknown error') + '</div>';
};

// ─── Override: setupEventListeners — handle token entry form ─────────────────
SendDownload.prototype.setupEventListeners = function() {
    var self = this;

    // Token entry form
    var tokenBtn   = this.querySelector('#v023-token-btn');
    var tokenInput = this.querySelector('#v023-token-input');

    if (tokenBtn && tokenInput) {
        var handleSubmit = function() {
            var raw = tokenInput.value.trim();
            var errorDiv = self.querySelector('#v023-entry-error');
            if (!raw) {
                if (errorDiv) { errorDiv.textContent = 'Please enter a token or link.'; errorDiv.style.display = ''; }
                return;
            }

            // 1. Check if it's a friendly token
            var lower = raw.toLowerCase();
            if (FriendlyCrypto.isFriendlyToken(lower)) {
                self._friendlyToken = lower;
                self.state = 'loading';
                self.render();
                self._resolveFriendlyToken(lower);
                return;
            }

            // 2. Try parsing as a URL
            var fileId = null, key = null;
            try {
                if (raw.startsWith('http')) {
                    var url = new URL(raw);
                    var hash = url.hash.substring(1);
                    if (hash && FriendlyCrypto.isFriendlyToken(hash)) {
                        self._friendlyToken = hash;
                        self.state = 'loading';
                        self.render();
                        self._resolveFriendlyToken(hash);
                        return;
                    }
                    if (hash) {
                        var slashIdx = hash.indexOf('/');
                        if (slashIdx > 0) { fileId = hash.substring(0, slashIdx); key = hash.substring(slashIdx + 1); }
                        else { fileId = hash; }
                    }
                }
            } catch(e) {}

            // 3. Try as raw transferId/key
            if (!fileId) {
                raw = raw.replace(/^[#/]+/, '');
                var slashIdx = raw.indexOf('/');
                if (slashIdx > 0) {
                    fileId = raw.substring(0, slashIdx);
                    key = raw.substring(slashIdx + 1);
                } else {
                    fileId = raw;
                }
            }

            if (!fileId) {
                if (errorDiv) { errorDiv.textContent = 'Could not parse. Try a token like apple-mango-5623 or a download link.'; errorDiv.style.display = ''; }
                return;
            }

            // Navigate to the parsed URL (triggers hashchange)
            var newUrl = window.location.origin + window.location.pathname;
            newUrl += '#' + fileId;
            if (key) newUrl += '/' + key;
            window.location.href = newUrl;
        };

        tokenBtn.addEventListener('click', handleSubmit);
        tokenInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') handleSubmit();
        });
        tokenInput.focus();
        return;
    }

    // Not the entry form — delegate to v0.2.2
    _v022_setupEvents.call(this);
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v023-download-styles')) return;
    var style = document.createElement('style');
    style.id = 'v023-download-styles';
    style.textContent = '\
        .v023-entry {\
            text-align: center;\
            padding: var(--space-8, 2rem) var(--space-4, 1rem);\
        }\
        .v023-entry__header {\
            display: flex;\
            flex-direction: column;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            margin-bottom: var(--space-4, 1rem);\
        }\
        .v023-entry__header h2 {\
            font-size: var(--text-h2, 1.5rem);\
            font-weight: var(--weight-bold, 700);\
            color: var(--color-text, #E0E0E0);\
            margin: 0;\
        }\
        .v023-entry__desc {\
            font-size: var(--text-body, 1rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin: 0 0 var(--space-6, 1.5rem) 0;\
            line-height: 1.5;\
        }\
        .v023-entry__form {\
            display: flex;\
            gap: var(--space-3, 0.75rem);\
            max-width: 440px;\
            margin: 0 auto var(--space-6, 1.5rem) auto;\
        }\
        .v023-entry__input {\
            flex: 1;\
            text-align: center;\
            font-size: var(--text-body, 1rem) !important;\
            letter-spacing: 0.02em;\
        }\
        .v023-entry__btn {\
            white-space: nowrap;\
            min-width: 80px;\
        }\
        .v023-entry__examples {\
            display: flex;\
            flex-direction: column;\
            gap: var(--space-2, 0.5rem);\
            max-width: 440px;\
            margin: 0 auto;\
            text-align: left;\
        }\
        .v023-entry__example {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            font-size: var(--text-sm, 0.875rem);\
        }\
        .v023-entry__example-label {\
            min-width: 100px;\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-small, 0.8rem);\
        }\
        .v023-entry__example code {\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-small, 0.8rem);\
            color: var(--accent, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
            padding: 0.15em 0.5em;\
            border-radius: var(--radius-sm, 4px);\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
        }\
        .v023-entry__error {\
            margin-top: var(--space-3, 0.75rem);\
            color: var(--color-error, #ff6b6b);\
            font-size: var(--text-sm, 0.875rem);\
        }\
    ';
    document.head.appendChild(style);
})();

// ─── Re-render already-upgraded elements (same pattern as v0.2.2) ────────────
document.querySelectorAll('send-download').forEach(function(el) {
    if (el.state === 'error' && !el.transferId) {
        el.render();
        el.setupEventListeners();
    }
});

console.log('[send-download-v023] Friendly token support (word-word-NNNN → transfer ID + key derivation)');

})();
