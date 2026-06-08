/* =================================================================================
   SGraph App — Debug: Cross-kernel Audit  (app-debug-audit)   (Phase 5.1)

   The multi-kernel companion to the single-kernel "Mounts" tab. Where Mounts shows
   THIS kernel's mount table + broker log, Audit aggregates across every kernel the
   page can see: the top kernel (own log) plus each direct child polled via
   monitorChild (B7). Children default to CLOSED → they appear as honest "monitoring
   closed" placeholders rather than empty rows; grandchildren are unreachable.

   Data: window._appDebug.vivAuditProvider() — an ASYNC provider app-shell installs on
   its KernelParent (one channel round-trip per child). All shaping is VivAuditView
   (pure, unit-tested). Re-fetches on `app-debug:bridge-call` / `app-debug:viv-update`
   and on manual Refresh.
   ================================================================================= */
(function () {
    'use strict';

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function fmtTime(ts) {
        if (!ts) return '';
        try { var d = new Date(ts); return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }
        catch (_) { return String(ts); }
    }

    var MON_LABEL = { top: 'self', 'opt-in': 'monitored', closed: 'closed', unreachable: 'unreachable' };

    class AppDebugAudit extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._handler = null; this._seq = 0; }

        connectedCallback() {
            this._refresh();
            // Coalesce bursts of relayed ops into one re-fetch.
            this._handler = () => { clearTimeout(this._t); this._t = setTimeout(() => this._refresh(), 120); };
            document.addEventListener('app-debug:bridge-call', this._handler);
            document.addEventListener('app-debug:viv-update', this._handler);
            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.da-refresh')) this._refresh();
            });
        }

        disconnectedCallback() {
            clearTimeout(this._t);
            if (this._handler) {
                document.removeEventListener('app-debug:bridge-call', this._handler);
                document.removeEventListener('app-debug:viv-update', this._handler);
            }
        }

        async _refresh() {
            var V = globalThis.VivAuditView;
            var provider = window._appDebug && window._appDebug.vivAuditProvider;
            if (!V || typeof provider !== 'function') { this._render(null); return; }
            var seq = ++this._seq;
            this._render('loading');
            var sources;
            try { sources = await provider() || []; }
            catch (_) { sources = []; }
            if (seq !== this._seq) return;           // a newer refresh superseded this one
            this._render(V.aggregate(sources));
        }

        _render(vm) {
            var body;
            if (vm === null) {
                body = '<div class="empty">No app kernel yet. Mount a vault (sg.vault.mount) to populate the audit.</div>';
            } else if (vm === 'loading') {
                body = '<div class="empty">Polling kernels…</div>';
            } else {
                var s = vm.summary;
                var summaryHtml =
                    '<div class="sum">' +
                        '<span>' + s.kernels + ' kernel' + (s.kernels === 1 ? '' : 's') + '</span>' +
                        '<span class="s-mon">' + s.available + ' monitored</span>' +
                        (s.closed ? '<span class="s-clo">' + s.closed + ' closed</span>' : '') +
                        '<span>' + s.total + ' ops</span>' +
                        '<span class="s-ok">' + s.ok + ' ok</span>' +
                        (s.denied  ? '<span class="s-deny">' + s.denied  + ' denied</span>'  : '') +
                        (s.errors  ? '<span class="s-err">'  + s.errors  + ' err</span>'     : '') +
                        (s.pending ? '<span class="s-pend">' + s.pending + ' pending</span>' : '') +
                    '</div>';

                var sourcesHtml = vm.sources.length === 0
                    ? '<div class="empty">No kernels.</div>'
                    : vm.sources.map(function (src) {
                        return '<div class="krow k-' + esc(src.monitor) + '">' +
                            '<span class="klabel">' + esc(src.label) + '</span>' +
                            '<span class="kmon">' + esc(MON_LABEL[src.monitor] || src.monitor) + '</span>' +
                            '<span class="kcnt">' + src.mountCount + ' mnt</span>' +
                            '<span class="kcnt">' + (src.available ? src.entryCount + ' ops' : '—') + '</span>' +
                            (src.placeholder ? '<span class="kph" title="' + esc(src.placeholder) + '">' + esc(src.placeholder) + '</span>' : '') +
                            '</div>';
                    }).join('');

                var logHtml = vm.log.length === 0
                    ? '<div class="empty">No relayed operations across monitored kernels yet.</div>'
                    : vm.log.map(function (r) {
                        return '<div class="lrow l-' + r.cls + '">' +
                            '<span class="lt">'    + esc(fmtTime(r.ts)) + '</span>' +
                            '<span class="lic">'   + r.icon + '</span>' +
                            '<span class="lk">'    + esc(r.kernelLabel) + '</span>' +
                            '<span class="ledge">' + esc(r.edge) + '</span>' +
                            '<span class="lpath">' + esc(r.path) + '</span>' +
                            '<span class="lres">'  + esc(r.result) + '</span>' +
                            '</div>';
                    }).join('');

                body =
                    summaryHtml +
                    '<div class="section-h">Kernels</div>' + sourcesHtml +
                    '<div class="section-h">Merged broker log</div>' + logHtml;
            }

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; font-family:monospace; }
                    .bar { display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.5rem; border-bottom:1px solid #1c1c38; flex:0 0 auto; }
                    .bar .title { color:#4ECDC4; font-size:0.7rem; font-weight:600; letter-spacing:0.05em; }
                    .da-refresh { background:none; border:1px solid #2a2a4a; color:#6a7888; border-radius:3px; font-size:0.65rem; padding:0.1rem 0.4rem; cursor:pointer; }
                    .da-refresh:hover { color:#8892a4; border-color:#3a3a5a; }
                    .scroll { flex:1; overflow-y:auto; padding:0.4rem; }
                    .section-h { color:#5a6478; font-size:0.62rem; text-transform:uppercase; letter-spacing:0.08em; margin:0.5rem 0 0.25rem; }
                    .empty { color:#4a5568; font-size:0.7rem; padding:0.6rem; text-align:center; line-height:1.5; }
                    .sum { display:flex; flex-wrap:wrap; gap:0.6rem; padding:0.25rem 0.3rem; font-size:0.65rem; color:#5a6478; }
                    .sum .s-mon { color:#4ade80; } .sum .s-clo { color:#fbbf24; }
                    .sum .s-ok { color:#4ade80; } .sum .s-deny { color:#fbbf24; } .sum .s-err { color:#ff6b6b; } .sum .s-pend { color:#60a5fa; }
                    .krow { display:flex; gap:0.4rem; padding:0.18rem 0.3rem; font-size:0.68rem; border-radius:3px; align-items:baseline; }
                    .krow:hover { background:rgba(255,255,255,0.04); }
                    .klabel { flex:0 0 9rem; color:#9b8cff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .kmon { flex:0 0 6rem; font-size:0.62rem; }
                    .k-top .kmon, .k-opt-in .kmon { color:#4ade80; }
                    .k-closed .kmon { color:#fbbf24; }
                    .k-unreachable .kmon { color:#ff6b6b; }
                    .kcnt { flex:0 0 4rem; color:#5a6478; text-align:right; }
                    .kph { flex:1 0 100%; color:#5a6478; font-size:0.6rem; padding-left:9.4rem; }
                    .lrow { display:flex; gap:0.35rem; padding:0.16rem 0.3rem; font-size:0.66rem; border-radius:3px; align-items:baseline; }
                    .lrow:hover { background:rgba(255,255,255,0.04); }
                    .l-err  .lres { color:#ff6b6b; } .l-err .lpath { color:#d88; }
                    .l-ok   .lres { color:#4ade80; }
                    .l-pending .lres { color:#60a5fa; }
                    .lt   { flex:0 0 5.5rem; color:#3a4558; }
                    .lic  { flex:0 0 1.2rem; }
                    .lk   { flex:0 0 6rem; color:#9b8cff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .ledge{ flex:0 0 6rem; color:#6a7888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .lpath{ flex:1; color:#8892a4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .lres { flex:0 0 5rem; text-align:right; color:#8892a4; }
                </style>
                <div class="bar">
                    <span class="title">🛡️ Cross-kernel Audit</span>
                    <button class="da-refresh" title="Re-poll kernels">↻</button>
                </div>
                <div class="scroll">${body}</div>
            `;
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (scroll) scroll.scrollTop = 0;
        }
    }

    if (typeof customElements !== 'undefined' && !customElements.get('app-debug-audit')) {
        customElements.define('app-debug-audit', AppDebugAudit);
    }
})();
