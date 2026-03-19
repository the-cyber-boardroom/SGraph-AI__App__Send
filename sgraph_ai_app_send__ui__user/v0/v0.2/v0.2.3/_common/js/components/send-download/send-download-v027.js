/* =============================================================================
   SGraph Send — Download Component
   v0.2.7 — Surgical overlay on v0.2.6

   Changes:
     - "Save All" → "Save locally" button text
     - Hash fragment preserved for friendly tokens (Copy Link works on gallery)
     - Filter _preview* folders and dot-files from gallery display
     - Gallery/folder mode switcher in header
     - Markdown lightbox: white background with proper typography
     - Lightbox branding moved to top-right + action buttons (print, save, share)

   Loads AFTER v0.2.6 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v027] SendDownload not found — skipping');
    return;
}

// ─── SVG icons ──────────────────────────────────────────────────────────────
var ICON = {
    dl12:    '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    dl16:    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    print:   '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6V1h8v5"/><rect x="1" y="6" width="14" height="6" rx="1"/><path d="M4 10h8v5H4z"/></svg>',
    share:   '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="4" r="2"/><circle cx="4" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 9l4 2M6 7l4-2"/></svg>',
    save:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    folder:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h4l2 2h6v8H2V3z"/></svg>',
    gallery: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>'
};

// ─── Save references ────────────────────────────────────────────────────────
var _v026_renderZipLayout = SendDownload.prototype._renderZipLayout;
var _v026_setupEvents     = SendDownload.prototype.setupEventListeners;

function isGalleryPage() {
    return window.location.pathname.indexOf('/gallery') !== -1;
}

function isDownloadPage() {
    return window.location.pathname.indexOf('/download') !== -1 ||
           window.location.pathname.indexOf('/browse')   !== -1;
}

// ─── Helper: filter out _preview* folders and dot-files from zip tree ────────
function filterGalleryFiles(zipTree) {
    return zipTree.filter(function(e) {
        if (e.dir) return false;
        // Filter out _preview* folder contents
        if (e.path.indexOf('_preview') === 0 || e.path.indexOf('/_preview') !== -1) return false;
        // Filter out dot-files (.DS_Store, .gitkeep, etc.)
        var name = e.name || '';
        if (name.charAt(0) === '.') return false;
        // Filter out __MACOSX entries
        if (e.path.indexOf('__MACOSX') !== -1) return false;
        return true;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Hash fragment preservation for friendly tokens
//
// The base send-download.js strips the hash at line 1000-1002 after
// decryption. For friendly tokens, we need the hash to stay.
// Simplest approach: monkeypatch history.replaceState during render.
// ═══════════════════════════════════════════════════════════════════════════

var _origHistoryReplace = history.replaceState.bind(history);
var _preserveHash = false;
var _savedFriendlyHash = null;

// Wrap history.replaceState to prevent hash stripping for friendly tokens
history.replaceState = function(state, title, url) {
    if (_preserveHash && _savedFriendlyHash && url) {
        // If the new URL strips the hash, add it back
        var urlStr = String(url);
        if (urlStr.indexOf('#') === -1 && _savedFriendlyHash) {
            url = urlStr + _savedFriendlyHash;
        }
    }
    return _origHistoryReplace(state, title, url);
};

// Override render to enable hash preservation during friendly token rendering
var _v027_origRender = SendDownload.prototype.render;
SendDownload.prototype.render = function() {
    var isFriendly = this._friendlyToken || this._friendlyResolved;
    if (isFriendly && window.location.hash) {
        _preserveHash = true;
        _savedFriendlyHash = window.location.hash;
    }
    _v027_origRender.call(this);
    _preserveHash = false;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: "Save All" → "Save locally" + gallery/folder mode switcher +
//         filter _preview* and dot-files
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    // Override _zipTree temporarily to filter out preview/dot-files for gallery
    var origTree = this._zipTree;
    if (isGalleryPage() && this._zipTree) {
        this._zipTree = filterGalleryFiles(this._zipTree);
    }

    var html = _v026_renderZipLayout.call(this, timingHtml, sendAnotherHtml);

    // Restore original tree
    this._zipTree = origTree;

    // Replace "Save All" with "Save locally"
    html = html.replace('>Save All</button>', '>Save locally</button>');

    // Add gallery/folder mode switcher
    var hash = window.location.hash || '';
    if (isGalleryPage()) {
        var folderUrl = window.location.pathname.replace('/gallery', '/download') + hash;
        var switchHtml = '<a class="btn btn-sm btn-secondary v027-mode-switch" href="' + folderUrl + '" title="View as folder">' +
            ICON.folder + ' Folder view</a>';
        html = html.replace('id="v026-info-btn"', 'data-placeholder-switch="1">' + switchHtml + '<button id="v026-info-btn"');
        // Fix the double button close — actually let me just inject before the info button
        html = html.replace('data-placeholder-switch="1">', '');
    } else if (isDownloadPage()) {
        var galleryUrl = window.location.pathname.replace('/download', '/gallery').replace('/browse', '/gallery') + hash;
        var switchHtml2 = '<a class="btn btn-sm btn-secondary v027-mode-switch" href="' + galleryUrl + '" title="View as gallery">' +
            ICON.gallery + ' Gallery view</a>';
        // Inject after the Save button or at end of header-right
        html = html.replace('</div>\n        </div>\n        <div id="zip-info-panel"',
            switchHtml2 + '</div>\n        </div>\n        <div id="zip-info-panel"');
    }

    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Override setupEventListeners — filter gallery files for thumbnails
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype.setupEventListeners = function() {
    // Filter _zipTree for gallery pages before v0.2.6 processes thumbnails
    var origTree = this._zipTree;
    if (isGalleryPage() && this._zipTree) {
        this._zipTree = filterGalleryFiles(this._zipTree);
    }

    _v026_setupEvents.call(this);

    // Restore
    this._zipTree = origTree;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Lightbox — branding at top-right + action buttons
// ═══════════════════════════════════════════════════════════════════════════

var _v026_openLightbox = SendDownload.prototype._v025_openLightbox;

SendDownload.prototype._v025_openLightbox = function(index) {
    var self  = this;
    // Use filtered files for gallery
    var files = isGalleryPage() && this._zipTree
        ? filterGalleryFiles(this._zipTree)
        : (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []);
    if (index < 0 || index >= files.length) return;

    this._v025_lightboxIndex = index;
    // Store filtered files for use by lightbox image display
    this._v027_filteredFiles = files;

    var overlay = document.getElementById('v025-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'v025-lightbox';
        overlay.className = 'v025-lightbox';
        overlay.innerHTML = '\
            <div class="v025-lightbox__top">\
                <span class="v025-lightbox__filename" id="v025-lb-name"></span>\
                <div class="v027-lightbox__actions">\
                    <button class="v025-lightbox__btn v027-lb-action" id="v027-lb-save-file" title="Save locally">' + ICON.save + ' Save locally</button>\
                    <button class="v025-lightbox__btn v027-lb-action" id="v027-lb-print" title="Print">' + ICON.print + '</button>\
                    <button class="v025-lightbox__btn v027-lb-action" id="v027-lb-share" title="Share">' + ICON.share + '</button>\
                </div>\
                <span class="v025-lightbox__counter" id="v025-lb-counter"></span>\
                <button class="v025-lightbox__btn" id="v025-lb-save" title="Save file">' + ICON.dl16 + '</button>\
                <button class="v025-lightbox__btn v025-lightbox__close" id="v025-lb-close">&times;</button>\
            </div>\
            <div class="v027-lightbox__brand-top">\
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>\
                <span>SG/<b>Send</b></span>\
            </div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--prev" id="v025-lb-prev">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>\
            </button>\
            <div class="v025-lightbox__img-wrap" id="v025-lb-img-wrap"></div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--next" id="v025-lb-next">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>\
            </button>';
        document.body.appendChild(overlay);

        document.getElementById('v025-lb-close').addEventListener('click', function() { self._v025_closeLightbox(); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) self._v025_closeLightbox(); });
        document.getElementById('v025-lb-prev').addEventListener('click', function() { self._v025_navigateLightbox(-1); });
        document.getElementById('v025-lb-next').addEventListener('click', function() { self._v025_navigateLightbox(1); });
        document.getElementById('v025-lb-save').addEventListener('click', function() { self._v026_saveFile(); });
        document.getElementById('v027-lb-save-file').addEventListener('click', function() { self._v026_saveFile(); });
        document.getElementById('v027-lb-print').addEventListener('click', function() { window.print(); });
        document.getElementById('v027-lb-share').addEventListener('click', function() {
            navigator.clipboard.writeText(window.location.href).then(function() {
                var btn = document.getElementById('v027-lb-share');
                var orig = btn.innerHTML;
                btn.innerHTML = '&#10003; Copied!';
                setTimeout(function() { btn.innerHTML = orig; }, 2000);
            });
        });

        this._v025_keyHandler = function(e) {
            if (!document.getElementById('v025-lightbox')) return;
            if (e.key === 'Escape')                           self._v025_closeLightbox();
            else if (e.key === 'ArrowLeft'  || e.key === 'k') self._v025_navigateLightbox(-1);
            else if (e.key === 'ArrowRight' || e.key === 'j') self._v025_navigateLightbox(1);
            else if (e.key === 's')                            self._v026_saveFile();
        };
        document.addEventListener('keydown', this._v025_keyHandler);
    }

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this._v025_showLightboxImage(index);
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: Markdown lightbox — white background
// ═══════════════════════════════════════════════════════════════════════════

var _v026_showLightboxImage = SendDownload.prototype._v025_showLightboxImage;

SendDownload.prototype._v025_showLightboxImage = function(index) {
    // Use filtered file list when available
    var files = this._v027_filteredFiles ||
        (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []);
    var entry = files[index];
    if (!entry) return;
    var ext = (entry.name || '').split('.').pop().toLowerCase();

    if (ext === 'md' || ext === 'markdown') {
        var nameEl  = document.getElementById('v025-lb-name');
        var countEl = document.getElementById('v025-lb-counter');
        var wrap    = document.getElementById('v025-lb-img-wrap');
        var prevBtn = document.getElementById('v025-lb-prev');
        var nextBtn = document.getElementById('v025-lb-next');

        nameEl.textContent  = entry.name;
        countEl.textContent = (index + 1) + ' / ' + files.length;
        prevBtn.style.visibility = index > 0 ? 'visible' : 'hidden';
        nextBtn.style.visibility = index < files.length - 1 ? 'visible' : 'hidden';

        var self = this;
        wrap.innerHTML = '<div class="v025-lightbox__loading">Loading\u2026</div>';
        entry.entry.async('string').then(function(text) {
            if (self._v025_lightboxIndex !== index) return;
            var html;
            if (typeof MarkdownParser !== 'undefined' && MarkdownParser.parse) {
                html = MarkdownParser.parse(text);
            } else {
                html = '<pre>' + self.escapeHtml(text) + '</pre>';
            }
            wrap.innerHTML = '<div class="v027-lightbox__md">' + html + '</div>';
        });
        return;
    }

    // Non-markdown: delegate to v0.2.6
    _v026_showLightboxImage.call(this, index);
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v027-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v027-download-styles';
    s.textContent = '\
        /* ── Markdown lightbox: white background ── */\
        .v027-lightbox__md {\
            width: 70vw; max-width: 900px; max-height: 80vh; overflow-y: auto; padding: 2.5rem 3rem;\
            background: #ffffff; border-radius: var(--radius-md, 8px);\
            color: #1a1a2e; font-size: 1rem; line-height: 1.7;\
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);\
        }\
        .v027-lightbox__md h1, .v027-lightbox__md h2, .v027-lightbox__md h3 {\
            color: #111; margin-top: 1.2em; margin-bottom: 0.5em;\
        }\
        .v027-lightbox__md h1 { font-size: 1.6rem; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }\
        .v027-lightbox__md h2 { font-size: 1.3rem; }\
        .v027-lightbox__md h3 { font-size: 1.1rem; }\
        .v027-lightbox__md p { margin: 0.8em 0; }\
        .v027-lightbox__md pre {\
            background: #f5f5f5; padding: 1em; border-radius: 6px;\
            overflow-x: auto; border: 1px solid #e0e0e0;\
        }\
        .v027-lightbox__md code { font-size: 0.9em; color: #d63384; }\
        .v027-lightbox__md pre code { color: #333; }\
        .v027-lightbox__md a { color: #0969da; }\
        .v027-lightbox__md blockquote {\
            border-left: 3px solid #ddd; padding-left: 1em; margin-left: 0; color: #555;\
        }\
        .v027-lightbox__md table { border-collapse: collapse; width: 100%; }\
        .v027-lightbox__md th, .v027-lightbox__md td {\
            border: 1px solid #ddd; padding: 6px 12px; text-align: left;\
        }\
        .v027-lightbox__md th { background: #f5f5f5; font-weight: 600; }\
        .v027-lightbox__md strong { color: #111; }\
        .v027-lightbox__md hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }\
        \
        /* ── Lightbox branding: top-right instead of bottom-right ── */\
        .v026-lightbox__brand { display: none !important; }\
        .v027-lightbox__brand-top {\
            position: absolute; top: var(--space-3, 0.75rem); right: 60px;\
            display: flex; align-items: center; gap: 6px; z-index: 2;\
            font-size: 0.85rem; color: rgba(255,255,255,0.25); pointer-events: none;\
        }\
        .v027-lightbox__brand-top b { color: rgba(255,255,255,0.4); font-weight: 600; }\
        \
        /* ── Lightbox action buttons row ── */\
        .v027-lightbox__actions {\
            display: flex; gap: 4px; margin-left: auto; margin-right: var(--space-2, 0.5rem);\
        }\
        .v027-lb-action {\
            font-size: 0.75rem !important; gap: 4px;\
            display: inline-flex !important; align-items: center;\
        }\
        \
        /* ── Gallery/folder mode switch ── */\
        .v027-mode-switch {\
            display: inline-flex !important; align-items: center; gap: 4px;\
            font-size: 0.75rem !important; padding: 4px 10px !important;\
            text-decoration: none !important;\
        }\
        \
        /* ── Tick alignment fix: right-align check + ms as a group ── */\
        .v028-live-timing__row {\
            display: flex !important;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v028-live-timing__label {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-live-timing__check {\
            flex-shrink: 0;\
            width: 16px;\
            text-align: center;\
        }\
        .v028-live-timing__ms {\
            flex-shrink: 0;\
            min-width: 70px;\
            text-align: right;\
            margin-left: 0 !important;\
        }\
        \
        /* ── Print adjustments ── */\
        @media print {\
            .v027-lightbox__brand-top { position: static !important; color: #999 !important; margin-top: 0.5rem; justify-content: flex-end; }\
            .v027-lightbox__brand-top b { color: #666 !important; }\
            .v027-lightbox__actions { display: none !important; }\
            .v027-lightbox__md { box-shadow: none !important; border: 1px solid #ddd; }\
            .v027-mode-switch { display: none !important; }\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v027] Gallery fixes — Save locally, hash preservation, filtering, mode switch, white MD, lightbox actions');

})();
