/* =============================================================================
   SGraph Send Admin Console — Server Metrics Dashboard Web Component
   v0.1.1 — IFD overlay for server infrastructure metrics

   Displays:
     - Health status cards (Lambda, S3, CloudFront)
     - CloudFront metrics (requests, cache hit rate, error rates)
     - Lambda metrics (invocations, errors, duration)
     - S3 metrics (requests, latency, errors)
     - Cache status + manual refresh button

   Usage:
     <metrics-dashboard></metrics-dashboard>

   API calls:
     GET /metrics/snapshot          — cached snapshot
     GET /metrics/snapshot/refresh  — force refresh
     GET /metrics/cache-status      — cache freshness info
     GET /metrics/health            — health status only
   ============================================================================= */

class MetricsDashboard extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._snapshot  = null;
        this._loading   = false;
        this._error     = null;
        this._cacheInfo = null;
    }

    connectedCallback() {
        this.render();
    }

    // --- Public (called by shell) -------------------------------------------

    onActivated() {
        this.loadSnapshot();
    }

    // --- Data Loading -------------------------------------------------------

    async loadSnapshot(forceRefresh = false) {
        this._loading = true;
        this._updateLoadingState();

        try {
            const path     = forceRefresh ? '/metrics/snapshot/refresh' : '/metrics/snapshot';
            const snapshot = await adminAPI._get(path);
            this._snapshot = snapshot;
            this._error    = null;
            this._loading  = false;
        } catch (err) {
            this._error   = err.message;
            this._loading = false;
        }

        this._renderContent();
        this._loadCacheStatus();
    }

    async _loadCacheStatus() {
        try {
            this._cacheInfo = await adminAPI._get('/metrics/cache-status');
            this._renderCacheInfo();
        } catch (_) {
            // Non-critical
        }
    }

    // --- Render (full) ------------------------------------------------------

    render() {
        this.shadowRoot.innerHTML = `
            <style>${MetricsDashboard.styles}</style>
            <div class="metrics">
                <div class="panel-header">
                    <h2 class="panel-header__title">Server Metrics</h2>
                    <div class="panel-header__actions">
                        <button class="btn btn--ghost btn--sm" id="btn-refresh" title="Refresh (cached)">
                            Refresh
                        </button>
                        <button class="btn btn--primary btn--sm" id="btn-force-refresh" title="Force fresh collection from AWS">
                            Collect Fresh
                        </button>
                    </div>
                </div>
                <div class="cache-info" id="cache-info"></div>
                <div id="content">
                    <div class="loading">
                        <span class="spinner"></span>
                        <span>Click Refresh or Collect Fresh to load metrics</span>
                    </div>
                </div>
            </div>
        `;

        this.shadowRoot.querySelector('#btn-refresh').addEventListener('click', () => this.loadSnapshot(false));
        this.shadowRoot.querySelector('#btn-force-refresh').addEventListener('click', () => this.loadSnapshot(true));
    }

    // --- Render: Content ----------------------------------------------------

    _renderContent() {
        const el = this.shadowRoot.querySelector('#content');
        if (!el) return;

        if (this._error && !this._snapshot) {
            el.innerHTML = `
                <div class="error-bar">
                    <span>${this._escapeHtml(this._error)}</span>
                    <button class="btn btn--ghost btn--xs" id="btn-retry">Retry</button>
                </div>
            `;
            el.querySelector('#btn-retry').addEventListener('click', () => this.loadSnapshot(true));
            return;
        }

        if (!this._snapshot) {
            el.innerHTML = `
                <div class="loading">
                    <span class="spinner"></span>
                    <span>Loading metrics...</span>
                </div>
            `;
            return;
        }

        const s = this._snapshot;
        el.innerHTML = `
            ${this._error ? `<div class="error-bar error-bar--sm">${this._escapeHtml(this._error)}</div>` : ''}
            ${this._renderHealthSection(s.health_status || [])}
            ${this._renderCloudFrontSection(s.cloudfront)}
            ${this._renderLambdaSection('User Lambda', s.lambda_user)}
            ${this._renderLambdaSection('Admin Lambda', s.lambda_admin)}
            ${this._renderS3Section('Transfers Bucket', s.s3_transfers)}
            ${this._renderS3Section('Cache Bucket', s.s3_cache)}
            <div class="snapshot-meta">
                Region: ${s.region || '—'} |
                Lookback: ${s.lookback_minutes || '—'} min |
                Resolution: ${s.period_seconds || '—'}s
            </div>
        `;
    }

    // --- Render: Health Section ---------------------------------------------

    _renderHealthSection(healthList) {
        if (!healthList || healthList.length === 0) return '';

        const cards = healthList.map(h => {
            const statusClass = h.status === 'healthy'  ? 'health-card--healthy'  :
                                h.status === 'warning'  ? 'health-card--warning'  :
                                h.status === 'critical' ? 'health-card--critical' :
                                                          '';
            return `
                <div class="health-card ${statusClass}">
                    <div class="health-card__header">
                        <span class="health-card__component">${this._escapeHtml(h.component || '')}</span>
                        <span class="health-card__status">${this._escapeHtml(h.status || '')}</span>
                    </div>
                    <div class="health-card__message">${this._escapeHtml(h.message || '')}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="section">
                <div class="section__title">Health Status</div>
                <div class="health-grid">${cards}</div>
            </div>
        `;
    }

    // --- Render: CloudFront Section -----------------------------------------

    _renderCloudFrontSection(cf) {
        if (!cf) return '';

        return `
            <div class="section">
                <div class="section__title">CloudFront: ${this._escapeHtml(cf.distribution_id || '')}</div>
                <div class="metrics-grid">
                    ${this._renderMetricCard('Requests'      , this._sumSeries(cf.requests)        , ''  )}
                    ${this._renderMetricCard('Downloaded'     , this._formatBytes(this._sumSeries(cf.bytes_downloaded)), '' )}
                    ${this._renderMetricCard('Uploaded'       , this._formatBytes(this._sumSeries(cf.bytes_uploaded))  , '' )}
                    ${this._renderMetricCard('Cache Hit Rate' , this._avgSeries(cf.cache_hit_rate)  , '%' )}
                    ${this._renderMetricCard('4xx Error Rate' , this._avgSeries(cf.error_rate_4xx)  , '%' )}
                    ${this._renderMetricCard('5xx Error Rate' , this._avgSeries(cf.error_rate_5xx)  , '%' )}
                </div>
            </div>
        `;
    }

    // --- Render: Lambda Section ---------------------------------------------

    _renderLambdaSection(title, lambda_) {
        if (!lambda_) return '';

        return `
            <div class="section">
                <div class="section__title">${this._escapeHtml(title)}: ${this._escapeHtml(lambda_.function_name || '')}</div>
                <div class="metrics-grid">
                    ${this._renderMetricCard('Invocations'  , this._sumSeries(lambda_.invocations)          , ''   )}
                    ${this._renderMetricCard('Errors'       , this._sumSeries(lambda_.errors)               , ''   )}
                    ${this._renderMetricCard('Duration Avg' , this._avgSeries(lambda_.duration_avg)         , 'ms' )}
                    ${this._renderMetricCard('Duration p95' , this._avgSeries(lambda_.duration_p95)         , 'ms' )}
                    ${this._renderMetricCard('Duration Max' , this._maxSeries(lambda_.duration_max)         , 'ms' )}
                    ${this._renderMetricCard('Throttles'    , this._sumSeries(lambda_.throttles)            , ''   )}
                    ${this._renderMetricCard('Concurrent'   , this._maxSeries(lambda_.concurrent_executions), ''   )}
                </div>
            </div>
        `;
    }

    // --- Render: S3 Section -------------------------------------------------

    _renderS3Section(title, s3) {
        if (!s3) return '';

        return `
            <div class="section">
                <div class="section__title">${this._escapeHtml(title)}: ${this._escapeHtml(s3.bucket_name || '')}</div>
                <div class="metrics-grid">
                    ${this._renderMetricCard('GET Requests'   , this._sumSeries(s3.get_requests)          , ''   )}
                    ${this._renderMetricCard('PUT Requests'   , this._sumSeries(s3.put_requests)          , ''   )}
                    ${this._renderMetricCard('First Byte'     , this._avgSeries(s3.first_byte_latency)    , 'ms' )}
                    ${this._renderMetricCard('Total Latency'  , this._avgSeries(s3.total_request_latency) , 'ms' )}
                    ${this._renderMetricCard('4xx Errors'     , this._sumSeries(s3.errors_4xx)            , ''   )}
                    ${this._renderMetricCard('5xx Errors'     , this._sumSeries(s3.errors_5xx)            , ''   )}
                    ${this._renderMetricCard('Downloaded'     , this._formatBytes(this._sumSeries(s3.bytes_downloaded)), '' )}
                    ${this._renderMetricCard('Uploaded'       , this._formatBytes(this._sumSeries(s3.bytes_uploaded))  , '' )}
                </div>
            </div>
        `;
    }

    // --- Render: Metric Card ------------------------------------------------

    _renderMetricCard(label, value, suffix) {
        const display = typeof value === 'number' ? this._formatNumber(value) : value;
        return `
            <div class="metric-card">
                <div class="metric-card__value">${display}${suffix ? `<span class="metric-card__suffix">${suffix}</span>` : ''}</div>
                <div class="metric-card__label">${this._escapeHtml(label)}</div>
            </div>
        `;
    }

    // --- Render: Cache Info -------------------------------------------------

    _renderCacheInfo() {
        const el = this.shadowRoot.querySelector('#cache-info');
        if (!el || !this._cacheInfo) return;

        const ci  = this._cacheInfo;
        const age = ci.snapshot_age_s != null ? `${ci.snapshot_age_s}s ago` : 'not cached';
        el.textContent = `Cache: ${age} | TTL: ${ci.cache_ttl_s || '—'}s`;
    }

    _updateLoadingState() {
        const el = this.shadowRoot.querySelector('#cache-info');
        if (el) {
            el.textContent = this._loading ? 'Collecting metrics from AWS...' : '';
        }
    }

    // --- Helpers ------------------------------------------------------------

    _sumSeries(series) {
        if (!series || !series.values || series.values.length === 0) return 0;
        return series.values.reduce((a, b) => a + b, 0);
    }

    _avgSeries(series) {
        if (!series || !series.values || series.values.length === 0) return 0;
        const sum = series.values.reduce((a, b) => a + b, 0);
        return Math.round((sum / series.values.length) * 100) / 100;
    }

    _maxSeries(series) {
        if (!series || !series.values || series.values.length === 0) return 0;
        return Math.max(...series.values);
    }

    _formatNumber(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
        return typeof n === 'number' && !Number.isInteger(n) ? n.toFixed(2) : String(n);
    }

    _formatBytes(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
        if (bytes >= 1048576)    return (bytes / 1048576).toFixed(2) + ' MB';
        if (bytes >= 1024)       return (bytes / 1024).toFixed(2) + ' KB';
        return bytes + ' B';
    }

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
                gap: 0.5rem;
            }

            .cache-info {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                margin-bottom: 1.25rem;
                min-height: 1em;
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

            .btn--primary {
                background: var(--admin-primary);
                color: #fff;
            }

            .btn--primary:hover:not(:disabled) {
                background: var(--admin-primary-hover);
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

            /* --- Sections --- */
            .section {
                margin-bottom: 1.5rem;
            }

            .section__title {
                font-size: var(--admin-font-size-base);
                font-weight: 600;
                color: var(--admin-text);
                margin-bottom: 0.75rem;
                padding-bottom: 0.375rem;
                border-bottom: 1px solid var(--admin-border);
            }

            /* --- Health Grid --- */
            .health-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 0.75rem;
            }

            .health-card {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                padding: 0.75rem 1rem;
                border-left: 3px solid var(--admin-text-muted);
            }

            .health-card--healthy {
                border-left-color: var(--admin-success);
            }

            .health-card--warning {
                border-left-color: var(--admin-warning);
                background: rgba(251, 191, 36, 0.05);
            }

            .health-card--critical {
                border-left-color: var(--admin-error);
                background: var(--admin-error-bg);
            }

            .health-card__header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.25rem;
            }

            .health-card__component {
                font-size: var(--admin-font-size-sm);
                font-weight: 600;
                color: var(--admin-text);
            }

            .health-card__status {
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--admin-text-muted);
            }

            .health-card__message {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-secondary);
            }

            /* --- Metrics Grid --- */
            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                gap: 0.75rem;
            }

            .metric-card {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                padding: 0.875rem;
                text-align: center;
            }

            .metric-card__value {
                font-size: 1.375rem;
                font-weight: 700;
                font-family: var(--admin-font-mono);
                color: var(--admin-primary);
                line-height: 1.2;
            }

            .metric-card__suffix {
                font-size: 0.75rem;
                font-weight: 500;
                opacity: 0.7;
                margin-left: 1px;
            }

            .metric-card__label {
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                color: var(--admin-text-secondary);
                margin-top: 0.25rem;
            }

            /* --- Snapshot Meta --- */
            .snapshot-meta {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                text-align: right;
                margin-top: 1rem;
            }

            /* --- Responsive --- */
            @media (max-width: 640px) {
                .health-grid {
                    grid-template-columns: 1fr;
                }

                .metrics-grid {
                    grid-template-columns: repeat(2, 1fr);
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

customElements.define('metrics-dashboard', MetricsDashboard);
