/* =============================================================================
   SGraph Send — upload-step-confirm
   Step 4: Confirmation — review summary, word picker, encrypt & send

   Shadow DOM Web Component extracted from v0.2.6 / v0.2.8 / v0.2.14 monolith.

   Properties (set by orchestrator):
     fileSummary      — { icon, name, meta, isFolder }
     deliveryOption   — { icon, title } or null
     shareModeConfig  — { icon, title } or null
     shareMode        — 'token' | 'combined' | 'separate'
     friendlyParts    — { words: [string, string], suffix: string } or null
     friendlyKey      — string or null
     fileSize         — number
     showThumbnailNote — boolean

   Events emitted:
     step-confirmed       — user clicks Encrypt & Send
     step-change-delivery — user clicks "change" on delivery row
     step-change-share    — user clicks "change" on share mode row
     step-shuffle-word    — detail: { index: 0|1 }
     step-shuffle-all     — shuffle all words
     step-back            — user clicks back
   ============================================================================= */

class UploadStepConfirm extends HTMLElement {

    /* ── lifecycle ── */

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this._fileSummary       = null;
        this._deliveryOption    = null;
        this._shareModeConfig   = null;
        this._shareMode         = 'token';
        this._friendlyParts     = null;
        this._friendlyKey       = null;
        this._fileSize          = 0;
        this._showThumbnailNote = false;
    }

    connectedCallback() {
        this._render();
        this._bindEvents();
    }

    /* ── public properties ── */

    get fileSummary()           { return this._fileSummary; }
    set fileSummary(v)          { this._fileSummary = v; this._refresh(); }

    get deliveryOption()        { return this._deliveryOption; }
    set deliveryOption(v)       { this._deliveryOption = v; this._refresh(); }

    get shareModeConfig()       { return this._shareModeConfig; }
    set shareModeConfig(v)      { this._shareModeConfig = v; this._refresh(); }

    get shareMode()             { return this._shareMode; }
    set shareMode(v)            { this._shareMode = v; this._refresh(); }

    get friendlyParts()         { return this._friendlyParts; }
    set friendlyParts(v)        { this._friendlyParts = v; this._refresh(); }

    get friendlyKey()           { return this._friendlyKey; }
    set friendlyKey(v)          { this._friendlyKey = v; this._refresh(); }

    get fileSize()              { return this._fileSize; }
    set fileSize(v)             { this._fileSize = v; this._refresh(); }

    get showThumbnailNote()     { return this._showThumbnailNote; }
    set showThumbnailNote(v)    { this._showThumbnailNote = v; this._refresh(); }

    /* ── internal ── */

    _esc(s) {
        return typeof SendHelpers !== 'undefined' ? SendHelpers.escapeHtml(s) : String(s);
    }

    _refresh() {
        if (!this.isConnected) return;
        var content = this.shadowRoot.querySelector('.step-confirm__content');
        if (content) {
            content.innerHTML = this._buildContent();
            this._bindEvents();
        }
    }

    _render() {
        var cssPath = this._resolvePath('upload-step-confirm.css');
        this.shadowRoot.innerHTML =
            '<link rel="stylesheet" href="' + cssPath + '">' +
            '<div class="step-confirm">' +
                '<div class="step-confirm__content">' +
                    this._buildContent() +
                '</div>' +
            '</div>';
    }

    _resolvePath(file) {
        var base = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath)
            ? SendComponentPaths.basePath
            : '../_common';
        return base + '/js/components/send-upload/upload-step-confirm/' + file;
    }

    _buildContent() {
        var fs   = this._fileSummary || {};
        var mode = this._shareMode || 'token';

        var html = '';

        // Title + description
        html += '<h3 class="step-title">Ready to encrypt and send</h3>';
        html += '<p class="step-desc">Review your choices, then hit the button below.</p>';

        // Summary rows
        html += '<div class="summary">';

        // File row
        html += '<div class="summary__row">' +
                    '<span class="summary__label">File</span>' +
                    '<span class="summary__value">' +
                        '<span class="summary__icon">' + (fs.icon || '&#128196;') + '</span> ' +
                        this._esc(fs.name || '') +
                        '<span class="summary__meta"> &middot; ' + (fs.meta || '') + '</span>' +
                    '</span>' +
                '</div>';

        // Delivery row
        if (this._deliveryOption) {
            html += '<div class="summary__row">' +
                        '<span class="summary__label">Delivery</span>' +
                        '<span class="summary__value">' +
                            this._deliveryOption.icon + ' ' + this._esc(this._deliveryOption.title) +
                        '</span>' +
                        '<button class="summary__change" data-change="delivery">change</button>' +
                    '</div>';
        }

        // Share mode row
        if (this._shareModeConfig) {
            html += '<div class="summary__row">' +
                        '<span class="summary__label">Share mode</span>' +
                        '<span class="summary__value">' +
                            this._shareModeConfig.icon + ' ' + this._esc(this._shareModeConfig.title) +
                        '</span>' +
                        '<button class="summary__change" data-change="share">change</button>' +
                    '</div>';
        }

        html += '</div>'; // end .summary

        // Word picker (token mode only)
        if (mode === 'token' && this._friendlyParts) {
            var fp = this._friendlyParts;
            html += '<div class="word-picker">' +
                        '<label class="word-picker__label">Your friendly key</label>' +
                        '<div class="word-picker__slots">' +
                            '<div class="word-picker__slot">' +
                                '<span class="word-picker__word">' + this._esc(fp.words[0]) + '</span>' +
                                '<button class="word-picker__shuffle-btn" data-shuffle-word="0" title="Shuffle this word">&#128256;</button>' +
                            '</div>' +
                            '<span class="word-picker__sep">&mdash;</span>' +
                            '<div class="word-picker__slot">' +
                                '<span class="word-picker__word">' + this._esc(fp.words[1]) + '</span>' +
                                '<button class="word-picker__shuffle-btn" data-shuffle-word="1" title="Shuffle this word">&#128256;</button>' +
                            '</div>' +
                            '<span class="word-picker__sep">&mdash;</span>' +
                            '<div class="word-picker__slot">' +
                                '<span class="word-picker__suffix">' + this._esc(fp.suffix) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="word-picker__preview">' +
                            '<span class="word-picker__key" id="friendly-display">' + this._esc(this._friendlyKey || '') + '</span>' +
                            '<button class="word-picker__action" data-action="copy" title="Copy">&#128203;</button>' +
                            '<button class="word-picker__action" data-action="shuffle-all" title="Generate new key">&#128256; New</button>' +
                        '</div>' +
                        '<div class="word-picker__hint">Share this verbally or in a message &mdash; easy to remember and type</div>' +
                        '<div class="word-picker__hint word-picker__hint--faint">' + this._combinationsLabel() + '</div>' +
                    '</div>';
        }

        // Security note
        var securityText = mode === 'token'
            ? 'Your file will be encrypted in your browser using this key. The server never sees your data or key.'
            : 'Your file will be encrypted in your browser before upload. The server never sees your data.';
        html += '<div class="security-note">' +
                    '<span>&#128274;</span> ' + securityText +
                '</div>';

        // Large file warning (> 2 GB)
        if (this._fileSize > 2 * 1024 * 1024 * 1024) {
            html += '<div class="large-warning">' +
                        'Large files may take several minutes to encrypt. Keep this tab open.' +
                    '</div>';
        }

        // Thumbnail note (gallery delivery)
        if (this._showThumbnailNote) {
            html += '<div class="thumbnail-note">' +
                        '<span class="thumbnail-note__icon">&#128247;</span>' +
                        '<div class="thumbnail-note__text">' +
                            '<strong>Preview generation</strong><br>' +
                            'Thumbnails and metadata will be generated from your files during encryption. ' +
                            'This happens entirely in your browser — nothing is sent to the server unencrypted.' +
                        '</div>' +
                    '</div>';
        }

        // Encrypt action is handled by the inline "Encrypt & Upload →" button in the header

        // Back link
        html += '<button class="back-link" id="back-btn">&larr; Back</button>';

        return html;
    }

    _combinationsLabel() {
        if (typeof UploadCrypto !== 'undefined' && UploadCrypto.combinationsLabel) {
            return UploadCrypto.combinationsLabel();
        }
        return '';
    }

    _bindEvents() {
        var self = this;
        var root = this.shadowRoot;

        // Change buttons (delivery / share)
        root.querySelectorAll('.summary__change').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                var type = e.currentTarget.getAttribute('data-change');
                if (type === 'delivery') {
                    self.dispatchEvent(new CustomEvent('step-change-delivery', { bubbles: true, composed: true }));
                } else if (type === 'share') {
                    self.dispatchEvent(new CustomEvent('step-change-share', { bubbles: true, composed: true }));
                }
            });
        });

        // Word shuffle buttons (individual)
        root.querySelectorAll('.word-picker__shuffle-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                var index = parseInt(e.currentTarget.getAttribute('data-shuffle-word'), 10);
                self.dispatchEvent(new CustomEvent('step-shuffle-word', {
                    bubbles: true, composed: true,
                    detail: { index: index }
                }));
            });
        });

        // Shuffle all
        var shuffleAll = root.querySelector('[data-action="shuffle-all"]');
        if (shuffleAll) {
            shuffleAll.addEventListener('click', function() {
                self.dispatchEvent(new CustomEvent('step-shuffle-all', { bubbles: true, composed: true }));
            });
        }

        // Copy friendly key
        var copyBtn = root.querySelector('[data-action="copy"]');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                var keyEl = root.querySelector('#friendly-display');
                if (keyEl && navigator.clipboard) {
                    navigator.clipboard.writeText(keyEl.textContent).catch(function() {});
                }
            });
        }

        // Send button
        var sendBtn = root.querySelector('#send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', function() {
                self.dispatchEvent(new CustomEvent('step-confirmed', { bubbles: true, composed: true }));
            });
        }

        // Back button
        var backBtn = root.querySelector('#back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                self.dispatchEvent(new CustomEvent('step-back', { bubbles: true, composed: true }));
            });
        }
    }
}

customElements.define('upload-step-confirm', UploadStepConfirm);
