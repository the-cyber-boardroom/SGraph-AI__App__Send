/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Base Component Class
   v0.3.0 — Foundation for Shadow DOM components with resource loading

   Adapted from MGraph's BaseComponent pattern.

   Provides:
   - Shadow DOM encapsulation (opt-out via static useShadow = false)
   - Async CSS/HTML template loading from separate files
   - CSS-only mode (no .html template required — for dynamic-render components)
   - Centralised basePath resolution
   - Event listener tracking and cleanup
   - Common utility method access via SendHelpers
   - Standardized lifecycle hooks
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendComponent extends HTMLElement {

    /** Override to false in subclasses that use light DOM (e.g. send-header) */
    static useShadow = true;

    /** Override to false in subclasses that generate HTML dynamically */
    static useTemplate = true;

    constructor() {
        super();
        if (this.constructor.useShadow) {
            this.attachShadow({ mode: 'open' });
        }
        this._eventListeners  = [];
        this._isReady          = false;
        this._resourcesLoaded  = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════════════════════════

    async connectedCallback() {
        try {
            await this.loadResources();
            this.bindElements();
            this.setupEventListeners();
            this._isReady = true;
            this.onReady();
            this.emit('component-ready', { component: this.tagName.toLowerCase() });
        } catch (error) {
            console.error(`[${this.tagName}] Failed to initialize:`, error);
            this.showError(`Failed to load component: ${error.message}`);
        }
    }

    disconnectedCallback() {
        this.cleanup();
    }

    /** Override in subclass for post-ready initialization */
    onReady() {}

    /** Override in subclass to bind element references after template loads */
    bindElements() {}

    /** Override in subclass to setup event listeners */
    setupEventListeners() {}

    // ═══════════════════════════════════════════════════════════════════════════
    // Resource Loading
    // ═══════════════════════════════════════════════════════════════════════════

    /** The DOM root for this component — shadowRoot or the element itself */
    get renderRoot() {
        return this.shadowRoot || this;
    }

    /** Centralised basePath — replaces scattered SendComponentPaths checks */
    get basePath() {
        if (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath) {
            return SendComponentPaths.basePath;
        }
        return '../_common';
    }

    async loadResources() {
        if (this._resourcesLoaded) return;

        const componentName = this.tagName.toLowerCase();
        const paths         = SendComponentPaths.resolve(componentName);

        if (this.constructor.useShadow) {
            // Shadow DOM: inject CSS as <style> tags + HTML template
            const fetches = [
                this.fetchCss(SendComponentPaths.sharedCss.components()),
                this.fetchCss(paths.css)
            ];
            if (this.constructor.useTemplate) {
                fetches.push(this.fetchHtml(paths.html));
            }

            const results      = await Promise.all(fetches);
            const sharedCss    = results[0];
            const componentCss = results[1];
            const templateHtml = results[2] || '';

            this.renderRoot.innerHTML = `
                <style>${sharedCss}</style>
                <style>${componentCss}</style>
                ${templateHtml}
            `;
        } else {
            // Light DOM: inject CSS via <link> in document.head (deduplicated)
            SendComponent._injectHeadCss(componentName, paths.css);
        }

        this._resourcesLoaded = true;
    }

    /** Inject a CSS <link> into document.head, once per component tag name */
    static _headCssInjected = new Set();

    static _injectHeadCss(tagName, cssUrl) {
        if (SendComponent._headCssInjected.has(tagName)) return;
        SendComponent._headCssInjected.add(tagName);
        const link  = document.createElement('link');
        link.rel    = 'stylesheet';
        link.href   = cssUrl;
        document.head.appendChild(link);
    }

    async fetchCss(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return '';        // No CSS — that's fine
            return await response.text();
        } catch {
            return '';                           // Network error — degrade gracefully
        }
    }

    async fetchHtml(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return '';         // No template — component generates HTML dynamically
            return await response.text();
        } catch {
            return '';                           // Network error — degrade gracefully
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Event Helpers
    // ═══════════════════════════════════════════════════════════════════════════

    emit(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles : true,
            composed: true          // Crosses Shadow DOM boundary
        }));
    }

    addTrackedListener(target, eventType, handler, options = {}) {
        const boundHandler = handler.bind(this);
        target.addEventListener(eventType, boundHandler, options);
        this._eventListeners.push({ target, eventType, handler: boundHandler, options });
    }

    $(selector)  { return this.renderRoot.querySelector(selector);    }
    $$(selector) { return this.renderRoot.querySelectorAll(selector); }

    // ═══════════════════════════════════════════════════════════════════════════
    // Utility Accessors (delegate to SendHelpers)
    // ═══════════════════════════════════════════════════════════════════════════

    escapeHtml(text)     { return SendHelpers.escapeHtml(text);     }
    formatNumber(num)    { return SendHelpers.formatNumber(num);    }
    formatBytes(bytes)   { return SendHelpers.formatBytes(bytes);   }
    isValidUrl(url)      { return SendHelpers.isValidUrl(url);      }
    copyToClipboard(txt) { return SendHelpers.copyToClipboard(txt); }

    // ═══════════════════════════════════════════════════════════════════════════
    // Error Display
    // ═══════════════════════════════════════════════════════════════════════════

    showError(message) {
        this.renderRoot.innerHTML = `
            <style>
                .component-error {
                    padding: 20px;
                    background: var(--color-error-bg, rgba(233, 69, 96, 0.1));
                    border: 1px solid var(--color-error-border, rgba(233, 69, 96, 0.2));
                    border-radius: 8px;
                    color: var(--danger, var(--color-error, #E94560));
                    font-family: var(--font-body, system-ui, sans-serif);
                }
                .component-error-title {
                    font-weight: 600;
                    margin-bottom: 8px;
                }
            </style>
            <div class="component-error">
                <div class="component-error-title">Component Error</div>
                <div>${this.escapeHtml(message)}</div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Cleanup
    // ═══════════════════════════════════════════════════════════════════════════

    cleanup() {
        for (const { target, eventType, handler, options } of this._eventListeners) {
            target.removeEventListener(eventType, handler, options);
        }
        this._eventListeners = [];
        this._isReady = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Ready State
    // ═══════════════════════════════════════════════════════════════════════════

    get isReady() { return this._isReady; }

    whenReady(timeout = 5000) {
        if (this._isReady) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Component ${this.tagName} ready timeout`));
            }, timeout);
            this.addEventListener('component-ready', () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
        });
    }
}
