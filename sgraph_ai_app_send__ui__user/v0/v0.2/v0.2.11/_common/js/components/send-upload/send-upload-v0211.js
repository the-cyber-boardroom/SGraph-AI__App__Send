/* =============================================================================
   SGraph Send — Upload Component
   v0.2.11 — Surgical overlay on v0.2.10

   Changes:
     - Upload gallery preview: Step 2 (Delivery) shows thumbnail grid of folder
       contents so the sender sees what the recipient will see
     - Images get blob URL thumbnails directly from File objects
     - PDFs show document icon with type badge
     - Markdown files show text preview with badge
     - Compact grid (120px columns) to keep delivery options visible

   Loads AFTER v0.2.10 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0211] SendUpload not found — skipping');
    return;
}

// ─── Store method we override ───────────────────────────────────────────────
var _v0210_renderStep2 = SendUpload.prototype._v023_renderStep2;

// ─── SVG icons for document types ───────────────────────────────────────────
var DOC_ICONS = {
    pdf:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h2a1 1 0 001-1v-1a1 1 0 00-1-1H9v4" stroke-width="1.3"/></svg>',
    markdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h1l1 2 1-2h1" stroke-width="1.3"/></svg>',
    generic:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
};

var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

// ─── Helper: detect file type from extension ────────────────────────────────
function getFileType(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    return 'other';
}

// ─── Helper: build gallery grid HTML ────────────────────────────────────────
function buildGalleryHtml(entries) {
    var files = entries.filter(function(e) { return !e.isDir && e.file; });
    if (files.length === 0) return '';

    var thumbs = files.map(function(entry, idx) {
        var type = getFileType(entry.name);
        var ext  = (entry.name || '').split('.').pop().toUpperCase();
        var imgContent = '';

        if (type === 'image') {
            imgContent = ''; // Will be filled async via blob URL
        } else if (type === 'pdf') {
            imgContent =
                '<div class="v0211-thumb__doc">' +
                    DOC_ICONS.pdf +
                    '<span class="v0211-thumb__badge">PDF</span>' +
                '</div>';
        } else if (type === 'markdown') {
            imgContent =
                '<div class="v0211-thumb__doc">' +
                    '<div class="v0211-thumb__md-text" id="v0211-md-' + idx + '"></div>' +
                    '<span class="v0211-thumb__badge">MD</span>' +
                '</div>';
        } else {
            imgContent =
                '<div class="v0211-thumb__doc">' +
                    DOC_ICONS.generic +
                    '<span class="v0211-thumb__badge">' + ext + '</span>' +
                '</div>';
        }

        return '<div class="v0211-thumb" data-index="' + idx + '" data-type="' + type + '">' +
            '<div class="v0211-thumb__img" id="v0211-thumb-' + idx + '">' + imgContent + '</div>' +
            '<div class="v0211-thumb__label" title="' + (entry.name || '').replace(/"/g, '&quot;') + '">' +
                (entry.name || 'file') +
            '</div>' +
        '</div>';
    }).join('');

    return '<div class="v0211-preview">' +
        '<div class="v0211-preview__header">Preview</div>' +
        '<div class="v0211-grid">' + thumbs + '</div>' +
    '</div>';
}

// ─── Override: Step 2 — add gallery preview ─────────────────────────────────
SendUpload.prototype._v023_renderStep2 = function() {
    var baseHtml = _v0210_renderStep2.call(this);

    // Only add gallery for folder/multi-file uploads (skip if v0.2.12 suppresses it)
    if (!this._folderScan || !this._folderScan.entries || this._v0212_suppressPreview) return baseHtml;

    var galleryHtml = buildGalleryHtml(this._folderScan.entries);
    if (!galleryHtml) return baseHtml;

    // Insert gallery after the file summary, before the step title
    var insertPoint = '<h3 class="v023-step-title">';
    var idx = baseHtml.indexOf(insertPoint);
    if (idx === -1) return baseHtml + galleryHtml;

    return baseHtml.substring(0, idx) + galleryHtml + baseHtml.substring(idx);
};

// ─── Hook into render to load thumbnails after DOM update ────────────────────
var _origRender = SendUpload.prototype.render;
SendUpload.prototype.render = function() {
    _origRender.call(this);
    this._v0211_loadThumbnails();
};

// ─── Thumbnail loader: creates blob URLs from File objects ──────────────────
SendUpload.prototype._v0211_loadThumbnails = function() {
    if (!this._folderScan || !this._folderScan.entries) return;

    var self = this;
    if (!this._v0211_blobUrls) this._v0211_blobUrls = [];

    var files = this._folderScan.entries.filter(function(e) { return !e.isDir && e.file; });

    files.forEach(function(entry, idx) {
        var thumbEl = self.querySelector('#v0211-thumb-' + idx);
        if (!thumbEl || thumbEl.dataset.loaded) return;

        var type = getFileType(entry.name);

        if (type === 'image') {
            // Direct blob URL from the File object — no extraction needed
            var url = URL.createObjectURL(entry.file);
            self._v0211_blobUrls.push(url);
            thumbEl.style.backgroundImage = 'url(' + url + ')';
            thumbEl.dataset.loaded = 'true';
        } else if (type === 'markdown') {
            // Read text content for preview
            var reader = new FileReader();
            reader.onload = function() {
                var preview = self.querySelector('#v0211-md-' + idx);
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
var _origReset = SendUpload.prototype.resetForNew;
SendUpload.prototype.resetForNew = function() {
    if (this._v0211_blobUrls) {
        this._v0211_blobUrls.forEach(function(url) { URL.revokeObjectURL(url); });
        this._v0211_blobUrls = [];
    }
    _origReset.call(this);
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0211-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0211-styles';
    style.textContent = '\
        .v0211-preview {\
            margin: var(--space-3, 0.75rem) 0;\
        }\
        .v0211-preview__header {\
            font-size: 0.75rem;\
            color: rgba(255,255,255,0.4);\
            text-transform: uppercase;\
            letter-spacing: 0.05em;\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v0211-grid {\
            display: grid;\
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));\
            gap: var(--space-2, 0.5rem);\
            align-items: start;\
            align-content: start;\
        }\
        .v0211-thumb {\
            border-radius: var(--radius-md, 8px);\
            overflow: hidden;\
            background: rgba(255,255,255,0.03);\
            border: 1px solid rgba(255,255,255,0.06);\
        }\
        .v0211-thumb__img {\
            width: 100%;\
            aspect-ratio: 1/1;\
            background-size: cover;\
            background-position: center;\
            background-color: rgba(255,255,255,0.02);\
            background-repeat: no-repeat;\
        }\
        .v0211-thumb__label {\
            padding: 4px 6px;\
            font-size: 0.7rem;\
            color: var(--color-text-secondary, #8892A0);\
            white-space: nowrap;\
            overflow: hidden;\
            text-overflow: ellipsis;\
        }\
        .v0211-thumb__doc {\
            width: 100%; height: 100%;\
            display: flex; flex-direction: column;\
            align-items: center; justify-content: center;\
            position: relative; overflow: hidden;\
            color: rgba(255,255,255,0.3);\
        }\
        .v0211-thumb__doc > svg {\
            width: 30%; height: auto; min-width: 32px; opacity: 0.4;\
        }\
        .v0211-thumb__badge {\
            position: absolute; top: 6px; right: 6px;\
            font-size: 0.55rem; font-weight: 700; letter-spacing: 0.05em;\
            padding: 1px 4px; border-radius: 3px;\
            background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5);\
        }\
        .v0211-thumb__md-text {\
            position: absolute; inset: 0;\
            padding: 6px; padding-right: 30px;\
            font-size: 0.5rem; line-height: 1.3;\
            color: rgba(255,255,255,0.35);\
            overflow: hidden; white-space: pre-wrap; word-break: break-word;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0211] Upload gallery preview in Step 2 (Delivery)');

})();
