/* =============================================================================
   SGraph Send — Download Component
   v0.2.10 — Surgical overlay on v0.2.9

   Changes:
     - Fix red text flash: suppress stale error renders during gallery transition
     - Gallery: add extension badge (PNG, JPG, etc.) to image thumbnails
     - Folder view: select root folder and first non-gallery file by default
       (folder view shows ALL files — no filtering; _gallery folder is hidden
       by v0.2.9's tree filter, not here)
     - Folder view: bigger save buttons, remove disabled beta buttons
     - Folder view: fix Share button (opens Share tab with content)
     - Folder view: fix tab underline not clearing when switching tabs
     - Single file viewer: add print button for markdown files
       (uses SgPrint component if available)

   Loads AFTER v0.2.9 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0210] SendDownload not found — skipping');
    return;
}

// Helper: check if path is a gallery/preview metadata path
function isGalleryOrPreviewPath(path) {
    return path.indexOf('_gallery') !== -1 || path.indexOf('_preview') !== -1;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Suppress red error flash during gallery page transitions
// ═══════════════════════════════════════════════════════════════════════════

var _v022_renderError = SendDownload.prototype.renderError;

SendDownload.prototype.renderError = function() {
    if (this._friendlyToken && !this._friendlyResolved) return '';
    if (this.state === 'decrypting') return '';
    if (this.state === 'complete') return '';
    if (this.state === 'loading') return '';
    if (this.state === 'ready') {
        this.errorMessage = null;
        return '';
    }
    return _v022_renderError.call(this);
};

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
            if (thumbEl.querySelector('.v026-thumb__type-badge')) return;
            var badge = document.createElement('span');
            badge.className = 'v026-thumb__type-badge';
            badge.textContent = ext;
            thumbEl.appendChild(badge);
        });
    }

    // Fix tab underline
    if (this._tabs && this._tabs.length > 0) {
        this._v0210_fixTabUnderlines();
    }

    // Single file viewer: add print button for markdown
    if (this.state === 'complete' && this._renderType === 'markdown' && !this._zipTree) {
        this._v0210_addPrintButton();
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Select root folder and first non-gallery file by default
// (NO folder view filtering — folder view shows everything)
// ═══════════════════════════════════════════════════════════════════════════

var _v0210_origRender = SendDownload.prototype.render;

SendDownload.prototype.render = function() {
    // Before rendering, fix the auto-selected file if it's in _gallery/_preview
    if (this.state === 'complete' && this._zipTree && this._selectedZipPath) {
        var selected = this._selectedZipPath;
        var needsFix = isGalleryOrPreviewPath(selected) ||
                       selected === '_manifest.json' ||
                       selected.indexOf('__MACOSX') !== -1;

        if (needsFix) {
            var firstReal = null;
            for (var i = 0; i < this._zipTree.length; i++) {
                var e = this._zipTree[i];
                if (e.dir) continue;
                if (isGalleryOrPreviewPath(e.path)) continue;
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

        // Ensure root folder is selected if current folder is _gallery/_preview
        if (this._selectedZipFolder && isGalleryOrPreviewPath(this._selectedZipFolder)) {
            this._selectedZipFolder = '';
        }
    }

    _v0210_origRender.call(this);
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Bigger save buttons, remove beta buttons
// ═══════════════════════════════════════════════════════════════════════════

var _v022_renderZipLayout = SendDownload.prototype._renderZipLayout;

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    var html = _v022_renderZipLayout.call(this, timingHtml, sendAnotherHtml);

    var betaButtonsPattern = '<span class="v022-command-strip__divider"></span>' +
        '                <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">Edit</button>' +
        '                <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">Rename</button>' +
        '                <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">Delete</button>';

    html = html.replace(betaButtonsPattern, '');
    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: Fix Share button — create tab with share content
// ═══════════════════════════════════════════════════════════════════════════

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

            var self = this;
            var copyBtn = preview.querySelector('#v0210-copy-url');
            if (copyBtn) {
                copyBtn.addEventListener('click', function() {
                    var input = preview.querySelector('#v0210-share-url');
                    if (input) self.copyToClipboard(input.value, copyBtn);
                });
            }
            var emailBtn = preview.querySelector('#v0210-email-link');
            if (emailBtn) {
                emailBtn.addEventListener('click', function() {
                    var subject = 'Secure file shared via SGraph Send';
                    var body = 'I\'ve shared a file with you via SGraph Send.\n\nLink: ' + downloadUrl;
                    window.open('mailto:?subject=' + encodeURIComponent(subject) +
                                '&body=' + encodeURIComponent(body), '_blank');
                });
            }
            var newMaxBtn = preview.querySelector('#maximise-btn');
            if (newMaxBtn) newMaxBtn.addEventListener('click', function() { self._toggleMaximise(); });
        }
        this._v0210_fixTabUnderlines();
        this._v022_updateCommandStrip();
        return;
    }

    _v022_showActiveTabContent.call(this);
    this._v0210_fixTabUnderlines();
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 6: Fix tab underline
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

var _orig_renderTabs = SendDownload.prototype._v022_renderTabs;
SendDownload.prototype._v022_renderTabs = function() {
    _orig_renderTabs.call(this);
    this._v0210_fixTabUnderlines();
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 7: Print button for single-file markdown viewer
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v0210_addPrintButton = function() {
    // Find the button row in the two-column layout
    var copyBtn = this.querySelector('#copy-content-btn');
    if (!copyBtn) return;

    var row = copyBtn.parentElement;
    if (!row) return;

    // Check if print button already exists
    if (row.querySelector('#v0210-print-btn')) return;

    var printBtn = document.createElement('button');
    printBtn.className = 'btn btn-sm btn-secondary';
    printBtn.id = 'v0210-print-btn';
    printBtn.style.cssText = 'flex: 1;';
    printBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6V1h8v5"/><rect x="1" y="6" width="14" height="6" rx="1"/><path d="M4 10h8v5H4z"/></svg> Print';

    row.appendChild(printBtn);

    var self = this;
    printBtn.addEventListener('click', function() {
        // Use SgPrint if available, otherwise fallback
        if (typeof SgPrint !== 'undefined' && self.decryptedBytes) {
            var rawText = new TextDecoder().decode(self.decryptedBytes);
            var safeHtml = (typeof MarkdownParser !== 'undefined') ? MarkdownParser.parse(rawText) : self.escapeHtml(rawText);
            SgPrint.printHtml(safeHtml, self.fileName || 'Document');
        } else {
            // Fallback: try iframe content
            var iframe = self.querySelector('#md-iframe');
            if (iframe) {
                try {
                    var iframeBody = iframe.contentDocument || iframe.contentWindow.document;
                    var content = iframeBody.body.innerHTML;
                    if (typeof SgPrint !== 'undefined') {
                        SgPrint.printHtml(content, self.fileName || 'Document');
                    } else {
                        window.print();
                    }
                } catch(err) {
                    window.print();
                }
            } else {
                window.print();
            }
        }
    });
};

// Also intercept Ctrl+P / Cmd+P for single file markdown
(function() {
    window.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            // Single-file markdown iframe
            var iframe = document.getElementById('md-iframe');
            if (iframe && typeof SgPrint !== 'undefined') {
                e.preventDefault();
                try {
                    var iframeBody = iframe.contentDocument || iframe.contentWindow.document;
                    var content = iframeBody.body.innerHTML;
                    var titleEl = document.querySelector('.filename') || document.querySelector('h3');
                    var filename = titleEl ? titleEl.textContent : '';
                    SgPrint.printHtml(content, filename);
                } catch(err) {
                    window.print();
                }
            }
        }
    });
})();

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

console.log('[send-download-v0210] Error flash fix, image badges, smart selection, bigger save, share fix, tab fix, markdown print');

})();
