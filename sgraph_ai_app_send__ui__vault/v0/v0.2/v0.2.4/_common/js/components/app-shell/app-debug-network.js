/* =================================================================================
   SGraph App — Debug: Network  (app-debug-network)
   v0.2.3 — Shows fetch() calls intercepted by the page fetch proxy.
   ================================================================================= */
(function () {
    'use strict';

    class AppDebugNetwork extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._handler = null; }

        connectedCallback() {
            var buf = (window._appDebug && window._appDebug.networkCalls) || [];
            this._render(buf.slice());
            this._handler = () => {
                var buf = (window._appDebug && window._appDebug.networkCalls) || [];
                this._render(buf.slice());
            };
            document.addEventListener('app-debug:network-call', this._handler);
        }

        disconnectedCallback() {
            if (this._handler) document.removeEventListener('app-debug:network-call', this._handler);
        }

        _render(calls) {
            var rows = calls.length === 0
                ? '<div class="empty">No fetch() calls yet.</div>'
                : calls.map(function (c) {
                    var statusClass = c.ok ? 'st-ok' : (c.status >= 400 ? 'st-err' : 'st-warn');
                    var statusText  = c.status || (c.err ? 'ERR' : '?');
                    return '<div class="row">' +
                        '<span class="method">' + _esc(c.method) + '</span>' +
                        '<span class="status ' + statusClass + '">' + statusText + '</span>' +
                        '<span class="url">' + _esc(c.url || '') + '</span>' +
                        '<span class="ms">' + (c.ms != null ? c.ms + 'ms' : '') + '</span>' +
                        '</div>';
                }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; }
                    .scroll { flex:1; overflow-y:auto; padding:0.5rem; }
                    .empty { color:#4a5568; font-size:0.75rem; padding:1rem; text-align:center; }
                    .row { display:grid; grid-template-columns:3.5rem 3rem 1fr 4rem; gap:0.4rem; align-items:baseline; padding:0.2rem 0.375rem; border-radius:3px; font-size:0.7rem; font-family:monospace; }
                    .row:hover { background:rgba(255,255,255,0.04); }
                    .method { color:#E9C445; font-weight:700; }
                    .status { font-weight:700; text-align:center; }
                    .st-ok   { color:#4ECDC4; }
                    .st-err  { color:#ff6b6b; }
                    .st-warn { color:#E9C445; }
                    .url { color:#8892a4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .ms  { color:#3a4558; text-align:right; }
                </style>
                <div class="scroll">${rows}</div>
            `;
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (scroll) scroll.scrollTop = scroll.scrollHeight;
        }
    }

    function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    customElements.define('app-debug-network', AppDebugNetwork);
})();
