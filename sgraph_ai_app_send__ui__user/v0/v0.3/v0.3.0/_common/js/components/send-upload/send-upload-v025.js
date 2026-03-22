/* =============================================================================
   SGraph Send — Upload Component
   v0.2.5 — Surgical overlay on v0.2.4

   Changes:
     - Multi-file drop support (multiple files → treated as folder-like bundle)
     - Multi-file input (file picker accepts multiple)
     - Multi-file paste support (Ctrl+V with multiple clipboard items)
     - Smart file-ready skip: folders and multi-file go straight to delivery
     - Single files still pause at file-ready (image preview, type confirmation)
     - Rich file breakdown shown in delivery step header (not just file-ready)
     - Drop zone label updates: "Drop files or a folder"

   UX rationale:
     - The file-ready pause (pic 1) is only valuable for single files where
       image preview or type confirmation helps. For folders/multi-file,
       the metadata ("3 documents, 1 image") belongs in the delivery step
       header (pic 2), making pic 1 redundant — skip it.

   Loads AFTER v0.2.4 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard: v0.2.4 must be loaded ───────────────────────────────────────────
if (typeof SendUpload === 'undefined' || !SendUpload.prototype._v024_handlePaste) {
    console.warn('[send-upload-v025] v0.2.4 overlay not found — skipping v0.2.5 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
const _v024_renderStep1Idle    = SendUpload.prototype._v023_renderStep1Idle;
const _v024_advanceToDelivery  = SendUpload.prototype._v023_advanceToDelivery;
const _v024_handlePaste        = SendUpload.prototype._v024_handlePaste;
const _v024_setupListeners     = SendUpload.prototype.setupEventListeners;
const _v024_renderStep2        = SendUpload.prototype._v023_renderStep2;
const _v024_renderStep3        = SendUpload.prototype._v023_renderStep3;
const _v024_resetForNew        = SendUpload.prototype.resetForNew;

// ─── Helper: build a synthetic folder scan from a FileList ──────────────────
function buildMultiFileScan(files) {
    const entries = [];
    let totalSize = 0;
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        entries.push({ path: f.name, file: f, isDir: false, name: f.name });
        totalSize += f.size;
    }
    return {
        entries:     entries,
        fileCount:   entries.length,
        folderCount: 0,
        totalSize:   totalSize
    };
}

// ─── Helper: get folder/multi-file breakdown (reuses v0.2.4's logic) ────────
function getBreakdown(folderScan) {
    if (!folderScan || !folderScan.entries) return '';
    var TYPE_LABELS = {
        'image': 'Image', 'pdf': 'Document', 'markdown': 'Document',
        'video': 'Video', 'audio': 'Audio', 'code': 'Code',
        'zip': 'Archive', 'text': 'Text'
    };
    var counts = {};
    folderScan.entries
        .filter(function(e) { return !e.isDir; })
        .forEach(function(e) {
            var ext  = '.' + (e.name.split('.').pop() || '').toLowerCase();
            var type = (typeof FileTypeDetect !== 'undefined')
                ? (FileTypeDetect._extMap[ext] || 'other')
                : 'other';
            var label = TYPE_LABELS[type] || 'other';
            counts[label] = (counts[label] || 0) + 1;
        });
    var parts = Object.entries(counts)
        .sort(function(a, b) { return b[1] - a[1]; })
        .map(function(pair) { return pair[1] + ' ' + pair[0].toLowerCase() + (pair[1] > 1 ? 's' : ''); })
        .slice(0, 3);
    return parts.length > 0 ? parts.join(', ') : '';
}

// ─── Helper: render file summary with optional breakdown ────────────────────
function renderFileSummary(component, compact) {
    var file = component.selectedFile;
    var isFolder = !!component._folderScan;
    var isMulti  = !!component._v025_multiFile;
    var icon = (isFolder && !isMulti) ? '&#128193;' : (isMulti ? '&#128451;' : '&#128196;');
    var name = isFolder ? component._folderName + (isMulti ? '' : '/') : (file ? file.name : '');
    var meta = isFolder
        ? component._folderScan.fileCount + ' files &middot; ' + component.formatBytes(component._folderScan.totalSize)
        : (file ? component.formatBytes(file.size) : '');
    var breakdownHtml = '';
    if (isFolder) {
        var breakdown = getBreakdown(component._folderScan);
        if (breakdown) {
            breakdownHtml = '<div class="v024-file-breakdown">' + component.escapeHtml(breakdown) + '</div>';
        }
    }
    var cls = 'v023-file-summary' + (compact ? ' v023-file-summary--compact' : '');
    return '<div class="' + cls + '">' +
        '<span class="v023-file-summary__icon">' + icon + '</span>' +
        '<div>' +
            '<div class="v023-file-summary__name">' + component.escapeHtml(name) + '</div>' +
            '<div class="v023-file-summary__meta">' + meta + '</div>' +
            breakdownHtml +
        '</div>' +
    '</div>';
}

// ─── Override: _v023_advanceToDelivery — smart skip ─────────────────────────
// For folders and multi-file: skip file-ready, go straight to delivery
// For single files: keep the v0.2.4 pause (image preview, type confirmation)
SendUpload.prototype._v023_advanceToDelivery = function() {
    var isFolder    = !!this._folderScan;
    var isMultiFile = !!this._v025_multiFile;

    if (isFolder || isMultiFile) {
        // Skip file-ready — go straight to delivery
        this._v024_userConfirmed = true;
        _v024_advanceToDelivery.call(this);
    } else {
        // Single file — keep v0.2.4 behavior (pause at file-ready)
        _v024_advanceToDelivery.call(this);
    }
};

// ─── Override: handleDrop — support multiple files ──────────────────────────
SendUpload.prototype.handleDrop = function(e) {
    e.preventDefault(); e.stopPropagation();
    var dz = this.querySelector('#drop-zone');
    if (dz) { dz.classList.remove('dragover'); dz.classList.remove('v024-dragover'); }

    // Check if a folder was dropped
    var items = e.dataTransfer && e.dataTransfer.items;
    if (items && items.length > 0) {
        var entry = items[0].webkitGetAsEntry && items[0].webkitGetAsEntry();
        if (entry && entry.isDirectory) {
            this._v025_multiFile = false;
            this._handleFolderEntry(entry);
            return;
        }
    }

    // Files dropped
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 1) {
        // Multiple files — treat as a bundle (like a folder)
        this._v025_multiFile = true;
        this._folderName = files.length + ' files';
        this._folderScan = buildMultiFileScan(files);
        this._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        this._v023_advanceToDelivery();
        return;
    }

    if (files && files.length === 1) {
        // Single file
        this._v025_multiFile = false;
        this.selectedFile = files[0];
        this._v023_advanceToDelivery();
        return;
    }

    // Handle drag from test-files component
    var testFileData = e.dataTransfer && e.dataTransfer.getData('application/x-sgraph-test-file');
    if (testFileData) {
        var self = this;
        try {
            var parsed = JSON.parse(testFileData);
            fetch(parsed.url).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                self._v025_multiFile = false;
                self.selectedFile = new File([buf], parsed.name, { type: parsed.mime });
                self._v023_advanceToDelivery();
            });
        } catch (err) { /* ignore malformed data */ }
    }
};

