/* =============================================================================
   SGraph Send — Upload Component
   v0.2.12 — Surgical overlay on v0.2.11

   Changes:
     - Phase 1: Rich Preview — sender-side thumbnail generation for images
     - During zip creation, generates _preview/ folder with:
       - _preview/_manifest.json  — gallery config, file index, metadata
       - _preview/thumbnails/     — 200px-wide JPEG thumbnails per image
       - _preview/metadata/       — per-file metadata JSON (type, size, dimensions)
     - Uses Canvas API (zero dependencies) to resize images client-side
     - All processing happens in the browser — server never sees plaintext
     - Receiver gets instant preview without re-processing full images

   Loads AFTER v0.2.11 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0212] SendUpload not found — skipping');
    return;
}

// ─── Constants ──────────────────────────────────────────────────────────────
var THUMB_MAX_WIDTH  = 200;
var THUMB_QUALITY    = 0.75;      // JPEG quality for thumbnails
var THUMB_FORMAT     = 'image/jpeg';
var MANIFEST_VERSION = '0.1';

var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

// ─── Helper: check if file is an image ──────────────────────────────────────
function isImageFile(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    return IMAGE_EXTS.indexOf(ext) !== -1;
}

// ─── Helper: generate a zero-padded file ID ─────────────────────────────────
function fileId(index) {
    var num = String(index + 1);
    while (num.length < 3) num = '0' + num;
    return 'file-' + num;
}

// ─── Helper: get file extension ─────────────────────────────────────────────
function getExt(name) {
    return (name || '').split('.').pop().toLowerCase();
}

// ─── Helper: detect file category ───────────────────────────────────────────
function getFileCategory(name) {
    var ext = getExt(name);
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].indexOf(ext) !== -1) return 'audio';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].indexOf(ext) !== -1) return 'video';
    if (['txt', 'csv', 'log', 'json', 'xml', 'yaml', 'yml'].indexOf(ext) !== -1) return 'text';
    if (['js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'html', 'sh'].indexOf(ext) !== -1) return 'code';
    return 'other';
}

// ─── Core: generate thumbnail from image File → JPEG ArrayBuffer ────────────
function generateImageThumbnail(file) {
    return new Promise(function(resolve, reject) {
        // SVGs don't need thumbnailing — they're already tiny vectors
        var ext = getExt(file.name);
        if (ext === 'svg') {
            file.arrayBuffer().then(function(buf) {
                resolve({ buffer: buf, width: 0, height: 0, originalWidth: 0, originalHeight: 0, format: 'image/svg+xml' });
            }).catch(reject);
            return;
        }

        var url = URL.createObjectURL(file);
        var img = new Image();

        img.onload = function() {
            var origW = img.naturalWidth;
            var origH = img.naturalHeight;

            // Calculate scaled dimensions (max width = THUMB_MAX_WIDTH, preserve aspect ratio)
            var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
            var thumbW = Math.round(origW * scale);
            var thumbH = Math.round(origH * scale);

            // Draw to canvas
            var canvas = document.createElement('canvas');
            canvas.width  = thumbW;
            canvas.height = thumbH;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, thumbW, thumbH);

            // Export as JPEG blob
            canvas.toBlob(function(blob) {
                URL.revokeObjectURL(url);
                if (!blob) {
                    reject(new Error('Canvas toBlob failed for ' + file.name));
                    return;
                }
                blob.arrayBuffer().then(function(buf) {
                    resolve({
                        buffer:         buf,
                        width:          thumbW,
                        height:         thumbH,
                        originalWidth:  origW,
                        originalHeight: origH,
                        format:         THUMB_FORMAT
                    });
                }).catch(reject);
            }, THUMB_FORMAT, THUMB_QUALITY);
        };

        img.onerror = function() {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image: ' + file.name));
        };

        img.src = url;
    });
}

// ─── Core: build _preview/ folder contents and add to zip ───────────────────
function addPreviewToZip(zip, entries) {
    // Filter to actual files (not directories)
    var files = entries.filter(function(e) { return !e.isDir && e.file; });
    if (files.length === 0) return Promise.resolve();

    var manifest = {
        version:           MANIFEST_VERSION,
        preview_enabled:   true,
        generated_at:      new Date().toISOString(),
        thumbnail_max_width: THUMB_MAX_WIDTH,
        thumbnail_format:  THUMB_FORMAT,
        thumbnail_quality: THUMB_QUALITY,
        total_files:       files.length,
        files:             []
    };

    // Process all files — generate thumbnails for images, metadata for all
    var promises = files.map(function(entry, idx) {
        var id       = fileId(idx);
        var category = getFileCategory(entry.name);
        var ext      = getExt(entry.name);

        // Base metadata for every file
        var meta = {
            id:        id,
            name:      entry.name,
            path:      entry.path,
            type:      category,
            extension: ext,
            size:      entry.file.size,
            mime:      entry.file.type || 'application/octet-stream'
        };

        // Manifest entry
        var manifestEntry = {
            id:        id,
            name:      entry.name,
            path:      entry.path,
            type:      category,
            size:      entry.file.size,
            thumbnail: null,
            metadata:  '_preview/metadata/' + id + '.meta.json'
        };

        // For images: generate thumbnail + extract dimensions
        if (category === 'image') {
            return generateImageThumbnail(entry.file).then(function(result) {
                // Add thumbnail to zip
                var thumbExt = ext === 'svg' ? 'svg' : 'jpg';
                var thumbPath = '_preview/thumbnails/' + id + '.thumb.' + thumbExt;
                zip.file(thumbPath, result.buffer);

                // Enrich metadata with dimensions
                meta.dimensions = {
                    width:  result.originalWidth,
                    height: result.originalHeight
                };
                meta.thumbnail = {
                    path:   thumbPath,
                    width:  result.width,
                    height: result.height,
                    format: result.format,
                    size:   result.buffer.byteLength
                };

                manifestEntry.thumbnail = thumbPath;

                // Add metadata JSON to zip
                zip.file('_preview/metadata/' + id + '.meta.json',
                    JSON.stringify(meta, null, 2));

                return manifestEntry;
            }).catch(function(err) {
                // Thumbnail generation failed — still include metadata without thumbnail
                console.warn('[v0212] Thumbnail failed for ' + entry.name + ':', err.message);
                zip.file('_preview/metadata/' + id + '.meta.json',
                    JSON.stringify(meta, null, 2));
                return manifestEntry;
            });
        }

        // For non-images: just metadata (Phase 2+ will add PDF/MD thumbnails)
        zip.file('_preview/metadata/' + id + '.meta.json',
            JSON.stringify(meta, null, 2));
        return Promise.resolve(manifestEntry);
    });

    return Promise.all(promises).then(function(manifestEntries) {
        manifest.files = manifestEntries;

        // Count files by type
        var typeCounts = {};
        manifestEntries.forEach(function(e) {
            typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
        });
        manifest.type_counts = typeCounts;

        // Count thumbnails generated
        manifest.thumbnails_generated = manifestEntries.filter(function(e) {
            return e.thumbnail !== null;
        }).length;

        // Write manifest
        zip.file('_preview/_manifest.json', JSON.stringify(manifest, null, 2));

        console.log('[v0212] Preview generated: ' +
            manifest.thumbnails_generated + ' thumbnails for ' +
            manifest.total_files + ' files');
    });
}

// ─── Override: _startFolderZip — inject preview generation ──────────────────
var _origStartFolderZip = SendUpload.prototype._startFolderZip;

SendUpload.prototype._startFolderZip = async function() {
    // Read current option values from the DOM (same as base)
    var levelSelect      = this.querySelector('#folder-compression');
    var includeEmptyChk  = this.querySelector('#folder-include-empty');
    var includeHiddenChk = this.querySelector('#folder-include-hidden');

    this._folderOptions = {
        level:         levelSelect      ? parseInt(levelSelect.value, 10) : 4,
        includeEmpty:  includeEmptyChk  ? includeEmptyChk.checked : false,
        includeHidden: includeHiddenChk ? includeHiddenChk.checked : false
    };

    // Check total size
    var totalSize = this._folderScan.totalSize;
    if (totalSize > SendUpload.MAX_FILE_SIZE) {
        this.errorMessage = this.t('upload.folder.error_too_large', {
            limit: this.formatBytes(SendUpload.MAX_FILE_SIZE)
        });
        this.state = 'error'; this.render(); this.setupEventListeners();
        return;
    }

    try {
        this.state = 'zipping'; this.render();

        // Lazy-load JSZip
        await this._loadJSZip();

        var opts    = this._folderOptions;
        var entries = this._folderScan.entries.filter(function(e) {
            if (!opts.includeHidden && e.name.startsWith('.')) return false;
            if (e.isDir && !opts.includeEmpty) return false;
            return true;
        });

        var zip = new JSZip();

        // Add original files (same as base v0.2.0)
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isDir) {
                zip.folder(entry.path);
            } else {
                var buffer = await entry.file.arrayBuffer();
                zip.file(entry.path, buffer);
            }
        }

        // ═══ v0.2.12: Generate _preview/ folder with thumbnails ═══
        await addPreviewToZip(zip, entries);

        var compression = opts.level === 0 ? 'STORE' : 'DEFLATE';
        var zipBlob = await zip.generateAsync({
            type:               'blob',
            compression:        compression,
            compressionOptions: { level: opts.level }
        });

        // Feed into existing pipeline as a File object
        this.selectedFile = new File(
            [zipBlob],
            this._folderName + '.zip',
            { type: 'application/zip' }
        );

        // Clear folder state and go straight to upload
        this._folderScan = null;
        this.state = 'idle';
        this.startUpload();
    } catch (err) {
        this.errorMessage = err.message || this.t('upload.folder.error_zip_failed');
        this.state = 'error'; this.render(); this.setupEventListeners();
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// UX: Gallery preview shown AFTER user selects "Gallery" delivery option
// ═══════════════════════════════════════════════════════════════════════════

// ─── Remove v0.2.11 general preview from Step 2 ────────────────────────────
// v0.2.11 shows thumbnails for ALL delivery options. We override to only
// show the preview when the user specifically selects Gallery.
var _v0211_renderStep2 = SendUpload.prototype._v023_renderStep2;

SendUpload.prototype._v023_renderStep2 = function() {
    // If we're in gallery preview mode, render the gallery preview instead
    if (this._v0212_galleryPreview) {
        return this._v0212_renderGalleryPreview();
    }
    // Otherwise call v0.2.11's Step 2 but suppress its gallery
    // We temporarily null out _folderScan so v0.2.11 skips its preview grid
    var savedScan = this._folderScan;
    this._folderScan = null;
    var html = _v0211_renderStep2.call(this);
    this._folderScan = savedScan;
    return html;
};

// ─── Render the gallery preview page ────────────────────────────────────────
SendUpload.prototype._v0212_renderGalleryPreview = function() {
    var entries = this._v0212_savedScan ? this._v0212_savedScan.entries : [];
    var files = entries.filter(function(e) { return !e.isDir && e.file; });

    // Build thumbnail grid
    var thumbs = files.map(function(entry, idx) {
        var ext = (entry.name || '').split('.').pop().toLowerCase();
        var isImage = IMAGE_EXTS.indexOf(ext) !== -1;

        var imgContent = '';
        if (isImage) {
            imgContent = ''; // Filled async via blob URL
        } else if (ext === 'pdf') {
            imgContent =
                '<div class="v0212-gp-thumb__doc">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h2a1 1 0 001-1v-1a1 1 0 00-1-1H9v4" stroke-width="1.3"/></svg>' +
                    '<span class="v0212-gp-thumb__badge">PDF</span>' +
                '</div>';
        } else if (ext === 'md' || ext === 'markdown') {
            imgContent =
                '<div class="v0212-gp-thumb__doc">' +
                    '<div class="v0212-gp-md-text" id="v0212-md-' + idx + '"></div>' +
                    '<span class="v0212-gp-thumb__badge">MD</span>' +
                '</div>';
        } else {
            imgContent =
                '<div class="v0212-gp-thumb__doc">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                    '<span class="v0212-gp-thumb__badge">' + ext.toUpperCase() + '</span>' +
                '</div>';
        }

        return '<div class="v0212-gp-thumb">' +
            '<div class="v0212-gp-thumb__img" id="v0212-gp-thumb-' + idx + '">' + imgContent + '</div>' +
            '<div class="v0212-gp-thumb__label" title="' + (entry.name || '').replace(/"/g, '&quot;') + '">' +
                (entry.name || 'file') +
            '</div>' +
        '</div>';
    }).join('');

    return '<div class="v0212-gallery-preview">' +
        '<div class="v0212-gp-notice">' +
            '<svg class="v0212-gp-notice__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
                '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
                '<circle cx="8.5" cy="8.5" r="1.5"/>' +
                '<path d="M21 15l-5-5L5 21"/>' +
            '</svg>' +
            '<span>This is what the gallery will look like for the recipient</span>' +
        '</div>' +
        '<div class="v0212-gp-grid">' + thumbs + '</div>' +
        '<div class="v0212-gp-actions">' +
            '<button class="v0212-gp-btn v0212-gp-btn--back" id="v0212-gp-back">' +
                'Choose different delivery' +
            '</button>' +
            '<button class="v0212-gp-btn v0212-gp-btn--continue" id="v0212-gp-continue">' +
                'Continue with gallery' +
            '</button>' +
        '</div>' +
    '</div>';
};

// ─── Override setupEventListeners to handle gallery card click ───────────────
var _v0211_setupListeners = SendUpload.prototype.setupEventListeners;

SendUpload.prototype.setupEventListeners = function() {
    _v0211_setupListeners.call(this);
    var self = this;

    // Intercept gallery delivery card click
    var galleryCard = this.querySelector('[data-delivery="gallery"]');
    if (galleryCard && !this._v0212_galleryPreview) {
        // Clone and replace to remove v0.2.3's click handler
        var newCard = galleryCard.cloneNode(true);
        galleryCard.parentNode.replaceChild(newCard, galleryCard);

        newCard.addEventListener('click', function() {
            self._v0212_galleryPreview = true;
            self._v023_selectedDelivery = 'gallery';
            // Save folder scan for the preview (render might clear it)
            self._v0212_savedScan = self._folderScan;
            self.render();
            self.setupEventListeners();
        });
    }

    // Gallery preview: load thumbnails + wire buttons
    if (this._v0212_galleryPreview) {
        this._v0212_loadGalleryThumbnails();

        var backBtn = this.querySelector('#v0212-gp-back');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                self._v0212_galleryPreview = false;
                self._v023_selectedDelivery = null;
                self.render();
                self.setupEventListeners();
            });
        }

        var continueBtn = this.querySelector('#v0212-gp-continue');
        if (continueBtn) {
            continueBtn.addEventListener('click', function() {
                self._v0212_galleryPreview = false;
                // Proceed to Step 3 (share mode) with gallery selected
                self.state = 'choosing-share';
                self.render();
                self.setupEventListeners();
            });
        }
    }
};

// ─── Load thumbnails for gallery preview ────────────────────────────────────
SendUpload.prototype._v0212_loadGalleryThumbnails = function() {
    var entries = this._v0212_savedScan ? this._v0212_savedScan.entries : [];
    var files = entries.filter(function(e) { return !e.isDir && e.file; });
    var self = this;

    if (!this._v0212_blobUrls) this._v0212_blobUrls = [];

    files.forEach(function(entry, idx) {
        var thumbEl = self.querySelector('#v0212-gp-thumb-' + idx);
        if (!thumbEl || thumbEl.dataset.loaded) return;

        var ext = (entry.name || '').split('.').pop().toLowerCase();
        var isImage = IMAGE_EXTS.indexOf(ext) !== -1;

        if (isImage) {
            var url = URL.createObjectURL(entry.file);
            self._v0212_blobUrls.push(url);
            thumbEl.style.backgroundImage = 'url(' + url + ')';
            thumbEl.dataset.loaded = 'true';
        } else if (ext === 'md' || ext === 'markdown') {
            var reader = new FileReader();
            reader.onload = function() {
                var preview = self.querySelector('#v0212-md-' + idx);
                if (preview) {
                    var clean = (reader.result || '')
                        .replace(/^#+\s*/gm, '')
                        .replace(/[*_`~\[\]]/g, '')
                        .trim();
                    preview.textContent = clean.substring(0, 200);
                }
                thumbEl.dataset.loaded = 'true';
            };
            reader.readAsText(entry.file);
        } else {
            thumbEl.dataset.loaded = 'true';
        }
    });
};

// ─── Clean up blob URLs on reset ────────────────────────────────────────────
var _v0211_reset = SendUpload.prototype.resetForNew;
SendUpload.prototype.resetForNew = function() {
    if (this._v0212_blobUrls) {
        this._v0212_blobUrls.forEach(function(url) { URL.revokeObjectURL(url); });
        this._v0212_blobUrls = [];
    }
    this._v0212_galleryPreview = false;
    this._v0212_savedScan = null;
    _v0211_reset.call(this);
};

// ─── Styles for gallery preview ─────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0212-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0212-styles';
    style.textContent = '\
        .v0212-gallery-preview {\
            padding: var(--space-4, 1rem) 0;\
        }\
        .v0212-gp-notice {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem) var(--space-5, 1.25rem);\
            margin-bottom: var(--space-5, 1.25rem);\
            background: rgba(77, 208, 225, 0.08);\
            border: 1px solid rgba(77, 208, 225, 0.2);\
            border-radius: var(--radius-lg, 12px);\
            color: rgba(255, 255, 255, 0.8);\
            font-size: 0.9rem;\
            line-height: 1.4;\
        }\
        .v0212-gp-notice__icon {\
            width: 24px;\
            height: 24px;\
            flex-shrink: 0;\
            color: rgba(77, 208, 225, 0.7);\
        }\
        .v0212-gp-grid {\
            display: grid;\
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));\
            gap: var(--space-3, 0.75rem);\
            margin-bottom: var(--space-5, 1.25rem);\
        }\
        .v0212-gp-thumb {\
            border-radius: var(--radius-md, 8px);\
            overflow: hidden;\
            background: rgba(255,255,255,0.03);\
            border: 1px solid rgba(255,255,255,0.06);\
            transition: border-color 0.15s;\
        }\
        .v0212-gp-thumb:hover {\
            border-color: rgba(255,255,255,0.12);\
        }\
        .v0212-gp-thumb__img {\
            width: 100%;\
            aspect-ratio: 1/1;\
            background-size: cover;\
            background-position: center;\
            background-color: rgba(255,255,255,0.02);\
            background-repeat: no-repeat;\
        }\
        .v0212-gp-thumb__label {\
            padding: 6px 8px;\
            font-size: 0.72rem;\
            color: var(--color-text-secondary, #8892A0);\
            white-space: nowrap;\
            overflow: hidden;\
            text-overflow: ellipsis;\
        }\
        .v0212-gp-thumb__doc {\
            width: 100%; height: 100%;\
            display: flex; flex-direction: column;\
            align-items: center; justify-content: center;\
            position: relative; overflow: hidden;\
            color: rgba(255,255,255,0.3);\
        }\
        .v0212-gp-thumb__doc > svg {\
            width: 30%; height: auto; min-width: 32px; opacity: 0.4;\
        }\
        .v0212-gp-thumb__badge {\
            position: absolute; top: 6px; right: 6px;\
            font-size: 0.55rem; font-weight: 700; letter-spacing: 0.05em;\
            padding: 1px 4px; border-radius: 3px;\
            background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5);\
        }\
        .v0212-gp-md-text {\
            position: absolute; inset: 0;\
            padding: 6px; padding-right: 30px;\
            font-size: 0.5rem; line-height: 1.3;\
            color: rgba(255,255,255,0.35);\
            overflow: hidden; white-space: pre-wrap; word-break: break-word;\
        }\
        .v0212-gp-actions {\
            display: flex;\
            gap: var(--space-3, 0.75rem);\
            justify-content: center;\
        }\
        .v0212-gp-btn {\
            padding: var(--space-3, 0.75rem) var(--space-5, 1.25rem);\
            border-radius: var(--radius-md, 8px);\
            font-size: 0.85rem;\
            font-weight: 600;\
            cursor: pointer;\
            border: none;\
            transition: background 0.15s, opacity 0.15s;\
        }\
        .v0212-gp-btn--back {\
            background: rgba(255,255,255,0.06);\
            color: rgba(255,255,255,0.6);\
        }\
        .v0212-gp-btn--back:hover {\
            background: rgba(255,255,255,0.1);\
            color: rgba(255,255,255,0.8);\
        }\
        .v0212-gp-btn--continue {\
            background: var(--color-accent, #4DD0E1);\
            color: var(--color-bg, #1a2332);\
        }\
        .v0212-gp-btn--continue:hover {\
            opacity: 0.9;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0212] Rich preview — Phase 1: image thumbnails + gallery preview UX');

})();
