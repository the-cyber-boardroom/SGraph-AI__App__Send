/* =============================================================================
   SGraph Send Admin Console — System Info Web Component
   v0.1.0 — Base major version

   System information display:
     - Service name, version
     - Health status indicator with latency
     - Refresh capability

   Usage:
     <system-info></system-info>

   API calls:
     GET /info/status  — service metadata
     GET /info/health  — health check
   ============================================================================= */

class SystemInfo extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._info      = null;
        this._health     = null;
        this._latency    = null;
        this._loading    = false;
        this._error      = null;
    }

    connectedCallback() {
        this.render();
        this.loadAll();
    }

    disconnectedCallback() {
        // no timers to clean up
    }

    // --- Public (called by shell) -------------------------------------------

    onActivated() {
        this.loadAll();
    }

    // --- Data Loading -------------------------------------------------------

    async loadAll() {
        this._loading = true;
        this._error   = null;
        this._renderContent();

        try {
            const start = performance.now();
            const [info, health] = await Promise.all([
                adminAPI.getInfo().catch(err => ({ error: err.message })),
                adminAPI.getHealth().catch(err => ({ error: err.message }))
            ]);
            this._latency = Math.round(performance.now() - start);

            this._info    = info;
            this._health  = health;
            this._loading = false;
        } catch (err) {
            this._error   = err.message;
            this._loading = false;
        }

        this._renderContent();
    }

    // --- Render (full) ------------------------------------------------------

    render() {
        this.shadowRoot.innerHTML = `
            <style>${SystemInfo.styles}</style>
            <div class="system-info">
                <div class="panel-header">
                    <h2 class="panel-header__title">System Information</h2>
                    <div class="panel-header__actions">
                        <button class="btn btn--ghost btn--sm" id="btn-refresh" title="Refresh">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div id="content"></div>
            </div>
        `;

        this.shadowRoot.querySelector('#btn-refresh').addEventListener('click', () => this.loadAll());
    }

    // --- Render: Content ----------------------------------------------------

    _renderContent() {
        const el = this.shadowRoot.querySelector('#content');
        if (!el) return;

        if (this._loading && !this._info) {
            el.innerHTML = `
                <div class="loading">
                    <span class="spinner"></span>
                    <span>Loading system info...</span>
                </div>
            `;
            return;
        }

        if (this._error && !this._info) {
            el.innerHTML = `
                <div class="error-bar">
                    <span>${this._escapeHtml(this._error)}</span>
                    <button class="btn btn--ghost btn--xs" id="btn-retry">Retry</button>
                </div>
            `;
            el.querySelector('#btn-retry').addEventListener('click', () => this.loadAll());
            return;
        }

        el.innerHTML = `
            ${this._renderHealthCard()}
            ${this._renderInfoCard()}
        `;
    }

    _renderHealthCard() {
        const isHealthy = this._health && !this._health.error;
        const statusClass = isHealthy ? 'health--ok' : 'health--error';
        const statusText  = isHealthy ? 'Healthy'    : 'Unreachable';
        const statusData  = isHealthy && this._health.data ? this._health.data : this._health;

        return `
            <div class="card">
                <div class="card__header">
                    <span class="card__title">Health Status</span>
                    <span class="health-indicator ${statusClass}">
                        <span class="health-dot"></span>
                        ${statusText}
                    </span>
                </div>
                <div class="card__body">
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Status</span>
                            <span class="info-value">${isHealthy ? 'OK' : 'Error'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Latency</span>
                            <span class="info-value info-value--mono">${this._latency !== null ? this._latency + 'ms' : '-'}</span>
                        </div>
                        ${!isHealthy && this._health?.error ? `
                            <div class="info-item info-item--full">
                                <span class="info-label">Error</span>
                                <span class="info-value info-value--error">${this._escapeHtml(this._health.error)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    _renderInfoCard() {
        if (!this._info || this._info.error) {
            return `
                <div class="card">
                    <div class="card__header">
                        <span class="card__title">Service Info</span>
                    </div>
                    <div class="card__body">
                        <div class="error-inline">
                            ${this._info?.error ? this._escapeHtml(this._info.error) : 'Unable to load service info'}
                        </div>
                    </div>
                </div>
            `;
        }

        // The info response may contain nested data
        const data = this._info.data || this._info;

        // Build info items from all key-value pairs
        const entries = Object.entries(data).filter(([k]) => k !== 'error');
        const items = entries.map(([key, value]) => `
            <div class="info-item">
                <span class="info-label">${this._formatKey(key)}</span>
                <span class="info-value ${typeof value === 'string' && value.startsWith('v') ? 'info-value--mono' : ''}">${this._escapeHtml(this._formatValue(value))}</span>
            </div>
        `).join('');

        return `
            <div class="card">
                <div class="card__header">
                    <span class="card__title">Service Info</span>
                </div>
                <div class="card__body">
                    <div class="info-grid">${items}</div>
                </div>
            </div>
        `;
    }

    // --- Helpers -------------------------------------------------------------

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    _formatKey(key) {
        return String(key)
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    _formatValue(value) {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    // --- Styles -------------------------------------------------------------

    static get styles() {
        return `
            :host {
                display: block;
            }

            /* --- Panel Header --- */
            .panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 1.25rem;
            }

            .panel-header__title {
                font-size: var(--admin-font-size-xl);
                font-weight: 600;
                color: var(--admin-text);
                margin: 0;
            }

            .panel-header__actions {
                display: flex;
                gap: 0.5rem;
            }

            /* --- Buttons --- */
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 0.375rem;
                border: none;
                border-radius: var(--admin-radius);
                cursor: pointer;
                font-family: var(--admin-font);
                font-weight: 500;
                transition: background var(--admin-transition), color var(--admin-transition);
            }

            .btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .btn--sm { padding: 0.4rem 0.75rem; font-size: var(--admin-font-size-sm); }
            .btn--xs { padding: 0.25rem 0.5rem; font-size: var(--admin-font-size-xs); }

            .btn--ghost {
                background: transparent;
                color: var(--admin-text-secondary);
            }

            .btn--ghost:hover:not(:disabled) {
                background: var(--admin-surface-hover);
                color: var(--admin-text);
            }

            /* --- Loading --- */
            .loading {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 2rem;
                justify-content: center;
                color: var(--admin-text-secondary);
                font-size: var(--admin-font-size-sm);
            }

            .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid var(--admin-border);
                border-top-color: var(--admin-primary);
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* --- Error --- */
            .error-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.625rem 1rem;
                margin-bottom: 1rem;
                background: var(--admin-error-bg);
                border: 1px solid rgba(248, 113, 113, 0.2);
                border-radius: var(--admin-radius);
                color: var(--admin-error);
                font-size: var(--admin-font-size-sm);
            }

            .error-inline {
                color: var(--admin-error);
                font-size: var(--admin-font-size-sm);
                padding: 0.5rem 0;
            }

            /* --- Cards --- */
            .card {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                margin-bottom: 1rem;
                overflow: hidden;
            }

            .card__header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.875rem 1.25rem;
                background: var(--admin-surface-raised);
                border-bottom: 1px solid var(--admin-border);
            }

            .card__title {
                font-size: var(--admin-font-size-sm);
                font-weight: 600;
                color: var(--admin-text);
            }

            .card__count {
                font-size: var(--admin-font-size-xs);
                font-family: var(--admin-font-mono);
                color: var(--admin-text-muted);
                background: var(--admin-bg);
                padding: 0.125rem 0.5rem;
                border-radius: 9999px;
            }

            .card__body {
                padding: 1rem 1.25rem;
            }

            /* --- Health Indicator --- */
            .health-indicator {
                display: inline-flex;
                align-items: center;
                gap: 0.375rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                padding: 0.125rem 0.5rem;
                border-radius: 9999px;
            }

            .health--ok {
                color: var(--admin-success);
                background: var(--admin-success-bg);
            }

            .health--error {
                color: var(--admin-error);
                background: var(--admin-error-bg);
            }

            .health-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: currentColor;
            }

            .health--ok .health-dot {
                box-shadow: 0 0 4px var(--admin-success);
            }

            /* --- Info Grid --- */
            .info-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 0.875rem;
            }

            .info-item {
                display: flex;
                flex-direction: column;
                gap: 0.2rem;
            }

            .info-item--full {
                grid-column: 1 / -1;
            }

            .info-label {
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: var(--admin-text-muted);
            }

            .info-value {
                font-size: var(--admin-font-size-sm);
                color: var(--admin-text);
                word-break: break-word;
            }

            .info-value--mono {
                font-family: var(--admin-font-mono);
            }

            .info-value--error {
                color: var(--admin-error);
            }

            /* --- Responsive --- */
            @media (max-width: 640px) {
                .info-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
    }
}

customElements.define('system-info', SystemInfo);
