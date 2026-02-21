/* =============================================================================
   SGraph Send Admin Console — Key Registry Browser
   v0.1.3 — Browse all published keys in the registry

   Fetches GET /keys/list from the backend and displays a card for each
   published key. Supports unpublish action.
   Events emitted: key-unpublished
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;
    const msg = () => window.sgraphAdmin.messages;

    class KeyRegistry extends HTMLElement {

        static get appId()    { return 'key-registry'; }
        static get navLabel() { return 'Browse'; }
        static get navIcon()  { return '\uD83D\uDCC2'; }

        constructor() {
            super();
            this._keys    = [];
            this._loading = true;
            this._boundHandlers = {};
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() { this.cleanup(); }

        onActivated() {
            this._loadKeys();
            this._setupEvents();
        }

        onDeactivated() { this.cleanup(); }

        _setupEvents() {
            this._boundHandlers.onPublished = () => this._loadKeys();
            window.sgraphAdmin.events.on('key-published', this._boundHandlers.onPublished);
        }

        cleanup() {
            if (this._boundHandlers.onPublished) window.sgraphAdmin.events.off('key-published', this._boundHandlers.onPublished);
        }

        async _loadKeys() {
            this._loading = true;
            this._renderContent();
            try {
                const result = await adminAPI.listKeys();
                this._keys = result.keys || [];
            } catch (err) {
                msg().error(`Failed to load registry: ${err.message}`);
                this._keys = [];
            }
            this._loading = false;
            this._renderContent();
        }

        async _handleUnpublish(code) {
            try {
                await adminAPI.unpublishKey(code);
                const displayCode = code.toUpperCase();
                msg().success(`Key ${displayCode} unpublished`);
                // Reload first, then emit event (other components may also listen)
                await this._loadKeys();
                if (window.sgraphAdmin?.events) {
                    window.sgraphAdmin.events.emit('key-unpublished', { code });
                }
            } catch (err) {
                msg().error(`Unpublish failed: ${err.message}`);
            }
        }

        render() {
            this.innerHTML = `
                <style>
                    ${pki().PKI_SHARED_STYLES}
                    .kr-grid        { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }
                    .kr-card        { padding: 0.75rem; background: var(--admin-surface, #1a1d2e); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); }
                    .kr-card__code  { font-size: 1.125rem; font-weight: 700; font-family: var(--admin-font-mono, monospace); color: var(--admin-primary, #4f8ff7); letter-spacing: 0.08em; margin-bottom: 0.375rem; }
                    .kr-card__meta  { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); line-height: 1.6; margin-bottom: 0.5rem; }
                    .kr-card__actions { display: flex; gap: 0.375rem; }
                    .kr-count       { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); }
                </style>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            if (this._loading) { el.innerHTML = '<div class="pk-loading"><span class="pk-spinner"></span> Loading registry...</div>'; return; }

            const cards = this._keys.map(k => {
                const displayCode = k.code.toUpperCase();
                return `
                    <div class="kr-card" data-code="${k.code}">
                        <div class="kr-card__code">${pki().escapeHtml(displayCode)}</div>
                        <div class="kr-card__meta">
                            <div>Algorithm: ${pki().escapeHtml(k.algorithm || 'unknown')} ${k.key_size ? `(${k.key_size})` : ''}</div>
                            <div>Fingerprint: <code>${pki().escapeHtml(k.fingerprint || '—')}</code></div>
                            <div>Published: ${k.created ? pki().formatDate(k.created) : '—'}</div>
                            ${k.signing_key_pem ? '<div><span class="pk-badge pk-badge--secure">signing</span></div>' : ''}
                        </div>
                        <div class="kr-card__actions">
                            <button class="pk-btn pk-btn--danger pk-btn--xs kr-btn-unpublish" data-code="${k.code}">Unpublish</button>
                        </div>
                    </div>
                `;
            }).join('');

            el.innerHTML = `
                <div class="pk-section">
                    <div class="pk-section__header">
                        <h3 class="pk-section__title">Registry</h3>
                        <span class="kr-count">${this._keys.length} key${this._keys.length !== 1 ? 's' : ''} published</span>
                        <button class="pk-btn pk-btn--ghost pk-btn--xs" id="kr-btn-refresh">Refresh</button>
                    </div>
                    ${cards.length > 0
                        ? `<div class="kr-grid">${cards}</div>`
                        : '<div class="pk-section__empty">No keys published yet</div>'}
                </div>
            `;

            this.querySelector('#kr-btn-refresh')?.addEventListener('click', () => this._loadKeys());

            this.querySelectorAll('.kr-btn-unpublish').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleUnpublish(btn.dataset.code);
                });
            });
        }
    }

    customElements.define('key-registry', KeyRegistry);
})();
