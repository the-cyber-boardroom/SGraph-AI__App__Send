/* =============================================================================
   SGraph Send — Download Component
   v0.2.5 — Surgical overlay on v0.2.4

   Changes:
     - Gallery view: when the page is /gallery/ and the zip contains images,
       render a thumbnail grid instead of the file browser
     - Click any thumbnail to open a lightbox with full-size image
     - Arrow key / swipe navigation between images in lightbox
     - "Save All" button to download the full zip
     - "Save Image" button in lightbox to save individual image
     - Falls through to v0.2.2 zip browser for non-gallery pages or
       zips with non-image files

   Loads AFTER v0.2.4 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v025] SendDownload not found — skipping');
    return;
}

var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
var _v022_renderZipLayout = SendDownload.prototype._renderZipLayout;
var _v022_setupEvents     = SendDownload.prototype.setupEventListeners;
var _v022_cleanup         = SendDownload.prototype.cleanup;
var _v024_startDownload   = SendDownload.prototype.startDownload;

// ─── Override: startDownload — add error logging for gallery debugging ───────
SendDownload.prototype.startDownload = async function(keyOverride) {
    console.log('[v025] startDownload called, keyOverride:', keyOverride ? keyOverride.substring(0, 8) + '...' : 'none');
    await _v024_startDownload.call(this, keyOverride);
    console.log('[v025] startDownload done — state:', this.state, 'errorMessage:', this.errorMessage, '_renderType:', this._renderType, '_zipTree:', this._zipTree ? this._zipTree.length + ' entries' : 'null');
};

// ─── Detect gallery page ────────────────────────────────────────────────────
function isGalleryPage() {
    return window.location.pathname.indexOf('/gallery') !== -1;
}

// ─── Check if all zip entries are images ────────────────────────────────────
function allFilesAreImages(zipTree) {
    var files = zipTree.filter(function(e) { return !e.dir; });
    if (files.length === 0) return false;
    return files.every(function(e) {
        var ext = (e.name || '').split('.').pop().toLowerCase();
        return IMAGE_EXTS.indexOf(ext) !== -1;
    });
}

// ─── Override: _renderZipLayout — gallery grid when appropriate ──────────────
SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    if (!isGalleryPage() || !this._zipTree || !allFilesAreImages(this._zipTree)) {
        return _v022_renderZipLayout.call(this, timingHtml, sendAnotherHtml);
    }

    // Build gallery
    var zipName  = this._zipOrigName || 'gallery';
    var sizeStr  = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
    var files    = this._zipTree.filter(function(e) { return !e.dir; });
    var self     = this;

    // Generate thumbnail HTML
    var thumbsHtml = files.map(function(entry, idx) {
        return '<div class="v025-thumb" data-index="' + idx + '" data-path="' + self.escapeHtml(entry.path) + '">' +
                   '<div class="v025-thumb__img" id="v025-thumb-' + idx + '"></div>' +
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
                    <span class="v025-gallery__meta">' + this.escapeHtml(sizeStr) + ' &middot; ' + files.length + ' images</span>\
                    <span class="v022-compact-header__status">&check; Decrypted</span>\
                </div>\
                <div class="v025-gallery__header-right">\
                    <button class="btn btn-sm btn-primary" id="v025-save-zip">\
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>\
                        Save All\
                    </button>\
                    <button class="btn btn-sm btn-secondary" id="zip-info-btn" title="Transfer details">&#9432;</button>\
                </div>\
            </div>\
            <div class="v025-grid" id="v025-grid">' + thumbsHtml + '</div>\
        </div>\
        <div id="zip-info-panel" class="zip-info-panel" style="display: none;">\
            <send-transparency id="transparency-panel"></send-transparency>\
            ' + (timingHtml || '') + '\
        </div>';
};

// ─── Override: setupEventListeners — gallery events ─────────────────────────
SendDownload.prototype.setupEventListeners = function() {
    // Ensure _tabs is initialised (v0.2.2's setupEventListeners reads _tabs.length)
    if (!this._tabs) this._tabs = [];
    _v022_setupEvents.call(this);

    var self = this;
    var grid = this.querySelector('#v025-grid');
    if (!grid) return;

    // Load thumbnails asynchronously
    var files = this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : [];
    this._v025_blobUrls = this._v025_blobUrls || [];

    files.forEach(function(entry, idx) {
        var thumbEl = self.querySelector('#v025-thumb-' + idx);
        if (!thumbEl || thumbEl.dataset.loaded) return;

        entry.entry.async('arraybuffer').then(function(buf) {
            var ext  = (entry.name || '').split('.').pop().toLowerCase();
            var mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext);
            var blob = new Blob([buf], { type: mime });
            var url  = URL.createObjectURL(blob);
            self._v025_blobUrls.push(url);
            thumbEl.style.backgroundImage = 'url(' + url + ')';
            thumbEl.dataset.loaded = 'true';
            thumbEl.dataset.blobUrl = url;
        });
    });

    // Click handler for thumbnails → lightbox
    grid.addEventListener('click', function(e) {
        var thumb = e.target.closest('.v025-thumb');
        if (!thumb) return;
        var idx = parseInt(thumb.dataset.index, 10);
        self._v025_openLightbox(idx);
    });

    // Save All button
    var saveZip = this.querySelector('#v025-save-zip');
    if (saveZip) {
        saveZip.addEventListener('click', function() {
            self.saveFile(self._zipOrigBytes, self._zipOrigName || 'archive.zip');
        });
    }

    // Info toggle
    var infoBtn = this.querySelector('#zip-info-btn');
    var infoPanel = this.querySelector('#zip-info-panel');
    if (infoBtn && infoPanel) {
        infoBtn.addEventListener('click', function() {
            infoPanel.style.display = infoPanel.style.display === 'none' ? '' : 'none';
        });
    }
};

// ─── Lightbox ───────────────────────────────────────────────────────────────
SendDownload.prototype._v025_openLightbox = function(index) {
    var self  = this;
    var files = this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : [];
    if (index < 0 || index >= files.length) return;

    this._v025_lightboxIndex = index;

    // Create overlay
    var overlay = document.getElementById('v025-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'v025-lightbox';
        overlay.className = 'v025-lightbox';
        overlay.innerHTML = '\
            <div class="v025-lightbox__top">\
                <span class="v025-lightbox__filename" id="v025-lb-name"></span>\
                <span class="v025-lightbox__counter" id="v025-lb-counter"></span>\
                <button class="v025-lightbox__btn" id="v025-lb-save" title="Save image">\
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>\
                </button>\
                <button class="v025-lightbox__btn v025-lightbox__close" id="v025-lb-close">&times;</button>\
            </div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--prev" id="v025-lb-prev">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>\
            </button>\
            <div class="v025-lightbox__img-wrap" id="v025-lb-img-wrap"></div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--next" id="v025-lb-next">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>\
            </button>';
        document.body.appendChild(overlay);

        // Close
        document.getElementById('v025-lb-close').addEventListener('click', function() { self._v025_closeLightbox(); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) self._v025_closeLightbox(); });

        // Nav
        document.getElementById('v025-lb-prev').addEventListener('click', function() { self._v025_navigateLightbox(-1); });
        document.getElementById('v025-lb-next').addEventListener('click', function() { self._v025_navigateLightbox(1); });

        // Save
        document.getElementById('v025-lb-save').addEventListener('click', function() { self._v025_saveLightboxImage(); });

        // Keyboard
        this._v025_keyHandler = function(e) {
            if (!document.getElementById('v025-lightbox')) return;
            if (e.key === 'Escape')                        self._v025_closeLightbox();
            else if (e.key === 'ArrowLeft' || e.key === 'k')  self._v025_navigateLightbox(-1);
            else if (e.key === 'ArrowRight' || e.key === 'j') self._v025_navigateLightbox(1);
            else if (e.key === 's')                           self._v025_saveLightboxImage();
        };
        document.addEventListener('keydown', this._v025_keyHandler);
    }

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this._v025_showLightboxImage(index);
};

SendDownload.prototype._v025_showLightboxImage = function(index) {
    var files   = this._zipTree.filter(function(e) { return !e.dir; });
    var entry   = files[index];
    var nameEl  = document.getElementById('v025-lb-name');
    var countEl = document.getElementById('v025-lb-counter');
    var wrap    = document.getElementById('v025-lb-img-wrap');
    var prevBtn = document.getElementById('v025-lb-prev');
    var nextBtn = document.getElementById('v025-lb-next');

    nameEl.textContent  = entry.name;
    countEl.textContent = (index + 1) + ' / ' + files.length;
    prevBtn.style.visibility = index > 0 ? 'visible' : 'hidden';
    nextBtn.style.visibility = index < files.length - 1 ? 'visible' : 'hidden';

    // Try to reuse thumbnail blob URL
    var thumbEl = this.querySelector('#v025-thumb-' + index);
    var blobUrl = thumbEl ? thumbEl.dataset.blobUrl : null;

    if (blobUrl) {
        wrap.innerHTML = '<img class="v025-lightbox__img" src="' + blobUrl + '" alt="' + this.escapeHtml(entry.name) + '">';
    } else {
        wrap.innerHTML = '<div class="v025-lightbox__loading">Loading...</div>';
        var self = this;
        entry.entry.async('arraybuffer').then(function(buf) {
            var ext  = (entry.name || '').split('.').pop().toLowerCase();
            var mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext);
            var blob = new Blob([buf], { type: mime });
            var url  = URL.createObjectURL(blob);
            self._v025_blobUrls = self._v025_blobUrls || [];
            self._v025_blobUrls.push(url);
            if (self._v025_lightboxIndex === index) {
                wrap.innerHTML = '<img class="v025-lightbox__img" src="' + url + '" alt="' + self.escapeHtml(entry.name) + '">';
            }
        });
    }
};

SendDownload.prototype._v025_navigateLightbox = function(delta) {
    var files = this._zipTree.filter(function(e) { return !e.dir; });
    var next  = this._v025_lightboxIndex + delta;
    if (next < 0 || next >= files.length) return;
    this._v025_lightboxIndex = next;
    this._v025_showLightboxImage(next);
};

SendDownload.prototype._v025_saveLightboxImage = function() {
    var files = this._zipTree.filter(function(e) { return !e.dir; });
    var entry = files[this._v025_lightboxIndex];
    if (!entry) return;

    var self = this;
    entry.entry.async('arraybuffer').then(function(buf) {
        var ext  = (entry.name || '').split('.').pop().toLowerCase();
        var mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext);
        var blob = new Blob([buf], { type: mime });
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

SendDownload.prototype._v025_closeLightbox = function() {
    var overlay = document.getElementById('v025-lightbox');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    if (this._v025_keyHandler) {
        document.removeEventListener('keydown', this._v025_keyHandler);
        this._v025_keyHandler = null;
    }
};

// ─── Cleanup blob URLs ──────────────────────────────────────────────────────
var _prevCleanup = _v022_cleanup;
SendDownload.prototype.cleanup = function() {
    if (this._v025_blobUrls) {
        this._v025_blobUrls.forEach(function(url) { URL.revokeObjectURL(url); });
        this._v025_blobUrls = [];
    }
    this._v025_closeLightbox();
    if (_prevCleanup) _prevCleanup.call(this);
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v025-download-styles')) return;
    var style = document.createElement('style');
    style.id = 'v025-download-styles';
    style.textContent = '\
        /* ── Gallery grid ── */\
        .v025-gallery {\
            display: flex;\
            flex-direction: column;\
            height: 100%;\
        }\
        .v025-gallery__header {\
            display: flex;\
            align-items: center;\
            justify-content: space-between;\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            border-bottom: 1px solid rgba(255,255,255,0.06);\
            flex-shrink: 0;\
        }\
        .v025-gallery__header-left {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v025-gallery__header-right {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v025-gallery__name {\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
        }\
        .v025-gallery__meta {\
            font-size: var(--text-small, 0.8rem);\
            color: var(--color-text-secondary, #8892A0);\
        }\
        .v025-grid {\
            display: grid;\
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem);\
            overflow-y: auto;\
            flex: 1;\
        }\
        .v025-thumb {\
            cursor: pointer;\
            border-radius: var(--radius-md, 8px);\
            overflow: hidden;\
            background: rgba(255,255,255,0.03);\
            border: 1px solid rgba(255,255,255,0.06);\
            transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;\
        }\
        .v025-thumb:hover {\
            border-color: var(--accent, #4ECDC4);\
            transform: translateY(-2px);\
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);\
        }\
        .v025-thumb__img {\
            width: 100%;\
            aspect-ratio: 4/3;\
            background-size: cover;\
            background-position: center;\
            background-color: rgba(255,255,255,0.02);\
            background-repeat: no-repeat;\
        }\
        .v025-thumb__label {\
            padding: var(--space-2, 0.5rem);\
            font-size: var(--text-small, 0.8rem);\
            color: var(--color-text-secondary, #8892A0);\
            white-space: nowrap;\
            overflow: hidden;\
            text-overflow: ellipsis;\
        }\
        \
        /* ── Lightbox ── */\
        .v025-lightbox {\
            position: fixed;\
            inset: 0;\
            z-index: 9999;\
            background: rgba(0, 0, 0, 0.92);\
            display: none;\
            flex-direction: column;\
            align-items: center;\
            justify-content: center;\
        }\
        .v025-lightbox__top {\
            position: absolute;\
            top: 0;\
            left: 0;\
            right: 0;\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: linear-gradient(rgba(0,0,0,0.6), transparent);\
            z-index: 2;\
        }\
        .v025-lightbox__filename {\
            flex: 1;\
            font-size: var(--text-body, 1rem);\
            color: rgba(255,255,255,0.9);\
            white-space: nowrap;\
            overflow: hidden;\
            text-overflow: ellipsis;\
        }\
        .v025-lightbox__counter {\
            font-size: var(--text-small, 0.8rem);\
            color: rgba(255,255,255,0.5);\
        }\
        .v025-lightbox__btn {\
            background: rgba(255,255,255,0.1);\
            border: none;\
            color: rgba(255,255,255,0.8);\
            padding: 6px 10px;\
            border-radius: var(--radius-sm, 4px);\
            cursor: pointer;\
            font-size: 14px;\
            display: flex;\
            align-items: center;\
        }\
        .v025-lightbox__btn:hover {\
            background: rgba(255,255,255,0.2);\
        }\
        .v025-lightbox__close {\
            font-size: 24px;\
            line-height: 1;\
            padding: 4px 10px;\
        }\
        .v025-lightbox__nav {\
            position: absolute;\
            top: 50%;\
            transform: translateY(-50%);\
            background: rgba(255,255,255,0.08);\
            border: none;\
            color: rgba(255,255,255,0.7);\
            padding: 16px 8px;\
            border-radius: var(--radius-md, 8px);\
            cursor: pointer;\
            z-index: 2;\
            transition: background 0.15s;\
        }\
        .v025-lightbox__nav:hover {\
            background: rgba(255,255,255,0.15);\
        }\
        .v025-lightbox__nav--prev { left: var(--space-3, 0.75rem); }\
        .v025-lightbox__nav--next { right: var(--space-3, 0.75rem); }\
        .v025-lightbox__img-wrap {\
            display: flex;\
            align-items: center;\
            justify-content: center;\
            max-width: 90vw;\
            max-height: 80vh;\
            z-index: 1;\
        }\
        .v025-lightbox__img {\
            max-width: 90vw;\
            max-height: 80vh;\
            object-fit: contain;\
            border-radius: var(--radius-md, 8px);\
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);\
        }\
        .v025-lightbox__loading {\
            color: rgba(255,255,255,0.5);\
            font-size: var(--text-body, 1rem);\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-download-v025] Gallery view — thumbnail grid + lightbox for image zips');

})();
