/* =================================================================================
   SGraph — Site Header Component
   v1.0.4 — sgraph.ai design: plain text SG/Product logo, nav, CTA + locale slots

   Changes from v1.0.3:
     - HTML/CSS derived from sgraph.ai inline header (Aurora dark theme)
     - Added slot="cta" for the "Open with token →" bar (optional)
     - Teal accent line via box-shadow on .site-header
     - external: true per nav item controls target="_blank" (no longer auto-detected
       from href — callers must opt in explicitly)
     - active: true per nav item adds class="active"
     - _logo bound to #logo-link (matches new HTML template)

   Usage:
     <script type="module"
       src="/components/site-header/v1/v1.0/v1.0.4/sg-site-header.js"></script>

     <sg-site-header
         site="Send"
         home-url="/en-gb/"
         nav-items='[
           {"label":"How it Works","href":"/en-gb/how-it-works/"},
           {"label":"Security","href":"/en-gb/security/","active":true},
           {"label":"Tools","href":"https://tools.sgraph.ai","external":true},
           {"label":"Pricing","href":"/en-gb/pricing/"}
         ]'>
       <div slot="cta" class="token-inline-bar" id="token-bar">...</div>
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>

   Attributes:
     site       — Product name after "SG/" (e.g. "Send", "Tools", "Vault")
     home-url   — Logo href (default: "/")
     nav-items  — JSON array of {label, href, active?, external?}

   Slots:
     cta        — Optional CTA widget (token bar, sign-in, etc.)
     locale     — Locale picker
   ================================================================================= */

import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

class SgSiteHeader extends SgComponent {

    static jsUrl = import.meta.url

    get resourceName() { return 'sg-site-header' }

    // No sharedCssPaths — CSS custom properties inherit through Shadow DOM
    // from the host page's design system (:root tokens in style.css)
    get sharedCssPaths() { return [] }

    bindElements() {
        this._siteLabel = this.$('#site-label')
        this._nav       = this.$('#nav')
        this._toggle    = this.$('#nav-toggle')
        this._logo      = this.$('#logo-link')
    }

    setupEventListeners() {
        this.addTrackedListener(this._toggle, 'click', this._onToggle)
        // Close mobile nav on outside click
        this.addTrackedListener(document, 'click', this._onDocClick)
    }

    onReady() {
        this._renderSiteLabel()
        this._renderNav()
        this._renderHomeUrl()
    }

    // --- Rendering ---------------------------------------------------------------

    _renderSiteLabel() {
        const site = this.getAttribute('site') || ''
        this._siteLabel.textContent = site
        if (!site) {
            this._siteLabel.previousElementSibling.style.display = 'none'
            this._siteLabel.style.display = 'none'
        }
    }

    _renderNav() {
        const raw = this.getAttribute('nav-items')
        if (!raw) return
        let items
        try {
            items = JSON.parse(raw)
        } catch {
            console.warn('[sg-site-header] Invalid nav-items JSON:', raw)
            return
        }
        this._nav.innerHTML = items.map(item => {
            const activeAttr   = item.active   ? ' class="active"'             : ''
            const externalAttr = item.external ? ' target="_blank" rel="noopener"' : ''
            return `<a href="${this._escapeAttr(item.href)}"${activeAttr}${externalAttr}>${this._escapeHtml(item.label)}</a>`
        }).join('')
    }

    _renderHomeUrl() {
        const url = this.getAttribute('home-url') || '/'
        this._logo.href = url
    }

    // --- Mobile Toggle -----------------------------------------------------------

    _onToggle() {
        const isOpen = this._nav.classList.toggle('is-open')
        this._toggle.setAttribute('aria-expanded', String(isOpen))
    }

    _onDocClick(e) {
        if (this._nav.classList.contains('is-open') && !this.contains(e.target)) {
            this._nav.classList.remove('is-open')
            this._toggle.setAttribute('aria-expanded', 'false')
        }
    }

    // --- Attribute Change --------------------------------------------------------

    static get observedAttributes() {
        return ['site', 'nav-items', 'home-url']
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (!this._isReady || oldVal === newVal) return
        if (name === 'site')      this._renderSiteLabel()
        if (name === 'nav-items') this._renderNav()
        if (name === 'home-url')  this._renderHomeUrl()
    }

    // --- Helpers -----------------------------------------------------------------

    _escapeAttr(text) {
        return (text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    }
}

customElements.define('sg-site-header', SgSiteHeader)

export { SgSiteHeader }
