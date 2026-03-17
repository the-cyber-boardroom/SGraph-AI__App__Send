/* =============================================================================
   SGraph Send — Upload Component
   v0.2.8 — Surgical overlay on v0.2.7

   Changes:
     - Six-step wizard (was five):
       1. Upload — drop/browse file
       2. Delivery — download/view/browse
       3. Share mode — token/combined/separate
       4. Confirm — review choices
       5. Encrypt & Send — processing (encrypt + upload)
       6. Done — result in chosen mode
     - Next button moved INLINE with step indicator (same row, right side)
       Eliminates the empty space below the step bar.
     - Next button visible but DISABLED during step 5 (processing)
     - Step 2: Default delivery pre-selected; deselects on hover, reselects
       on mouseout if nothing clicked. Badge: "RECOMMENDED" → "DEFAULT".
     - Step 4: Remove duplicate bottom Encrypt & Send button
     - Step 6: In simple token mode, hide share mode header + add Copy All

   Loads AFTER v0.2.7 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v028] SendUpload not found — skipping v0.2.8 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
var _v027_render          = SendUpload.prototype.render;
var _v027_setupEvents     = SendUpload.prototype.setupEventListeners;
var _v027_handleNext      = SendUpload.prototype._v027_handleNext;
var _v026_renderConfirm   = SendUpload.prototype._v026_renderConfirm;

// ─── Update step indicator to 6 steps ───────────────────────────────────────
if (typeof SendStepIndicator !== 'undefined') {
    SendStepIndicator.STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Send', 'Done'];
}

// ─── New state-to-step mapping (6 steps) ────────────────────────────────────
var V028_TOTAL_STEPS = 6;
var V028_STATE_TO_STEP = {
    'idle':              1,
    'folder-options':    1,
    'file-ready':        1,
    'choosing-delivery': 2,
    'choosing-share':    3,
    'confirming':        4,
    'zipping':           5,
    'reading':           5,
    'encrypting':        5,
    'creating':          5,
    'uploading':         5,
    'completing':        5,
    'complete':          6,
    'error':             1
};

// ─── Override: render — 6-step mapping + inline Next button ─────────────────
SendUpload.prototype.render = function() {
    this._stageTimestamps = this._stageTimestamps || {};
    this._stageTimestamps[this.state] = Date.now();

    var step = V028_STATE_TO_STEP[this.state] || 1;
    var stepIndicator = '<send-step-indicator step="' + step + '" total="' + V028_TOTAL_STEPS + '"></send-step-indicator>';

    // Build content via existing renderers
    var content = '';
    switch (this.state) {
        case 'idle':              content = this._v023_renderStep1Idle(); break;
        case 'folder-options':    content = this.renderFolderOptions(); break;
        case 'file-ready':        content = this._v023_renderFileReady(); break;
        case 'choosing-delivery': content = this._v023_renderStep2(); break;
        case 'choosing-share':    content = this._v026_renderShareChoice(); break;
        case 'confirming':        content = this._v026_renderConfirm(); break;
        case 'zipping':
        case 'reading':
        case 'encrypting':
        case 'creating':
        case 'uploading':
        case 'completing':        content = this._v023_renderProcessing(); break;
        case 'complete':          content = this.renderResult(); break;
        case 'error':             content = this.renderError(); break;
        default:                  _v027_render.call(this); return;
    }

    // ── Build Next button (inline with step indicator) ──
    var nextBtnHtml = '';
    var isProcessing = (this.state === 'zipping'    || this.state === 'reading'    ||
                        this.state === 'encrypting' || this.state === 'creating'   ||
                        this.state === 'uploading'  || this.state === 'completing');

    if (this.state === 'choosing-delivery' || this.state === 'choosing-share') {
        nextBtnHtml = '<button class="v028-inline-next" id="v028-next-btn">Next \u2192</button>';
    } else if (this.state === 'confirming') {
        nextBtnHtml = '<button class="v028-inline-next v028-inline-next--send" id="v028-next-btn">Encrypt &amp; Send \u2192</button>';
    } else if (isProcessing) {
        nextBtnHtml = '<button class="v028-inline-next v028-inline-next--disabled" disabled>Encrypting\u2026</button>';
    } else if (this.state === 'complete' && this._v026_shareMode === 'token') {
        nextBtnHtml = '<button class="v028-inline-next" id="v028-copy-all-btn">Copy All</button>';
    }

    // Wrap step indicator + button in a flex row
    var headerRow = '<div class="v028-header-row">' +
        '<div class="v028-header-row__steps">' + stepIndicator + '</div>' +
        (nextBtnHtml ? '<div class="v028-header-row__action">' + nextBtnHtml + '</div>' : '') +
    '</div>';

    this.innerHTML =
        '<div class="card">' +
            headerRow +
            '<div class="step-content' + (this._v023_goingBack ? ' step-content--reverse' : '') + '">' +
                content +
            '</div>' +
        '</div>';
    this._v023_goingBack = false;

    // ── Step 2: Pre-select the recommended delivery option ──
    if (this.state === 'choosing-delivery') {
        var recommended = this._v023_recommendedDelivery || 'download';
        var cards = this.querySelectorAll('.v023-delivery-card');
        cards.forEach(function(card) {
            if (card.getAttribute('data-delivery') === recommended) {
                card.classList.add('v028-default-selected');
            }
        });
    }

    // ── Step 4: Remove the bottom Encrypt & Send button (inline button has it) ──
    if (this.state === 'confirming') {
        var sendAction = this.querySelector('.v026-send-action');
        if (sendAction) sendAction.remove();
    }

    // ── Step 6: In simple token mode, simplify the display ──
    if (this.state === 'complete' && this._v026_shareMode === 'token' && !this._v026_showPicker) {
        var modeHeader = this.querySelector('.v026-mode-header');
        if (modeHeader) modeHeader.remove();
    }

    // Start/stop carousel for processing states
    if (isProcessing) {
        this._v027_startCarousel();
    } else {
        this._v027_stopCarousel();
    }
};

// ─── Override: setupEventListeners — inline Next + hover + Copy All ─────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;

    // Call v0.2.7's setup (which calls v0.2.6's setup)
    _v027_setupEvents.call(this);

    // ── Inline Next button ──
    var nextBtn = this.querySelector('#v028-next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            self._v027_handleNext();
        });
    }

    // ── Step 2: Hover deselects default, mouseout reselects ──
    if (this.state === 'choosing-delivery') {
        var recommended = this._v023_recommendedDelivery || 'download';
        var cards = this.querySelectorAll('.v023-delivery-card');
        var defaultCard = this.querySelector('.v023-delivery-card[data-delivery="' + recommended + '"]');

        cards.forEach(function(card) {
            var isDefault = card.getAttribute('data-delivery') === recommended;

            card.addEventListener('mouseenter', function() {
                if (!isDefault && defaultCard) {
                    defaultCard.classList.remove('v028-default-selected');
                    card.classList.add('v028-hover-highlight');
                }
            });

            card.addEventListener('mouseleave', function() {
                card.classList.remove('v028-hover-highlight');
                if (!self._v023_selectedDelivery && defaultCard) {
                    defaultCard.classList.add('v028-default-selected');
                }
            });
        });
    }

    // ── Step 6: Copy All button ──
    var copyAllBtn = this.querySelector('#v028-copy-all-btn');
    if (copyAllBtn && this.result) {
        copyAllBtn.addEventListener('click', function() {
            var transferId  = self.result.transferId  || '';
            var friendlyKey = self.result.friendlyKey || '';
            var text = 'Token: ' + transferId + '\nKey: ' + friendlyKey;
            navigator.clipboard.writeText(text).then(function() {
                copyAllBtn.textContent = 'Copied!';
                setTimeout(function() { copyAllBtn.textContent = 'Copy All'; }, 2000);
            });
        });
    }
};

// ─── Override: _v026_renderConfirm — update hint text ───────────────────────
SendUpload.prototype._v026_renderConfirm = function() {
    var html = _v026_renderConfirm.call(this);
    html = html.replace(
        'Review your choices, then hit the button below.',
        'Review your choices, then hit Encrypt &amp; Send.'
    );
    return html;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v028-styles')) return;
    var style = document.createElement('style');
    style.id = 'v028-styles';
    style.textContent = '\
        /* Header row: step indicator + Next button inline */\
        .v028-header-row {\
            display: flex;\
            align-items: flex-start;\
            gap: var(--space-4, 1rem);\
        }\
        .v028-header-row__steps {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-header-row__action {\
            flex-shrink: 0;\
            padding-top: var(--space-1, 0.25rem);\
        }\
        \
        /* Inline Next button */\
        .v028-inline-next {\
            display: inline-flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-2, 0.5rem) var(--space-5, 1.25rem);\
            background: var(--color-primary, #4ECDC4);\
            color: var(--color-bg, #1A1A2E);\
            border: none;\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-sm, 0.875rem);\
            font-weight: var(--weight-semibold, 600);\
            cursor: pointer;\
            transition: transform 0.15s, box-shadow 0.2s, background 0.2s;\
            white-space: nowrap;\
        }\
        .v028-inline-next:hover:not(:disabled) {\
            transform: translateY(-1px);\
            box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);\
            background: #5DE0D6;\
        }\
        .v028-inline-next:active:not(:disabled) {\
            transform: translateY(0);\
        }\
        .v028-inline-next--send {\
            padding: var(--space-2, 0.5rem) var(--space-6, 1.5rem);\
            box-shadow: 0 2px 8px rgba(78, 205, 196, 0.25);\
        }\
        .v028-inline-next--disabled {\
            opacity: 0.5;\
            cursor: not-allowed;\
        }\
        \
        /* Hide v0.2.7 separate next-bar (we inline it now) */\
        .v027-next-bar {\
            display: none !important;\
        }\
        \
        /* Override RECOMMENDED → DEFAULT badge */\
        .v023-delivery-card--recommended::after {\
            content: "\\2605 DEFAULT" !important;\
        }\
        \
        /* Default-selected delivery card (pre-selected state) */\
        .v028-default-selected {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.08)) !important;\
        }\
        \
        /* Hover highlight for non-default cards */\
        .v028-hover-highlight {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12)) !important;\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v028-header-row {\
                flex-direction: column;\
            }\
            .v028-header-row__action {\
                align-self: flex-end;\
                padding-top: 0;\
            }\
            .v028-inline-next {\
                padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
                font-size: var(--text-small, 0.75rem);\
            }\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v028] 6-step wizard, inline Next button, default selection, Copy All');

})();
