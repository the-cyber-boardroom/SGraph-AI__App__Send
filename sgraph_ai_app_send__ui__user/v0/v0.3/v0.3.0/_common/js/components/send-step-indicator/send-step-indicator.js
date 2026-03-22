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
    }

    static get observedAttributes() { return ['step', 'total']; }

    attributeChangedCallback() { this._render(); }

    connectedCallback() { this._render(); }

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

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-bottom: var(--space-4, 1rem);
                }

                .steps {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2, 0.5rem);
                }

                .step {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2, 0.5rem);
                    font-size: var(--text-sm, 0.875rem);
                    color: var(--color-text-secondary, #8892A0);
                    white-space: nowrap;
                }

                .step--active {
                    color: var(--color-primary, #4ECDC4);
                    font-weight: var(--weight-semibold, 600);
                }

                .step--completed {
                    color: var(--color-success, #4ECDC4);
                }

                .dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    border: 2px solid var(--color-text-secondary, #8892A0);
                    background: transparent;
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 8px;
                    line-height: 1;
                }

                .dot--active {
                    border-color: var(--color-primary, #4ECDC4);
                    background: var(--color-primary, #4ECDC4);
                }

                .dot--completed {
                    border-color: var(--color-success, #4ECDC4);
                    background: var(--color-success, #4ECDC4);
                    color: var(--color-bg, #1A1A2E);
                }

                .line {
                    flex: 1;
                    height: 2px;
                    background: var(--color-border, rgba(78, 205, 196, 0.15));
                    min-width: 20px;
                }

                .line--completed {
                    background: var(--color-success, #4ECDC4);
                }

                .label {
                    font-size: var(--text-small, 0.75rem);
                    color: var(--color-text-secondary, #8892A0);
                    margin-top: var(--space-2, 0.5rem);
                }

                @media (max-width: 480px) {
                    .steps { gap: var(--space-1, 0.25rem); }
                    .step  { font-size: var(--text-small, 0.75rem); }
                    .step__label { display: none; }
                }
            </style>

            <nav class="steps" role="navigation" aria-label="Upload progress">
                ${stepsHtml.join('')}
            </nav>
            <div class="label">Step ${step} of ${total}</div>
        `;
    }
}

customElements.define('send-step-indicator', SendStepIndicator);
