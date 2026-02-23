/* =============================================================================
   SGraph Send Admin Console — Token Manager Web Component
   v0.1.2 — IFD overlay: auto-refresh disabled

   Changes from v0.1.0:
     - Disabled auto-refresh interval (manual refresh via button only)

   Token lifecycle management:
     - Token list table (name, status, usage, created_by)
     - Create token form (name, usage_limit, created_by)
     - Token detail view (click to expand)
     - Revoke button with confirmation

   Usage:
     <token-manager></token-manager>

   API calls:
     GET  /tokens/list              — list all tokens
     POST /tokens/create            — create a new token
     GET  /tokens/lookup/{name}     — token detail
     POST /tokens/revoke/{name}     — revoke a token
   ============================================================================= */

class TokenManager extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._tokens         = [];
        this._loading        = false;
        this._error          = null;
        this._selectedToken  = null;       // token_name of expanded row
        this._tokenDetail    = null;       // full lookup data for selected token
        this._showCreateForm = false;
        this._creating       = false;
        this._revoking       = null;       // token_name being revoked
        this._refreshTimer   = null;
    }

    connectedCallback() {
        this.render();
        // Don't load data here — wait until shell activates this view
        // This prevents 40+ API calls when token-manager is not the active panel
    }

    disconnectedCallback() {
        this._stopAutoRefresh();
    }

    // --- Public (called by shell) -------------------------------------------

    onActivated() {
        this.loadTokens();
    }

    // --- Data Loading -------------------------------------------------------

    async loadTokens() {
        this._loading = true;
        this._error   = null;
        this._renderList();

        try {
            // Single bulk call replaces list + N individual lookups
            const result   = await adminAPI.listTokenDetails();
            this._tokens   = result.tokens || [];
            this._loading  = false;
            this._error    = null;
        } catch (err) {
            this._loading = false;
            this._error = err.message;
        }

        this._renderList();
        // v0.1.2: auto-refresh disabled — manual refresh only
        // this._startAutoRefresh();
    }

    async _loadTokenDetail(tokenName) {
        try {
            this._tokenDetail = await adminAPI.lookupToken(tokenName);
        } catch (err) {
            this._tokenDetail = { error: err.message };
        }
        this._renderDetail();
    }

    // --- Create Token -------------------------------------------------------

    async _handleCreate(e) {
        e.preventDefault();
        const form = this.shadowRoot.querySelector('#create-form');
        if (!form) return;

        const tokenName  = form.querySelector('#input-name').value.trim();
        const usageLimit = parseInt(form.querySelector('#input-limit').value, 10) || 50;
        const createdBy  = form.querySelector('#input-created-by').value.trim() || 'admin';

        if (!tokenName) return;

        this._creating = true;
        this._renderCreateForm();

        try {
            await adminAPI.createToken(tokenName, usageLimit, createdBy, {});
            this._showCreateForm = false;
            this._creating = false;
            await this.loadTokens();
        } catch (err) {
            this._creating = false;
            this._error = `Create failed: ${err.message}`;
            this._renderCreateForm();
            this._renderError();
        }
    }

    // --- Revoke Token -------------------------------------------------------

    async _handleRevoke(tokenName) {
        // Confirmation via a second click (visual cue)
        if (this._revoking === tokenName) {
            try {
                await adminAPI.revokeToken(tokenName);
                this._revoking = null;
                await this.loadTokens();
            } catch (err) {
                this._revoking = null;
                this._error = `Revoke failed: ${err.message}`;
                this._renderList();
            }
            return;
        }
        // First click — enter confirm state
        this._revoking = tokenName;
        this._renderList();

        // Auto-cancel after 3 seconds
        setTimeout(() => {
            if (this._revoking === tokenName) {
                this._revoking = null;
                this._renderList();
            }
        }, 3000);
    }

    // --- Auto-Refresh -------------------------------------------------------

    _startAutoRefresh() {
        this._stopAutoRefresh();
        this._refreshTimer = setInterval(() => this.loadTokens(), 60000);
    }

    _stopAutoRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    // --- Row Selection ------------------------------------------------------

    _handleRowClick(tokenName) {
        if (this._selectedToken === tokenName) {
            this._selectedToken = null;
            this._tokenDetail   = null;
        } else {
            this._selectedToken = tokenName;
            this._loadTokenDetail(tokenName);
        }
        this._renderList();
    }

    // --- Render (full) ------------------------------------------------------

    render() {
        this.shadowRoot.innerHTML = `
            <style>${TokenManager.styles}</style>
            <div class="token-manager">
                <div class="panel-header">
                    <h2 class="panel-header__title">Token Management</h2>
                    <div class="panel-header__actions">
                        <button class="btn btn--ghost btn--sm" id="btn-refresh" title="Refresh">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                        <button class="btn btn--primary btn--sm" id="btn-create">
                            + Create Token
                        </button>
                    </div>
                </div>
                <div id="error-container"></div>
                <div id="create-form-container"></div>
                <div id="list-container"></div>
                <div id="detail-container"></div>
            </div>
        `;

        // Wire buttons
        this.shadowRoot.querySelector('#btn-refresh').addEventListener('click', () => this.loadTokens());
        this.shadowRoot.querySelector('#btn-create').addEventListener('click', () => {
            this._showCreateForm = !this._showCreateForm;
            this._renderCreateForm();
        });
    }

    // --- Render: Error ------------------------------------------------------

    _renderError() {
        const el = this.shadowRoot.querySelector('#error-container');
        if (!el) return;
        if (!this._error) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `
            <div class="error-bar">
                <span>${this._escapeHtml(this._error)}</span>
                <button class="btn btn--ghost btn--xs" id="btn-dismiss-error">Dismiss</button>
            </div>
        `;
        el.querySelector('#btn-dismiss-error').addEventListener('click', () => {
            this._error = null;
            this._renderError();
        });
    }

    // --- Render: Create Form ------------------------------------------------

    _renderCreateForm() {
        const el = this.shadowRoot.querySelector('#create-form-container');
        if (!el) return;
        if (!this._showCreateForm) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `
            <form class="create-form" id="create-form">
                <div class="create-form__title">Create New Token</div>
                <div class="create-form__fields">
                    <div class="field">
                        <label for="input-name">Token Name</label>
                        <input id="input-name" type="text" placeholder="e.g. community-x" required
                               ${this._creating ? 'disabled' : ''}>
                    </div>
                    <div class="field">
                        <label for="input-limit">Usage Limit</label>
                        <input id="input-limit" type="number" value="50" min="0"
                               ${this._creating ? 'disabled' : ''}>
                    </div>
                    <div class="field">
                        <label for="input-created-by">Created By</label>
                        <input id="input-created-by" type="text" placeholder="admin"
                               ${this._creating ? 'disabled' : ''}>
                    </div>
                </div>
                <div class="create-form__actions">
                    <button type="button" class="btn btn--ghost btn--sm" id="btn-cancel-create"
                            ${this._creating ? 'disabled' : ''}>Cancel</button>
                    <button type="submit" class="btn btn--primary btn--sm"
                            ${this._creating ? 'disabled' : ''}>
                        ${this._creating ? '<span class="spinner"></span> Creating...' : 'Create'}
                    </button>
                </div>
            </form>
        `;

        const form = el.querySelector('#create-form');
        form.addEventListener('submit', (e) => this._handleCreate(e));
        el.querySelector('#btn-cancel-create').addEventListener('click', () => {
            this._showCreateForm = false;
            this._renderCreateForm();
        });
    }

    // --- Render: Token List -------------------------------------------------

    _renderList() {
        const el = this.shadowRoot.querySelector('#list-container');
        if (!el) return;

        if (this._loading && this._tokens.length === 0) {
            el.innerHTML = `
                <div class="loading">
                    <span class="spinner"></span>
                    <span>Loading tokens...</span>
                </div>
            `;
            return;
        }

        if (!this._loading && this._tokens.length === 0 && !this._error) {
            el.innerHTML = `
                <div class="empty">
                    <div class="empty__text">No tokens created yet</div>
                    <div class="empty__hint">Create a token to get started</div>
                </div>
            `;
            return;
        }

        const rows = this._tokens.map(t => this._renderRow(t)).join('');

        el.innerHTML = `
            <table class="token-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Usage</th>
                        <th>Created By</th>
                        <th class="col-actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            ${this._loading ? '<div class="loading loading--inline"><span class="spinner"></span></div>' : ''}
        `;

        this._renderError();

        // Wire row clicks
        el.querySelectorAll('.token-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Ignore clicks on buttons
                if (e.target.closest('button')) return;
                this._handleRowClick(row.dataset.token);
            });
        });

        // Wire revoke buttons
        el.querySelectorAll('.btn-revoke').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleRevoke(btn.dataset.token);
            });
        });
    }

    _renderRow(token) {
        const name       = token.token_name || '';
        const status     = token.status     || 'unknown';
        const usageCount = token.usage_count ?? 0;
        const usageLimit = token.usage_limit ?? 0;
        const createdBy  = token.created_by  || '-';
        const isSelected = this._selectedToken === name;
        const isRevoking = this._revoking === name;
        const isActive   = status === 'active';

        const usageText = usageLimit > 0
            ? `${usageCount} / ${usageLimit}`
            : `${usageCount} (unlimited)`;

        const usagePct = usageLimit > 0
            ? Math.min(100, Math.round((usageCount / usageLimit) * 100))
            : 0;

        return `
            <tr class="token-row ${isSelected ? 'token-row--selected' : ''}" data-token="${this._escapeAttr(name)}">
                <td class="col-name">
                    <span class="token-name">${this._escapeHtml(name)}</span>
                </td>
                <td>
                    <span class="status-badge status-badge--${status}">${status}</span>
                </td>
                <td class="col-usage">
                    <span class="usage-text">${usageText}</span>
                    ${usageLimit > 0 ? `
                        <div class="usage-bar">
                            <div class="usage-bar__fill usage-bar__fill--${status}" style="width: ${usagePct}%"></div>
                        </div>
                    ` : ''}
                </td>
                <td class="col-created-by">${this._escapeHtml(createdBy)}</td>
                <td class="col-actions">
                    ${isActive ? `
                        <button class="btn btn--danger btn--xs btn-revoke" data-token="${this._escapeAttr(name)}">
                            ${isRevoking ? 'Confirm Revoke?' : 'Revoke'}
                        </button>
                    ` : ''}
                </td>
            </tr>
            ${isSelected ? `
                <tr class="detail-row">
                    <td colspan="5" id="inline-detail">
                        ${this._renderInlineDetail()}
                    </td>
                </tr>
            ` : ''}
        `;
    }

    // --- Render: Token Detail (inline) --------------------------------------

    _renderInlineDetail() {
        if (!this._tokenDetail) {
            return '<div class="loading loading--sm"><span class="spinner"></span> Loading detail...</div>';
        }
        if (this._tokenDetail.error) {
            return `<div class="error-bar">${this._escapeHtml(this._tokenDetail.error)}</div>`;
        }

        const d = this._tokenDetail;
        const metaEntries = d.metadata && typeof d.metadata === 'object'
            ? Object.entries(d.metadata)
            : [];

        return `
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Token Name</span>
                    <span class="detail-value detail-value--mono">${this._escapeHtml(d.token_name || '')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <span class="status-badge status-badge--${d.status || 'unknown'}">${d.status || 'unknown'}</span>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Usage Count</span>
                    <span class="detail-value">${d.usage_count ?? 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Usage Limit</span>
                    <span class="detail-value">${(d.usage_limit ?? 0) > 0 ? d.usage_limit : 'Unlimited'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created By</span>
                    <span class="detail-value">${this._escapeHtml(d.created_by || '-')}</span>
                </div>
                ${metaEntries.length > 0 ? `
                    <div class="detail-item detail-item--full">
                        <span class="detail-label">Metadata</span>
                        <pre class="detail-value detail-value--mono detail-value--pre">${this._escapeHtml(JSON.stringify(d.metadata, null, 2))}</pre>
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderDetail() {
        const el = this.shadowRoot.querySelector('#inline-detail');
        if (el) {
            el.innerHTML = this._renderInlineDetail();
        }
    }

    // --- Helpers -------------------------------------------------------------

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    _escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
                white-space: nowrap;
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

            .btn--primary {
                background: var(--admin-primary);
                color: #fff;
            }

            .btn--primary:hover:not(:disabled) {
                background: var(--admin-primary-hover);
            }

            .btn--ghost {
                background: transparent;
                color: var(--admin-text-secondary);
            }

            .btn--ghost:hover:not(:disabled) {
                background: var(--admin-surface-hover);
                color: var(--admin-text);
            }

            .btn--danger {
                background: var(--admin-error-bg);
                color: var(--admin-error);
                border: 1px solid rgba(248, 113, 113, 0.2);
            }

            .btn--danger:hover:not(:disabled) {
                background: var(--admin-error);
                color: #fff;
            }

            /* --- Loading & Empty --- */
            .loading {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 2rem;
                justify-content: center;
                color: var(--admin-text-secondary);
                font-size: var(--admin-font-size-sm);
            }

            .loading--inline {
                padding: 0.5rem;
            }

            .loading--sm {
                padding: 1rem;
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

            .empty {
                text-align: center;
                padding: 3rem 2rem;
            }

            .empty__text {
                color: var(--admin-text-secondary);
                font-size: var(--admin-font-size-base);
                margin-bottom: 0.25rem;
            }

            .empty__hint {
                color: var(--admin-text-muted);
                font-size: var(--admin-font-size-sm);
            }

            /* --- Error Bar --- */
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

            /* --- Create Form --- */
            .create-form {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                padding: 1.25rem;
                margin-bottom: 1.25rem;
            }

            .create-form__title {
                font-size: var(--admin-font-size-base);
                font-weight: 600;
                color: var(--admin-text);
                margin-bottom: 1rem;
            }

            .create-form__fields {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 1rem;
                margin-bottom: 1rem;
            }

            .field label {
                display: block;
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                color: var(--admin-text-secondary);
                margin-bottom: 0.25rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .field input {
                width: 100%;
                padding: 0.5rem 0.625rem;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font);
                color: var(--admin-text);
                background: var(--admin-bg);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                transition: border-color var(--admin-transition);
            }

            .field input:focus {
                outline: none;
                border-color: var(--admin-primary);
                box-shadow: 0 0 0 2px var(--admin-primary-bg);
            }

            .field input:disabled {
                opacity: 0.5;
            }

            .create-form__actions {
                display: flex;
                justify-content: flex-end;
                gap: 0.5rem;
            }

            /* --- Token Table --- */
            .token-table {
                width: 100%;
                border-collapse: collapse;
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                overflow: hidden;
            }

            .token-table thead th {
                text-align: left;
                padding: 0.625rem 1rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--admin-text-muted);
                background: var(--admin-surface-raised);
                border-bottom: 1px solid var(--admin-border);
            }

            .token-table tbody td {
                padding: 0.625rem 1rem;
                font-size: var(--admin-font-size-sm);
                border-bottom: 1px solid var(--admin-border-subtle);
                vertical-align: middle;
            }

            .token-row {
                cursor: pointer;
                transition: background var(--admin-transition);
            }

            .token-row:hover {
                background: var(--admin-surface-hover);
            }

            .token-row--selected {
                background: var(--admin-primary-bg);
            }

            .token-name {
                font-family: var(--admin-font-mono);
                font-weight: 500;
                color: var(--admin-text);
            }

            .col-actions {
                text-align: right;
                width: 120px;
            }

            .col-usage {
                min-width: 140px;
            }

            /* --- Status Badge --- */
            .status-badge {
                display: inline-block;
                padding: 0.125rem 0.5rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .status-badge--active {
                background: var(--admin-success-bg);
                color: var(--admin-success);
            }

            .status-badge--revoked {
                background: var(--admin-error-bg);
                color: var(--admin-error);
            }

            .status-badge--exhausted {
                background: var(--admin-warning-bg);
                color: var(--admin-warning);
            }

            .status-badge--expired {
                background: rgba(139, 143, 167, 0.1);
                color: var(--admin-text-muted);
            }

            .status-badge--unknown {
                background: rgba(139, 143, 167, 0.1);
                color: var(--admin-text-muted);
            }

            /* --- Usage Bar --- */
            .usage-text {
                font-family: var(--admin-font-mono);
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-secondary);
            }

            .usage-bar {
                height: 3px;
                background: var(--admin-border);
                border-radius: 2px;
                margin-top: 0.25rem;
                overflow: hidden;
            }

            .usage-bar__fill {
                height: 100%;
                border-radius: 2px;
                transition: width 300ms ease;
            }

            .usage-bar__fill--active {
                background: var(--admin-success);
            }

            .usage-bar__fill--exhausted {
                background: var(--admin-warning);
            }

            .usage-bar__fill--revoked {
                background: var(--admin-error);
            }

            /* --- Detail Row --- */
            .detail-row td {
                padding: 0 !important;
                background: var(--admin-surface-raised);
            }

            .detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 1rem;
                padding: 1.25rem;
            }

            .detail-item {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
            }

            .detail-item--full {
                grid-column: 1 / -1;
            }

            .detail-label {
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: var(--admin-text-muted);
            }

            .detail-value {
                font-size: var(--admin-font-size-sm);
                color: var(--admin-text);
            }

            .detail-value--mono {
                font-family: var(--admin-font-mono);
            }

            .detail-value--pre {
                background: var(--admin-bg);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                padding: 0.5rem 0.75rem;
                font-size: var(--admin-font-size-xs);
                overflow-x: auto;
                white-space: pre;
            }

            /* --- Responsive --- */
            @media (max-width: 768px) {
                .create-form__fields {
                    grid-template-columns: 1fr;
                }

                .col-created-by {
                    display: none;
                }

                .col-actions {
                    width: auto;
                }

                .detail-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
    }
}

customElements.define('token-manager', TokenManager);
