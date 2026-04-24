/* =================================================================================
   SGraph — Site Header Component
   v1.0.6 — environment-aware cross-site links

   Domain convention: {env.}{site.}sgraph.ai  (env BEFORE site in subdomain)
     Send prod:  sgraph.ai           Tools prod:  tools.sgraph.ai
     Send dev:   dev.sgraph.ai       Tools dev:   dev.tools.sgraph.ai
     Send main:  main.sgraph.ai      Tools main:  main.tools.sgraph.ai

   detectEnv() strips the base domain, then strips any known site prefix
   from the RIGHT of the remaining subdomain — what's left is the env.
     dev.tools.sgraph.ai → inner='dev.tools' → strip '.tools' → env='dev'
     tools.sgraph.ai     → inner='tools'     → strip 'tools'  → env=''
     dev.sgraph.ai       → inner='dev'       → no site prefix → env='dev'

   xsite(sitePrefix, env) builds: https://{env.}{site.}sgraph.ai

   Active nav: relative hrefs matched by pathname; absolute hrefs matched
   by hostname so the Tools link highlights when on dev.tools.sgraph.ai.

   Cross-site links to *.sgraph.ai never open in a new tab.

   Minimal usage (fully self-configuring):
     <sg-site-header site="Send">
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>

   Zero-attribute usage (auto-detect site from hostname):
     <sg-site-header>
       <div slot="locale" id="locale-picker"></div>
     </sg-site-header>
   ================================================================================= */

import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

const BASE_DOMAIN = 'sgraph.ai'
// Extend when new sites launch — strip from the RIGHT of the subdomain
const SITE_PREFIXES = ['tools', 'api', 'docs']

// Extract env from hostname. Domain pattern: {env.}{site.}sgraph.ai
// Strip BASE_DOMAIN, then strip any known site prefix from the right.
function detectEnv(hostname) {
    if (!hostname.endsWith(BASE_DOMAIN)) return ''  // localhost → prod
    const inner = hostname.slice(0, -(BASE_DOMAIN.length)).replace(/\.$/, '')
    // inner examples: '' | 'dev' | 'tools' | 'dev.tools' | 'main.tools'
    for (const prefix of SITE_PREFIXES) {
        if (inner === prefix) return ''                          // 'tools'     → env=''
        if (inner.endsWith('.' + prefix)) {
            return inner.slice(0, -(prefix.length + 1))         // 'dev.tools' → env='dev'
        }
    }
    return inner  // bare env: 'dev', 'main', '' (Send has no site prefix)
}

// Build a cross-site URL: https://{env.}{site.}sgraph.ai
function xsite(sitePrefix, env) {
    const envPart  = env        ? env + '.'        : ''
    const sitePart = sitePrefix ? sitePrefix + '.' : ''
    return `https://${envPart}${sitePart}${BASE_DOMAIN}`
}

const ENV = detectEnv(
    (typeof window !== 'undefined') ? window.location.hostname : ''
)

const SITE_CONFIGS = {
    Send: {
        sitePrefix: '',
        homeUrl:    '/en-gb/',
        tokenBar:   true,
        get tokenBarBase() { return xsite('', ENV) + '/en-gb/browse/' },
        get navItems() {
            return [
                { label: 'How it Works', href: '/en-gb/how-it-works/' },
                { label: 'Vaults',       href: '/en-gb/vaults/' },
                { label: 'Security',     href: '/en-gb/security/' },
                { label: 'Tools',        href: xsite('tools', ENV) },
                { label: 'Pricing',      href: '/en-gb/pricing/' },
            ]
        }
    },
    Tools: {
        sitePrefix: 'tools',
        homeUrl:    '/en-gb/',
        tokenBar:   false,
        get navItems() {
            return [
                { label: 'Send',    href: xsite('', ENV) },
                { label: 'Pricing', href: '/en-gb/pricing/' },
            ]
        }
    }
}

const HOST_SITE_MAP = {
    'sgraph.ai':             'Send',
    'dev.sgraph.ai':         'Send',
    'main.sgraph.ai':        'Send',
    'tools.sgraph.ai':       'Tools',
    'dev.tools.sgraph.ai':   'Tools',
    'main.tools.sgraph.ai':  'Tools',
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
        let profileItems = (this._profile()?.navItems || []).map(i => ({ ...i }))
        // On localhost, absolutise same-site relative links using the local
        // origin (http://localhost:PORT) so navigation stays on the dev server
        // and DevTools shows the full URL for debugging env-aware routing.
        if (!window.location.hostname.endsWith(BASE_DOMAIN)) {
            const siteBase = window.location.origin
            profileItems = profileItems.map(i =>
                i.href.startsWith('/') ? { ...i, href: siteBase + i.href } : i
            )
        }
        return this._applyActiveNav(profileItems, true)
    }

    _applyActiveNav(items, autoDetect) {
        const activeNav = this.getAttribute('active-nav')
        if (activeNav) {
            return items.map(i => ({ ...i, active: i.href === activeNav }))
        }
        if (autoDetect) {
            const path = window.location.pathname
            const host = window.location.hostname
            return items.map(i => {
                // Relative href: match by pathname
                if (i.href === path) return { ...i, active: true }
                // Absolute href: match by hostname so cross-site links
                // (e.g. Tools) highlight correctly when on that site
                try {
                    if (new URL(i.href).hostname === host) return { ...i, active: true }
                } catch {}
                return { ...i, active: i.active || false }
            })
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
        const base = this.getAttribute('token-bar-base') || this._profile()?.tokenBarBase || xsite('send.sgraph.ai') + '/en-gb/browse/'
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
