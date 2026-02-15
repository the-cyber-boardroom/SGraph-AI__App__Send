/* =============================================================================
   SGraph Send Admin Console — Cache Browser Web Component
   v0.1.1 — Comprehensive cache inspector

   Provides:
     - Namespace listing (analytics, tokens, costs, transfers)
     - Folder browsing with breadcrumb navigation
     - File listing with click-to-inspect
     - JSON entry viewer with pretty-printing
   ============================================================================= */

class CacheBrowser extends HTMLElement {

    constructor() {
        super();
        this._currentPath = '';
        this._breadcrumbs = [];
        this._folders     = [];
        this._files       = [];
        this._entryData   = null;
        this._loading     = false;
        this._error       = null;
        this._view        = 'browse';    // 'browse' | 'entry'
    }

    connectedCallback() {
        this.render();
        this.loadNamespaces();
    }

    onActivated() { if (!this._folders.length && !this._files.length) this.loadNamespaces(); }

    // ─── Data Loading ────────────────────────────────────────────────────

    async loadNamespaces() {
        this._loading = true; this._error = null; this.renderContent();
        try {
            const result = await adminAPI.getCacheNamespaces();
            this._currentPath = '';
            this._breadcrumbs = [];
            this._folders     = result.namespaces || [];
            this._files       = [];
            this._view        = 'browse';
        } catch (e) {
            this._error = e.message;
        }
        this._loading = false; this.renderContent();
    }

    async navigateTo(path) {
        this._loading = true; this._error = null; this._view = 'browse'; this.renderContent();
        try {
            const [foldersResult, filesResult] = await Promise.all([
                adminAPI.getCacheFolders(path),
                adminAPI.getCacheFiles(path)
            ]);
            this._currentPath = path;
            this._breadcrumbs = path ? path.split('/') : [];
            this._folders     = foldersResult.folders || [];
            this._files       = filesResult.files     || [];
        } catch (e) {
            this._error = e.message;
        }
        this._loading = false; this.renderContent();
    }

    async inspectEntry(namespace, cacheId) {
        this._loading = true; this._error = null; this._view = 'entry'; this.renderContent();
        try {
            const result = await adminAPI.getCacheEntry(namespace, cacheId);
            this._entryData = result;
        } catch (e) {
            this._error = e.message;
        }
        this._loading = false; this.renderContent();
    }

    // ─── Event Handling ──────────────────────────────────────────────────

    _setupListeners() {
        this.querySelector('#cb-home')?.addEventListener('click', () => this.loadNamespaces());

        this.querySelectorAll('.cb-crumb').forEach(el => {
            el.addEventListener('click', () => this.navigateTo(el.dataset.path));
        });

        this.querySelectorAll('.cb-folder').forEach(el => {
            el.addEventListener('click', () => {
                const target = this._currentPath ? `${this._currentPath}/${el.dataset.name}` : el.dataset.name;
                this.navigateTo(target);
            });
        });

        this.querySelectorAll('.cb-file').forEach(el => {
            el.addEventListener('click', () => {
                const filename = el.dataset.filename;
                const cacheId  = this._extractCacheId(filename);
                const ns       = this._breadcrumbs[0] || 'analytics';
                if (cacheId) this.inspectEntry(ns, cacheId);
            });
        });

        this.querySelector('#cb-back')?.addEventListener('click', () => {
            if (this._view === 'entry') {
                this._view = 'browse'; this.renderContent();
            } else if (this._breadcrumbs.length > 0) {
                const parent = this._breadcrumbs.slice(0, -1).join('/');
                if (parent) this.navigateTo(parent);
                else this.loadNamespaces();
            }
        });

        this.querySelector('#cb-refresh')?.addEventListener('click', () => {
            if (this._view === 'browse') {
                if (this._currentPath) this.navigateTo(this._currentPath);
                else this.loadNamespaces();
            }
        });
    }

    _extractCacheId(filename) {
        // Files are typically like "abc123def4.json" — the name before .json is the cache_id
        if (!filename) return null;
        const parts = filename.split('/');
        const name  = parts[parts.length - 1];
        return name.replace(/\.json$/, '').replace(/\.metadata$/, '').replace(/\.config$/, '');
    }

    // ─── Rendering ───────────────────────────────────────────────────────

