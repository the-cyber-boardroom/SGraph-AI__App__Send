/* =============================================================================
   SGraph Send Admin Console — Key Transparency Log
   v0.1.3 — View the append-only transparency log for key operations

   Fetches GET /keys/log and displays the hash-chained log entries.
   Events emitted: log-loaded
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;
    const msg = () => window.sgraphAdmin.messages;

    class KeyLog extends HTMLElement {

        static get appId()    { return 'key-log'; }
        static get navLabel() { return 'Log'; }
        static get navIcon()  { return '\uD83D\uDCDC'; }

        constructor() {
            super();
            this._entries = [];
            this._head    = null;
            this._loading = true;
            this._boundHandlers = {};
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() { this.cleanup(); }

        onActivated() {
            this._loadLog();
            this._setupEvents();
        }

        onDeactivated() { this.cleanup(); }

        _setupEvents() {
            this._boundHandlers.onPublished = () => this._loadLog();
            this._boundHandlers.onUnpublished = () => this._loadLog();
            window.sgraphAdmin.events.on('key-published', this._boundHandlers.onPublished);
            window.sgraphAdmin.events.on('key-unpublished', this._boundHandlers.onUnpublished);
        }

        cleanup() {
            if (this._boundHandlers.onPublished) window.sgraphAdmin.events.off('key-published', this._boundHandlers.onPublished);
            if (this._boundHandlers.onUnpublished) window.sgraphAdmin.events.off('key-unpublished', this._boundHandlers.onUnpublished);
        }

        async _loadLog() {
            this._loading = true;
            this._renderContent();
            try {
                const result = await adminAPI.getKeyLog();
                this._entries = result.entries || [];
                this._head    = result.head    || null;
            } catch (err) {
                msg().error(`Failed to load log: ${err.message}`);
                this._entries = [];
            }
            this._loading = false;
            this._renderContent();

            if (window.sgraphAdmin?.events) {
                window.sgraphAdmin.events.emit('log-loaded', { count: this._entries.length });
            }
        }

        _verifyChain() {
            let valid = true;
            for (let i = 1; i < this._entries.length; i++) {
                if (this._entries[i].prev_hash !== this._entries[i - 1].entry_hash) {
                    valid = false;
                    break;
                }
            }
            return valid;
        }

        render() {
            this.innerHTML = `
                <style>
                    ${pki().PKI_SHARED_STYLES}
                    .kl-table       { width: 100%; border-collapse: collapse; font-size: var(--admin-font-size-xs, 0.75rem); }
                    .kl-table th    { text-align: left; padding: 0.375rem 0.5rem; color: var(--admin-text-secondary, #8b8fa7); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid var(--admin-border, #2e3347); }
                    .kl-table td    { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); color: var(--admin-text, #e4e6ef); }
                    .kl-table code  { font-family: var(--admin-font-mono, monospace); color: var(--admin-text-muted, #5e6280); }
                    .kl-action--publish   { color: var(--admin-success, #34d399); }
                    .kl-action--unpublish { color: var(--admin-warning, #fbbf24); }
                    .kl-chain       { padding: 0.5rem 0.75rem; border-radius: var(--admin-radius, 6px); font-size: var(--admin-font-size-xs, 0.75rem); margin-bottom: 0.75rem; }
                    .kl-chain--ok   { background: var(--admin-success-bg, rgba(52,211,153,0.08)); color: var(--admin-success, #34d399); border: 1px solid rgba(52,211,153,0.2); }
                    .kl-chain--fail { background: var(--admin-error-bg, rgba(248,113,113,0.08)); color: var(--admin-error, #f87171); border: 1px solid rgba(248,113,113,0.2); }
                    .kl-head        { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); }
                </style>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            if (this._loading) { el.innerHTML = '<div class="pk-loading"><span class="pk-spinner"></span> Loading log...</div>'; return; }

            if (this._entries.length === 0) {
                el.innerHTML = `
                    <div class="pk-section">
                        <div class="pk-section__header"><h3 class="pk-section__title">Transparency Log</h3></div>
                        <div class="pk-section__empty">No log entries yet — publish a key to create the first entry.</div>
                    </div>`;
                return;
            }

            const chainValid = this._verifyChain();
            const chainHtml  = chainValid
                ? '<div class="kl-chain kl-chain--ok">Hash chain verified — all entries are consistent</div>'
                : '<div class="kl-chain kl-chain--fail">Hash chain BROKEN — log may have been tampered</div>';

            const rows = [...this._entries].reverse().map(e => {
                const displayCode = e.code ? e.code.toUpperCase() : '-';
                const actionClass = `kl-action--${e.action}`;
                return `
                    <tr>
                        <td>${e.seq}</td>
                        <td><span class="${actionClass}">${pki().escapeHtml(e.action)}</span></td>
                        <td style="font-family: var(--admin-font-mono); letter-spacing: 0.06em;">${pki().escapeHtml(displayCode)}</td>
                        <td><code>${pki().escapeHtml(e.fingerprint || '-')}</code></td>
                        <td><code>${pki().escapeHtml(e.entry_hash || '-')}</code></td>
                        <td>${pki().formatDate(e.timestamp)}</td>
                    </tr>
                `;
            }).join('');

            const headInfo = this._head
                ? `<div class="kl-head">Head: seq=${this._head.seq}, hash=<code>${pki().escapeHtml(this._head.entry_hash)}</code></div>`
                : '';

            el.innerHTML = `
                <div class="pk-section">
                    <div class="pk-section__header">
                        <h3 class="pk-section__title">Transparency Log</h3>
                        <button class="pk-btn pk-btn--ghost pk-btn--xs" id="kl-btn-refresh">Refresh</button>
                    </div>
                    ${chainHtml}
                    ${headInfo}
                    <table class="kl-table">
                        <thead>
                            <tr><th>#</th><th>Action</th><th>Code</th><th>Fingerprint</th><th>Hash</th><th>Time</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;

            this.querySelector('#kl-btn-refresh')?.addEventListener('click', () => this._loadLog());
        }
    }

    customElements.define('key-log', KeyLog);
})();
