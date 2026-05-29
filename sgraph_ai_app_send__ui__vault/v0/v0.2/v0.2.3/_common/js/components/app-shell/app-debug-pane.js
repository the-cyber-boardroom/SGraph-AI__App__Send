/* =================================================================================
   SGraph App — Debug Pane Component  (app-debug-pane)
   v0.2.3 — Collapsible right-edge debug panel with 4 diagnostic tabs:
     Vault Trace | Bridge Log | App State | Network
   ================================================================================= */
(function () {
    'use strict';

    class AppDebugPane extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._collapsed  = true;
            this._activeTab  = 'vault-trace';
            this._ro         = null;
        }

        connectedCallback() {
            this._render();

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
                if (e.target.closest('.dp-edge-btn')) this._requestExpand();
                if (e.target.closest('.dp-close-btn')) this._requestCollapse();
                var tabBtn = e.target.closest('.dp-tab');
                if (tabBtn) this._switchTab(tabBtn.dataset.tab);
            });
        }

        disconnectedCallback() {
            if (this._ro) this._ro.disconnect();
        }

        _render() {
            if (this._collapsed) {
                this.shadowRoot.innerHTML = `
                    <style>
                        :host { display:flex; width:100%; height:100%; overflow:hidden; cursor:pointer; }
                        .dp-edge-btn {
                            display:flex; align-items:center; justify-content:center;
                            width:100%; min-width:16px; height:100%;
                            background:#12122a; border-left:1px solid #2a2a4a;
                            color:#3a4558; cursor:pointer; user-select:none;
                        }
                        .dp-edge-btn:hover { background:#1a1a3a; color:#6a7888; }
                        .dp-label { writing-mode:vertical-rl; font-size:0.7rem; letter-spacing:0.08em; white-space:nowrap; transform:rotate(180deg); }
                    </style>
                    <div class="dp-edge-btn" title="Open debug panel">
                        <span class="dp-label">&#9654; Debug</span>
                    </div>
                `;
                return;
            }

            var tabs = [
                { id: 'vault-trace', label: '🔓 Vault', tag: 'app-debug-vault-trace' },
                { id: 'bridge-log',  label: '🔌 Bridge', tag: 'app-debug-bridge-log'  },
                { id: 'mounts',      label: '🔗 Mounts', tag: 'app-debug-mounts'       },
                { id: 'app-state',   label: '📊 State',  tag: 'app-debug-app-state'   },
                { id: 'network',     label: '🌐 Net',    tag: 'app-debug-network'      },
            ];
            var activeTab = this._activeTab || 'vault-trace';

            var tabBarHtml = tabs.map(function (t) {
                return '<button class="dp-tab' + (t.id === activeTab ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
            }).join('');

            var panelsHtml = tabs.map(function (t) {
                return '<div class="dp-panel' + (t.id === activeTab ? ' active' : '') + '" data-panel="' + t.id + '">' +
                    '<' + t.tag + '></' + t.tag + '>' +
                    '</div>';
            }).join('');

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; }
                    .dp-header {
                        display:flex; align-items:center; gap:0;
                        background:#12122a; border-bottom:1px solid #2a2a4a; flex:0 0 auto;
                    }
                    .dp-tab-bar { display:flex; flex:1; overflow-x:auto; }
                    .dp-tab-bar::-webkit-scrollbar { height:2px; }
                    .dp-tab {
                        flex:0 0 auto; padding:0.4rem 0.6rem;
                        background:none; border:none; border-bottom:2px solid transparent;
                        color:#4a5568; cursor:pointer; font-size:0.7rem; white-space:nowrap;
                        font-family:-apple-system,sans-serif;
                    }
                    .dp-tab:hover { color:#8892a4; background:rgba(255,255,255,0.03); }
                    .dp-tab.active { color:#4ECDC4; border-bottom-color:#4ECDC4; }
                    .dp-close-btn {
                        flex:0 0 auto; padding:0.35rem 0.5rem;
                        background:none; border:none; border-left:1px solid #2a2a4a;
                        color:#3a4558; cursor:pointer; font-size:0.75rem;
                    }
                    .dp-close-btn:hover { color:#8892a4; background:rgba(255,255,255,0.04); }
                    .dp-content { flex:1; position:relative; overflow:hidden; min-height:0; }
                    .dp-panel { display:none; width:100%; height:100%; }
                    .dp-panel.active { display:flex; flex-direction:column; }
                </style>
                <div class="dp-header">
                    <div class="dp-tab-bar">${tabBarHtml}</div>
                    <button class="dp-close-btn" title="Collapse debug panel">&#9664;</button>
                </div>
                <div class="dp-content">${panelsHtml}</div>
            `;
        }

        _switchTab(tabId) {
            this._activeTab = tabId;
            var root = this.shadowRoot;
            root.querySelectorAll('.dp-tab').forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.tab === tabId);
            });
            root.querySelectorAll('.dp-panel').forEach(function (pane) {
                pane.classList.toggle('active', pane.dataset.panel === tabId);
            });
        }

        _requestExpand() {
            this.dispatchEvent(new CustomEvent('app-debug:toggle', {
                bubbles: true, composed: true,
                detail: { open: true, split: 0.32 }
            }));
        }

        _requestCollapse() {
            this.dispatchEvent(new CustomEvent('app-debug:toggle', {
                bubbles: true, composed: true,
                detail: { open: false, split: 0.32 }
            }));
        }
    }

    customElements.define('app-debug-pane', AppDebugPane);
})();
