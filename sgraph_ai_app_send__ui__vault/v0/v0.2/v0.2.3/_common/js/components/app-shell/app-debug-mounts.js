/* =================================================================================
   SGraph App — Debug: ViV Mounts + Broker Log  (app-debug-mounts)   (gap-doc B4)
   v0.2.3 — Operator audit surface for Vault-in-Vault: the live mount table plus the
   per-kernel broker log (every relayed op: edge, path, policy, decision, result).

   Data comes from window._appDebug.vivProvider() — a live getter app-shell installs
   on its KernelParent. We re-render on `app-debug:bridge-call` (relayed ops emit one)
   and on a manual Refresh. All shaping is VivMountsView (pure, unit-tested).
   ================================================================================= */
(function () {
    'use strict';

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function fmtTime(ts) {
        if (!ts) return '';
        try { var d = new Date(ts); return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }
        catch (_) { return String(ts); }
    }

    class AppDebugMounts extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._handler = null; }

        connectedCallback() {
            this._refresh();
            this._handler = () => this._refresh();
            document.addEventListener('app-debug:bridge-call', this._handler);
            document.addEventListener('app-debug:viv-update', this._handler);
            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.dm-refresh')) this._refresh();
            });
        }

        disconnectedCallback() {
            if (this._handler) {
                document.removeEventListener('app-debug:bridge-call', this._handler);
                document.removeEventListener('app-debug:viv-update', this._handler);
            }
        }

        _data() {
            var provider = window._appDebug && window._appDebug.vivProvider;
            if (typeof provider !== 'function') return { mounts: [], entries: [] };
            try { return provider() || { mounts: [], entries: [] }; }
            catch (_) { return { mounts: [], entries: [] }; }
        }

        _refresh() {
            var V = globalThis.VivMountsView;
            var vm = V ? V.build(this._data()) : { mounts: [], log: [], summary: { total: 0, ok: 0, denied: 0, errors: 0, pending: 0 } };
            this._render(vm);
        }

        _render(vm) {
            var mountsHtml = vm.mounts.length === 0
                ? '<div class="empty">No vaults mounted. A parent kernel that calls vault.mount appears here.</div>'
                : vm.mounts.map(function (m) {
                    return '<div class="mrow">' +
                        '<span class="mid">' + esc(m.mountId) + '</span>' +
                        '<span class="mprefix">' + esc(m.prefix) + '</span>' +
                        '<span class="mlabel">' + esc(m.label) + '</span>' +
                        '<span class="miso">' + esc(m.isolation) + '</span>' +
                        '</div>';
                }).join('');

            var s = vm.summary;
            var summaryHtml = vm.log.length === 0 ? '' :
                '<div class="sum">' +
                    '<span>' + s.total + ' ops</span>' +
                    '<span class="s-ok">' + s.ok + ' ok</span>' +
                    (s.denied  ? '<span class="s-deny">' + s.denied + ' denied</span>' : '') +
                    (s.errors  ? '<span class="s-err">'  + s.errors + ' err</span>'    : '') +
                    (s.pending ? '<span class="s-pend">' + s.pending + ' pending</span>' : '') +
                '</div>';

            var logHtml = vm.log.length === 0
                ? '<div class="empty">No relayed operations yet. Cross-mount reads/writes are logged here.</div>'
                : vm.log.map(function (r) {
                    return '<div class="lrow l-' + r.cls + '">' +
                        '<span class="lt">'    + esc(fmtTime(r.ts)) + '</span>' +
                        '<span class="lic">'   + r.icon + '</span>' +
                        '<span class="ledge">' + esc(r.edge) + '</span>' +
                        '<span class="lpath">' + esc(r.path) + '</span>' +
                        '<span class="lcred">' + esc(r.cred) + '</span>' +
                        '<span class="lpol">'  + esc(r.policy) + '</span>' +
                        '<span class="lres">'  + esc(r.result) + '</span>' +
                        '</div>';
                }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; font-family:monospace; }
                    .bar { display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.5rem; border-bottom:1px solid #1c1c38; flex:0 0 auto; }
                    .bar .title { color:#4ECDC4; font-size:0.7rem; font-weight:600; letter-spacing:0.05em; }
                    .dm-refresh { background:none; border:1px solid #2a2a4a; color:#6a7888; border-radius:3px; font-size:0.65rem; padding:0.1rem 0.4rem; cursor:pointer; }
                    .dm-refresh:hover { color:#8892a4; border-color:#3a3a5a; }
                    .scroll { flex:1; overflow-y:auto; padding:0.4rem; }
                    .section-h { color:#5a6478; font-size:0.62rem; text-transform:uppercase; letter-spacing:0.08em; margin:0.5rem 0 0.25rem; }
                    .section-h:first-child { margin-top:0; }
                    .empty { color:#4a5568; font-size:0.7rem; padding:0.6rem; text-align:center; }
                    .mrow { display:flex; gap:0.4rem; padding:0.18rem 0.3rem; font-size:0.68rem; border-radius:3px; }
                    .mrow:hover { background:rgba(255,255,255,0.04); }
                    .mid { flex:0 0 6rem; color:#9b8cff; }
                    .mprefix { flex:0 0 7rem; color:#4ECDC4; }
                    .mlabel { flex:1; color:#8892a4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .miso { flex:0 0 4.5rem; color:#3a4558; text-align:right; }
                    .sum { display:flex; gap:0.6rem; padding:0.25rem 0.3rem; font-size:0.65rem; color:#5a6478; }
                    .sum .s-ok { color:#4ade80; } .sum .s-deny { color:#fbbf24; } .sum .s-err { color:#ff6b6b; } .sum .s-pend { color:#60a5fa; }
                    .lrow { display:flex; gap:0.35rem; padding:0.16rem 0.3rem; font-size:0.66rem; border-radius:3px; align-items:baseline; }
                    .lrow:hover { background:rgba(255,255,255,0.04); }
                    .l-err  .lres { color:#ff6b6b; } .l-err .lpath { color:#d88; }
                    .l-ok   .lres { color:#4ade80; }
                    .l-pending .lres { color:#60a5fa; }
                    .lt   { flex:0 0 5.5rem; color:#3a4558; }
                    .lic  { flex:0 0 1.2rem; }
                    .ledge{ flex:0 0 7rem; color:#9b8cff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .lpath{ flex:1; color:#8892a4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .lcred{ flex:0 0 4rem; color:#5a6478; }
                    .lpol { flex:0 0 3rem; color:#5a6478; }
                    .lres { flex:0 0 5rem; text-align:right; color:#8892a4; }
                </style>
                <div class="bar">
                    <span class="title">🔗 ViV Mounts &amp; Broker</span>
                    <button class="dm-refresh" title="Refresh">↻</button>
                </div>
                <div class="scroll">
                    <div class="section-h">Mounts</div>
                    ${mountsHtml}
                    <div class="section-h">Broker log</div>
                    ${summaryHtml}
                    ${logHtml}
                </div>
            `;
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (scroll) scroll.scrollTop = 0;
        }
    }

    customElements.define('app-debug-mounts', AppDebugMounts);
})();
