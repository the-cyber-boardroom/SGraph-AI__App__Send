/* =================================================================================
   SGraph App — Debug: Vault Trace  (app-debug-vault-trace)
   v0.2.3 — Shows vault lifecycle events emitted by app-shell during init.
   ================================================================================= */
(function () {
    'use strict';

    class AppDebugVaultTrace extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._handler = null; }

        connectedCallback() {
            this._render([]);
            // Replay buffered events first
            var buf = (window._appDebug && window._appDebug.vaultEvents) || [];
            if (buf.length) this._render(buf.slice());

            this._handler = (e) => {
                var buf = (window._appDebug && window._appDebug.vaultEvents) || [];
                this._render(buf.slice());
            };
            document.addEventListener('app-debug:vault-event', this._handler);
        }

        disconnectedCallback() {
            if (this._handler) document.removeEventListener('app-debug:vault-event', this._handler);
        }

        _render(events) {
            var rows = events.length === 0
                ? '<div class="empty">No vault events yet. Open a vault to see activity.</div>'
                : events.map(function (ev) {
                    var ok = ev.type && !ev.type.includes('error') && !ev.type.includes('fail');
                    var icon = ev.type === 'open-ok'        ? '🔓'
                             : ev.type === 'open-start'     ? '⏳'
                             : ev.type === 'tree-loaded'    ? '🌲'
                             : ev.type === 'app-json'       ? '📋'
                             : ev.type === 'app-json-missing' ? '—'
                             : ev.type === 'resources-loaded' ? '📦'
                             : ev.type === 'iframe-ready'   ? '✅'
                             : ev.type === 'open-error'     ? '❌' : '•';
                    var meta = [];
                    if (ev.ms   != null) meta.push(ev.ms + 'ms');
                    if (ev.vaultName)    meta.push('"' + ev.vaultName + '"');
                    if (ev.fileCount != null) meta.push(ev.fileCount + ' files');
                    if (ev.entry)        meta.push('entry=' + ev.entry);
                    if (ev.cssCount != null) meta.push(ev.cssCount + ' css, ' + ev.jsCount + ' js');
                    if (ev.key)          meta.push('key=' + ev.key);
                    return '<div class="row' + (ok ? '' : ' row-err') + '">' +
                        '<span class="icon">' + icon + '</span>' +
                        '<span class="label">' + _esc(ev.label || ev.type) + '</span>' +
                        (meta.length ? '<span class="meta">' + _esc(meta.join(' · ')) + '</span>' : '') +
                        '<span class="ts">' + new Date(ev.ts || 0).toLocaleTimeString() + '</span>' +
                        '</div>';
                }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; }
                    .scroll { flex:1; overflow-y:auto; padding:0.5rem; }
                    .empty { color:#4a5568; font-size:0.75rem; padding:1rem; text-align:center; }
                    .row { display:flex; align-items:baseline; gap:0.5rem; padding:0.25rem 0.375rem; border-radius:3px; font-size:0.75rem; }
                    .row:hover { background:rgba(255,255,255,0.04); }
                    .row-err { color:#ff6b6b; }
                    .icon { flex:0 0 1.2rem; text-align:center; }
                    .label { flex:1; color:#c0cde0; font-family:monospace; }
                    .meta { color:#4ECDC4; font-family:monospace; white-space:nowrap; }
                    .ts { flex:0 0 6rem; text-align:right; color:#3a4558; font-family:monospace; font-size:0.7rem; }
                </style>
                <div class="scroll">${rows}</div>
            `;
            // Auto-scroll to bottom
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (scroll) scroll.scrollTop = scroll.scrollHeight;
        }
    }

    function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    customElements.define('app-debug-vault-trace', AppDebugVaultTrace);
})();
