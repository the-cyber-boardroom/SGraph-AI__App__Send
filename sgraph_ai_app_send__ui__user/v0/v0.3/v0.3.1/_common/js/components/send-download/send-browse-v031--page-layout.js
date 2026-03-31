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


// ─── PLR-006: Deep-link utilities ────────────────────────────────────────────
//
// URL format: /en-gb/browse/#<token>/<file-path>
// The token is everything before the first '/'. The file path is everything
// after. Examples:
//   #help-aunt-2780/brief/_page.json   → folder page in brief/
//   #help-aunt-2780/submission/bio.md  → file tab
//   #help-aunt-2780                    → default (root _page.json or first file)
//
// _plrGetHashPath()  → returns the path portion or null
// _plrSetHashPath(p) → updates the hash preserving the token (replaceState)

function _plrGetHashPath() {
    var hash = window.location.hash.slice(1);
    var idx  = hash.indexOf('/');
    if (idx === -1) return null;
    var path = hash.slice(idx + 1);
    return path || null;
}

function _plrSetHashPath(path) {
    var hash  = window.location.hash.slice(1);
    var idx   = hash.indexOf('/');
    var token = idx === -1 ? hash : hash.slice(0, idx);
    var next  = token + (path ? '/' + path : '');
    if (hash !== next) history.replaceState(null, '', '#' + next);
}


// ─── PLR-007: Print via new window ───────────────────────────────────────────
//
// Opens a clean print-preview window styled the same as the sg-print.js
// markdown print window (dark toolbar, SG/Send branding, A4-like body).
// The rendered _page.json content is included with the page-layout CSS applied.
// Blob URLs (images, hero backgrounds) are converted to data: URLs so they
// display correctly in the new window (blob: URLs are window-scoped).
//
// Usage: _plrPrintPage(title, renderedViewElement)

