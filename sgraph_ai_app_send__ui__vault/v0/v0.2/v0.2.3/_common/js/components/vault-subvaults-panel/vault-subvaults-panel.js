/* =================================================================================
   <vault-subvaults-panel> — /vault debug pane "Sub-vaults" tab

   The /vault analogue of the /app ViV "Mounts" tab. /vault has no kernel/broker, so
   instead of cross-vault relay traffic we surface the read-through *.link.json
   sub-vaults registered in the active CompositeDataSource. Data comes from
   window.sgraphVault.shell._dataSource._mounts; all shaping is VaultSubvaultsView
   (pure, unit-tested). Re-renders on vault open / tree change and on manual Refresh.
   ================================================================================= */
(function () {
    'use strict';

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    class VaultSubvaultsPanel extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._handler = null; }

        connectedCallback() {
            this._refresh();
            this._handler = () => this._refresh();
            try {
                var ev = window.sgraphVault && window.sgraphVault.events;
                if (ev && typeof ev.on === 'function') {
                    ev.on('vault-opened',   this._handler);
                    ev.on('tree-changed',   this._handler);
                    ev.on('vault-locked',   this._handler);
                }
            } catch (_) {}
            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.sv-refresh')) this._refresh();
            });
        }

        disconnectedCallback() {
            try {
                var ev = window.sgraphVault && window.sgraphVault.events;
                if (ev && typeof ev.off === 'function' && this._handler) {
                    ev.off('vault-opened', this._handler);
                    ev.off('tree-changed', this._handler);
                    ev.off('vault-locked', this._handler);
                }
            } catch (_) {}
        }

        _mounts() {
            try {
                var shell = window.sgraphVault && window.sgraphVault.shell;
                var ds    = shell && shell._dataSource;
                if (ds && ds._mounts && typeof ds._mounts.values === 'function') {
                    return Array.from(ds._mounts.values());
                }
            } catch (_) {}
            return [];
        }

        _refresh() {
            var V  = globalThis.VaultSubvaultsView;
            var vm = V ? V.build(this._mounts()) : { rows: [], summary: { total: 0, open: 0, collapsed: 0, locked: 0, errors: 0 } };
            this._render(vm);
        }

        _render(vm) {
            var rowsHtml = vm.rows.length === 0
                ? '<div class="empty">No sub-vaults. A vault with a <code>*.link.json</code> sub-vault appears here (read-through, no kernel/broker in /vault).</div>'
                : vm.rows.map(function (r) {
                    var fc = r.fileCount == null ? '' : (r.fileCount + ' file' + (r.fileCount === 1 ? '' : 's'));
                    return '<div class="srow s-' + r.statusClass + '">' +
                        '<span class="sname">' + esc(r.nodeName) + '</span>' +
                        '<span class="spath">' + esc(r.mountPath) + '</span>' +
                        '<span class="sacc">'  + esc(r.access) + '</span>' +
                        '<span class="sstat">' + esc(r.statusLabel) + '</span>' +
                        '<span class="scnt">'  + esc(fc) + '</span>' +
                        (r.error ? '<span class="serr" title="' + esc(r.error) + '">' + esc(r.error) + '</span>' : '') +
                        '</div>';
                }).join('');

            var s = vm.summary;
            var summaryHtml = vm.rows.length === 0 ? '' :
                '<div class="sum">' +
                    '<span>' + s.total + ' sub-vault' + (s.total === 1 ? '' : 's') + '</span>' +
                    (s.open      ? '<span class="s-ok">'   + s.open      + ' open</span>'       : '') +
                    (s.collapsed ? '<span class="s-pend">' + s.collapsed + ' not opened</span>' : '') +
                    (s.locked    ? '<span class="s-err">'  + s.locked    + ' locked</span>'     : '') +
                    (s.errors    ? '<span class="s-err">'  + s.errors    + ' error</span>'      : '') +
                '</div>';

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; font-family:monospace; }
                    .bar { display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.5rem; border-bottom:1px solid #1c1c38; flex:0 0 auto; }
                    .bar .title { color:#4ECDC4; font-size:0.7rem; font-weight:600; letter-spacing:0.05em; }
                    .sv-refresh { background:none; border:1px solid #2a2a4a; color:#6a7888; border-radius:3px; font-size:0.65rem; padding:0.1rem 0.4rem; cursor:pointer; }
                    .sv-refresh:hover { color:#8892a4; border-color:#3a3a5a; }
                    .scroll { flex:1; overflow-y:auto; padding:0.4rem; }
                    .empty { color:#4a5568; font-size:0.7rem; padding:0.6rem; text-align:center; line-height:1.5; }
                    .empty code { color:#6a7888; }
                    .sum { display:flex; gap:0.6rem; padding:0.25rem 0.3rem; font-size:0.65rem; color:#5a6478; }
                    .sum .s-ok { color:#4ade80; } .sum .s-pend { color:#60a5fa; } .sum .s-err { color:#ff6b6b; }
                    .srow { display:flex; gap:0.4rem; padding:0.18rem 0.3rem; font-size:0.68rem; border-radius:3px; align-items:baseline; }
                    .srow:hover { background:rgba(255,255,255,0.04); }
                    .sname { flex:0 0 7rem; color:#9b8cff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .spath { flex:1; color:#4ECDC4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .sacc  { flex:0 0 2.5rem; color:#5a6478; text-align:right; }
                    .sstat { flex:0 0 5rem; text-align:right; color:#8892a4; }
                    .scnt  { flex:0 0 4.5rem; text-align:right; color:#5a6478; }
                    .serr  { flex:0 0 100%; color:#ff6b6b; font-size:0.62rem; padding-left:0.3rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                    .s-ok   .sstat { color:#4ade80; }
                    .s-pend .sstat { color:#60a5fa; }
                    .s-err  .sstat { color:#ff6b6b; }
                </style>
                <div class="bar">
                    <span class="title">🔗 Sub-vaults</span>
                    <button class="sv-refresh" title="Refresh">↻</button>
                </div>
                <div class="scroll">
                    ${summaryHtml}
                    ${rowsHtml}
                </div>
            `;
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (scroll) scroll.scrollTop = 0;
        }
    }

    if (typeof customElements !== 'undefined' && !customElements.get('vault-subvaults-panel')) {
        customElements.define('vault-subvaults-panel', VaultSubvaultsPanel);
    }
})();
