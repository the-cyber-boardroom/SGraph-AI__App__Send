/* =================================================================================
   SGraph Vault — Auth Banner Component
   v0.2.0 — Inline access key input for write operations

   Light DOM. Shows when write operation needs auth.
   Emits:
     'vault-auth-submit'  — { key }
     'vault-auth-cancel'
   ================================================================================= */

(function() {
    'use strict';

    class VaultAuth extends HTMLElement {

        connectedCallback() {
            VaultAuth._injectStyles();
            this.style.display = 'none';
            this.innerHTML = `
                <div class="va-banner">
                    <span class="va-msg">Access key needed for write operations</span>
                    <input class="va-input" type="password" placeholder="Paste access key" autocomplete="off">
                    <button class="va-submit">Set Key</button>
                    <button class="va-cancel">&times;</button>
                </div>
            `;

            this.querySelector('.va-submit').addEventListener('click', () => this._submit());
            this.querySelector('.va-cancel').addEventListener('click', () => this.hide());
            this.querySelector('.va-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._submit();
                if (e.key === 'Escape') this.hide();
            });
        }

        show() {
            this.style.display = '';
            const input = this.querySelector('.va-input');
            if (input) { input.value = ''; input.focus(); }
        }

        hide() {
            this.style.display = 'none';
            this.dispatchEvent(new CustomEvent('vault-auth-cancel', { bubbles: true }));
        }

        _submit() {
            const input = this.querySelector('.va-input');
            const key = input?.value?.trim();
            if (!key) return;
            this.style.display = 'none';
            this.dispatchEvent(new CustomEvent('vault-auth-submit', {
                detail: { key }, bubbles: true
            }));
        }
    }

    VaultAuth.styles = `
        .va-banner {
            display: flex; align-items: center; gap: var(--space-2);
            padding: 0.375rem var(--space-4);
            background: rgba(233, 196, 69, 0.1); border-bottom: 1px solid rgba(233, 196, 69, 0.3);
        }
        .va-msg { font-size: var(--text-sm); color: #E9C445; font-weight: 600; white-space: nowrap; }
        .va-input {
            flex: 1; max-width: 320px; padding: 0.25rem 0.5rem; font-size: var(--text-sm);
            font-family: var(--font-mono); background: var(--bg-primary);
            border: 1px solid var(--color-border); border-radius: var(--radius-sm);
            color: var(--color-text); outline: none; box-sizing: border-box;
        }
        .va-input:focus { border-color: var(--color-primary); }
        .va-submit {
            padding: 0.25rem 0.625rem; border-radius: var(--radius-sm); font-size: var(--text-sm);
            border: 1px solid var(--color-primary); background: var(--color-primary);
            color: var(--bg-primary); font-weight: 600; cursor: pointer; font-family: var(--font-family);
        }
        .va-cancel {
            padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); font-size: var(--text-body);
            border: none; background: transparent; color: var(--color-text-secondary);
            cursor: pointer; font-family: var(--font-family); line-height: 1;
        }
        .va-cancel:hover { color: var(--color-text); }
    `;

    VaultAuth._injectStyles = function() {
        if (document.querySelector('style[data-vault-auth]')) return;
        const s = document.createElement('style');
        s.setAttribute('data-vault-auth', '');
        s.textContent = VaultAuth.styles;
        document.head.appendChild(s);
    };

    customElements.define('vault-auth', VaultAuth);
})();
