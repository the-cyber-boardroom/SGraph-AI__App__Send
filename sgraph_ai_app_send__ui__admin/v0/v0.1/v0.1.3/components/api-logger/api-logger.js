/* =============================================================================
   SGraph Send Admin Console — API Logger (Debug)
   v0.1.3 — Records all fetch() calls with method, URL, status, duration
   ============================================================================= */

(function() {
    'use strict';

    class ApiLogger extends HTMLElement {

        constructor() {
            super();
            this._entries = [];
            this._filter  = '';     // '' | '2xx' | '4xx' | '5xx' | 'err'
            this._boundHandlers = {};
        }

        connectedCallback() {
            this.render();
            this.setupEventListeners();
            this._interceptFetch();
        }

        disconnectedCallback() {
            this.cleanup();
        }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="al-container">
                    <div class="al-header">
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

            this.querySelectorAll('.al-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._filter = btn.dataset.filter;
                    this.querySelectorAll('.al-filter-btn').forEach(b =>
                        b.classList.toggle('al-filter-btn--active', b.dataset.filter === this._filter));
                    this._rerender();
                });
            });

            this.querySelector('.al-clear-btn').addEventListener('click', () => {
                this._entries = [];
                this._rerender();
            });
        }

        setupEventListeners() {
            this._boundHandlers.onApiCall = (data) => this._addEntry(data);
            window.sgraphAdmin.events.on('api-call', this._boundHandlers.onApiCall);

            this._boundHandlers.onApiError = (data) => this._addEntry({
                method: data.method || 'GET',
                url: data.url || data.operation || '?',
                status: 0,
                duration: 0,
                error: data.error
            });
            window.sgraphAdmin.events.on('api-error', this._boundHandlers.onApiError);
        }

        cleanup() {
            if (this._boundHandlers.onApiCall) {
                window.sgraphAdmin.events.off('api-call', this._boundHandlers.onApiCall);
            }
            if (this._boundHandlers.onApiError) {
                window.sgraphAdmin.events.off('api-error', this._boundHandlers.onApiError);
            }
            // Restore original fetch
            if (this._originalFetch) {
                window.fetch = this._originalFetch;
            }
        }

        _interceptFetch() {
            this._originalFetch = window.fetch;
            const self = this;

            window.fetch = async function(url, options) {
                const method = (options && options.method) || 'GET';
                const start  = performance.now();
                const urlStr = typeof url === 'string' ? url : url.url || String(url);

                try {
                    const response = await self._originalFetch.apply(window, arguments);
                    const duration = Math.round(performance.now() - start);

                    window.sgraphAdmin.events.emit('api-call', {
                        method,
                        url: urlStr,
                        status: response.status,
                        duration
                    });

                    return response;
                } catch (err) {
                    const duration = Math.round(performance.now() - start);
                    window.sgraphAdmin.events.emit('api-call', {
                        method,
                        url: urlStr,
                        status: 0,
                        duration,
                        error: err.message
                    });
                    throw err;
                }
            };
        }

        _addEntry(data) {
            const entry = {
                method   : data.method || 'GET',
                url      : data.url || '?',
                status   : data.status || 0,
                duration : data.duration || 0,
                error    : data.error || null,
                timestamp: new Date().toISOString()
            };
            this._entries.push(entry);
            if (this._entries.length > 200) this._entries.shift();

            // Check filter
            if (!this._matchesFilter(entry)) return;

            this._renderEntry(entry);
        }

        _matchesFilter(entry) {
            if (!this._filter) return true;
            if (this._filter === 'err') return entry.status === 0 || entry.error;
            const range = parseInt(this._filter);
            return entry.status >= range && entry.status < range + 100;
        }

        _renderEntry(entry) {
            const list = this.querySelector('.al-list');
            if (!list) return;

            const empty = list.querySelector('.al-empty');
            if (empty) empty.remove();

            const time = new Date(entry.timestamp);
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;

            const statusClass = entry.status === 0 ? 'al-status--err' :
                                entry.status < 300  ? 'al-status--ok'  :
                                entry.status < 500  ? 'al-status--warn' :
                                                      'al-status--err';

            const el = document.createElement('div');
            el.className = 'al-entry';
            el.innerHTML = `
                <span class="al-entry-time">${timeStr}</span>
                <span class="al-entry-method">${this._escapeHtml(entry.method)}</span>
                <span class="al-entry-status ${statusClass}">${entry.status || 'ERR'}</span>
                <span class="al-entry-duration">${entry.duration}ms</span>
                <span class="al-entry-url" title="${this._escapeAttr(entry.url)}">${this._escapeHtml(entry.url)}</span>
                ${entry.error ? `<span class="al-entry-error">${this._escapeHtml(entry.error)}</span>` : ''}
            `;
            list.prepend(el);

            while (list.children.length > 100) {
                list.lastChild.remove();
            }
        }

        _rerender() {
            const list = this.querySelector('.al-list');
            if (!list) return;
            list.innerHTML = '';

            const filtered = this._entries.filter(e => this._matchesFilter(e));
            if (filtered.length === 0) {
                list.innerHTML = '<div class="al-empty">No API calls</div>';
                return;
            }

            for (let i = filtered.length - 1; i >= Math.max(0, filtered.length - 100); i--) {
                this._renderEntry(filtered[i]);
            }
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        _escapeAttr(str) {
            return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        getStyles() {
            return `
                .al-container {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .al-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.5rem 0.75rem;
                    border-bottom: 1px solid var(--admin-border);
                    flex-shrink: 0;
                }

                .al-filters {
                    display: flex;
                    gap: 0.125rem;
                }

                .al-filter-btn {
                    font-size: var(--admin-font-size-xs);
                    padding: 0.125rem 0.375rem;
                    border-radius: var(--admin-radius);
                    border: 1px solid var(--admin-border);
                    background: transparent;
                    color: var(--admin-text-muted);
                    cursor: pointer;
                    font-family: var(--admin-font-mono);
                }

                .al-filter-btn:hover {
                    background: var(--admin-surface-hover);
                }

                .al-filter-btn--active {
                    background: var(--admin-primary-bg);
                    color: var(--admin-primary);
                    border-color: var(--admin-primary);
                }

                .al-clear-btn {
                    font-size: var(--admin-font-size-xs);
                    padding: 0.125rem 0.375rem;
                    border-radius: var(--admin-radius);
                    border: 1px solid var(--admin-border);
                    background: transparent;
                    color: var(--admin-text-muted);
                    cursor: pointer;
                }

                .al-clear-btn:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text-secondary);
                }

                .al-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0.375rem;
                }

                .al-empty {
                    padding: 1rem;
                    text-align: center;
                    color: var(--admin-text-muted);
                    font-size: var(--admin-font-size-xs);
                }

                .al-entry {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.375rem;
                    padding: 0.25rem 0.5rem;
                    margin-bottom: 0.125rem;
                    border-radius: var(--admin-radius);
                    font-size: var(--admin-font-size-xs);
                    font-family: var(--admin-font-mono);
                }

                .al-entry:hover {
                    background: var(--admin-surface-hover);
                }

                .al-entry-time {
                    color: var(--admin-text-muted);
                    flex-shrink: 0;
                }

                .al-entry-method {
                    font-weight: 600;
                    color: var(--admin-text);
                    flex-shrink: 0;
                    min-width: 2.5rem;
                }

                .al-entry-status {
                    font-weight: 600;
                    flex-shrink: 0;
                    min-width: 2rem;
                }

                .al-status--ok   { color: var(--admin-success); }
                .al-status--warn { color: var(--admin-warning); }
                .al-status--err  { color: var(--admin-error);   }

                .al-entry-duration {
                    color: var(--admin-text-muted);
                    flex-shrink: 0;
                }

                .al-entry-url {
                    color: var(--admin-text-secondary);
                    word-break: break-all;
                    cursor: help;
                }

                .al-entry-error {
                    color: var(--admin-error);
                    width: 100%;
                    padding-left: 1rem;
                }
            `;
        }
    }

    customElements.define('api-logger', ApiLogger);
})();
