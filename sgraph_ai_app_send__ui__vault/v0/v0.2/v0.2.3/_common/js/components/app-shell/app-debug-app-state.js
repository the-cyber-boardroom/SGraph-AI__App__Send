/* =================================================================================
   SGraph App — Debug: App State  (app-debug-app-state)
   v0.2.3 — Polls app-shell.getDebugState() and renders a formatted state view.
   ================================================================================= */
(function () {
    'use strict';

    class AppDebugAppState extends HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this._interval = null; }

        connectedCallback() {
            this._refresh();
            this._interval = setInterval(() => this._refresh(), 1000);
        }

        disconnectedCallback() {
            if (this._interval) { clearInterval(this._interval); this._interval = null; }
        }

        _refresh() {
            var shell = document.querySelector('app-shell');
            var state = shell && typeof shell.getDebugState === 'function' ? shell.getDebugState() : null;
            this._render(state);
        }

        _render(state) {
            if (!state) {
                this.shadowRoot.innerHTML = `
                    <style>:host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#0a0a18;}</style>
                    <div style="color:#4a5568;font-size:0.75rem;">app-shell not found or getDebugState() unavailable</div>
                `;
                return;
            }

            var appJson   = state.appJson;
            var timing    = state.timing || {};
            var resources = state.resourcesLoaded || [];

            var timingRows = '';
            var tStart = timing.start || 0;
            var timingItems = [
                { k: 'start',           label: 'Page init' },
                { k: 'vaultOpened',     label: 'Vault opened' },
                { k: 'treeLoaded',      label: 'Tree loaded' },
                { k: 'appJsonFetched',  label: 'app.json' },
                { k: 'resourcesLoaded', label: 'Resources' },
                { k: 'iframeReady',     label: 'Iframe ready' },
            ];
            timingItems.forEach(function (item) {
                if (timing[item.k] == null) return;
                var ms = tStart ? Math.round(timing[item.k] - tStart) : '—';
                timingRows += '<div class="kv"><span class="k">' + item.label + '</span><span class="v mono">' + ms + 'ms</span></div>';
            });

            var appJsonSection = '';
            if (appJson) {
                var fields = [
                    { k: 'entry',   v: appJson.entry   || 'index.html' },
                    { k: 'title',   v: appJson.title   || '—' },
                    { k: 'hud',     v: appJson.hud     != null ? String(appJson.hud) : '—' },
                    { k: 'auth',    v: appJson.auth    ? (appJson.auth.required ? 'required' : 'optional') : 'none' },
                    { k: 'css',     v: (appJson.resources && appJson.resources.css && appJson.resources.css.length) || 0 },
                    { k: 'js',      v: (appJson.resources && appJson.resources.js  && appJson.resources.js.length)  || 0 },
                ];
                appJsonSection = '<div class="section"><div class="section-title">app.json</div>' +
                    fields.map(function (f) {
                        return '<div class="kv"><span class="k">' + _esc(f.k) + '</span><span class="v mono">' + _esc(String(f.v)) + '</span></div>';
                    }).join('') + '</div>';
            } else {
                appJsonSection = '<div class="section"><div class="section-title">app.json</div><span class="na">not found</span></div>';
            }

            var resSection = '<div class="section"><div class="section-title">Resources loaded</div>' +
                (resources.length === 0 ? '<span class="na">none</span>' :
                    resources.map(function (r) {
                        return '<div class="kv"><span class="k type-badge type-' + r.type + '">' + r.type + '</span><span class="v mono">' + _esc(r.path) + '</span></div>';
                    }).join('')) + '</div>';

            var statusClass = state.iframeStatus === 'ready'   ? 'status-ok'
                            : state.iframeStatus === 'error'   ? 'status-err'
                            : state.iframeStatus === 'loading' ? 'status-loading' : '';

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; font-family:-apple-system,sans-serif; }
                    .scroll { flex:1; overflow-y:auto; padding:0.75rem; }
                    .section { margin-bottom:1rem; }
                    .section-title { font-size:0.65rem; text-transform:uppercase; letter-spacing:0.08em; color:#3a4568; font-weight:600; margin-bottom:0.4rem; }
                    .kv { display:flex; gap:0.5rem; margin-bottom:0.2rem; align-items:baseline; }
                    .k { font-size:0.7rem; color:#4a5568; min-width:80px; flex:0 0 80px; }
                    .v { font-size:0.75rem; color:#8892a4; word-break:break-all; }
                    .mono { font-family:monospace; }
                    .na { font-size:0.75rem; color:#3a4558; font-style:italic; }
                    .status-badge { display:inline-block; font-size:0.7rem; padding:0.1rem 0.5rem; border-radius:9999px; font-weight:600; }
                    .status-ok      { background:rgba(78,205,196,0.12); color:#4ECDC4; }
                    .status-err     { background:rgba(255,107,107,0.12); color:#ff6b6b; }
                    .status-loading { background:rgba(233,196,69,0.12);  color:#E9C445; }
                    .type-badge { font-size:0.65rem; padding:0 0.3rem; border-radius:3px; font-weight:600; }
                    .type-css { background:rgba(100,160,220,0.15); color:#64a0dc; }
                    .type-js  { background:rgba(233,196,69,0.15);  color:#E9C445; }
                    .writable-yes { color:#4ECDC4; } .writable-no { color:#64a0dc; }
                </style>
                <div class="scroll">
                    <div class="section">
                        <div class="section-title">Status</div>
                        <div class="kv"><span class="k">iframe</span><span class="v"><span class="status-badge ${statusClass}">${_esc(state.iframeStatus || '—')}</span></span></div>
                        <div class="kv"><span class="k">writable</span><span class="v ${state.writable ? 'writable-yes' : 'writable-no'}">${state.writable ? 'yes' : 'no'}</span></div>
                        <div class="kv"><span class="k">entry</span><span class="v mono">${_esc(state.entry || '—')}</span></div>
                    </div>
                    ${appJsonSection}
                    ${resSection}
                    <div class="section">
                        <div class="section-title">Timing (ms from page init)</div>
                        ${timingRows || '<span class="na">not yet</span>'}
                    </div>
                </div>
            `;
        }
    }

    function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    customElements.define('app-debug-app-state', AppDebugAppState);
})();
