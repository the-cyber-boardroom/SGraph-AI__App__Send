/* =================================================================================
   SGraph Vault — Base Component Class
   v0.1.0 — Shadow DOM components with resource loading

   Adapted from SendComponent (v0.2.0 User UI).
   ================================================================================= */

class VaultComponent extends HTMLElement {

    constructor() {
        super()
        this.attachShadow({ mode: 'open' })
        this._eventListeners  = []
        this._isReady         = false
        this._resourcesLoaded = false
    }

    // --- Lifecycle -------------------------------------------------------------

    async connectedCallback() {
        try {
            await this.loadResources()
            this.bindElements()
            this.setupEventListeners()
            this._isReady = true
            this.onReady()
            this.emit('component-ready', { component: this.tagName.toLowerCase() })
        } catch (error) {
            console.error(`[${this.tagName}] Failed to initialize:`, error)
            this.showError(`Failed to load component: ${error.message}`)
        }
    }

    disconnectedCallback() {
        this.cleanup()
    }

    onReady() {}
    bindElements() {}
    setupEventListeners() {}

    // --- Resource Loading ------------------------------------------------------

    async loadResources() {
        if (this._resourcesLoaded) return

        const componentName = this.tagName.toLowerCase()
        const paths         = VaultComponentPaths.resolve(componentName)

        const [sharedCss, componentCss, templateHtml] = await Promise.all([
            this.fetchCss(VaultComponentPaths.sharedCss.components()),
            this.fetchCss(paths.css),
            this.fetchHtml(paths.html)
        ])

        this.shadowRoot.innerHTML = `
            <style>${sharedCss}</style>
            <style>${componentCss}</style>
            ${templateHtml}
        `

        this._resourcesLoaded = true
    }

    async fetchCss(url) {
        try {
            const response = await fetch(url)
            if (!response.ok) return ''
            return response.text()
        } catch {
            return ''
        }
    }

    async fetchHtml(url) {
        try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            return response.text()
        } catch (error) {
            console.error(`[${this.tagName}] Failed to load template: ${url}`, error)
            throw error
        }
    }

    // --- Event Helpers ---------------------------------------------------------

    emit(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles:  true,
            composed: true
        }))
    }

    addTrackedListener(target, eventType, handler, options = {}) {
        const boundHandler = handler.bind(this)
        target.addEventListener(eventType, boundHandler, options)
        this._eventListeners.push({ target, eventType, handler: boundHandler, options })
    }

    $(selector)  { return this.shadowRoot.querySelector(selector)    }
    $$(selector) { return this.shadowRoot.querySelectorAll(selector) }

    // --- Utilities -------------------------------------------------------------

    t(key, params)       { return VaultI18n.t(key, params)           }
    escapeHtml(text)     { return VaultHelpers.escapeHtml(text)      }
    formatBytes(bytes)   { return VaultHelpers.formatBytes(bytes)    }
    formatTimestamp(ts)  { return VaultHelpers.formatTimestamp(ts)   }
    copyToClipboard(txt) { return VaultHelpers.copyToClipboard(txt)  }

    // --- Error Display ---------------------------------------------------------

    showError(message) {
        this.shadowRoot.innerHTML = `
            <style>
                .component-error {
                    padding: 20px;
                    background: var(--color-error-bg, rgba(233, 69, 96, 0.1));
                    border: 1px solid var(--color-error-border, rgba(233, 69, 96, 0.2));
                    border-radius: 8px;
                    color: var(--danger, var(--color-error, #E94560));
                    font-family: var(--font-body, system-ui, sans-serif);
                }
                .component-error-title { font-weight: 600; margin-bottom: 8px; }
            </style>
            <div class="component-error">
                <div class="component-error-title">Component Error</div>
                <div>${this.escapeHtml(message)}</div>
            </div>
        `
    }

    // --- Cleanup ---------------------------------------------------------------

    cleanup() {
        for (const { target, eventType, handler, options } of this._eventListeners) {
            target.removeEventListener(eventType, handler, options)
        }
        this._eventListeners = []
        this._isReady = false
    }

    get isReady() { return this._isReady }

    whenReady(timeout = 5000) {
        if (this._isReady) return Promise.resolve()
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Component ${this.tagName} ready timeout`))
            }, timeout)
            this.addEventListener('component-ready', () => {
                clearTimeout(timer)
                resolve()
            }, { once: true })
        })
    }
}
