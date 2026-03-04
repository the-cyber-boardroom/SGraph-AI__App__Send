/* =============================================================================
   SGraph Workspace — Shell Web Component
   v0.1.0 — Five-zone layout: nav | vault | source+transform | debug

   Adapted from admin-shell.js v0.1.3 (IFD light DOM, EventBus, Router).

   Layout:
     Icon nav (48px) | Vault panel (240px) | Source | Transform | Debug sidebar
     Below source+transform: LLM chat panel
     Status bar at bottom

   The left nav loads different workspace views — document transformation
   is one of several panels the shell can display.
   ============================================================================= */

(function() {
    'use strict';

    // --- SVG Icons -----------------------------------------------------------

    const ICONS = {
        transform: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/>
            <path d="M13 5h2a2 2 0 0 1 2 2v2M7 15H5a2 2 0 0 1-2-2v-2"/>
        </svg>`,
        settings: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="10" cy="10" r="3"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M3.5 16.5l2-2M14.5 5.5l2-2"/>
        </svg>`,
        menu: `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/>
        </svg>`,
        vault: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>
            <path d="M6 4V2h8v2"/><circle cx="10" cy="10" r="2"/>
        </svg>`,
        vaultCollapse: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5V3z"/></svg>`,
        vaultExpand:   `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5V3z"/></svg>`,
    };

    // --- Nav Items (extensible) ----------------------------------------------

    const NAV_ITEMS = [
        { id: 'transform', label: 'Document Transform', icon: ICONS.transform, default: true },
        { id: 'settings',  label: 'Settings',           icon: ICONS.settings },
    ];

    // --- Shell Component -----------------------------------------------------

    class WorkspaceShell extends HTMLElement {

        constructor() {
            super();
            this._activeView     = 'transform';
            this._debugOpen      = true;
            this._debugWidth     = 320;
            this._vaultOpen      = true;
            this._activeDebugTab = 'messages';
            this._boundHandlers  = {};
            this._loadPreferences();
        }

        connectedCallback() {
            this.render();
            this._setupListeners();
            this._setupResize();
            this._setupMessageBadge();

            this._applyDebugWidth();
            this._updateDebugSidebar();
            this._updateVaultPanel();

            // Register router on global namespace
            window.sgraphWorkspace.router = this;

            // Emit shell-ready
            window.sgraphWorkspace.events.emit('shell-ready', { version: 'v0.1.0' });
        }

        disconnectedCallback() {
            if (this._resizeCleanup) this._resizeCleanup();
            if (this._badgeUnsub) this._badgeUnsub();
        }

        // --- View Navigation (left nav) ----------------------------------------

        navigateTo(viewId) {
            if (this._activeView === viewId) return;
            this._activeView = viewId;
            this._renderNav();
            this._updateViewPanels();
            this._updateStatusBar();
            window.sgraphWorkspace.events.emit('view-changed', { viewId });
        }

        // --- Preferences --------------------------------------------------------

        _loadPreferences() {
            try {
                const raw = localStorage.getItem('sgraph-workspace-prefs');
                if (raw) {
                    const p = JSON.parse(raw);
                    if (p.debugWidth !== undefined) this._debugWidth = p.debugWidth;
                    if (p.debugOpen  !== undefined) this._debugOpen  = p.debugOpen;
                    if (p.vaultOpen  !== undefined) this._vaultOpen  = p.vaultOpen;
                }
            } catch (_) { /* ignore */ }
        }

        _savePreferences() {
            try {
                localStorage.setItem('sgraph-workspace-prefs', JSON.stringify({
                    debugWidth : this._debugWidth,
                    debugOpen  : this._debugOpen,
                    vaultOpen  : this._vaultOpen,
                }));
            } catch (_) { /* ignore */ }
        }

        // --- Debug Sidebar ------------------------------------------------------

        _updateDebugSidebar() {
            const debug  = this.querySelector('.ws-debug-sidebar');
            const resize = this.querySelector('.ws-debug-resize');
            const shell  = this.querySelector('.ws-shell');
            if (debug)  debug.classList.toggle('ws-debug-sidebar--hidden', !this._debugOpen);
            if (resize) resize.style.display = this._debugOpen ? '' : 'none';
            if (shell)  shell.classList.toggle('ws-shell--no-debug', !this._debugOpen);
            this._savePreferences();
        }

        _applyDebugWidth() {
            const shell = this.querySelector('.ws-shell');
            if (shell) shell.style.setProperty('--ws-debug-width', this._debugWidth + 'px');
        }

        _switchDebugTab(tabId) {
            this._activeDebugTab = tabId;
            this.querySelectorAll('.ws-debug-tab').forEach(t =>
                t.classList.toggle('ws-debug-tab--active', t.dataset.tab === tabId)
            );
            this.querySelectorAll('.ws-debug-panel').forEach(p =>
                p.style.display = p.dataset.panel === tabId ? '' : 'none'
            );
        }

        // --- Vault Panel Toggle -------------------------------------------------

        _updateVaultPanel() {
            const shell = this.querySelector('.ws-shell');
            if (shell) shell.classList.toggle('ws-shell--vault-collapsed', !this._vaultOpen);

            const btn = this.querySelector('.ws-vault-toggle');
            if (btn) btn.innerHTML = this._vaultOpen ? ICONS.vaultCollapse : ICONS.vaultExpand;

            this._savePreferences();
        }

        // --- View Panels --------------------------------------------------------

        _updateViewPanels() {
            // For now, the transform view is the only view with content.
            // The settings view will be built in a later session.
            const transformArea = this.querySelector('.ws-transform-area');
            const settingsArea  = this.querySelector('.ws-settings-area');
            if (transformArea) transformArea.style.display = this._activeView === 'transform' ? '' : 'none';
            if (settingsArea)  settingsArea.style.display  = this._activeView === 'settings'  ? '' : 'none';
        }

        // --- Message Badge ------------------------------------------------------

        _setupMessageBadge() {
            const badge = this.querySelector('.ws-msg-badge');
            if (!badge) return;

            const update = () => {
                const svc = window.sgraphWorkspace.messages;
                if (!svc) return;
                const msgs = svc.getMessages();
                const errorCount = msgs.filter(m => m.type === 'error').length;
                const total = msgs.length;
                badge.textContent = total || '';
                badge.style.display = total > 0 ? 'inline-flex' : 'none';
                badge.classList.toggle('ws-msg-badge--error', errorCount > 0);
            };

            badge.addEventListener('click', () => {
                this._debugOpen = true;
                this._updateDebugSidebar();
                this._switchDebugTab('messages');
            });

            const onMsg = () => update();
            window.sgraphWorkspace.events.on('message-added', onMsg);
            window.sgraphWorkspace.events.on('messages-cleared', onMsg);
            this._badgeUnsub = () => {
                window.sgraphWorkspace.events.off('message-added', onMsg);
                window.sgraphWorkspace.events.off('messages-cleared', onMsg);
            };
            update();
        }

        // --- Listeners ----------------------------------------------------------

        _setupListeners() {
            this.addEventListener('click', (e) => {
                // Left nav item
                const navItem = e.target.closest('.ws-nav-item[data-view-id]');
                if (navItem) {
                    e.preventDefault();
                    this.navigateTo(navItem.dataset.viewId);
                    return;
                }

                // Debug toggle
                if (e.target.closest('.ws-debug-toggle')) {
                    this._debugOpen = !this._debugOpen;
                    this._updateDebugSidebar();
                    return;
                }

                // Debug tab
                const tab = e.target.closest('.ws-debug-tab');
                if (tab) {
                    this._switchDebugTab(tab.dataset.tab);
                    return;
                }

                // Vault panel toggle
                if (e.target.closest('.ws-vault-toggle')) {
                    this._vaultOpen = !this._vaultOpen;
                    this._updateVaultPanel();
                    return;
                }

                // Mobile menu
                if (e.target.closest('.ws-menu-btn')) {
                    this._mobileMenuOpen = !this._mobileMenuOpen;
                    const nav = this.querySelector('.ws-nav');
                    if (nav) nav.classList.toggle('ws-nav--mobile-open', this._mobileMenuOpen);
                    return;
                }
            });
        }

        // --- Debug Resize -------------------------------------------------------

        _setupResize() {
            const handle = this.querySelector('.ws-debug-resize');
            if (!handle) return;

            let isResizing = false;
            let startX, startWidth;

            const onMouseDown = (e) => {
                if (!this._debugOpen) return;
                isResizing = true;
                startX = e.clientX;
                const sidebar = this.querySelector('.ws-debug-sidebar');
                startWidth = sidebar ? sidebar.offsetWidth : this._debugWidth;
                handle.classList.add('ws-debug-resize--active');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff = startX - e.clientX;
                const newWidth = Math.min(Math.max(startWidth + diff, 280), 800);
                this._debugWidth = newWidth;
                this._applyDebugWidth();
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                handle.classList.remove('ws-debug-resize--active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                this._savePreferences();
            };

            handle.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            this._resizeCleanup = () => {
                handle.removeEventListener('mousedown', onMouseDown);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
        }

        // --- Status Bar ---------------------------------------------------------

        _updateStatusBar() {
            const activeLabel = this.querySelector('.ws-status-view');
            if (activeLabel) {
                const item = NAV_ITEMS.find(n => n.id === this._activeView);
                activeLabel.textContent = `View: ${item ? item.label : this._activeView}`;
            }
        }

        // --- Render: Nav --------------------------------------------------------

        _renderNav() {
            const container = this.querySelector('.ws-nav-items');
            if (!container) return;

            let html = '';
            for (const item of NAV_ITEMS) {
                const isActive = item.id === this._activeView;
                html += `<a class="ws-nav-item ${isActive ? 'ws-nav-item--active' : ''}"
                            data-view-id="${item.id}" href="#" title="${item.label}">
                    <span class="ws-nav-icon">${item.icon}</span>
                </a>`;
            }
            container.innerHTML = html;
        }

        // --- Render (full) ------------------------------------------------------

        render() {
            this.innerHTML = `
                <div class="ws-shell">
                    <!-- Header -->
                    <header class="ws-header">
                        <button class="ws-menu-btn" aria-label="Toggle navigation">${ICONS.menu}</button>
                        <div class="ws-header-title">
                            <span class="ws-brand">
                                <span class="ws-brand__sg">SG</span>
                                <span class="ws-brand__slash">/</span>
                                <span class="ws-brand__product">Workspace</span>
                            </span>
                            <span class="ws-header-badge">Explorer</span>
                        </div>
                        <div class="ws-header-right">
                            <button class="ws-debug-toggle">Debug</button>
                            <span class="ws-header-version">${window.sgraphWorkspace.config.appVersion} · ${window.sgraphWorkspace.config.version}</span>
                        </div>
                    </header>

                    <!-- Left icon nav -->
                    <nav class="ws-nav">
                        <div class="ws-nav-items"></div>
                    </nav>

                    <!-- Vault panel zone -->
                    <div class="ws-vault-zone">
                        <div class="ws-vault-header">
                            <span class="ws-vault-icon">${ICONS.vault}</span>
                            <span class="ws-vault-title">Vault</span>
                            <button class="ws-vault-toggle" title="Toggle vault panel">${ICONS.vaultCollapse}</button>
                        </div>
                        <div class="ws-vault-content">
                            <vault-panel></vault-panel>
                        </div>
                    </div>

                    <!-- Main content: transform view (default) -->
                    <div class="ws-transform-area">
                        <div class="ws-source-zone">
                            <div class="ws-panel-header">
                                <span class="ws-panel-label">Source</span>
                            </div>
                            <div class="ws-panel-content">
                                <document-viewer data-role="source"></document-viewer>
                            </div>
                        </div>
                        <div class="ws-transform-zone">
                            <div class="ws-panel-header">
                                <span class="ws-panel-label">Transformation</span>
                            </div>
                            <div class="ws-panel-content">
                                <document-viewer data-role="transform"></document-viewer>
                            </div>
                        </div>
                        <div class="ws-chat-zone">
                            <div class="ws-chat-header">
                                <span class="ws-chat-label">Chat</span>
                            </div>
                            <llm-chat></llm-chat>
                        </div>
                    </div>

                    <!-- Settings view (hidden by default) -->
                    <div class="ws-settings-area" style="display:none">
                        <llm-connection></llm-connection>
                    </div>

                    <!-- Hidden data components -->
                    <prompt-library style="display:none"></prompt-library>

                    <!-- Debug resize handle -->
                    <div class="ws-debug-resize"></div>

                    <!-- Debug sidebar -->
                    <aside class="ws-debug-sidebar">
                        <div class="ws-debug-tabs">
                            <button class="ws-debug-tab ws-debug-tab--active" data-tab="messages">Msgs</button>
                            <button class="ws-debug-tab" data-tab="events">Events</button>
                            <button class="ws-debug-tab" data-tab="api">API</button>
                        </div>
                        <div class="ws-debug-content">
                            <div class="ws-debug-panel" data-panel="messages">
                                <messages-panel></messages-panel>
                            </div>
                            <div class="ws-debug-panel" data-panel="events" style="display:none">
                                <events-viewer></events-viewer>
                            </div>
                            <div class="ws-debug-panel" data-panel="api" style="display:none">
                                <api-logger></api-logger>
                            </div>
                        </div>
                    </aside>

                    <!-- Status bar -->
                    <footer class="ws-statusbar">
                        <span class="ws-status-view">View: Document Transform</span>
                        <span class="ws-status-model">Model: not connected</span>
                        <span class="ws-status-spacer"></span>
                        <button class="ws-msg-badge" title="Messages" style="display:none">0</button>
                    </footer>
                </div>
            `;

            this._renderNav();
        }
    }

    customElements.define('workspace-shell', WorkspaceShell);
})();
