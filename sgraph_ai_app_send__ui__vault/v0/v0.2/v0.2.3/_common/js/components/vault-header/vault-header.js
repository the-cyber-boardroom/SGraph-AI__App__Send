/* =================================================================================
   SGraph Vault -- Header Bar Component
   v0.2.0 -- brand, vault name, upload button, debug toggle, lock, version display

   Shadow DOM component. Emits events (composed: true) for shell to handle:
     'vault-header-upload'   -- Upload button clicked
     'vault-header-lock'     -- Lock button clicked
     'vault-header-debug'    -- Debug toggle clicked
     'vault-header-raw'      -- Raw vault link clicked
   ================================================================================= */

(function() {
    'use strict';

    class VaultHeader extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultHeader.styles}</style>
                <header class="vh-header">
                    <div class="vh-title">
                        <span class="vh-brand">SG<span class="vh-slash">/</span>Vault</span>
                        <span class="vh-vault-name"></span>
                    </div>
                    <div class="vh-right">
                        <span class="vh-readonly-badge" style="display:none" title="Click to enter access key and enable write access">
                            Read-only
                            <button class="vh-unlock-btn" title="Enter access key">&#128275;</button>
                        </span>
                        <span class="vh-ro-badge" style="display:none" title="Opened with a read-only token — cannot modify this vault">
                            &#128065; Read-only
                        </span>
                        <div class="vh-unlock-panel" style="display:none">
                            <input class="vh-unlock-input" type="password" placeholder="Access key…" autocomplete="off">
                            <button class="vh-unlock-apply">Apply</button>
                            <button class="vh-unlock-cancel" title="Cancel">&#10005;</button>
                            <span class="vh-unlock-status"></span>
                        </div>
                        <div class="vh-sync-section">
                            <button class="vh-check-btn" title="Check server for new commits">&#8635;</button>
                            <button class="vh-push-btn" style="display:none" title="Push commits to named branch">Push <span class="vh-ahead-badge"></span></button>
                            <button class="vh-pull-btn" style="display:none" title="Pull commits from named branch">Pull <span class="vh-behind-badge"></span></button>
                            <button class="vh-refresh-btn" title="Reload vault from server (fetch latest commits)">Refresh</button>
                        </div>
                        <button class="vh-upload-btn">Upload</button>
                        <button class="vh-debug-btn">Debug</button>
                        <button class="vh-open-app-btn" style="display:none" title="Open app">&#9654; Open App</button>
                        <a class="vh-raw-link" title="View raw vault data" href="#">raw</a>
                        <button class="vh-lock-btn" style="display:none" title="Return to vault list">&#8646; Vaults</button>
                        <span class="vh-version">v0.2.0</span>
                    </div>
                    <div class="vh-loading-bar" style="display:none"><div class="vh-loading-inner"></div></div>
                </header>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.vh-check-btn'))    this._emit('vault-header-check');
                if (e.target.closest('.vh-push-btn'))    this._emit('vault-header-push');
                if (e.target.closest('.vh-pull-btn'))    this._emit('vault-header-pull');
                if (e.target.closest('.vh-refresh-btn')) this._emit('vault-header-refresh');
                if (e.target.closest('.vh-upload-btn'))  this._emit('vault-header-upload');
                if (e.target.closest('.vh-lock-btn'))    this._emit('vault-header-lock');
                if (e.target.closest('.vh-debug-btn'))   this._emit('vault-header-debug');
                if (e.target.closest('.vh-raw-link'))   { e.preventDefault(); this._emit('vault-header-raw'); }
                if (e.target.closest('.vh-open-app-btn')) this._openApp();
                if (e.target.closest('.vh-vault-name') && !e.target.closest('input')) this._startNameEdit();
                if (e.target.closest('.vh-readonly-badge') || e.target.closest('.vh-unlock-btn')) this._showUnlockPanel();
                if (e.target.closest('.vh-unlock-apply'))  this._applyUnlock();
                if (e.target.closest('.vh-unlock-cancel')) this._hideUnlockPanel();
            });

            this.shadowRoot.addEventListener('keydown', (e) => {
                if (!e.target.closest('.vh-unlock-input')) return;
                if (e.key === 'Enter')  this._applyUnlock();
                if (e.key === 'Escape') this._hideUnlockPanel();
            });

            this._fetchAppVersion();
        }

        // --- Public API ---

        setVaultName(name) {
            const el = this.shadowRoot.querySelector('.vh-vault-name');
            if (el) { el.textContent = name || ''; this._vaultName = name || ''; }
        }

        _startNameEdit() {
            const span = this.shadowRoot.querySelector('.vh-vault-name');
            if (!span || span.querySelector('input')) return;
            const current = span.textContent;
            span.textContent = '';
            const input = document.createElement('input');
            input.className = 'vh-vault-name-input';
            input.value = current;
            input.size = Math.max(current.length + 4, 20);
            input.addEventListener('input', () => { input.size = Math.max(input.value.length + 4, 20); });
            span.appendChild(input);
            input.focus();
            input.select();

            const commit = () => {
                const val = input.value.trim();
                span.textContent = val || current;
                this._vaultName = span.textContent;
                if (val && val !== current) this._emit('vault-header-rename', { name: val });
            };
            const cancel = () => { span.textContent = current; };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });
            input.addEventListener('blur', commit);
        }

        setReadOnly(isReadOnly) {
            this._isReadOnly = isReadOnly;
            const badge = this.shadowRoot.querySelector('.vh-readonly-badge');
            if (badge) badge.style.display = isReadOnly ? '' : 'none';
            if (!isReadOnly) this._hideUnlockPanel();
        }

        // True RO mode: vault opened via ro-token. Shows distinct badge, hides write controls.
        setROMode(isRO) {
            this._isROMode = isRO;
            const roBadge   = this.shadowRoot.querySelector('.vh-ro-badge');
            const rwBadge   = this.shadowRoot.querySelector('.vh-readonly-badge');
            const syncSec   = this.shadowRoot.querySelector('.vh-sync-section');
            const uploadBtn = this.shadowRoot.querySelector('.vh-upload-btn');
            if (roBadge)   roBadge.style.display   = isRO ? '' : 'none';
            if (rwBadge)   rwBadge.style.display    = 'none';   // suppress the old "unlock" badge
            if (syncSec)   syncSec.style.display    = isRO ? 'none' : '';
            if (uploadBtn) uploadBtn.style.display  = isRO ? 'none' : '';
        }

        _showUnlockPanel() {
            const badge = this.shadowRoot.querySelector('.vh-readonly-badge');
            const panel = this.shadowRoot.querySelector('.vh-unlock-panel');
            const input = this.shadowRoot.querySelector('.vh-unlock-input');
            if (!panel) return;
            if (badge) badge.style.display = 'none';
            panel.style.display = 'flex';
            if (input) { input.value = ''; input.focus(); }
            const status = this.shadowRoot.querySelector('.vh-unlock-status');
            if (status) status.textContent = '';
        }

        _hideUnlockPanel() {
            const panel = this.shadowRoot.querySelector('.vh-unlock-panel');
            if (panel) panel.style.display = 'none';
            // Only restore the badge when cancelling — not after a successful unlock
            // (setReadOnly(false) already hid the badge before calling here)
            if (this._isReadOnly !== false) {
                const badge = this.shadowRoot.querySelector('.vh-readonly-badge');
                if (badge) badge.style.display = '';
            }
        }

        _applyUnlock() {
            const input  = this.shadowRoot.querySelector('.vh-unlock-input');
            const status = this.shadowRoot.querySelector('.vh-unlock-status');
            const key    = input?.value?.trim();
            if (!key) {
                if (status) { status.textContent = 'Key required'; status.style.color = '#ff6b6b'; }
                return;
            }
            if (status) { status.textContent = 'Applying…'; status.style.color = 'var(--color-text-secondary)'; }
            this._emit('vault-settings-access-key', { key });
        }

        showLockButton(show) {
            const btn = this.shadowRoot.querySelector('.vh-lock-btn');
            if (btn) btn.style.display = show ? '' : 'none';
        }

        setAheadCount(n) {
            const btn   = this.shadowRoot.querySelector('.vh-push-btn');
            const badge = this.shadowRoot.querySelector('.vh-ahead-badge');
            if (!btn) return;
            if (n > 0) {
                btn.style.display = '';
                if (badge) badge.textContent = '↑' + n;
                btn.disabled = false;
            } else {
                btn.style.display = 'none';
            }
        }

        setPushBusy(busy) {
            const btn = this.shadowRoot.querySelector('.vh-push-btn');
            if (btn) {
                btn.disabled = busy;
                const badge = this.shadowRoot.querySelector('.vh-ahead-badge');
                if (badge) badge.textContent = busy ? '…' : badge.textContent;
            }
        }

        setDiverged(diverged) {
            const btn = this.shadowRoot.querySelector('.vh-push-btn');
            if (!btn) return;
            if (diverged) {
                btn.classList.add('vh-push-btn--diverged');
                btn.title = 'Vault is diverged — pushing will overwrite published commits. Use Repair tab to merge safely.';
            } else {
                btn.classList.remove('vh-push-btn--diverged');
                btn.title = 'Push commits to named branch';
            }
        }

        setBehindCount(n) {
            const btn   = this.shadowRoot.querySelector('.vh-pull-btn');
            const badge = this.shadowRoot.querySelector('.vh-behind-badge');
            if (!btn) return;
            if (n > 0) {
                btn.style.display = '';
                if (badge) badge.textContent = '↓' + n;
                btn.disabled = false;
            } else {
                btn.style.display = 'none';
            }
        }

        setPullBusy(busy) {
            const btn = this.shadowRoot.querySelector('.vh-pull-btn');
            if (btn) {
                btn.disabled = busy;
                const badge = this.shadowRoot.querySelector('.vh-behind-badge');
                if (badge) badge.textContent = busy ? '…' : badge.textContent;
            }
        }

        setCheckBusy(busy) {
            const btn = this.shadowRoot.querySelector('.vh-check-btn');
            if (!btn) return;
            btn.disabled = busy;
            btn.classList.toggle('vh-check-btn--spinning', busy);
        }

        setRefreshAvailable(show) {
            const btn = this.shadowRoot.querySelector('.vh-refresh-btn');
            if (btn) btn.classList.toggle('vh-refresh-btn--available', show);
        }

        showLoading() {
            const bar = this.shadowRoot.querySelector('.vh-loading-bar');
            if (bar) bar.style.display = '';
        }

        hideLoading() {
            const bar = this.shadowRoot.querySelector('.vh-loading-bar');
            if (bar) bar.style.display = 'none';
        }

        // --- Private ---

        _emit(name, detail) {
            this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || null }));
        }

        async _fetchAppVersion() {
            const el    = this.shadowRoot.querySelector('.vh-version');
            const build = window.SGRAPH_BUILD;
            if (el && build) {
                el.textContent = `${build.appVersion}  .  UI ${build.uiVersion} (IFD)`;
            }
        }

        // Called by vault's _applyAppJson() when app.json is present.
        // Shows the "▶ Open [title]" button that launches /en-gb/app in a new tab.
        setAppJson(config, vaultKey) {
            this._appJsonConfig = config;
            this._appVaultKey   = vaultKey;
            const btn   = this.shadowRoot.querySelector('.vh-open-app-btn');
            if (!btn) return;
            const title = (config && config.title) ? config.title : 'App';
            btn.textContent  = '▶ Open ' + title;
            btn.style.display = '';
        }

        _openApp() {
            if (!this._appVaultKey) return;
            const base = window.location.pathname.split('/en-gb/')[0];
            window.location.assign(base + '/en-gb/app#' + this._appVaultKey);
        }
    }

    VaultHeader.styles = `
        :host { display: block; }
        .vh-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 var(--space-4); background: var(--bg-surface);
            border-bottom: 1px solid var(--color-border); height: 48px;
            position: relative; z-index: 20;
        }
        .vh-title { display: flex; align-items: center; gap: var(--space-3); }
        .vh-brand { font-weight: 700; font-size: var(--text-h3); color: var(--color-text); }
        .vh-slash  { color: var(--color-primary); }
        .vh-vault-name { font-size: var(--text-h3); font-weight: 700; color: var(--color-text); font-family: var(--font-mono); cursor: pointer; border-radius: 3px; padding: 1px 3px; }
        .vh-vault-name:hover { background: var(--bg-secondary); }
        .vh-vault-name-input {
            font-size: var(--text-h3); font-weight: 700; color: var(--color-text); font-family: var(--font-mono);
            background: var(--bg-secondary); border: 1px solid var(--color-primary);
            border-radius: 3px; padding: 1px 4px; outline: none; min-width: 200px; width: auto;
        }
        .vh-right { display: flex; align-items: center; gap: var(--space-2); }
        .vh-version { font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono); }
        .vh-push-btn {
            font-size: var(--text-small); padding: 0.25rem 0.75rem; border-radius: var(--radius-sm);
            border: 1px solid var(--accent, #4ECDC4); background: transparent;
            color: var(--accent, #4ECDC4); cursor: pointer; font-family: var(--font-family);
            font-weight: 600; display: flex; align-items: center; gap: 4px;
        }
        .vh-push-btn:hover:not(:disabled) { background: rgba(78,205,196,0.12); }
        .vh-push-btn:disabled { opacity: 0.5; cursor: default; }
        .vh-push-btn--diverged { border-color: #E9C445; color: #E9C445; }
        .vh-push-btn--diverged:hover:not(:disabled) { background: rgba(233,196,69,0.12); }
        .vh-ahead-badge { font-size: 0.65rem; font-family: var(--font-mono); }
        .vh-pull-btn {
            font-size: var(--text-small); padding: 0.25rem 0.75rem; border-radius: var(--radius-sm);
            border: 1px solid #45b7d1; background: transparent;
            color: #45b7d1; cursor: pointer; font-family: var(--font-family);
            font-weight: 600; display: flex; align-items: center; gap: 4px;
        }
        .vh-pull-btn:hover:not(:disabled) { background: rgba(69,183,209,0.12); }
        .vh-pull-btn:disabled { opacity: 0.5; cursor: default; }
        .vh-behind-badge { font-size: 0.65rem; font-family: var(--font-mono); }
        .vh-upload-btn, .vh-lock-btn, .vh-debug-btn {
            font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family);
        }
        .vh-upload-btn:hover, .vh-lock-btn:hover, .vh-debug-btn:hover {
            background: var(--bg-secondary); color: var(--color-text);
        }
        .vh-sync-section {
            display: flex; align-items: center; gap: var(--space-1);
            padding-left: var(--space-2); margin-left: var(--space-1);
            border-left: 1px solid var(--color-border);
        }
        .vh-check-btn {
            font-size: 1rem; padding: 0.2rem 0.45rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; line-height: 1;
        }
        .vh-check-btn:hover:not(:disabled) { background: var(--bg-secondary); color: var(--color-text); }
        .vh-check-btn:disabled { opacity: 0.5; cursor: default; }
        .vh-check-btn--spinning { animation: vh-spin 0.8s linear infinite; }
        @keyframes vh-spin { to { transform: rotate(360deg); } }
        .vh-refresh-btn {
            font-size: var(--text-small); padding: 0.25rem 0.75rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-primary); background: transparent;
            color: var(--color-primary); cursor: pointer; font-family: var(--font-family); font-weight: 600;
        }
        .vh-refresh-btn:hover { background: rgba(78,205,196,0.12); }
        .vh-refresh-btn--available {
            background: rgba(78,205,196,0.1);
            box-shadow: 0 0 0 1px var(--color-primary);
        }
        .vh-upload-btn {
            background: var(--color-primary); color: var(--bg-primary);
            border-color: var(--color-primary); font-weight: 600;
        }
        .vh-upload-btn:hover { background: var(--color-primary-hover); color: var(--bg-primary); }
        .vh-open-app-btn {
            font-size: var(--text-small); padding: 0.25rem 0.75rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-primary); background: var(--color-primary);
            color: var(--bg-primary, #0a0a18); cursor: pointer; font-family: var(--font-family);
            font-weight: 700; white-space: nowrap;
        }
        .vh-open-app-btn:hover { background: var(--color-primary-hover, #3dbdb5); border-color: var(--color-primary-hover, #3dbdb5); }
        .vh-raw-link {
            font-size: 0.625rem; color: var(--color-text-secondary);
            text-decoration: none; opacity: 0.6; padding: 0.25rem 0.375rem;
        }
        .vh-raw-link:hover { color: var(--color-primary); opacity: 1; }
        .vh-readonly-badge {
            display: flex; align-items: center; gap: 4px;
            font-size: var(--text-small); padding: 0.125rem 0.4rem 0.125rem 0.5rem;
            border-radius: 9999px; background: rgba(233, 196, 69, 0.15);
            color: #E9C445; font-weight: 600; cursor: pointer;
        }
        .vh-readonly-badge:hover { background: rgba(233, 196, 69, 0.25); }
        .vh-ro-badge {
            display: flex; align-items: center; gap: 4px;
            font-size: var(--text-small); padding: 0.125rem 0.6rem;
            border-radius: 9999px; background: rgba(100, 160, 220, 0.15);
            color: #64a0dc; font-weight: 600; cursor: default;
            border: 1px solid rgba(100, 160, 220, 0.25);
        }
        .vh-unlock-btn {
            background: none; border: none; cursor: pointer; padding: 0; font-size: 0.75rem;
            color: #E9C445; line-height: 1;
        }
        .vh-unlock-panel {
            display: flex; align-items: center; gap: 4px;
        }
        .vh-unlock-input {
            font-size: var(--text-small); padding: 0.2rem 0.5rem; width: 160px;
            background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-primary, #4ECDC4);
            border-radius: var(--radius-sm, 4px); color: var(--color-text, #e2e8f0);
            font-family: var(--font-mono); outline: none;
        }
        .vh-unlock-apply {
            font-size: var(--text-small); padding: 0.2rem 0.6rem; border-radius: var(--radius-sm, 4px);
            border: 1px solid var(--color-primary, #4ECDC4); background: transparent;
            color: var(--color-primary, #4ECDC4); cursor: pointer; font-family: var(--font-family);
            font-weight: 600;
        }
        .vh-unlock-apply:hover { background: rgba(78,205,196,0.12); }
        .vh-unlock-cancel {
            font-size: var(--text-small); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm, 4px);
            border: 1px solid var(--color-border, #2a2a4a); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family);
        }
        .vh-unlock-status { font-size: var(--text-small); color: var(--color-text-secondary); }
        .vh-loading-bar {
            position: absolute; bottom: -2px; left: 0; right: 0; height: 2px; overflow: hidden; z-index: 30;
        }
        .vh-loading-inner {
            width: 30%; height: 100%; background: var(--color-primary);
            animation: vh-slide 1.2s ease-in-out infinite;
        }
        @keyframes vh-slide { 0% { transform: translateX(-100%); } 50% { transform: translateX(230%); } 100% { transform: translateX(-100%); } }
    `;

    customElements.define('vault-header', VaultHeader);
})();
