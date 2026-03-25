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
     - Fix: gallery now works with mixed file types (bypasses v0.2.6 allFilesAreViewable gate)
     - Generic document cards for non-viewable files (txt, json, html, etc.)

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
    dl12:     '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    dl16:     '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    print:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6V1h8v5"/><rect x="1" y="6" width="14" height="6" rx="1"/><path d="M4 10h8v5H4z"/></svg>',
    share:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="4" r="2"/><circle cx="4" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 9l4 2M6 7l4-2"/></svg>',
    save:     '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    folder:   '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h4l2 2h6v8H2V3z"/></svg>',
    gallery:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
    pdf:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h2a1 1 0 001-1v-1a1 1 0 00-1-1H9v4" stroke-width="1.3"/></svg>',
    markdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h1l1 2 1-2h1" stroke-width="1.3"/></svg>',
    copy:     '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>',
    email:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="10" rx="1"/><path d="M1 3l7 5 7-5"/></svg>'
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

// ─── Helper: filter out _gallery* folders and dot-files from zip tree ────────
function filterGalleryFiles(zipTree) {
    return zipTree.filter(function(e) {
        if (e.dir) return false;
        // Filter out _gallery* folder contents (and legacy _preview* folders)
        if (e.path.indexOf('_gallery') === 0 || e.path.indexOf('/_gallery') !== -1) return false;
        if (e.path.indexOf('_preview') === 0 || e.path.indexOf('/_preview') !== -1) return false;
        // Filter out dot-files (.DS_Store, .gitkeep, etc.)
        var name = e.name || '';
        if (name.charAt(0) === '.') return false;
        // Filter out __MACOSX entries
        if (e.path.indexOf('__MACOSX') !== -1) return false;
        // Filter out _manifest.json
        if (name === '_manifest.json') return false;
        return true;
    });
}

// ─── File type helpers (duplicated from v0.2.6 — scoped in its IIFE) ────────
var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
var PDF_EXTS   = ['pdf'];
var MD_EXTS    = ['md', 'markdown'];

function getFileType(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (PDF_EXTS.indexOf(ext)   !== -1) return 'pdf';
    if (MD_EXTS.indexOf(ext)    !== -1) return 'markdown';
    return 'other';
}

