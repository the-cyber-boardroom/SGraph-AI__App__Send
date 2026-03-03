/* =============================================================================
   SGraph Workspace — API Logger (lightweight workspace-aware version)
   v0.1.0 — intercepts fetch() and logs requests
   ============================================================================= */

(function() {
    'use strict';

    if (customElements.get('api-logger')) return;

    class ApiLogger extends HTMLElement {
        constructor() {
            super();
            this._logs = [];
            this._maxLogs = 100;
        }

        connectedCallback() {
            this._patchFetch();
            this._render();
        }

        disconnectedCallback() { this._unpatchFetch(); }

        _patchFetch() {
            if (window._wsOriginalFetch) return;
            window._wsOriginalFetch = window.fetch;
            const self = this;

            window.fetch = async function(...args) {
                const url    = typeof args[0] === 'string' ? args[0] : args[0]?.url || '?';
                const method = args[1]?.method || 'GET';
                const start  = Date.now();
                try {
                    const resp = await window._wsOriginalFetch.apply(this, args);
                    self._addLog({ url, method, status: resp.status, duration: Date.now() - start });
                    return resp;
                } catch (err) {
                    self._addLog({ url, method, status: 'ERR', duration: Date.now() - start, error: err.message });
                    throw err;
                }
            };
        }

        _unpatchFetch() {
            if (window._wsOriginalFetch) {
                window.fetch = window._wsOriginalFetch;
                delete window._wsOriginalFetch;
            }
        }

        _addLog(entry) {
            entry.timestamp = Date.now();
            this._logs.push(entry);
            if (this._logs.length > this._maxLogs) this._logs.shift();
            this._render();
        }

        _render() {
            if (this._logs.length === 0) {
                this.innerHTML = `<div style="padding: 1rem; color: var(--ws-text-muted, #5a6478);
                    font-size: 0.75rem; text-align: center;">No API calls</div>`;
                return;
            }
            const statusColor = (s) => s >= 200 && s < 300 ? 'var(--ws-success, #4ECDC4)' :
                                       s >= 400 ? 'var(--ws-error, #E94560)' : 'var(--ws-warning, #fbbf24)';
            this.innerHTML = `<div style="padding: 0.5rem; font-size: 0.75rem; font-family: var(--ws-font-mono, monospace);">
                ${this._logs.slice(-50).reverse().map(l => {
                    const time = new Date(l.timestamp).toLocaleTimeString();
                    const color = typeof l.status === 'number' ? statusColor(l.status) : 'var(--ws-error, #E94560)';
                    const path = l.url.length > 60 ? '...' + l.url.slice(-57) : l.url;
                    return `<div style="padding: 0.25rem 0.375rem; border-bottom: 1px solid var(--ws-border-subtle, #222d4d);">
                        <span style="color: var(--ws-text-muted, #5a6478);">${time}</span>
                        <span style="color: ${color}; font-weight: 600;">${l.status}</span>
                        <span style="color: var(--ws-text-secondary, #8892A0);">${l.method}</span>
                        <span style="color: var(--ws-text, #F0F0F5);">${this._esc(path)}</span>
                        <span style="color: var(--ws-text-muted, #5a6478);">${l.duration}ms</span>
                    </div>`;
                }).join('')}
            </div>`;
        }

        _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    }

    customElements.define('api-logger', ApiLogger);
})();
