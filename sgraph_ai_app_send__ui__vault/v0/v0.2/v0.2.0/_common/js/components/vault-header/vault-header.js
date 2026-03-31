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
                        <button class="vh-refresh-btn" title="Refresh vault (load latest commits)">Refresh</button>
                        <button class="vh-upload-btn">Upload</button>
                        <button class="vh-debug-btn">Debug</button>
                        <a class="vh-raw-link" title="View raw vault data" href="#">raw</a>
                        <button class="vh-lock-btn" style="display:none">Lock</button>
                        <span class="vh-version">v0.2.0</span>
                    </div>
                    <div class="vh-loading-bar" style="display:none"><div class="vh-loading-inner"></div></div>
                </header>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.vh-refresh-btn')) this._emit('vault-header-refresh');
                if (e.target.closest('.vh-upload-btn')) this._emit('vault-header-upload');
                if (e.target.closest('.vh-lock-btn'))   this._emit('vault-header-lock');
                if (e.target.closest('.vh-debug-btn'))  this._emit('vault-header-debug');
                if (e.target.closest('.vh-raw-link'))  { e.preventDefault(); this._emit('vault-header-raw'); }
            });

            this._fetchAppVersion();
        }

        // --- Public API ---

        setVaultName(name) {
            const el = this.shadowRoot.querySelector('.vh-vault-name');
            if (el) el.textContent = name || '';
        }

        setReadOnly(isReadOnly) {
            const badge = this.shadowRoot.querySelector('.vh-readonly-badge');
            if (badge) badge.style.display = isReadOnly ? '' : 'none';
        }

        showLockButton(show) {
            const btn = this.shadowRoot.querySelector('.vh-lock-btn');
            if (btn) btn.style.display = show ? '' : 'none';
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

        _emit(name) {
            this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
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
        .vh-vault-name { font-size: var(--text-sm); color: var(--color-text-secondary); font-family: var(--font-mono); }
        .vh-right { display: flex; align-items: center; gap: var(--space-2); }
        .vh-version { font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono); }
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
