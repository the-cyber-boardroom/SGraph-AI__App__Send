/* =================================================================================
   SGraph Vault — Navigation Component
   v0.1.5 — Left sidebar nav: Files, SGit, Settings

   Light DOM. Emits 'vault-nav-switch' with { view } detail.
   ================================================================================= */

(function() {
    'use strict';

    class VaultNav extends HTMLElement {

        connectedCallback() {
            this.innerHTML = `
                <nav class="vn-nav">
                    <a class="vn-item vn-item--active" data-view="files" href="#">
                        <span class="vn-icon">&#128194;</span><span class="vn-label">Files</span>
                    </a>
                    <a class="vn-item" data-view="sgit" href="#">
                        <span class="vn-icon">&#128268;</span><span class="vn-label">SGit</span>
                    </a>
                    <a class="vn-item" data-view="settings" href="#">
                        <span class="vn-icon">&#9881;</span><span class="vn-label">Settings</span>
                    </a>
                </nav>
            `;

            this.addEventListener('click', (e) => {
                const item = e.target.closest('.vn-item[data-view]');
                if (!item) return;
                e.preventDefault();
                this.setActive(item.dataset.view);
                this.dispatchEvent(new CustomEvent('vault-nav-switch', {
                    detail: { view: item.dataset.view }, bubbles: true
                }));
            });
        }

        setActive(viewId) {
            this.querySelectorAll('.vn-item').forEach(item => {
                item.classList.toggle('vn-item--active', item.dataset.view === viewId);
            });
        }
    }

    VaultNav.styles = `
        .vn-nav {
            background: var(--bg-surface); border-right: 1px solid var(--color-border);
            display: flex; flex-direction: column; padding: var(--space-2) 0;
            gap: var(--space-1); overflow: hidden; width: 56px;
        }
        .vn-item {
            display: flex; flex-direction: column; align-items: center; gap: 0.125rem;
            padding: 0.5rem 0.25rem; font-size: 0.625rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.04em;
            color: var(--color-text-secondary); text-decoration: none; cursor: pointer;
            border-left: 3px solid transparent;
            transition: background var(--transition), color var(--transition);
        }
        .vn-item:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vn-item--active {
            color: var(--color-primary); background: rgba(79, 143, 247, 0.08);
            border-left-color: var(--color-primary);
        }
        .vn-icon { font-size: 1.125rem; line-height: 1; }
        .vn-label { line-height: 1; }
    `;

    customElements.define('vault-nav', VaultNav);
})();
