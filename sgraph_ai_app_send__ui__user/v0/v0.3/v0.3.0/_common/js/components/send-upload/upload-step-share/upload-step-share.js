/* =============================================================================
   SGraph Send — Upload Step Share Component
   Step 3: Share mode selection (token, combined, separate)

   Usage:  <upload-step-share></upload-step-share>

   Properties:
     shareMode — 'token' | 'combined' | 'separate' (set by orchestrator)

   Events emitted:
     step-share-selected — detail: { mode: string }
     step-back           — user clicked back
   ============================================================================= */

class UploadStepShare extends HTMLElement {

    static _templateHtml = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._ready     = false;
        this._shareMode = 'token';
    }

    connectedCallback() { this._init(); }

    async _init() {
        var basePath = this._resolveBasePath();
        var compPath = basePath + '/js/components/send-upload/upload-step-share';

        // Load CSS
        var link  = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = compPath + '/upload-step-share.css';
        this.shadowRoot.appendChild(link);

        // Load and cache HTML template
        if (!UploadStepShare._templateHtml) {
            try {
                var resp = await fetch(compPath + '/upload-step-share.html');
                UploadStepShare._templateHtml = await resp.text();
            } catch (e) {
                UploadStepShare._templateHtml = '<div class="step-share"><div class="step-share__content"></div></div>';
            }
        }

        // Clone template into shadow root
        var wrapper = document.createElement('div');
        wrapper.innerHTML = UploadStepShare._templateHtml;
        while (wrapper.firstChild) {
            this.shadowRoot.appendChild(wrapper.firstChild);
        }

        this._container = this.shadowRoot.querySelector('.step-share__content');
        this._ready = true;
        this.render();
    }

    // ── Properties ──────────────────────────────────────────────────────────────

    set shareMode(v) {
        this._shareMode = v;
        this.render();
    }

    get shareMode() {
        return this._shareMode;
    }

    // ── Rendering ───────────────────────────────────────────────────────────────

    render() {
        if (!this._ready) return;

        var self         = this;
        var modes        = (typeof UploadCrypto !== 'undefined' && UploadCrypto.SHARE_MODES)
                             ? UploadCrypto.SHARE_MODES
                             : [];
        var selectedMode = this._shareMode || 'token';

        var cardsHtml = modes.map(function(mode) {
            var activeClass = mode.id === selectedMode ? ' share-card--active' : '';
            return '<div class="share-card' + activeClass + '" data-mode="' + mode.id + '">' +
                '<div class="share-card__icon">' + mode.icon + '</div>' +
                '<div class="share-card__body">' +
                    '<div class="share-card__title">' + self._esc(mode.title) + '</div>' +
                    '<div class="share-card__desc">' + self._esc(mode.desc) + '</div>' +
                    '<div class="share-card__hint">' + self._esc(mode.hint) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        this._container.innerHTML =
            '<h3 class="step-title">How do you want to share it?</h3>' +
            '<div class="share-cards">' + cardsHtml + '</div>' +
            '<button class="back-link" id="back-btn">&larr; Back</button>';

        this._setupListeners();
    }

    // ── Event Listeners ─────────────────────────────────────────────────────────

    _setupListeners() {
        var self = this;

        this.shadowRoot.querySelectorAll('.share-card[data-mode]').forEach(function(card) {
            card.addEventListener('click', function() {
                self._emit('step-share-selected', { mode: card.getAttribute('data-mode') });
            });
        });

        var backBtn = this.shadowRoot.querySelector('#back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                self._emit('step-back');
            });
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, {
            bubbles:  true,
            composed: true,
            detail:   detail || {}
        }));
    }

    _esc(str) {
        return (typeof SendHelpers !== 'undefined' && SendHelpers.escapeHtml)
            ? SendHelpers.escapeHtml(str)
            : String(str);
    }

    _resolveBasePath() {
        if (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath) {
            return SendComponentPaths.basePath;
        }
        return '../_common';
    }
}

customElements.define('upload-step-share', UploadStepShare);