function getMimeType(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (ext === 'jpg')  return 'image/jpeg';
    if (ext === 'svg')  return 'image/svg+xml';
    if (ext === 'pdf')  return 'application/pdf';
    if (ext === 'md' || ext === 'markdown') return 'text/markdown';
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image/' + ext;
    return 'application/octet-stream';
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
    // On gallery pages, render directly — bypass v0.2.6's allFilesAreViewable gate
    if (isGalleryPage() && this._zipTree) {
        var galleryFiles = filterGalleryFiles(this._zipTree);
        if (galleryFiles.length > 0) {
            return this._v027_renderGallery(galleryFiles, timingHtml, sendAnotherHtml);
        }
    }

    // Non-gallery pages: delegate to v0.2.6 as before
    var html = _v026_renderZipLayout.call(this, timingHtml, sendAnotherHtml);

    // Replace "Save All" with "Save locally"
    html = html.replace('>Save All</button>', '>Save locally</button>');

    // Add gallery view link on download/browse pages
    if (isDownloadPage()) {
        var hash = window.location.hash || '';
        var galleryUrl = window.location.pathname.replace('/download', '/gallery').replace('/browse', '/gallery') + hash;
        var switchHtml2 = '<a class="btn btn-sm btn-secondary v027-mode-switch" href="' + galleryUrl + '" title="View as gallery">' +
            ICON.gallery + ' Gallery view</a>';
        html = html.replace('</div>\n        </div>\n        <div id="zip-info-panel"',
            switchHtml2 + '</div>\n        </div>\n        <div id="zip-info-panel"');
    }

    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// Gallery renderer — renders directly, no allFilesAreViewable gate
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v027_renderGallery = function(files, timingHtml, sendAnotherHtml) {
    var zipName  = this._zipOrigName || 'gallery';
    var sizeStr  = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
    var self     = this;
    var hash     = window.location.hash || '';

    // Count by type — includes 'other' category
    var counts = { image: 0, pdf: 0, markdown: 0, other: 0 };
    files.forEach(function(e) {
        var t = getFileType(e.name);
        if (counts[t] !== undefined) counts[t]++;
    });

    // Auto-select view mode
    var autoMode = files.length <= 14 ? 'large' : files.length <= 30 ? 'grid' : 'compact';

    // Generate type-aware thumbnails
    var thumbsHtml = files.map(function(entry, idx) {
        var type = getFileType(entry.name);
        var ext  = (entry.name || '').split('.').pop().toLowerCase();
        var imgHtml;

        if (type === 'image') {
            imgHtml = '<div class="v025-thumb__img" id="v025-thumb-' + idx + '"></div>';
        } else if (type === 'pdf') {
            imgHtml = '<div class="v025-thumb__img v026-thumb__img--doc" id="v025-thumb-' + idx + '">' +
                ICON.pdf + '<span class="v026-thumb__type-badge">PDF</span></div>';
        } else if (type === 'markdown') {
            imgHtml = '<div class="v025-thumb__img v026-thumb__img--doc" id="v025-thumb-' + idx + '">' +
                '<div class="v026-thumb__md-preview"></div>' +
                '<span class="v026-thumb__type-badge">MD</span></div>';
        } else {
            // Generic document card for unknown types
            imgHtml = '<div class="v025-thumb__img v026-thumb__img--doc v027-thumb__img--other" id="v025-thumb-' + idx + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                '<span class="v026-thumb__type-badge">' + self.escapeHtml(ext.toUpperCase()) + '</span></div>';
        }

        return '<div class="v025-thumb v026-thumb--' + type + '" data-index="' + idx + '" data-type="' + type + '" data-path="' + self.escapeHtml(entry.path) + '">' +
                   imgHtml +
                   '<div class="v025-thumb__label">' + self.escapeHtml(entry.name) + '</div>' +
               '</div>';
    }).join('');

    // Build meta label including 'other' count
    var metaParts = [];
    if (counts.image)    metaParts.push(counts.image    + (counts.image    === 1 ? ' image'    : ' images'));
    if (counts.pdf)      metaParts.push(counts.pdf      + (counts.pdf      === 1 ? ' PDF'      : ' PDFs'));
    if (counts.markdown) metaParts.push(counts.markdown  + (counts.markdown === 1 ? ' doc'      : ' docs'));
    if (counts.other)    metaParts.push(counts.other     + (counts.other    === 1 ? ' file'     : ' files'));
    var metaStr = metaParts.join(', ');

    // Mode switcher
    var folderUrl = window.location.pathname.replace('/gallery', '/download') + hash;
    var switchBtn = '<a class="btn btn-sm btn-secondary v027-mode-switch" href="' + folderUrl + '" title="View as folder">' +
        ICON.folder + ' Folder view</a>';

    return '\
        <div class="v025-gallery">\
            <div class="v025-gallery__header">\
                <div class="v025-gallery__header-left">\
                    <span class="v025-gallery__icon">\
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="1.5" stroke-linecap="round">\
                            <rect x="3" y="3" width="7" height="7" rx="1"/>\
                            <rect x="14" y="3" width="7" height="7" rx="1"/>\
                            <rect x="3" y="14" width="7" height="7" rx="1"/>\
                            <rect x="14" y="14" width="7" height="7" rx="1"/>\
                        </svg>\
                    </span>\
                    <span class="v025-gallery__name">' + this.escapeHtml(zipName) + '</span>\
                    <span class="zip-header__badge">gallery</span>\
                    <span class="v025-gallery__meta">' + this.escapeHtml(sizeStr) + ' &middot; ' + metaStr + '</span>\
                    <span class="v022-compact-header__status">&check; Decrypted</span>\
                </div>\
                <div class="v025-gallery__header-right">\
                    <div class="v025-view-modes" id="v025-view-modes">\
                        <button class="v025-view-btn' + (autoMode === 'compact' ? ' v025-view-btn--active' : '') + '" data-mode="compact" title="Compact view">\
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="6" y="1" width="4" height="4" rx="0.5"/><rect x="11" y="1" width="4" height="4" rx="0.5"/><rect x="1" y="6" width="4" height="4" rx="0.5"/><rect x="6" y="6" width="4" height="4" rx="0.5"/><rect x="11" y="6" width="4" height="4" rx="0.5"/><rect x="1" y="11" width="4" height="4" rx="0.5"/><rect x="6" y="11" width="4" height="4" rx="0.5"/><rect x="11" y="11" width="4" height="4" rx="0.5"/></svg>\
                        </button>\
                        <button class="v025-view-btn' + (autoMode === 'grid' ? ' v025-view-btn--active' : '') + '" data-mode="grid" title="Grid view">\
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>\
                        </button>\
                        <button class="v025-view-btn' + (autoMode === 'large' ? ' v025-view-btn--active' : '') + '" data-mode="large" title="Large view">\
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="1" width="14" height="6" rx="1"/><rect x="1" y="9" width="14" height="6" rx="1"/></svg>\
                        </button>\
                    </div>\
                    <div class="v026-share-group">\
                        <button class="btn btn-sm btn-secondary v026-share-btn" id="v026-copy-link" title="Copy gallery link">' + ICON.copy + ' Copy Link</button>\
                        <button class="btn btn-sm btn-secondary v026-share-btn" id="v026-email-link" title="Email gallery link">' + ICON.email + '</button>\
                        <button class="btn btn-sm btn-secondary v026-share-btn" id="v026-print-btn" title="Print gallery">' + ICON.print + '</button>\
                    </div>\
                    <button class="btn btn-sm btn-primary" id="v025-save-zip">' + ICON.dl12 + ' Save locally</button>\
                    ' + switchBtn + '\
                    <button class="btn btn-sm btn-secondary" id="v026-info-btn" title="Transfer details">&#9432;</button>\
                </div>\
            </div>\
            <div class="v025-grid v025-grid--' + autoMode + '" id="v025-grid">' + thumbsHtml + '</div>\
        </div>\
        <div id="v026-info-panel" class="zip-info-panel" style="display: none;">\
            <send-transparency id="transparency-panel"></send-transparency>\
            ' + (timingHtml || '') + '\
        </div>';
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Override setupEventListeners — filter gallery files for thumbnails
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype.setupEventListeners = function() {
    if (!isGalleryPage() || !this._zipTree) {
        // Non-gallery: delegate to v0.2.6 as before
        _v026_setupEvents.call(this);
        return;
    }

    // Gallery page: set up events ourselves using filtered files
    if (!this._tabs) this._tabs = [];
    var self  = this;
    var files = filterGalleryFiles(this._zipTree);
    this._v027_galleryFiles = files;
    this._v025_blobUrls = this._v025_blobUrls || [];

    // ── Type-aware thumbnail loading ──
    files.forEach(function(entry, idx) {
        var thumbEl = self.querySelector('#v025-thumb-' + idx);
        if (!thumbEl || thumbEl.dataset.loaded) return;
        var type = getFileType(entry.name);

        if (type === 'image') {
            entry.entry.async('arraybuffer').then(function(buf) {
                var blob = new Blob([buf], { type: getMimeType(entry.name) });
                var url  = URL.createObjectURL(blob);
                self._v025_blobUrls.push(url);
                thumbEl.style.backgroundImage = 'url(' + url + ')';
                thumbEl.dataset.loaded  = 'true';
                thumbEl.dataset.blobUrl = url;
            });
        } else if (type === 'markdown') {
            entry.entry.async('string').then(function(text) {
                var preview = thumbEl.querySelector('.v026-thumb__md-preview');
                if (preview) {
                    var clean = text.replace(/^#+\s*/gm, '').replace(/[*_`~\[\]]/g, '').trim();
                    preview.textContent = clean.substring(0, 150);
                }
                thumbEl.dataset.loaded = 'true';
            });
        } else {
            thumbEl.dataset.loaded = 'true';
        }
    });

    var grid = this.querySelector('#v025-grid');
    if (!grid) return;

    // ── Thumbnail click → lightbox (viewable) or download (other) ──
    grid.addEventListener('click', function(e) {
        var thumb = e.target.closest('.v025-thumb');
        if (!thumb) return;
        var idx  = parseInt(thumb.dataset.index, 10);
        var type = thumb.dataset.type;

        if (type === 'other') {
            // Download non-viewable files directly
            var entry = files[idx];
            if (entry) {
                entry.entry.async('arraybuffer').then(function(buf) {
                    var blob = new Blob([buf]);
                    self.saveFile(blob, entry.name);
                });
            }
            return;
        }
        // Viewable types: open lightbox
        self._v025_openLightbox(idx);
    });

    // ── Save locally ──
    var saveZip = this.querySelector('#v025-save-zip');
    if (saveZip) {
        saveZip.addEventListener('click', function() {
            self.saveFile(self._zipOrigBytes, self._zipOrigName || 'archive.zip');
        });
    }

    // ── View mode toggle ──
    var viewModes = this.querySelector('#v025-view-modes');
    if (viewModes) {
        viewModes.addEventListener('click', function(e) {
            var btn = e.target.closest('.v025-view-btn');
            if (!btn) return;
            viewModes.querySelectorAll('.v025-view-btn').forEach(function(b) {
                b.classList.toggle('v025-view-btn--active', b === btn);
            });
            var g = self.querySelector('#v025-grid');
            if (g) g.className = 'v025-grid v025-grid--' + btn.dataset.mode;
        });
    }

    // ── Copy Link ──
    var copyBtn = this.querySelector('#v026-copy-link');
    if (copyBtn) {
        copyBtn.addEventListener('click', function() {
            navigator.clipboard.writeText(window.location.href).then(function() {
                var orig = copyBtn.innerHTML;
                copyBtn.innerHTML = '&#10003; Copied!';
                copyBtn.classList.add('v026-share-btn--flash');
                setTimeout(function() {
                    copyBtn.innerHTML = orig;
                    copyBtn.classList.remove('v026-share-btn--flash');
                }, 2000);
            });
        });
    }

    // ── Email Link ──
    var emailBtn = this.querySelector('#v026-email-link');
    if (emailBtn) {
        emailBtn.addEventListener('click', function() {
            var name    = self._zipOrigName || 'Gallery';
            var subject = encodeURIComponent('SG/Send Gallery: ' + name);
            var body    = encodeURIComponent('View this gallery on SG/Send:\n\n' + window.location.href + '\n\nShared via SG/Send \u2014 sgraph.ai');
            window.open('mailto:?subject=' + subject + '&body=' + body);
        });
    }

    // ── Print ──
    var printBtn = this.querySelector('#v026-print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', function() { window.print(); });
    }

    // ── Info toggle ──
    var infoBtn   = this.querySelector('#v026-info-btn');
    var infoPanel = this.querySelector('#v026-info-panel');
    if (infoBtn && infoPanel) {
        infoBtn.addEventListener('click', function() {
            infoPanel.style.display = infoPanel.style.display === 'none' ? '' : 'none';
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Lightbox — branding at top-right + action buttons
// ═══════════════════════════════════════════════════════════════════════════

var _v026_openLightbox = SendDownload.prototype._v025_openLightbox;

SendDownload.prototype._v025_openLightbox = function(index) {
    var self  = this;
    // Use filtered gallery files (which include only viewable types in lightbox context)
    var files = this._v027_galleryFiles ||
        (isGalleryPage() && this._zipTree ? filterGalleryFiles(this._zipTree) :
        (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []));
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
    var files = this._v027_galleryFiles || this._v027_filteredFiles ||
        (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []);
    var entry = files[index];
    if (!entry) return;
    var type = getFileType(entry.name);

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

    if (type === 'markdown') {
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

    if (type === 'image') {
        var thumbEl = this.querySelector('#v025-thumb-' + index);
        var blobUrl = thumbEl ? thumbEl.dataset.blobUrl : null;
        if (blobUrl) {
            wrap.innerHTML = '<img class="v025-lightbox__img" src="' + blobUrl + '" alt="' + this.escapeHtml(entry.name) + '">';
        } else {
            wrap.innerHTML = '<div class="v025-lightbox__loading">Loading...</div>';
            entry.entry.async('arraybuffer').then(function(buf) {
                var blob = new Blob([buf], { type: getMimeType(entry.name) });
                var url  = URL.createObjectURL(blob);
                self._v025_blobUrls = self._v025_blobUrls || [];
                self._v025_blobUrls.push(url);
                if (self._v025_lightboxIndex === index) {
                    wrap.innerHTML = '<img class="v025-lightbox__img" src="' + url + '" alt="' + self.escapeHtml(entry.name) + '">';
                }
            });
        }
        return;
    }

    if (type === 'pdf') {
        wrap.innerHTML = '<div class="v025-lightbox__loading">Loading PDF\u2026</div>';
        entry.entry.async('arraybuffer').then(function(buf) {
            var blob = new Blob([buf], { type: 'application/pdf' });
            var url  = URL.createObjectURL(blob);
            self._v025_blobUrls = self._v025_blobUrls || [];
            self._v025_blobUrls.push(url);
            if (self._v025_lightboxIndex === index) {
                wrap.innerHTML = '<iframe class="v026-lightbox__pdf" src="' + url + '#toolbar=1&navpanes=0"></iframe>';
            }
        });
        return;
    }

    // 'other' type should not reach lightbox (handled by click-to-download),
    // but if it does, show a download prompt
    var ext = (entry.name || '').split('.').pop().toUpperCase();
    wrap.innerHTML = '<div class="v027-lightbox__other-prompt">' +
        '<p>' + this.escapeHtml(entry.name) + '</p>' +
        '<p class="v027-lightbox__other-ext">' + this.escapeHtml(ext) + ' file</p>' +
        '<button class="btn btn-sm btn-primary" id="v027-lb-dl-other">' + ICON.dl12 + ' Download</button>' +
        '</div>';
    var dlBtn = document.getElementById('v027-lb-dl-other');
    if (dlBtn) {
        dlBtn.addEventListener('click', function() {
            entry.entry.async('arraybuffer').then(function(buf) {
                var blob = new Blob([buf]);
                self.saveFile(blob, entry.name);
            });
        });
    }
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
        /* ── Generic document card (other file types) ── */\
        .v027-thumb__img--other { cursor: pointer; }\
        .v027-thumb__img--other:hover { background: rgba(255,255,255,0.08); }\
        .v026-thumb--other .v025-thumb__label { font-style: italic; }\
        \
        /* ── Lightbox: other file type download prompt ── */\
        .v027-lightbox__other-prompt {\
            text-align: center; padding: 3rem; color: rgba(255,255,255,0.7);\
            background: rgba(30, 35, 45, 0.95); border-radius: var(--radius-md, 8px);\
        }\
        .v027-lightbox__other-ext {\
            font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 1.5rem !important;\
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

console.log('[send-download-v027] Gallery fixes — mixed file types, Save locally, hash preservation, filtering, mode switch, white MD, lightbox actions');

})();
