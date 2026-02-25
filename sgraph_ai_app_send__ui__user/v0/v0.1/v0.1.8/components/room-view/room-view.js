/* =============================================================================
   SGraph Send — Room View Web Component
   v0.1.8 — Data room vault viewer (read-only for viewers, upload for editors)

   Reads session from sessionStorage ('sg_room_session') or validates
   session_token from URL hash.

   Reuses VaultAPI from v0.1.7 for vault operations, scoped to the room's
   vault_cache_key.

   States:
     loading   → validating session
     no-access → no valid session (redirect to join)
     ready     → session valid, show room vault contents
     error     → something went wrong

   Usage:
     <room-view></room-view>
   ============================================================================= */

class RoomView extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this._state         = 'loading';   // loading | no-access | ready | error
        this._session       = null;        // parsed session object
        this._files         = [];          // vault file list
        this._error         = null;
        this._downloading   = null;        // file guid being downloaded
    }

    connectedCallback() {
        this.render();
        this._initSession();
    }

    // --- Session Initialization ---------------------------------------------

    async _initSession() {
        // 1. Try sessionStorage
        const stored = sessionStorage.getItem('sg_room_session');
        if (stored) {
            try {
                this._session = JSON.parse(stored);
                // Validate it's still alive
                const check = await JoinAPI.validateSession(this._session.session_token);
                if (check.valid) {
                    this._state = 'ready';
                    this.render();
                    await this._loadFiles();
                    return;
                }
            } catch (e) {
                // Fall through to no-access
            }
        }

        // 2. No valid session
        this._state = 'no-access';
        this.render();
    }

    // --- Load Room Files ----------------------------------------------------

    async _loadFiles() {
        if (!this._session) return;
        const vaultKey = this._session.vault_cache_key;
        if (!vaultKey) {
            this._files = [];
            this.render();
            return;
        }

        try {
            const result = await VaultAPI.listAll(vaultKey);
            if (result && result.items) {
                this._files = result.items.filter(i => i.type === 'file');
            } else if (result && result.files) {
                this._files = result.files;
            } else {
                this._files = [];
            }
        } catch (e) {
            this._error = `Failed to load files: ${e.message}`;
        }

        this.render();
    }

    // --- Download a File ----------------------------------------------------

    async _handleDownload(fileGuid) {
        if (!this._session || this._downloading) return;
        const vaultKey = this._session.vault_cache_key;

        this._downloading = fileGuid;
        this.render();

        try {
            const result = await VaultAPI.getFile(vaultKey, fileGuid);
            if (result && result.encrypted_data) {
                // File is encrypted — user would need the room encryption key
                // For now, show the raw encrypted data info
                const size = result.encrypted_data.length;
                alert(`Encrypted file retrieved (${(size / 1024).toFixed(1)} KB).\n\nDecryption requires the room encryption key.`);
            } else {
                alert('File data not available');
            }
        } catch (e) {
            this._error = `Download failed: ${e.message}`;
        }

        this._downloading = null;
        this.render();
    }

    // --- Render --------------------------------------------------------------

    render() {
        let content;
        switch (this._state) {
            case 'loading':   content = this._renderLoading();   break;
            case 'no-access': content = this._renderNoAccess();  break;
            case 'ready':     content = this._renderReady();     break;
            case 'error':     content = this._renderError();     break;
            default:          content = this._renderLoading();
        }

        this.shadowRoot.innerHTML = `
            <style>${RoomView.styles}</style>
            <div class="room-view">
                ${content}
            </div>
        `;

        this._wireEvents();
    }

    _renderLoading() {
        return `
            <div class="center-state">
                <span class="spinner spinner--lg"></span>
                <p>Verifying access...</p>
            </div>
        `;
    }

    _renderNoAccess() {
        return `
            <div class="center-state">
                <div class="lock-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                </div>
                <h3>Session Expired or Missing</h3>
                <p>You need a valid invite code to access this room.</p>
                <a href="join.html" class="btn btn--primary">Join with Invite Code</a>
            </div>
        `;
    }

    _renderReady() {
        const s = this._session;
        const fileRows = this._files.map(f => this._renderFileRow(f)).join('');

        return `
            <div class="room-header">
                <div class="room-title-row">
                    <h2 class="room-name">${this._esc(s.room_name || 'Data Room')}</h2>
                    <span class="perm-badge perm-badge--${s.permission || 'viewer'}">${this._esc(s.permission || 'viewer')}</span>
                </div>
                <div class="room-meta">
                    <span class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        ${this._esc(s.user_id)}
                    </span>
                    <span class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Session expires ${s.expires ? new Date(s.expires).toLocaleString() : 'in 24h'}
                    </span>
                </div>
            </div>

            ${this._error ? `<div class="error-bar">${this._esc(this._error)}</div>` : ''}

            <div class="vault-section">
                <div class="section-header">
                    <h3 class="section-title">Files</h3>
                    <span class="file-count">${this._files.length} file${this._files.length !== 1 ? 's' : ''}</span>
                </div>

                ${this._files.length === 0 ? `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                            <polyline points="13 2 13 9 20 9"/>
                        </svg>
                        <p>No files in this room yet</p>
                        <p class="empty-hint">Files uploaded to this room will appear here</p>
                    </div>
                ` : `
                    <div class="file-list">
                        ${fileRows}
                    </div>
                `}
            </div>

            <div class="room-footer">
                <button class="btn btn--ghost btn--sm" id="btn-leave">Leave Room</button>
                <button class="btn btn--ghost btn--sm" id="btn-refresh">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                    </svg>
                    Refresh
                </button>
            </div>
        `;
    }

    _renderFileRow(file) {
        const guid   = file.guid   || file.file_guid || '';
        const isDown = this._downloading === guid;

        return `
            <div class="file-row">
                <div class="file-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                    </svg>
                </div>
                <div class="file-info">
                    <span class="file-guid">${this._esc(guid)}</span>
                    <span class="file-meta">Encrypted</span>
                </div>
                <button class="btn btn--ghost btn--xs btn-download" data-guid="${this._attr(guid)}"
                        ${isDown ? 'disabled' : ''}>
                    ${isDown ? '<span class="spinner"></span>' : 'Download'}
                </button>
            </div>
        `;
    }

    _renderError() {
        return `
            <div class="center-state">
                <div class="error-icon">!</div>
                <h3>Something went wrong</h3>
                <p>${this._esc(this._error || 'Unknown error')}</p>
                <button class="btn btn--primary" id="btn-retry">Try Again</button>
            </div>
        `;
    }

    // --- Event Wiring --------------------------------------------------------

    _wireEvents() {
        this.shadowRoot.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => this._handleDownload(btn.dataset.guid));
        });

        const btnLeave  = this.shadowRoot.querySelector('#btn-leave');
        const btnRefresh = this.shadowRoot.querySelector('#btn-refresh');
        const btnRetry  = this.shadowRoot.querySelector('#btn-retry');

        if (btnLeave) btnLeave.addEventListener('click', () => {
            sessionStorage.removeItem('sg_room_session');
            window.location.href = 'join.html';
        });
        if (btnRefresh) btnRefresh.addEventListener('click', () => this._loadFiles());
        if (btnRetry)   btnRetry.addEventListener('click', () => {
            this._state = 'loading';
            this.render();
            this._initSession();
        });
    }

    // --- Helpers -------------------------------------------------------------

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    _attr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // --- Styles --------------------------------------------------------------

    static get styles() {
        return `
            :host { display: block; }

            .room-view {
                max-width: 720px;
                margin: 0 auto;
            }

            /* --- Center States --- */

            .center-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                padding: var(--space-12, 48px) var(--space-4, 16px);
                color: var(--color-text-secondary, #8892A0);
                gap: var(--space-3, 12px);
            }

            .center-state h3 {
                color: var(--color-text, #E0E0E0);
                margin: 0;
                font-family: var(--font-display);
            }

            .center-state p {
                margin: 0;
                font-size: var(--text-small, 0.8rem);
            }

            .lock-icon {
                width: 64px;
                height: 64px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background: rgba(233, 69, 96, 0.1);
                color: var(--color-error, #E94560);
            }

            .lock-icon svg { width: 32px; height: 32px; }

            /* --- Room Header --- */

            .room-header {
                margin-bottom: var(--space-6, 24px);
                padding-bottom: var(--space-4, 16px);
                border-bottom: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            }

            .room-title-row {
                display: flex;
                align-items: center;
                gap: var(--space-3, 12px);
                margin-bottom: var(--space-2, 8px);
            }

            .room-name {
                font-family: var(--font-display);
                font-size: var(--text-h2, 1.6rem);
                font-weight: var(--weight-semibold, 600);
                color: var(--color-text, #E0E0E0);
                margin: 0;
            }

            .room-meta {
                display: flex;
                gap: var(--space-4, 16px);
                flex-wrap: wrap;
            }

            .meta-item {
                display: inline-flex;
                align-items: center;
                gap: var(--space-1, 4px);
                font-size: var(--text-small, 0.8rem);
                color: var(--color-text-secondary, #8892A0);
            }

            /* --- Vault Section --- */

            .vault-section {
                margin-bottom: var(--space-6, 24px);
            }

            .section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: var(--space-4, 16px);
            }

            .section-title {
                font-size: var(--text-h3, 1.25rem);
                font-weight: var(--weight-semibold, 600);
                color: var(--color-text, #E0E0E0);
                margin: 0;
            }

            .file-count {
                font-size: var(--text-small, 0.8rem);
                color: var(--color-text-secondary, #8892A0);
            }

            /* --- Empty State --- */

            .empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: var(--space-8, 32px);
                color: var(--color-text-secondary, #8892A0);
                border: 1px dashed var(--color-border, rgba(78, 205, 196, 0.15));
                border-radius: var(--radius-md, 12px);
                text-align: center;
            }

            .empty-state p { margin: var(--space-2, 8px) 0 0 0; }

            .empty-hint {
                font-size: var(--text-micro, 0.625rem) !important;
                opacity: 0.7;
            }

            /* --- File List --- */

            .file-list {
                display: flex;
                flex-direction: column;
                gap: 1px;
                background: var(--color-border, rgba(78, 205, 196, 0.15));
                border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                border-radius: var(--radius, 8px);
                overflow: hidden;
            }

            .file-row {
                display: flex;
                align-items: center;
                gap: var(--space-3, 12px);
                padding: var(--space-3, 12px) var(--space-4, 16px);
                background: var(--bg-surface, #1E2A4A);
                transition: background var(--transition);
            }

            .file-row:hover {
                background: rgba(78, 205, 196, 0.05);
            }

            .file-icon {
                flex-shrink: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--accent, #4ECDC4);
                opacity: 0.7;
            }

            .file-icon svg { width: 20px; height: 20px; }

            .file-info {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .file-guid {
                font-family: var(--font-mono, monospace);
                font-size: var(--text-small, 0.8rem);
                color: var(--color-text, #E0E0E0);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .file-meta {
                font-size: var(--text-micro, 0.625rem);
                color: var(--color-text-secondary, #8892A0);
            }

            /* --- Room Footer --- */

            .room-footer {
                display: flex;
                justify-content: space-between;
                padding-top: var(--space-4, 16px);
                border-top: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            }

            /* --- Error Bar --- */

            .error-bar {
                padding: var(--space-3, 12px) var(--space-4, 16px);
                margin-bottom: var(--space-4, 16px);
                background: rgba(233, 69, 96, 0.1);
                border: 1px solid rgba(233, 69, 96, 0.25);
                border-radius: var(--radius-sm, 6px);
                color: var(--color-error, #E94560);
                font-size: var(--text-small, 0.8rem);
            }

            /* --- Permission Badge --- */

            .perm-badge {
                display: inline-block;
                padding: var(--space-1, 4px) var(--space-3, 12px);
                font-size: var(--text-small, 0.8rem);
                font-weight: var(--weight-semibold, 600);
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .perm-badge--viewer {
                background: rgba(78, 205, 196, 0.15);
                color: var(--accent, #4ECDC4);
            }

            .perm-badge--editor {
                background: rgba(224, 124, 79, 0.15);
                color: var(--color-warning, #E07C4F);
            }

            .perm-badge--owner {
                background: rgba(78, 205, 196, 0.25);
                color: var(--accent, #4ECDC4);
            }

            /* --- Buttons --- */

            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: var(--space-2, 8px);
                border: none;
                border-radius: var(--radius, 8px);
                cursor: pointer;
                font-family: var(--font-body);
                font-weight: var(--weight-medium, 500);
                transition: background var(--transition), color var(--transition);
                white-space: nowrap;
                text-decoration: none;
            }

            .btn:disabled { opacity: 0.5; cursor: not-allowed; }

            .btn--primary {
                background: var(--accent, #4ECDC4);
                color: var(--bg-primary, #1A1A2E);
                padding: var(--space-3, 12px) var(--space-6, 24px);
                font-weight: var(--weight-semibold, 600);
            }

            .btn--primary:hover:not(:disabled) {
                background: var(--accent-hover, #3DBDB4);
            }

            .btn--ghost {
                background: transparent;
                color: var(--color-text-secondary, #8892A0);
                padding: var(--space-2, 8px) var(--space-3, 12px);
            }

            .btn--ghost:hover:not(:disabled) {
                color: var(--color-text, #E0E0E0);
                background: rgba(255,255,255,0.05);
            }

            .btn--sm {
                font-size: var(--text-small, 0.8rem);
            }

            .btn--xs {
                font-size: var(--text-micro, 0.625rem);
                padding: var(--space-1, 4px) var(--space-2, 8px);
            }

            /* --- Spinner --- */

            .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255,255,255,0.2);
                border-top-color: currentColor;
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
            }

            .spinner--lg {
                width: 32px;
                height: 32px;
                border-width: 3px;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* --- Responsive --- */

            @media (max-width: 600px) {
                .room-meta { flex-direction: column; gap: var(--space-2, 8px); }
                .file-row { padding: var(--space-2, 8px) var(--space-3, 12px); }
            }
        `;
    }
}

customElements.define('room-view', RoomView);
