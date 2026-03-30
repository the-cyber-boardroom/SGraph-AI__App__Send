/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — _page.json overlay for send-browse-v031.js

   Must be loaded AFTER send-browse-v031.js and page-layout-renderer.js.

   Changes:
     PLR-001: Folder header click → detect _page.json → render page layout tab
     PLR-002: Auto-open checks root _page.json first (before first file heuristic)
     PLR-003: _openFolderPage() — loads _page.json, opens as named tab, renders
     PLR-004: _openFileTab intercept — clicking _page.json in tree renders page
              layout instead of raw JSON
     PLR-005: JSON colorizer — _colorizeJson() applied to source view + all .json
              file renders in the browse component
   ═══════════════════════════════════════════════════════════════════════════════ */


// ─── PLR-005: JSON syntax colorizer ──────────────────────────────────────────
//
// Simple regex-based tokeniser. Returns HTML with <span> elements for keys,
// strings, numbers, booleans, and null. Safe — only runs on already-escaped text.

function _colorizeJson(rawText) {
    // Work on the raw text, escaping HTML as we go
    var escaped = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return escaped.replace(
        /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
            var cls = 'plr-json-num';
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'plr-json-key' : 'plr-json-str';
            } else if (/true|false/.test(match)) {
                cls = 'plr-json-bool';
            } else if (/null/.test(match)) {
                cls = 'plr-json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        }
    );
}


// ─── PLR-005b: Wire JSON colorizer into regular .json file rendering ──────────
//
// Wraps _renderFileContent so that files typed as 'code' with .json extension
// get syntax-highlighted source instead of plain escaped text.

SendBrowse.prototype._renderFileContent = (function (original) {
    return function (container, bytes, fileName, type) {
        original.call(this, container, bytes, fileName, type);

        // Only act on code-type files with a .json extension
        var ext = (fileName || '').split('.').pop().toLowerCase();
        if (type !== 'code' || ext !== 'json') return;

        // Find the <pre> the original rendered
        var pre = container.querySelector('.sb-file__content .sb-file__code');
        if (!pre || pre.dataset.jsonColorized) return;
        pre.dataset.jsonColorized = '1';

        var rawText = new TextDecoder().decode(bytes);
        pre.innerHTML = _colorizeJson(rawText);
    };
})(SendBrowse.prototype._renderFileContent);


// ─── PLR-001: Folder click → _page.json detection ────────────────────────────
//
// Wraps the base _setupTreeListeners. After the original adds expand/collapse and
// file-click handlers, we add a SECOND click listener on each folder header that
// checks whether the folder contains a _page.json. If it does, clicking the header
// also opens the page layout tab (in addition to expanding/collapsing the folder).

SendBrowse.prototype._setupTreeListeners = (function (original) {
    return function (treeEl) {
        // Run original first: expand/collapse, file open, expand/collapse all
        original.call(this, treeEl);

        var self = this;
        treeEl.querySelectorAll('.sb-tree__folder-header').forEach(function (header) {
            header.addEventListener('click', function () {
                if (!self.zipTree) return;
                var folder = header.closest('.sb-tree__folder');
                var folderPath = folder ? folder.getAttribute('data-path') : null;
                if (!folderPath) return;

                // Check exact-path: folderPath/_page.json
                var pageJsonPath = folderPath + '/_page.json';
                var hasPage = self.zipTree.some(function (e) {
                    return !e.dir && (e.path === pageJsonPath || e.path.endsWith('/' + pageJsonPath));
                });
                if (hasPage) self._openFolderPage(folderPath, pageJsonPath);
            });
        });
    };
})(SendBrowse.prototype._setupTreeListeners);


// ─── PLR-002: Auto-open checks root _page.json first ─────────────────────────
//
// Wraps the v0.3.1 _autoOpenFirstFile. If the zip contains a root-level
// _page.json, render it instead of running the normal "first file" heuristic.

SendBrowse.prototype._autoOpenFirstFile = (function (original) {
    return function () {
        if (this.zipTree) {
            var rootPage = this.zipTree.find(function (e) {
                return !e.dir && (e.path === '_page.json' || e.path.endsWith('/_page.json') && e.path.split('/').length === 2);
            });
            if (rootPage) {
                // Determine the folder path of the root _page.json
                var parts = rootPage.path.split('/');
                var folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                this._openFolderPage(folderPath, rootPage.path);
                return;
            }
        }
        original.call(this);
    };
})(SendBrowse.prototype._autoOpenFirstFile);


// ─── PLR-004: _openFileTab intercept — _page.json → page layout ──────────────
//
// When the user clicks `_page.json` directly in the tree, the base
// _openFileTab would display raw JSON. We intercept paths that end in
// `_page.json` and delegate to _openFolderPage instead.

SendBrowse.prototype._openFileTab = (function (original) {
    return function (path) {
        if (path && (path === '_page.json' || path.endsWith('/_page.json'))) {
            var parts = path.split('/');
            var folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
            this._openFolderPage(folderPath, path);
            return;
        }
        original.call(this, path);
    };
})(SendBrowse.prototype._openFileTab);


// ─── PLR-003: _openFolderPage — load _page.json and render as tab ─────────────

