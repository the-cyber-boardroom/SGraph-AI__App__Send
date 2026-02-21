/* =============================================================================
   SGraph Send Admin Console — Messages Panel (Debug)
   v0.1.3 — Shows user-facing notifications (success, error, warning, info)
   ============================================================================= */

(function() {
    'use strict';

    class MessagesPanel extends HTMLElement {

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
                window.sgraphAdmin.messages.clear();
                this.querySelector('.mp-list').innerHTML = '<div class="mp-empty">No messages</div>';
            });

            // Populate from existing messages in the service (survives tab switches)
            this._renderExistingMessages();
        }

        _renderExistingMessages() {
            const svc = window.sgraphAdmin.messages;
            if (!svc) return;
            const msgs = svc.getMessages();
            for (const msg of msgs) {
                this._addMessage(msg, /* skipAutoDismiss */ true);
            }
        }

        setupEventListeners() {
            this._boundHandlers.onMessage = (msg) => this._addMessage(msg);
            window.sgraphAdmin.events.on('message-added', this._boundHandlers.onMessage);
        }

        cleanup() {
            if (this._boundHandlers.onMessage) {
                window.sgraphAdmin.events.off('message-added', this._boundHandlers.onMessage);
            }
        }

        _addMessage(msg, skipAutoDismiss) {
            const list = this.querySelector('.mp-list');
            if (!list) return;

            // Remove empty state
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

            // Limit displayed messages
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
                .mp-container {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }

                .mp-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.5rem 0.75rem;
                    border-bottom: 1px solid var(--admin-border);
                    flex-shrink: 0;
                }

                .mp-title {
                    font-size: var(--admin-font-size-xs);
                    font-weight: 600;
                    color: var(--admin-text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .mp-clear-btn {
                    font-size: var(--admin-font-size-xs);
                    padding: 0.125rem 0.375rem;
                    border-radius: var(--admin-radius);
                    border: 1px solid var(--admin-border);
                    background: transparent;
                    color: var(--admin-text-muted);
                    cursor: pointer;
                }

                .mp-clear-btn:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text-secondary);
                }

                .mp-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0.375rem;
                }

                .mp-empty {
                    padding: 1rem;
                    text-align: center;
                    color: var(--admin-text-muted);
                    font-size: var(--admin-font-size-xs);
                }

                .mp-message {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.375rem;
                    padding: 0.375rem 0.5rem;
                    margin-bottom: 0.25rem;
                    border-radius: var(--admin-radius);
                    font-size: var(--admin-font-size-xs);
                    border-left: 3px solid transparent;
                }

                .mp-message--success { border-left-color: var(--admin-success); background: rgba(16, 185, 129, 0.05); }
                .mp-message--error   { border-left-color: var(--admin-error);   background: rgba(239, 68, 68, 0.05);  }
                .mp-message--warning { border-left-color: var(--admin-warning); background: rgba(245, 158, 11, 0.05); }
                .mp-message--info    { border-left-color: var(--admin-primary); background: rgba(79, 143, 247, 0.05); }

                .mp-message-time {
                    font-family: var(--admin-font-mono);
                    color: var(--admin-text-muted);
                    flex-shrink: 0;
                }

                .mp-message-type {
                    font-weight: 600;
                    text-transform: uppercase;
                    flex-shrink: 0;
                    min-width: 3rem;
                }

                .mp-message--success .mp-message-type { color: var(--admin-success); }
                .mp-message--error   .mp-message-type { color: var(--admin-error);   }
                .mp-message--warning .mp-message-type { color: var(--admin-warning); }
                .mp-message--info    .mp-message-type { color: var(--admin-primary); }

                .mp-message-text {
                    color: var(--admin-text);
                    word-break: break-word;
                }
            `;
        }
    }

    customElements.define('messages-panel', MessagesPanel);
})();
