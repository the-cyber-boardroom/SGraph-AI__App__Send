/* =============================================================================
   SGraph Send — Upload Component
   v0.2.6 — Surgical overlay on v0.2.5

   Changes:
     - Step 4 (Share) defaults to "Combined link" mode (no card picker)
       User can click "Change" to switch to separate key or token mode
     - Skip file-ready pause for ALL files (single files too) — delivery
       step already shows file info, so the intermediate screen is redundant
     - Three sharing modes available via Change button:
       1. Combined link — URL with embedded key (default, simplest)
       2. Link + key separate — send via different channels (more secure)
       3. Simple token — short memorable code (easiest to share verbally)

   Loads AFTER v0.2.5 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard: v0.2.5 must be loaded ───────────────────────────────────────────
if (typeof SendUpload === 'undefined' || !SendUpload.prototype._v025_multiFile === undefined) {
    console.warn('[send-upload-v026] v0.2.5 overlay not found — skipping v0.2.6 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
const _v025_renderResult       = SendUpload.prototype.renderResult;
const _v025_setupDynamic       = SendUpload.prototype.setupDynamicListeners;
const _v025_resetForNew        = SendUpload.prototype.resetForNew;
const _v025_advanceToDelivery  = SendUpload.prototype._v023_advanceToDelivery;

// ─── Override: skip file-ready for ALL files ────────────────────────────────
// The delivery step (Step 2) already shows file info at the top, so the
// intermediate file-ready pause is redundant for single files too.
SendUpload.prototype._v023_advanceToDelivery = function() {
    this._v024_userConfirmed = true;
    _v025_advanceToDelivery.call(this);
};

// ─── Share mode definitions ────────────────────────────────────────────────
var SHARE_MODES = [
    {
        id:    'combined',
        icon:  '\uD83D\uDD17',       // 🔗
        title: 'Combined link',
        desc:  'One link with the decryption key embedded. Recipient clicks and gets the file.',
        hint:  'Simplest — one click for the recipient',
        security: 'Anyone with this link can decrypt the file'
    },
    {
        id:    'separate',
        icon:  '\uD83D\uDD10',       // 🔐
        title: 'Link + key separate',
        desc:  'Send the link and decryption key through different channels.',
        hint:  'More secure — requires both pieces',
        security: 'Neither piece works alone'
    },
    {
        id:    'token',
        icon:  '\uD83C\uDFAB',       // 🎫
        title: 'Simple token',
        desc:  'A short transfer ID they can enter on the site. Key sent separately.',
        hint:  'Easy to share verbally or in a message',
        security: 'Recipient needs both the token and the key'
    }
];

// ─── Override: renderResult — three sharing mode cards ──────────────────────
SendUpload.prototype.renderResult = function() {
    if (this.state !== 'complete' || !this.result) return '';

    var result = this.result;
    var selectedMode = this._v026_shareMode || 'combined';

    // File summary at top
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    var icon = isFolder ? '&#128193;' : '&#128196;';
    var name = isFolder ? (this._folderName || 'folder') + '/' : (file ? file.name : '');
    var meta = isFolder
        ? this._folderScan.fileCount + ' files &middot; ' + this.formatBytes(this._folderScan.totalSize)
        : (file ? this.formatBytes(file.size) : '');

    // Success message
    var successHtml =
        '<div class="v026-success-banner">' +
            '<span class="v026-success-banner__icon">&#10003;</span>' +
            '<span>Encrypted and uploaded successfully</span>' +
        '</div>';

    // File summary
    var summaryHtml =
        '<div class="v023-file-summary v023-file-summary--compact">' +
            '<span class="v023-file-summary__icon">' + icon + '</span>' +
            '<div>' +
                '<div class="v023-file-summary__name">' + this.escapeHtml(name) + '</div>' +
                '<div class="v023-file-summary__meta">' + meta + '</div>' +
            '</div>' +
        '</div>';

    // Card picker mode (user clicked "Change")
    if (this._v026_showPicker) {
        var self = this;
        var cardsHtml = SHARE_MODES.map(function(mode) {
            var activeClass = mode.id === selectedMode ? ' v026-share-card--active' : '';
            return '<div class="v026-share-card' + activeClass + '" data-share-mode="' + mode.id + '">' +
                '<div class="v026-share-card__icon">' + mode.icon + '</div>' +
                '<div class="v026-share-card__body">' +
                    '<div class="v026-share-card__title">' + self.escapeHtml(mode.title) + '</div>' +
                    '<div class="v026-share-card__desc">' + self.escapeHtml(mode.desc) + '</div>' +
                    '<div class="v026-share-card__hint">' + self.escapeHtml(mode.hint) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        return successHtml + summaryHtml +
            '<h3 class="v023-step-title">How do you want to share it?</h3>' +
            '<div class="v026-share-cards">' + cardsHtml + '</div>' +
            '<div style="margin-top: var(--space-6, 1.5rem); text-align: center;">' +
                '<button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">' +
                    this.escapeHtml(this.t('upload.result.send_another')) +
                '</button>' +
            '</div>';
    }

    // Default: show the selected mode's sharing details directly
    var detailHtml = '';
    var modeConfig = SHARE_MODES.find(function(m) { return m.id === selectedMode; });

    if (selectedMode === 'combined') {
        detailHtml = this._v026_renderCombined(result);
    } else if (selectedMode === 'separate') {
        detailHtml = this._v026_renderSeparate(result);
    } else if (selectedMode === 'token') {
        detailHtml = this._v026_renderToken(result);
    }

    // Delivery mode reminder
    var deliveryLabel = '';
    if (result.delivery && result.delivery !== 'download') {
        var deliveryOpt = (this._v023_deliveryOptions || []).find(function(o) { return o.id === result.delivery; });
        if (deliveryOpt) {
            deliveryLabel =
                '<div class="v023-delivery-choice" style="margin-bottom: var(--space-3, 0.75rem);">' +
                    '<span class="v023-delivery-choice__label">Delivery:</span>' +
                    '<span class="v023-delivery-choice__value">' + deliveryOpt.icon + ' ' + this.escapeHtml(deliveryOpt.title) + '</span>' +
                '</div>';
        }
    }

    return successHtml + summaryHtml + deliveryLabel +
        '<div class="v026-mode-header">' +
            '<span class="v026-mode-header__icon">' + modeConfig.icon + '</span>' +
            '<span class="v026-mode-header__title">' + this.escapeHtml(modeConfig.title) + '</span>' +
            '<button class="v026-mode-change" id="v026-change-mode">Change</button>' +
        '</div>' +
        detailHtml +
        '<div class="v026-security-note">' +
            '<span>&#128274;</span> ' + this.escapeHtml(modeConfig.security) +
        '</div>' +
        this._renderTimings() +
        (result.transparency ? '<send-transparency id="transparency-panel"></send-transparency>' : '') +
        '<div style="margin-top: var(--space-6, 1.5rem); text-align: center;">' +
            '<button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">' +
                this.escapeHtml(this.t('upload.result.send_another')) +
            '</button>' +
        '</div>';
};

// ─── Combined link rendering ───────────────────────────────────────────────
SendUpload.prototype._v026_renderCombined = function(result) {
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">Share this link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="combined-link">' + this.escapeHtml(result.combinedUrl) + '</div>' +
            '<button class="btn btn-primary btn-sm" data-copy="combined-link">' + this.escapeHtml(this.t('upload.result.copy_link')) + '</button>' +
        '</div>' +
        '<a href="' + this.escapeHtml(result.combinedUrl) + '" target="_blank" rel="noopener" class="v026-open-link">Open in new tab &#8599;</a>' +
    '</div>';
};

// ─── Separate link + key rendering ──────────────────────────────────────────
SendUpload.prototype._v026_renderSeparate = function(result) {
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">1. Send this link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="link-only">' + this.escapeHtml(result.linkOnlyUrl) + '</div>' +
            '<button class="btn btn-sm" data-copy="link-only">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">2. Send this key separately</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--key" id="decryption-key">' + this.escapeHtml(result.keyString) + '</div>' +
            '<button class="btn btn-sm" data-copy="decryption-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Send through a different channel (e.g. link via email, key via chat)</div>' +
    '</div>';
};

// ─── Token + key rendering ──────────────────────────────────────────────────
SendUpload.prototype._v026_renderToken = function(result) {
    var transferId = result.transferId || '';
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">1. Share this token</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--token" id="transfer-token">' + this.escapeHtml(transferId) + '</div>' +
            '<button class="btn btn-sm" data-copy="transfer-token">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Recipient enters this at ' + this.escapeHtml(window.location.origin) + '</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">2. Share the decryption key</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--key" id="decryption-key">' + this.escapeHtml(result.keyString) + '</div>' +
            '<button class="btn btn-sm" data-copy="decryption-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
    '</div>';
};

// ─── Override: setupDynamicListeners — handle mode cards + copy ──────────────
SendUpload.prototype.setupDynamicListeners = function() {
    var self = this;

    // Copy buttons
    this.querySelectorAll('[data-copy]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            var targetId = e.target.getAttribute('data-copy');
            var el = self.querySelector('#' + targetId);
            if (el) self.copyToClipboard(el.textContent, e.target);
        });
    });

    // Share mode card selection (in picker view)
    this.querySelectorAll('[data-share-mode]').forEach(function(card) {
        card.addEventListener('click', function() {
            self._v026_shareMode = card.getAttribute('data-share-mode');
            self._v026_showPicker = false;
            self.render();
            self.setupDynamicListeners();
        });
    });

    // Change mode button — show the card picker
    var changeBtn = this.querySelector('#v026-change-mode');
    if (changeBtn) {
        changeBtn.addEventListener('click', function() {
            self._v026_showPicker = true;
            self.render();
            self.setupDynamicListeners();
        });
    }

    // Transparency panel
    var transparencyPanel = this.querySelector('#transparency-panel');
    if (transparencyPanel && self.result && self.result.transparency) {
        transparencyPanel.setData(self.result.transparency);
    }

    // Send another
    var sendAnotherBtn = this.querySelector('#send-another-btn');
    if (sendAnotherBtn) {
        sendAnotherBtn.addEventListener('click', function() { self.resetForNew(); });
    }
};

// ─── Override: resetForNew — clear share mode ───────────────────────────────
SendUpload.prototype.resetForNew = function() {
    this._v026_shareMode  = null;
    this._v026_showPicker = false;
    _v025_resetForNew.call(this);
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v026-styles')) return;
    var style = document.createElement('style');
    style.id = 'v026-styles';
    style.textContent = '\
        /* Success banner */\
        .v026-success-banner {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.08);\
            border: 1px solid rgba(78, 205, 196, 0.25);\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-4, 1rem);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-success, #4ECDC4);\
            font-weight: var(--weight-semibold, 600);\
        }\
        .v026-success-banner__icon {\
            font-size: 1.25rem;\
            flex-shrink: 0;\
        }\
        \
        /* Share mode cards */\
        .v026-share-cards {\
            display: flex;\
            flex-direction: column;\
            gap: var(--space-3, 0.75rem);\
            margin-top: var(--space-4, 1rem);\
        }\
        .v026-share-card {\
            display: flex;\
            align-items: flex-start;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
            background: var(--color-surface, #1E2A4A);\
            cursor: pointer;\
            transition: border-color 0.2s, background 0.2s, transform 0.15s;\
        }\
        .v026-share-card:hover {\
            border-color: var(--color-primary, #4ECDC4);\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));\
            transform: translateY(-1px);\
        }\
        .v026-share-card--active {\
            border-color: var(--color-primary, #4ECDC4);\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.08));\
        }\
        .v026-share-card__icon {\
            font-size: 1.5rem;\
            flex-shrink: 0;\
            margin-top: 2px;\
        }\
        .v026-share-card__body { flex: 1; min-width: 0; }\
        .v026-share-card__title {\
            font-size: var(--text-body, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v026-share-card__desc {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            line-height: 1.5;\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v026-share-card__hint {\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-primary, #4ECDC4);\
            opacity: 0.8;\
        }\
        \
        /* Mode header (after selection) */\
        .v026-mode-header {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-4, 1rem);\
        }\
        .v026-mode-header__icon { font-size: 1.25rem; }\
        .v026-mode-header__title {\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
            flex: 1;\
        }\
        .v026-mode-change {\
            background: none;\
            border: none;\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-small, 0.75rem);\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            border-radius: var(--radius-xs, 4px);\
        }\
        .v026-mode-change:hover {\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
        }\
        \
        /* Share value blocks */\
        .v026-share-value {\
            margin-top: var(--space-3, 0.75rem);\
        }\
        .v026-share-label {\
            display: block;\
            font-weight: var(--weight-semibold, 600);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v026-share-row {\
            display: flex;\
            gap: var(--space-2, 0.5rem);\
            align-items: center;\
        }\
        .v026-share-box {\
            flex: 1;\
            min-width: 0;\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-sm, 0.875rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            padding: 0.5rem 0.75rem;\
            white-space: nowrap;\
            overflow-x: auto;\
            color: var(--color-text, #E0E0E0);\
        }\
        .v026-share-box--token {\
            font-size: var(--text-lg, 1.25rem);\
            letter-spacing: 0.1em;\
            font-weight: var(--weight-semibold, 600);\
            text-align: center;\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v026-share-box--key {\
            font-size: var(--text-small, 0.75rem);\
            word-break: break-all;\
            white-space: normal;\
        }\
        .v026-share-guidance {\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-text-secondary, #8892A0);\
            opacity: 0.7;\
            margin-top: var(--space-1, 0.25rem);\
        }\
        .v026-open-link {\
            display: inline-block;\
            margin-top: var(--space-2, 0.5rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            text-decoration: none;\
        }\
        .v026-open-link:hover {\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Security note */\
        .v026-security-note {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            margin-top: var(--space-4, 1rem);\
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            background: rgba(78, 205, 196, 0.04);\
            border-radius: var(--radius-sm, 6px);\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v026-share-row { flex-direction: column; align-items: stretch; }\
            .v026-share-row .btn { width: 100%; }\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v026] Combined link default, skip file-ready for all files, Change button for other share modes');

})();
