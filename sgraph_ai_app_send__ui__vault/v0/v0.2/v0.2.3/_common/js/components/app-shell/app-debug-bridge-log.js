/* =================================================================================
   SGraph App — Debug: Bridge Log  (app-debug-bridge-log)
   v0.2.3 — Shows window.sg.* calls from the app iframe.
   ================================================================================= */
(function () {
    'use strict';

    class AppDebugBridgeLog extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._handler = null; }

        connectedCallback() {
            var buf = (window._appDebug && window._appDebug.bridgeCalls) || [];
            this._render(buf.slice());

            this._handler = () => {
                var buf = (window._appDebug && window._appDebug.bridgeCalls) || [];
                this._render(buf.slice());
            };
            document.addEventListener('app-debug:bridge-call', this._handler);
        }

        disconnectedCallback() {
            if (this._handler) document.removeEventListener('app-debug:bridge-call', this._handler);
        }

        _render(calls) {
            var rows = calls.length === 0
                ? '<div class="empty">No bridge calls yet. Bridge activity from the app iframe appears here.</div>'
                : calls.map(function (c) {
                    var icon = c.method === 'vfs.read'    ? '📖'
                             : c.method === 'vfs.write'   ? '✏️'
                             : c.method === 'vfs.list'    ? '📂'
                             : c.method === 'vfs.nav'     ? '→'
                             : c.method === 'ui.message'  ? '💬'
                             : c.method && c.method.startsWith('git') ? '↕'
                             : c.method && c.method.startsWith('auth') ? '🔑' : '•';
                    var detail = '';
                    if (c.path)  detail += _esc(c.path);
                    if (c.bytes != null) detail += ' ' + _fmtBytes(c.bytes);
                    if (c.count != null) detail += ' ' + c.count + ' entries';
                    if (c.text)  detail += ' "' + _esc(String(c.text).slice(0, 60)) + '"';
                    if (c.err)   detail += ' ERR: ' + _esc(c.err);
                    var okClass = c.ok === false ? ' row-err' : '';
                    return '<div class="row' + okClass + '">' +
                        '<span class="icon">' + icon + '</span>' +
                        '<span class="method">' + _esc(c.method || '?') + '</span>' +
                        '<span class="detail">' + detail + '</span>' +
                        (c.ms != null ? '<span class="ms">' + c.ms + 'ms</span>' : '') +
                        '</div>';
                }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; }
                    .scroll { flex:1; overflow-y:auto; padding:0.5rem; }
                    .empty { color:#4a5568; font-size:0.75rem; padding:1rem; text-align:center; }
                    .row { display:flex; align-items:baseline; gap:0.4rem; padding:0.2rem 0.375rem; border-radius:3px; font-size:0.7rem; font-family:monospace; }
                    .row:hover { background:rgba(255,255,255,0.04); }
                    .row-err .detail { color:#ff6b6b; }
                    .icon { flex:0 0 1.4rem; }
                    .method { flex:0 0 7rem; color:#4ECDC4; font-weight:600; }
                    .detail { flex:1; color:#8892a4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .ms { flex:0 0 4rem; text-align:right; color:#3a4558; }
                </style>
                <div class="scroll">${rows}</div>
            `;
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (scroll) scroll.scrollTop = scroll.scrollHeight;
        }
    }

    function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _fmtBytes(n) { return n > 1024*1024 ? (n/1024/1024).toFixed(1)+'MB' : n > 1024 ? (n/1024).toFixed(1)+'KB' : n+'B'; }
    customElements.define('app-debug-bridge-log', AppDebugBridgeLog);
})();
