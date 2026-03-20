/* =============================================================================
   SGraph Send — Download Component
   v0.2.8 — Surgical overlay on v0.2.7

   Changes:
     - Gallery thumbnails loaded from _preview folder when available
     - PDF and Markdown files show actual rendered thumbnails instead of icons
     - Video files show first-frame thumbnails instead of generic icons
     - Fallback to v0.2.7 behaviour when _preview folder is absent

   Loads AFTER v0.2.7 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v028] SendDownload not found — skipping');
    return;
}

// ─── Save references to v0.2.7 methods ─────────────────────────────────────
var _v027_setupEvents = SendDownload.prototype.setupEventListeners;

// ─── Find the _preview folder in the zip tree ──────────────────────────────
function findPreviewFolder(zipTree) {
    // Look for _preview or _preview.{hash} folder
    var previewEntries = {};
    var previewDir = null;

    for (var i = 0; i < zipTree.length; i++) {
        var entry = zipTree[i];
        var path  = entry.path || '';

        // Match _preview/ or _preview.{hash}/
        var match = path.match(/^(_preview[^/]*)\//);
        if (match) {
            previewDir = match[1];
            previewEntries[path] = entry;
        }
    }

    return previewDir ? { dir: previewDir, entries: previewEntries } : null;
}

// ─── Load the manifest from _preview folder ────────────────────────────────
function loadManifest(previewInfo) {
    var manifestPath = previewInfo.dir + '/_manifest.json';
    var manifestEntry = previewInfo.entries[manifestPath];
    if (!manifestEntry || !manifestEntry.entry) return Promise.resolve(null);

    return manifestEntry.entry.async('string').then(function(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            console.warn('[v028] Failed to parse manifest:', e.message);
            return null;
        }
    });
}

// ─── Override setupEventListeners to use _preview thumbnails ────────────────
SendDownload.prototype.setupEventListeners = function() {
    var self = this;

    // Check if we're on a gallery page with a zip tree
    if (!this._isGalleryPage() || !this._zipTree) {
        _v027_setupEvents.call(this);
        return;
    }

    // First, call v0.2.7's setup (which handles all event binding)
    _v027_setupEvents.call(this);

    // Then, enhance thumbnails with _preview data
    var previewInfo = findPreviewFolder(this._zipTree);
    if (!previewInfo) {
        console.log('[v028] No _preview folder found — using default thumbnails');
        return;
    }

    // Load the manifest and apply preview thumbnails
    loadManifest(previewInfo).then(function(manifest) {
        if (!manifest || !manifest.files) {
            console.log('[v028] No valid manifest — using default thumbnails');
            return;
        }

        self._v028_applyPreviewThumbnails(manifest, previewInfo);
    });
};

// ─── Helper: check if on gallery page ───────────────────────────────────────
SendDownload.prototype._isGalleryPage = function() {
    return window.location.pathname.indexOf('/gallery') !== -1;
};

// ─── Apply pre-generated thumbnails from _preview folder ────────────────────
SendDownload.prototype._v028_applyPreviewThumbnails = function(manifest, previewInfo) {
    var self  = this;
    var files = this._v027_galleryFiles;
    if (!files || files.length === 0) return;

    // Build a lookup: original file path → manifest entry
    var pathToManifest = {};
    manifest.files.forEach(function(mf) {
        pathToManifest[mf.path] = mf;
    });

    var applied = 0;

    files.forEach(function(fileEntry, idx) {
        var thumbEl = self.querySelector('#v025-thumb-' + idx);
        if (!thumbEl) return;

        // Find the manifest entry for this file
        var mf = pathToManifest[fileEntry.path];
        if (!mf || !mf.thumbnail) return;

        // Get the thumbnail entry from the zip
        var thumbZipEntry = previewInfo.entries[mf.thumbnail];
        if (!thumbZipEntry || !thumbZipEntry.entry) return;

        // Load and display the thumbnail
        thumbZipEntry.entry.async('arraybuffer').then(function(buf) {
            var blob = new Blob([buf], { type: 'image/jpeg' });
            var url  = URL.createObjectURL(blob);
            self._v025_blobUrls = self._v025_blobUrls || [];
            self._v025_blobUrls.push(url);

            // Replace the current thumbnail content with the preview image
            thumbEl.style.backgroundImage = 'url(' + url + ')';
            thumbEl.style.backgroundSize  = 'cover';
            thumbEl.style.backgroundPosition = 'center top';
            thumbEl.dataset.loaded  = 'true';
            thumbEl.dataset.blobUrl = url;

            // Remove icon/badge content for PDF/MD/other types that now have real thumbnails
            // Keep the type badge but remove the SVG icon
            var svgIcon = thumbEl.querySelector('svg');
            if (svgIcon) svgIcon.style.display = 'none';

            var mdPreview = thumbEl.querySelector('.v026-thumb__md-preview');
            if (mdPreview) mdPreview.style.display = 'none';

            // For PDF and MD thumbnails, use 'contain' to show the full page
            if (mf.type === 'pdf' || mf.type === 'markdown') {
                thumbEl.style.backgroundSize = 'contain';
                thumbEl.style.backgroundRepeat = 'no-repeat';
                thumbEl.style.backgroundColor = '#ffffff';
            }

            applied++;
        }).catch(function(err) {
            console.warn('[v028] Failed to load thumbnail for ' + fileEntry.name + ':', err.message);
        });
    });

    console.log('[v028] Preview thumbnails: applying from ' + manifest.thumbnails_generated + ' pre-generated thumbnails');
};

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v028-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v028-download-styles';
    s.textContent = '\
        /* ── Preview thumbnails: white background for document types ── */\
        .v026-thumb__img--doc[style*="background-image"] {\
            border: 1px solid rgba(255,255,255,0.1);\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v028] Gallery uses _preview folder thumbnails for PDF, MD, video');

})();
