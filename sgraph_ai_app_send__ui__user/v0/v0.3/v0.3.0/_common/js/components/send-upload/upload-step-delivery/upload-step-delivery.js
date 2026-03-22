/* =============================================================================
   SGraph Send — Upload Step Delivery Component
   Shadow DOM Web Component for Step 2: Delivery Mode Selection

   Extracted from monolith send-upload.js (v0.2.3, v0.2.5, v0.2.8, v0.2.14)

   Properties (set by orchestrator):
     - deliveryOptions    — Array of { id, icon, title, desc, hint }
     - recommendedDelivery — string ('download', 'view', 'browse', 'gallery')
     - selectedDelivery    — string or null
     - fileSummary         — { icon, name, meta, isFolder }

   Events emitted:
     - step-delivery-selected — detail: { deliveryId: string }
     - step-back              — user clicked back
   ============================================================================= */

class UploadStepDelivery extends HTMLElement {

    // ─── Template cache (shared across all instances) ────────────────────────
    static _templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Properties
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

    async connectedCallback() {
        await this._loadTemplate();
        this._render();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _esc(s) { return SendHelpers.escapeHtml(s); }

    _basePath() {
        if (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath) {
            return SendComponentPaths.basePath;
        }
        return '../_common';
    }

    _componentPath() {
        return this._basePath() + '/js/components/send-upload/upload-step-delivery';
    }

    // ─── Template loading ────────────────────────────────────────────────────

    async _loadTemplate() {
        // Inject CSS link into shadow root
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = this._componentPath() + '/upload-step-delivery.css';
        this.shadowRoot.appendChild(link);

        // Fetch and cache HTML template
        if (!UploadStepDelivery._templateCache) {
            try {
                const resp = await fetch(this._componentPath() + '/upload-step-delivery.html');
                UploadStepDelivery._templateCache = await resp.text();
            } catch (e) {
                UploadStepDelivery._templateCache = '<div class="step-delivery"><div class="step-delivery__content"></div></div>';
            }
        }

        // Create template container
        const container = document.createElement('div');
        container.innerHTML = UploadStepDelivery._templateCache;
        this.shadowRoot.appendChild(container.firstElementChild || container);
    }

    // ─── Rendering ───────────────────────────────────────────────────────────

    _render() {
        const content = this.shadowRoot.querySelector('.step-delivery__content');
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
                        <div class="file-summary__name">${this._esc(summary.name)}</div>
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
                <div class="${classes}" data-delivery="${this._esc(opt.id)}">
                    <div class="delivery-card__icon">${opt.icon}</div>
                    <div class="delivery-card__body">
                        <div class="delivery-card__title">${this._esc(opt.title)}</div>
                        <div class="delivery-card__desc">${this._esc(opt.desc)}</div>
                        <div class="delivery-card__hint">${this._esc(opt.hint)}</div>
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
        const root        = this.shadowRoot;
        const recommended = this._recommendedDelivery;
        const cards       = root.querySelectorAll('.delivery-card');
        const defaultCard = root.querySelector('.delivery-card[data-delivery="' + recommended + '"]');

        // Card click — emit selection event
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const deliveryId = card.getAttribute('data-delivery');
                this.dispatchEvent(new CustomEvent('step-delivery-selected', {
                    bubbles:  true,
                    composed: true,
                    detail:   { deliveryId }
                }));
            });
        });

        // Hover deselect/reselect behavior (v0.2.8)
        // When hovering a non-default card, dim the default card.
        // On mouse leave, restore the default highlight (unless user already selected).
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
        const backBtn = root.querySelector('.back-link');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('step-back', {
                    bubbles:  true,
                    composed: true
                }));
            });
        }
    }
}

// ─── Register ────────────────────────────────────────────────────────────────

if (!customElements.get('upload-step-delivery')) {
    customElements.define('upload-step-delivery', UploadStepDelivery);
}