async function _plrPrintPage(title, renderedView) {
    // Find the page-layout stylesheet absolute URL (loaded by browse/index.html)
    var cssHref = '';
    for (var i = 0; i < document.styleSheets.length; i++) {
        var sheet = document.styleSheets[i];
        if (sheet.href && sheet.href.indexOf('page-layout') !== -1) {
            cssHref = sheet.href;
            break;
        }
    }

    // Clone to avoid mutating the live DOM
    var clone = renderedView.cloneNode(true);

    // Convert <img src="blob:..."> to data: URLs for cross-window portability
    var imgs = Array.from(clone.querySelectorAll('img[src^="blob:"]'));
    for (var ii = 0; ii < imgs.length; ii++) {
        try {
            var r = await fetch(imgs[ii].getAttribute('src'));
            var b = await r.blob();
            var du = await new Promise(function (res) {
                var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b);
            });
            imgs[ii].src = du;
        } catch (e) { /* leave as-is if unreadable */ }
    }

    // Convert inline style background-image blob: URLs
    var bgEls = Array.from(clone.querySelectorAll('[style*="blob:"]'));
    for (var bi = 0; bi < bgEls.length; bi++) {
        var sty = bgEls[bi].getAttribute('style') || '';
        var m = sty.match(/url\(["']?(blob:[^"')]+)["']?\)/);
        if (m) {
            try {
                var r2 = await fetch(m[1]);
                var b2 = await r2.blob();
                var du2 = await new Promise(function (res2) {
                    var fr2 = new FileReader(); fr2.onload = function () { res2(fr2.result); }; fr2.readAsDataURL(b2);
                });
                bgEls[bi].setAttribute('style', sty.replace(m[0], 'url(' + du2 + ')'));
            } catch (e) { /* leave as-is */ }
        }
    }

    var pageTitle = title || 'Page';
    var safeTitle = pageTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var logoSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
    var cssLink = cssHref ? '<link rel="stylesheet" href="' + cssHref + '">' : '';

    var toolbarCss = [
        '@media screen {',
        '  body { margin:0; padding:0; background:#f0f0f0; }',
        '  .plr-print-toolbar {',
        '    position:sticky; top:0; z-index:100;',
        '    background:#2d2d2d; color:#fff; padding:12px 24px;',
        '    display:flex; align-items:center; gap:16px;',
        '    font-family:system-ui,-apple-system,sans-serif; font-size:13px;',
        '    box-shadow:0 2px 8px rgba(0,0,0,0.2);',
        '  }',
        '  .plr-print-brand { display:flex; align-items:center; gap:6px; font-size:14px; }',
        '  .plr-print-brand b { color:#4ECDC4; }',
        '  .plr-print-sep { width:1px; height:20px; background:#555; }',
        '  .plr-print-info { color:#bbb; flex:1; }',
        '  .plr-print-info strong { color:#fff; }',
        '  .plr-print-toolbar button { padding:6px 16px; border:none; border-radius:4px; font-size:13px; cursor:pointer; font-weight:500; }',
        '  .btn-plr-print { background:#4ECDC4; color:#1a1a1a; }',
        '  .btn-plr-print:hover { background:#3dbdb5; }',
        '  .btn-plr-close { background:transparent; color:#bbb; border:1px solid #555; }',
        '  .btn-plr-close:hover { background:#444; color:#fff; }',
        '  .plr-print-body { max-width:960px; margin:24px auto; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,0.15); border-radius:2px; }',
        '}',
        /* The renderedView clone carries inline flex/overflow styles from the browse panel.
           In the print window there is no fixed-height parent, so normalise them. */
        '.plr-print-body > .plr-page {',
        '  overflow:visible !important;',
        '  height:auto !important;',
        '  min-height:0 !important;',
        '  flex:none !important;',
        '}',
        '.plr-print-body .plr-scroll-wrapper {',
        '  overflow:visible !important;',
        '  height:auto !important;',
        '  flex:none !important;',
        '}',
        '@media print {',
        '  .plr-print-toolbar { display:none !important; }',
        '  .plr-print-body { max-width:none; margin:0; box-shadow:none; border-radius:0; }',
        '}'
    ].join('\n');

    var printDoc = '<!DOCTYPE html><html><head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + safeTitle + '</title>' +
        cssLink +
        '<style>' + toolbarCss + '</style>' +
        '</head><body>' +
        '<div class="plr-print-toolbar">' +
            '<div class="plr-print-brand">' + logoSvg + '<span>SG/<b>Send</b></span></div>' +
            '<div class="plr-print-sep"></div>' +
            '<div class="plr-print-info">Print preview \u2014 <strong>' + safeTitle + '</strong></div>' +
            '<button class="btn-plr-print" onclick="window.print()">Print / Save PDF</button>' +
            '<button class="btn-plr-close" onclick="window.close()">Close</button>' +
        '</div>' +
        '<div class="plr-print-body">' + clone.outerHTML + '</div>' +
        '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { window.print(); return; }
    w.document.write(printDoc);
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
}


// ─── PLR-007b: Intercept Cmd/Ctrl+P to open print preview ────────────────────
//
// If a _page.json is being viewed (present mode or regular tab), pressing the
// native print shortcut opens _plrPrintPage() instead of the browser dialog.
//
// State: window._plrPrintState = { title, getView }
//   - Set when a PLR page is first rendered
//   - Updated on mousedown so the last-clicked panel is used when Cmd+P fires
//
// Priority:
//   1. Present overlay is open → print the overlay content
//   2. _plrPrintState.getView() is in the DOM → print that panel

if (!window._plrKeydownRegistered) {
    window._plrKeydownRegistered = true;
    document.addEventListener('keydown', function (e) {
        if (!((e.metaKey || e.ctrlKey) && e.key === 'p')) return;

        // 1. Present mode takes priority
        var overlay = document.querySelector('.plr-present-overlay');
        if (overlay) {
            e.preventDefault();
            var content  = overlay.querySelector('.plr-present-content');
            var titleEl  = overlay.querySelector('.plr-present-title');
            var view     = content ? content.firstElementChild : null;
            if (view) _plrPrintPage(titleEl ? titleEl.textContent : '', view);
            return;
        }

        // 2. Regular panel
        var state = window._plrPrintState;
        if (state) {
            var pv = state.getView();
            if (pv && document.body.contains(pv)) {
                e.preventDefault();
                _plrPrintPage(state.title, pv);
            }
        }
    });
}


