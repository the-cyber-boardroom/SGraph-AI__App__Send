/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Header Component
   v0.2.0 — Brand header with favicon, navigation, and locale selector

   Renders the SG/Send brand header with inline SVG favicon,
   text logo, tagline, and the locale selector component.

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
        const locale = (typeof I18n !== 'undefined') ? I18n.locale : 'en-gb';
        const sgraphUrl = `https://sgraph.ai/${locale}/`;
        const homeUrl   = `/${locale}/`;

        this.innerHTML = `
            <header class="sg-header">
                <div class="sg-header__brand">
                    <a href="${homeUrl}" class="sg-header__logo" aria-label="SG/Send Home">
                        <svg class="sg-header__favicon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                            <rect width="32" height="32" rx="7" fill="#1A1A2E"/>
                            <path d="M20 9 C20 9 22 9 22 11.5 C22 14 18 14.5 16 14.5 C14 14.5 10 15 10 17.5 C10 20 12 21 14 21" fill="none" stroke="#4ECDC4" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
                            <line x1="20" y1="5" x2="12" y2="27" stroke="#E94560" stroke-width="2.5" stroke-linecap="round"/>
                            <circle cx="7" cy="7" r="1" fill="#8892A0" opacity="0.3"/>
                            <circle cx="7" cy="11" r="1" fill="#8892A0" opacity="0.2"/>
                            <circle cx="25" cy="21" r="1" fill="#8892A0" opacity="0.3"/>
                            <circle cx="25" cy="25" r="1" fill="#8892A0" opacity="0.2"/>
                        </svg>
                        <span class="sg-header__logo-sg">SG</span><span class="sg-header__logo-sep">/</span><span class="sg-header__logo-send">Send</span>
                    </a>
                    <span class="sg-header__tagline">${this.t('app.tagline')}</span>
                </div>
                <nav class="sg-header__nav">
                    <a href="${sgraphUrl}" target="_blank" rel="noopener">sgraph.ai</a>
                    <send-locale></send-locale>
                </nav>
            </header>
        `;
    }
}

customElements.define('send-header', SendHeader);
