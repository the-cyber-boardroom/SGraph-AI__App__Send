/* =============================================================================
   SGraph Send Admin Console — Events Viewer (Debug)
   v0.1.3 — Live stream of all EventBus events
   ============================================================================= */

(function() {
    'use strict';

    class EventsViewer extends HTMLElement {

        constructor() {
            super();
            this._boundHandlers = {};
            this._filter = '';
        }

        connectedCallback() {
            this.render();
            this.setupEventListeners();
        }

        disconnectedCallback() {
            this.cleanup();
        }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="ev-container">
                    <div class="ev-header">
                        <input class="ev-filter" type="text" placeholder="Filter events..." />
                        <button class="ev-clear-btn">Clear</button>
                    </div>
                    <div class="ev-list"></div>
                </div>
            `;

            this.querySelector('.ev-filter').addEventListener('input', (e) => {
                this._filter = e.target.value.toLowerCase();
                this._rerender();
            });

            this.querySelector('.ev-clear-btn').addEventListener('click', () => {
                window.sgraphAdmin.events.clearHistory();
                this.querySelector('.ev-list').innerHTML = '<div class="ev-empty">No events</div>';
            });
        }

        setupEventListeners() {
            // Listen to ALL events by hooking into the EventBus emit
            const originalEmit = window.sgraphAdmin.events.emit.bind(window.sgraphAdmin.events);
            const self = this;

            this._boundHandlers.patchedEmit = function(event, data) {
                originalEmit(event, data);
                // Don't recurse on our own rendering
                if (event !== '__events-viewer-update') {
                    self._addEvent(event, data);
                }
            };

            // Patch emit to capture events — we need to unpatch on cleanup
            this._originalEmit = originalEmit;

            // Instead of patching, use a simpler approach: poll history
            this._lastHistoryLen = window.sgraphAdmin.events.getHistory().length;
            this._pollInterval = setInterval(() => {
                const history = window.sgraphAdmin.events.getHistory();
                if (history.length !== this._lastHistoryLen) {
                    const newEntries = history.slice(this._lastHistoryLen);
                    this._lastHistoryLen = history.length;
                    for (const entry of newEntries) {
                        this._addEvent(entry.event, entry.data, entry.timestamp);
                    }
                }
            }, 200);
        }

        cleanup() {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
                this._pollInterval = null;
            }
        }

        _addEvent(event, data, timestamp) {
            const list = this.querySelector('.ev-list');
            if (!list) return;

            // Remove empty state
            const empty = list.querySelector('.ev-empty');
            if (empty) empty.remove();

            // Apply filter
            if (this._filter && !event.toLowerCase().includes(this._filter)) return;

            const time = new Date(timestamp || Date.now());
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}.${time.getMilliseconds().toString().padStart(3,'0')}`;

            const dataStr = data ? JSON.stringify(data) : '';
            const truncated = dataStr.length > 100 ? dataStr.slice(0, 100) + '...' : dataStr;

            const el = document.createElement('div');
            el.className = 'ev-event';
            el.innerHTML = `
                <span class="ev-event-time">${timeStr}</span>
                <span class="ev-event-name">${this._escapeHtml(event)}</span>
                ${truncated ? `<span class="ev-event-data" title="${this._escapeAttr(dataStr)}">${this._escapeHtml(truncated)}</span>` : ''}
            `;
            list.prepend(el);

            // Limit displayed events
            while (list.children.length > 100) {
                list.lastChild.remove();
            }
        }

        _rerender() {
            const list = this.querySelector('.ev-list');
            if (!list) return;
            list.innerHTML = '';

            const history = window.sgraphAdmin.events.getHistory();
            const filtered = this._filter
                ? history.filter(e => e.event.toLowerCase().includes(this._filter))
                : history;

            if (filtered.length === 0) {
                list.innerHTML = '<div class="ev-empty">No events</div>';
                return;
            }

            // Show most recent first
            for (let i = filtered.length - 1; i >= Math.max(0, filtered.length - 100); i--) {
                const entry = filtered[i];
                this._addEvent(entry.event, entry.data, entry.timestamp);
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
                .ev-container {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .ev-header {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    padding: 0.5rem 0.75rem;
                    border-bottom: 1px solid var(--admin-border);
                    flex-shrink: 0;
                }

                .ev-filter {
                    flex: 1;
                    padding: 0.25rem 0.5rem;
                    font-size: var(--admin-font-size-xs);
                    font-family: var(--admin-font-mono);
                    color: var(--admin-text);
                    background: var(--admin-bg);
                    border: 1px solid var(--admin-border);
                    border-radius: var(--admin-radius);
                }

                .ev-filter:focus {
                    outline: none;
                    border-color: var(--admin-primary);
                }

                .ev-clear-btn {
                    font-size: var(--admin-font-size-xs);
                    padding: 0.125rem 0.375rem;
                    border-radius: var(--admin-radius);
                    border: 1px solid var(--admin-border);
                    background: transparent;
                    color: var(--admin-text-muted);
                    cursor: pointer;
                }

                .ev-clear-btn:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text-secondary);
                }

                .ev-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0.375rem;
                }

                .ev-empty {
                    padding: 1rem;
                    text-align: center;
                    color: var(--admin-text-muted);
                    font-size: var(--admin-font-size-xs);
                }

                .ev-event {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.375rem;
                    padding: 0.25rem 0.5rem;
                    margin-bottom: 0.125rem;
                    border-radius: var(--admin-radius);
                    font-size: var(--admin-font-size-xs);
                    font-family: var(--admin-font-mono);
                }

                .ev-event:hover {
                    background: var(--admin-surface-hover);
                }

                .ev-event-time {
                    color: var(--admin-text-muted);
                    flex-shrink: 0;
                }

                .ev-event-name {
                    color: var(--admin-primary);
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .ev-event-data {
                    color: var(--admin-text-secondary);
                    word-break: break-all;
                    cursor: help;
                }
            `;
        }
    }

    customElements.define('events-viewer', EventsViewer);
})();
