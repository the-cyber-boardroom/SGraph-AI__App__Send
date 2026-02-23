/* =============================================================================
   SGraph Send Admin Console — Events Viewer (Debug)
   v0.1.3 — Live stream of all EventBus events with expandable details
   ============================================================================= */

(function() {
    'use strict';

    class EventsViewer extends HTMLElement {

        constructor() {
            super();
            this._filter  = '';
            this._paused  = false;
            this._counter = 0;
        }

        connectedCallback() {
            this.render();
            this._setupInterceptor();
        }

        disconnectedCallback() {
            this._restoreInterceptor();
        }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="ev-container">
                    <div class="ev-header">
                        <input class="ev-filter" type="text" placeholder="Filter events..." />
                        <button class="ev-pause-btn">Pause</button>
                        <button class="ev-clear-btn">Clear</button>
                    </div>
                    <div class="ev-status">
                        <span class="ev-status-dot ev-status-dot--live"></span>
                        <span class="ev-status-text">Live</span>
                    </div>
                    <div class="ev-list"></div>
                </div>
            `;

            this.querySelector('.ev-filter').addEventListener('input', (e) => {
                this._filter = e.target.value.toLowerCase();
                this._rerender();
            });

            this.querySelector('.ev-pause-btn').addEventListener('click', () => {
                this._paused = !this._paused;
                this.querySelector('.ev-pause-btn').textContent = this._paused ? 'Resume' : 'Pause';
                const dot  = this.querySelector('.ev-status-dot');
                const text = this.querySelector('.ev-status-text');
                if (dot) {
                    dot.classList.toggle('ev-status-dot--live', !this._paused);
                    dot.classList.toggle('ev-status-dot--paused', this._paused);
                }
                if (text) text.textContent = this._paused ? 'Paused' : 'Live';
            });

            this.querySelector('.ev-clear-btn').addEventListener('click', () => {
                this._counter = 0;
                window.sgraphAdmin.events.clearHistory();
                this.querySelector('.ev-list').innerHTML = '<div class="ev-empty">No events</div>';
            });
        }

        _setupInterceptor() {
            const events = window.sgraphAdmin.events;
            this._originalEmit = events.emit.bind(events);
            const self = this;

            events.emit = function(name, detail) {
                const result = self._originalEmit(name, detail);
                // Don't capture our own internal events
                if (!self._paused && name !== '__ev-internal') {
                    self._addEvent(name, detail);
                }
                return result;
            };
        }

        _restoreInterceptor() {
            if (this._originalEmit) {
                window.sgraphAdmin.events.emit = this._originalEmit;
                this._originalEmit = null;
            }
        }

        _addEvent(event, data) {
            const list = this.querySelector('.ev-list');
            if (!list) return;

            // Apply filter
            const dataStr = data ? JSON.stringify(data) : '';
            if (this._filter) {
                const searchable = (event + ' ' + dataStr).toLowerCase();
                if (!searchable.includes(this._filter)) return;
            }

            // Remove empty state
            const empty = list.querySelector('.ev-empty');
            if (empty) empty.remove();

            this._counter++;
            const time = new Date();
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}.${time.getMilliseconds().toString().padStart(3,'0')}`;

            const el = document.createElement('div');
            el.className = 'ev-event';
            el.dataset.eventData = dataStr;

            const summary = document.createElement('div');
            summary.className = 'ev-event-summary';
            summary.innerHTML = `
                <span class="ev-event-id">#${this._counter}</span>
                <span class="ev-event-time">${timeStr}</span>
                <span class="ev-event-name">${this._escapeHtml(event)}</span>
            `;

            el.appendChild(summary);

            // Click to expand/collapse detail
            if (dataStr && dataStr !== '{}') {
                summary.style.cursor = 'pointer';
                summary.addEventListener('click', () => {
                    let detail = el.querySelector('.ev-event-detail');
                    if (detail) {
                        detail.remove();
                    } else {
                        detail = document.createElement('pre');
                        detail.className = 'ev-event-detail';
                        try {
                            detail.textContent = JSON.stringify(JSON.parse(dataStr), null, 2);
                        } catch (_) {
                            detail.textContent = dataStr;
                        }
                        el.appendChild(detail);
                    }
                });
            }

            list.prepend(el);

            // Limit displayed events
            while (list.children.length > 200) {
                list.lastChild.remove();
            }
        }

        _rerender() {
            const list = this.querySelector('.ev-list');
            if (!list) return;
            list.innerHTML = '';

            const history = window.sgraphAdmin.events.getHistory();
            const filtered = this._filter
                ? history.filter(e => {
                    const searchable = (e.event + ' ' + JSON.stringify(e.data || '')).toLowerCase();
                    return searchable.includes(this._filter);
                  })
                : history;

            if (filtered.length === 0) {
                list.innerHTML = '<div class="ev-empty">No events</div>';
                return;
            }

            for (let i = filtered.length - 1; i >= Math.max(0, filtered.length - 200); i--) {
                const entry = filtered[i];
                this._addEvent(entry.event, entry.data);
            }
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
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

                .ev-pause-btn,
                .ev-clear-btn {
                    font-size: var(--admin-font-size-xs);
                    padding: 0.125rem 0.375rem;
                    border-radius: var(--admin-radius);
                    border: 1px solid var(--admin-border);
                    background: transparent;
                    color: var(--admin-text-muted);
                    cursor: pointer;
                }

                .ev-pause-btn:hover,
                .ev-clear-btn:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text-secondary);
                }

                .ev-status {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    padding: 0.25rem 0.75rem;
                    font-size: 0.6875rem;
                    color: var(--admin-text-muted);
                    border-bottom: 1px solid var(--admin-border-subtle, var(--admin-border));
                }

                .ev-status-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--admin-text-muted);
                }

                .ev-status-dot--live {
                    background: var(--admin-success);
                    box-shadow: 0 0 4px var(--admin-success);
                }

                .ev-status-dot--paused {
                    background: var(--admin-warning);
                    box-shadow: 0 0 4px var(--admin-warning);
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
                    margin-bottom: 0.125rem;
                    border-radius: var(--admin-radius);
                    font-size: var(--admin-font-size-xs);
                    font-family: var(--admin-font-mono);
                }

                .ev-event:hover {
                    background: var(--admin-surface-hover);
                }

                .ev-event-summary {
                    display: flex;
                    gap: 0.375rem;
                    padding: 0.25rem 0.5rem;
                    align-items: center;
                }

                .ev-event-id {
                    color: var(--admin-text-muted);
                    font-weight: 600;
                    flex-shrink: 0;
                    min-width: 2rem;
                }

                .ev-event-time {
                    color: var(--admin-text-muted);
                    flex-shrink: 0;
                }

                .ev-event-name {
                    color: var(--admin-primary);
                    font-weight: 600;
                }

                .ev-event-detail {
                    margin: 0;
                    padding: 0.5rem 0.75rem;
                    font-size: 0.6875rem;
                    color: var(--admin-text-secondary);
                    background: var(--admin-bg);
                    border-top: 1px solid var(--admin-border-subtle, var(--admin-border));
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-height: 200px;
                    overflow-y: auto;
                }
            `;
        }
    }

    customElements.define('events-viewer', EventsViewer);
})();
