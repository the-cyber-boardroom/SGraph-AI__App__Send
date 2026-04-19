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
                        <span class="vh-readonly-badge" style="display:none">Read-only</span>
                        <button class="vh-push-btn" style="display:none" title="Push commits to named branch">Push <span class="vh-ahead-badge"></span></button>
                        <button class="vh-pull-btn" style="display:none" title="Pull commits from named branch">Pull <span class="vh-behind-badge"></span></button>
                        <button class="vh-refresh-btn" title="Refresh vault (load latest commits)">Refresh</button>
                        <button class="vh-upload-btn">Upload</button>
                        <button class="vh-debug-btn">Debug</button>
                        <a class="vh-raw-link" title="View raw vault data" href="#">raw</a>
                        <button class="vh-lock-btn" style="display:none" title="Return to vault list">&#8646; Vaults</button>
                        <span class="vh-version">v0.2.0</span>
                    </div>
                    <div class="vh-loading-bar" style="display:none"><div class="vh-loading-inner"></div></div>
                </header>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.vh-push-btn'))    this._emit('vault-header-push');
                if (e.target.closest('.vh-pull-btn'))    this._emit('vault-header-pull');
                if (e.target.closest('.vh-refresh-btn')) this._emit('vault-header-refresh');
                if (e.target.closest('.vh-upload-btn'))  this._emit('vault-header-upload');
                if (e.target.closest('.vh-lock-btn'))    this._emit('vault-header-lock');
                if (e.target.closest('.vh-debug-btn'))   this._emit('vault-header-debug');
                if (e.target.closest('.vh-raw-link'))   { e.preventDefault(); this._emit('vault-header-raw'); }
                if (e.target.closest('.vh-vault-name') && !e.target.closest('input')) this._startNameEdit();
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
            const badge = this.shadowRoot.querySelector('.vh-readonly-badge');
            if (badge) badge.style.display = isReadOnly ? '' : 'none';
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
            try {
                const resp = await fetch(`${window.location.origin}/api/health`);
                if (resp.ok) {
                    const data = await resp.json();
                    const el = this.shadowRoot.querySelector('.vh-version');
                    const build = window.SGRAPH_BUILD;
                    if (el && build) {
                        el.textContent = `${build.appVersion}  .  UI ${build.uiVersion} (IFD)`;
                    } else if (el && data.version) {
                        el.textContent = `v0.2.0 (IFD) / ${data.version}`;
                    }
                }
            } catch (_) { /* silently fail */ }
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
        .vh-upload-btn, .vh-lock-btn, .vh-debug-btn, .vh-refresh-btn {
            font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family);
        }
        .vh-upload-btn:hover, .vh-lock-btn:hover, .vh-debug-btn:hover, .vh-refresh-btn:hover {
            background: var(--bg-secondary); color: var(--color-text);
        }
        .vh-upload-btn {
            background: var(--color-primary); color: var(--bg-primary);
            border-color: var(--color-primary); font-weight: 600;
        }
        .vh-upload-btn:hover { background: var(--color-primary-hover); color: var(--bg-primary); }
        .vh-raw-link {
            font-size: 0.625rem; color: var(--color-text-secondary);
            text-decoration: none; opacity: 0.6; padding: 0.25rem 0.375rem;
        }
        .vh-raw-link:hover { color: var(--color-primary); opacity: 1; }
        .vh-readonly-badge {
            font-size: var(--text-small); padding: 0.125rem 0.5rem; border-radius: 9999px;
            background: rgba(233, 196, 69, 0.15); color: #E9C445; font-weight: 600;
        }
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
