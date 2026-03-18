/* =============================================================================
   SGraph Send — Download Component
   v0.2.6 — Surgical overlay on v0.2.5

   Changes:
     - Bigger auto-mode thresholds: large default up to 14 images
     - Multi-file-type gallery: images, PDFs, markdown with type-aware cards
     - Share section: Copy Link, Email, Print buttons in gallery header
     - SG/Send branding in lightbox
     - Print-friendly @media print styles
     - Fix: info (i) button toggle now works correctly

   Loads AFTER v0.2.5 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v026] SendDownload not found — skipping');
    return;
}

// ─── File type helpers ──────────────────────────────────────────────────────
var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
var PDF_EXTS   = ['pdf'];
var MD_EXTS    = ['md', 'markdown'];

function getFileExt(name) {
    return (name || '').split('.').pop().toLowerCase();
}

function getFileType(name) {
    var ext = getFileExt(name);
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (PDF_EXTS.indexOf(ext)   !== -1) return 'pdf';
    if (MD_EXTS.indexOf(ext)    !== -1) return 'markdown';
    return 'other';
}

function getMimeType(name) {
    var ext = getFileExt(name);
    if (ext === 'jpg')  return 'image/jpeg';
    if (ext === 'svg')  return 'image/svg+xml';
    if (ext === 'pdf')  return 'application/pdf';
    if (ext === 'md' || ext === 'markdown') return 'text/markdown';
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image/' + ext;
    return 'application/octet-stream';
}

function isGalleryCompatible(name) {
    return getFileType(name) !== 'other';
}

function allFilesAreViewable(zipTree) {
    var files = zipTree.filter(function(e) { return !e.dir; });
    if (files.length === 0) return false;
    return files.every(function(e) { return isGalleryCompatible(e.name); });
}

function countByType(files) {
    var c = { image: 0, pdf: 0, markdown: 0 };
    files.forEach(function(e) { var t = getFileType(e.name); if (c[t] !== undefined) c[t]++; });
    return c;
}

function metaLabel(counts) {
    var parts = [];
    if (counts.image)    parts.push(counts.image    + (counts.image    === 1 ? ' image'    : ' images'));
    if (counts.pdf)      parts.push(counts.pdf      + (counts.pdf      === 1 ? ' PDF'      : ' PDFs'));
    if (counts.markdown) parts.push(counts.markdown  + (counts.markdown === 1 ? ' doc'      : ' docs'));
    return parts.join(', ');
}

// ─── SVG fragments ──────────────────────────────────────────────────────────
var ICON = {
    pdf:      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h2a1 1 0 001-1v-1a1 1 0 00-1-1H9v4" stroke-width="1.3"/></svg>',
    markdown: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h1l1 2 1-2h1" stroke-width="1.3"/></svg>',
    copy:     '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>',
    email:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="10" rx="1"/><path d="M1 3l7 5 7-5"/></svg>',
    print:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6V1h8v5"/><rect x="1" y="6" width="14" height="6" rx="1"/><path d="M4 10h8v5H4z"/></svg>',
    dl12:     '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    dl16:     '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>'
};

// ─── Save v0.2.5 references ─────────────────────────────────────────────────
var _v025_renderZipLayout = SendDownload.prototype._renderZipLayout;
var _v025_setupEvents     = SendDownload.prototype.setupEventListeners;
var _v025_showLightboxImg = SendDownload.prototype._v025_showLightboxImage;
var _v025_openLightbox    = SendDownload.prototype._v025_openLightbox;
var _v025_saveImage       = SendDownload.prototype._v025_saveLightboxImage;
var _v025_cleanup         = SendDownload.prototype.cleanup;

function isGalleryPage() {
    return window.location.pathname.indexOf('/gallery') !== -1;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER — override v0.2.5's _renderZipLayout
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    // If not gallery page or files aren't viewable, delegate up
    if (!isGalleryPage() || !this._zipTree || !allFilesAreViewable(this._zipTree)) {
        return _v025_renderZipLayout.call(this, timingHtml, sendAnotherHtml);
    }

    var zipName = this._zipOrigName || 'gallery';
    var sizeStr = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
    var files   = this._zipTree.filter(function(e) { return !e.dir; });
    var self    = this;
    var counts  = countByType(files);

    // Auto-select: large for <=14 (confirmed looks great), grid for 15-30, compact for 31+
    var autoMode = files.length <= 14 ? 'large' : files.length <= 30 ? 'grid' : 'compact';

    // Generate type-aware thumbnails
    var thumbsHtml = files.map(function(entry, idx) {
        var type = getFileType(entry.name);
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
        }

        return '<div class="v025-thumb v026-thumb--' + type + '" data-index="' + idx + '" data-type="' + type + '" data-path="' + self.escapeHtml(entry.path) + '">' +
                   imgHtml +
                   '<div class="v025-thumb__label">' + self.escapeHtml(entry.name) + '</div>' +
               '</div>';
    }).join('');

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
                    <span class="v025-gallery__meta">' + this.escapeHtml(sizeStr) + ' &middot; ' + metaLabel(counts) + '</span>\
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
                    <button class="btn btn-sm btn-primary" id="v025-save-zip">' + ICON.dl12 + ' Save All</button>\
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
// EVENT LISTENERS — override v0.2.5
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype.setupEventListeners = function() {
    if (!this._tabs) this._tabs = [];
    // Call v0.2.5 setup (which chains to v0.2.2)
    _v025_setupEvents.call(this);

    var self = this;
    var grid = this.querySelector('#v025-grid');
    if (!grid) return;

    var files = this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : [];
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
        } else if (type === 'pdf') {
            thumbEl.dataset.loaded = 'true';
        }
    });

    // ── Thumbnail click → lightbox ──
    grid.addEventListener('click', function(e) {
        var thumb = e.target.closest('.v025-thumb');
        if (!thumb) return;
        self._v025_openLightbox(parseInt(thumb.dataset.index, 10));
    });

    // ── Save All ──
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

    // ── Info toggle (v0.2.6 IDs — fixes the broken v0.2.5 info button) ──
    var infoBtn   = this.querySelector('#v026-info-btn');
    var infoPanel = this.querySelector('#v026-info-panel');
    if (infoBtn && infoPanel) {
        infoBtn.addEventListener('click', function() {
            infoPanel.style.display = infoPanel.style.display === 'none' ? '' : 'none';
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// LIGHTBOX — type-aware content + branding
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v025_openLightbox = function(index) {
    var self  = this;
    var files = this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : [];
    if (index < 0 || index >= files.length) return;

    this._v025_lightboxIndex = index;

    var overlay = document.getElementById('v025-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'v025-lightbox';
        overlay.className = 'v025-lightbox';
        overlay.innerHTML = '\
            <div class="v025-lightbox__top">\
                <span class="v025-lightbox__filename" id="v025-lb-name"></span>\
                <span class="v025-lightbox__counter" id="v025-lb-counter"></span>\
                <button class="v025-lightbox__btn" id="v025-lb-save" title="Save file">' + ICON.dl16 + '</button>\
                <button class="v025-lightbox__btn v025-lightbox__close" id="v025-lb-close">&times;</button>\
            </div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--prev" id="v025-lb-prev">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>\
            </button>\
            <div class="v025-lightbox__img-wrap" id="v025-lb-img-wrap"></div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--next" id="v025-lb-next">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>\
            </button>\
            <div class="v026-lightbox__brand">\
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>\
                <span>SG/<b>Send</b></span>\
            </div>';
        document.body.appendChild(overlay);

        document.getElementById('v025-lb-close').addEventListener('click', function() { self._v025_closeLightbox(); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) self._v025_closeLightbox(); });
        document.getElementById('v025-lb-prev').addEventListener('click', function() { self._v025_navigateLightbox(-1); });
        document.getElementById('v025-lb-next').addEventListener('click', function() { self._v025_navigateLightbox(1); });
        document.getElementById('v025-lb-save').addEventListener('click', function() { self._v026_saveFile(); });

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

// ── Type-aware lightbox content ──
SendDownload.prototype._v025_showLightboxImage = function(index) {
    var files   = this._zipTree.filter(function(e) { return !e.dir; });
    var entry   = files[index];
    var type    = getFileType(entry.name);
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
    } else if (type === 'pdf') {
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
    } else if (type === 'markdown') {
        wrap.innerHTML = '<div class="v025-lightbox__loading">Loading\u2026</div>';
        entry.entry.async('string').then(function(text) {
            if (self._v025_lightboxIndex !== index) return;
            var html;
            if (typeof MarkdownParser !== 'undefined' && MarkdownParser.parse) {
                html = MarkdownParser.parse(text);
            } else {
                html = '<pre>' + self.escapeHtml(text) + '</pre>';
            }
            wrap.innerHTML = '<div class="v026-lightbox__md">' + html + '</div>';
        });
    }
};

// ── Generic save (works for all file types) ──
SendDownload.prototype._v026_saveFile = function() {
    var files = this._zipTree.filter(function(e) { return !e.dir; });
    var entry = files[this._v025_lightboxIndex];
    if (!entry) return;

    entry.entry.async('arraybuffer').then(function(buf) {
        var blob = new Blob([buf], { type: getMimeType(entry.name) });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v026-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v026-download-styles';
    s.textContent = '\
        /* ── Share buttons ── */\
        .v026-share-group { display: flex; gap: 2px; }\
        .v026-share-btn {\
            display: inline-flex !important; align-items: center; gap: 4px;\
            font-size: 0.75rem !important; padding: 4px 8px !important;\
        }\
        .v026-share-btn--flash { background: var(--accent, #4ECDC4) !important; color: #000 !important; }\
        \
        /* ── Document-type thumbnails ── */\
        .v026-thumb__img--doc {\
            display: flex; flex-direction: column; align-items: center; justify-content: center;\
            gap: 6px; color: rgba(255,255,255,0.3); position: relative;\
        }\
        .v026-thumb__type-badge {\
            position: absolute; top: 8px; right: 8px;\
            font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em;\
            padding: 2px 6px; border-radius: 3px;\
            background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5);\
        }\
        .v026-thumb__md-preview {\
            width: 100%; height: 100%; padding: 10px; font-size: 0.55rem;\
            line-height: 1.4; color: rgba(255,255,255,0.35); overflow: hidden;\
            text-overflow: ellipsis; white-space: pre-wrap; word-break: break-word;\
        }\
        \
        /* ── Lightbox: PDF viewer ── */\
        .v026-lightbox__pdf {\
            width: 80vw; height: 80vh; border: none;\
            border-radius: var(--radius-md, 8px); background: #fff;\
        }\
        /* ── Lightbox: Markdown viewer ── */\
        .v026-lightbox__md {\
            width: 70vw; max-height: 80vh; overflow-y: auto; padding: 2rem;\
            background: rgba(30, 35, 45, 0.95); border-radius: var(--radius-md, 8px);\
            color: var(--color-text, #E0E0E0); font-size: 1rem; line-height: 1.7;\
        }\
        .v026-lightbox__md h1, .v026-lightbox__md h2, .v026-lightbox__md h3 { color: #fff; margin-top: 1.2em; }\
        .v026-lightbox__md pre { background: rgba(0,0,0,0.3); padding: 1em; border-radius: 6px; overflow-x: auto; }\
        .v026-lightbox__md code { font-size: 0.9em; }\
        .v026-lightbox__md a { color: var(--accent, #4ECDC4); }\
        \
        /* ── Lightbox: SG/Send branding ── */\
        .v026-lightbox__brand {\
            position: absolute; bottom: var(--space-3, 0.75rem); right: var(--space-4, 1rem);\
            display: flex; align-items: center; gap: 6px; z-index: 2;\
            font-size: 0.85rem; color: rgba(255,255,255,0.25); pointer-events: none;\
        }\
        .v026-lightbox__brand b { color: rgba(255,255,255,0.4); font-weight: 600; }\
        \
        /* ── Print styles ── */\
        @media print {\
            body { background: #fff !important; color: #000 !important; }\
            send-header, send-footer, .v025-gallery__header-right,\
            .v025-lightbox__nav, .v025-lightbox__close, .v025-lightbox__btn,\
            .zip-info-panel, #download-actions, .disclaimer { display: none !important; }\
            .v025-gallery__header {\
                border-bottom: 1px solid #ccc !important; padding: 0.5rem 0 !important; background: none !important;\
            }\
            .v025-gallery__name, .v025-gallery__meta { color: #000 !important; }\
            .zip-header__badge { background: #eee !important; color: #333 !important; }\
            .v025-grid {\
                display: grid !important; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;\
                gap: 8px !important; padding: 8px 0 !important; overflow: visible !important;\
            }\
            .v025-thumb { border: 1px solid #ddd !important; break-inside: avoid; background: #f9f9f9 !important; }\
            .v025-thumb__label { color: #333 !important; }\
            .v025-thumb__img { print-color-adjust: exact; -webkit-print-color-adjust: exact; }\
            .v025-lightbox {\
                position: static !important; display: block !important;\
                background: #fff !important; page-break-before: always;\
            }\
            .v025-lightbox__top { position: static !important; background: none !important; padding: 0.5rem 0 !important; }\
            .v025-lightbox__filename { color: #000 !important; }\
            .v025-lightbox__counter { color: #666 !important; }\
            .v025-lightbox__img-wrap { max-width: 100% !important; max-height: none !important; }\
            .v025-lightbox__img { max-width: 100% !important; max-height: none !important; box-shadow: none !important; border-radius: 0 !important; }\
            .v026-lightbox__brand { position: static !important; color: #999 !important; margin-top: 0.5rem; justify-content: flex-end; }\
            .v026-lightbox__brand b { color: #666 !important; }\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v026] Gallery v2 \u2014 multi-type, share, print, branding');

})();
