/* =================================================================================
   SGraph — Site Header Component
   v1.0.4 — sgraph.ai design: plain text SG/Product logo, nav, built-in token bar

   Changes from v1.0.3:
     - HTML/CSS derived from sgraph.ai inline header (Aurora dark theme)
     - Token bar built into shadow DOM — add [token-bar] attribute to activate;
       no slot="cta" markup needed on the page, no token-bar.js dependency
     - token-bar-base attribute sets the navigation base URL
       (default: https://send.sgraph.ai/en-gb/browse/)
     - slot="cta" kept for custom CTAs on other sites
     - slot="locale" for locale picker (light DOM, findable by SgI18n)
     - Teal accent line via box-shadow on .site-header
     - external: true per nav item controls target="_blank" (opt-in, not auto)
     - active: true per nav item adds class="active"
     - Outside-click handler closes mobile nav and token bar

   Usage:
     <script type="module"
       src="/components/site-header/v1/v1.0/v1.0.4/sg-site-header.js"></script>

     <!-- With built-in token bar -->
     <sg-site-header
         site="Send"
         home-url="/en-gb/"
         token-bar
         nav-items='[
           {"label":"How it Works","href":"/en-gb/how-it-works/"},
           {"label":"Security","href":"/en-gb/security/","active":true},
           {"label":"Tools","href":"https://tools.sgraph.ai","external":true}
         ]'>
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>

     <!-- Without token bar (e.g. tools.sgraph.ai) -->
     <sg-site-header site="Tools" home-url="/en-gb/" nav-items='[...]'>
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>

   Attributes:
     site             — Product name after "SG/" (e.g. "Send", "Tools", "Vault")
     home-url         — Logo href (default: "/")
     nav-items        — JSON array of {label, href, active?, external?}
     token-bar        — Boolean. Activates the built-in token bar widget.
     token-bar-base   — Base URL for token navigation
                        (default: https://send.sgraph.ai/en-gb/browse/)

   Slots:
     cta              — Optional custom CTA (when not using built-in token bar)
     locale           — Locale picker (light DOM — SgI18n finds it normally)
   ================================================================================= */

import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

const DEFAULT_TOKEN_BASE = 'https://send.sgraph.ai/en-gb/browse/'

class SgSiteHeader extends SgComponent {

    static jsUrl = import.meta.url

    get resourceName() { return 'sg-site-header' }

    // No sharedCssPaths — CSS custom properties inherit through Shadow DOM
    get sharedCssPaths() { return [] }

    bindElements() {
        this._siteLabel = this.$('#site-label')
        this._nav       = this.$('#nav')
        this._toggle    = this.$('#nav-toggle')
        this._logo      = this.$('#logo-link')
        // Token bar elements
        this._tb        = this.$('#token-bar')
        this._tbTrigger = this.$('#tb-trigger')
        this._tbInput   = this.$('#tb-input')
        this._tbGo      = this.$('#tb-go')
        this._tbCancel  = this.$('#tb-cancel')
    }

    setupEventListeners() {
        this.addTrackedListener(this._toggle,    'click', this._onNavToggle)
        this.addTrackedListener(this._tbTrigger, 'click', this._onTbOpen)
        this.addTrackedListener(this._tbGo,      'click', this._onTbGo)
        this.addTrackedListener(this._tbCancel,  'click', this._onTbClose)
        this.addTrackedListener(this._tbInput,   'keydown', this._onTbKeydown)
        this.addTrackedListener(document,        'click', this._onDocClick)
    }

    onReady() {
        this._renderSiteLabel()
        this._renderNav()
        this._renderHomeUrl()
    }

    // --- Logo & Nav Rendering ------------------------------------------------

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
            const activeAttr   = item.active   ? ' class="active"'                 : ''
            const externalAttr = item.external ? ' target="_blank" rel="noopener"' : ''
            return `<a href="${this._escapeAttr(item.href)}"${activeAttr}${externalAttr}>${this._escapeHtml(item.label)}</a>`
        }).join('')
    }

    _renderHomeUrl() {
        const url = this.getAttribute('home-url') || '/'
        this._logo.href = url
    }

    // --- Mobile Nav Toggle ---------------------------------------------------

    _onNavToggle() {
        const isOpen = this._nav.classList.toggle('is-open')
        this._toggle.setAttribute('aria-expanded', String(isOpen))
    }

    // --- Token Bar -----------------------------------------------------------

    _onTbOpen() {
        this._tb.classList.add('is-open')
        this._tbInput.focus()
        this._tbInput.select()
    }

    _onTbClose() {
        this._tb.classList.remove('is-open')
        this._tbInput.value = ''
    }

    _onTbGo() {
        const token = this._tbInput.value.trim()
        if (!token) { this._tbInput.focus(); return }
        const base = this.getAttribute('token-bar-base') || DEFAULT_TOKEN_BASE
        window.location.href = base + '#' + encodeURIComponent(token)
    }

    _onTbKeydown(e) {
        if (e.key === 'Enter')  this._onTbGo()
        if (e.key === 'Escape') this._onTbClose()
    }

    // --- Outside Click -------------------------------------------------------

    _onDocClick(e) {
        if (!this.contains(e.target)) {
            if (this._nav.classList.contains('is-open')) {
                this._nav.classList.remove('is-open')
                this._toggle.setAttribute('aria-expanded', 'false')
            }
            if (this._tb.classList.contains('is-open')) {
                this._onTbClose()
            }
        }
    }

    // --- Attribute Change ----------------------------------------------------

    static get observedAttributes() {
        return ['site', 'nav-items', 'home-url']
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (!this._isReady || oldVal === newVal) return
        if (name === 'site')      this._renderSiteLabel()
        if (name === 'nav-items') this._renderNav()
        if (name === 'home-url')  this._renderHomeUrl()
    }

    // --- Helpers -------------------------------------------------------------

    _escapeAttr(text) {
        return (text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    }
}

customElements.define('sg-site-header', SgSiteHeader)

export { SgSiteHeader }
