/* =============================================================================
   SGraph Workspace — API Logger (full version with expandable request/response)
   v0.1.1 — Adapted from admin api-logger v0.1.3

   Intercepts fetch(), captures request/response bodies, provides expandable
   detail view with OpenRouter metadata (model, token counts, latency).
   ============================================================================= */

(function() {
    'use strict';

    if (customElements.get('api-logger')) return;

    const METHOD_COLORS = {
        GET    : '#22c55e',
        POST   : '#3b82f6',
        PUT    : '#f59e0b',
        PATCH  : '#8b5cf6',
        DELETE : '#ef4444'
    };

    class ApiLogger extends HTMLElement {

        constructor() {
            super();
            this._entries      = [];
            this._statusFilter = '';
            this._textFilter   = '';
        }

        connectedCallback() {
            this._renderShell();
            this._patchFetch();
        }

        disconnectedCallback() { this._unpatchFetch(); }

        // --- Fetch interception (captures request + response bodies) -----------

        _patchFetch() {
            if (window._wsOriginalFetch) return;
            window._wsOriginalFetch = window.fetch;
            const self = this;

            window.fetch = async function(...args) {
                const url    = typeof args[0] === 'string' ? args[0] : args[0]?.url || '?';
                const opts   = args[1] || {};
                const method = opts.method || 'GET';
                const start  = performance.now();
                const reqBody = opts.body || null;
                const isStream = reqBody && typeof reqBody === 'string' &&
                                 reqBody.includes('"stream":true');

                try {
                    const resp     = await window._wsOriginalFetch.apply(this, args);
                    const duration = Math.round(performance.now() - start);

                    // Capture response body (skip streaming responses)
                    let responseBody = null;
                    if (!isStream) {
                        try { responseBody = await resp.clone().json(); } catch (_) { /* non-JSON */ }
                    }

                    self._addEntry({
                        method, url, status: resp.status, duration,
                        requestBody: reqBody, responseBody, isStream,
                        headers: opts.headers || null,
                    });
                    return resp;
                } catch (err) {
                    const duration = Math.round(performance.now() - start);
                    self._addEntry({
                        method, url, status: 0, duration,
                        requestBody: reqBody, error: err.message,
                        headers: opts.headers || null,
                    });
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

        // --- Entry management --------------------------------------------------

        _addEntry(data) {
            const entry = {
                method       : data.method || 'GET',
                url          : data.url || '?',
                status       : data.status || 0,
                duration     : data.duration || 0,
                error        : data.error || null,
                requestBody  : data.requestBody || null,
                responseBody : data.responseBody || null,
                headers      : data.headers || null,
                isStream     : data.isStream || false,
                timestamp    : new Date().toISOString(),
            };

            // Extract OpenRouter metadata from request
            if (entry.requestBody && entry.url.includes('chat/completions')) {
                try {
                    const parsed = typeof entry.requestBody === 'string'
                        ? JSON.parse(entry.requestBody) : entry.requestBody;
                    entry.model    = parsed.model || null;
                    entry.msgCount = parsed.messages ? parsed.messages.length : 0;
                } catch (_) { /* ignore */ }
            }

            this._entries.push(entry);
            if (this._entries.length > 200) this._entries.shift();

            if (this._matchesFilter(entry)) this._renderEntry(entry);
        }

        _matchesFilter(entry) {
            if (this._statusFilter) {
                if (this._statusFilter === 'err') {
                    if (entry.status !== 0 && !(entry.status >= 400) && !entry.error) return false;
                } else {
                    // '2xx' → 200, '4xx' → 400
                    const range = parseInt(this._statusFilter) * 100;
                    if (isNaN(range) || entry.status < range || entry.status >= range + 100) return false;
                }
            }
            if (this._textFilter) {
                const searchable = (entry.url + ' ' + entry.method + ' ' + (entry.model || '')).toLowerCase();
                if (!searchable.includes(this._textFilter)) return false;
            }
            return true;
        }

        // --- Render: Shell (filter bar + empty list) ----------------------------

        _renderShell() {
            this.innerHTML = `
                <style>${ApiLogger.styles}</style>
                <div class="al-container">
                    <div class="al-header">
                        <input class="al-search" type="text" placeholder="Filter..." />
                        <div class="al-filters">
                            <button class="al-filter-btn al-filter-btn--active" data-filter="">All</button>
                            <button class="al-filter-btn" data-filter="2xx">2xx</button>
                            <button class="al-filter-btn" data-filter="4xx">4xx</button>
                            <button class="al-filter-btn" data-filter="err">Err</button>
                        </div>
                        <button class="al-clear-btn">Clear</button>
                    </div>
                    <div class="al-list">
                        <div class="al-empty">No API calls</div>
                    </div>
                </div>`;

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

        // --- Render: Single entry -----------------------------------------------

        _renderEntry(entry) {
            const list = this.querySelector('.al-list');
            if (!list) return;

            const empty = list.querySelector('.al-empty');
            if (empty) empty.remove();

            const time = new Date(entry.timestamp);
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;

            const statusBorder = entry.status === 0  ? 'var(--ws-warning, #fbbf24)' :
                                 entry.status < 300   ? 'var(--ws-success, #4ECDC4)' :
                                 entry.status < 500   ? 'var(--ws-warning, #fbbf24)' :
                                                        'var(--ws-error, #E94560)';

            const methodColor = METHOD_COLORS[entry.method.toUpperCase()] || 'var(--ws-text, #F0F0F5)';

            const el = document.createElement('div');
            el.className = 'al-entry';
            el.style.borderLeftColor = statusBorder;

            // OpenRouter badge
            let badge = '';
            if (entry.model) {
                const shortModel = entry.model.split('/').pop();
                badge = `<span class="al-entry-model" title="${this._esc(entry.model)}">${this._esc(shortModel)}</span>`;
            }

            const summary = document.createElement('div');
            summary.className = 'al-entry-summary';
            summary.innerHTML = `
                <span class="al-entry-time">${timeStr}</span>
                <span class="al-entry-method" style="color: ${methodColor}">${this._esc(entry.method)}</span>
                <span class="al-entry-status al-status--${entry.status === 0 ? 'err' : entry.status < 300 ? 'ok' : entry.status < 500 ? 'warn' : 'err'}">${entry.status || 'ERR'}</span>
                <span class="al-entry-duration">${entry.duration}ms</span>
                ${badge}
                <span class="al-entry-url" title="${this._escAttr(entry.url)}">${this._esc(entry.url)}</span>
                ${entry.error ? `<span class="al-entry-error">${this._esc(entry.error)}</span>` : ''}
                ${entry.isStream ? '<span class="al-entry-stream">SSE</span>' : ''}
            `;

            el.appendChild(summary);

            // Expandable detail (click to toggle)
            const hasDetail = entry.requestBody || entry.responseBody || entry.error;
            if (hasDetail) {
                summary.style.cursor = 'pointer';
                summary.addEventListener('click', () => {
                    let detail = el.querySelector('.al-entry-detail');
                    if (detail) {
                        detail.remove();
                    } else {
                        detail = document.createElement('div');
                        detail.className = 'al-entry-detail';
                        let html = '';

                        // Request section
                        if (entry.requestBody) {
                            const formatted = this._formatBody(entry.requestBody);
                            // Mask API key in headers display
                            let headersHtml = '';
                            if (entry.headers) {
                                const safe = Object.assign({}, entry.headers);
                                if (safe.Authorization) safe.Authorization = safe.Authorization.slice(0, 12) + '...';
                                headersHtml = `<div class="al-detail-section"><span class="al-detail-label">Headers:</span><pre class="al-detail-body">${this._esc(JSON.stringify(safe, null, 2))}</pre></div>`;
                            }
                            html += headersHtml;
                            html += `<div class="al-detail-section"><span class="al-detail-label">Request Body:</span><pre class="al-detail-body">${this._esc(formatted)}</pre></div>`;
                        }

                        // Response section
                        if (entry.responseBody) {
                            const formatted = this._formatBody(entry.responseBody);
                            html += `<div class="al-detail-section"><span class="al-detail-label">Response:</span><pre class="al-detail-body">${this._esc(formatted)}</pre></div>`;

                            // OpenRouter metadata extraction
                            const resp = entry.responseBody;
                            if (resp.usage || resp.model) {
                                let meta = '';
                                if (resp.model) meta += `Model: ${resp.model}\n`;
                                if (resp.usage) {
                                    meta += `Prompt tokens: ${resp.usage.prompt_tokens || '?'}\n`;
                                    meta += `Completion tokens: ${resp.usage.completion_tokens || '?'}\n`;
                                    meta += `Total tokens: ${resp.usage.total_tokens || '?'}\n`;
                                }
                                html += `<div class="al-detail-section"><span class="al-detail-label">LLM Metadata:</span><pre class="al-detail-body al-detail-body--meta">${this._esc(meta)}</pre></div>`;
                            }
                        } else if (entry.isStream) {
                            html += `<div class="al-detail-section"><span class="al-detail-label">Response:</span><pre class="al-detail-body">[Streaming response — SSE chunks not captured]</pre></div>`;
                        }

                        if (entry.error) {
                            html += `<div class="al-detail-section"><span class="al-detail-label">Error:</span><pre class="al-detail-body al-detail-body--error">${this._esc(entry.error)}</pre></div>`;
                        }
                        detail.innerHTML = html;
                        el.appendChild(detail);
                    }
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
            if (filtered.length === 0) {
                list.innerHTML = '<div class="al-empty">No API calls</div>';
                return;
            }
            for (let i = filtered.length - 1; i >= Math.max(0, filtered.length - 100); i--) {
                this._renderEntry(filtered[i]);
            }
        }

        // --- Helpers ------------------------------------------------------------

        _formatBody(body) {
            if (typeof body === 'string') {
                try { return JSON.stringify(JSON.parse(body), null, 2); }
                catch (_) { return body; }
            }
            return JSON.stringify(body, null, 2);
        }

        _esc(s)     { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
        _escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

        // --- Styles (workspace theme) -------------------------------------------

        static get styles() {
            return `
                .al-container { height: 100%; display: flex; flex-direction: column; }

                .al-header {
                    display: flex; align-items: center; gap: 0.375rem;
                    padding: 0.5rem 0.75rem;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0; flex-wrap: wrap;
                }

                .al-search {
                    flex: 1; min-width: 60px;
                    padding: 0.25rem 0.5rem; font-size: 0.6875rem;
                    font-family: var(--ws-font-mono, monospace);
                    color: var(--ws-text, #F0F0F5);
                    background: var(--ws-bg, #1A1A2E);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    outline: none;
                }
                .al-search:focus { border-color: var(--ws-primary, #4ECDC4); }

                .al-filters { display: flex; gap: 0.125rem; }
                .al-filter-btn {
                    font-size: 0.625rem; padding: 0.125rem 0.375rem;
                    border-radius: var(--ws-radius, 6px);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    cursor: pointer; font-family: var(--ws-font-mono, monospace);
                }
                .al-filter-btn:hover { background: var(--ws-surface-hover, #253254); }
                .al-filter-btn--active {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border-color: var(--ws-primary, #4ECDC4);
                }

                .al-clear-btn {
                    font-size: 0.625rem; padding: 0.125rem 0.375rem;
                    border-radius: var(--ws-radius, 6px);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    cursor: pointer;
                }
                .al-clear-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text-secondary, #8892A0); }

                .al-list { flex: 1; overflow-y: auto; padding: 0.375rem; }
                .al-empty {
                    padding: 1rem; text-align: center;
                    color: var(--ws-text-muted, #5a6478); font-size: 0.75rem;
                }

                .al-entry {
                    margin-bottom: 0.25rem;
                    border-radius: var(--ws-radius, 6px);
                    font-size: 0.6875rem;
                    font-family: var(--ws-font-mono, monospace);
                    border-left: 3px solid transparent;
                }
                .al-entry:hover { background: var(--ws-surface-hover, #253254); }

                .al-entry-summary {
                    display: flex; flex-wrap: wrap; gap: 0.375rem;
                    padding: 0.25rem 0.5rem; align-items: center;
                }
                .al-entry-time { color: var(--ws-text-muted, #5a6478); flex-shrink: 0; }
                .al-entry-method { font-weight: 600; flex-shrink: 0; min-width: 2.5rem; }
                .al-entry-status {
                    font-weight: 600; flex-shrink: 0; min-width: 2rem;
                    padding: 0 0.25rem; border-radius: 3px;
                    background: var(--ws-border-subtle, #222d4d);
                }
                .al-status--ok   { color: var(--ws-success, #4ECDC4); }
                .al-status--warn { color: var(--ws-warning, #fbbf24); }
                .al-status--err  { color: var(--ws-error, #E94560); }
                .al-entry-duration { color: var(--ws-text-muted, #5a6478); flex-shrink: 0; }
                .al-entry-model {
                    font-size: 0.625rem; font-weight: 600;
                    padding: 0.0625rem 0.375rem; border-radius: 9999px;
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4); flex-shrink: 0;
                }
                .al-entry-url {
                    color: var(--ws-text-secondary, #8892A0);
                    overflow: hidden; text-overflow: ellipsis;
                    white-space: nowrap; flex: 1; min-width: 0;
                }
                .al-entry-error { color: var(--ws-error, #E94560); width: 100%; padding-left: 1rem; }
                .al-entry-stream {
                    font-size: 0.5625rem; font-weight: 600;
                    padding: 0.0625rem 0.25rem; border-radius: 3px;
                    background: rgba(59,130,246,0.15); color: #60a5fa;
                    flex-shrink: 0;
                }

                .al-entry-detail {
                    padding: 0.25rem 0.75rem 0.5rem;
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                }
                .al-detail-section { margin-bottom: 0.375rem; }
                .al-detail-label {
                    font-size: 0.625rem; font-weight: 600;
                    color: var(--ws-text-muted, #5a6478); text-transform: uppercase;
                }
                .al-detail-body {
                    margin: 0.25rem 0 0; padding: 0.5rem;
                    font-size: 0.6875rem;
                    color: var(--ws-text-secondary, #8892A0);
                    background: var(--ws-bg, #1A1A2E);
                    border-radius: var(--ws-radius, 6px);
                    white-space: pre-wrap; word-break: break-all;
                    max-height: 150px; overflow-y: auto;
                }
                .al-detail-body--error { color: var(--ws-error, #E94560); }
                .al-detail-body--meta {
                    color: var(--ws-primary, #4ECDC4);
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                }
            `;
        }
    }

    customElements.define('api-logger', ApiLogger);
})();