// ─── PLR-002: Auto-open checks root _page.json first ─────────────────────────
//
// Wraps the v0.3.1 _autoOpenFirstFile. Priority order:
//   1. Deep-link path from URL hash  (PLR-006)
//   2. Root-level _page.json         (original PLR-002 behaviour)
//   3. Base first-file heuristic

SendBrowse.prototype._autoOpenFirstFile = (function (original) {
    return function () {
        var self = this;
        if (self.zipTree) {
            // 1. Deep-link: check if the hash already encodes a file path
            var hashPath = _plrGetHashPath();
            if (hashPath) {
                var linked = self.zipTree.find(function (e) {
                    return !e.dir && (e.path === hashPath ||
                        e.path.endsWith('/' + hashPath));
                });
                if (linked) {
                    // Route through the same intercept so _page.json is handled
                    self._openFileTab(hashPath);
                    return;
                }
                // Path not found in this vault — clear the stale path
                _plrSetHashPath('');
            }

            // 2. Root _page.json
            var rootPage = self.zipTree.find(function (e) {
                return !e.dir && (e.path === '_page.json' ||
                    (e.path.endsWith('/_page.json') && e.path.split('/').length === 2));
            });
            if (rootPage) {
                var parts = rootPage.path.split('/');
                var folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
                self._openFolderPage(folderPath, rootPage.path);
                return;
            }
        }
        original.call(self);
    };
})(SendBrowse.prototype._autoOpenFirstFile);


// ─── PLR-004: _openFileTab intercept — _page.json → page layout ──────────────
//
// When the user clicks `_page.json` directly in the tree, the base
// _openFileTab would display raw JSON. We intercept paths that end in
// `_page.json` and delegate to _openFolderPage, which renders the page layout.
// Also updates the URL hash for deep-linking (PLR-006).

