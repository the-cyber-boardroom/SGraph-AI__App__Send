/* =============================================================================
   SGraph Workspace — Messages Panel (lightweight workspace-aware version)
   v0.1.0 — reads from window.sgraphWorkspace.messages

   This will be replaced by a linked import from vault.sgraph.ai once
   the shared debug panels are available there.
   ============================================================================= */

(function() {
    'use strict';

    if (customElements.get('messages-panel')) return; // already defined (e.g. linked from external)

    class MessagesPanel extends HTMLElement {
        connectedCallback() {
            this._render();
            const onMsg = () => this._render();
            window.sgraphWorkspace.events.on('message-added', onMsg);
            window.sgraphWorkspace.events.on('messages-cleared', onMsg);
            this._unsub = () => {
                window.sgraphWorkspace.events.off('message-added', onMsg);
                window.sgraphWorkspace.events.off('messages-cleared', onMsg);
            };
        }

        disconnectedCallback() { if (this._unsub) this._unsub(); }

        _render() {
            const msgs = window.sgraphWorkspace.messages.getMessages();
            if (msgs.length === 0) {
                this.innerHTML = `<div style="padding: 1rem; color: var(--ws-text-muted, #5a6478);
                    font-size: 0.75rem; text-align: center;">No messages</div>`;
                return;
            }
            const typeColor = { success: 'var(--ws-success, #4ECDC4)', error: 'var(--ws-error, #E94560)',
                                warning: 'var(--ws-warning, #fbbf24)', info: 'var(--ws-text-secondary, #8892A0)' };
            this.innerHTML = `<div style="padding: 0.5rem; font-size: 0.75rem; font-family: var(--ws-font-mono, monospace);">
                ${msgs.slice(-50).reverse().map(m => {
                    const time = new Date(m.timestamp).toLocaleTimeString();
                    const color = typeColor[m.type] || typeColor.info;
                    return `<div style="padding: 0.25rem 0.375rem; border-bottom: 1px solid var(--ws-border-subtle, #222d4d);">
                        <span style="color: var(--ws-text-muted, #5a6478);">${time}</span>
                        <span style="color: ${color}; font-weight: 600; text-transform: uppercase;">${m.type}</span>
                        <span style="color: var(--ws-text, #F0F0F5);">${this._esc(m.text)}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }

        _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    }

    customElements.define('messages-panel', MessagesPanel);
})();
