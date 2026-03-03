/* =============================================================================
   SGraph Workspace — Events Viewer (lightweight workspace-aware version)
   v0.1.0 — reads from window.sgraphWorkspace.events history
   ============================================================================= */

(function() {
    'use strict';

    if (customElements.get('events-viewer')) return;

    class EventsViewer extends HTMLElement {
        connectedCallback() {
            this._interval = setInterval(() => this._render(), 1000);
            this._render();
        }

        disconnectedCallback() { if (this._interval) clearInterval(this._interval); }

        _render() {
            const history = window.sgraphWorkspace.events.getHistory();
            if (history.length === 0) {
                this.innerHTML = `<div style="padding: 1rem; color: var(--ws-text-muted, #5a6478);
                    font-size: 0.75rem; text-align: center;">No events</div>`;
                return;
            }
            this.innerHTML = `<div style="padding: 0.5rem; font-size: 0.75rem; font-family: var(--ws-font-mono, monospace);">
                ${history.slice(-50).reverse().map(e => {
                    const time = new Date(e.timestamp).toLocaleTimeString();
                    return `<div style="padding: 0.25rem 0.375rem; border-bottom: 1px solid var(--ws-border-subtle, #222d4d);">
                        <span style="color: var(--ws-text-muted, #5a6478);">${time}</span>
                        <span style="color: var(--ws-primary, #4ECDC4);">${this._esc(e.event)}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }

        _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    }

    customElements.define('events-viewer', EventsViewer);
})();
