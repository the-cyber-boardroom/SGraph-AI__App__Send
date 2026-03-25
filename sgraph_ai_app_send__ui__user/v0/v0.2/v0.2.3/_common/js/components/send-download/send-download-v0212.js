/* =============================================================================
   SGraph Send — Download Component
   v0.2.12 — Surgical overlay on v0.2.11

   Changes:
     - White/light background for file previews (code, JSON, text, etc.)
     - Auto-select first root-level file (not _gallery/_preview metadata)
     - Visual separation between folder tree and file list sections
     - Folder icons in tree view
     - +/- expand/collapse for folders with expand/collapse all controls
     - Move Save Zip/Save File buttons into the compact header row
     - Share tab: don't auto-open, colour-code differently from file tabs
     - Info (i) button wired up to open info tab in document area
     - Improved download confirmation page layout

   Loads AFTER v0.2.11 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0212] SendDownload not found — skipping');
    return;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isGalleryOrPreviewPath(path) {
    return path.indexOf('_gallery') !== -1 || path.indexOf('_preview') !== -1;
}

function isUserFile(entry) {
    if (entry.dir) return false;
    if (isGalleryOrPreviewPath(entry.path)) return false;
    var name = entry.name || '';
    if (name === '_manifest.json') return false;
    if (name.charAt(0) === '.') return false;
    if (entry.path.indexOf('__MACOSX') !== -1) return false;
    return true;
}

// Find first root-level user file
function findFirstRootFile(zipTree) {
    // First pass: files in root folder
    for (var i = 0; i < zipTree.length; i++) {
        var e = zipTree[i];
        if (!isUserFile(e)) continue;
        var parts = e.path.split('/');
        if (parts.length === 1) return e; // root-level file
    }
    // Second pass: first user file in any folder
    for (var j = 0; j < zipTree.length; j++) {
        if (isUserFile(zipTree[j])) return zipTree[j];
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Auto-select first root-level file
// ═══════════════════════════════════════════════════════════════════════════

var _v0211_render = SendDownload.prototype.render;

SendDownload.prototype.render = function() {
    if (this.state === 'complete' && this._zipTree && this._selectedZipPath) {
        var selected = this._selectedZipPath;
        var entry = this._zipTree.find(function(e) { return e.path === selected; });

        // If current selection is bad (gallery/preview/metadata) or not a root file,
        // try to pick a better default
        if (!entry || !isUserFile(entry)) {
            var firstRoot = findFirstRootFile(this._zipTree);
            if (firstRoot) {
                this._selectedZipPath = firstRoot.path;
                var parts = firstRoot.path.split('/');
                this._selectedZipFolder = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
            }
        }
    }
    _v0211_render.call(this);
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: Override _renderFolderTree — folder icons + expand/collapse
// ═══════════════════════════════════════════════════════════════════════════

var FOLDER_ICON_OPEN   = '<svg class="v0212-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
var FOLDER_ICON_CLOSED = '<svg class="v0212-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
var TOGGLE_EXPAND  = '<span class="v0212-toggle">&#9654;</span>';  // ▶
var TOGGLE_COLLAPSE = '<span class="v0212-toggle v0212-toggle--open">&#9660;</span>';  // ▼

SendDownload.prototype._renderFolderTree = function(node, selectedFolder) {
    var isRoot = node.path === '';
    var isSelected = node.path === selectedFolder;
    var hasChildren = node.children && node.children.length > 0;

    // Root is always expanded; others default to expanded if selected or if tree is small
    var isExpanded = isRoot || isSelected || this._v0212_isFolderExpanded(node.path);

    var cls = 'zip-folder-item v0212-folder-item' + (isSelected ? ' zip-folder-item--selected' : '');
    var toggleHtml = '';
    if (hasChildren) {
        toggleHtml = isExpanded ? TOGGLE_COLLAPSE : TOGGLE_EXPAND;
    } else {
        toggleHtml = '<span class="v0212-toggle v0212-toggle--spacer"></span>';
    }

    var icon = isRoot ? FOLDER_ICON_OPEN : (isExpanded ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED);
    var label = isRoot ? '/' : this.escapeHtml(node.name);

    var html = '<div class="' + cls + '" data-folder="' + this.escapeHtml(node.path) + '">' +
               toggleHtml + icon + '<span class="v0212-folder-label">' + label + '</span></div>';

    if (hasChildren) {
        var displayStyle = isExpanded ? '' : ' style="display: none;"';
        var sorted = node.children.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
        html += '<div class="zip-folder-nested v0212-folder-nested" data-parent-folder="' + this.escapeHtml(node.path) + '"' + displayStyle + '>';
        for (var i = 0; i < sorted.length; i++) {
            html += this._renderFolderTree(sorted[i], selectedFolder);
        }
        html += '</div>';
    }
    return html;
};

// Track expanded folders (default all expanded on first render)
SendDownload.prototype._v0212_isFolderExpanded = function(path) {
    if (!this._v0212_collapsedFolders) this._v0212_collapsedFolders = {};
    return !this._v0212_collapsedFolders[path];
};

SendDownload.prototype._v0212_toggleFolder = function(path) {
    if (!this._v0212_collapsedFolders) this._v0212_collapsedFolders = {};
    this._v0212_collapsedFolders[path] = !this._v0212_collapsedFolders[path];

    // Toggle the nested container visibility
    var nested = this.querySelector('.v0212-folder-nested[data-parent-folder="' + path + '"]');
    if (nested) {
        nested.style.display = this._v0212_collapsedFolders[path] ? 'none' : '';
    }

    // Toggle the arrow icon
    var folderItem = this.querySelector('.v0212-folder-item[data-folder="' + path + '"]');
    if (folderItem) {
        var toggle = folderItem.querySelector('.v0212-toggle');
        if (toggle) {
            if (this._v0212_collapsedFolders[path]) {
                toggle.innerHTML = '&#9654;';  // ▶
                toggle.classList.remove('v0212-toggle--open');
            } else {
                toggle.innerHTML = '&#9660;';  // ▼
                toggle.classList.add('v0212-toggle--open');
            }
        }
    }
};

SendDownload.prototype._v0212_expandAll = function() {
    this._v0212_collapsedFolders = {};
    this.querySelectorAll('.v0212-folder-nested').forEach(function(el) { el.style.display = ''; });
    this.querySelectorAll('.v0212-toggle').forEach(function(el) {
        if (!el.classList.contains('v0212-toggle--spacer')) {
            el.innerHTML = '&#9660;';
            el.classList.add('v0212-toggle--open');
        }
    });
};

SendDownload.prototype._v0212_collapseAll = function() {
    if (!this._v0212_collapsedFolders) this._v0212_collapsedFolders = {};
    var self = this;
    this.querySelectorAll('.v0212-folder-nested').forEach(function(el) {
        var parent = el.getAttribute('data-parent-folder');
        if (parent !== '') {  // Don't collapse root
            el.style.display = 'none';
            self._v0212_collapsedFolders[parent] = true;
        }
    });
    this.querySelectorAll('.v0212-toggle').forEach(function(el) {
        if (!el.classList.contains('v0212-toggle--spacer')) {
            var item = el.closest('.v0212-folder-item');
            if (item && item.getAttribute('data-folder') !== '') {
                el.innerHTML = '&#9654;';
                el.classList.remove('v0212-toggle--open');
            }
        }
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Override _renderZipLayout — restructured header, expand/collapse
// ═══════════════════════════════════════════════════════════════════════════

var _v0211_renderZipLayout = SendDownload.prototype._renderZipLayout;

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    var html = _v0211_renderZipLayout.call(this, timingHtml, sendAnotherHtml);

    // 1. Add expand/collapse buttons above the folder tree
    var treeTarget = 'id="zip-folder-tree">';
    var idx = html.indexOf(treeTarget);
    if (idx !== -1) {
        var insertPos = idx + treeTarget.length;
        var expandCollapseHtml =
            '<div class="v0212-tree-controls">' +
                '<button class="v0212-tree-ctrl" id="v0212-expand-all" title="Expand all folders">' +
                    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</button>' +
                '<button class="v0212-tree-ctrl" id="v0212-collapse-all" title="Collapse all folders">' +
                    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>' +
                '</button>' +
            '</div>';
        html = html.substring(0, insertPos) + expandCollapseHtml + html.substring(insertPos);
    }

    // 2. Move Save Zip + Save File buttons from command strip into the header
    //    Add them before the info (i) button in the header right section
    var headerRight = 'class="v022-compact-header__right">';
    var hrIdx = html.indexOf(headerRight);
    if (hrIdx !== -1) {
        var hrInsert = hrIdx + headerRight.length;
        var saveButtonsHtml =
            '<button class="btn btn-sm btn-primary" id="v0212-header-save-zip" title="Download the full zip file">' +
                '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg> ' +
                'Save Zip' +
            '</button>' +
            '<button class="btn btn-sm btn-secondary" id="v0212-header-save-file" disabled title="Select a file to save">' +
                'Save File' +
            '</button>';
        html = html.substring(0, hrInsert) + saveButtonsHtml + html.substring(hrInsert);
    }

    // 3. Hide the old command strip save buttons (but keep Share button)
    html = html.replace('id="v022-cmd-save-zip"', 'id="v022-cmd-save-zip" style="display:none;"');
    html = html.replace('id="v022-cmd-save-file"', 'id="v022-cmd-save-file" style="display:none;"');

    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Wire up event listeners — expand/collapse, toggle, info, share
// ═══════════════════════════════════════════════════════════════════════════

var _v0211_setupListeners_main = SendDownload.prototype.setupEventListeners;

SendDownload.prototype.setupEventListeners = function() {
    _v0211_setupListeners_main.call(this);

    var self = this;

    // ── Expand/collapse all buttons ──
    var expandBtn = this.querySelector('#v0212-expand-all');
    if (expandBtn) expandBtn.addEventListener('click', function() { self._v0212_expandAll(); });

    var collapseBtn = this.querySelector('#v0212-collapse-all');
    if (collapseBtn) collapseBtn.addEventListener('click', function() { self._v0212_collapseAll(); });

    // ── Toggle arrows on folder items ──
    this.querySelectorAll('.v0212-folder-item').forEach(function(el) {
        var toggle = el.querySelector('.v0212-toggle:not(.v0212-toggle--spacer)');
        if (toggle) {
            toggle.addEventListener('click', function(e) {
                e.stopPropagation();
                var folder = el.getAttribute('data-folder');
                if (folder !== undefined) self._v0212_toggleFolder(folder);
            });
        }
    });

    // ── Info (i) button — open info tab in document area ──
    var infoBtn = this.querySelector('#zip-info-btn');
    if (infoBtn && !infoBtn._v0212) {
        infoBtn._v0212 = true;
        infoBtn.addEventListener('click', function() {
            if (self._v022_createTab) {
                self._v022_createTab('Info', '__info__', 'info');
            }
        });
    }

    // ── Header Save Zip button ──
    var headerSaveZip = this.querySelector('#v0212-header-save-zip');
    if (headerSaveZip && !headerSaveZip._v0212) {
        headerSaveZip._v0212 = true;
        headerSaveZip.addEventListener('click', function() {
            if (self._zipOrigBytes) {
                var blob = new Blob([self._zipOrigBytes], { type: 'application/zip' });
                var url  = URL.createObjectURL(blob);
                var a    = document.createElement('a');
                a.href     = url;
                a.download = self._zipOrigName || 'archive.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    }

    // ── Header Save File button ──
    var headerSaveFile = this.querySelector('#v0212-header-save-file');
    if (headerSaveFile && !headerSaveFile._v0212) {
        headerSaveFile._v0212 = true;
        headerSaveFile.addEventListener('click', function() {
            if (self._currentEntryBytes) self._saveCurrentEntry();
        });
    }

    // ── White background for preview panel ──
    var previewPanel = this.querySelector('#preview-panel');
    if (previewPanel && this.state === 'complete') {
        // Check active tab — if it's a file, determine if it needs white bg
        var tab = this._tabs ? this._tabs.find(function(t) { return t.id === self._activeTabId; }) : null;
        if (tab && tab.type === 'file') {
            this._v0212_applyPreviewBackground(previewPanel);
        }
    }
};

SendDownload.prototype._v0212_applyPreviewBackground = function(panel) {
    if (!panel) return;
    var filename = this._currentEntryFilename || '';
    var ext = filename.split('.').pop().toLowerCase();
    // Types that look better with white background
    var whiteExts = ['json', 'txt', 'csv', 'log', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg',
                     'js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'sh',
                     'bash', 'html', 'htm', 'svg', 'sql'];
    if (whiteExts.indexOf(ext) !== -1) {
        panel.style.background = '#ffffff';
        // Also fix text colour inside <pre> elements
        var pres = panel.querySelectorAll('pre');
        pres.forEach(function(p) { p.style.color = '#1a1a1a'; });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: Don't auto-open Share tab on load — open first file only
// ═══════════════════════════════════════════════════════════════════════════

// The original v0.2.2 setupEventListeners (line 488) always creates a Share tab
// on first load. We override the tab auto-creation by patching after the chain.

var _v0212_origSetup = SendDownload.prototype.setupEventListeners;

SendDownload.prototype.setupEventListeners = function() {
    _v0212_origSetup.call(this);

    // After setup, if Share tab was auto-created and is the only/active tab,
    // remove it and activate the file tab instead
    if (this._tabs && this._tabs.length > 0 && this._v0212_firstLoadDone !== true) {
        this._v0212_firstLoadDone = true;

        // Find and remove auto-created Share tab if a file tab exists
        var shareTab = this._tabs.find(function(t) { return t.type === 'share'; });
        var fileTab = this._tabs.find(function(t) { return t.type === 'file'; });

        if (shareTab && fileTab && this._activeTabId === shareTab.id) {
            // Close the share tab and activate the file tab
            var shareIdx = this._tabs.indexOf(shareTab);
            if (shareIdx !== -1) this._tabs.splice(shareIdx, 1);
            this._activeTabId = fileTab.id;
            this._v022_renderTabs();
            this._v022_showActiveTabContent();
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 6: White background for file preview after tab switch
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_showTabContent = SendDownload.prototype._v022_showActiveTabContent;

SendDownload.prototype._v022_showActiveTabContent = function() {
    _v0212_showTabContent.call(this);

    var tab = this._tabs ? this._tabs.find(function(t) { return t.id === this._activeTabId; }.bind(this)) : null;

    if (tab && tab.type === 'file') {
        var preview = this.querySelector('#preview-panel');
        if (preview) {
            // Reset background first
            preview.style.background = '';
            // Delay slightly to let content render
            var self = this;
            setTimeout(function() {
                self._v0212_applyPreviewBackground(preview);
            }, 50);
        }
    } else {
        // Non-file tabs: reset to default background
        var preview = this.querySelector('#preview-panel');
        if (preview) preview.style.background = '';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 7: Colour-code Share tab differently
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_renderTabs = SendDownload.prototype._v022_renderTabs;

SendDownload.prototype._v022_renderTabs = function() {
    _v0212_renderTabs.call(this);

    // Post-process: add a type class to share/info tabs
    var tabBar = this.querySelector('#v022-tab-bar');
    if (!tabBar) return;

    var tabs = this._tabs || [];
    tabBar.querySelectorAll('.v022-tab').forEach(function(el) {
        var tabId = el.dataset.tabId;
        var tab = tabs.find(function(t) { return t.id === tabId; });
        if (tab && tab.type === 'share') el.classList.add('v0212-tab--share');
        if (tab && tab.type === 'info')  el.classList.add('v0212-tab--info');
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0212-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0212-download-styles';
    s.textContent = '\
        /* ── Visual separation: folder tree vs file list ── */\
        .zip-left-rail__folders {\
            background: rgba(0, 0, 0, 0.12);\
            border-radius: var(--radius-sm, 4px);\
            margin-bottom: var(--space-1, 0.25rem);\
            padding: var(--space-2, 0.5rem);\
        }\
        .zip-left-rail__files {\
            background: rgba(78, 205, 196, 0.03);\
            border-radius: var(--radius-sm, 4px);\
            padding: var(--space-2, 0.5rem);\
        }\
        .zip-left-rail__divider {\
            height: 0;\
            margin: 0;\
            background: none;\
        }\
        \
        /* ── Folder items: icon + toggle + label layout ── */\
        .v0212-folder-item {\
            display: flex;\
            align-items: center;\
            gap: 4px;\
            padding: 2px 4px;\
        }\
        .v0212-folder-icon {\
            flex-shrink: 0;\
            color: var(--accent, #4ECDC4);\
            opacity: 0.8;\
        }\
        .v0212-folder-label {\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
        }\
        .v0212-toggle {\
            display: inline-flex;\
            align-items: center;\
            justify-content: center;\
            width: 14px;\
            height: 14px;\
            font-size: 8px;\
            cursor: pointer;\
            color: var(--color-text-secondary, #8892A0);\
            flex-shrink: 0;\
            border-radius: 2px;\
            transition: background 0.15s;\
            user-select: none;\
        }\
        .v0212-toggle:hover {\
            background: rgba(78, 205, 196, 0.15);\
            color: var(--accent, #4ECDC4);\
        }\
        .v0212-toggle--spacer {\
            visibility: hidden;\
            cursor: default;\
        }\
        \
        /* ── Tree controls (expand/collapse all) ── */\
        .v0212-tree-controls {\
            display: flex;\
            justify-content: flex-end;\
            gap: 2px;\
            padding: 0 2px 4px;\
            border-bottom: 1px solid rgba(78, 205, 196, 0.08);\
            margin-bottom: 4px;\
        }\
        .v0212-tree-ctrl {\
            background: none;\
            border: 1px solid rgba(78, 205, 196, 0.15);\
            color: var(--color-text-secondary, #8892A0);\
            cursor: pointer;\
            padding: 2px 5px;\
            border-radius: 3px;\
            display: inline-flex;\
            align-items: center;\
            justify-content: center;\
            transition: background 0.15s, color 0.15s;\
        }\
        .v0212-tree-ctrl:hover {\
            background: rgba(78, 205, 196, 0.1);\
            color: var(--accent, #4ECDC4);\
            border-color: var(--accent, #4ECDC4);\
        }\
        \
        /* ── Share/info tab colour coding ── */\
        .v0212-tab--share {\
            border-left: 2px solid #FF9800;\
        }\
        .v0212-tab--share .v022-tab__label {\
            color: #FF9800;\
        }\
        .v0212-tab--share.v022-tab--active {\
            border-bottom-color: #FF9800 !important;\
        }\
        .v0212-tab--info {\
            border-left: 2px solid #7C4DFF;\
        }\
        .v0212-tab--info .v022-tab__label {\
            color: #7C4DFF;\
        }\
        .v0212-tab--info.v022-tab--active {\
            border-bottom-color: #7C4DFF !important;\
        }\
        \
        /* ── White background for code/text preview ── */\
        #preview-panel pre {\
            background: transparent;\
        }\
        \
        /* ── Header save buttons ── */\
        .v022-compact-header__right .btn {\
            font-size: 0.72rem;\
            padding: 3px 8px;\
        }\
        #v0212-header-save-zip {\
            display: inline-flex;\
            align-items: center;\
            gap: 3px;\
        }\
    ';
    document.head.appendChild(s);
})();

// ═══════════════════════════════════════════════════════════════════════════
// FIX 8: Sync header Save File button state with command strip
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_updateCmdStrip = SendDownload.prototype._v022_updateCommandStrip;

SendDownload.prototype._v022_updateCommandStrip = function() {
    _v0212_updateCmdStrip.call(this);

    var headerSaveFile = this.querySelector('#v0212-header-save-file');
    if (!headerSaveFile) return;

    var tab = this._tabs ? this._tabs.find(function(t) { return t.id === this._activeTabId; }.bind(this)) : null;
    if (tab && tab.type === 'file' && this._currentEntryFilename) {
        headerSaveFile.disabled = false;
        headerSaveFile.textContent = 'Save File';
        headerSaveFile.title = 'Save ' + this._currentEntryFilename;
    } else {
        headerSaveFile.disabled = true;
        headerSaveFile.textContent = 'Save File';
        headerSaveFile.title = 'Select a file to save';
    }
};

console.log('[send-download-v0212] Folder tree UX, white preview, share tab fix, info button, expand/collapse, header save');

})();
