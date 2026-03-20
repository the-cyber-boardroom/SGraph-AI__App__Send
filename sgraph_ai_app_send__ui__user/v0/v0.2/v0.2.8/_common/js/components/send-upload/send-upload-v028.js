/* =============================================================================
   SGraph Send — Upload Component
   v0.2.8 — Surgical overlay on v0.2.7

   Changes:
     - Six-step wizard (was five):
       1. Upload — drop/browse file
       2. Delivery — download/view/browse
       3. Share mode — token/combined/separate
       4. Confirm — review choices
       5. Encrypt & Upload — processing (encrypt + upload)
       6. Done — result in chosen mode
     - Next button moved INLINE with step indicator (same row, vertically centred)
       Eliminates the empty space below the step bar.
       Fixed width so the step indicator doesn't shift between states.
     - Next button visible but DISABLED during step 5 (processing)
     - Step 2: Default delivery pre-selected; deselects on hover, reselects
       on mouseout if nothing clicked. Badge: "RECOMMENDED" → "DEFAULT".
     - Step 4: Remove duplicate bottom Encrypt & Send button
     - Step 6: "Email Link" button. In simple token mode, show simple token
       prominently + full link below (no transfer ID, no success banner, etc.)

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
var _v026_renderToken     = SendUpload.prototype._v026_renderToken;

// ─── Update step indicator to 6 steps ───────────────────────────────────────
if (typeof SendStepIndicator !== 'undefined') {
    SendStepIndicator.STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];
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
        nextBtnHtml = '<button class="v028-inline-next v028-inline-next--send" id="v028-next-btn">Encrypt &amp; Upload \u2192</button>';
    } else if (isProcessing) {
        nextBtnHtml = '<button class="v028-inline-next v028-inline-next--disabled" disabled>Encrypting\u2026</button>';
    } else if (this.state === 'complete') {
        nextBtnHtml = '<button class="v028-inline-next" id="v028-email-link-btn">Email Link</button>';
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

    // ── Step 6: In simple token mode, strip everything except token + key ──
    if (this.state === 'complete' && this._v026_shareMode === 'token' && !this._v026_showPicker) {
        // Remove success banner, file summary, delivery label, mode header,
        // security note, timings, transparency — keep only the share values + send another
        var toRemove = [
            '.v026-success-banner',
            '.v023-file-summary',
            '.v023-delivery-choice',
            '.v026-mode-header',
            '.v026-security-note',
            '.v023-timings',
            '#transparency-panel'
        ];
        var self = this;
        toRemove.forEach(function(sel) {
            var el = self.querySelector(sel);
            if (el) el.remove();
        });
    }

    // ── Step 6: Email Link button handler (must be in render, not setupEventListeners,
    //    because complete state calls setupDynamicListeners not setupEventListeners) ──
    if (this.state === 'complete') {
        var self = this;
        var emailBtn = this.querySelector('#v028-email-link-btn');
        if (emailBtn && this.result) {
            emailBtn.addEventListener('click', function() {
                var friendlyKey = self.result.friendlyKey || '';
                var tokenLink = self._v028_buildTokenLink(friendlyKey);
                var subject = 'Secure file shared via SGraph Send';
                var body = '';
                if (self._v026_shareMode === 'token' && friendlyKey) {
                    body = 'I\'ve shared a file with you via SGraph Send.\n\n' +
                           'Simple token: ' + friendlyKey + '\n\n' +
                           'Or use this direct link:\n' + tokenLink;
                } else {
                    var link = self.result.combinedUrl || self.result.linkOnlyUrl || '';
                    body = 'I\'ve shared a file with you via SGraph Send.\n\n' +
                           'Link: ' + link;
                }
                window.open('mailto:?subject=' + encodeURIComponent(subject) +
                            '&body=' + encodeURIComponent(body), '_blank');
            });
        }
    }

    // Start/stop carousel for processing states
    if (isProcessing) {
        this._v027_startCarousel();
    } else {
        this._v027_stopCarousel();
    }
};

// ─── Override: setupEventListeners — inline Next + hover + Copy Link ────────
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

    // Note: Email Link button handler is in render() because complete state
    // calls setupDynamicListeners, not setupEventListeners
};

// ─── Helper: build token-based link (origin/locale/route/#friendlyKey) ───────
SendUpload.prototype._v028_buildTokenLink = function(friendlyKey) {
    var locale   = this._detectLocalePrefix();
    var delivery = this.result && this.result.delivery || 'download';
    var route    = delivery === 'download' ? 'download' : delivery;
    return window.location.origin + '/' + locale + '/' + route + '/#' + friendlyKey;
};

// ─── Override: _v026_renderToken — file info + simple token + full link + QR ──
SendUpload.prototype._v026_renderToken = function(result) {
    var friendlyKey = result.friendlyKey || '';
    var tokenLink   = this._v028_buildTokenLink(friendlyKey);

    // File info
    var fileInfoHtml = '';
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    if (file || isFolder) {
        var icon = isFolder ? '&#128193;' : '&#128196;';
        var name = isFolder ? (this._folderName || 'folder') + '/' : file.name;
        var size = isFolder ? this.formatBytes(this._folderScan.totalSize) : this.formatBytes(file.size);
        fileInfoHtml = '<div class="v028-file-info">' +
            '<span class="v028-file-info__icon">' + icon + '</span>' +
            '<span class="v028-file-info__name">' + this.escapeHtml(name) + '</span>' +
            '<span class="v028-file-info__size">' + size + '</span>' +
        '</div>';
    }

    // QR code + Open in new tab — side by side
    var qrHtml = '';
    var qrSvg = (window.sgraphSend && window.sgraphSend.qr && tokenLink)
              ? window.sgraphSend.qr.toSvg(tokenLink, { ecl: 'medium', border: 2, lightColor: '#ffffff', darkColor: '#1A1A2E' })
              : '';
    var openLinkHtml = tokenLink
        ? '<a class="v028-open-link" href="' + this.escapeHtml(tokenLink) + '" target="_blank" rel="noopener">' +
              '<span class="v028-open-link__icon">&#8599;</span>' +
              '<span class="v028-open-link__text">Open in new tab</span>' +
              '<span class="v028-open-link__hint">Test the recipient experience</span>' +
          '</a>'
        : '';
    if (qrSvg || openLinkHtml) {
        qrHtml = '<div class="v028-qr-open-row">' +
            (qrSvg ? '<div class="v028-qr-section">' +
                '<div class="v028-qr-code">' + qrSvg + '</div>' +
                '<div class="v028-qr-label">Scan to open link</div>' +
            '</div>' : '') +
            (openLinkHtml ? openLinkHtml : '') +
        '</div>';
    }

    return fileInfoHtml +
    '<div class="v026-share-value">' +
        '<label class="v026-share-label">Simple token</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--friendly" id="simple-token">' + this.escapeHtml(friendlyKey) + '</div>' +
            '<button class="btn btn-sm v028-copy-btn" data-copy="simple-token">Copy</button>' +
        '</div>' +
        '<div class="v026-share-guidance">This token derives both the transfer ID and decryption key</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">Full link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="full-link">' + this.escapeHtml(tokenLink) + '</div>' +
            '<button class="btn btn-sm v028-copy-btn" data-copy="full-link">Copy</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Direct link &mdash; anyone with this can decrypt the file</div>' +
    '</div>' +
    qrHtml;
};

// ─── Override: _v023_renderProcessing — trust messages + stats side by side ──
SendUpload.prototype._v023_renderProcessing = function() {
    var stage = SendUpload.PROGRESS_STAGES[this.state];
    var pct   = stage ? stage.pct : 5;
    var label = stage ? this.t(stage.label) : 'Processing...';

    // Build completed stage rows from timestamps
    var allStages = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing'];
    var ts = this._stageTimestamps || {};
    var completedRows = '';
    var currentIndex = allStages.indexOf(this.state);

    for (var i = 0; i < allStages.length; i++) {
        var s = allStages[i];
        var next = allStages[i + 1] || this.state;
        if (ts[s] && ts[next] && i < currentIndex) {
            var ms = ts[next] - ts[s];
            var stageLabel = this.t(SendUpload.PROGRESS_STAGES[s]?.label || s).replace('...', '');
            completedRows +=
                '<div class="v028-live-timing__row">' +
                    '<span class="v028-live-timing__label">' + this.escapeHtml(stageLabel) + '</span>' +
                    '<span class="v028-live-timing__check">&#10003;</span>' +
                    '<span class="v028-live-timing__ms">' + ms + 'ms</span>' +
                '</div>';
        }
    }

    // Carousel message (left column)
    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }
    var CAROUSEL = SendUpload.CAROUSEL_MESSAGES || [];
    var msg = CAROUSEL.length > 0 ? CAROUSEL[this._v027_carouselIndex % CAROUSEL.length] : null;
    var carouselHtml = msg
        ? '<div class="v028-process-col v028-process-col--messages">' +
              '<div class="v027-carousel" id="v027-carousel">' +
                  '<div class="v027-carousel__message v027-carousel__message--visible">' +
                      '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                      '<span class="v027-carousel__text">' + this.escapeHtml(msg.text) + '</span>' +
                  '</div>' +
              '</div>' +
          '</div>'
        : '<div class="v028-process-col v028-process-col--messages">' +
              '<div class="v023-processing__hint">Your file is being encrypted in your browser. Keep this tab open.</div>' +
          '</div>';

    // Stats column (right column)
    var statsHtml = completedRows
        ? '<div class="v028-process-col v028-process-col--stats">' +
              '<div class="v028-live-timing">' + completedRows + '</div>' +
          '</div>'
        : '';

    return '<div class="v023-processing">' +
        '<div class="v023-processing__label">' + this.escapeHtml(label) + '</div>' +
        '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" style="width: ' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v028-process-columns">' +
            carouselHtml +
            statsHtml +
        '</div>' +
    '</div>';
};

// ─── Override: _v026_renderConfirm — update hint text ───────────────────────
SendUpload.prototype._v026_renderConfirm = function() {
    var html = _v026_renderConfirm.call(this);
    html = html.replace(
        'Review your choices, then hit the button below.',
        'Review your choices, then hit Encrypt &amp; Upload.'
    );
    return html;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v028-styles')) return;
    var style = document.createElement('style');
    style.id = 'v028-styles';
    style.textContent = '\
        /* Widen the main content area to match header width */\
        main {\
            max-width: 1100px !important;\
        }\
        \
        /* Kill the step-content fade animation — causes flicker on re-renders */\
        .step-content,\
        .step-content--reverse {\
            animation: none !important;\
        }\
        \
        /* Header row: step indicator + Next button inline, aligned to top */\
        .v028-header-row {\
            display: flex;\
            align-items: flex-start;\
            gap: var(--space-5, 1.25rem);\
            margin-bottom: var(--space-5, 1.25rem);\
        }\
        .v028-header-row__steps {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-header-row__action {\
            flex-shrink: 0;\
        }\
        \
        /* Inline Next button — fixed size so step indicator does not shift */\
        .v028-inline-next {\
            display: inline-flex;\
            align-items: center;\
            justify-content: center;\
            min-width: 180px;\
            height: 54px;\
            padding: 0 var(--space-6, 1.5rem);\
            background: var(--color-primary, #4ECDC4);\
            color: var(--color-bg, #1A1A2E);\
            border: none;\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-base, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            cursor: pointer;\
            transition: transform 0.15s, box-shadow 0.2s, background 0.2s;\
            white-space: nowrap;\
            box-sizing: border-box;\
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
        /* File info bar on Done screen */\
        .v028-file-info {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: 0.5rem 0.75rem;\
            margin-bottom: var(--space-4, 1rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-sm, 0.875rem);\
        }\
        .v028-file-info__icon {\
            font-size: 1.1rem;\
        }\
        .v028-file-info__name {\
            color: var(--color-text, #E0E0E0);\
            font-weight: var(--weight-medium, 500);\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-file-info__size {\
            color: var(--color-text-secondary, #8892A0);\
            white-space: nowrap;\
        }\
        \
        /* QR + Open link row — side by side, equal height */\
        .v028-qr-open-row {\
            display: flex;\
            align-items: stretch;\
            justify-content: center;\
            gap: var(--space-5, 1.25rem);\
            margin-top: var(--space-5, 1.25rem);\
            padding: var(--space-5, 1.25rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
        }\
        .v028-qr-section {\
            display: flex;\
            flex-direction: column;\
            align-items: center;\
            justify-content: center;\
            flex: 1;\
        }\
        .v028-qr-code {\
            width: 120px;\
            height: 120px;\
            padding: 6px;\
            background: #ffffff;\
            border-radius: var(--radius-sm, 6px);\
        }\
        .v028-qr-code svg {\
            width: 100%;\
            height: 100%;\
        }\
        .v028-qr-label {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-top: var(--space-2, 0.5rem);\
            opacity: 0.7;\
        }\
        .v028-open-link {\
            display: flex;\
            flex-direction: column;\
            align-items: center;\
            justify-content: center;\
            text-decoration: none;\
            flex: 1;\
            padding: var(--space-4, 1rem) var(--space-5, 1.25rem);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.2));\
            border-radius: var(--radius-sm, 6px);\
            background: rgba(78, 205, 196, 0.04);\
            transition: border-color 0.2s, background 0.2s, transform 0.15s;\
            cursor: pointer;\
        }\
        .v028-open-link:hover {\
            border-color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.1);\
            transform: translateY(-1px);\
        }\
        .v028-open-link__icon {\
            font-size: 2rem;\
            color: var(--color-primary, #4ECDC4);\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v028-open-link__text {\
            font-size: var(--text-base, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v028-open-link__hint {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-top: var(--space-2, 0.5rem);\
            opacity: 0.7;\
        }\
        \
        /* Two-column processing layout: messages left, stats right */\
        .v028-process-columns {\
            display: flex;\
            gap: var(--space-5, 1.25rem);\
            margin-top: var(--space-4, 1rem);\
            min-height: 120px;\
            align-items: stretch;\
        }\
        .v028-process-col {\
            flex: 1;\
            min-width: 0;\
            display: flex;\
            align-self: stretch;\
        }\
        .v028-process-col--messages {\
            align-items: stretch;\
            justify-content: center;\
            padding: 0;\
            background: none;\
            border: none;\
            border-radius: 0;\
        }\
        .v028-process-col--messages .v027-carousel {\
            width: 100%;\
            height: 100%;\
            margin-top: 0;\
            min-height: auto;\
            display: flex;\
            align-items: stretch;\
        }\
        .v028-process-col--messages .v027-carousel__message {\
            flex: 1;\
            display: flex;\
            align-items: center;\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.1));\
            border-radius: var(--radius-sm, 6px);\
        }\
        .v028-process-col--stats {\
            align-items: center;\
            justify-content: flex-end;\
            padding: var(--space-3, 0.75rem);\
        }\
        \
        /* Live timing rows during processing */\
        .v028-live-timing {\
            display: flex;\
            flex-direction: column;\
            gap: var(--space-1, 0.25rem);\
            width: 100%;\
        }\
        .v028-live-timing__row {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
        }\
        .v028-live-timing__label {\
            min-width: 110px;\
        }\
        .v028-live-timing__check {\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v028-live-timing__ms {\
            margin-left: auto;\
            font-family: var(--font-mono, monospace);\
        }\
        \
        /* Copy buttons — outlined, compact */\
        .v028-copy-btn {\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.3)) !important;\
            background: transparent !important;\
            color: var(--color-text, #E0E0E0) !important;\
            padding: 0.4rem 1rem !important;\
            font-size: var(--text-sm, 0.875rem) !important;\
            font-weight: var(--weight-medium, 500) !important;\
            border-radius: var(--radius-sm, 6px) !important;\
            cursor: pointer;\
            transition: border-color 0.2s, background 0.2s, color 0.2s;\
            white-space: nowrap;\
            min-width: 60px;\
        }\
        .v028-copy-btn:hover {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            color: var(--color-primary, #4ECDC4) !important;\
            background: rgba(78, 205, 196, 0.08) !important;\
        }\
        \
        /* Send another — larger ghost button, not primary color */\
        #send-another-btn {\
            font-size: var(--text-base, 1rem) !important;\
            padding: 0.625rem 2rem !important;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.25)) !important;\
            border-radius: var(--radius-sm, 6px) !important;\
            background: transparent !important;\
            color: var(--color-text-secondary, #8892A0) !important;\
            cursor: pointer;\
            transition: border-color 0.2s, color 0.2s, background 0.2s;\
            margin-top: var(--space-6, 1.5rem);\
        }\
        #send-another-btn:hover {\
            border-color: var(--color-text-secondary, #8892A0) !important;\
            color: var(--color-text, #E0E0E0) !important;\
            background: rgba(136, 146, 160, 0.08) !important;\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v028-header-row {\
                flex-direction: column;\
            }\
            .v028-header-row__action {\
                align-self: flex-end;\
            }\
            .v028-inline-next {\
                min-width: 120px;\
                padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
                font-size: var(--text-small, 0.75rem);\
            }\
            .v028-process-columns {\
                flex-direction: column;\
            }\
            .v028-qr-open-row {\
                flex-direction: column;\
                gap: var(--space-3, 0.75rem);\
            }\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v028] 6-step wizard, inline Next button, default selection, Copy Link');

})();
