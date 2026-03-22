/* =============================================================================
   SGraph Send — Upload Step Share Component (extends SendComponent)
   Step 3: Share mode selection (token, combined, separate)

   Usage:  <upload-step-share></upload-step-share>

   Properties:
     shareMode — 'token' | 'combined' | 'separate' (set by orchestrator)

   Events emitted:
     step-share-selected — detail: { mode: string }
     step-back           — user clicked back
   ============================================================================= */

class UploadStepShare extends SendComponent {

    /** Shadow DOM with external HTML template (defaults). */

    constructor() {
        super();
        this._shareMode = 'token';
    }

    onReady() {
        this._container = this.$('.step-share__content');
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
        if (!this._resourcesLoaded || !this._container) return;

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
                    '<div class="share-card__title">' + self.escapeHtml(mode.title) + '</div>' +
                    '<div class="share-card__desc">' + self.escapeHtml(mode.desc) + '</div>' +
                    '<div class="share-card__hint">' + self.escapeHtml(mode.hint) + '</div>' +
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

        this.$$('.share-card[data-mode]').forEach(function(card) {
            card.addEventListener('click', function() {
                self.emit('step-share-selected', { mode: card.getAttribute('data-mode') });
            });
        });

        var backBtn = this.$('#back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                self.emit('step-back');
            });
        }
    }
}

customElements.define('upload-step-share', UploadStepShare);
