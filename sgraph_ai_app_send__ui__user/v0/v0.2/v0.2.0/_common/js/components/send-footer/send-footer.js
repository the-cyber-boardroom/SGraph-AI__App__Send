/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Footer Component
   v0.2.0 — Links back to sgraph.ai

   Usage:
     <send-footer></send-footer>
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendFooter extends HTMLElement {

    connectedCallback() {
        this._onLocaleChanged = () => this.render();
        document.addEventListener('locale-changed', this._onLocaleChanged);
        this.render();
    }

    disconnectedCallback() {
        if (this._onLocaleChanged) document.removeEventListener('locale-changed', this._onLocaleChanged);
    }

    t(key, params) { return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key; }

    render() {
        this.innerHTML = `
            <footer class="sg-footer">
                <span class="sg-footer__text">
                    ${this.t('footer.powered_by')}
                    <a href="https://sgraph.ai" target="_blank" rel="noopener" class="sg-footer__link">${this.t('footer.sgraph')}</a>
                </span>
            </footer>
        `;
    }
}

customElements.define('send-footer', SendFooter);
