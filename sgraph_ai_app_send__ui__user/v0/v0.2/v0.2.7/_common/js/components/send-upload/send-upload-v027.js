/* =============================================================================
   SGraph Send — Upload Component
   v0.2.7 — Surgical overlay on v0.2.6

   Changes:
     - Persistent "Next" button at top-right of wizard (steps 2-4)
       Always in the same position so repeat users can click through defaults
       without reading options each time.
     - Trust-building progress carousel during encrypt/upload
       Rotating messages about privacy, security, and zero-knowledge design
       shown alongside the progress bar.

   Loads AFTER v0.2.6 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard: v0.2.6 must be loaded ───────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v027] SendUpload not found — skipping v0.2.7 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
var _v026_render         = SendUpload.prototype.render;
var _v026_setupEvents    = SendUpload.prototype.setupEventListeners;
var _v026_renderProcess  = SendUpload.prototype._v023_renderProcessing;

// ─── Trust-building messages for the progress carousel ──────────────────────
var CAROUSEL_MESSAGES = [
    {
        icon: '\uD83D\uDD12',   // lock
        text: 'Your file is encrypted with AES-256-GCM. The key never leaves your device.'
    },
    {
        icon: '\uD83D\uDEE1\uFE0F', // shield
        text: 'Even we can\'t read what you\'re uploading. That\'s the point.'
    },
    {
        icon: '\uD83C\uDF6A',   // cookie
        text: 'Zero cookies. Zero tracking. Verify: open DevTools \u2192 Application \u2192 Cookies.'
    },
    {
        icon: '\uD83C\uDFD4\uFE0F', // mountain
        text: 'Tip: Share the code by voice, the link by text \u2014 different channels, maximum security.'
    },
    {
        icon: '\uD83D\uDCDC',   // scroll
        text: 'Our privacy policy is six sentences. No lawyers needed.'
    },
    {
        icon: '\uD83D\uDD11',   // key
        text: 'The decryption key is only in your browser. We never see it, store it, or transmit it.'
    },
    {
        icon: '\u2705',         // check
        text: 'No account required. No email collected. Just encrypted file sharing.'
    },
    {
        icon: '\uD83D\uDD2C',   // microscope
        text: 'Don\'t trust us \u2014 verify. Open the Network tab and inspect every request we make.'
    },
    {
        icon: '\uD83C\uDF0D',   // globe
        text: 'Available in 17 languages. Same zero-knowledge encryption everywhere.'
    },
    {
        icon: '\uD83D\uDCE6',   // package
        text: 'Files are split into encrypted chunks. Each chunk is meaningless without your key.'
    }
];

var CAROUSEL_INTERVAL_MS = 4000;

// Expose carousel messages for later overlays (v0.2.8+)
SendUpload.CAROUSEL_MESSAGES = CAROUSEL_MESSAGES;

// ─── Override: render — inject Next button bar after step indicator ──────────
SendUpload.prototype.render = function() {
    // Let v0.2.6 render normally first
    _v026_render.call(this);

    // Inject the Next button bar for steps 2-4 (choosing-delivery, choosing-share, confirming)
    var needsNext = (this.state === 'choosing-delivery' ||
                     this.state === 'choosing-share'    ||
                     this.state === 'confirming');

    if (needsNext) {
        var stepIndicator = this.querySelector('send-step-indicator');
        if (stepIndicator) {
            var nextBar = document.createElement('div');
            nextBar.className = 'v027-next-bar';

            var label = '';
            if (this.state === 'confirming') {
                label = 'Encrypt & Send \u2192';
                nextBar.innerHTML = '<button class="v027-next-btn v027-next-btn--send" id="v027-next-btn">' + label + '</button>';
            } else {
                label = 'Next \u2192';
                nextBar.innerHTML = '<button class="v027-next-btn" id="v027-next-btn">' + label + '</button>';
            }

            stepIndicator.insertAdjacentElement('afterend', nextBar);
        }
    }

    // Start carousel timer for processing states
    var isProcessing = (this.state === 'zipping'    || this.state === 'reading'    ||
                        this.state === 'encrypting' || this.state === 'creating'   ||
                        this.state === 'uploading'  || this.state === 'completing');

    if (isProcessing) {
        this._v027_startCarousel();
    } else {
        this._v027_stopCarousel();
    }
};

// ─── Override: setupEventListeners — wire the Next button ───────────────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;
    _v026_setupEvents.call(this);

    var nextBtn = this.querySelector('#v027-next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            self._v027_handleNext();
        });
    }
};

// ─── Next button logic — advance with current default ───────────────────────
SendUpload.prototype._v027_handleNext = function() {
    if (this.state === 'choosing-delivery') {
        // Use recommended delivery or first option as default
        var selected = this._v023_selectedDelivery
                    || this._v023_recommendedDelivery
                    || (this._v023_deliveryOptions && this._v023_deliveryOptions.length > 0
                        ? this._v023_deliveryOptions[0].id
                        : 'download');
        this._v023_selectedDelivery = selected;
        this._v026_shareMode = this._v026_shareMode || 'token';
        this.state = 'choosing-share';
        this.render();
        this.setupEventListeners();

    } else if (this.state === 'choosing-share') {
        // Default to token (already pre-selected)
        this._v026_shareMode = this._v026_shareMode || 'token';
        this.state = 'confirming';
        this.render();
        this.setupEventListeners();

    } else if (this.state === 'confirming') {
        // Trigger Encrypt & Send
        this._v023_startProcessing();
    }
};

// ─── Override: renderProcessing — add carousel ──────────────────────────────
SendUpload.prototype._v023_renderProcessing = function() {
    var stage = SendUpload.PROGRESS_STAGES[this.state];
    var pct   = stage ? stage.pct : 5;
    var label = stage ? this.t(stage.label) : 'Processing...';

    // Pick initial message
    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }
    var msg = CAROUSEL_MESSAGES[this._v027_carouselIndex % CAROUSEL_MESSAGES.length];

    return '<div class="v023-processing">' +
        '<div class="v023-processing__label">' + this.escapeHtml(label) + '</div>' +
        '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" style="width: ' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v027-carousel" id="v027-carousel">' +
            '<div class="v027-carousel__message v027-carousel__message--visible">' +
                '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                '<span class="v027-carousel__text">' + this.escapeHtml(msg.text) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="v023-processing__hint" style="margin-top: var(--space-3, 0.75rem); opacity: 0.5; font-size: var(--text-micro, 0.625rem);">' +
            'Keep this tab open while your file uploads.' +
        '</div>' +
    '</div>';
};

// ─── Carousel timer management ──────────────────────────────────────────────
SendUpload.prototype._v027_startCarousel = function() {
    var self = this;
    if (this._v027_carouselTimer) return; // already running

    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }

    this._v027_carouselTimer = setInterval(function() {
        self._v027_carouselIndex = (self._v027_carouselIndex + 1) % CAROUSEL_MESSAGES.length;
        var carousel = self.querySelector('#v027-carousel');
        if (!carousel) return;

        var msg = CAROUSEL_MESSAGES[self._v027_carouselIndex];
        var existing = carousel.querySelector('.v027-carousel__message');

        // Fade out current
        if (existing) {
            existing.classList.remove('v027-carousel__message--visible');
            existing.classList.add('v027-carousel__message--fading');
        }

        // After fade out, swap content and fade in
        setTimeout(function() {
            carousel.innerHTML =
                '<div class="v027-carousel__message">' +
                    '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                    '<span class="v027-carousel__text">' + self.escapeHtml(msg.text) + '</span>' +
                '</div>';
            // Trigger reflow then add visible class for fade-in
            var newMsg = carousel.querySelector('.v027-carousel__message');
            if (newMsg) {
                newMsg.offsetHeight; // force reflow
                newMsg.classList.add('v027-carousel__message--visible');
            }
        }, 400);
    }, CAROUSEL_INTERVAL_MS);
};

SendUpload.prototype._v027_stopCarousel = function() {
    if (this._v027_carouselTimer) {
        clearInterval(this._v027_carouselTimer);
        this._v027_carouselTimer = null;
    }
    this._v027_carouselIndex = 0;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v027-styles')) return;
    var style = document.createElement('style');
    style.id = 'v027-styles';
    style.textContent = '\
        /* Next button bar — fixed position after step indicator */\
        .v027-next-bar {\
            display: flex;\
            justify-content: flex-end;\
            margin-bottom: var(--space-4, 1rem);\
            padding-bottom: var(--space-3, 0.75rem);\
            border-bottom: 1px solid var(--color-border, rgba(78, 205, 196, 0.1));\
        }\
        .v027-next-btn {\
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
        .v027-next-btn:hover {\
            transform: translateY(-1px);\
            box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);\
            background: #5DE0D6;\
        }\
        .v027-next-btn:active {\
            transform: translateY(0);\
        }\
        .v027-next-btn--send {\
            padding: var(--space-2, 0.5rem) var(--space-6, 1.5rem);\
            box-shadow: 0 2px 8px rgba(78, 205, 196, 0.25);\
        }\
        \
        /* Progress carousel */\
        .v027-carousel {\
            margin-top: var(--space-4, 1rem);\
            min-height: 3rem;\
            display: flex;\
            align-items: center;\
            justify-content: center;\
        }\
        .v027-carousel__message {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid rgba(78, 205, 196, 0.1);\
            border-radius: var(--radius-sm, 6px);\
            opacity: 0;\
            transform: translateY(4px);\
            transition: opacity 0.4s ease, transform 0.4s ease;\
            width: 100%;\
            box-sizing: border-box;\
        }\
        .v027-carousel__message--visible {\
            opacity: 1;\
            transform: translateY(0);\
        }\
        .v027-carousel__message--fading {\
            opacity: 0;\
            transform: translateY(-4px);\
        }\
        .v027-carousel__icon {\
            font-size: 1.25rem;\
            flex-shrink: 0;\
        }\
        .v027-carousel__text {\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
            line-height: 1.5;\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v027-next-btn {\
                padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
                font-size: var(--text-small, 0.75rem);\
            }\
            .v027-carousel__message {\
                flex-direction: column;\
                text-align: center;\
                gap: var(--space-2, 0.5rem);\
            }\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v027] Next button + trust-building progress carousel');

})();
