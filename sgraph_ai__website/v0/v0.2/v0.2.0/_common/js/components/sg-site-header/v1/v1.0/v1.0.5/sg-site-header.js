/* =================================================================================
   SGraph — Site Header Component
   v1.0.5 — self-configuring: built-in site profiles, auto active-nav detection

   Changes from v1.0.4:
     - SITE_CONFIGS map: built-in nav, homeUrl, tokenBar, tokenBarBase per site
     - HOST_SITE_MAP: auto-detect site from window.location.hostname
     - active-nav attribute: explicitly marks one nav link active by href
     - When using a built-in profile (no nav-items attr), the active link is
       auto-detected from window.location.pathname — no active-nav needed
     - Explicit attributes always override the built-in profile (escape hatch)
     - Backward compatible: v1.0.4 markup still works unchanged

   Minimal usage (fully self-configuring):
     <sg-site-header site="Send">
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>

   Zero-attribute usage (auto-detect site from hostname):
     <sg-site-header>
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>

   Explicit active-nav override (e.g. if pathname matching is insufficient):
     <sg-site-header site="Send" active-nav="/en-gb/security/">

   Full escape hatch (v1.0.4 style, still works):
     <sg-site-header site="Send" home-url="/en-gb/" token-bar nav-items='[...]'>
   ================================================================================= */

import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

const DEFAULT_TOKEN_BASE = 'https://send.sgraph.ai/en-gb/browse/'

const SITE_CONFIGS = {
    Send: {
        homeUrl:      '/en-gb/',
        tokenBar:     true,
        tokenBarBase: DEFAULT_TOKEN_BASE,
        navItems: [
            { label: 'How it Works', href: '/en-gb/how-it-works/' },
            { label: 'Vaults',       href: '/en-gb/vaults/' },
            { label: 'Security',     href: '/en-gb/security/' },
            { label: 'Tools',        href: 'https://tools.sgraph.ai' },
            { label: 'Pricing',      href: '/en-gb/pricing/' },
        ]
    },
    Tools: {
        homeUrl:  '/en-gb/',
        tokenBar: false,
        navItems: [
            { label: 'Send',    href: 'https://send.sgraph.ai', external: true },
            { label: 'Pricing', href: '/en-gb/pricing/' },
        ]
    }
}

const HOST_SITE_MAP = {
    'send.sgraph.ai':  'Send',
    'dev.sgraph.ai':   'Send',
    'tools.sgraph.ai': 'Tools',
}

class SgSiteHeader extends SgComponent {

    static jsUrl = import.meta.url

    get resourceName() { return 'sg-site-header' }
    get sharedCssPaths() { return [] }

    bindElements() {
        this._siteLabel = this.$('#site-label')
        this._nav       = this.$('#nav')
        this._toggle    = this.$('#nav-toggle')
        this._logo      = this.$('#logo-link')
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
        this._reflectTokenBar()
        this._renderSiteLabel()
        this._renderNav()
        this._renderHomeUrl()
    }

    // --- Profile resolution --------------------------------------------------

    _profile() {
        const site = this.getAttribute('site') || HOST_SITE_MAP[window.location.hostname]
        return site ? (SITE_CONFIGS[site] || null) : null
    }

    _reflectTokenBar() {
        if (!this.hasAttribute('token-bar') && this._profile()?.tokenBar) {
            this.setAttribute('token-bar', '')
        }
    }

    // --- Rendering -----------------------------------------------------------

    _renderSiteLabel() {
        const site = this.getAttribute('site') || HOST_SITE_MAP[window.location.hostname] || ''
        this._siteLabel.textContent = site
        if (!site) {
            this._siteLabel.previousElementSibling.style.display = 'none'
            this._siteLabel.style.display = 'none'
        }
    }

    _renderNav() {
        const items = this._resolveNavItems()
        this._nav.innerHTML = items.map(item => {
            const activeAttr   = item.active   ? ' class="active"'                 : ''
            const externalAttr = item.external ? ' target="_blank" rel="noopener"' : ''
            return `<a href="${this._escapeAttr(item.href)}"${activeAttr}${externalAttr}>${this._escapeHtml(item.label)}</a>`
        }).join('')
    }

    _resolveNavItems() {
        const raw = this.getAttribute('nav-items')
        if (raw) {
            let items
            try { items = JSON.parse(raw) } catch { return [] }
            return this._applyActiveNav(items, false)
        }
        // Built-in profile — deep copy so we never mutate the config object
        const profileItems = (this._profile()?.navItems || []).map(i => ({ ...i }))
        return this._applyActiveNav(profileItems, true)
    }

    _applyActiveNav(items, autoDetect) {
        const activeNav = this.getAttribute('active-nav')
        if (activeNav) {
            return items.map(i => ({ ...i, active: i.href === activeNav }))
        }
        if (autoDetect) {
            const path = window.location.pathname
            return items.map(i => ({ ...i, active: i.href === path || i.active }))
        }
        return items
    }

    _renderHomeUrl() {
        this._logo.href = this.getAttribute('home-url') || this._profile()?.homeUrl || '/'
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
        const base = this.getAttribute('token-bar-base') || this._profile()?.tokenBarBase || DEFAULT_TOKEN_BASE
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

    // --- Attribute Changes ---------------------------------------------------

    static get observedAttributes() {
        return ['site', 'nav-items', 'home-url', 'active-nav']
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (!this._isReady || oldVal === newVal) return
        if (name === 'site') {
            this._reflectTokenBar()
            this._renderSiteLabel()
            this._renderNav()
            this._renderHomeUrl()
        }
        if (name === 'nav-items')  this._renderNav()
        if (name === 'home-url')   this._renderHomeUrl()
        if (name === 'active-nav') this._renderNav()
    }

    // --- Helpers -------------------------------------------------------------

    _escapeAttr(text) {
        return (text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    }
}

customElements.define('sg-site-header', SgSiteHeader)

export { SgSiteHeader }
