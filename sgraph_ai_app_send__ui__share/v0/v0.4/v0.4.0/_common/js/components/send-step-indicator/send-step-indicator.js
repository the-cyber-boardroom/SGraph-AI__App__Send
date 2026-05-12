/* =============================================================================
   SGraph Send — Step Indicator Component
   v0.3.0 — Six-step upload wizard progress display (extends SendComponent)

   Usage:  <send-step-indicator step="1" total="6"></send-step-indicator>
   Attrs:  step  — current step (1-based)
           total — total number of steps

   Reacts to attribute changes — parent sets step="2" and indicator updates.
   ============================================================================= */

class SendStepIndicator extends SendComponent {

    static STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];

    /** Shadow DOM: yes (inherited default). HTML template: no (dynamic render). */
    static useTemplate = false;

    static get observedAttributes() { return ['step', 'total']; }

    attributeChangedCallback() {
        if (this._resourcesLoaded) this._render();
    }

    onReady() {
        this._render();
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

        // Update only the content wrapper, preserving CSS <style> tags
        const html = `
            <nav class="steps" role="navigation" aria-label="Upload progress">
                ${stepsHtml.join('')}
            </nav>
            <div class="label">Step ${step} of ${total}</div>
        `;

        let content = this.$('.si-content');
        if (content) {
            content.innerHTML = html;
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = 'si-content';
            wrapper.innerHTML = html;
            this.renderRoot.appendChild(wrapper);
        }

        this._wireStepClicks();
    }

    _wireStepClicks() {
        var self = this;
        this.$$('.step').forEach(function(el, idx) {
            var stepNum = idx + 1;
            if (el.classList.contains('step--completed') || el.classList.contains('step--active')) {
                el.addEventListener('click', function() {
                    self.emit('step-nav', { step: stepNum });
                });
            }
        });
    }
}

customElements.define('send-step-indicator', SendStepIndicator);