SendBrowse.prototype._openFileTab = (function (original) {
    return function (path) {
        if (path) _plrSetHashPath(path);
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
    // Update URL hash for deep-linking (PLR-006)
    if (pageJsonPath) _plrSetHashPath(pageJsonPath);

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

            // Register this page for CMD+P interception (PLR-007b).
            // Update on mousedown so the last-clicked panel wins.
            var _plrEntry = { title: json.title || '', getView: function () { return renderedView; } };
            window._plrPrintState = _plrEntry;
            el.addEventListener('mousedown', function () { window._plrPrintState = _plrEntry; }, true);

            // ── Source view (hidden initially) ─────────────────────────────
            var sourceView = document.createElement('pre');
            sourceView.className = 'plr-json-source';
            sourceView.style.display = 'none';
            sourceView.innerHTML = _colorizeJson(rawJsonText);

            // ── Action bar ─────────────────────────────────────────────────
            // Shown as a thin strip at top of the panel (outside scrollable area).
            // Contains: Locate | ⎋ Copy JSON | { } Source toggle
            var toggleBar = document.createElement('div');
            toggleBar.className = 'plr-source-bar';

            // Locate button — highlights _page.json in the sidebar tree
            var locateBtn = document.createElement('button');
            locateBtn.className = 'plr-source-toggle-btn';
            locateBtn.textContent = '\u29BF Locate';
            locateBtn.title = 'Show _page.json highlighted in the sidebar tree';
            locateBtn.addEventListener('click', function () {
                if (typeof _revealInTree !== 'undefined') _revealInTree(self, pageJsonPath);
            });

            // Present button — opens a clean full-screen overlay for reading/printing
            var presentBtn = document.createElement('button');
            presentBtn.className = 'plr-source-toggle-btn';
            presentBtn.textContent = '\u26F6 Present';
            presentBtn.title = 'Open in full-screen present mode (ESC to exit)';
            presentBtn.addEventListener('click', function () {
                var overlay = document.createElement('div');
                overlay.className = 'plr-present-overlay';

                // Header bar: title + Print + Close
                var bar = document.createElement('div');
                bar.className = 'plr-present-bar';

                var titleEl = document.createElement('span');
                titleEl.className = 'plr-present-title';
                titleEl.textContent = json.title || '';

                var printBtn2 = document.createElement('button');
                printBtn2.className = 'plr-present-btn';
                printBtn2.textContent = '\uD83D\uDDA8 Print';
                printBtn2.title = 'Open print preview in new window';
                printBtn2.addEventListener('click', function () { _plrPrintPage(json.title, clone); });

                var closeBtn = document.createElement('button');
                closeBtn.className = 'plr-present-btn plr-present-close';
                closeBtn.textContent = '\u2715 Close';
                closeBtn.title = 'Exit present mode (ESC)';

                function closeOverlay() {
                    if (document.body.contains(overlay)) document.body.removeChild(overlay);
                    document.removeEventListener('keydown', escHandler);
                }
                function escHandler(e) { if (e.key === 'Escape') closeOverlay(); }
                closeBtn.addEventListener('click', closeOverlay);
                document.addEventListener('keydown', escHandler);

                bar.appendChild(titleEl);
                bar.appendChild(printBtn2);
                bar.appendChild(closeBtn);

                // Content: clone rendered view, force white background
                var content = document.createElement('div');
                content.className = 'plr-present-content';
                var clone = renderedView.cloneNode(true);
                clone.style.display = '';
                content.appendChild(clone);

                overlay.appendChild(bar);
                overlay.appendChild(content);
                document.body.appendChild(overlay);

                // Anchor links inside the clone lost their event listeners
                // (cloneNode copies DOM, not listeners). Without interception
                // the browser follows href="#section-id", replaces the whole
                // hash and loses the transfer token. Re-wire them to scroll
                // the present overlay's content container instead.
                overlay.querySelectorAll('a[href^="#"]').forEach(function (a) {
                    a.addEventListener('click', function (e) {
                        e.preventDefault();
                        var id = a.getAttribute('href').slice(1);
                        var target = content.querySelector('#' + id);
                        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                });
            });

            // Copy button: copies raw JSON to clipboard
            var copyBtn = document.createElement('button');
            copyBtn.className = 'plr-source-toggle-btn';
            copyBtn.textContent = '\u238B Copy JSON';
            copyBtn.title = 'Copy raw _page.json to clipboard';
            copyBtn.addEventListener('click', function () {
                var reset = function () {
                    setTimeout(function () { copyBtn.textContent = '\u238B Copy JSON'; }, 1500);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(rawJsonText)
                        .then(function () { copyBtn.textContent = '\u2713 Copied'; reset(); })
                        .catch(function () { copyBtn.textContent = '\u2717 Failed'; reset(); });
                } else {
                    var ta = document.createElement('textarea');
                    ta.value = rawJsonText;
                    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); copyBtn.textContent = '\u2713 Copied'; }
                    catch (_) { copyBtn.textContent = '\u2717 Failed'; }
                    document.body.removeChild(ta);
                    reset();
                }
            });

            // ── Edit mode ──────────────────────────────────────────────────
            // Split-pane: editable JSON textarea (left) + live rendered preview (right)
            var editSplit = document.createElement('div');
            editSplit.className = 'plr-edit-split';
            editSplit.style.display = 'none';

            var editLeft = document.createElement('div');
            editLeft.className = 'plr-edit-left';

            var editTextarea = document.createElement('textarea');
            editTextarea.className = 'plr-edit-textarea';
            editTextarea.spellcheck = false;
            editTextarea.value = rawJsonText;

            var editStatus = document.createElement('div');
            editStatus.className = 'plr-edit-status plr-edit-status--ok';
            editStatus.textContent = '\u2713 Valid JSON';

            editLeft.appendChild(editTextarea);
            editLeft.appendChild(editStatus);

            var editRight = document.createElement('div');
            editRight.className = 'plr-edit-right';

            editSplit.appendChild(editLeft);
            editSplit.appendChild(editRight);

            // Debounced re-render for the edit preview pane.
            // Blob URLs are tracked separately and revoked before each re-render.
            var editDebounceTimer = null;
            var editBlobUrls = [];

            async function _doEditRender(jsonText) {
                // Revoke previous edit preview blob URLs
                editBlobUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
                editBlobUrls = [];

                var parsed;
                try {
                    parsed = JSON.parse(jsonText);
                    editStatus.textContent = '\u2713 Valid JSON';
                    editStatus.className = 'plr-edit-status plr-edit-status--ok';
                } catch (e) {
                    editStatus.textContent = '\u2717 ' + e.message;
                    editStatus.className = 'plr-edit-status plr-edit-status--err';
                    return;
                }

                editRight.innerHTML = '';
                var previewContainer = document.createElement('div');
                previewContainer.style.cssText = 'height:100%;';

                // Temporarily redirect blob URL tracking to the edit array
                var savedUrls = self._objectUrls;
                self._objectUrls = editBlobUrls;
                try {
                    if (typeof PageLayoutRenderer !== 'undefined') {
                        await PageLayoutRenderer.render(previewContainer, parsed, folderPath, self.zipTree, self);
                    }
                } catch (e) {
                    previewContainer.innerHTML = '<div style="padding:1rem;color:#e06c75;">Render error: ' +
                        SendHelpers.escapeHtml(e.message) + '</div>';
                } finally {
                    self._objectUrls = savedUrls;
                }
                editRight.appendChild(previewContainer);
            }

            editTextarea.addEventListener('input', function () {
                clearTimeout(editDebounceTimer);
                editDebounceTimer = setTimeout(function () { _doEditRender(editTextarea.value); }, 400);
            });

            // Edit button
            var editBtn = document.createElement('button');
            editBtn.className = 'plr-source-toggle-btn';
            editBtn.textContent = '\u270E Edit';
            editBtn.title = 'Edit JSON with live preview (changes are not saved)';

            // ── View state machine ─────────────────────────────────────────
            // Three mutually exclusive states: rendered | source | edit
            var isSource = false;
            var isEdit   = false;

            function _applyViewState() {
                renderedView.style.display = (!isSource && !isEdit) ? '' : 'none';
                sourceView.style.display   = (isSource && !isEdit) ? '' : 'none';
                editSplit.style.display    = isEdit ? '' : 'none';
                toggleBtn.textContent = isSource ? '\u229E Rendered' : '{ } Source';
                if (isEdit) {
                    editBtn.textContent = '\u270E Editing';
                    editBtn.style.color = 'var(--color-primary, #4ecdc4)';
                } else {
                    editBtn.textContent = '\u270E Edit';
                    editBtn.style.color = '';
                }
            }

            // Source toggle: switches between rendered layout and colorised JSON
            var toggleBtn = document.createElement('button');
            toggleBtn.className = 'plr-source-toggle-btn';
            toggleBtn.textContent = '{ } Source';
            toggleBtn.title = 'View the raw _page.json that generates this layout';

            toggleBtn.addEventListener('click', function () {
                if (isEdit) { isEdit = false; }   // leave edit before toggling source
                isSource = !isSource;
                _applyViewState();
            });

            editBtn.addEventListener('click', function () {
                isEdit = !isEdit;
                if (isEdit) {
                    isSource = false;
                    _doEditRender(editTextarea.value);
                }
                _applyViewState();
            });

            // Print button — opens print preview in a new window (PLR-007)
            var printBtn = document.createElement('button');
            printBtn.className = 'plr-source-toggle-btn';
            printBtn.textContent = '\uD83D\uDDA8 Print';
            printBtn.title = 'Open print preview in new window';
            printBtn.addEventListener('click', function () { _plrPrintPage(json.title, renderedView); });

            toggleBar.appendChild(locateBtn);
            toggleBar.appendChild(printBtn);
            toggleBar.appendChild(presentBtn);
            toggleBar.appendChild(copyBtn);
            toggleBar.appendChild(editBtn);
            toggleBar.appendChild(toggleBtn);

            el.appendChild(toggleBar);
            el.appendChild(renderedView);
            el.appendChild(sourceView);
            el.appendChild(editSplit);
            _applyViewState();

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
