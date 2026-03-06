/* =============================================================================
   SGraph Workspace — Shell Override
   v0.1.1 — Surgical override: adds Save State button + Bundles debug tab

   Overrides WorkspaceShell.prototype.render to inject:
   1. "Save State" button in the chat zone header
   2. "Bundles" tab in the debug sidebar
   3. <bundle-manager> and <bundle-list> hidden components

   Loads AFTER v0.1.0/workspace-shell.js — overrides via prototype patching.
   ============================================================================= */

(function() {
    'use strict';

    // Get the class from the custom elements registry (not in global scope due to IIFE)
    const ShellClass = customElements.get('workspace-shell');
    const _originalRender = ShellClass.prototype.render;

    ShellClass.prototype.render = function() {
        // Call the original render (builds the full DOM)
        _originalRender.call(this);

        // 1. Add "Save State" button to the chat zone header
        const chatHeader = this.querySelector('.ws-chat-header');
        if (chatHeader) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'ws-bundle-save';
            saveBtn.textContent = 'Save State';
            saveBtn.title = 'Save current workspace state as an execution bundle';
            saveBtn.addEventListener('click', () => {
                window.sgraphWorkspace.events.emit('bundle-save-requested', {});
            });

            // Style inline (surgical — no separate CSS file needed)
            saveBtn.style.cssText = `
                padding: 0.125rem 0.5rem;
                font-size: 0.625rem; font-weight: 600;
                background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                color: var(--ws-primary, #4ECDC4);
                border: 1px solid var(--ws-primary, #4ECDC4);
                border-radius: var(--ws-radius, 6px);
                cursor: pointer; font-family: inherit;
                margin-left: auto;
            `;

            chatHeader.style.display = 'flex';
            chatHeader.style.alignItems = 'center';
            chatHeader.style.gap = '0.5rem';
            chatHeader.appendChild(saveBtn);
        }

        // 2. Add "Bundles" tab to the debug sidebar
        const debugTabs = this.querySelector('.ws-debug-tabs');
        if (debugTabs) {
            const tab = document.createElement('button');
            tab.className = 'ws-debug-tab';
            tab.dataset.tab = 'bundles';
            tab.textContent = 'Bundles';
            debugTabs.appendChild(tab);
        }

        // 3. Add bundle-list panel to debug content
        const debugContent = this.querySelector('.ws-debug-content');
        if (debugContent) {
            const panel = document.createElement('div');
            panel.className = 'ws-debug-panel';
            panel.dataset.panel = 'bundles';
            panel.style.display = 'none';
            panel.innerHTML = '<bundle-list></bundle-list>';
            debugContent.appendChild(panel);
        }

        // 4. Add hidden <bundle-manager> component
        const existing = this.querySelector('bundle-manager');
        if (!existing) {
            const mgr = document.createElement('bundle-manager');
            mgr.style.display = 'none';
            this.querySelector('.ws-transform-area')?.appendChild(mgr);
        }
    };

})();
