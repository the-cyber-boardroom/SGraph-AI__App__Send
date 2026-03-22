/* =============================================================================
   SGraph Send — Download Component
   v0.2.16 — Surgical overlay on v0.2.15

   Changes:
     1. Collapse/expand left rail toggle — chevron in the tree controls row
        (not overlapping). When collapsed, only tabs + preview visible.
        An expand chevron appears at the left edge of the right column.
     2. Fix maximise button — was showing blank page. Now hides left rail
        and shows content correctly, with restore support.
     3. Markdown print button — when viewing .md in a tab, Print button
        appears in the command strip. Uses SgPrint for A4 output.
     4. Fix _originalDownloadUrl — v023's connectedCallback never fires
        (v020 fires first). Ensure it's set so Share panel renders content.
     5. Fix active tab styling — force distinct background on active tab.

   Loads AFTER v0.2.15 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0216] SendDownload not found — skipping');
    return;
}

// ─── SVG icons ──────────────────────────────────────────────────────────────
var ICON_COLLAPSE = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 4 8 12 15 20"/></svg>';
var ICON_EXPAND   = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 4 16 12 9 20"/></svg>';
var ICON_PRINT    = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6V1h8v5"/><rect x="1" y="6" width="14" height="6" rx="1"/><path d="M4 10h8v5H4z"/></svg>';

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Collapse/expand left rail toggle
// ═══════════════════════════════════════════════════════════════════════════

var _v0215_setupEvents = SendDownload.prototype.setupEventListeners;

SendDownload.prototype.setupEventListeners = function() {
    _v0215_setupEvents.call(this);

    var self = this;
    var split = this.querySelector('#preview-split');
    if (!split) return;

    // ── FIX 4: Ensure _originalDownloadUrl is always set ──
    if (!this._originalDownloadUrl) {
        this._originalDownloadUrl = window.location.href;
    }

    // ── Add collapse button into the tree controls row (not overlapping) ──
    var treeControls = this.querySelector('.v0212-tree-controls');
    if (treeControls && !treeControls.querySelector('#v0216-collapse-btn')) {
        var collapseBtn = document.createElement('button');
        collapseBtn.id = 'v0216-collapse-btn';
        collapseBtn.className = 'v0212-tree-ctrl v0216-collapse-btn';
        collapseBtn.title = 'Collapse sidebar';
        collapseBtn.innerHTML = ICON_COLLAPSE;
        // Insert at the beginning of tree controls (before expand/collapse all)
        treeControls.insertBefore(collapseBtn, treeControls.firstChild);

        collapseBtn.addEventListener('click', function() {
            self._v0216_toggleCollapse();
        });
    }

    // ── Add expand button on the right column (shown when collapsed) ──
    var rightCol = this.querySelector('.v022-right-column');
    if (rightCol && !rightCol.querySelector('#v0216-expand-btn')) {
        var expandBtn = document.createElement('button');
        expandBtn.id = 'v0216-expand-btn';
        expandBtn.className = 'v0216-expand-btn';
        expandBtn.title = 'Show sidebar';
        expandBtn.innerHTML = ICON_EXPAND;
        expandBtn.style.display = 'none';
        rightCol.insertBefore(expandBtn, rightCol.firstChild);

        expandBtn.addEventListener('click', function() {
            self._v0216_toggleCollapse();
        });
    }

    // ── Markdown print button for current tab ──
    this._v0216_updatePrintButton();
};

SendDownload.prototype._v0216_toggleCollapse = function() {
    var split    = this.querySelector('#preview-split');
    var leftRail = this.querySelector('#details-panel');
    var divider  = this.querySelector('#split-resize');
    var expandBtn = this.querySelector('#v0216-expand-btn');

    if (!split || !leftRail) return;

    this._v0216_collapsed = !this._v0216_collapsed;

    if (this._v0216_collapsed) {
        this._v0216_savedColumns = split.style.gridTemplateColumns;
        split.style.gridTemplateColumns = '0px 0px 1fr';
        leftRail.style.display = 'none';
        if (divider) divider.style.display = 'none';
        if (expandBtn) expandBtn.style.display = '';
    } else {
        split.style.gridTemplateColumns = this._v0216_savedColumns || '';
        leftRail.style.display = '';
        if (divider) divider.style.display = '';
        if (expandBtn) expandBtn.style.display = 'none';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: Fix maximise button — preserve content, restore properly
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._toggleMaximise = function() {
    var split    = this.querySelector('#preview-split');
    var leftRail = this.querySelector('#details-panel');
    var divider  = this.querySelector('#split-resize');
    var expandBtn = this.querySelector('#v0216-expand-btn');

    if (!split) return;

    this._isMaximised = !this._isMaximised;

    if (this._isMaximised) {
        // Save current state before maximising
        this._savedGridColumns = split.style.gridTemplateColumns;
        this._v0216_wasCollapsed = this._v0216_collapsed;
        split.style.gridTemplateColumns = '0px 0px 1fr';
        if (leftRail) leftRail.style.display = 'none';
        if (divider)  divider.style.display  = 'none';
        if (expandBtn) expandBtn.style.display = 'none';
        this._v0216_collapsed = true;
    } else {
        // Restore to pre-maximise state
        if (this._v0216_wasCollapsed) {
            // Was already collapsed before maximise — keep collapsed
            split.style.gridTemplateColumns = '0px 0px 1fr';
            if (leftRail) leftRail.style.display = 'none';
            if (divider) divider.style.display = 'none';
            if (expandBtn) expandBtn.style.display = '';
            this._v0216_collapsed = true;
        } else {
            // Restore the full layout
            split.style.gridTemplateColumns = this._savedGridColumns || '';
            if (leftRail) leftRail.style.display = '';
            if (divider)  divider.style.display  = '';
            if (expandBtn) expandBtn.style.display = 'none';
            this._v0216_collapsed = false;
        }
    }

    var btn = this.querySelector('#maximise-btn');
    if (btn) btn.textContent = this._isMaximised ? '\u2716' : '\u26F6';
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Markdown print button in folder view tabs
// ═══════════════════════════════════════════════════════════════════════════

var _v0215_showTabContent = SendDownload.prototype._v022_showActiveTabContent;

SendDownload.prototype._v022_showActiveTabContent = function() {
    _v0215_showTabContent.call(this);
    this._v0216_updatePrintButton();
};

SendDownload.prototype._v0216_updatePrintButton = function() {
    var self = this;
    var commandStrip = this.querySelector('.v022-command-strip');
    if (!commandStrip) return;

    // Remove existing print button
    var existing = commandStrip.querySelector('#v0216-tab-print');
    if (existing) existing.remove();

    // Check if active tab is a markdown file
    var tab = this._tabs ? this._tabs.find(function(t) { return t.id === self._activeTabId; }) : null;
    if (!tab || tab.type !== 'file') return;

    var ext = (tab.path || '').split('.').pop().toLowerCase();
    if (ext !== 'md' && ext !== 'markdown') return;

    // Add print button before the share button
    var printBtn = document.createElement('button');
    printBtn.id = 'v0216-tab-print';
    printBtn.className = 'btn btn-sm btn-secondary';
    printBtn.title = 'Print this document';
    printBtn.innerHTML = ICON_PRINT + ' Print';
    printBtn.style.cssText = 'display: inline-flex; align-items: center; gap: 4px;';

    var shareBtn = commandStrip.querySelector('#v022-cmd-share');
    if (shareBtn) {
        commandStrip.insertBefore(printBtn, shareBtn);
    } else {
        commandStrip.appendChild(printBtn);
    }

    printBtn.addEventListener('click', function() {
        self._v0216_printCurrentMarkdown();
    });
};

SendDownload.prototype._v0216_printCurrentMarkdown = function() {
    if (typeof SgPrint === 'undefined') {
        window.print();
        return;
    }

    var tab = this._tabs ? this._tabs.find(function(t) { return t.id === this._activeTabId; }.bind(this)) : null;
    if (!tab || tab.type !== 'file') return;

    var self = this;

    // Get the file from zipTree
    var entry = this._zipTree ? this._zipTree.find(function(e) { return e.path === tab.path && !e.dir; }) : null;
    if (!entry) return;

    entry.entry.async('arraybuffer').then(function(buf) {
        var rawText = new TextDecoder().decode(buf);
        var safeHtml;
        if (typeof MarkdownParser !== 'undefined' && MarkdownParser.parse) {
            safeHtml = MarkdownParser.parse(rawText);
        } else {
            safeHtml = '<pre>' + self.escapeHtml(rawText) + '</pre>';
        }
        SgPrint.printHtml(safeHtml, tab.label || 'Document');
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: Force active tab visual distinction after render
// ═══════════════════════════════════════════════════════════════════════════

var _v0215_renderTabs = SendDownload.prototype._v022_renderTabs;

SendDownload.prototype._v022_renderTabs = function() {
    _v0215_renderTabs.call(this);

    // Force-apply active tab styling via inline styles as fallback
    var tabBar = this.querySelector('#v022-tab-bar');
    if (!tabBar) return;

    tabBar.querySelectorAll('.v022-tab').forEach(function(el) {
        if (el.classList.contains('v022-tab--active')) {
            // Active: stronger background, teal text
            if (!el.classList.contains('v0212-tab--share') && !el.classList.contains('v0212-tab--info')) {
                el.style.background = 'rgba(78, 205, 196, 0.15)';
                el.style.color = '#4ECDC4';
                el.style.borderBottom = '2px solid #4ECDC4';
            }
        } else {
            // Inactive: subdued
            el.style.background = '';
            el.style.color = '';
            el.style.borderBottom = '';
        }
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0216-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0216-download-styles';
    s.textContent = '\
        /* ── Collapse button: sits in tree-controls row, not overlapping ── */\
        .v0216-collapse-btn {\
            margin-right: auto;\
        }\
        \
        /* ── Expand sidebar button (shown when collapsed) ── */\
        .v0216-expand-btn {\
            background: rgba(78, 205, 196, 0.08);\
            border: 1px solid rgba(78, 205, 196, 0.2);\
            color: var(--accent, #4ECDC4);\
            cursor: pointer;\
            padding: 4px 6px;\
            border-radius: 3px;\
            display: flex;\
            align-items: center;\
            justify-content: center;\
            align-self: flex-start;\
            margin: 4px 0 0 4px;\
            flex-shrink: 0;\
            transition: background 0.15s;\
        }\
        .v0216-expand-btn:hover {\
            background: rgba(78, 205, 196, 0.18);\
        }\
        \
        /* ── Fix maximise: ensure right column fills space ── */\
        .v022-right-column {\
            min-width: 0;\
        }\
        \
        /* ── Print button alignment ── */\
        #v0216-tab-print {\
            font-size: 0.72rem;\
            padding: 3px 8px;\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v0216] Collapsible sidebar, maximise fix, markdown print, share fix, active tab styling');

})();