// ─── Override: handleFileSelect — support multiple files ────────────────────
SendUpload.prototype.handleFileSelect = function(e) {
    var files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length > 1) {
        // Multiple files selected via picker
        this._v025_multiFile = true;
        this._folderName = files.length + ' files';
        this._folderScan = buildMultiFileScan(files);
        this._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        this._v023_advanceToDelivery();
    } else {
        // Single file
        this._v025_multiFile = false;
        this.selectedFile = files[0];
        this._v023_advanceToDelivery();
    }
};

// ─── Override: paste handler — support multiple file items ──────────────────
SendUpload.prototype._v024_handlePaste = function(e) {
    if (this.state !== 'idle') return;
    if (!this.isConnected) return;

    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    // Collect all file items from clipboard
    var pastedFiles = [];
    for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
            var file = items[i].getAsFile();
            if (file) {
                // Give meaningful name if generic
                if (!file.name || file.name === 'image.png') {
                    var ext = file.type ? file.type.split('/')[1] || 'png' : 'png';
                    var ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    file = new File([file], 'pasted-' + ts + '.' + ext, { type: file.type });
                }
                pastedFiles.push(file);
            }
        }
    }

    if (pastedFiles.length === 0) return;
    e.preventDefault();

    if (pastedFiles.length > 1) {
        // Multiple pasted files
        this._v025_multiFile = true;
        this._folderName = pastedFiles.length + ' files';
        var dt = new DataTransfer();
        pastedFiles.forEach(function(f) { dt.items.add(f); });
        this._folderScan = buildMultiFileScan(dt.files);
        this._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        this._v023_advanceToDelivery();
    } else {
        // Single pasted file
        this._v025_multiFile = false;
        this.selectedFile = pastedFiles[0];
        this._v023_advanceToDelivery();
    }
};

