/* =============================================================================
   SGraph Send Admin Console — Storage Browser
   v0.1.3 — Enhanced Memory-FS content browser with namespace overview,
             search/filter, and full entry inspection.

   Replaces the v0.1.1 cache-browser with:
     - Namespace overview showing entry counts
     - Path-based search/filter
     - Breadcrumb navigation
     - JSON entry viewer with pretty-printing
     - Auto-refresh on key/token events

   API endpoints used:
     GET /cache/namespaces                    — list namespaces
     GET /cache/folders/{path}                — list subfolders
     GET /cache/files/{path}                  — list files
     GET /cache/entry/{namespace}/{cache_id}  — retrieve entry JSON
   ============================================================================= */

(function() {
    'use strict';

    class StorageBrowser extends HTMLElement {

        static get appId()    { return 'storage'; }
        static get navLabel() { return 'Storage'; }
        static get navIcon()  { return '\uD83D\uDDC4'; }

        constructor() {
            super();
            this._view        = 'overview';       // 'overview' | 'browse' | 'entry'
            this._namespaces  = [];
            this._nsCounts    = {};                // namespace → {folders, files}
            this._currentPath = '';
            this._breadcrumbs = [];
            this._folders     = [];
            this._files       = [];
            this._allFiles    = [];                // unfiltered files for search
            this._entryData   = null;
            this._loading     = false;
            this._filter      = '';
            this._boundHandlers = {};
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() { this.cleanup(); }

        onActivated() {
            this._loadOverview();
            this._setupEvents();
        }

        onDeactivated() { this.cleanup(); }

        _setupEvents() {
            this._boundHandlers.onPublished   = () => this._refreshCurrent();
            this._boundHandlers.onUnpublished = () => this._refreshCurrent();
            if (window.sgraphAdmin?.events) {
                window.sgraphAdmin.events.on('key-published',   this._boundHandlers.onPublished);
                window.sgraphAdmin.events.on('key-unpublished', this._boundHandlers.onUnpublished);
            }
        }

        cleanup() {
            if (window.sgraphAdmin?.events) {
                if (this._boundHandlers.onPublished)   window.sgraphAdmin.events.off('key-published',   this._boundHandlers.onPublished);
                if (this._boundHandlers.onUnpublished) window.sgraphAdmin.events.off('key-unpublished', this._boundHandlers.onUnpublished);
            }
        }

        // ─── Data Loading ────────────────────────────────────────────────────

        async _loadOverview() {
            this._loading = true;
            this._view    = 'overview';
            this._renderContent();
            try {
                const result     = await adminAPI.getCacheNamespaces();
                this._namespaces = result.namespaces || [];
                this._nsCounts   = {};

                const countPromises = this._namespaces.map(async (ns) => {
                    try {
                        const [foldersResult, filesResult] = await Promise.all([
                            adminAPI.getCacheFolders(ns),
                            adminAPI.getCacheFiles(ns)
                        ]);
                        this._nsCounts[ns] = {
                            folders : (foldersResult.folders || []).length,
                            files   : (filesResult.files    || []).length
                        };
                    } catch (_) {
                        this._nsCounts[ns] = { folders: 0, files: 0 };
                    }
                });
                await Promise.all(countPromises);
            } catch (err) {
                this._namespaces = [];
            }
            this._loading = false;
            this._renderContent();
        }

        async _navigateTo(path) {
            this._loading = true;
            this._view    = 'browse';
            this._filter  = '';
            this._renderContent();
            try {
                const [foldersResult, filesResult] = await Promise.all([
                    adminAPI.getCacheFolders(path),
                    adminAPI.getCacheFiles(path)
                ]);
                this._currentPath = path;
                this._breadcrumbs = path ? path.split('/') : [];
                this._folders     = foldersResult.folders || [];
                this._allFiles    = filesResult.files     || [];
                this._files       = this._allFiles;
            } catch (err) {
                this._folders  = [];
                this._allFiles = [];
                this._files    = [];
            }
            this._loading = false;
            this._renderContent();
        }

        async _inspectEntry(namespace, cacheId) {
            this._loading = true;
            this._view    = 'entry';
            this._renderContent();
            try {
                this._entryData = await adminAPI.getCacheEntry(namespace, cacheId);
            } catch (err) {
                this._entryData = { cache_id: cacheId, namespace, data: null, found: false };
            }
            this._loading = false;
            this._renderContent();
        }

        _refreshCurrent() {
            if (this._view === 'overview')    this._loadOverview();
            else if (this._view === 'browse') this._navigateTo(this._currentPath);
        }

        _applyFilter(query) {
            this._filter = query;
            if (!query) {
                this._files = this._allFiles;
            } else {
                const q = query.toLowerCase();
                this._files = this._allFiles.filter(f => {
                    const name = typeof f === 'string' ? f : String(f);
                    return name.toLowerCase().includes(q);
                });
            }
            this._renderContent();
        }

        // ─── Helpers ─────────────────────────────────────────────────────────

        _extractCacheId(filename) {
            if (!filename) return null;
            const parts = filename.split('/');
            const name  = parts[parts.length - 1];
            return name.replace(/\.json$/, '').replace(/\.metadata$/, '').replace(/\.config$/, '');
        }

        _esc(str)     { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
        _escAttr(str) { return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

        // ─── Rendering ───────────────────────────────────────────────────────

        render() {
            this.innerHTML = `
                <style>${StorageBrowser.styles}</style>
                <div class="sb-container">
                    <div class="sb-toolbar">
                        <button class="sb-btn" id="sb-back" title="Back">\u2190</button>
                        <button class="sb-btn" id="sb-home" title="Overview">\u2302</button>
                        <div class="sb-breadcrumbs" id="sb-breadcrumbs"></div>
                        <button class="sb-btn sb-btn--right" id="sb-refresh" title="Refresh">\u21BB</button>
                    </div>
                    <div class="sb-content" id="sb-content"></div>
                    <div class="sb-statusbar" id="sb-statusbar"></div>
                </div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const content   = this.querySelector('#sb-content');
            const statusbar = this.querySelector('#sb-statusbar');
            const crumbs    = this.querySelector('#sb-breadcrumbs');
            if (!content) return;

            // Breadcrumbs
            if (crumbs) {
                if (this._view === 'overview') {
                    crumbs.innerHTML = '<span class="sb-crumb sb-crumb--active">Storage Overview</span>';
                } else {
                    let html = '<span class="sb-crumb sb-crumb--home" data-path="">root</span>';
                    let accumulated = '';
                    for (const segment of this._breadcrumbs) {
                        accumulated += (accumulated ? '/' : '') + segment;
                        html += ` <span class="sb-crumb-sep">/</span> <span class="sb-crumb" data-path="${this._escAttr(accumulated)}">${this._esc(segment)}</span>`;
                    }
                    crumbs.innerHTML = html;
                }
            }

            if (this._loading) {
                content.innerHTML = '<div class="sb-loading">Loading\u2026</div>';
                this._setupListeners();
                return;
            }

            if (this._view === 'overview')    this._renderOverview(content);
            else if (this._view === 'entry')  this._renderEntry(content);
            else                              this._renderBrowse(content);

            // Status bar
            if (statusbar) {
                if (this._view === 'overview') {
                    statusbar.textContent = `${this._namespaces.length} namespaces`;
                } else if (this._view === 'entry') {
                    const found = this._entryData?.found ? 'Found' : 'Not found';
                    statusbar.textContent = `Entry: ${this._entryData?.cache_id || '?'} | ${found}`;
                } else {
                    const filterNote = this._filter ? ` (filtered from ${this._allFiles.length})` : '';
                    statusbar.textContent = `${this._folders.length} folders, ${this._files.length} files${filterNote}`;
                }
            }

            this._setupListeners();
        }

        _renderOverview(container) {
            let cardsHtml = '';
            for (const ns of this._namespaces) {
                const counts = this._nsCounts[ns] || { folders: 0, files: 0 };
                cardsHtml += `
                    <div class="sb-ns-card" data-namespace="${this._escAttr(ns)}">
                        <div class="sb-ns-card__name">${this._esc(ns)}</div>
                        <div class="sb-ns-card__counts">
                            <span class="sb-ns-card__count">${counts.folders} folders</span>
                            <span class="sb-ns-card__sep">\u00B7</span>
                            <span class="sb-ns-card__count">${counts.files} files</span>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = `
                <div class="sb-overview">
                    <div class="sb-overview__title">Memory-FS Namespaces</div>
                    <div class="sb-ns-grid">${cardsHtml}</div>
                </div>
            `;
        }

        _renderBrowse(container) {
            let html = '';

            // Search bar
            html += `
                <div class="sb-search">
                    <input type="text" class="sb-search__input" id="sb-filter"
                           placeholder="Filter files\u2026" value="${this._escAttr(this._filter)}">
                </div>
            `;

            if (this._folders.length === 0 && this._files.length === 0) {
                html += '<div class="sb-empty">No items at this path.</div>';
            }

            // Folders
            for (const folder of this._folders) {
                html += `<div class="sb-item sb-folder" data-name="${this._escAttr(folder)}">
                    <span class="sb-icon">\uD83D\uDCC1</span>
                    <span class="sb-name">${this._esc(folder)}</span>
                </div>`;
            }

            // Files
            for (const file of this._files) {
                const shortName = typeof file === 'string' ? file.split('/').pop() : String(file);
                const fullPath  = typeof file === 'string' ? file : String(file);
                const isJson    = shortName.endsWith('.json');
                const icon      = isJson ? '\uD83D\uDCC4' : '\u2699';
                const cls       = isJson ? 'sb-file--json' : 'sb-file--meta';
                html += `<div class="sb-item sb-file ${cls}" data-filename="${this._escAttr(fullPath)}">
                    <span class="sb-icon">${icon}</span>
                    <span class="sb-name">${this._esc(shortName)}</span>
                </div>`;
            }

            container.innerHTML = html;
        }

        _renderEntry(container) {
            if (!this._entryData) {
                container.innerHTML = '<div class="sb-empty">No entry data.</div>';
                return;
            }
            const { cache_id, namespace, data, found } = this._entryData;
            const jsonStr = data ? JSON.stringify(data, null, 2) : 'null';
            container.innerHTML = `
                <div class="sb-entry-header">
                    <div class="sb-entry-meta"><span class="sb-entry-label">Namespace:</span> <span class="sb-entry-value">${this._esc(namespace)}</span></div>
                    <div class="sb-entry-meta"><span class="sb-entry-label">Cache ID:</span> <span class="sb-entry-value">${this._esc(cache_id)}</span></div>
                    <div class="sb-entry-meta"><span class="sb-entry-label">Status:</span> <span class="sb-entry-value">${found ? 'Found' : 'Not found'}</span></div>
                </div>
                <pre class="sb-json">${this._esc(jsonStr)}</pre>
            `;
        }

        // ─── Event Listeners ─────────────────────────────────────────────────

        _setupListeners() {
            this.querySelector('#sb-home')?.addEventListener('click', () => this._loadOverview());
            this.querySelector('#sb-refresh')?.addEventListener('click', () => this._refreshCurrent());

            this.querySelector('#sb-back')?.addEventListener('click', () => {
                if (this._view === 'entry') {
                    this._view = 'browse';
                    this._renderContent();
                } else if (this._view === 'browse' && this._breadcrumbs.length > 0) {
                    const parent = this._breadcrumbs.slice(0, -1).join('/');
                    if (parent) this._navigateTo(parent);
                    else this._loadOverview();
                } else {
                    this._loadOverview();
                }
            });

            this.querySelectorAll('.sb-crumb[data-path]').forEach(el => {
                el.addEventListener('click', () => {
                    const path = el.dataset.path;
                    if (path) this._navigateTo(path);
                    else this._loadOverview();
                });
            });

            this.querySelectorAll('.sb-ns-card').forEach(el => {
                el.addEventListener('click', () => this._navigateTo(el.dataset.namespace));
            });

            this.querySelectorAll('.sb-folder').forEach(el => {
                el.addEventListener('click', () => {
                    const target = this._currentPath ? `${this._currentPath}/${el.dataset.name}` : el.dataset.name;
                    this._navigateTo(target);
                });
            });

            this.querySelectorAll('.sb-file').forEach(el => {
                el.addEventListener('click', () => {
                    const cacheId = this._extractCacheId(el.dataset.filename);
                    const ns      = this._breadcrumbs[0] || 'analytics';
                    if (cacheId) this._inspectEntry(ns, cacheId);
                });
            });

            const filterInput = this.querySelector('#sb-filter');
            if (filterInput) {
                filterInput.addEventListener('input', (e) => this._applyFilter(e.target.value));
            }
        }

        // ─── Styles ──────────────────────────────────────────────────────────

        static get styles() {
            return `
                .sb-container     { display: flex; flex-direction: column; height: 100%; font-size: var(--admin-font-size-sm, 0.875rem); }
                .sb-toolbar       { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--admin-surface, #1e1e2e); border-bottom: 1px solid var(--admin-border, #313244); flex-shrink: 0; }
                .sb-btn           { background: none; border: 1px solid var(--admin-border, #313244); border-radius: var(--admin-radius, 6px); color: var(--admin-text-secondary, #a6adc8); cursor: pointer; padding: 0.25rem 0.5rem; font-size: 0.875rem; transition: background 0.15s, color 0.15s; }
                .sb-btn:hover     { background: var(--admin-surface-hover, #313244); color: var(--admin-text, #cdd6f4); }
                .sb-btn--right    { margin-left: auto; }
                .sb-breadcrumbs   { display: flex; align-items: center; gap: 0.25rem; flex: 1; overflow-x: auto; white-space: nowrap; font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #6c7086); }
                .sb-crumb         { cursor: pointer; color: var(--admin-primary, #89b4fa); padding: 0.125rem 0.25rem; border-radius: 3px; }
                .sb-crumb:hover   { background: var(--admin-surface-hover, #313244); }
                .sb-crumb--active { color: var(--admin-text, #cdd6f4); cursor: default; }
                .sb-crumb--home   { cursor: pointer; }
                .sb-crumb-sep     { color: var(--admin-text-muted, #6c7086); }
                .sb-content       { flex: 1; overflow-y: auto; padding: 0.5rem; }

                /* Overview */
                .sb-overview__title { font-size: var(--admin-font-size-sm, 0.875rem); font-weight: 600; color: var(--admin-text-secondary, #a6adc8); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
                .sb-ns-grid       { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem; }
                .sb-ns-card       { background: var(--admin-surface, #1e1e2e); border: 1px solid var(--admin-border, #313244); border-radius: var(--admin-radius, 6px); padding: 0.75rem; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
                .sb-ns-card:hover { border-color: var(--admin-primary, #89b4fa); background: var(--admin-surface-hover, #313244); }
                .sb-ns-card__name { font-family: var(--admin-font-mono, monospace); font-weight: 600; color: var(--admin-primary, #89b4fa); margin-bottom: 0.375rem; }
                .sb-ns-card__counts { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #6c7086); }
                .sb-ns-card__sep  { margin: 0 0.25rem; }

                /* Search */
                .sb-search        { margin-bottom: 0.5rem; }
                .sb-search__input { width: 100%; padding: 0.375rem 0.5rem; font-size: var(--admin-font-size-xs, 0.75rem); font-family: var(--admin-font-mono, monospace); color: var(--admin-text, #cdd6f4); background: var(--admin-surface, #1e1e2e); border: 1px solid var(--admin-border, #313244); border-radius: var(--admin-radius, 6px); box-sizing: border-box; outline: none; }
                .sb-search__input:focus { border-color: var(--admin-primary, #89b4fa); }

                /* Browse items */
                .sb-item          { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; border-radius: var(--admin-radius, 6px); cursor: pointer; transition: background 0.15s; }
                .sb-item:hover    { background: var(--admin-surface-hover, #313244); }
                .sb-icon          { font-size: 1rem; flex-shrink: 0; width: 1.25rem; text-align: center; }
                .sb-name          { font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text, #cdd6f4); overflow: hidden; text-overflow: ellipsis; }
                .sb-folder .sb-name   { color: var(--admin-primary, #89b4fa); font-weight: 500; }
                .sb-file--json .sb-name { color: var(--admin-text, #cdd6f4); }
                .sb-file--meta .sb-name { color: var(--admin-text-muted, #6c7086); }

                /* States */
                .sb-loading, .sb-empty { padding: 2rem; text-align: center; color: var(--admin-text-muted, #6c7086); }

                /* Entry viewer */
                .sb-entry-header  { padding: 0.75rem; background: var(--admin-surface, #1e1e2e); border-radius: var(--admin-radius, 6px); margin-bottom: 0.5rem; }
                .sb-entry-meta    { display: flex; gap: 0.5rem; padding: 0.125rem 0; font-size: var(--admin-font-size-xs, 0.75rem); }
                .sb-entry-label   { color: var(--admin-text-muted, #6c7086); min-width: 80px; }
                .sb-entry-value   { color: var(--admin-text, #cdd6f4); font-family: var(--admin-font-mono, monospace); }
                .sb-json          { background: var(--admin-surface, #1e1e2e); border: 1px solid var(--admin-border, #313244); border-radius: var(--admin-radius, 6px); padding: 0.75rem; font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text, #cdd6f4); overflow-x: auto; white-space: pre-wrap; word-break: break-word; line-height: 1.5; max-height: 70vh; overflow-y: auto; }

                /* Statusbar */
                .sb-statusbar     { flex-shrink: 0; padding: 0.25rem 0.75rem; font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #6c7086); border-top: 1px solid var(--admin-border, #313244); background: var(--admin-surface, #1e1e2e); }
            `;
        }
    }

    customElements.define('storage-browser', StorageBrowser);
})();
