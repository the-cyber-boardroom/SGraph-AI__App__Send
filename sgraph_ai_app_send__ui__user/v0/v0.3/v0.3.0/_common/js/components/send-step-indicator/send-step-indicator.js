/* =============================================================================
   SGraph Send — Step Indicator Component
   v0.3.0 — Six-step upload wizard progress display

   Usage:  <send-step-indicator step="1" total="6"></send-step-indicator>
   Attrs:  step  — current step (1-based)
           total — total number of steps

   Reacts to attribute changes — parent sets step="2" and indicator updates.
   ============================================================================= */

class SendStepIndicator extends HTMLElement {

    static STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._cssLink = null;
    }

    static get observedAttributes() { return ['step', 'total']; }

    attributeChangedCallback() { this._render(); }

    connectedCallback() {
        this._ensureCss();
        this._render();
    }

    _ensureCss() {
        if (this._cssLink) return;
        const base = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath)
            || '../_common';
        this._cssLink = document.createElement('link');
        this._cssLink.rel  = 'stylesheet';
        this._cssLink.href = base + '/js/components/send-step-indicator/send-step-indicator.css';
        this.shadowRoot.appendChild(this._cssLink);
    }

    get step()  { return parseInt(this.getAttribute('step')  || '1', 10); }
    get total() { return parseInt(this.getAttribute('total') || '3', 10); }

    _render() {
        const step  = this.step;
        const total = this.total;

        const stepsHtml = [];
        for (let i = 1; i <= total; i++) {
            const isActive    = i === step;
            const isCompleted = i < step;
            const label       = SendStepIndicator.STEP_LABELS[i - 1] || `Step ${i}`;

            const dotClass = isCompleted ? 'dot dot--completed'
                           : isActive    ? 'dot dot--active'
                           :               'dot';

            const stepClass = isCompleted ? 'step step--completed'
                            : isActive    ? 'step step--active'
                            :               'step';

            const ariaAttrs = isActive ? 'aria-current="step"' : '';

            stepsHtml.push(`<div class="${stepClass}" ${ariaAttrs}>
                <span class="${dotClass}">${isCompleted ? '&#10003;' : ''}</span>
                <span class="step__label">${label}</span>
            </div>`);

            if (i < total) {
                const lineClass = isCompleted ? 'line line--completed' : 'line';
                stepsHtml.push(`<div class="${lineClass}"></div>`);
            }
        }

        // Preserve the <link> element, replace only the content
        const content = this.shadowRoot.querySelector('.si-content');
        const html = `
            <nav class="steps" role="navigation" aria-label="Upload progress">
                ${stepsHtml.join('')}
            </nav>
            <div class="label">Step ${step} of ${total}</div>
        `;

        if (content) {
            content.innerHTML = html;
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = 'si-content';
            wrapper.innerHTML = html;
            this.shadowRoot.appendChild(wrapper);
        }

        // Wire click events on completed/active steps
        this._wireStepClicks();
    }

    _wireStepClicks() {
        var self = this;
        var stepEls = this.shadowRoot.querySelectorAll('.step');
        stepEls.forEach(function(el, idx) {
            var stepNum = idx + 1;
            if (el.classList.contains('step--completed') || el.classList.contains('step--active')) {
                el.addEventListener('click', function() {
                    self.dispatchEvent(new CustomEvent('step-nav', {
                        bubbles: true,
                        composed: true,
                        detail: { step: stepNum }
                    }));
                });
            }
        });
    }
}

customElements.define('send-step-indicator', SendStepIndicator);