// ─── Override: Step 1 Idle — update labels + multi-file input ───────────────
SendUpload.prototype._v023_renderStep1Idle = function() {
    var maxSize = this.formatBytes(SendUpload.MAX_FILE_SIZE);
    return '\
        <div class="drop-zone v024-drop-zone" id="drop-zone">\
            <div class="drop-zone__label">Drop files or a folder</div>\
            <div class="v024-drop-zone__paste-hint">or paste from clipboard (Ctrl+V)</div>\
            <div class="v023-browse-buttons">\
                <button class="v023-browse-btn" id="browse-file-btn">Browse files</button>\
                <button class="v023-browse-btn" id="browse-folder-btn">Browse folder</button>\
            </div>\
            <div class="drop-zone__hint" style="margin-top: var(--space-3, 0.75rem);">\
                Your files are encrypted in your browser before upload\
            </div>\
            <div class="drop-zone__hint" style="margin-top: var(--space-1, 0.25rem); font-size: var(--text-small, 0.75rem); opacity: 0.7;">\
                Maximum upload: ' + this.escapeHtml(maxSize) + '\
            </div>\
            <input type="file" id="file-input" style="display: none;" multiple>\
            <input type="file" id="folder-input" style="display: none;" webkitdirectory>\
        </div>\
        <div class="v023-trust-badge">\
            <span class="v023-trust-badge__icon">&#128274;</span>\
            <span>Zero cookies &middot; Zero tracking &middot; We cannot read your files</span>\
        </div>\
    ';
};

// ─── Override: Step 2 — show rich breakdown in delivery header ──────────────
SendUpload.prototype._v023_renderStep2 = function() {
    var options = this._v023_deliveryOptions || [];
    var recommended = this._v023_recommendedDelivery || 'download';
    var self = this;

    var cardsHtml = options.map(function(opt) {
        var isRec = opt.id === recommended;
        var cls = 'v023-delivery-card' + (isRec ? ' v023-delivery-card--recommended' : '');
        return '<div class="' + cls + '" data-delivery="' + opt.id + '">' +
            '<div class="v023-delivery-card__icon">' + opt.icon + '</div>' +
            '<div class="v023-delivery-card__title">' + self.escapeHtml(opt.title) + '</div>' +
            '<div class="v023-delivery-card__desc">' + self.escapeHtml(opt.desc) + '</div>' +
            '<div class="v023-delivery-card__hint">' + self.escapeHtml(opt.hint) + '</div>' +
        '</div>';
    }).join('');

    return renderFileSummary(this, true) +
        '<h3 class="v023-step-title">How should the recipient get this?</h3>' +
        '<div class="v023-delivery-cards">' + cardsHtml + '</div>' +
        '<button class="v023-back-link" id="v023-back-to-idle">&larr; Back</button>';
};

// ─── Override: Step 3 — show rich breakdown in encrypt header ───────────────
SendUpload.prototype._v023_renderStep3 = function() {
    var delivery = this._v023_selectedDelivery || 'download';
    var deliveryOpt = (this._v023_deliveryOptions || []).find(function(o) { return o.id === delivery; });
    var deliveryLabel = deliveryOpt ? deliveryOpt.title : delivery;

    return renderFileSummary(this, true) +
        '<div class="v023-delivery-choice">' +
            '<span class="v023-delivery-choice__label">Delivery:</span>' +
            '<span class="v023-delivery-choice__value">' + (deliveryOpt ? deliveryOpt.icon + ' ' : '') + this.escapeHtml(deliveryLabel) + '</span>' +
        '</div>' +
        '<h3 class="v023-step-title">Ready to encrypt and send</h3>' +
        '<p class="v023-step-desc">Your file will be encrypted in your browser, then uploaded. A secure link will be generated for sharing.</p>' +
        '<div style="text-align: center; margin-top: var(--space-6, 1.5rem);">' +
            '<button class="btn btn-primary btn-lg" id="v023-send-btn">Encrypt &amp; Send</button>' +
        '</div>' +
        '<button class="v023-back-link" id="v023-back-to-delivery">&larr; Back</button>';
};

// ─── Override: resetForNew — clear multi-file state ─────────────────────────
SendUpload.prototype.resetForNew = function() {
    this._v025_multiFile = false;
    _v024_resetForNew.call(this);
};

console.log('[send-upload-v025] Multi-file drop, smart file-ready skip, rich delivery metadata');

})();
