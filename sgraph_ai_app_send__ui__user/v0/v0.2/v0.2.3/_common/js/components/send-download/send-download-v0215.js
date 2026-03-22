/* =============================================================================
   SGraph Send — Download Component
   v0.2.15 — Surgical overlay on v0.2.14

   Changes:
     - Fix: tab creation now shows content immediately (was only adding tab
       visually without updating the preview panel)
     - Fix: clicking anywhere on tab (not just the label) activates it
     - Fix: active tab now visually distinct from inactive (stronger styling)
     - Fix: tab bar left edge aligns with preview panel border-radius
     - Fix: Share/Info tab type classes preserved after re-render

   Loads AFTER v0.2.14 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0215] SendDownload not found — skipping');
    return;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: _v022_createTab — show content immediately after creating tab
// ═══════════════════════════════════════════════════════════════════════════

var _v0214_createTab = SendDownload.prototype._v022_createTab;

SendDownload.prototype._v022_createTab = function(label, path, type) {
    var tab = _v0214_createTab.call(this, label, path, type);

    // The base version creates the tab and renders the tab bar but does NOT
    // show the content. If this tab is now the active tab, show its content.
    if (tab && this._activeTabId === tab.id) {
        this._v022_showActiveTabContent();
    }

    return tab;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: _v022_renderTabs — click on whole tab div, not just label
// ═══════════════════════════════════════════════════════════════════════════

var _v0214_renderTabs = SendDownload.prototype._v022_renderTabs;

SendDownload.prototype._v022_renderTabs = function() {
    _v0214_renderTabs.call(this);

    var self = this;
    var tabBar = this.querySelector('#v022-tab-bar');
    if (!tabBar) return;

    // Re-wire: make the whole tab div clickable (not just the label)
    tabBar.querySelectorAll('.v022-tab').forEach(function(el) {
        var tabId = el.dataset.tabId;

        // Remove the label-only handler by replacing with a tab-wide one
        el.addEventListener('click', function(e) {
            // Don't interfere with close button
            if (e.target.closest('.v022-tab__close')) return;
            self._v022_activateTab(tabId);
        });
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES — tab visual fixes
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0215-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0215-download-styles';
    s.textContent = '\
        /* ── Tab bar: align with preview panel rounded corners ── */\
        .v022-tab-bar {\
            border-radius: var(--radius-sm, 4px) var(--radius-sm, 4px) 0 0;\
            padding-left: 2px;\
        }\
        \
        /* ── Active tab: stronger visual distinction ── */\
        .v022-tab--active {\
            background: rgba(78, 205, 196, 0.12) !important;\
            color: var(--accent, #4ECDC4) !important;\
            border-bottom: 2px solid var(--accent, #4ECDC4);\
            border-left: 2px solid var(--accent, #4ECDC4);\
        }\
        \
        /* ── Inactive tab: ensure subdued styling ── */\
        .v022-tab:not(.v022-tab--active) {\
            color: var(--color-text-secondary, #8892A0) !important;\
            border-left: 2px solid transparent;\
            border-bottom: 2px solid transparent;\
        }\
        .v022-tab:not(.v022-tab--active):hover {\
            color: var(--color-text, #E0E0E0) !important;\
            background: rgba(78, 205, 196, 0.04);\
        }\
        \
        /* ── Share tab: orange left border overrides default ── */\
        .v0212-tab--share {\
            border-left-color: #FF9800 !important;\
        }\
        .v0212-tab--share.v022-tab--active {\
            background: rgba(255, 152, 0, 0.1) !important;\
            border-bottom-color: #FF9800 !important;\
            border-left-color: #FF9800 !important;\
        }\
        .v0212-tab--share:not(.v022-tab--active) .v022-tab__label {\
            color: rgba(255, 152, 0, 0.6) !important;\
        }\
        .v0212-tab--share.v022-tab--active .v022-tab__label {\
            color: #FF9800 !important;\
        }\
        \
        /* ── Info tab: purple left border overrides default ── */\
        .v0212-tab--info {\
            border-left-color: #7C4DFF !important;\
        }\
        .v0212-tab--info.v022-tab--active {\
            background: rgba(124, 77, 255, 0.1) !important;\
            border-bottom-color: #7C4DFF !important;\
            border-left-color: #7C4DFF !important;\
        }\
        .v0212-tab--info:not(.v022-tab--active) .v022-tab__label {\
            color: rgba(124, 77, 255, 0.6) !important;\
        }\
        .v0212-tab--info.v022-tab--active .v022-tab__label {\
            color: #7C4DFF !important;\
        }\
        \
        /* ── Whole tab clickable cursor ── */\
        .v022-tab {\
            cursor: pointer;\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v0215] Tab fixes: create→show, whole-tab click, active styling, alignment');

})();
