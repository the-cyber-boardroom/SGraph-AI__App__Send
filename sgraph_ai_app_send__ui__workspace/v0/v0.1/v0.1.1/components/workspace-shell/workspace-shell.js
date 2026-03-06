/* =============================================================================
   SGraph Workspace — Shell Override
   v0.1.1 — Surgical override: adds Save State button + Bundles debug tab

   Overrides WorkspaceShell.prototype.render to inject:
   1. "Save State" button in the chat zone header
   2. "Bundles" tab in the debug sidebar
   3. <bundle-manager> and <bundle-list> hidden components

   Loads AFTER v0.1.0/workspace-shell.js — overrides via prototype patching.
   Also applies immediately to the already-rendered shell instance.
   ============================================================================= */

(function() {
    'use strict';

    // Shared injection logic — adds v0.1.1 UI elements to a shell instance
    function injectBundleUI(shell) {
        // Guard: don't inject twice
        if (shell.querySelector('.ws-bundle-save')) return;

        // 1. Add "Save State" button to the chat zone header
        const chatHeader = shell.querySelector('.ws-chat-header');
        if (chatHeader) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'ws-bundle-save';
            saveBtn.textContent = 'Save State';
            saveBtn.title = 'Save current workspace state as an execution bundle';
            saveBtn.addEventListener('click', () => {
                window.sgraphWorkspace.events.emit('bundle-save-requested', {});
            });

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
        const debugTabs = shell.querySelector('.ws-debug-tabs');
        if (debugTabs && !debugTabs.querySelector('[data-tab="bundles"]')) {
            const tab = document.createElement('button');
            tab.className = 'ws-debug-tab';
            tab.dataset.tab = 'bundles';
            tab.textContent = 'Bundles';
            debugTabs.appendChild(tab);
        }

        // 3. Add bundle-list panel to debug content
        const debugContent = shell.querySelector('.ws-debug-content');
        if (debugContent && !debugContent.querySelector('[data-panel="bundles"]')) {
            const panel = document.createElement('div');
            panel.className = 'ws-debug-panel';
            panel.dataset.panel = 'bundles';
            panel.style.display = 'none';
            panel.innerHTML = '<bundle-list></bundle-list>';
            debugContent.appendChild(panel);
        }

        // 4. Add hidden <bundle-manager> component
        if (!shell.querySelector('bundle-manager')) {
            const mgr = document.createElement('bundle-manager');
            mgr.style.display = 'none';
            const target = shell.querySelector('.ws-transform-area') || shell;
            target.appendChild(mgr);
        }
    }

    // Override render() for future re-renders
    const ShellClass = customElements.get('workspace-shell');
    const _originalRender = ShellClass.prototype.render;

    ShellClass.prototype.render = function() {
        _originalRender.call(this);
        injectBundleUI(this);
    };

    // Apply immediately to the already-rendered shell instance
    const existingShell = document.querySelector('workspace-shell');
    if (existingShell) {
        injectBundleUI(existingShell);
    }

})();
