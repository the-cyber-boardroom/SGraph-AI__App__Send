/* =============================================================================
   SGraph Vault — API Logger (Debug)
   v0.1.3 — Adapted from Admin Console v0.1.3
   Records all fetch() calls with method colours, status borders,
   expandable request/response details
   ============================================================================= */

(function() {
    'use strict';

    const METHOD_COLORS = {
        GET    : '#4ECDC4',
        POST   : '#3b82f6',
        PUT    : '#f59e0b',
        PATCH  : '#8b5cf6',
        DELETE : '#E94560'
    };

    class VaultApiLogger extends HTMLElement {

        constructor() {
            super();
            this._entries      = [];
            this._statusFilter = '';
            this._textFilter   = '';
        }

        connectedCallback() {
            this.render();
            this._setupEventListeners();
            this._interceptFetch();
        }

        disconnectedCallback() {
            this._cleanup();
        }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="al-container">
                    <div class="al-header">
                        <input class="al-search" type="text" placeholder="Filter URLs..." />
                        <div class="al-filters">
                            <button class="al-filter-btn al-filter-btn--active" data-filter="">All</button>
                            <button class="al-filter-btn" data-filter="2xx">2xx</button>
                            <button class="al-filter-btn" data-filter="4xx">4xx</button>
                            <button class="al-filter-btn" data-filter="5xx">5xx</button>
                            <button class="al-filter-btn" data-filter="err">Err</button>
                        </div>
                        <button class="al-clear-btn">Clear</button>
                    </div>
                    <div class="al-list"></div>
                </div>
            `;

            this.querySelector('.al-search').addEventListener('input', (e) => {
                this._textFilter = e.target.value.toLowerCase();
                this._rerender();
            });

            this.querySelectorAll('.al-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._statusFilter = btn.dataset.filter;
                    this.querySelectorAll('.al-filter-btn').forEach(b =>
                        b.classList.toggle('al-filter-btn--active', b.dataset.filter === this._statusFilter));
                    this._rerender();
                });
            });

            this.querySelector('.al-clear-btn').addEventListener('click', () => {
                this._entries = [];
                this._rerender();
            });
        }

        _setupEventListeners() {
            this._onApiCall = (data) => this._addEntry(data);
            window.sgraphVault.events.on('api-call', this._onApiCall);
        }

        _cleanup() {
            if (this._onApiCall) {
                window.sgraphVault.events.off('api-call', this._onApiCall);
            }
            if (this._originalFetch) {
                window.fetch = this._originalFetch;
                this._originalFetch = null;
            }
        }

        _interceptFetch() {
            this._originalFetch = window.fetch;
            const self = this;

            window.fetch = async function(url, options) {
                const method = (options && options.method) || 'GET';
                const start  = performance.now();
                const urlStr = typeof url === 'string' ? url : url.url || String(url);
                const reqBody = options && options.body ? options.body : null;

                try {
                    const response = await self._originalFetch.apply(window, arguments);
                    const duration = Math.round(performance.now() - start);

                    let responseBody = null;
                    try { responseBody = await response.clone().json(); }
                    catch (_) { /* non-JSON */ }

                    window.sgraphVault.events.emit('api-call', {
                        method, url: urlStr, status: response.status,
                        duration, requestBody: reqBody, responseBody
                    });

                    return response;
                } catch (err) {
                    const duration = Math.round(performance.now() - start);
                    window.sgraphVault.events.emit('api-call', {
                        method, url: urlStr, status: 0, duration, error: err.message
                    });
                    throw err;
                }
            };
        }

        _addEntry(data) {
            const entry = {
                method: data.method || 'GET', url: data.url || '?',
                status: data.status || 0, duration: data.duration || 0,
                error: data.error || null, requestBody: data.requestBody || null,
                responseBody: data.responseBody || null, timestamp: new Date().toISOString()
            };
            this._entries.push(entry);
            if (this._entries.length > 200) this._entries.shift();
            if (!this._matchesFilter(entry)) return;
            this._renderEntry(entry);
        }

        _matchesFilter(entry) {
            if (this._statusFilter) {
                if (this._statusFilter === 'err') {
                    if (entry.status !== 0 && !entry.error) return false;
                } else {
                    const range = parseInt(this._statusFilter);
                    if (entry.status < range || entry.status >= range + 100) return false;
                }
            }
            if (this._textFilter) {
                if (!(entry.url + ' ' + entry.method).toLowerCase().includes(this._textFilter)) return false;
            }
            return true;
        }

        _renderEntry(entry) {
            const list = this.querySelector('.al-list');
            if (!list) return;

            const empty = list.querySelector('.al-empty');
            if (empty) empty.remove();

            const time = new Date(entry.timestamp);
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;
            const statusClass = entry.status === 0 ? 'err' : entry.status < 300 ? 'ok' : entry.status < 500 ? 'warn' : 'err';
            const methodColor = METHOD_COLORS[entry.method.toUpperCase()] || 'var(--color-text)';

            const el = document.createElement('div');
            el.className = 'al-entry';
            el.style.borderLeftColor = statusClass === 'ok' ? 'var(--color-success)' : statusClass === 'warn' ? 'var(--color-warning)' : 'var(--color-error)';

            const summary = document.createElement('div');
            summary.className = 'al-entry-summary';
            const truncUrl = entry.url.length > 60 ? entry.url.slice(0, 57) + '...' : entry.url;
            summary.innerHTML = `
                <span class="al-entry-time">${timeStr}</span>
                <span class="al-entry-method" style="color:${methodColor}">${this._escapeHtml(entry.method)}</span>
                <span class="al-entry-status al-status--${statusClass}">${entry.status || 'ERR'}</span>
                <span class="al-entry-duration">${entry.duration}ms</span>
                <span class="al-entry-url" title="${this._escapeAttr(entry.url)}">${this._escapeHtml(truncUrl)}</span>
                ${entry.error ? `<span class="al-entry-error">${this._escapeHtml(entry.error)}</span>` : ''}
            `;
            el.appendChild(summary);

            if (entry.requestBody || entry.responseBody || entry.error) {
                summary.style.cursor = 'pointer';
                summary.addEventListener('click', () => {
                    let detail = el.querySelector('.al-entry-detail');
                    if (detail) { detail.remove(); return; }
                    detail = document.createElement('div');
                    detail.className = 'al-entry-detail';
                    let html = '';
                    if (entry.responseBody) html += `<pre class="al-detail-body">${this._escapeHtml(JSON.stringify(entry.responseBody, null, 2))}</pre>`;
                    if (entry.error) html += `<pre class="al-detail-body al-detail-body--error">${this._escapeHtml(entry.error)}</pre>`;
                    detail.innerHTML = html;
                    el.appendChild(detail);
                });
            }

            list.prepend(el);
            while (list.children.length > 100) list.lastChild.remove();
        }

        _rerender() {
            const list = this.querySelector('.al-list');
            if (!list) return;
            list.innerHTML = '';
            const filtered = this._entries.filter(e => this._matchesFilter(e));
            if (filtered.length === 0) { list.innerHTML = '<div class="al-empty">No API calls</div>'; return; }
            for (let i = filtered.length - 1; i >= Math.max(0, filtered.length - 100); i--) this._renderEntry(filtered[i]);
        }

        _escapeHtml(str) { const d = document.createElement('div'); d.textContent = String(str); return d.innerHTML; }
        _escapeAttr(str) { return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

        getStyles() {
            return `
                .al-container { height: 100%; display: flex; flex-direction: column; }
                .al-header { display: flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0; flex-wrap: wrap; }
                .al-search { flex: 1; min-width: 80px; padding: 0.25rem 0.5rem; font-size: var(--text-small); font-family: var(--font-mono); color: var(--color-text); background: var(--bg-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
                .al-search:focus { outline: none; border-color: var(--color-primary); }
                .al-filters { display: flex; gap: 0.125rem; }
                .al-filter-btn { font-size: var(--text-small); padding: 0.125rem 0.375rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-mono); }
                .al-filter-btn:hover { background: var(--bg-secondary); }
                .al-filter-btn--active { background: rgba(78,205,196,0.1); color: var(--color-primary); border-color: var(--color-primary); }
                .al-clear-btn { font-size: var(--text-small); padding: 0.125rem 0.375rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; }
                .al-clear-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
                .al-list { flex: 1; overflow-y: auto; padding: 0.375rem; }
                .al-empty { padding: 1rem; text-align: center; color: var(--color-text-secondary); font-size: var(--text-small); }
                .al-entry { margin-bottom: 0.25rem; border-radius: var(--radius-sm); font-size: var(--text-small); font-family: var(--font-mono); border-left: 3px solid transparent; }
                .al-entry:hover { background: var(--bg-secondary); }
                .al-entry-summary { display: flex; flex-wrap: wrap; gap: 0.375rem; padding: 0.25rem 0.5rem; align-items: center; }
                .al-entry-time { color: var(--color-text-secondary); flex-shrink: 0; }
                .al-entry-method { font-weight: 600; flex-shrink: 0; min-width: 2.5rem; }
                .al-entry-status { font-weight: 600; flex-shrink: 0; min-width: 2rem; padding: 0 0.25rem; border-radius: 3px; background: var(--color-border); }
                .al-status--ok { color: var(--color-success); }
                .al-status--warn { color: var(--color-warning); }
                .al-status--err { color: var(--color-error); }
                .al-entry-duration { color: var(--color-text-secondary); flex-shrink: 0; }
                .al-entry-url { color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
                .al-entry-error { color: var(--color-error); width: 100%; padding-left: 1rem; }
                .al-entry-detail { padding: 0.25rem 0.75rem 0.5rem; border-top: 1px solid var(--color-border); }
                .al-detail-body { margin: 0.25rem 0 0; padding: 0.5rem; font-size: 0.6875rem; color: var(--color-text-secondary); background: var(--bg-primary); border-radius: var(--radius-sm); white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow-y: auto; }
                .al-detail-body--error { color: var(--color-error); }
            `;
        }
    }

    customElements.define('vault-api-logger', VaultApiLogger);
})();
