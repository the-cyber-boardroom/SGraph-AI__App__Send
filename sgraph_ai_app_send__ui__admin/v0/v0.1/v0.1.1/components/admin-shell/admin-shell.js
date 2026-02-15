/* =============================================================================
   SGraph Send Admin Console — Shell Web Component
   v0.1.1 — IFD overlay: adds "Metrics" nav item under Monitoring

   Changes from v0.1.0:
     - Added "Metrics" nav item in Monitoring section (after Analytics)
     - Updated version badge to v0.1.1
   ============================================================================= */

class AdminShell extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._activePanel  = 'tokens';
        this._healthStatus = 'unknown';  // unknown | healthy | error
        this._sidebarOpen  = false;
    }

    connectedCallback() {
        this.render();
        this._setupListeners();
        this._checkHealth();
    }

    disconnectedCallback() {
        if (this._healthInterval) {
            clearInterval(this._healthInterval);
        }
        document.removeEventListener('admin-navigate', this._boundNavigate);
    }

    // --- Properties ---------------------------------------------------------

    get activePanel() {
        return this._activePanel;
    }

    set activePanel(value) {
        if (this._activePanel !== value) {
            this._activePanel = value;
            this._updateActiveNav();
            this._updatePanelVisibility();
            this.dispatchEvent(new CustomEvent('admin-panel-changed', {
                detail: { panel: value },
                bubbles: true
            }));
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

        // Re-check every 60 seconds
        this._healthInterval = setInterval(async () => {
            try {
                await adminAPI.getHealth();
                this._healthStatus = 'healthy';
            } catch (_) {
                this._healthStatus = 'error';
            }
            this._updateHealthIndicator();
        }, 60000);
    }

    _updateHealthIndicator() {
        const dot = this.shadowRoot.querySelector('.header__health-dot');
        if (!dot) return;
        dot.className = 'header__health-dot';
        dot.classList.add(`header__health-dot--${this._healthStatus}`);
        dot.title = this._healthStatus === 'healthy' ? 'Service healthy' :
                    this._healthStatus === 'error'   ? 'Service unreachable' :
                                                       'Checking...';
    }

    // --- Navigation ---------------------------------------------------------

    _setupListeners() {
        // Sidebar nav clicks
        this.shadowRoot.querySelectorAll('.nav__item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.activePanel = item.dataset.panel;
                // Close mobile sidebar
                if (this._sidebarOpen) {
                    this._sidebarOpen = false;
                    this._updateMobileSidebar();
                }
            });
        });

        // Mobile menu toggle
        const menuBtn = this.shadowRoot.querySelector('.header__menu-btn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                this._sidebarOpen = !this._sidebarOpen;
                this._updateMobileSidebar();
            });
        }

        // Sidebar overlay (mobile)
        const overlay = this.shadowRoot.querySelector('.sidebar__overlay');
        if (overlay) {
            overlay.addEventListener('click', () => {
                this._sidebarOpen = false;
                this._updateMobileSidebar();
            });
        }

        // External navigation events
        this._boundNavigate = (e) => {
            if (e.detail && e.detail.panel) {
                this.activePanel = e.detail.panel;
            }
        };
        document.addEventListener('admin-navigate', this._boundNavigate);
    }

    _updateActiveNav() {
        this.shadowRoot.querySelectorAll('.nav__item').forEach(item => {
            item.classList.toggle('nav__item--active', item.dataset.panel === this._activePanel);
        });
    }

    _updatePanelVisibility() {
        const slot = this.shadowRoot.querySelector('.content__panels');
        if (!slot) return;

        // Signal to slotted children
        this.querySelectorAll('[data-panel]').forEach(el => {
            if (el.dataset.panel === this._activePanel) {
                el.removeAttribute('hidden');
                // Tell the panel it became active
                if (typeof el.onActivated === 'function') {
                    el.onActivated();
                }
            } else {
                el.setAttribute('hidden', '');
            }
        });
    }

    _updateMobileSidebar() {
        const sidebar = this.shadowRoot.querySelector('.sidebar');
        const overlay = this.shadowRoot.querySelector('.sidebar__overlay');
        if (sidebar) sidebar.classList.toggle('sidebar--open', this._sidebarOpen);
        if (overlay) overlay.classList.toggle('sidebar__overlay--visible', this._sidebarOpen);
    }

    // --- Render -------------------------------------------------------------

    render() {
        this.shadowRoot.innerHTML = `
            <style>${AdminShell.styles}</style>
            <div class="shell">
                <header class="header">
                    <button class="header__menu-btn" aria-label="Toggle navigation">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <rect y="3"  width="20" height="2" rx="1"/>
                            <rect y="9"  width="20" height="2" rx="1"/>
                            <rect y="15" width="20" height="2" rx="1"/>
                        </svg>
                    </button>
                    <div class="header__title">
                        <span class="header__name">SGraph Send</span>
                        <span class="header__badge">Admin</span>
                    </div>
                    <div class="header__right">
                        <span class="header__version">v0.1.1</span>
                        <span class="header__health-dot" title="Checking..."></span>
                    </div>
                </header>

                <div class="sidebar__overlay"></div>

                <nav class="sidebar">
                    <div class="nav__section">
                        <div class="nav__section-title">Management</div>
                        <a class="nav__item nav__item--active" data-panel="tokens" href="#">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z"/>
                            </svg>
                            Tokens
                        </a>
                        <a class="nav__item" data-panel="cache" href="#">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/>
                                <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"/>
                                <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"/>
                            </svg>
                            Cache
                        </a>
                    </div>
                    <div class="nav__section">
                        <div class="nav__section-title">Monitoring</div>
                        <a class="nav__item" data-panel="analytics" href="#">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                            </svg>
                            Analytics
                        </a>
                        <a class="nav__item" data-panel="metrics" href="#">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clip-rule="evenodd"/>
                            </svg>
                            Metrics
                        </a>
                    </div>
                    <div class="nav__section">
                        <div class="nav__section-title">System</div>
                        <a class="nav__item" data-panel="system" href="#">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
                            </svg>
                            System Info
                        </a>
                    </div>
                    <div class="nav__section">
                        <div class="nav__section-title">Links</div>
                        <a class="nav__item nav__item--external" href="/docs" target="_blank" rel="noopener">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                            </svg>
                            Swagger API
                        </a>
                        <a class="nav__item nav__item--external" href="/" target="_blank" rel="noopener">
                            <svg class="nav__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                                <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.497-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd"/>
                            </svg>
                            Main Site
                        </a>
                    </div>
                </nav>

                <main class="content">
                    <div class="content__panels">
                        <slot></slot>
                    </div>
                </main>
            </div>
        `;

        // Initial panel visibility
        requestAnimationFrame(() => this._updatePanelVisibility());
    }

    // --- Styles -------------------------------------------------------------

    static get styles() {
        return `
            :host {
                display: block;
                height: 100vh;
                overflow: hidden;
            }

            .shell {
                display: grid;
                grid-template-areas:
                    "header header"
                    "sidebar content";
                grid-template-columns: var(--admin-sidebar-width, 240px) 1fr;
                grid-template-rows: var(--admin-header-height, 56px) 1fr;
                height: 100vh;
            }

            /* --- Header --- */
            .header {
                grid-area: header;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0 1.25rem;
                background: var(--admin-surface);
                border-bottom: 1px solid var(--admin-border);
                z-index: 20;
            }

            .header__menu-btn {
                display: none;
                background: none;
                border: none;
                color: var(--admin-text-secondary);
                cursor: pointer;
                padding: 0.25rem;
                border-radius: var(--admin-radius);
            }

            .header__menu-btn:hover {
                color: var(--admin-text);
                background: var(--admin-surface-hover);
            }

            .header__title {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .header__name {
                font-weight: 600;
                font-size: var(--admin-font-size-lg);
                color: var(--admin-text);
            }

            .header__badge {
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 0.125rem 0.5rem;
                border-radius: 9999px;
                background: var(--admin-primary-bg);
                color: var(--admin-primary);
            }

            .header__right {
                margin-left: auto;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .header__version {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-muted);
                font-family: var(--admin-font-mono);
            }

            .header__health-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--admin-text-muted);
            }

            .header__health-dot--healthy {
                background: var(--admin-success);
                box-shadow: 0 0 6px var(--admin-success);
            }

            .header__health-dot--error {
                background: var(--admin-error);
                box-shadow: 0 0 6px var(--admin-error);
            }

            /* --- Sidebar --- */
            .sidebar {
                grid-area: sidebar;
                background: var(--admin-surface);
                border-right: 1px solid var(--admin-border);
                overflow-y: auto;
                padding: 1rem 0;
            }

            .sidebar__overlay {
                display: none;
            }

            .nav__section {
                margin-bottom: 1.25rem;
            }

            .nav__section-title {
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: var(--admin-text-muted);
                padding: 0 1.25rem;
                margin-bottom: 0.375rem;
            }

            .nav__item {
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

            .nav__item:hover {
                background: var(--admin-surface-hover);
                color: var(--admin-text);
                text-decoration: none;
            }

            .nav__item--active {
                color: var(--admin-primary);
                background: var(--admin-primary-bg);
                border-left-color: var(--admin-primary);
            }

            .nav__icon {
                flex-shrink: 0;
                opacity: 0.7;
            }

            .nav__item--active .nav__icon {
                opacity: 1;
            }

            .nav__item--external::after {
                content: '\u2197';
                font-size: 0.7em;
                margin-left: auto;
                opacity: 0.5;
            }

            /* --- Content --- */
            .content {
                grid-area: content;
                overflow-y: auto;
                padding: 1.5rem;
                background: var(--admin-bg);
            }

            .content__panels {
                max-width: 1100px;
                margin: 0 auto;
            }

            /* --- Responsive --- */
            @media (max-width: 768px) {
                .shell {
                    grid-template-columns: 1fr;
                    grid-template-areas:
                        "header"
                        "content";
                }

                .header__menu-btn {
                    display: block;
                }

                .sidebar {
                    position: fixed;
                    top: var(--admin-header-height, 56px);
                    left: 0;
                    bottom: 0;
                    width: 240px;
                    z-index: 30;
                    transform: translateX(-100%);
                    transition: transform 200ms ease;
                }

                .sidebar--open {
                    transform: translateX(0);
                }

                .sidebar__overlay {
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

                .sidebar__overlay--visible {
                    opacity: 1;
                    pointer-events: auto;
                }
            }
        `;
    }
}

customElements.define('admin-shell', AdminShell);
