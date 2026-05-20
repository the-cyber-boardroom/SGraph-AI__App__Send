/* =================================================================================
   SGraph App — Debug Pane Component  (app-debug-pane)
   v0.2.3 — Collapsible right-edge debug panel hosted inside sg-layout.

   When the panel width is ≤ 32px (sg-layout size: 0.0), renders a vertical
   "▶ Debug" edge button. Click dispatches app-debug:toggle event to the page.
   When expanded, renders basic diagnostic info.
   ================================================================================= */

(function () {
    'use strict';

    class AppDebugPane extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._collapsed = true;
            this._ro = null;
        }

        connectedCallback() {
            this._render();

            // Use ResizeObserver to detect collapse/expand driven by sg-layout drag
            if (typeof ResizeObserver !== 'undefined') {
                this._ro = new ResizeObserver((entries) => {
                    for (const entry of entries) {
                        const w = entry.contentRect.width;
                        const shouldCollapse = w < 40;
                        if (shouldCollapse !== this._collapsed) {
                            this._collapsed = shouldCollapse;
                            this._render();
                        }
                    }
                });
                this._ro.observe(this);
            }

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.dp-edge-btn')) {
                    this._requestExpand();
                }
                if (e.target.closest('.dp-close-btn')) {
                    this._requestCollapse();
                }
            });
        }

        disconnectedCallback() {
            if (this._ro) this._ro.disconnect();
        }

        _render() {
            if (this._collapsed) {
                this.shadowRoot.innerHTML = `
                    <style>
                        :host { display: flex; width: 100%; height: 100%; overflow: hidden; cursor: pointer; }
                        .dp-edge-btn {
                            display: flex; align-items: center; justify-content: center;
                            width: 100%; min-width: 16px; height: 100%;
                            background: #12122a; border-left: 1px solid #2a2a4a;
                            color: #4a5568; cursor: pointer; user-select: none;
                        }
                        .dp-edge-btn:hover { background: #1a1a3a; color: #8892a4; }
                        .dp-label {
                            writing-mode: vertical-rl; font-size: 0.7rem; letter-spacing: 0.08em;
                            white-space: nowrap; transform: rotate(180deg);
                        }
                    </style>
                    <div class="dp-edge-btn" title="Open debug panel">
                        <span class="dp-label">▶ Debug</span>
                    </div>
                `;
            } else {
                this.shadowRoot.innerHTML = `
                    <style>
                        :host { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; }
                        .dp-header {
                            display: flex; align-items: center; justify-content: space-between;
                            padding: 0.5rem 0.75rem;
                            background: #12122a; border-bottom: 1px solid #2a2a4a;
                            flex: 0 0 auto;
                        }
                        .dp-title { font-size: 0.8rem; font-weight: 600; color: #8892a4; }
                        .dp-close-btn {
                            background: none; border: none; color: #4a5568; cursor: pointer;
                            font-size: 0.75rem; padding: 0.1rem 0.3rem; border-radius: 3px;
                        }
                        .dp-close-btn:hover { color: #8892a4; background: #1a1a3a; }
                        .dp-body {
                            flex: 1; overflow-y: auto; padding: 0.75rem;
                            font-size: 0.75rem; font-family: monospace; color: #4a5568;
                            background: #0a0a18;
                        }
                        .dp-section { margin-bottom: 1rem; }
                        .dp-section h4 { margin: 0 0 0.4rem; color: #6a7888; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
                        .dp-row { display: flex; gap: 0.5rem; margin-bottom: 0.25rem; }
                        .dp-key { color: #4a5568; min-width: 80px; }
                        .dp-val { color: #8892a4; word-break: break-all; }
                    </style>
                    <div class="dp-header">
                        <span class="dp-title">🔍 Debug</span>
                        <button class="dp-close-btn" title="Collapse debug panel">◀</button>
                    </div>
                    <div class="dp-body" id="dp-body">
                        <div class="dp-section">
                            <h4>Page</h4>
                            <div class="dp-row"><span class="dp-key">URL</span><span class="dp-val">${this._escHtml(window.location.href)}</span></div>
                            <div class="dp-row"><span class="dp-key">Time</span><span class="dp-val">${new Date().toISOString()}</span></div>
                        </div>
                        <div class="dp-section">
                            <h4>App Shell</h4>
                            <div id="dp-shell-info"><span class="dp-val">Loading…</span></div>
                        </div>
                    </div>
                `;
                this._refreshShellInfo();
            }
        }

        _refreshShellInfo() {
            const container = this.shadowRoot.getElementById('dp-shell-info');
            if (!container) return;

            const shell = document.querySelector('app-shell');
            if (!shell) { container.innerHTML = '<span class="dp-val">app-shell not found</span>'; return; }

            const state = typeof shell.getDebugState === 'function' ? shell.getDebugState() : null;
            if (!state) { container.innerHTML = '<span class="dp-val">getDebugState() not available</span>'; return; }

            const row = (k, v) => `<div class="dp-row"><span class="dp-key">${k}</span><span class="dp-val">${this._escHtml(String(v))}</span></div>`;

            container.innerHTML = [
                row('iframe',    state.iframeStatus || '—'),
                row('writable',  state.writable ? 'yes' : 'no'),
                row('appJson',   state.appJson ? 'present' : 'none'),
                row('entry',     state.entry    || '—'),
                row('resources', (state.resourcesLoaded || []).length + ' loaded'),
            ].join('');
        }

        _requestExpand() {
            this.dispatchEvent(new CustomEvent('app-debug:toggle', {
                bubbles: true, composed: true,
                detail: { open: true, split: 0.28 }
            }));
        }

        _requestCollapse() {
            this.dispatchEvent(new CustomEvent('app-debug:toggle', {
                bubbles: true, composed: true,
                detail: { open: false, split: 0.28 }
            }));
        }

        _escHtml(str) {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
    }

    customElements.define('app-debug-pane', AppDebugPane);
})();
