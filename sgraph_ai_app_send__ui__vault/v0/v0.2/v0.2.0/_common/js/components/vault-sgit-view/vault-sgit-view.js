/* =============================================================================
   SGraph Vault — SGit View Component
   v0.2.0 — Component shell: tabs, event routing, shared helpers, styles

   Companion modules (must load after this file):
     vault-sgit-view--history.js   _renderHistory, _renderCommitRow
     vault-sgit-view--refs.js      _renderRefs
     vault-sgit-view--tree.js      _renderTree, _buildTreeDOM
     vault-sgit-view--branches.js  _renderBranches, _switchBranch
     vault-sgit-view--status.js    _renderStatus
     vault-sgit-view--repair.js    _renderRepair, _runDiagnostics
     vault-sgit-view--object.js    _loadObject, _renderObject, _renderSchema

   Light DOM component.
   ============================================================================= */

(function() {
    'use strict';

    class VaultSgitView extends HTMLElement {

        constructor() {
            super();
            this._vault          = null;
            this._commitCache    = new Map();
            this._activeTab      = 'history';    // 'history' | 'refs' | 'tree' | 'branches' | 'status' | 'repair' | 'object'
            this._objectViewData = null;
        }

        set vault(v) { this._vault = v; }
        get vault()  { return this._vault; }

        connectedCallback() {
            this.innerHTML = `
                <style>${VaultSgitView.styles}</style>
                <div class="sgit">
                    <div class="sgit-header">
                        <h2 class="sgit-title">SGit</h2>
                        <div class="sgit-tabs">
                            <button class="sgit-tab sgit-tab--active" data-tab="history">History</button>
                            <button class="sgit-tab" data-tab="refs">Refs</button>
                            <button class="sgit-tab" data-tab="tree">Tree</button>
                            <button class="sgit-tab" data-tab="branches">Branches</button>
                            <button class="sgit-tab" data-tab="status">Status</button>
                            <button class="sgit-tab sgit-tab--repair" data-tab="repair">Repair</button>
                        </div>
                    </div>
                    <div class="sgit-body">
                        <div class="sgit-empty">Open a vault to see SGit data</div>
                    </div>
                </div>
            `;

            this.addEventListener('click', (e) => {
                const tab = e.target.closest('.sgit-tab');
                if (tab) { this._switchTab(tab.dataset.tab); return; }

                const objLink = e.target.closest('.sgit-obj-link');
                if (objLink) { e.preventDefault(); this._loadObject(objLink.dataset.id); return; }

                const backBtn = e.target.closest('.sgit-back-btn');
                if (backBtn) { this._switchTab(this._prevTab || 'history'); return; }

                const switchBtn = e.target.closest('.sgit-branch-switch');
                if (switchBtn) { this._switchBranch(switchBtn.dataset.refId); return; }
            });
        }

        refresh() {
            if (!this._vault) return;
            this._commitCache.clear();
            this._switchTab(this._activeTab);
        }

        // --- Tab Switching -------------------------------------------------------

        _switchTab(tabId) {
            if (tabId !== 'object') this._prevTab = tabId;
            this._activeTab = tabId;

            this.querySelectorAll('.sgit-tab').forEach(t => {
                t.classList.toggle('sgit-tab--active', t.dataset.tab === tabId);
            });

            const body = this.querySelector('.sgit-body');
            if (!body || !this._vault) return;

            switch (tabId) {
                case 'history':  this._renderHistory(body);  break;
                case 'refs':     this._renderRefs(body);     break;
                case 'tree':     this._renderTree(body);     break;
                case 'branches': this._renderBranches(body); break;
                case 'status':   this._renderStatus(body);   break;
                case 'repair':   this._renderRepair(body);   break;
                case 'object':   this._renderObject(body);   break;
            }
        }

        // --- Shared Helpers -------------------------------------------------------

        _short(id) {
            if (!id) return '--';
            return id.length > 24 ? id.substring(0, 24) + '...' : id;
        }

        _esc(str) {
            const d = document.createElement('div');
            d.textContent = String(str ?? '');
            return d.innerHTML;
        }
    }

    // --- Styles -----------------------------------------------------------------

    VaultSgitView.styles = `
        .sgit { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

        .sgit-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
        .sgit-title { font-size: var(--text-h3, 1.25rem); font-weight: 700; color: var(--color-text); margin: 0; }
        .sgit-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .sgit-tab { font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm, 6px); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .sgit-tab:hover { background: var(--bg-secondary); color: var(--color-text); }
        .sgit-tab--active { background: var(--color-primary); color: var(--bg-primary); border-color: var(--color-primary); }

        .sgit-body { flex: 1; overflow-y: auto; padding: 1rem; }
        .sgit-loading { color: var(--color-text-secondary); font-size: var(--text-sm); padding: 2rem; text-align: center; }
        .sgit-empty { color: var(--color-text-secondary); font-size: var(--text-sm); padding: 1rem 0; }
        .sgit-error { color: var(--color-error, #E94560); font-size: var(--text-sm); padding: 1rem; }

        /* --- Commit History --- */
        .sgit-commit-list { font-size: var(--text-small, 0.75rem); }
        .sgit-commit-header { display: grid; grid-template-columns: 32px 1fr 160px 100px; gap: 0.5rem; padding: 0.375rem 0.5rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--color-border); }
        .sgit-commit-row { display: grid; grid-template-columns: 32px 1fr 160px 100px; gap: 0.5rem; padding: 0.25rem 0.5rem; align-items: center; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.06)); }
        .sgit-commit-row:hover { background: var(--bg-secondary); }
        .sgit-commit-row--head { background: rgba(78, 205, 196, 0.04); }

        .sgit-ch-graph { display: flex; flex-direction: column; align-items: center; position: relative; height: 28px; justify-content: center; overflow: hidden; }
        .sgit-graph-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-primary, #4ECDC4); z-index: 1; flex-shrink: 0; }
        .sgit-graph-dot--head { width: 12px; height: 12px; box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 3px var(--color-primary); }
        .sgit-graph-dot--error { background: var(--color-error, #E94560); }
        .sgit-graph-line-top, .sgit-graph-line-bottom { position: absolute; width: 2px; background: var(--color-primary, #4ECDC4); opacity: 0.3; }
        .sgit-graph-line-top { top: 0; height: 50%; }
        .sgit-graph-line-bottom { bottom: 0; height: 50%; }
        .sgit-graph-line--hidden { display: none; }

        .sgit-ch-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 0.375rem; }
        .sgit-commit-msg { color: var(--color-text); }
        .sgit-commit-tree-link { font-size: 0.625rem; opacity: 0.5; margin-left: auto; flex-shrink: 0; }
        .sgit-commit-tree-link:hover { opacity: 1; }
        .sgit-ch-id { font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; }
        .sgit-ch-date { color: var(--color-text-secondary); text-align: right; }

        .sgit-badge { font-size: 0.625rem; padding: 0.0625rem 0.375rem; border-radius: 3px; font-weight: 600; font-family: var(--font-mono); white-space: nowrap; flex-shrink: 0; }
        .sgit-badge--head { background: var(--color-primary); color: var(--bg-primary); }
        .sgit-badge--branch { background: rgba(78, 205, 196, 0.15); color: var(--color-primary); }
        .sgit-badge--schema { background: rgba(78, 205, 196, 0.15); color: var(--color-primary); display: inline-block; margin-bottom: 1rem; }
        .sgit-badge--current { background: rgba(79, 143, 247, 0.15); color: var(--color-primary); }

        /* --- Refs & Sections --- */
        .sgit-section { margin-bottom: 1.5rem; }
        .sgit-section-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 0.5rem; }
        .sgit-kv-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; font-size: var(--text-sm); }
        .sgit-kv-key { color: var(--color-text-secondary); font-weight: 600; }
        .sgit-kv-value { color: var(--color-text); }
        .sgit-mono { font-family: var(--font-mono, monospace); font-size: var(--text-small); }

        /* --- Two-track diverged graph --- */
        .sgit-commit-list--two .sgit-commit-header,
        .sgit-commit-list--two .sgit-commit-row,
        .sgit-commit-header--two,
        .sgit-commit-row--two { grid-template-columns: 48px 1fr 160px 100px; }
        .sgit-ch-graph--two { width: 48px; height: 28px; position: relative; overflow: visible; }
        .sgit-gt { position: absolute; top: 0; bottom: 0; width: 20px; display: flex; flex-direction: column; align-items: center; }
        .sgit-gt--clone { left: 2px; }
        .sgit-gt--named { right: 2px; }
        .sgit-gt-line { width: 2px; flex: 1; opacity: 0.4; }
        .sgit-gt-line--hidden { visibility: hidden; }
        .sgit-gt-spacer { width: 10px; height: 10px; flex-shrink: 0; }
        .sgit-gt-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; z-index: 1; }
        .sgit-gt-dot--head { width: 12px; height: 12px; }
        .sgit-commit-row--fork { background: rgba(69,183,209,0.04); }
        .sgit-fork-banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(69,183,209,0.06); border: 1px solid rgba(69,183,209,0.2); border-radius: 6px; margin-bottom: 0.75rem; font-size: var(--text-small); flex-wrap: wrap; }
        .sgit-fork-lane { font-weight: 700; white-space: nowrap; }
        .sgit-fork-lane--clone { color: #4ECDC4; }
        .sgit-fork-lane--named { color: #45b7d1; }
        .sgit-fork-desc { color: var(--color-text-secondary); flex: 1; }
        .sgit-badge--named-head { background: rgba(69,183,209,0.2); color: #45b7d1; }
        .sgit-badge--fork { background: rgba(233,196,69,0.15); color: #E9C445; }
        .sgit-badge--merge-head { background: rgba(78,205,196,0.25); color: #4ECDC4; }

        /* --- Branches --- */
        .sgit-branch-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .sgit-branch-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; border: 1px solid var(--color-border); border-radius: 6px; background: var(--bg-surface); }
        .sgit-branch-row:hover { background: var(--bg-secondary); }
        .sgit-branch-icon { font-size: 1rem; flex-shrink: 0; }
        .sgit-branch-info { flex: 1; min-width: 0; }
        .sgit-branch-name { font-weight: 600; color: var(--color-text); font-size: var(--text-sm); }
        .sgit-branch-meta { font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); margin-top: 0.125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sgit-branch-switch { font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); font-weight: 600; flex-shrink: 0; }
        .sgit-branch-switch:hover { background: var(--color-primary); color: var(--bg-primary); border-color: var(--color-primary); }
        .sgit-branch-switch:disabled { opacity: 0.4; cursor: default; }

        /* --- Object links --- */
        .sgit-obj-link { color: var(--color-primary, #4ECDC4); text-decoration: none; font-family: var(--font-mono); font-size: inherit; cursor: pointer; }
        .sgit-obj-link:hover { text-decoration: underline; }

        /* --- Object Viewer --- */
        .sgit-object-viewer { display: flex; flex-direction: column; height: 100%; }
        .sgit-obj-header { display: flex; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); margin-bottom: 0.75rem; }
        .sgit-back-btn { font-size: var(--text-small); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); }
        .sgit-back-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
        .sgit-obj-path { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-text); font-weight: 600; flex: 1; }
        .sgit-obj-size { font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); }

        .sgit-obj-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
        .sgit-obj-tab { font-size: var(--text-sm); padding: 0.375rem 0.75rem; border: none; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); border-bottom: 2px solid transparent; }
        .sgit-obj-tab:hover { color: var(--color-text); }
        .sgit-obj-tab--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
        .sgit-obj-content { flex: 1; overflow-y: auto; }

        /* --- Schema View --- */
        .sgit-schema { }
        .sgit-schema-field { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.08)); }
        .sgit-schema-label { font-size: var(--text-small); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
        .sgit-schema-value { font-size: var(--text-sm); color: var(--color-text); font-family: var(--font-mono); }

        .sgit-schema-entries { }
        .sgit-schema-entry { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.06)); font-size: var(--text-sm); }
        .sgit-schema-entry:hover { background: var(--bg-secondary); }
        .sgit-entry-icon { color: var(--color-text-secondary); font-weight: 600; width: 1rem; text-align: center; flex-shrink: 0; }
        .sgit-entry-name { font-family: var(--font-mono); color: var(--color-text); flex: 1; }
        .sgit-entry-size { font-family: var(--font-mono); color: var(--color-text-secondary); font-size: var(--text-small); }
        .sgit-entry-link { font-size: var(--text-small); flex-shrink: 0; }

        /* --- Status Tab --- */
        .sgit-status-view { max-width: 700px; }
        .sgit-section-header { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.5rem; }
        .sgit-section-header .sgit-section-title { margin: 0; }
        .sgit-status-badge { font-size: var(--text-small, 0.75rem); padding: 0.125rem 0.5rem; border-radius: 9999px; font-weight: 600; white-space: nowrap; }
        .sgit-status-badge--ok       { background: rgba(78,205,196,0.15); color: var(--color-primary, #4ECDC4); }
        .sgit-status-badge--pending  { background: rgba(233,196,69,0.15); color: #E9C445; }
        .sgit-status-badge--error    { background: rgba(233,69,96,0.15); color: #E94560; }
        .sgit-status-badge--readonly { background: rgba(255,255,255,0.08); color: var(--color-text-secondary); }
        .sgit-status-hint { font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary); margin: 0 0 0.75rem; line-height: 1.5; }
        .sgit-status-kv { margin-top: 0.25rem; }
        .sgit-status-kv .sgit-kv-key { min-width: 160px; }
        .sgit-error-inline { color: var(--color-error, #E94560); }
        .sgit-status-hr { border: none; border-top: 1px solid var(--color-border, rgba(78,205,196,0.12)); margin: 1rem 0; }
        .sgit-status-stats { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.5rem; }
        .sgit-stat-card { padding: 0.75rem 1.25rem; background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; text-align: center; min-width: 100px; }
        .sgit-stat-value { font-size: var(--text-h3, 1.25rem); font-weight: 700; color: var(--color-text); font-family: var(--font-mono); }
        .sgit-stat-label { font-size: var(--text-small, 0.75rem); color: var(--color-text-secondary); margin-top: 0.25rem; }

        /* --- Repair Tab --- */
        .sgit-tab--repair { border-color: rgba(233,69,96,0.4); }
        .sgit-tab--repair.sgit-tab--active { background: #E94560; border-color: #E94560; }
        .sgit-repair-view { max-width: 720px; }
        .sgit-diag-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .sgit-diag-row { display: grid; grid-template-columns: 1.25rem 10rem 1fr; gap: 0.5rem; align-items: baseline; font-size: var(--text-sm); padding: 0.1875rem 0; }
        .sgit-diag-icon { font-weight: 700; text-align: center; font-size: 0.8rem; }
        .sgit-diag-label { font-weight: 600; color: var(--color-text); }
        .sgit-diag-detail { color: var(--color-text-secondary); font-family: var(--font-mono); font-size: var(--text-small); }
        .sgit-diag--ok    .sgit-diag-icon { color: #4ECDC4; }
        .sgit-diag--warn  .sgit-diag-icon { color: #E9C445; }
        .sgit-diag--error .sgit-diag-icon { color: #E94560; }
        .sgit-diag--info  .sgit-diag-icon { color: var(--color-text-secondary); }
        .sgit-repair-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; }
        .sgit-repair-card { border: 1px solid var(--color-border); border-radius: 8px; padding: 0.875rem 1rem; background: var(--bg-surface); }
        .sgit-repair-card--destructive { border-color: rgba(233,69,96,0.35); background: rgba(233,69,96,0.03); }
        .sgit-repair-card-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
        .sgit-repair-title { font-weight: 700; font-size: var(--text-sm); color: var(--color-text); }
        .sgit-repair-badge { font-size: 0.625rem; padding: 0.1rem 0.45rem; border-radius: 9999px; font-weight: 600; flex-shrink: 0; }
        .sgit-repair-badge--safe   { background: rgba(78,205,196,0.15); color: #4ECDC4; }
        .sgit-repair-badge--danger { background: rgba(233,69,96,0.15); color: #E94560; }
        .sgit-repair-cli { font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); background: var(--bg-secondary); padding: 0.1rem 0.45rem; border-radius: 4px; margin-left: auto; flex-shrink: 0; }
        .sgit-repair-desc { font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: 4px; padding: 0.5rem 0.75rem; margin: 0 0 0.625rem; white-space: pre-wrap; word-break: break-all; }
        .sgit-repair-manual { margin-bottom: 0.625rem; }
        .sgit-repair-input { width: 100%; padding: 0.3rem 0.625rem; background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); font-family: var(--font-mono); font-size: var(--text-sm); box-sizing: border-box; }
        .sgit-repair-confirm-zone { background: rgba(233,69,96,0.07); border: 1px solid rgba(233,69,96,0.3); border-radius: 6px; padding: 0.625rem 0.75rem; margin-bottom: 0.5rem; }
        .sgit-repair-confirm-msg { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 0.5rem; line-height: 1.5; }
        .sgit-repair-run-btn { padding: 0.3rem 0.75rem; background: #E94560; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: var(--text-sm); font-weight: 600; margin-right: 0.5rem; font-family: var(--font-family); }
        .sgit-repair-run-btn:hover { background: #c73650; }
        .sgit-repair-cancel-btn { padding: 0.3rem 0.75rem; background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; font-size: var(--text-sm); font-family: var(--font-family); }
        .sgit-repair-show-btn { padding: 0.3rem 0.875rem; background: transparent; border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); font-family: var(--font-family); }
        .sgit-repair-show-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
        .sgit-repair-result { font-size: var(--text-sm); padding: 0.4rem 0.625rem; border-radius: 6px; margin-bottom: 0.5rem; font-family: var(--font-mono); }
        .sgit-repair-result--ok      { background: rgba(78,205,196,0.1); color: #4ECDC4; }
        .sgit-repair-result--error   { background: rgba(233,69,96,0.1); color: #E94560; }
        .sgit-repair-result--running { background: var(--bg-secondary); color: var(--color-text-secondary); }

        /* --- Shared --- */
        .sgit-json { background: var(--bg-secondary); padding: 1rem; border-radius: 6px; font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); overflow-x: auto; max-height: 400px; overflow-y: auto; border: 1px solid var(--color-border); margin: 0; white-space: pre-wrap; word-break: break-all; }
        .sgit-table { width: 100%; border-collapse: collapse; font-size: var(--text-small); }
        .sgit-table th { text-align: left; font-weight: 600; color: var(--color-text-secondary); padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--color-border); }
        .sgit-table td { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.08)); color: var(--color-text); }
        .sgit-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .sgit-interactive-tree { background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; padding: 0.5rem 0; max-height: 400px; overflow-y: auto; }
        .sgit-tree-row { display: flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.5rem; font-size: var(--text-small); color: var(--color-text); white-space: nowrap; }
        .sgit-tree-row:hover { background: rgba(78,205,196,0.05); }
        .sgit-tree-chevron { font-size: 0.6rem; flex-shrink: 0; width: 0.75rem; text-align: center; color: var(--color-text-secondary); }
        .sgit-tree-icon { flex-shrink: 0; font-size: 0.875rem; }
        .sgit-tree-name { font-family: var(--font-mono); color: var(--color-text); }
        .sgit-tree-meta { font-family: var(--font-mono); color: var(--color-text-secondary); font-size: 0.625rem; margin-left: 0.5rem; }
    `;

    // Expose globally so companion modules (vault-sgit-view--*.js) can extend the prototype
    window.VaultSgitView = VaultSgitView;
    customElements.define('vault-sgit-view', VaultSgitView);
})();
