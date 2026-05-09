/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Step Options (v0.3.2)

   New light-DOM component: <upload-step-options>
   Replaces the separate Delivery (step 2) and Share mode (step 3) screens with a
   single combined "Options" step (step 2 in the new 5-step wizard).

   Design:
   - Primary section: delivery mode cards (same layout/style as upload-step-delivery)
   - Secondary section: compact share mode pills (new style in upload-step-options.css)
   - Back button emits 'step-back'
   - Delivery card click emits 'step-delivery-chosen' (no auto-advance)
   - Share pill click emits 'step-sharemode-chosen' (no auto-advance)
   - The Next → button in the orchestrator header drives the state transition

   Properties (set by orchestrator via _syncComponent):
     deliveryOptions     — Array of { id, icon, title, desc, hint }
     recommendedDelivery — string
     selectedDelivery    — string or null
     fileSummary         — { icon, name, meta }
     shareMode           — string ('token' | 'combined' | 'separate')
   ═══════════════════════════════════════════════════════════════════════════════ */

class UploadStepOptions extends HTMLElement {

    constructor() {
        super();
        this._deliveryOptions     = [];
        this._recommendedDelivery = 'download';
        this._selectedDelivery    = null;
        this._fileSummary         = null;
        this._shareMode           = 'token';
        this._secretMode          = false;
    }

    set deliveryOptions(v)      { this._deliveryOptions = v || [];  this._render(); }
    set recommendedDelivery(v)  { this._recommendedDelivery = v;    this._render(); }
    set selectedDelivery(v)     { this._selectedDelivery = v;       this._render(); }
    set fileSummary(v)          { this._fileSummary = v;            this._render(); }
    set shareMode(v)            { this._shareMode = v || 'token';   this._render(); }
    set secretMode(v)           { this._secretMode = !!v;           this._render(); }

    // ─── Render ──────────────────────────────────────────────────────────────

    _render() {
        var summaryHtml  = this._buildSummaryHtml();
        var cardsHtml    = this._buildCardsHtml();
        var shareHtml    = this._buildShareHtml();

        this.innerHTML =
            summaryHtml +
            '<h3 class="step-title" style="margin:var(--space-4,1rem) 0 var(--space-3,0.75rem);">' +
                'How should the recipient get this?' +
            '</h3>' +
            '<div class="delivery-cards">' + cardsHtml + '</div>' +
            (this._secretMode ? '' :
                '<div class="share-mode-row">' +
                    '<span class="share-mode-row__label">Share via:</span>' +
                    '<div class="share-pills">' + shareHtml + '</div>' +
                '</div>'
            ) +
            '<button class="back-link" id="options-back-btn">&larr; Back</button>';

        this._wireListeners();
    }

    _buildSummaryHtml() {
        var s = this._fileSummary;
        if (!s) return '';
        return '<div class="file-summary file-summary--compact">' +
                   '<span class="file-summary__icon">' + s.icon + '</span>' +
                   '<div>' +
                       '<div class="file-summary__name">' + this._escHtml(s.name) + '</div>' +
                       '<div class="file-summary__meta">' + s.meta + '</div>' +
                   '</div>' +
               '</div>';
    }

    _buildCardsHtml() {
        var sel     = this._selectedDelivery || this._recommendedDelivery;
        var options = this._deliveryOptions || [];
        return options.map(function(opt) {
            var isSelected = opt.id === sel;
            var cls = 'delivery-card' + (isSelected ? ' delivery-card--recommended default-selected' : '');
            return '<div class="' + cls + '" data-delivery="' + opt.id + '">' +
                       '<div class="delivery-card__icon">' + opt.icon + '</div>' +
                       '<div class="delivery-card__body">' +
                           '<div class="delivery-card__title">' + opt.title + '</div>' +
                           '<div class="delivery-card__desc">' + opt.desc + '</div>' +
                           '<div class="delivery-card__hint">' + opt.hint + '</div>' +
                       '</div>' +
                   '</div>';
        }).join('');
    }

    _buildShareHtml() {
        var modes = (typeof UploadCrypto !== 'undefined') ? UploadCrypto.SHARE_MODES : [];
        var sm    = this._shareMode;
        return modes.map(function(m) {
            var cls = 'share-pill' + (m.id === sm ? ' share-pill--active' : '');
            return '<button class="' + cls + '" data-mode="' + m.id + '">' +
                       m.icon + ' ' + m.title +
                   '</button>';
        }).join('');
    }

    // ─── Listeners ───────────────────────────────────────────────────────────

    _wireListeners() {
        var self = this;

        // Delivery card click — select only, no auto-advance (Gotcha 11)
        this.querySelectorAll('.delivery-card[data-delivery]').forEach(function(card) {
            card.addEventListener('click', function() {
                self._selectedDelivery = card.getAttribute('data-delivery');
                self._render();
                self._emit('step-delivery-chosen', { deliveryId: self._selectedDelivery });
            });
        });

        // Share pill click — select only, no auto-advance
        this.querySelectorAll('.share-pill[data-mode]').forEach(function(pill) {
            pill.addEventListener('click', function() {
                self._shareMode = pill.getAttribute('data-mode');
                self._render();
                self._emit('step-sharemode-chosen', { mode: self._shareMode });
            });
        });

        // Back button
        var backBtn = this.querySelector('#options-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() { self._emit('step-back'); });
        }
    }

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, {
            detail:   detail || {},
            bubbles:  true,
            composed: true
        }));
    }

    _escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

customElements.define('upload-step-options', UploadStepOptions);