    render() {
        this.innerHTML = `
            <style>${CacheBrowser.styles}</style>
            <div class="cb-container">
                <div class="cb-toolbar">
                    <button class="cb-btn" id="cb-back" title="Back">&#8592;</button>
                    <button class="cb-btn" id="cb-home" title="Home">&#8962;</button>
                    <div class="cb-breadcrumbs" id="cb-breadcrumbs"></div>
                    <button class="cb-btn cb-btn--right" id="cb-refresh" title="Refresh">&#8635;</button>
                </div>
                <div class="cb-content" id="cb-content"></div>
                <div class="cb-statusbar" id="cb-statusbar"></div>
            </div>
        `;
        this.renderContent();
    }

    renderContent() {
        const content   = this.querySelector('#cb-content');
        const statusbar = this.querySelector('#cb-statusbar');
        const crumbs    = this.querySelector('#cb-breadcrumbs');
        if (!content) return;

        // Breadcrumbs
        if (crumbs) {
            let crumbHtml = '<span class="cb-crumb cb-crumb--home" data-path="">root</span>';
            let accumulated = '';
            for (const segment of this._breadcrumbs) {
                accumulated += (accumulated ? '/' : '') + segment;
                crumbHtml += ` <span class="cb-crumb-sep">/</span> <span class="cb-crumb" data-path="${this._escapeAttr(accumulated)}">${this._escapeHtml(segment)}</span>`;
            }
            crumbs.innerHTML = crumbHtml;
        }

        if (this._loading) {
            content.innerHTML = '<div class="cb-loading">Loading...</div>';
            this._setupListeners();
            return;
        }

        if (this._error) {
            content.innerHTML = `<div class="cb-error">${this._escapeHtml(this._error)}</div>`;
            this._setupListeners();
            return;
        }

        if (this._view === 'entry') {
            this._renderEntry(content);
        } else {
            this._renderBrowse(content);
        }

        // Status bar
        if (statusbar) {
            if (this._view === 'entry') {
                const found = this._entryData?.found ? 'Found' : 'Not found';
                statusbar.textContent = `Entry: ${this._entryData?.cache_id || '?'} | ${found}`;
            } else {
                statusbar.textContent = `${this._folders.length} folders, ${this._files.length} files`;
            }
        }

        this._setupListeners();
    }

    _renderBrowse(container) {
        let html = '';

        if (this._folders.length === 0 && this._files.length === 0) {
            html = '<div class="cb-empty">No items at this path.</div>';
        }

        // Folders
        for (const folder of this._folders) {
            html += `<div class="cb-item cb-folder" data-name="${this._escapeAttr(folder)}">
                <span class="cb-icon">&#128193;</span>
                <span class="cb-name">${this._escapeHtml(folder)}</span>
            </div>`;
        }

        // Files
        for (const file of this._files) {
            const shortName = typeof file === 'string' ? file.split('/').pop() : String(file);
            const fullPath  = typeof file === 'string' ? file : String(file);
            const isJson      = shortName.endsWith('.json');
            const isMetadata  = shortName.endsWith('.metadata');
            const isConfig    = shortName.endsWith('.config');
            const icon = isJson ? '&#128196;' : isMetadata ? '&#9881;' : isConfig ? '&#9881;' : '&#128462;';
            const cls  = isJson ? 'cb-file--json' : 'cb-file--meta';
            html += `<div class="cb-item cb-file ${cls}" data-filename="${this._escapeAttr(fullPath)}">
                <span class="cb-icon">${icon}</span>
                <span class="cb-name">${this._escapeHtml(shortName)}</span>
            </div>`;
        }

        container.innerHTML = html;
    }

