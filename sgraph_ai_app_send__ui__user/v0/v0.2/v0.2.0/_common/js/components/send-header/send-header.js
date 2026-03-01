/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Header Component
   v0.2.0 — Brand header with navigation and locale selector

   Renders the SG/Send brand header, navigation links (Docs, GitHub),
   and the locale selector component.

   Usage:
     <send-header></send-header>
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendHeader extends HTMLElement {

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
            <header class="sg-header">
                <div class="sg-header__brand">
                    <a href="/" class="sg-header__logo">
                        <span class="sg-header__logo-sg">SG</span><span class="sg-header__logo-sep">/</span><span class="sg-header__logo-send">Send</span>
                    </a>
                    <span class="sg-header__tagline">${this.t('app.tagline')}</span>
                </div>
                <nav class="sg-header__nav">
                    <send-locale></send-locale>
                </nav>
            </header>
        `;
    }
}

customElements.define('send-header', SendHeader);