SendBrowse.prototype._openFolderPage = async function (folderPath, pageJsonPath) {
    if (!this._sgLayout || !this.zipTree) return;

    // BRW-015: inject scrollable tab bar CSS (once)
    if (typeof _injectTabBarScrollCSS !== 'undefined') _injectTabBarScrollCSS(this._sgLayout);

    // Deduplicate: if a tab is already open for this folder page, switch to it
    var tabKey = '__page__' + (folderPath || 'root');
    var existingId = this._openTabs && this._openTabs.get(tabKey);
    if (existingId) {
        var existingTabEl = this._sgLayout.shadowRoot
            ? this._sgLayout.shadowRoot.querySelector('.sgl-tab[data-tab-id="' + existingId + '"]')
            : null;
        if (existingTabEl) { existingTabEl.click(); return; }
        if (this._openTabs) this._openTabs.delete(tabKey);
    }

    // Tab title: read page.title from JSON when available (root page), else folder name
    var tabTitle = folderPath ? folderPath.split('/').pop() : (this.fileName || 'Home');

    var newId = this._sgLayout.addTabToStack('s-preview', {
        tag: 'div',
        title: '\uD83D\uDCC4 ' + tabTitle,   // 📄 icon
        state: { pageFolder: folderPath }
    }, true);

    if (!newId) return;
    if (this._openTabs) this._openTabs.set(tabKey, newId);

    var self = this;
    requestAnimationFrame(async function () {
        var el = self._sgLayout.getPanelElement(newId);
        if (!el) return;

        // P1-B fix: panel is the outer frame (no overflow); .plr-scroll-wrapper
        // inside is the actual scroll container. Keep height:100% here.
        el.style.cssText = 'height: 100%; overflow: hidden; display: flex; flex-direction: column;';
        el.innerHTML = '<div style="padding:1rem;color:var(--color-text-secondary,#888);">Loading page\u2026</div>';

        try {
            // Resolve the _page.json path against the zip tree
            var pageEntry = self.zipTree.find(function (e) {
                return !e.dir && (e.path === pageJsonPath || e.path.endsWith('/' + pageJsonPath));
            });
            if (!pageEntry) throw new Error('_page.json not found: ' + pageJsonPath);

            var bytes = await pageEntry.entry.async('arraybuffer');
            var rawJsonText = new TextDecoder().decode(bytes);
            var json = JSON.parse(rawJsonText);

            // Update tab title from page.title if available
            if (json.title && self._sgLayout && self._sgLayout.shadowRoot) {
                var tabEl = self._sgLayout.shadowRoot.querySelector('.sgl-tab[data-tab-id="' + newId + '"]');
                if (tabEl) {
                    var titleSpan = tabEl.querySelector('.sgl-tab__title');
                    if (titleSpan) titleSpan.textContent = '\uD83D\uDCC4 ' + json.title;
                }
            }

            el.innerHTML = '';

            // ── Rendered view ──────────────────────────────────────────────
            var renderedView = document.createElement('div');
            renderedView.style.cssText = 'flex: 1; overflow: hidden; display: flex; flex-direction: column;';

            if (typeof PageLayoutRenderer !== 'undefined') {
                await PageLayoutRenderer.render(renderedView, json, folderPath, self.zipTree, self);
            } else {
                renderedView.innerHTML = '<pre style="padding:1rem;">' +
                    SendHelpers.escapeHtml(rawJsonText) + '</pre>';
            }

            // ── Source view (hidden initially) ─────────────────────────────
            var sourceView = document.createElement('pre');
            sourceView.className = 'plr-json-source';
            sourceView.style.display = 'none';
            sourceView.innerHTML = _colorizeJson(rawJsonText);

            // ── Source toggle bar ──────────────────────────────────────────
            // Shown as a thin strip at top of the panel (outside the scrollable area)
            var toggleBar = document.createElement('div');
            toggleBar.className = 'plr-source-bar';

            var toggleBtn = document.createElement('button');
            toggleBtn.className = 'plr-source-toggle-btn';
            toggleBtn.textContent = '{ } Source';
            toggleBtn.title = 'View the raw _page.json that generates this layout';

            var isSource = false;
            toggleBtn.addEventListener('click', function () {
                isSource = !isSource;
                renderedView.style.display = isSource ? 'none' : '';
                sourceView.style.display   = isSource ? ''     : 'none';
                toggleBtn.textContent      = isSource ? '\u229E Rendered' : '{ } Source';
            });

            toggleBar.appendChild(toggleBtn);

            el.appendChild(toggleBar);
            el.appendChild(renderedView);
            el.appendChild(sourceView);

        } catch (err) {
            el.innerHTML = '<div style="padding:1rem;color:var(--color-error,#e74c3c);">Failed to load page: ' +
                SendHelpers.escapeHtml(err.message) + '</div>';
        }

        // BRW-015: scroll new tab into view
        if (self._sgLayout && self._sgLayout.shadowRoot) {
            var newTabEl = self._sgLayout.shadowRoot.querySelector('.sgl-tab[data-tab-id="' + newId + '"]');
            if (newTabEl) newTabEl.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' });
        }
    });
};
