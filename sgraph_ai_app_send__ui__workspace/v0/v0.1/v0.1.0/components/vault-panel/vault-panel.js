/* =============================================================================
   SGraph Workspace — Vault Panel (stub)
   v0.1.0 — file browser with source/transform folder pair structure

   Full implementation: Session 2
   ============================================================================= */

(function() {
    'use strict';

    class VaultPanel extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
                <div style="padding: 0.75rem; color: var(--ws-text-muted, #5a6478); font-size: 0.8125rem;">
                    <div style="margin-bottom: 0.5rem; font-weight: 600; color: var(--ws-text-secondary, #8892A0);">
                        Files
                    </div>
                    <div style="padding: 1rem 0; text-align: center; opacity: 0.6;">
                        No vault connected.<br>
                        <small>Connect via Settings.</small>
                    </div>
                </div>
            `;
            window.sgraphWorkspace.events.emit('vault-panel-ready');
        }
    }

    customElements.define('vault-panel', VaultPanel);
})();
