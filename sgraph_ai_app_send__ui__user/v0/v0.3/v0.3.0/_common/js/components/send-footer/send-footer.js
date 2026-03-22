/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Footer Component
   v0.2.0 — Links back to sgraph.ai, shows build version

   Usage:
     <send-footer></send-footer>

   Version display:
     Reads window.SGRAPH_BUILD (injected at build time by scripts/inject_build_version.py).
     Shows: "Powered by SGraph  ·  v0.10.13  ·  UI v0.2.0"
     Falls back gracefully when build-info.js is absent (local dev).
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
        const locale = (typeof I18n !== 'undefined') ? I18n.locale : 'en-gb';
        const sgraphUrl = `https://sgraph.ai/${locale}/`;
        const build    = window.SGRAPH_BUILD;
        const version  = build
            ? `<span class="sg-footer__version">${build.appVersion}  ·  UI ${build.uiVersion}</span>`
            : '';

        this.innerHTML = `
            <footer class="sg-footer">
                <span class="sg-footer__text">
                    ${this.t('footer.powered_by')}
                    <a href="${sgraphUrl}" target="_blank" rel="noopener" class="sg-footer__link">${this.t('footer.sgraph')}</a>
                </span>
                ${version}
            </footer>
        `;
    }
}

customElements.define('send-footer', SendFooter);
