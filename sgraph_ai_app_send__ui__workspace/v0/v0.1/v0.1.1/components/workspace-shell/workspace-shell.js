/* =============================================================================
   SGraph Workspace — Shell Override
   v0.1.1 — Surgical override:
     1. Save State button (with visual feedback)
     2. Bundles debug tab
     3. Collapsible/resizable chat sections
     4. Collapsible chat zone (entire bottom panel)
     5. Four-column layout: Source | Data | Script | Result
     6. <bundle-manager> and <bundle-list> components

   Loads AFTER v0.1.0/workspace-shell.js — overrides via prototype patching.
   Also applies immediately to the already-rendered shell instance.
   ============================================================================= */

(function() {
    'use strict';

    // --- CSS for collapsible chat sections + save feedback + 4-column layout ---
    const CHAT_STYLES = document.createElement('style');
    CHAT_STYLES.textContent = `
        /* --- Four-column grid override --- */
        .ws-transform-area--four-col {
            grid-template-columns: 1fr 4px 1fr 4px 1fr 4px 1fr;
            grid-template-areas:
                "source   col-resize1 data    col-resize2 script  col-resize3 result"
                "row-resize row-resize row-resize row-resize row-resize row-resize row-resize"
                "chat     chat        chat    chat         chat   chat         chat";
        }

        .ws-source-top    { grid-area: source; }
        .ws-source-bottom { grid-area: data; }
        .ws-script-zone   { grid-area: script; }
        .ws-transform-zone { grid-area: result; }

        .ws-col-resize1 { grid-area: col-resize1; cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 5; }
        .ws-col-resize2 { grid-area: col-resize2; cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 5; }
        .ws-col-resize3 { grid-area: col-resize3; cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 5; }
        .ws-col-resize1:hover, .ws-col-resize1--active { background: var(--ws-primary, #4ECDC4); }
        .ws-col-resize2:hover, .ws-col-resize2--active { background: var(--ws-primary, #4ECDC4); }
        .ws-col-resize3:hover, .ws-col-resize3--active { background: var(--ws-primary, #4ECDC4); }

        /* All 4 work panels: flex column layout */
        .ws-source-top,
        .ws-source-bottom {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: var(--ws-bg, #1A1A2E);
            min-height: 0;
            flex: unset;
        }

        /* --- Chat sections --- */
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

        /* Collapsed grid columns (all 4 panels use this) */
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

        /* Collapsed chat zone (entire bottom panel) */
        .ws-chat-zone--collapsed .ws-chat-body { display: none !important; }
        .ws-chat-zone--collapsed {
            border-top: 1px solid var(--ws-border-subtle, #222d4d);
        }
        .ws-chat-zone--collapsed .ws-chat-toggle {
            transform: rotate(-90deg);
        }
        .ws-chat-toggle {
            font-size: 0.5rem;
            color: var(--ws-text-muted, #5a6478);
            transition: transform 150ms;
            margin-right: 0.25rem;
        }

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

    // --- Restructure DOM: extract source-top/bottom from source-zone into grid ---
    function restructureToFourColumns(shell) {
        const area = shell.querySelector('.ws-transform-area');
        if (!area || area.classList.contains('ws-transform-area--four-col')) return;

        const sourceZone  = area.querySelector('.ws-source-zone');
        const sourceTop   = area.querySelector('.ws-source-top');
        const sourceBot   = area.querySelector('.ws-source-bottom');
        const splitHandle = area.querySelector('.ws-source-split-handle');
        const oldResize1  = area.querySelector('.ws-col-resize');
        const scriptZone  = area.querySelector('.ws-script-zone');
        const oldResize2  = area.querySelector('.ws-col-resize2');
        const resultZone  = area.querySelector('.ws-transform-zone');
        const rowResize   = area.querySelector('.ws-row-resize');
        const chatZone    = area.querySelector('.ws-chat-zone');

        if (!sourceZone || !sourceTop || !sourceBot || !scriptZone || !resultZone) return;

        // Remove old elements from DOM
        if (splitHandle) splitHandle.remove();
        if (oldResize1)  oldResize1.remove();
        if (oldResize2)  oldResize2.remove();

        // Pull source-top and source-bottom out of source-zone
        sourceZone.before(sourceTop);
        sourceZone.before(sourceBot);
        sourceZone.remove();

        // Create 3 new resize handles
        const resize1 = document.createElement('div');
        resize1.className = 'ws-col-resize1';
        resize1.title = 'Drag to resize';

        const resize2 = document.createElement('div');
        resize2.className = 'ws-col-resize2';
        resize2.title = 'Drag to resize';

        const resize3 = document.createElement('div');
        resize3.className = 'ws-col-resize3';
        resize3.title = 'Drag to resize';

        // Rebuild area children in order:
        // source-top, resize1, source-bottom, resize2, script, resize3, result, row-resize, chat, ...rest
        const otherChildren = [];
        while (area.firstChild) {
            const child = area.firstChild;
            area.removeChild(child);
            // Collect non-layout children (like bundle-manager, llm-orchestrator)
            if (child !== sourceTop && child !== sourceBot && child !== scriptZone &&
                child !== resultZone && child !== rowResize && child !== chatZone) {
                otherChildren.push(child);
            }
        }

        area.appendChild(sourceTop);
        area.appendChild(resize1);
        area.appendChild(sourceBot);
        area.appendChild(resize2);
        area.appendChild(scriptZone);
        area.appendChild(resize3);
        area.appendChild(resultZone);
        if (rowResize) area.appendChild(rowResize);
        if (chatZone)  area.appendChild(chatZone);
        for (const child of otherChildren) area.appendChild(child);

        // Apply the 4-column grid class
        area.classList.add('ws-transform-area--four-col');

        // Setup column resize drag handlers
        setupFourColResize(shell, area, resize1, resize2, resize3);
    }

    // --- Four-column resize drag handlers ---
    function setupFourColResize(shell, area, r1, r2, r3) {
        const handles = [
            { el: r1, activeClass: 'ws-col-resize1--active', leftSel: '.ws-source-top',    rightSel: '.ws-source-bottom' },
            { el: r2, activeClass: 'ws-col-resize2--active', leftSel: '.ws-source-bottom',  rightSel: '.ws-script-zone' },
            { el: r3, activeClass: 'ws-col-resize3--active', leftSel: '.ws-script-zone',    rightSel: '.ws-transform-zone' },
        ];

        for (const h of handles) {
            let isResizing = false;
            let startX, startLeftW, startRightW;

            h.el.addEventListener('mousedown', (e) => {
                const left  = area.querySelector(h.leftSel);
                const right = area.querySelector(h.rightSel);
                if (!left || !right) return;
                isResizing  = true;
                startX      = e.clientX;
                startLeftW  = left.offsetWidth;
                startRightW = right.offsetWidth;
                h.el.classList.add(h.activeClass);
                document.body.style.cursor     = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            const onMove = (e) => {
                if (!isResizing) return;
                const diff = e.clientX - startX;
                const newLeft  = Math.max(80, startLeftW + diff);
                const newRight = Math.max(80, startRightW - diff);
                // Get all 4 zone widths
                const zones = ['.ws-source-top', '.ws-source-bottom', '.ws-script-zone', '.ws-transform-zone'];
                const widths = zones.map(sel => {
                    const el = area.querySelector(sel);
                    if (sel === h.leftSel)  return newLeft;
                    if (sel === h.rightSel) return newRight;
                    return el ? el.offsetWidth : 100;
                });
                const total = widths.reduce((a, b) => a + b, 0);
                area.style.gridTemplateColumns = widths.map(w => `${w/total}fr`).join(' 4px ');
            };

            const onUp = () => {
                if (!isResizing) return;
                isResizing = false;
                h.el.classList.remove(h.activeClass);
                document.body.style.cursor     = '';
                document.body.style.userSelect = '';
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            _resizeCleanups.push(
                () => document.removeEventListener('mousemove', onMove),
                () => document.removeEventListener('mouseup', onUp),
            );
        }
    }

    // --- Shared injection logic ---
    function injectBundleUI(shell) {
        // Guard: don't inject twice
        if (shell.querySelector('.ws-bundle-save')) return;

        // 0. Restructure to 4-column layout
        restructureToFourColumns(shell);

        // 1. Add "Save State" button and collapse toggle to the chat zone header
        const chatHeader = shell.querySelector('.ws-chat-header');
        if (chatHeader) {
            // Add collapse toggle for the entire chat zone
            const chatToggle = document.createElement('span');
            chatToggle.className = 'ws-chat-toggle';
            chatToggle.innerHTML = '&#9660;';
            chatHeader.insertBefore(chatToggle, chatHeader.firstChild);

            const chatZone = shell.querySelector('.ws-chat-zone');
            const chatCollapsedKey = 'sgraph-workspace-chat-zone-collapsed';

            // Restore collapsed state
            try {
                if (localStorage.getItem(chatCollapsedKey) === 'true' && chatZone) {
                    chatZone.classList.add('ws-chat-zone--collapsed');
                    const area = shell.querySelector('.ws-transform-area');
                    if (area) area.style.gridTemplateRows = 'minmax(0, 1fr) 4px auto';
                }
            } catch (_) {}

            chatHeader.style.cursor = 'pointer';
            chatHeader.addEventListener('click', (e) => {
                if (e.target.closest('.ws-bundle-save')) return;
                if (!chatZone) return;
                chatZone.classList.toggle('ws-chat-zone--collapsed');
                const isCollapsed = chatZone.classList.contains('ws-chat-zone--collapsed');
                try { localStorage.setItem(chatCollapsedKey, isCollapsed); } catch (_) {}

                const area = shell.querySelector('.ws-transform-area');
                if (area) {
                    area.style.gridTemplateRows = isCollapsed
                        ? 'minmax(0, 1fr) 4px auto'
                        : '';
                }
            });

            // Add Save State button
            const saveBtn = document.createElement('button');
            saveBtn.className = 'ws-bundle-save';
            saveBtn.textContent = 'Save State';
            saveBtn.title = 'Save current workspace state as an execution bundle';
            saveBtn.addEventListener('click', () => {
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

            const onSaved = () => {
                saveBtn.textContent = 'Saved!';
                setTimeout(() => {
                    saveBtn.textContent = 'Save State';
                    saveBtn.classList.remove('ws-bundle-save--saving');
                }, 1200);
            };
            window.sgraphWorkspace.events.on('bundle-saved', onSaved);

            shell._bundleSavedUnsub = () => {
                window.sgraphWorkspace.events.off('bundle-saved', onSaved);
            };
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

            const section = document.createElement('div');
            section.className = 'ws-chat-section';
            section.dataset.sectionId = sec.id;
            section.style.flex = '1';
            if (collapsed[sec.id]) section.classList.add('ws-chat-section--collapsed');

            const header = document.createElement('div');
            header.className = 'ws-section-header';
            header.innerHTML = `<span class="ws-section-toggle">&#9660;</span><span class="ws-section-label">${sec.label}</span>`;
            header.addEventListener('click', () => {
                section.classList.toggle('ws-chat-section--collapsed');
                const state = getCollapsedSections();
                state[sec.id] = section.classList.contains('ws-chat-section--collapsed');
                saveCollapsedSections(state);

                const siblings = section.parentElement.querySelectorAll('.ws-chat-section');
                siblings.forEach(s => {
                    if (!s.classList.contains('ws-chat-section--collapsed')) {
                        s.style.flex = '1';
                    }
                });
            });

            component.parentNode.insertBefore(section, component);
            section.appendChild(header);
            section.appendChild(component);

            if (sec.id !== 'llm-stats') {
                const handle = document.createElement('div');
                handle.className = 'ws-section-resize';
                handle.title = 'Drag to resize';
                section.after(handle);
                setupSectionResize(handle, section);
            }
        }
    }

    // --- Collapsible work panels (all 4 use grid-column collapse) ---

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

    const PANEL_DEFS = [
        { id: 'source', selector: '.ws-source-top' },
        { id: 'data',   selector: '.ws-source-bottom' },
        { id: 'script', selector: '.ws-script-zone' },
        { id: 'result', selector: '.ws-transform-zone' },
    ];

    function setupPanelCollapse(shell) {
        for (const def of PANEL_DEFS) {
            addPanelToggle(shell, def.id, def.selector);
        }
        applyAllPanelState(shell);

        // Allow external components (e.g. bundle-manager) to trigger re-apply
        document.addEventListener('workspace-panels-changed', () => applyAllPanelState(shell));
    }

    function addPanelToggle(shell, id, selector) {
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

    function applyAllPanelState(shell) {
        const state = getCollapsedPanels();
        const area  = shell.querySelector('.ws-transform-area');

        // Apply ws-zone--collapsed to all 4 panels uniformly
        for (const def of PANEL_DEFS) {
            const el = shell.querySelector(def.selector);
            if (el) el.classList.toggle('ws-zone--collapsed', !!state[def.id]);
        }

        // Update grid-template-columns based on collapse state
        if (area) {
            const anyCollapsed = PANEL_DEFS.some(d => state[d.id]);
            if (anyCollapsed) {
                const widths = PANEL_DEFS.map(d => state[d.id] ? '28px' : '1fr');
                area.style.gridTemplateColumns = widths.join(' 4px ');
            } else {
                area.style.gridTemplateColumns = '';
            }
        }

        // Update grid-template-rows for chat zone collapse
        if (area) {
            const chatZone = shell.querySelector('.ws-chat-zone');
            const chatCollapsed = chatZone && chatZone.classList.contains('ws-chat-zone--collapsed');
            area.style.gridTemplateRows = chatCollapsed ? 'minmax(0, 1fr) 4px auto' : '';
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

    // --- Override disconnectedCallback to clean up section resize listeners ---
    const ShellClass = customElements.get('workspace-shell');
    const _originalDisconnected = ShellClass.prototype.disconnectedCallback;

    ShellClass.prototype.disconnectedCallback = function() {
        _originalDisconnected.call(this);
        for (const cleanup of _resizeCleanups) cleanup();
        _resizeCleanups.length = 0;
        if (this._bundleSavedUnsub) {
            this._bundleSavedUnsub();
            this._bundleSavedUnsub = null;
        }
    };

    // --- Override render() for future re-renders ---
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
