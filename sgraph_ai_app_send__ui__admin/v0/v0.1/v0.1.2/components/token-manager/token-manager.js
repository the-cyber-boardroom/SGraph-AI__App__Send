/* =============================================================================
   SGraph Send Admin Console — Token Manager Web Component
   v0.1.3 — IFD overlay: token management improvements

   Changes from v0.1.2:
     - Fixed: spinner no longer persists after successful token create
     - Added: sortable table columns (click header to sort)
     - Added: search/filter tokens by name
     - Added: edit usage limit (inline in detail view)
     - Added: reactivate revoked/exhausted tokens
     - Added: token count badge in header
     - Added: copy token name to clipboard

   Token lifecycle management:
     - Token list table (name, status, usage, created_by) — sortable
     - Create token form (name, usage_limit, created_by)
     - Token detail view (click to expand, edit limit)
     - Revoke / Reactivate buttons

   Usage:
     <token-manager></token-manager>

   API calls:
     GET  /tokens/list-details              — list all tokens with details
     POST /tokens/create                    — create a new token
     GET  /tokens/lookup/{name}             — token detail
     POST /tokens/revoke/{name}             — revoke a token
     POST /tokens/update-limit/{name}       — update usage limit
     POST /tokens/reactivate/{name}         — reactivate a token
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
        this._sortColumn     = 'name';     // 'name', 'status', 'usage', 'created_by'
        this._sortAsc        = true;
        this._filterText     = '';
        this._editingLimit   = false;      // true when usage limit input is shown in detail
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
        this._editingLimit = false;
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
            this._renderCreateForm();
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

    // --- Reactivate Token ---------------------------------------------------

    async _handleReactivate(tokenName) {
        try {
            await adminAPI.reactivateToken(tokenName);
            await this.loadTokens();
        } catch (err) {
            this._error = `Reactivate failed: ${err.message}`;
            this._renderList();
        }
    }

    // --- Update Usage Limit -------------------------------------------------

    async _handleUpdateLimit(tokenName, newLimit) {
        try {
            await adminAPI.updateTokenLimit(tokenName, newLimit);
            this._editingLimit = false;
            await this._loadTokenDetail(tokenName);
            await this.loadTokens();
        } catch (err) {
            this._error = `Update limit failed: ${err.message}`;
            this._renderError();
        }
    }

    // --- Sorting ------------------------------------------------------------

    _handleSort(column) {
        if (this._sortColumn === column) {
            this._sortAsc = !this._sortAsc;
        } else {
            this._sortColumn = column;
            this._sortAsc    = true;
        }
        this._renderList();
    }

    _getSortedTokens() {
        const tokens = [...this._tokens];
        const col    = this._sortColumn;
        const dir    = this._sortAsc ? 1 : -1;

        tokens.sort((a, b) => {
            let va, vb;
            switch (col) {
                case 'name':
                    va = (a.token_name || '').toLowerCase();
                    vb = (b.token_name || '').toLowerCase();
                    return va < vb ? -dir : va > vb ? dir : 0;
                case 'status':
                    va = (a.status || '').toLowerCase();
                    vb = (b.status || '').toLowerCase();
                    return va < vb ? -dir : va > vb ? dir : 0;
                case 'usage':
                    va = a.usage_count ?? 0;
                    vb = b.usage_count ?? 0;
                    return (va - vb) * dir;
                case 'created_by':
                    va = (a.created_by || '').toLowerCase();
                    vb = (b.created_by || '').toLowerCase();
                    return va < vb ? -dir : va > vb ? dir : 0;
                default:
                    return 0;
            }
        });
        return tokens;
    }

    // --- Filtering ----------------------------------------------------------

    _getFilteredTokens(tokens) {
        if (!this._filterText) return tokens;
        const q = this._filterText.toLowerCase();
        return tokens.filter(t =>
            (t.token_name  || '').toLowerCase().includes(q) ||
            (t.status      || '').toLowerCase().includes(q) ||
            (t.created_by  || '').toLowerCase().includes(q)
        );
    }

    // --- Copy to Clipboard --------------------------------------------------

    async _handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            // Fallback for non-secure contexts
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
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
                    <div class="panel-header__left">
                        <h2 class="panel-header__title">Token Management</h2>
                        <span class="token-count" id="token-count"></span>
                    </div>
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
                <div id="filter-container"></div>
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

    // --- Render: Token Count ------------------------------------------------

    _renderTokenCount() {
        const el = this.shadowRoot.querySelector('#token-count');
        if (!el) return;
        if (this._tokens.length > 0) {
            const active = this._tokens.filter(t => t.status === 'active').length;
            el.textContent = `${this._tokens.length} total, ${active} active`;
        } else {
            el.textContent = '';
        }
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

    // --- Render: Filter Bar -------------------------------------------------

    _renderFilterBar() {
        const el = this.shadowRoot.querySelector('#filter-container');
        if (!el) return;
        if (this._tokens.length === 0) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `
            <div class="filter-bar">
                <svg class="filter-bar__icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
                </svg>
                <input class="filter-bar__input" id="filter-input" type="text"
                       placeholder="Filter tokens..." value="${this._escapeAttr(this._filterText)}">
                ${this._filterText ? '<button class="btn btn--ghost btn--xs" id="btn-clear-filter">Clear</button>' : ''}
            </div>
        `;
        const input = el.querySelector('#filter-input');
        input.addEventListener('input', (e) => {
            this._filterText = e.target.value;
            this._renderList(true);  // true = skip re-rendering filter bar
        });
        const clearBtn = el.querySelector('#btn-clear-filter');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this._filterText = '';
                this._renderFilterBar();
                this._renderList(true);
            });
        }
    }

    // --- Render: Token List -------------------------------------------------

    _renderList(skipFilter) {
        const el = this.shadowRoot.querySelector('#list-container');
        if (!el) return;

        // Update count badge
        this._renderTokenCount();

        // Render filter bar (unless called from filter input itself)
        if (!skipFilter) this._renderFilterBar();

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

        const sorted   = this._getSortedTokens();
        const filtered = this._getFilteredTokens(sorted);
        const rows     = filtered.map(t => this._renderRow(t)).join('');

        const sortIcon = (col) => {
            if (this._sortColumn !== col) return '<span class="sort-icon sort-icon--inactive">&#8597;</span>';
            return this._sortAsc
                ? '<span class="sort-icon">&#8593;</span>'
                : '<span class="sort-icon">&#8595;</span>';
        };

        el.innerHTML = `
            ${filtered.length === 0 && this._filterText ? `
                <div class="empty">
                    <div class="empty__text">No tokens match "${this._escapeHtml(this._filterText)}"</div>
                </div>
            ` : ''}
            ${filtered.length > 0 ? `
            <table class="token-table">
                <thead>
                    <tr>
                        <th class="sortable" data-col="name">Name ${sortIcon('name')}</th>
                        <th class="sortable" data-col="status">Status ${sortIcon('status')}</th>
                        <th class="sortable" data-col="usage">Usage ${sortIcon('usage')}</th>
                        <th class="sortable" data-col="created_by">Created By ${sortIcon('created_by')}</th>
                        <th class="col-actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            ` : ''}
            ${this._loading ? '<div class="loading loading--inline"><span class="spinner"></span></div>' : ''}
        `;

        this._renderError();

        // Wire sort headers
        el.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => this._handleSort(th.dataset.col));
        });

        // Wire row clicks
        el.querySelectorAll('.token-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Ignore clicks on buttons and inputs
                if (e.target.closest('button') || e.target.closest('input')) return;
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

        // Wire reactivate buttons
        el.querySelectorAll('.btn-reactivate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleReactivate(btn.dataset.token);
            });
        });

        // Wire copy buttons
        el.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleCopy(btn.dataset.value);
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
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
        const isInactive = status === 'revoked' || status === 'exhausted';

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
                    <button class="btn btn--ghost btn--xs btn-copy" data-value="${this._escapeAttr(name)}" title="Copy name">Copy</button>
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
                    ${isInactive ? `
                        <button class="btn btn--success btn--xs btn-reactivate" data-token="${this._escapeAttr(name)}">
                            Reactivate
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

        const limitDisplay = this._editingLimit
            ? `<div class="detail-edit-row">
                   <input type="number" id="input-edit-limit" class="detail-edit-input"
                          value="${(d.usage_limit ?? 0)}" min="0">
                   <button class="btn btn--primary btn--xs" id="btn-save-limit">Save</button>
                   <button class="btn btn--ghost btn--xs" id="btn-cancel-limit">Cancel</button>
               </div>`
            : `<span class="detail-value--editable" id="btn-edit-limit" title="Click to edit">
                   ${(d.usage_limit ?? 0) > 0 ? d.usage_limit : 'Unlimited'}
                   <svg class="edit-icon" viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                       <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                   </svg>
               </span>`;

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
                    ${limitDisplay}
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
            this._wireDetailEvents();
        }
    }

    _wireDetailEvents() {
        const el = this.shadowRoot.querySelector('#inline-detail');
        if (!el) return;

        // Wire "edit limit" click
        const editBtn = el.querySelector('#btn-edit-limit');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editingLimit = true;
                this._renderDetail();
            });
        }

        // Wire save/cancel for limit editing
        const saveBtn = el.querySelector('#btn-save-limit');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const input    = el.querySelector('#input-edit-limit');
                const newLimit = parseInt(input.value, 10);
                if (!isNaN(newLimit) && newLimit >= 0) {
                    this._handleUpdateLimit(this._selectedToken, newLimit);
                }
            });
        }
        const cancelBtn = el.querySelector('#btn-cancel-limit');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editingLimit = false;
                this._renderDetail();
            });
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

            .panel-header__left {
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .panel-header__title {
                font-size: var(--admin-font-size-xl);
                font-weight: 600;
                color: var(--admin-text);
                margin: 0;
            }

            .token-count {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                background: var(--admin-surface-raised);
                padding: 0.2rem 0.5rem;
                border-radius: 9999px;
                font-family: var(--admin-font-mono);
            }

            .token-count:empty {
                display: none;
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

            .btn--success {
                background: var(--admin-success-bg);
                color: var(--admin-success);
                border: 1px solid rgba(74, 222, 128, 0.2);
            }

            .btn--success:hover:not(:disabled) {
                background: var(--admin-success);
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

            /* --- Filter Bar --- */
            .filter-bar {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-bottom: 0.75rem;
                padding: 0.375rem 0.625rem;
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
            }

            .filter-bar__icon {
                color: var(--admin-text-muted);
                flex-shrink: 0;
            }

            .filter-bar__input {
                flex: 1;
                border: none;
                background: transparent;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font);
                color: var(--admin-text);
                outline: none;
                padding: 0.25rem 0;
            }

            .filter-bar__input::placeholder {
                color: var(--admin-text-muted);
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

            .token-table thead th.sortable {
                cursor: pointer;
                user-select: none;
            }

            .token-table thead th.sortable:hover {
                color: var(--admin-text);
            }

            .sort-icon {
                font-size: 0.75rem;
                margin-left: 0.25rem;
                color: var(--admin-primary);
            }

            .sort-icon--inactive {
                color: var(--admin-text-muted);
                opacity: 0.4;
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

            .col-name {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .col-name .btn-copy {
                opacity: 0;
                transition: opacity var(--admin-transition);
                font-size: 0.625rem;
            }

            .token-row:hover .btn-copy {
                opacity: 1;
            }

            .token-name {
                font-family: var(--admin-font-mono);
                font-weight: 500;
                color: var(--admin-text);
            }

            .col-actions {
                text-align: right;
                width: 140px;
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

            .detail-value--editable {
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 0.375rem;
                font-size: var(--admin-font-size-sm);
                color: var(--admin-text);
                padding: 0.125rem 0.25rem;
                border-radius: var(--admin-radius);
                transition: background var(--admin-transition);
            }

            .detail-value--editable:hover {
                background: var(--admin-surface-hover);
            }

            .edit-icon {
                color: var(--admin-text-muted);
                opacity: 0;
                transition: opacity var(--admin-transition);
            }

            .detail-value--editable:hover .edit-icon {
                opacity: 1;
            }

            .detail-edit-row {
                display: flex;
                align-items: center;
                gap: 0.375rem;
            }

            .detail-edit-input {
                width: 80px;
                padding: 0.25rem 0.5rem;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font-mono);
                color: var(--admin-text);
                background: var(--admin-bg);
                border: 1px solid var(--admin-primary);
                border-radius: var(--admin-radius);
                outline: none;
                box-shadow: 0 0 0 2px var(--admin-primary-bg);
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
