/* =================================================================================
   SGraph Vault -- Status Bar Component
   v0.2.0 -- Footer with stats and message badge

   Shadow DOM. Emits 'vault-status-debug' (composed: true).
   ================================================================================= */

(function() {
    'use strict';

    class VaultStatusBar extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultStatusBar.styles}</style>
                <footer class="vsb-bar">
                    <span class="vsb-stats"></span>
                    <span class="vsb-spacer"></span>
                    <button class="vsb-msg-badge" title="Messages" style="display:none">0</button>
                </footer>
            `;

            this.shadowRoot.querySelector('.vsb-msg-badge').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('vault-status-debug', { bubbles: true, composed: true }));
            });

            this._setupMessageBadge();
        }

        updateStats(vault) {
            if (!vault) return;
            const stats = vault.getStats();
            const el = this.shadowRoot.querySelector('.vsb-stats');
            if (el) {
                el.textContent = VaultI18n.t('vault.stats.summary', {
                    folders: stats.folders, files: stats.files,
                    size: VaultHelpers.formatBytes(stats.totalSize)
                });
            }
        }

        _setupMessageBadge() {
            const badge = this.shadowRoot.querySelector('.vsb-msg-badge');
            if (!badge) return;

            const update = () => {
                const svc = window.sgraphVault.messages;
                if (!svc) return;
                const msgs = svc.getMessages();
                const errorCount = msgs.filter(m => m.type === 'error').length;
                const total = msgs.length;
                badge.textContent = total || '';
                badge.style.display = total > 0 ? 'inline-flex' : 'none';
                badge.classList.toggle('vsb-badge--error', errorCount > 0);
            };

            window.sgraphVault.events.on('message-added', update);
            window.sgraphVault.events.on('messages-cleared', update);
            update();
        }
    }

    VaultStatusBar.styles = `
        :host { display: block; }
        .vsb-bar {
            display: flex; align-items: center; gap: var(--space-4);
            padding: 0.25rem var(--space-4); font-size: var(--text-small);
            color: var(--color-text-secondary); background: var(--bg-surface);
            border-top: 1px solid var(--color-border); font-family: var(--font-mono);
        }
        .vsb-spacer { flex: 1; }
        .vsb-msg-badge {
            display: none; align-items: center; justify-content: center;
            min-width: 1.25rem; height: 1.25rem; padding: 0 0.375rem;
            border-radius: 9999px; font-size: 0.6875rem; font-weight: 600;
            font-family: var(--font-mono); background: var(--color-border);
            color: var(--color-text-secondary); border: none; cursor: pointer;
        }
        .vsb-badge--error { background: var(--color-error); color: #fff; }
    `;

    customElements.define('vault-status-bar', VaultStatusBar);
})();
