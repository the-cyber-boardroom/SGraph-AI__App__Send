/* =============================================================================
   SGraph Send Admin Console — Shell Web Component
   v0.1.3 — IFD Issues-FS architecture: light DOM, EventBus, Router

   Three-column layout:
     Left nav  |  Main content (one component at a time)  |  Right sidebar (debug)

   Changes from v0.1.2:
     - Light DOM (no Shadow DOM)
     - EventBus-based navigation instead of data-panel switching
     - Router maps appId -> component element
     - Three-column layout with debug sidebar
     - Status bar at bottom
     - Components self-register via static appId
   ============================================================================= */

(function() {
    'use strict';

    class AdminShell extends HTMLElement {

        constructor() {
            super();
            this._activeAppId  = null;
            this._apps         = new Map();    // appId -> { element, navLabel, navIcon, section }
            this._healthStatus = 'unknown';
            this._sidebarOpen  = false;
            this._debugOpen    = true;
            this._boundHandlers = {};
            this._activeDebugTab = 'messages';
            this._debugWidth   = 320;           // default debug sidebar width
            this._loadPreferences();
        }

        connectedCallback() {
            // Save child components BEFORE render() wipes innerHTML
            this._savedChildren = Array.from(this.children);

            this.render();
            this._setupListeners();
            this._setupResize();
            this._setupMessageBadge();
            this._checkHealth();

            // Apply persisted debug sidebar width
            this._applyDebugWidth();
            this._updateDebugSidebar();

            // Register the router on the global namespace
            window.sgraphAdmin.router = this;

            // Move saved children into the main content area and register them
            requestAnimationFrame(() => {
                const mainArea = this.querySelector('.as-main-content');
                if (mainArea) {
                    for (const child of this._savedChildren) {
                        mainArea.appendChild(child);
                    }
                }
                this._autoRegisterComponents();
                // Navigate to preferred default (system-info, not tokens)
                if (this._apps.size > 0 && !this._activeAppId) {
                    const defaultApp = this._apps.has('system') ? 'system' : this._apps.keys().next().value;
                    this.navigateTo(defaultApp);
                }
                window.sgraphAdmin.events.emit('shell-ready', { components: this._apps.size });
            });
        }

        disconnectedCallback() {
            if (this._healthInterval) clearInterval(this._healthInterval);
            if (this._resizeCleanup) this._resizeCleanup();
            if (this._badgeUnsub) this._badgeUnsub();
            window.sgraphAdmin.events.off('navigated', this._boundHandlers.onNavigated);
        }

        // --- Router API ---------------------------------------------------------

        registerApp(appId, element, navLabel, navIcon, section) {
            this._apps.set(appId, { element, navLabel, navIcon, section });
            window.sgraphAdmin.events.emit('app-registered', { appId, navLabel });
            this._renderNav();
        }

        navigateTo(appId) {
            if (!this._apps.has(appId)) return;

            // Deactivate current
            if (this._activeAppId && this._apps.has(this._activeAppId)) {
                const prev = this._apps.get(this._activeAppId).element;
                prev.style.display = 'none';
                if (typeof prev.onDeactivate === 'function') prev.onDeactivate();
                else if (typeof prev.onDeactivated === 'function') prev.onDeactivated();
            }

            // Activate new
            this._activeAppId = appId;
            const app = this._apps.get(appId);
            app.element.style.display = '';
            if (typeof app.element.onActivate === 'function') app.element.onActivate();
            else if (typeof app.element.onActivated === 'function') app.element.onActivated();

            this._renderNav();
            this._updateStatusBar();

            // Close mobile sidebar
            if (this._sidebarOpen) {
                this._sidebarOpen = false;
                this._updateMobileSidebar();
            }

            window.sgraphAdmin.events.emit('navigated', { appId, navLabel: app.navLabel });
        }

        // --- Sidebar API --------------------------------------------------------

        openSidebar(tabId) {
            this._debugOpen = true;
            this._updateDebugSidebar();
            if (tabId) this._switchDebugTab(tabId);
        }

        closeSidebar() {
            this._debugOpen = false;
            this._updateDebugSidebar();
        }

        // --- Preferences --------------------------------------------------------

        _loadPreferences() {
            try {
                const raw = localStorage.getItem('sgraph-admin-prefs');
                if (raw) {
                    const prefs = JSON.parse(raw);
                    if (prefs.debugWidth) this._debugWidth = prefs.debugWidth;
                    if (prefs.debugOpen !== undefined) this._debugOpen = prefs.debugOpen;
                }
            } catch (_) { /* ignore */ }
        }

        _savePreferences() {
            try {
                localStorage.setItem('sgraph-admin-prefs', JSON.stringify({
                    debugWidth : this._debugWidth,
                    debugOpen  : this._debugOpen
                }));
            } catch (_) { /* ignore */ }
        }

        // --- Auto-registration --------------------------------------------------

        _autoRegisterComponents() {
            const mainArea = this.querySelector('.as-main-content');
            if (!mainArea) return;

            const components = mainArea.children;
            for (const el of components) {
                const ctor = el.constructor;
                if (ctor.appId && !this._apps.has(ctor.appId)) {
                    const section = el.dataset.navSection || 'General';
                    this.registerApp(ctor.appId, el, ctor.navLabel || ctor.appId, ctor.navIcon || '', section);
                }
            }
        }

        // --- Health Check -------------------------------------------------------

        async _checkHealth() {
            try {
                await adminAPI.getHealth();
                this._healthStatus = 'healthy';
            } catch (_) {
                this._healthStatus = 'error';
            }
            this._updateHealthIndicator();
        }

        _updateHealthIndicator() {
            const dot = this.querySelector('.as-health-dot');
            if (!dot) return;
            dot.className = 'as-health-dot';
            dot.classList.add(`as-health-dot--${this._healthStatus}`);
            dot.title = this._healthStatus === 'healthy' ? 'Service healthy' :
                        this._healthStatus === 'error'   ? 'Service unreachable' :
                                                            'Checking...';
        }

        // --- Listeners ----------------------------------------------------------

        _setupListeners() {
            // Nav clicks
            this.addEventListener('click', (e) => {
                const navItem = e.target.closest('.as-nav-item[data-app-id]');
                if (navItem) {
                    e.preventDefault();
                    this.navigateTo(navItem.dataset.appId);
                    return;
                }

                // Mobile menu toggle
                if (e.target.closest('.as-menu-btn')) {
                    this._sidebarOpen = !this._sidebarOpen;
                    this._updateMobileSidebar();
                    return;
                }

                // Mobile overlay
                if (e.target.closest('.as-sidebar-overlay')) {
                    this._sidebarOpen = false;
                    this._updateMobileSidebar();
                    return;
                }

                // Debug toggle
                if (e.target.closest('.as-debug-toggle')) {
                    this._debugOpen = !this._debugOpen;
                    this._updateDebugSidebar();
                    return;
                }

                // Debug tabs
                const tab = e.target.closest('.as-debug-tab');
                if (tab) {
                    this._switchDebugTab(tab.dataset.tab);
                    return;
                }
            });

            // EventBus navigation
            this._boundHandlers.onNavigated = (data) => {};
            window.sgraphAdmin.events.on('navigated', this._boundHandlers.onNavigated);
        }

        _updateMobileSidebar() {
            const sidebar = this.querySelector('.as-sidebar');
            const overlay = this.querySelector('.as-sidebar-overlay');
            if (sidebar) sidebar.classList.toggle('as-sidebar--open', this._sidebarOpen);
            if (overlay) overlay.classList.toggle('as-sidebar-overlay--visible', this._sidebarOpen);
        }

        _updateDebugSidebar() {
            const debugSidebar = this.querySelector('.as-debug-sidebar');
            const resizeHandle = this.querySelector('.as-debug-resize');
            const shell = this.querySelector('.as-shell');
            if (debugSidebar) debugSidebar.classList.toggle('as-debug-sidebar--hidden', !this._debugOpen);
            if (resizeHandle) resizeHandle.style.display = this._debugOpen ? '' : 'none';
            if (shell) shell.classList.toggle('as-shell--no-debug', !this._debugOpen);

            const toggleBtn = this.querySelector('.as-debug-toggle');
            if (toggleBtn) toggleBtn.textContent = this._debugOpen ? 'Debug' : 'Debug';
            this._savePreferences();
        }

        _applyDebugWidth() {
            const shell = this.querySelector('.as-shell');
            if (shell) {
                shell.style.setProperty('--debug-width', this._debugWidth + 'px');
            }
        }

        _setupResize() {
            const handle = this.querySelector('.as-debug-resize');
            if (!handle) return;

            let isResizing = false;
            let startX, startWidth;

            const onMouseDown = (e) => {
                if (!this._debugOpen) return;
                isResizing = true;
                startX = e.clientX;
                const sidebar = this.querySelector('.as-debug-sidebar');
                startWidth = sidebar ? sidebar.offsetWidth : this._debugWidth;
                handle.classList.add('as-debug-resize--active');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff = startX - e.clientX;  // dragging left = wider (right-side panel)
                const newWidth = Math.min(Math.max(startWidth + diff, 280), 800);
                this._debugWidth = newWidth;
                this._applyDebugWidth();
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                handle.classList.remove('as-debug-resize--active');
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

        _setupMessageBadge() {
            const badge = this.querySelector('.as-msg-badge');
            if (!badge) return;

            const update = () => {
                const svc = window.sgraphAdmin.messages;
                if (!svc) return;
                const msgs = svc.getMessages();
                const errorCount = msgs.filter(m => m.type === 'error').length;
                const total = msgs.length;
                badge.textContent = total || '';
                badge.style.display = total > 0 ? 'inline-flex' : 'none';
                badge.classList.toggle('as-msg-badge--error', errorCount > 0);
            };

            // Click badge → open messages tab
            badge.addEventListener('click', () => {
                this.openSidebar('messages');
            });

            // Subscribe to message events
            const onMsg = () => update();
            window.sgraphAdmin.events.on('message-added', onMsg);
            window.sgraphAdmin.events.on('messages-cleared', onMsg);

            this._badgeUnsub = () => {
                window.sgraphAdmin.events.off('message-added', onMsg);
                window.sgraphAdmin.events.off('messages-cleared', onMsg);
            };

            update();
        }

        _switchDebugTab(tabId) {
            this._activeDebugTab = tabId;
            this.querySelectorAll('.as-debug-tab').forEach(t => {
                t.classList.toggle('as-debug-tab--active', t.dataset.tab === tabId);
            });
            this.querySelectorAll('.as-debug-panel').forEach(p => {
                p.style.display = p.dataset.panel === tabId ? '' : 'none';
            });
        }

        _updateStatusBar() {
            const activeLabel = this.querySelector('.as-status-active');
            const countLabel  = this.querySelector('.as-status-count');
            if (activeLabel && this._activeAppId) {
                const app = this._apps.get(this._activeAppId);
                activeLabel.textContent = `Active: ${app ? app.navLabel : this._activeAppId}`;
            }
            if (countLabel) {
                countLabel.textContent = `Components: ${this._apps.size}`;
            }
        }

        // --- Render: Nav --------------------------------------------------------

        _renderNav() {
            const navContainer = this.querySelector('.as-nav-sections');
            if (!navContainer) return;

            // Group apps by section
            const sections = new Map();
            for (const [appId, app] of this._apps) {
                const section = app.section || 'General';
                if (!sections.has(section)) sections.set(section, []);
                sections.get(section).push({ appId, ...app });
            }

            let html = '';
            for (const [sectionName, apps] of sections) {
                html += `<div class="as-nav-section">
                    <div class="as-nav-section-title">${this._escapeHtml(sectionName)}</div>`;
                for (const app of apps) {
                    const isActive = app.appId === this._activeAppId;
                    html += `<a class="as-nav-item ${isActive ? 'as-nav-item--active' : ''}"
                                data-app-id="${this._escapeAttr(app.appId)}" href="#">
                        <span class="as-nav-icon">${app.navIcon}</span>
                        ${this._escapeHtml(app.navLabel)}
                    </a>`;
                }
                html += `</div>`;
            }

            // External links
            html += `<div class="as-nav-section">
                <div class="as-nav-section-title">Links</div>
                <a class="as-nav-item as-nav-item--external" href="/docs" target="_blank" rel="noopener">
                    Swagger API
                </a>
                <a class="as-nav-item as-nav-item--external" href="/" target="_blank" rel="noopener">
                    Main Site
                </a>
            </div>`;

            navContainer.innerHTML = html;
        }

        // --- Render (full) ------------------------------------------------------

        render() {
            this.innerHTML = `
                <style>${AdminShell.styles}</style>
                <div class="as-shell">
                    <header class="as-header">
                        <button class="as-menu-btn" aria-label="Toggle navigation">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                <rect y="3"  width="20" height="2" rx="1"/>
                                <rect y="9"  width="20" height="2" rx="1"/>
                                <rect y="15" width="20" height="2" rx="1"/>
                            </svg>
                        </button>
                        <div class="as-header-title">
                            <span class="as-header-name">SGraph Send</span>
                            <span class="as-header-badge">Admin</span>
                        </div>
                        <div class="as-header-right">
                            <button class="as-debug-toggle">Debug</button>
                            <span class="as-header-version">v0.1.3</span>
                            <span class="as-health-dot" title="Checking..."></span>
                        </div>
                    </header>

                    <div class="as-sidebar-overlay"></div>

                    <nav class="as-sidebar">
                        <div class="as-nav-sections"></div>
                    </nav>

                    <main class="as-main">
                        <div class="as-main-content"></div>
                    </main>

                    <div class="as-debug-resize"></div>

                    <aside class="as-debug-sidebar">
                        <div class="as-debug-tabs">
                            <button class="as-debug-tab as-debug-tab--active" data-tab="messages">Msgs</button>
                            <button class="as-debug-tab" data-tab="events">Events</button>
                            <button class="as-debug-tab" data-tab="api">API</button>
                        </div>
                        <div class="as-debug-content">
                            <div class="as-debug-panel" data-panel="messages">
                                <messages-panel></messages-panel>
                            </div>
                            <div class="as-debug-panel" data-panel="events" style="display:none">
                                <events-viewer></events-viewer>
                            </div>
                            <div class="as-debug-panel" data-panel="api" style="display:none">
                                <api-logger></api-logger>
                            </div>
                        </div>
                    </aside>

                    <footer class="as-statusbar">
                        <span class="as-status-health">Ready</span>
                        <span class="as-status-active">Active: -</span>
                        <span class="as-status-count">Components: 0</span>
                        <span class="as-status-spacer"></span>
                        <button class="as-msg-badge" title="Messages">0</button>
                    </footer>
                </div>
            `;
        }

        // --- Helpers ------------------------------------------------------------

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        _escapeAttr(str) {
            return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // --- Styles -------------------------------------------------------------

        static get styles() {
            return `
                /* --- Shell Grid --- */
                .as-shell {
                    --debug-width: 320px;
                    display: grid;
                    grid-template-areas:
                        "header  header  header  header"
                        "sidebar main   resize  debug"
                        "status  status  status  status";
                    grid-template-columns: var(--admin-sidebar-width, 240px) 1fr 4px var(--debug-width);
                    grid-template-rows: var(--admin-header-height, 56px) 1fr auto;
                    height: 100vh;
                    overflow: hidden;
                }

                .as-shell--no-debug {
                    grid-template-columns: var(--admin-sidebar-width, 240px) 1fr 0 0;
                }

                .as-shell--no-debug .as-debug-sidebar,
                .as-shell--no-debug .as-debug-resize {
                    display: none;
                }

                /* --- Header --- */
                .as-header {
                    grid-area: header;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0 1.25rem;
                    background: var(--admin-surface);
                    border-bottom: 1px solid var(--admin-border);
                    z-index: 20;
                }

                .as-menu-btn {
                    display: none;
                    background: none;
                    border: none;
                    color: var(--admin-text-secondary);
                    cursor: pointer;
                    padding: 0.25rem;
                    border-radius: var(--admin-radius);
                }

                .as-menu-btn:hover {
                    color: var(--admin-text);
                    background: var(--admin-surface-hover);
                }

                .as-header-title {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .as-header-name {
                    font-weight: 600;
                    font-size: var(--admin-font-size-lg);
                    color: var(--admin-text);
                }

                .as-header-badge {
                    font-size: var(--admin-font-size-xs);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    padding: 0.125rem 0.5rem;
                    border-radius: 9999px;
                    background: var(--admin-primary-bg);
                    color: var(--admin-primary);
                }

                .as-header-right {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .as-header-version {
                    font-size: var(--admin-font-size-xs);
                    color: var(--admin-text-muted);
                    font-family: var(--admin-font-mono);
                }

                .as-debug-toggle {
                    font-size: var(--admin-font-size-xs);
                    padding: 0.2rem 0.5rem;
                    border-radius: var(--admin-radius);
                    border: 1px solid var(--admin-border);
                    background: transparent;
                    color: var(--admin-text-secondary);
                    cursor: pointer;
                    font-family: var(--admin-font-mono);
                }

                .as-debug-toggle:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text);
                }

                .as-health-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--admin-text-muted);
                }

                .as-health-dot--healthy {
                    background: var(--admin-success);
                    box-shadow: 0 0 6px var(--admin-success);
                }

                .as-health-dot--error {
                    background: var(--admin-error);
                    box-shadow: 0 0 6px var(--admin-error);
                }

                /* --- Left Sidebar --- */
                .as-sidebar {
                    grid-area: sidebar;
                    background: var(--admin-surface);
                    border-right: 1px solid var(--admin-border);
                    overflow-y: auto;
                    padding: 1rem 0;
                }

                .as-sidebar-overlay {
                    display: none;
                }

                .as-nav-section {
                    margin-bottom: 1.25rem;
                }

                .as-nav-section-title {
                    font-size: var(--admin-font-size-xs);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--admin-text-muted);
                    padding: 0 1.25rem;
                    margin-bottom: 0.375rem;
                }

                .as-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    padding: 0.5rem 1.25rem;
                    font-size: var(--admin-font-size-sm);
                    color: var(--admin-text-secondary);
                    text-decoration: none;
                    cursor: pointer;
                    transition: background var(--admin-transition), color var(--admin-transition);
                    border-left: 3px solid transparent;
                }

                .as-nav-item:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text);
                    text-decoration: none;
                }

                .as-nav-item--active {
                    color: var(--admin-primary);
                    background: var(--admin-primary-bg);
                    border-left-color: var(--admin-primary);
                }

                .as-nav-icon {
                    flex-shrink: 0;
                    width: 1.125rem;
                    text-align: center;
                    font-size: 0.875rem;
                }

                .as-nav-item--external::after {
                    content: '\\2197';
                    font-size: 0.7em;
                    margin-left: auto;
                    opacity: 0.5;
                }

                /* --- Main Content --- */
                .as-main {
                    grid-area: main;
                    overflow-y: auto;
                    padding: 1.5rem;
                    background: var(--admin-bg);
                }

                .as-main-content {
                    max-width: 1100px;
                    margin: 0 auto;
                }

                /* --- Debug Resize Handle --- */
                .as-debug-resize {
                    grid-area: resize;
                    width: 4px;
                    cursor: col-resize;
                    background: transparent;
                    transition: background 0.15s;
                    z-index: 10;
                }

                .as-debug-resize:hover,
                .as-debug-resize--active {
                    background: var(--admin-primary);
                }

                /* --- Debug Sidebar --- */
                .as-debug-sidebar {
                    grid-area: debug;
                    background: var(--admin-surface);
                    border-left: 1px solid var(--admin-border);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .as-debug-sidebar--hidden {
                    display: none;
                }

                .as-debug-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--admin-border);
                    flex-shrink: 0;
                }

                .as-debug-tab {
                    flex: 1;
                    padding: 0.5rem;
                    font-size: var(--admin-font-size-xs);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    background: transparent;
                    border: none;
                    color: var(--admin-text-muted);
                    cursor: pointer;
                    transition: background var(--admin-transition), color var(--admin-transition);
                }

                .as-debug-tab:hover {
                    background: var(--admin-surface-hover);
                    color: var(--admin-text-secondary);
                }

                .as-debug-tab--active {
                    color: var(--admin-primary);
                    border-bottom: 2px solid var(--admin-primary);
                }

                .as-debug-content {
                    flex: 1;
                    overflow-y: auto;
                }

                .as-debug-panel {
                    height: 100%;
                }

                /* --- Status Bar --- */
                .as-statusbar {
                    grid-area: status;
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    padding: 0.25rem 1.25rem;
                    font-size: var(--admin-font-size-xs);
                    color: var(--admin-text-muted);
                    background: var(--admin-surface);
                    border-top: 1px solid var(--admin-border);
                    font-family: var(--admin-font-mono);
                }

                .as-status-spacer {
                    flex: 1;
                }

                .as-msg-badge {
                    display: none;
                    align-items: center;
                    justify-content: center;
                    min-width: 1.25rem;
                    height: 1.25rem;
                    padding: 0 0.375rem;
                    border-radius: 9999px;
                    font-size: 0.6875rem;
                    font-weight: 600;
                    font-family: var(--admin-font-mono);
                    background: var(--admin-border);
                    color: var(--admin-text-secondary);
                    border: none;
                    cursor: pointer;
                }

                .as-msg-badge--error {
                    background: var(--admin-error);
                    color: #fff;
                }

                /* --- Responsive --- */
                @media (max-width: 1024px) {
                    .as-shell {
                        grid-template-columns: var(--admin-sidebar-width, 240px) 1fr 0 0;
                    }

                    .as-debug-sidebar,
                    .as-debug-resize {
                        display: none;
                    }
                }

                @media (max-width: 768px) {
                    .as-shell {
                        grid-template-columns: 1fr;
                        grid-template-areas:
                            "header"
                            "main"
                            "status";
                    }

                    .as-menu-btn {
                        display: block;
                    }

                    .as-sidebar {
                        position: fixed;
                        top: var(--admin-header-height, 56px);
                        left: 0;
                        bottom: 0;
                        width: 240px;
                        z-index: 30;
                        transform: translateX(-100%);
                        transition: transform 200ms ease;
                    }

                    .as-sidebar--open {
                        transform: translateX(0);
                    }

                    .as-sidebar-overlay {
                        display: block;
                        position: fixed;
                        inset: 0;
                        top: var(--admin-header-height, 56px);
                        background: rgba(0, 0, 0, 0.5);
                        z-index: 25;
                        opacity: 0;
                        pointer-events: none;
                        transition: opacity 200ms ease;
                    }

                    .as-sidebar-overlay--visible {
                        opacity: 1;
                        pointer-events: auto;
                    }

                    .as-debug-sidebar,
                    .as-debug-resize {
                        display: none;
                    }
                }
            `;
        }
    }

    // Static getters for router registration (shell itself is not a routable app)
    AdminShell.appId    = null;
    AdminShell.navLabel = null;
    AdminShell.navIcon  = null;

    customElements.define('admin-shell', AdminShell);
})();
