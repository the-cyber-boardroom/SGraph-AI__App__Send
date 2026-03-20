/* =============================================================================
   SGraph Send — Download Component
   v0.2.9 — Surgical overlay on v0.2.8

   Changes:
     - Gallery: distinctive file type icons (not just generic doc icon)
     - Gallery: large view layout fix for multiple rows
     - Folder view: filter _preview* folders from auto-select first file
     - Folder view: hide _preview* folders from folder tree
     - Hash fragment preserved after decrypt (simple key not removed from URL)
     - Print: opens clean print window for markdown (beautiful A4 output)

   Loads AFTER v0.2.8 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v029] SendDownload not found — skipping');
    return;
}

// ─── File type SVG icons — distinctive per type ─────────────────────────────
var TYPE_ICONS = {
    pdf: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#E8384820" stroke="#E83848" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#E83848" stroke-width="1.5" stroke-linecap="round"/>' +
        '<text x="24" y="34" text-anchor="middle" font-size="11" font-weight="700" fill="#E83848" font-family="system-ui">PDF</text>' +
        '</svg>',

    markdown: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#7C4DFF20" stroke="#7C4DFF" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#7C4DFF" stroke-width="1.5" stroke-linecap="round"/>' +
        '<text x="24" y="34" text-anchor="middle" font-size="10" font-weight="700" fill="#7C4DFF" font-family="system-ui">MD</text>' +
        '</svg>',

    text: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#90A4AE20" stroke="#90A4AE" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#90A4AE" stroke-width="1.5" stroke-linecap="round"/>' +
        '<line x1="14" y1="22" x2="34" y2="22" stroke="#90A4AE" stroke-width="1.2"/>' +
        '<line x1="14" y1="27" x2="30" y2="27" stroke="#90A4AE" stroke-width="1.2"/>' +
        '<line x1="14" y1="32" x2="26" y2="32" stroke="#90A4AE" stroke-width="1.2"/>' +
        '</svg>',

    code: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#00BCD420" stroke="#00BCD4" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#00BCD4" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M20 23l-5 4 5 4M28 23l5 4-5 4" stroke="#00BCD4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>',

    json: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#FF980020" stroke="#FF9800" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#FF9800" stroke-width="1.5" stroke-linecap="round"/>' +
        '<text x="24" y="33" text-anchor="middle" font-size="9" font-weight="700" fill="#FF9800" font-family="system-ui">{ }</text>' +
        '</svg>',

    html: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#FF572220" stroke="#FF5722" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#FF5722" stroke-width="1.5" stroke-linecap="round"/>' +
        '<text x="24" y="33" text-anchor="middle" font-size="8" font-weight="700" fill="#FF5722" font-family="system-ui">&lt;/&gt;</text>' +
        '</svg>',

    image: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#4CAF5020" stroke="#4CAF50" stroke-width="1.5"/>' +
        '<circle cx="19" cy="18" r="3" stroke="#4CAF50" stroke-width="1.3"/>' +
        '<path d="M6 34l10-8 6 5 6-4 14 10" stroke="#4CAF50" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>',

    audio: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#9C27B020" stroke="#9C27B0" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#9C27B0" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M20 32V20l10-3v12" stroke="#9C27B0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="17.5" cy="33" r="2.5" stroke="#9C27B0" stroke-width="1.3"/>' +
        '<circle cx="27.5" cy="30" r="2.5" stroke="#9C27B0" stroke-width="1.3"/>' +
        '</svg>',

    video: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#F4433620" stroke="#F44336" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#F44336" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M19 21v10l9-5z" fill="#F44336"/>' +
        '</svg>',

    other: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="2" width="36" height="44" rx="3" fill="#546E7A20" stroke="#546E7A" stroke-width="1.5"/>' +
        '<path d="M30 2v12h12" stroke="#546E7A" stroke-width="1.5" stroke-linecap="round"/>' +
        '</svg>'
};

// ─── Extended file type detection ───────────────────────────────────────────
var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
var CODE_EXTS  = ['js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'sh', 'bash', 'zsh'];
var AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
var VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

function getDetailedType(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'json') return 'json';
    if (ext === 'html' || ext === 'htm') return 'html';
    if (CODE_EXTS.indexOf(ext) !== -1) return 'code';
    if (ext === 'txt' || ext === 'csv' || ext === 'log' || ext === 'xml' || ext === 'yaml' || ext === 'yml') return 'text';
    if (AUDIO_EXTS.indexOf(ext) !== -1) return 'audio';
    if (VIDEO_EXTS.indexOf(ext) !== -1) return 'video';
    return 'other';
}

// Map detailed type back to gallery type (for lightbox routing)
function getGalleryType(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    return 'other';
}

function getTypeIcon(name) {
    var dtype = getDetailedType(name);
    return TYPE_ICONS[dtype] || TYPE_ICONS.other;
}

// ─── Save references ────────────────────────────────────────────────────────
var _v028_renderGallery = SendDownload.prototype._v027_renderGallery;
var _v028_setupEvents   = SendDownload.prototype.setupEventListeners;

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Gallery renderer — use distinctive file type icons
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v027_renderGallery = function(files, timingHtml, sendAnotherHtml) {
    // Call v0.2.7's gallery renderer to get the base HTML
    var html = _v028_renderGallery.call(this, files, timingHtml, sendAnotherHtml);

    // Replace the generic SVG icons in non-image thumbnails with type-specific ones
    // The v0.2.7 renderer uses v026-thumb__img--doc with inline SVG for non-image types.
    // We post-process the HTML to swap icons.
    // This is done in setupEventListeners instead (DOM manipulation).

    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: setupEventListeners — replace icons + handle _preview filter
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype.setupEventListeners = function() {
    _v028_setupEvents.call(this);
    var self = this;

    // ── Replace generic doc icons with type-specific coloured icons ──
    var files = this._v027_galleryFiles;
    if (files && files.length > 0) {
        files.forEach(function(entry, idx) {
            var thumbEl = self.querySelector('#v025-thumb-' + idx);
            if (!thumbEl) return;

            var galleryType = getGalleryType(entry.name);
            if (galleryType === 'image') return; // Images get blob thumbnails, not icons

            var detailedType = getDetailedType(entry.name);
            var icon = TYPE_ICONS[detailedType] || TYPE_ICONS.other;

            // Only replace if it's a doc-style thumbnail (has the v026-thumb__img--doc class)
            if (thumbEl.classList.contains('v026-thumb__img--doc')) {
                // Replace the SVG icon but keep the badge and md-preview
                var existingSvg = thumbEl.querySelector('svg');
                if (existingSvg) {
                    var iconWrapper = document.createElement('div');
                    iconWrapper.className = 'v029-type-icon';
                    iconWrapper.innerHTML = icon;
                    existingSvg.replaceWith(iconWrapper);
                }
            }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Filter _preview* from auto-select first file in folder view
// ═══════════════════════════════════════════════════════════════════════════

var _origParseZip = SendDownload.prototype._parseZip;

SendDownload.prototype._parseZip = function(bytes) {
    return _origParseZip.call(this, bytes).then(function(result) {
        // Store the original tree for folder browser (it needs _preview for completeness)
        // But we'll override the "first file" selection logic below
        return result;
    });
};

// Override render to fix the auto-select after zip parse
var _v029_origRender = SendDownload.prototype.render;
SendDownload.prototype.render = function() {
    _v029_origRender.call(this);

    // After render, if we're in zip mode and the selected file is in _preview,
    // re-select the first non-preview file
    if (this._zipTree && this._selectedZipPath) {
        if (this._selectedZipPath.indexOf('_preview') === 0 ||
            this._selectedZipPath.indexOf('/_preview') !== -1) {
            var firstReal = this._zipTree.find(function(e) {
                if (e.dir) return false;
                if (e.path.indexOf('_preview') === 0) return false;
                if (e.path.indexOf('/_preview') !== -1) return false;
                var name = e.name || '';
                if (name.charAt(0) === '.') return false;
                if (e.path.indexOf('__MACOSX') !== -1) return false;
                return true;
            });
            if (firstReal) {
                this._selectedZipPath = firstReal.path;
                var parts = firstReal.path.split('/');
                this._selectedZipFolder = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
                this._previewZipEntry(firstReal.path);
            }
        }
    }
};

// ─── Also hide _preview* folders from the folder tree ───────────────────────
var _origBuildFolderStructure = SendDownload.prototype._buildFolderStructure;

SendDownload.prototype._buildFolderStructure = function() {
    var result = _origBuildFolderStructure.call(this);

    // Filter out _preview* entries from the tree
    function filterPreview(node) {
        if (!node || !node.children) return node;
        node.children = node.children.filter(function(child) {
            var name = child.name || '';
            if (name.indexOf('_preview') === 0) return false;
            return true;
        });
        node.children.forEach(filterPreview);
        return node;
    }

    // result can be an object with children property or an array
    if (result && result.children) {
        filterPreview(result);
    }
    return result;
};

// Also filter _preview from file listing
var _origRenderFileList = SendDownload.prototype._renderFileList;

SendDownload.prototype._renderFileList = function(folderPath) {
    var html = _origRenderFileList.call(this, folderPath);
    // If the current folder IS a _preview folder, show it but add a note
    // Otherwise, this is handled by the tree filter above
    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Preserve hash fragment after decrypt (simple key stays in URL)
// ═══════════════════════════════════════════════════════════════════════════

// The base send-download.js strips the hash at line 1000-1001 after decryption.
// v0.2.7 patches history.replaceState during render(), but the hash stripping
// happens AFTER render in the decrypt completion flow. We need a broader fix.

// Save the current hash before any replaceState can strip it
var _savedHash = window.location.hash;

// Listen for hashchange to track the latest hash
window.addEventListener('hashchange', function() {
    if (window.location.hash) _savedHash = window.location.hash;
});

// Broader patch: always preserve hash for friendly token URLs
var _origReplace = history.replaceState;
var _v029_patchedReplace = history.replaceState;

// Check if v0.2.7 already patched — if so, we enhance its patch
// The key issue: base code calls history.replaceState(null, '', pathname+search)
// which strips the hash. We intercept and add the hash back.
(function() {
    var origReplace = history.replaceState.bind(history);
    history.replaceState = function(state, title, url) {
        if (url && _savedHash) {
            var urlStr = String(url);
            // If the URL strips the hash and we had one, add it back
            if (urlStr.indexOf('#') === -1 && _savedHash.length > 1) {
                // Only preserve for friendly token patterns (word-word-NNNN)
                var hashContent = _savedHash.substring(1);
                if (/^[a-z]+-[a-z]+-\d+/i.test(hashContent)) {
                    url = urlStr + _savedHash;
                }
            }
        }
        return origReplace(state, title, url);
    };
})();

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: Print-friendly markdown — opens clean print window
// ═══════════════════════════════════════════════════════════════════════════

var PRINT_STYLES = '\
    *, *::before, *::after { box-sizing: border-box; }\
    body {\
        font-family: "DM Sans", system-ui, -apple-system, sans-serif;\
        font-size: 11pt; line-height: 1.6; color: #1a1a1a; background: #fff;\
        margin: 0; padding: 2cm 2.5cm; word-wrap: break-word;\
    }\
    .print-header {\
        display: flex; align-items: center; gap: 8px;\
        padding-bottom: 0.5em; margin-bottom: 1.5em;\
        border-bottom: 2px solid #4ECDC4; color: #888; font-size: 9pt;\
    }\
    .print-header b { color: #555; }\
    .print-header .print-filename {\
        margin-left: auto; font-style: italic; color: #999;\
    }\
    h1, h2, h3, h4, h5, h6 { color: #111; margin: 1.5em 0 0.5em; line-height: 1.3; page-break-after: avoid; }\
    h1 { font-size: 1.6em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3em; }\
    h2 { font-size: 1.35em; }\
    h3 { font-size: 1.15em; }\
    p { margin: 0.8em 0; orphans: 3; widows: 3; }\
    a { color: #0066cc; text-decoration: none; }\
    code {\
        font-family: "JetBrains Mono", "SF Mono", Consolas, monospace;\
        font-size: 0.88em; background: #f5f5f5; padding: 0.15em 0.4em;\
        border-radius: 3px; color: #d63384;\
    }\
    pre {\
        background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px;\
        padding: 0.8em 1em; overflow-x: auto; margin: 1em 0;\
        page-break-inside: avoid;\
    }\
    pre code { background: none; padding: 0; color: #333; font-size: 0.85em; }\
    blockquote {\
        border-left: 3px solid #ccc; margin: 1em 0; padding: 0.5em 1em;\
        background: #fafafa; color: #555; page-break-inside: avoid;\
    }\
    ul, ol { padding-left: 1.5em; margin: 0.8em 0; }\
    li { margin: 0.3em 0; }\
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }\
    table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }\
    th, td { border: 1px solid #ddd; padding: 0.4em 0.75em; text-align: left; font-size: 0.95em; }\
    th { background: #f5f5f5; font-weight: 600; color: #111; }\
    strong { color: #111; }\
    del { color: #999; }\
    img { max-width: 100%; page-break-inside: avoid; }\
    .print-footer {\
        margin-top: 2em; padding-top: 0.5em;\
        border-top: 1px solid #e0e0e0; color: #bbb; font-size: 8pt;\
        display: flex; justify-content: space-between;\
    }\
    @page { margin: 0; size: A4; }\
';

function openPrintWindow(htmlContent, filename) {
    var printDoc = '<!DOCTYPE html><html><head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + (filename || 'Document') + '</title>' +
        '<style>' + PRINT_STYLES + '</style>' +
        '</head><body>' +
        '<div class="print-header">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
            '<span>SG/<b>Send</b></span>' +
            '<span class="print-filename">' + (filename || '') + '</span>' +
        '</div>' +
        htmlContent +
        '<div class="print-footer">' +
            '<span>SG/Send &mdash; sgraph.ai</span>' +
            '<span>Printed ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + '</span>' +
        '</div>' +
        '</body></html>';

    var w = window.open('', '_blank');
    if (!w) {
        // Popup blocked — fall back to window.print()
        window.print();
        return;
    }
    w.document.write(printDoc);
    w.document.close();
    // Wait for fonts/styles to load
    setTimeout(function() {
        w.print();
        // Close after print dialog (some browsers fire onafterprint, some don't)
        w.onafterprint = function() { w.close(); };
    }, 300);
}

// Override lightbox print button — prints markdown beautifully
var _v029_setupLightbox = SendDownload.prototype._v025_openLightbox;
var _v029_lightboxPatched = false;

SendDownload.prototype._v025_openLightbox = function(index) {
    _v029_setupLightbox.call(this, index);

    // Patch the print button once after the lightbox is created
    if (!_v029_lightboxPatched) {
        _v029_lightboxPatched = true;
        var lbPrint = document.getElementById('v027-lb-print');
        if (lbPrint) {
            // Replace the event listener
            var newBtn = lbPrint.cloneNode(true);
            lbPrint.parentNode.replaceChild(newBtn, lbPrint);
            newBtn.addEventListener('click', function() {
                var mdEl = document.querySelector('.v027-lightbox__md');
                if (mdEl) {
                    var nameEl = document.getElementById('v025-lb-name');
                    var filename = nameEl ? nameEl.textContent : '';
                    openPrintWindow(mdEl.innerHTML, filename);
                } else {
                    // Not markdown — fallback to window.print()
                    window.print();
                }
            });
        }
    }
};

// Override gallery print button — if lightbox is open with markdown, print that
var _v029_gallerySetup = SendDownload.prototype.setupEventListeners;
SendDownload.prototype.setupEventListeners = function() {
    _v029_gallerySetup.call(this);

    var galleryPrint = this.querySelector('#v026-print-btn');
    if (galleryPrint) {
        // Replace the event listener
        var newBtn = galleryPrint.cloneNode(true);
        galleryPrint.parentNode.replaceChild(newBtn, galleryPrint);
        newBtn.addEventListener('click', function() {
            // If lightbox is open with markdown, print that
            var mdEl = document.querySelector('.v027-lightbox__md');
            if (mdEl) {
                var nameEl = document.getElementById('v025-lb-name');
                var filename = nameEl ? nameEl.textContent : '';
                openPrintWindow(mdEl.innerHTML, filename);
            } else {
                window.print();
            }
        });
    }
};

// Also handle the single-file markdown view (download page with iframe)
// When printing from the download page, extract iframe content
(function() {
    // Listen for Ctrl+P / Cmd+P on the page and intercept if markdown is showing
    window.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            var mdEl = document.querySelector('.v027-lightbox__md');
            if (mdEl) {
                e.preventDefault();
                var nameEl = document.getElementById('v025-lb-name');
                var filename = nameEl ? nameEl.textContent : '';
                openPrintWindow(mdEl.innerHTML, filename);
                return;
            }
            // Single-file markdown iframe
            var iframe = document.getElementById('md-iframe');
            if (iframe) {
                e.preventDefault();
                try {
                    var iframeBody = iframe.contentDocument || iframe.contentWindow.document;
                    var content = iframeBody.body.innerHTML;
                    var titleEl = document.querySelector('.filename') || document.querySelector('h1');
                    var filename = titleEl ? titleEl.textContent : '';
                    openPrintWindow(content, filename);
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
    if (document.getElementById('v029-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v029-download-styles';
    s.textContent = '\
        /* ── Type-specific icons in gallery ── */\
        .v029-type-icon {\
            width: 40%; height: auto; min-width: 48px; max-width: 80px;\
            display: flex; align-items: center; justify-content: center;\
        }\
        .v029-type-icon svg {\
            width: 100%; height: auto;\
        }\
        \
        /* ── Large view: fix multi-row layout ── */\
        .v025-grid--large {\
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;\
            gap: var(--space-4, 1rem) !important;\
            align-items: start !important;\
            align-content: start !important;\
        }\
        .v025-grid--large .v025-thumb {\
            max-height: none !important;\
            overflow: hidden;\
        }\
        .v025-grid--large .v025-thumb__img {\
            aspect-ratio: 4/3 !important;\
        }\
        .v025-grid--large .v025-thumb__label {\
            padding: 6px 10px;\
            font-size: 0.8rem;\
        }\
        \
        /* ── Type badge colours ── */\
        .v026-thumb--pdf .v026-thumb__type-badge { background: rgba(232, 56, 72, 0.15); color: #E83848; }\
        .v026-thumb--markdown .v026-thumb__type-badge { background: rgba(124, 77, 255, 0.15); color: #7C4DFF; }\
        \
        /* ── Grid view: ensure consistent card sizing ── */\
        .v025-grid--grid .v025-thumb,\
        .v025-grid--compact .v025-thumb {\
            overflow: hidden;\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v029] Gallery: type icons, large view fix, _preview filter, hash preservation, print-friendly markdown');

})();
