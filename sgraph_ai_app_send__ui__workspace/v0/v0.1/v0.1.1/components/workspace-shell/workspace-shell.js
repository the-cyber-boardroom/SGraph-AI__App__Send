/* =============================================================================
   SGraph Workspace — Shell Override
   v0.1.1 — Surgical override:
     1. Save State button (with visual feedback)
     2. Bundles debug tab
     3. Collapsible/resizable chat sections
     4. <bundle-manager> and <bundle-list> components

   Loads AFTER v0.1.0/workspace-shell.js — overrides via prototype patching.
   Also applies immediately to the already-rendered shell instance.
   ============================================================================= */

(function() {
    'use strict';

    // --- CSS for collapsible chat sections + save feedback ---
    const CHAT_STYLES = document.createElement('style');
    CHAT_STYLES.textContent = `
        .ws-chat-section {
            display: flex; flex-direction: column;
            min-height: 0; overflow: hidden;
            transition: flex 150ms ease;
        }
        .ws-chat-section--collapsed {
            flex: 0 0 auto !important;
            min-width: 0 !important;
            max-width: fit-content !important;
        }
        .ws-chat-section--collapsed > :not(.ws-section-header) {
            display: none !important;
        }
        .ws-chat-section--collapsed .ws-section-header {
            writing-mode: vertical-rl;
            white-space: nowrap;
            padding: 0.375rem 0.125rem;
            border-bottom: none;
            border-right: 1px solid var(--ws-border-subtle, #222d4d);
        }
        .ws-section-header {
            display: flex; align-items: center; gap: 0.375rem;
            padding: 0.125rem 0.375rem;
            background: var(--ws-surface, #162040);
            border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
            flex-shrink: 0; cursor: pointer; user-select: none;
        }
        .ws-section-header:hover {
            background: var(--ws-surface-hover, #253254);
        }
        .ws-section-label {
            font-size: 0.5625rem; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.04em;
            color: var(--ws-text-muted, #5a6478);
        }
        .ws-section-toggle {
            font-size: 0.5rem; color: var(--ws-text-muted, #5a6478);
            transition: transform 150ms;
        }
        .ws-chat-section--collapsed .ws-section-toggle {
            transform: rotate(-90deg);
        }
        .ws-section-resize {
            height: 3px; flex-shrink: 0;
            cursor: row-resize;
            background: transparent;
            transition: background 0.15s;
        }
        .ws-section-resize:hover,
        .ws-section-resize--active {
            background: var(--ws-primary, #4ECDC4);
        }

        /* Work panel collapse toggle */
        .ws-panel-toggle {
            font-size: 0.5rem;
            color: var(--ws-text-muted, #5a6478);
            transition: transform 150ms;
            margin-right: 0.125rem;
        }

        /* Collapsed flex sub-panels (Source, Data within source zone) */
        .ws-panel--collapsed .ws-panel-content { display: none !important; }
        .ws-panel--collapsed { flex: 0 0 auto !important; }
        .ws-panel--collapsed .ws-panel-toggle { transform: rotate(-90deg); }

        /* Collapsed grid columns (Script, Result) */
        .ws-zone--collapsed .ws-panel-content { display: none !important; }
        .ws-zone--collapsed .ws-panel-header {
            writing-mode: vertical-rl;
            white-space: nowrap;
            padding: 0.375rem 0.125rem;
            border-bottom: none;
            border-right: 1px solid var(--ws-border-subtle, #222d4d);
            flex: 1;
        }
        .ws-zone--collapsed .ws-panel-clear { display: none !important; }
        .ws-zone--collapsed .ws-panel-toggle { transform: rotate(-90deg); }

        /* Save button feedback */
        @keyframes ws-save-flash {
            0%   { background: rgba(78,205,196,0.3); }
            100% { background: var(--ws-primary-bg, rgba(78,205,196,0.1)); }
        }
        .ws-bundle-save--saving {
            pointer-events: none;
            animation: ws-save-flash 0.6s ease;
        }
    `;
    document.head.appendChild(CHAT_STYLES);

    // --- Chat section definitions ---
    const CHAT_SECTIONS = [
        { id: 'system-prompt', label: 'System Prompt', tag: 'llm-system-prompt' },
        { id: 'prompt-input',  label: 'Prompt',        tag: 'llm-prompt-input' },
        { id: 'llm-output',    label: 'LLM Output',    tag: 'llm-output' },
        { id: 'llm-stats',     label: 'Request Mode',  tag: 'llm-stats' },
    ];

    // Load collapsed state from localStorage
    function getCollapsedSections() {
        try {
            const raw = localStorage.getItem('sgraph-workspace-chat-collapsed');
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    }

    function saveCollapsedSections(state) {
        try { localStorage.setItem('sgraph-workspace-chat-collapsed', JSON.stringify(state)); } catch (_) {}
    }

    // --- Shared injection logic ---
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
                // Visual feedback
                saveBtn.textContent = 'Saving...';
                saveBtn.classList.add('ws-bundle-save--saving');
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
                transition: background 150ms;
            `;

            chatHeader.style.display = 'flex';
            chatHeader.style.alignItems = 'center';
            chatHeader.style.gap = '0.5rem';
            chatHeader.appendChild(saveBtn);

            // Reset button after save completes
            const onSaved = () => {
                saveBtn.textContent = 'Saved!';
                setTimeout(() => {
                    saveBtn.textContent = 'Save State';
                    saveBtn.classList.remove('ws-bundle-save--saving');
                }, 1200);
            };
            window.sgraphWorkspace.events.on('bundle-saved', onSaved);
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

        // 5. Wrap chat body children in collapsible sections
        wrapChatSections(shell);

        // 6. Setup collapsible work panels (Source, Data, Script, Result)
        setupPanelCollapse(shell);
    }

    // --- Wrap chat body components in collapsible section wrappers ---
    function wrapChatSections(shell) {
        const chatBody = shell.querySelector('.ws-chat-body');
        if (!chatBody || chatBody.querySelector('.ws-chat-section')) return;

        const collapsed = getCollapsedSections();

        for (const sec of CHAT_SECTIONS) {
            const component = chatBody.querySelector(sec.tag);
            if (!component) continue;

            // Create section wrapper
            const section = document.createElement('div');
            section.className = 'ws-chat-section';
            section.dataset.sectionId = sec.id;
            section.style.flex = '1';
            if (collapsed[sec.id]) section.classList.add('ws-chat-section--collapsed');

            // Create header
            const header = document.createElement('div');
            header.className = 'ws-section-header';
            header.innerHTML = `<span class="ws-section-toggle">&#9660;</span><span class="ws-section-label">${sec.label}</span>`;
            header.addEventListener('click', () => {
                section.classList.toggle('ws-chat-section--collapsed');
                const state = getCollapsedSections();
                state[sec.id] = section.classList.contains('ws-chat-section--collapsed');
                saveCollapsedSections(state);

                // Reset non-collapsed siblings to flex:1 so they reclaim freed space
                const siblings = section.parentElement.querySelectorAll('.ws-chat-section');
                siblings.forEach(s => {
                    if (!s.classList.contains('ws-chat-section--collapsed')) {
                        s.style.flex = '1';
                    }
                });
            });

            // Wrap: insert section before component, move component inside
            component.parentNode.insertBefore(section, component);
            section.appendChild(header);
            section.appendChild(component);

            // Add resize handle between sections (except after last)
            if (sec.id !== 'llm-stats') {
                const handle = document.createElement('div');
                handle.className = 'ws-section-resize';
                handle.title = 'Drag to resize';
                section.after(handle);

                setupSectionResize(handle, section);
            }
        }
    }

    // --- Collapsible work panels (Source, Data, Script, Result) ---

    const PANEL_COLLAPSED_KEY = 'sgraph-workspace-panel-collapsed';

    function getCollapsedPanels() {
        try {
            const raw = localStorage.getItem(PANEL_COLLAPSED_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    }

    function saveCollapsedPanels(state) {
        try { localStorage.setItem(PANEL_COLLAPSED_KEY, JSON.stringify(state)); } catch (_) {}
    }

    function setupPanelCollapse(shell) {
        addPanelToggle(shell, 'source', '.ws-source-top',     'flex');
        addPanelToggle(shell, 'data',   '.ws-source-bottom',  'flex');
        addPanelToggle(shell, 'script', '.ws-script-zone',    'grid');
        addPanelToggle(shell, 'result', '.ws-transform-zone', 'grid');
        applyAllPanelState(shell);
    }

    function addPanelToggle(shell, id, selector, type) {
        const panel  = shell.querySelector(selector);
        if (!panel) return;
        const header = panel.querySelector('.ws-panel-header');
        if (!header || header.querySelector('.ws-panel-toggle')) return;

        const toggle = document.createElement('span');
        toggle.className = 'ws-panel-toggle';
        toggle.innerHTML = '&#9660;';
        header.insertBefore(toggle, header.firstChild);

        header.style.cursor = 'pointer';
        header.addEventListener('click', (e) => {
            if (e.target.closest('.ws-panel-clear')) return;
            const state = getCollapsedPanels();
            state[id] = !state[id];
            saveCollapsedPanels(state);
            applyAllPanelState(shell);
        });
    }

    function applyFlexPanelCollapse(el, collapsed) {
        if (!el) return;
        el.classList.toggle('ws-panel--collapsed', collapsed);
        const content = el.querySelector('.ws-panel-content');
        if (collapsed) {
            // Hide content first so header height is accurate
            if (content) content.style.display = 'none';
            // Measure header and lock element to that exact height
            const header = el.querySelector('.ws-panel-header');
            const h = header ? header.offsetHeight : 28;
            el.style.flex      = `0 0 ${h}px`;
            el.style.maxHeight = h + 'px';
            el.style.overflow  = 'hidden';
        } else {
            el.style.flex      = '';
            el.style.maxHeight = '';
            el.style.overflow  = '';
            if (content) content.style.display = '';
        }
    }

    function applyAllPanelState(shell) {
        const state = getCollapsedPanels();

        // Source / Data (flex sub-panels) — explicit inline styles to beat resize overrides
        applyFlexPanelCollapse(shell.querySelector('.ws-source-top'),    !!state['source']);
        applyFlexPanelCollapse(shell.querySelector('.ws-source-bottom'), !!state['data']);

        // Hide source split handle when either is collapsed
        const splitHandle = shell.querySelector('.ws-source-split-handle');
        if (splitHandle) splitHandle.style.display = (state['source'] || state['data']) ? 'none' : '';

        // Script / Result (grid columns)
        const scriptZone = shell.querySelector('.ws-script-zone');
        const resultZone = shell.querySelector('.ws-transform-zone');
        if (scriptZone) scriptZone.classList.toggle('ws-zone--collapsed', !!state['script']);
        if (resultZone) resultZone.classList.toggle('ws-zone--collapsed', !!state['result']);

        // Disable column resize handles next to collapsed columns
        const colResize  = shell.querySelector('.ws-col-resize');
        const colResize2 = shell.querySelector('.ws-col-resize2');
        if (colResize)  colResize.style.pointerEvents  = state['script'] ? 'none' : '';
        if (colResize2) colResize2.style.pointerEvents = (state['script'] || state['result']) ? 'none' : '';

        // Update grid-template-columns
        const area = shell.querySelector('.ws-transform-area');
        if (area) {
            if (state['script'] || state['result']) {
                const sw  = '2fr';
                const scw = state['script'] ? '28px' : '1.5fr';
                const rw  = state['result'] ? '28px' : '1.5fr';
                area.style.gridTemplateColumns = `${sw} 4px ${scw} 4px ${rw}`;
            } else {
                area.style.gridTemplateColumns = '';
            }
        }
    }

    // Track resize listeners for cleanup
    const _resizeCleanups = [];

    // --- Section resize (drag to adjust flex proportions) ---
    function setupSectionResize(handle, sectionAbove) {
        let isResizing = false;
        let startY, startH;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startH = sectionAbove.offsetHeight;
            handle.classList.add('ws-section-resize--active');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const diff = e.clientY - startY;
            const newH = Math.max(24, startH + diff);
            sectionAbove.style.flex = `0 0 ${newH}px`;
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            handle.classList.remove('ws-section-resize--active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        _resizeCleanups.push(
            () => document.removeEventListener('mousemove', onMouseMove),
            () => document.removeEventListener('mouseup', onMouseUp),
        );
    }

    // --- Override render() for future re-renders ---
    const ShellClass = customElements.get('workspace-shell');
    const _originalRender = ShellClass.prototype.render;

    ShellClass.prototype.render = function() {
        _originalRender.call(this);
        injectBundleUI(this);
    };

    // --- Apply immediately to the already-rendered shell instance ---
    const existingShell = document.querySelector('workspace-shell');
    if (existingShell) {
        injectBundleUI(existingShell);
    }

})();
