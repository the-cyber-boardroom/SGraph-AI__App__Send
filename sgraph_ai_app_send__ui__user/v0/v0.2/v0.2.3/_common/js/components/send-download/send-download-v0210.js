/* =============================================================================
   SGraph Send — Download Component
   v0.2.10 — Surgical overlay on v0.2.9

   Changes:
     - Fix red text flash: suppress stale error renders during gallery transition
     - Gallery: add extension badge (PNG, JPG, etc.) to image thumbnails
     - Folder view: hide _preview* files and _manifest.json from file list
     - Folder view: select root folder and first non-preview file by default
     - Folder view: bigger save buttons, remove disabled beta buttons (Edit/Rename/Delete)
     - Folder view: fix Share button (opens Share tab with content)
     - Folder view: fix tab underline not clearing when switching tabs

   Loads AFTER v0.2.9 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0210] SendDownload not found — skipping');
    return;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Suppress red error flash during gallery page transitions
//
// When a friendly token is in the URL, v0.2.0's unpatched loadTransferInfo
// fires before overlays load, gets a 404, sets state='error' and calls render().
// The v024-head-suppress hides it initially, but once removed, stale error
// messages can flash during async transitions (during startDownload awaits).
// Fix: override renderError to return '' while a friendly token is resolving
// or while startDownload is in progress (state === 'decrypting').
// ═══════════════════════════════════════════════════════════════════════════

var _v022_renderError = SendDownload.prototype.renderError;

SendDownload.prototype.renderError = function() {
    // Suppress errors during friendly token resolution or decryption
    if (this._friendlyToken && !this._friendlyResolved) return '';
    if (this.state === 'decrypting') return '';
    if (this.state === 'complete') return '';
    if (this.state === 'loading') return '';
    if (this.state === 'ready') {
        // If we had a previous error but state is now ready, clear it
        this.errorMessage = null;
        return '';
    }
    return _v022_renderError.call(this);
};

// Also clear stale errorMessage when entering startDownload
var _v0210_startDownload = SendDownload.prototype.startDownload;
SendDownload.prototype.startDownload = async function(keyOverride) {
    this.errorMessage = null;
    return _v0210_startDownload.call(this, keyOverride);
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: Gallery — add extension badge to image thumbnails
// ═══════════════════════════════════════════════════════════════════════════

var _v029_setupEvents = SendDownload.prototype.setupEventListeners;

SendDownload.prototype.setupEventListeners = function() {
    _v029_setupEvents.call(this);
    var self = this;

    // Add extension badges to image thumbnails in gallery
    var files = this._v027_galleryFiles;
    if (files && files.length > 0) {
        files.forEach(function(entry, idx) {
            var thumbEl = self.querySelector('#v025-thumb-' + idx);
            if (!thumbEl) return;

            var ext = (entry.name || '').split('.').pop().toUpperCase();
            if (!ext) return;

            // Check if this thumbnail already has a badge
            if (thumbEl.querySelector('.v026-thumb__type-badge')) return;

            // Add badge to all thumbnails (images included)
            var badge = document.createElement('span');
            badge.className = 'v026-thumb__type-badge';
            badge.textContent = ext;
            thumbEl.appendChild(badge);
        });
    }

    // ── Fix tab underline: properly update active state ──
    if (this._tabs && this._tabs.length > 0) {
        this._v0210_fixTabUnderlines();
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Hide _preview* files and _manifest.json from folder file list
// ═══════════════════════════════════════════════════════════════════════════

var _origRenderFileList = SendDownload.prototype._renderFileList;

SendDownload.prototype._renderFileList = function(folderPath) {
    // Temporarily filter _preview* and _manifest.json entries from zipTree
    var originalTree = this._zipTree;
    if (originalTree) {
        this._zipTree = originalTree.filter(function(e) {
            if (e.dir) return true; // keep dirs for the folder check
            // Hide files inside _preview* folders
            if (e.path.indexOf('_preview') === 0 || e.path.indexOf('/_preview') !== -1) return false;
            // Hide _manifest.json at any level
            var name = e.name || '';
            if (name === '_manifest.json') return false;
            // Hide dot-files
            if (name.charAt(0) === '.') return false;
            // Hide __MACOSX
            if (e.path.indexOf('__MACOSX') !== -1) return false;
            return true;
        });
    }

    var html = _origRenderFileList.call(this, folderPath);

    // Restore original tree
    this._zipTree = originalTree;
    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Select root folder and first non-preview file by default
// ═══════════════════════════════════════════════════════════════════════════

var _v0210_origRender = SendDownload.prototype.render;

SendDownload.prototype.render = function() {
    // Before rendering, fix the auto-selected file if it's in _preview
    if (this.state === 'complete' && this._zipTree && this._selectedZipPath) {
        var selected = this._selectedZipPath;
        var isPreview = selected.indexOf('_preview') !== -1 ||
                        (selected === '_manifest.json') ||
                        selected.indexOf('__MACOSX') !== -1;

        if (isPreview) {
            // Find the first real file (not in _preview, not _manifest, not dotfile)
            var firstReal = null;
            for (var i = 0; i < this._zipTree.length; i++) {
                var e = this._zipTree[i];
                if (e.dir) continue;
                if (e.path.indexOf('_preview') !== -1) continue;
                var name = e.name || '';
                if (name === '_manifest.json') continue;
                if (name.charAt(0) === '.') continue;
                if (e.path.indexOf('__MACOSX') !== -1) continue;
                firstReal = e;
                break;
            }

            if (firstReal) {
                this._selectedZipPath = firstReal.path;
                var parts = firstReal.path.split('/');
                this._selectedZipFolder = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
            }
        }

        // Ensure root folder is selected if current folder is _preview
        if (this._selectedZipFolder && this._selectedZipFolder.indexOf('_preview') !== -1) {
            this._selectedZipFolder = '';
        }
    }

    _v0210_origRender.call(this);
};

// Also fix initial file selection after zip parse
var _origStartDownload = SendDownload.prototype.startDownload;

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: Bigger save buttons, remove beta buttons, fix command strip
// ═══════════════════════════════════════════════════════════════════════════

var _v022_renderZipLayout = SendDownload.prototype._renderZipLayout;

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    var html = _v022_renderZipLayout.call(this, timingHtml, sendAnotherHtml);

    // Replace the command strip with a cleaner version (bigger save, no beta buttons)
    var betaButtonsPattern = '<span class="v022-command-strip__divider"></span>' +
        '                <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">Edit</button>' +
        '                <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">Rename</button>' +
        '                <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">Delete</button>';

    html = html.replace(betaButtonsPattern, '');

    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 6: Fix Share button — create tab with share content
// ═══════════════════════════════════════════════════════════════════════════

// Override _v022_showActiveTabContent for share tab to populate properly
var _v022_showActiveTabContent = SendDownload.prototype._v022_showActiveTabContent;

SendDownload.prototype._v022_showActiveTabContent = function() {
    var tab = this._tabs ? this._tabs.find(function(t) { return t.id === this._activeTabId; }.bind(this)) : null;

    if (tab && tab.type === 'share') {
        var preview = this.querySelector('#preview-panel');
        if (preview) {
            var downloadUrl = this._originalDownloadUrl || window.location.href;
            var maxBtn = '<button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>';

            var shareHtml =
                '<div style="padding: var(--space-6, 1.5rem); overflow: auto; height: 100%;">' +
                    '<div class="share-panel">' +
                        '<div class="share-panel__header" style="font-size: 1.1rem; font-weight: 600; color: var(--color-text, #E0E0E0); margin-bottom: var(--space-4, 1rem);">Share this file</div>' +
                        '<div class="share-panel__item" style="margin-bottom: var(--space-4, 1rem);">' +
                            '<div class="share-panel__label" style="font-size: 0.8rem; color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-2, 0.5rem);">Download link</div>' +
                            '<div class="share-panel__row" style="display: flex; gap: var(--space-2, 0.5rem);">' +
                                '<input type="text" class="input" id="v0210-share-url" value="' + this.escapeHtml(downloadUrl) + '" readonly style="flex: 1; font-family: var(--font-mono, monospace); font-size: 0.8rem;">' +
                                '<button class="btn btn-sm btn-primary" id="v0210-copy-url">Copy</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="share-panel__item">' +
                            '<div class="share-panel__label" style="font-size: 0.8rem; color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-2, 0.5rem);">Email</div>' +
                            '<button class="btn btn-sm btn-secondary" id="v0210-email-link" style="display: inline-flex; align-items: center; gap: 0.4rem;">' +
                                '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="10" rx="1"/><path d="M1 3l7 5 7-5"/></svg>' +
                                'Email link' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            preview.innerHTML = maxBtn + shareHtml;

            // Wire copy button
            var self = this;
            var copyBtn = preview.querySelector('#v0210-copy-url');
            if (copyBtn) {
                copyBtn.addEventListener('click', function() {
                    var input = preview.querySelector('#v0210-share-url');
                    if (input) self.copyToClipboard(input.value, copyBtn);
                });
            }

            // Wire email button
            var emailBtn = preview.querySelector('#v0210-email-link');
            if (emailBtn) {
                emailBtn.addEventListener('click', function() {
                    var subject = 'Secure file shared via SGraph Send';
                    var body = 'I\'ve shared a file with you via SGraph Send.\n\nLink: ' + downloadUrl;
                    window.open('mailto:?subject=' + encodeURIComponent(subject) +
                                '&body=' + encodeURIComponent(body), '_blank');
                });
            }

            // Wire maximise button
            var newMaxBtn = preview.querySelector('#maximise-btn');
            if (newMaxBtn) newMaxBtn.addEventListener('click', function() { self._toggleMaximise(); });
        }
        this._v0210_fixTabUnderlines();
        this._v022_updateCommandStrip();
        return;
    }

    // For non-share tabs, call original then fix underlines
    _v022_showActiveTabContent.call(this);
    this._v0210_fixTabUnderlines();
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 7: Fix tab underline — ensure only active tab has the underline
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v0210_fixTabUnderlines = function() {
    var tabBar = this.querySelector('#v022-tab-bar');
    if (!tabBar) return;

    var activeId = this._activeTabId;
    tabBar.querySelectorAll('.v022-tab').forEach(function(el) {
        if (el.dataset.tabId === activeId) {
            el.classList.add('v022-tab--active');
        } else {
            el.classList.remove('v022-tab--active');
        }
    });
};

// Also override _v022_renderTabs to always fix underlines
var _orig_renderTabs = SendDownload.prototype._v022_renderTabs;

SendDownload.prototype._v022_renderTabs = function() {
    _orig_renderTabs.call(this);
    // Re-apply underline fix after render
    this._v0210_fixTabUnderlines();
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0210-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0210-download-styles';
    s.textContent = '\
        /* ── Suppress error flash on gallery pages during transition ── */\
        body .v025-gallery + .status--error,\
        body .v025-gallery ~ .status--error {\
            display: none !important;\
        }\
        \
        /* ── Extension badges on image thumbnails ── */\
        .v025-thumb__img .v026-thumb__type-badge {\
            position: absolute;\
            top: 6px;\
            right: 6px;\
            font-size: 0.55rem;\
            font-weight: 700;\
            padding: 1px 5px;\
            border-radius: 3px;\
            line-height: 1.4;\
            text-transform: uppercase;\
            letter-spacing: 0.03em;\
            z-index: 2;\
            pointer-events: none;\
        }\
        \
        /* ── Image badge: green tint ── */\
        .v026-thumb--image .v026-thumb__type-badge {\
            background: rgba(76, 175, 80, 0.15);\
            color: #4CAF50;\
        }\
        \
        /* ── Bigger save buttons in command strip ── */\
        .v022-command-strip .btn {\
            font-size: 0.78rem !important;\
            padding: 4px 10px !important;\
        }\
        #v022-cmd-save-zip {\
            font-size: 0.82rem !important;\
            padding: 5px 14px !important;\
        }\
        \
        /* ── Remove beta badge from disabled buttons ── */\
        .v022-cmd--disabled {\
            display: none !important;\
        }\
        \
        /* ── Fix tab underline: only active tab gets border-bottom ── */\
        .v022-tab {\
            border-bottom: 2px solid transparent;\
        }\
        .v022-tab--active {\
            border-bottom: 2px solid var(--accent, #4ECDC4) !important;\
        }\
        .v022-tab:not(.v022-tab--active) {\
            border-bottom-color: transparent !important;\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v0210] Error flash fix, image badges, _preview filter, bigger save, share fix, tab underline fix');

})();
