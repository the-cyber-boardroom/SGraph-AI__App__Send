/* =============================================================================
   SGraph Send Admin Console — Analytics Dashboard Web Component
   v0.1.0 — Base major version

   Real-time traffic pulse display:
     - Stat cards: active requests, active visitors, active transfers
     - Configurable time window (1, 5, 15, 30, 60 minutes)
     - Simple CSS bar chart for visual representation
     - Auto-refresh every 30 seconds

   Usage:
     <analytics-dashboard></analytics-dashboard>

   API call:
     GET /health/pulse?window_minutes=N
   ============================================================================= */

class AnalyticsDashboard extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._pulse          = null;
        this._loading        = false;
        this._error          = null;
        this._windowMinutes  = 5;
        this._refreshTimer   = null;
        this._history        = [];    // last N pulse readings for the bar chart
        this._maxHistory     = 12;    // keep 12 readings (at 30s = 6 min of history)
    }

    connectedCallback() {
        this.render();
        this.loadPulse();
    }

    disconnectedCallback() {
        this._stopAutoRefresh();
    }

    // --- Public (called by shell) -------------------------------------------

    onActivated() {
        this.loadPulse();
    }

    // --- Data Loading -------------------------------------------------------

    async loadPulse() {
        this._loading = true;
        this._updateLoadingState();

        try {
            const pulse = await adminAPI.getPulse(this._windowMinutes);
            this._pulse   = pulse;
            this._error   = null;
            this._loading = false;

            // Track history for bar chart
            this._history.push({
                timestamp:        Date.now(),
                active_requests:  pulse.active_requests  || 0,
                active_visitors:  pulse.active_visitors  || 0,
                active_transfers: pulse.active_transfers || 0
            });
            if (this._history.length > this._maxHistory) {
                this._history.shift();
            }
        } catch (err) {
            this._error   = err.message;
            this._loading = false;
        }

        this._renderContent();
        this._startAutoRefresh();
    }

    // --- Auto-Refresh -------------------------------------------------------

    _startAutoRefresh() {
        this._stopAutoRefresh();
        this._refreshTimer = setInterval(() => this.loadPulse(), 30000);
    }

    _stopAutoRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    // --- Window Change ------------------------------------------------------

    _handleWindowChange(minutes) {
        this._windowMinutes = minutes;
        this._history = [];
        this.loadPulse();
        // Update active button
        this.shadowRoot.querySelectorAll('.window-btn').forEach(btn => {
            btn.classList.toggle('window-btn--active', parseInt(btn.dataset.window, 10) === minutes);
        });
    }

    // --- Render (full) ------------------------------------------------------

    render() {
        this.shadowRoot.innerHTML = `
            <style>${AnalyticsDashboard.styles}</style>
            <div class="analytics">
                <div class="panel-header">
                    <h2 class="panel-header__title">Analytics Pulse</h2>
                    <div class="panel-header__actions">
                        <div class="window-selector">
                            ${[1, 5, 15, 30, 60].map(w => `
                                <button class="window-btn ${w === this._windowMinutes ? 'window-btn--active' : ''}"
                                        data-window="${w}">${w === 60 ? '1h' : w + 'm'}</button>
                            `).join('')}
                        </div>
                        <button class="btn btn--ghost btn--sm" id="btn-refresh" title="Refresh now">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="refresh-indicator" id="refresh-indicator">
                    Auto-refreshing every 30s
                </div>
                <div id="content"></div>
            </div>
        `;

        // Wire buttons
        this.shadowRoot.querySelector('#btn-refresh').addEventListener('click', () => this.loadPulse());
        this.shadowRoot.querySelectorAll('.window-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._handleWindowChange(parseInt(btn.dataset.window, 10));
            });
        });
    }

    // --- Render: Content ----------------------------------------------------

    _renderContent() {
        const el = this.shadowRoot.querySelector('#content');
        if (!el) return;

        if (this._error && !this._pulse) {
            el.innerHTML = `
                <div class="error-bar">
                    <span>${this._escapeHtml(this._error)}</span>
                    <button class="btn btn--ghost btn--xs" id="btn-retry">Retry</button>
                </div>
            `;
            el.querySelector('#btn-retry').addEventListener('click', () => this.loadPulse());
            return;
        }

        if (!this._pulse) {
            el.innerHTML = `
                <div class="loading">
                    <span class="spinner"></span>
                    <span>Loading pulse data...</span>
                </div>
            `;
            return;
        }

        const p = this._pulse;
        el.innerHTML = `
            ${this._error ? `<div class="error-bar error-bar--sm">${this._escapeHtml(this._error)}</div>` : ''}
            <div class="stats-grid">
                ${this._renderStatCard('Requests',  p.active_requests  || 0, 'requests',  '--admin-primary')}
                ${this._renderStatCard('Visitors',  p.active_visitors  || 0, 'visitors',  '--admin-success')}
                ${this._renderStatCard('Transfers', p.active_transfers || 0, 'transfers', '--admin-warning')}
            </div>
            <div class="chart-section">
                <div class="chart-title">Request History</div>
                ${this._renderBarChart()}
            </div>
            <div class="pulse-meta">
                Window: ${p.window_minutes || this._windowMinutes} minute${(p.window_minutes || this._windowMinutes) !== 1 ? 's' : ''}
            </div>
        `;
    }

    _renderStatCard(label, value, type, colorVar) {
        return `
            <div class="stat-card">
                <div class="stat-card__value" style="color: var(${colorVar})">${value}</div>
                <div class="stat-card__label">${label}</div>
                <div class="stat-card__sub">last ${this._windowMinutes}m</div>
            </div>
        `;
    }

    _renderBarChart() {
        if (this._history.length < 2) {
            return `<div class="chart-empty">Collecting data points...</div>`;
        }

        const maxVal = Math.max(1, ...this._history.map(h => h.active_requests));

        const bars = this._history.map((h, i) => {
            const pct   = Math.round((h.active_requests / maxVal) * 100);
            const time  = new Date(h.timestamp);
            const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;
            return `
                <div class="chart-bar-wrapper" title="${h.active_requests} requests at ${label}">
                    <div class="chart-bar" style="height: ${Math.max(2, pct)}%"></div>
                    <div class="chart-bar-label">${label}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="chart-container">
                <div class="chart-bars">
                    ${bars}
                </div>
            </div>
        `;
    }

    _updateLoadingState() {
        const indicator = this.shadowRoot.querySelector('#refresh-indicator');
        if (indicator) {
            indicator.textContent = this._loading ? 'Refreshing...' : 'Auto-refreshing every 30s';
        }
    }

    // --- Helpers -------------------------------------------------------------

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
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
                margin-bottom: 0.5rem;
            }

            .panel-header__title {
                font-size: var(--admin-font-size-xl);
                font-weight: 600;
                color: var(--admin-text);
                margin: 0;
            }

            .panel-header__actions {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .refresh-indicator {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                margin-bottom: 1.25rem;
            }

            /* --- Window Selector --- */
            .window-selector {
                display: flex;
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                overflow: hidden;
            }

            .window-btn {
                padding: 0.3rem 0.625rem;
                font-size: var(--admin-font-size-xs);
                font-family: var(--admin-font);
                font-weight: 500;
                background: transparent;
                color: var(--admin-text-secondary);
                border: none;
                cursor: pointer;
                transition: background var(--admin-transition), color var(--admin-transition);
            }

            .window-btn:hover {
                background: var(--admin-surface-hover);
                color: var(--admin-text);
            }

            .window-btn--active {
                background: var(--admin-primary);
                color: #fff;
            }

            .window-btn--active:hover {
                background: var(--admin-primary-hover);
                color: #fff;
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

            .btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .btn--sm {
                padding: 0.4rem 0.75rem;
                font-size: var(--admin-font-size-sm);
            }

            .btn--xs {
                padding: 0.25rem 0.5rem;
                font-size: var(--admin-font-size-xs);
            }

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

            .error-bar--sm {
                margin-bottom: 0.75rem;
            }

            /* --- Stats Grid --- */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 1rem;
                margin-bottom: 1.5rem;
            }

            .stat-card {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                padding: 1.25rem;
                text-align: center;
            }

            .stat-card__value {
                font-size: 2rem;
                font-weight: 700;
                font-family: var(--admin-font-mono);
                line-height: 1.2;
            }

            .stat-card__label {
                font-size: var(--admin-font-size-sm);
                font-weight: 500;
                color: var(--admin-text);
                margin-top: 0.25rem;
            }

            .stat-card__sub {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                margin-top: 0.125rem;
            }

            /* --- Chart --- */
            .chart-section {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                padding: 1.25rem;
                margin-bottom: 1rem;
            }

            .chart-title {
                font-size: var(--admin-font-size-sm);
                font-weight: 600;
                color: var(--admin-text);
                margin-bottom: 1rem;
            }

            .chart-container {
                height: 140px;
            }

            .chart-bars {
                display: flex;
                align-items: flex-end;
                gap: 4px;
                height: 120px;
            }

            .chart-bar-wrapper {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                height: 100%;
                justify-content: flex-end;
            }

            .chart-bar {
                width: 100%;
                min-height: 2px;
                background: var(--admin-primary);
                border-radius: 2px 2px 0 0;
                transition: height 300ms ease;
                opacity: 0.8;
            }

            .chart-bar-wrapper:hover .chart-bar {
                opacity: 1;
            }

            .chart-bar-label {
                font-size: 9px;
                color: var(--admin-text-muted);
                font-family: var(--admin-font-mono);
                margin-top: 4px;
                white-space: nowrap;
            }

            .chart-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 120px;
                color: var(--admin-text-muted);
                font-size: var(--admin-font-size-sm);
            }

            /* --- Pulse Meta --- */
            .pulse-meta {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                text-align: right;
            }

            /* --- Responsive --- */
            @media (max-width: 640px) {
                .stats-grid {
                    grid-template-columns: 1fr;
                }

                .panel-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 0.75rem;
                }
            }
        `;
    }
}

customElements.define('analytics-dashboard', AnalyticsDashboard);