    _renderEntry(container) {
        if (!this._entryData) {
            container.innerHTML = '<div class="cb-empty">No entry data.</div>';
            return;
        }

        const { cache_id, namespace, data, found } = this._entryData;
        const jsonStr = data ? JSON.stringify(data, null, 2) : 'null';

        container.innerHTML = `
            <div class="cb-entry-header">
                <div class="cb-entry-meta">
                    <span class="cb-entry-label">Namespace:</span> <span class="cb-entry-value">${this._escapeHtml(namespace)}</span>
                </div>
                <div class="cb-entry-meta">
                    <span class="cb-entry-label">Cache ID:</span> <span class="cb-entry-value">${this._escapeHtml(cache_id)}</span>
                </div>
                <div class="cb-entry-meta">
                    <span class="cb-entry-label">Status:</span> <span class="cb-entry-value">${found ? 'Found' : 'Not found'}</span>
                </div>
            </div>
            <pre class="cb-json">${this._escapeHtml(jsonStr)}</pre>
        `;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    _escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
    _escapeAttr(str) { return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    // ─── Styles ──────────────────────────────────────────────────────────

    static get styles() {
        return `
            .cb-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                font-size: var(--admin-font-size-sm, 0.875rem);
            }

            .cb-toolbar {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 0.75rem;
                background: var(--admin-surface, #1e1e2e);
                border-bottom: 1px solid var(--admin-border, #313244);
                flex-shrink: 0;
            }

            .cb-btn {
                background: none;
                border: 1px solid var(--admin-border, #313244);
                border-radius: var(--admin-radius, 6px);
                color: var(--admin-text-secondary, #a6adc8);
                cursor: pointer;
                padding: 0.25rem 0.5rem;
                font-size: 0.875rem;
                transition: background 0.15s, color 0.15s;
            }

            .cb-btn:hover {
                background: var(--admin-surface-hover, #313244);
                color: var(--admin-text, #cdd6f4);
            }

            .cb-btn--right { margin-left: auto; }

            .cb-breadcrumbs {
                display: flex;
                align-items: center;
                gap: 0.25rem;
                flex: 1;
                overflow-x: auto;
                white-space: nowrap;
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-muted, #6c7086);
            }

            .cb-crumb {
                cursor: pointer;
                color: var(--admin-primary, #89b4fa);
                padding: 0.125rem 0.25rem;
                border-radius: 3px;
            }

            .cb-crumb:hover { background: var(--admin-surface-hover, #313244); }

            .cb-crumb-sep { color: var(--admin-text-muted, #6c7086); }

            .cb-content {
                flex: 1;
                overflow-y: auto;
                padding: 0.5rem;
            }

            .cb-item {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.375rem 0.75rem;
                border-radius: var(--admin-radius, 6px);
                cursor: pointer;
                transition: background 0.15s;
            }

            .cb-item:hover { background: var(--admin-surface-hover, #313244); }

            .cb-icon {
                font-size: 1rem;
                flex-shrink: 0;
                width: 1.25rem;
                text-align: center;
            }

            .cb-name {
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text, #cdd6f4);
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .cb-folder .cb-name { color: var(--admin-primary, #89b4fa); font-weight: 500; }

            .cb-file--json .cb-name { color: var(--admin-text, #cdd6f4); }
            .cb-file--meta .cb-name { color: var(--admin-text-muted, #6c7086); }

            .cb-loading, .cb-empty, .cb-error {
                padding: 2rem;
                text-align: center;
                color: var(--admin-text-muted, #6c7086);
            }

            .cb-error {
                color: var(--admin-error, #f38ba8);
                background: rgba(243, 139, 168, 0.1);
                border-radius: var(--admin-radius, 6px);
                margin: 0.5rem;
            }

            .cb-entry-header {
                padding: 0.75rem;
                background: var(--admin-surface, #1e1e2e);
                border-radius: var(--admin-radius, 6px);
                margin-bottom: 0.5rem;
            }

            .cb-entry-meta {
                display: flex;
                gap: 0.5rem;
                padding: 0.125rem 0;
                font-size: var(--admin-font-size-xs, 0.75rem);
            }

            .cb-entry-label {
                color: var(--admin-text-muted, #6c7086);
                min-width: 80px;
            }

            .cb-entry-value {
                color: var(--admin-text, #cdd6f4);
                font-family: var(--admin-font-mono, monospace);
            }

            .cb-json {
                background: var(--admin-surface, #1e1e2e);
                border: 1px solid var(--admin-border, #313244);
                border-radius: var(--admin-radius, 6px);
                padding: 0.75rem;
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text, #cdd6f4);
                overflow-x: auto;
                white-space: pre-wrap;
                word-break: break-word;
                line-height: 1.5;
                max-height: 70vh;
                overflow-y: auto;
            }

            .cb-statusbar {
                flex-shrink: 0;
                padding: 0.25rem 0.75rem;
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-muted, #6c7086);
                border-top: 1px solid var(--admin-border, #313244);
                background: var(--admin-surface, #1e1e2e);
            }
        `;
    }
}

customElements.define('cache-browser', CacheBrowser);
