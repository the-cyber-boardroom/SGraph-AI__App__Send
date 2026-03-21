/* =============================================================================
   SGraph Send — Upload Component
   v0.2.15 — Surgical overlay on v0.2.14

   Changes:
     - Taller carousel message area during encrypt/upload
     - Always show all 3 delivery options: Folder view, Gallery, Download
       with smart defaults based on file type/count:
       - Single viewable file → default to View mode
       - Single unsupported file → default to Download
       - Multiple/folder files → default to Gallery
     - Renamed _preview to _gallery in zip folder naming

   Loads AFTER v0.2.14 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0215] SendUpload not found — skipping');
    return;
}

// ─── Override: advanceToDelivery — always show all 3 options with smart defaults ─
var _v0214_advanceToDelivery = SendUpload.prototype._v023_advanceToDelivery;

SendUpload.prototype._v023_advanceToDelivery = function() {
    // Call existing chain
    _v0214_advanceToDelivery.call(this);

    var scan = this._folderScan;
    var isFolder = !!scan;
    var file = this.selectedFile;

    // ── File type detection ──
    var VIEWABLE_EXTS = ['md', 'markdown', 'txt', 'json', 'html', 'htm', 'css', 'js', 'ts',
                         'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash',
                         'xml', 'yaml', 'yml', 'csv', 'log', 'toml', 'ini', 'cfg',
                         'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
                         'pdf', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov'];
    var ext = file ? (file.name || '').split('.').pop().toLowerCase() : '';
    var isViewable = VIEWABLE_EXTS.indexOf(ext) !== -1;
    var isZip = ext === 'zip';

    // ── Build the full set of 3 options ──
    var downloadTitle = isFolder ? 'Download zip mode' : 'Download mode';
    var downloadDesc  = isFolder ? 'Recipient downloads a single zip file' : 'Recipient gets a file to save to their device';

    var options = [
        {
            id: 'browse',
            icon: '\uD83D\uDCC2',
            title: isFolder ? 'Folder view mode' : 'File viewer mode',
            desc: isFolder
                ? 'Recipient sees files in a browsable view with inline preview'
                : 'Recipient reads/views the file directly with inline preview',
            hint: 'Best for: documents, reports, code files'
        },
        {
            id: 'gallery',
            icon: '\uD83D\uDDBC\uFE0F',
            title: 'Gallery mode',
            desc: isFolder
                ? 'Recipient browses files with thumbnails and preview. Metadata will be generated.'
                : 'Recipient views the file in a gallery-style layout with metadata.',
            hint: 'Best for: photo sets, documents, mixed files'
        },
        {
            id: 'download',
            icon: '\uD83D\uDCE5',
            title: downloadTitle,
            desc: downloadDesc,
            hint: 'Best for: large archives, backups, binary files'
        }
    ];

    this._v023_deliveryOptions = options;

    // ── Smart defaults ──
    if (isFolder) {
        // Folders: default to gallery (best experience with thumbnails)
        this._v023_recommendedDelivery = 'gallery';
    } else if (isViewable) {
        // Single viewable file: default to browse/viewer
        this._v023_recommendedDelivery = 'browse';
    } else if (isZip) {
        // Zip file: default to browse (folder viewer)
        this._v023_recommendedDelivery = 'browse';
    } else {
        // Unsupported file type: default to download
        this._v023_recommendedDelivery = 'download';
    }

    this.render();
    this.setupEventListeners();
};

// ─── Styles: taller carousel message area ────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0215-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0215-styles';
    style.textContent = '\
        /* ── Taller processing columns — use more vertical space ── */\
        .v028-process-columns {\
            min-height: 160px !important;\
            margin-top: var(--space-5, 1.25rem) !important;\
        }\
        \
        /* ── Taller carousel message box ── */\
        .v028-process-col--messages .v027-carousel__message {\
            padding: var(--space-5, 1.25rem) var(--space-5, 1.25rem) !important;\
            min-height: 100px !important;\
        }\
        \
        /* ── Larger icon and text in carousel ── */\
        .v028-process-col--messages .v027-carousel__icon {\
            font-size: 1.5rem !important;\
        }\
        .v028-process-col--messages .v027-carousel__text {\
            font-size: var(--text-base, 1rem) !important;\
            line-height: 1.6 !important;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0215] All 3 delivery options always shown, smart defaults, taller carousel');

})();
