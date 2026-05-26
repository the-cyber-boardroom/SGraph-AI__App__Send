/* =============================================================================
   SGraph Vault — Messages Panel (Debug)
   v0.1.3 — Adapted from Admin Console v0.1.3
   Shows user-facing notifications (success, error, warning, info)
   ============================================================================= */

(function() {
    'use strict';

    class VaultMessagesPanel extends HTMLElement {

        constructor() {
            super();
            this._boundHandlers = {};
        }

        connectedCallback() {
            this.render();
            this.setupEventListeners();
        }

        disconnectedCallback() {
            this.cleanup();
        }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="mp-container">
                    <div class="mp-header">
                        <span class="mp-title">Messages</span>
                        <button class="mp-clear-btn">Clear</button>
                    </div>
                    <div class="mp-list"></div>
                </div>
            `;

            this.querySelector('.mp-clear-btn').addEventListener('click', () => {
                window.sgraphVault.messages.clear();
                this.querySelector('.mp-list').innerHTML = '<div class="mp-empty">No messages</div>';
            });

            this._renderExistingMessages();
        }

        _renderExistingMessages() {
            const svc = window.sgraphVault.messages;
            if (!svc) return;
            const msgs = svc.getMessages();
            for (const msg of msgs) {
                this._addMessage(msg);
            }
        }

        setupEventListeners() {
            this._boundHandlers.onMessage = (msg) => this._addMessage(msg);
            window.sgraphVault.events.on('message-added', this._boundHandlers.onMessage);
        }

        cleanup() {
            if (this._boundHandlers.onMessage) {
                window.sgraphVault.events.off('message-added', this._boundHandlers.onMessage);
            }
        }

        _addMessage(msg) {
            const list = this.querySelector('.mp-list');
            if (!list) return;

            const empty = list.querySelector('.mp-empty');
            if (empty) empty.remove();

            const time = new Date(msg.timestamp);
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;

            const el = document.createElement('div');
            el.className = `mp-message mp-message--${msg.type}`;
            el.innerHTML = `
                <span class="mp-message-time">${timeStr}</span>
                <span class="mp-message-type">${msg.type}</span>
                <span class="mp-message-text">${this._escapeHtml(msg.text)}</span>
            `;
            list.prepend(el);

            while (list.children.length > 50) {
                list.lastChild.remove();
            }
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        getStyles() {
            return `
                .mp-container { height: 100%; display: flex; flex-direction: column; }
                .mp-header { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
                .mp-title { font-size: var(--text-small); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
                .mp-clear-btn { font-size: var(--text-small); padding: 0.125rem 0.375rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; }
                .mp-clear-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
                .mp-list { flex: 1; overflow-y: auto; padding: 0.375rem; }
                .mp-empty { padding: 1rem; text-align: center; color: var(--color-text-secondary); font-size: var(--text-small); }
                .mp-message { display: flex; align-items: flex-start; gap: 0.375rem; padding: 0.375rem 0.5rem; margin-bottom: 0.25rem; border-radius: var(--radius-sm); font-size: var(--text-small); border-left: 3px solid transparent; }
                .mp-message--success { border-left-color: var(--color-success); background: rgba(78, 205, 196, 0.05); }
                .mp-message--error   { border-left-color: var(--color-error);   background: rgba(233, 69, 96, 0.05); }
                .mp-message--warning { border-left-color: var(--color-warning); background: rgba(224, 124, 79, 0.05); }
                .mp-message--info    { border-left-color: var(--color-primary); background: rgba(78, 205, 196, 0.03); }
                .mp-message-time { font-family: var(--font-mono); color: var(--color-text-secondary); flex-shrink: 0; }
                .mp-message-type { font-weight: 600; text-transform: uppercase; flex-shrink: 0; min-width: 3rem; }
                .mp-message--success .mp-message-type { color: var(--color-success); }
                .mp-message--error   .mp-message-type { color: var(--color-error); }
                .mp-message--warning .mp-message-type { color: var(--color-warning); }
                .mp-message--info    .mp-message-type { color: var(--color-primary); }
                .mp-message-text { color: var(--color-text); word-break: break-word; }
            `;
        }
    }

    customElements.define('vault-messages-panel', VaultMessagesPanel);
})();
