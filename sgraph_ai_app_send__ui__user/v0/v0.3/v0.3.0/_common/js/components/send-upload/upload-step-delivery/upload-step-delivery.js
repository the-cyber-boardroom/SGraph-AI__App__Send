/* =============================================================================
   SGraph Send — Upload Step Delivery Component (extends SendComponent)
   Step 2: Delivery Mode Selection (Shadow DOM with HTML template)

   Properties (set by orchestrator):
     - deliveryOptions    — Array of { id, icon, title, desc, hint }
     - recommendedDelivery — string ('download', 'view', 'browse', 'gallery')
     - selectedDelivery    — string or null
     - fileSummary         — { icon, name, meta, isFolder }

   Events emitted:
     - step-delivery-selected — detail: { deliveryId: string }
     - step-back              — user clicked back
   ============================================================================= */

class UploadStepDelivery extends SendComponent {

    /** Shadow DOM with external HTML template (defaults). */

    constructor() {
        super();
        this._deliveryOptions     = [];
        this._recommendedDelivery = 'download';
        this._selectedDelivery    = null;
        this._fileSummary         = null;
    }

    // ─── Property accessors ──────────────────────────────────────────────────

    get deliveryOptions()          { return this._deliveryOptions; }
    set deliveryOptions(val)       { this._deliveryOptions = val || []; this._render(); }

    get recommendedDelivery()      { return this._recommendedDelivery; }
    set recommendedDelivery(val)   { this._recommendedDelivery = val || 'download'; this._render(); }

    get selectedDelivery()         { return this._selectedDelivery; }
    set selectedDelivery(val)      { this._selectedDelivery = val; this._render(); }

    get fileSummary()              { return this._fileSummary; }
    set fileSummary(val)           { this._fileSummary = val; this._render(); }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    onReady() {
        this._render();
    }

    // ─── Rendering ───────────────────────────────────────────────────────────

    _render() {
        const content = this.$('.step-delivery__content');
        if (!content) return;

        const options     = this._deliveryOptions;
        const recommended = this._recommendedDelivery;
        const summary     = this._fileSummary;

        // Build file summary HTML
        let summaryHtml = '';
        if (summary) {
            summaryHtml = `
                <div class="file-summary file-summary--compact">
                    <span class="file-summary__icon">${summary.icon}</span>
                    <div>
                        <div class="file-summary__name">${this.escapeHtml(summary.name)}</div>
                        <div class="file-summary__meta">${summary.meta}</div>
                    </div>
                </div>`;
        }

        // Build delivery cards
        const cardsHtml = options.map(opt => {
            const isRecommended = opt.id === recommended;
            let classes = 'delivery-card';
            if (isRecommended) classes += ' delivery-card--recommended default-selected';
            return `
                <div class="${classes}" data-delivery="${this.escapeHtml(opt.id)}">
                    <div class="delivery-card__icon">${opt.icon}</div>
                    <div class="delivery-card__body">
                        <div class="delivery-card__title">${this.escapeHtml(opt.title)}</div>
                        <div class="delivery-card__desc">${this.escapeHtml(opt.desc)}</div>
                        <div class="delivery-card__hint">${this.escapeHtml(opt.hint)}</div>
                    </div>
                </div>`;
        }).join('');

        content.innerHTML = `
            ${summaryHtml}
            <h3 class="step-title">How should the recipient get this?</h3>
            <div class="delivery-cards">${cardsHtml}</div>
            <button class="back-link">&larr; Back</button>
        `;

        this._setupListeners();
    }

    // ─── Event listeners ─────────────────────────────────────────────────────

    _setupListeners() {
        const recommended = this._recommendedDelivery;
        const cards       = this.$$('.delivery-card');
        const defaultCard = this.$('.delivery-card[data-delivery="' + recommended + '"]');

        // Card click — emit selection event
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const deliveryId = card.getAttribute('data-delivery');
                this.emit('step-delivery-selected', { deliveryId });
            });
        });

        // Hover deselect/reselect behavior (v0.2.8)
        cards.forEach(card => {
            const isDefault = card.getAttribute('data-delivery') === recommended;

            card.addEventListener('mouseenter', () => {
                if (!isDefault && defaultCard) {
                    defaultCard.classList.remove('default-selected');
                    defaultCard.classList.add('dimmed-default');
                    card.classList.add('hover-highlight');
                }
            });

            card.addEventListener('mouseleave', () => {
                card.classList.remove('hover-highlight');
                if (!this._selectedDelivery && defaultCard) {
                    defaultCard.classList.remove('dimmed-default');
                    defaultCard.classList.add('default-selected');
                }
            });
        });

        // Back link
        const backBtn = this.$('.back-link');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.emit('step-back');
            });
        }
    }
}

// ─── Register ────────────────────────────────────────────────────────────────

if (!customElements.get('upload-step-delivery')) {
    customElements.define('upload-step-delivery', UploadStepDelivery);
}
