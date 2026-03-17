/* =============================================================================
   SGraph Send — Upload Component
   v0.2.4 — Surgical overlay on v0.2.3

   Changes:
     - Rich file type icons (type-specific instead of generic 📄/📁)
     - Content type labels in file summary ("Image · PNG", "Document · PDF")
     - Image thumbnail preview in file-ready state
     - Clipboard paste support (Ctrl+V to paste screenshots/files)
     - Enhanced drag-over feedback (pulse animation, "Release to upload" text)
     - Folder content breakdown (e.g., "3 images, 2 documents, 1 archive")

   Flow change from v0.2.3:
     - v0.2.3 auto-advances from drop → delivery (skips file summary)
     - v0.2.4 pauses at file-ready to show summary → user clicks to proceed
     - This gives users visual confirmation of their selection

   Loads AFTER v0.2.3 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard: v0.2.3 must be loaded ───────────────────────────────────────────
if (typeof SendUpload === 'undefined' || !SendUpload.prototype._v023_renderStep1Idle) {
    console.warn('[send-upload-v024] v0.2.3 overlay not found — skipping v0.2.4 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
const _v023_renderStep1Idle  = SendUpload.prototype._v023_renderStep1Idle;
const _v023_renderFileReady  = SendUpload.prototype._v023_renderFileReady;
const _v023_setupListeners   = SendUpload.prototype.setupEventListeners;
const _v023_resetForNew      = SendUpload.prototype.resetForNew;
const _v023_advanceToDelivery = SendUpload.prototype._v023_advanceToDelivery;

// ─── File type icon mapping ─────────────────────────────────────────────────
const TYPE_ICONS = {
    'image':    '\uD83D\uDDBC\uFE0F',   // 🖼️
    'pdf':      '\uD83D\uDCC4',          // 📄
    'markdown': '\uD83D\uDCDD',          // 📝
    'video':    '\uD83C\uDFA5',          // 🎥
    'audio':    '\uD83C\uDFB5',          // 🎵
    'code':     '\uD83D\uDCBB',          // 💻
    'zip':      '\uD83D\uDCE6',          // 📦
    'text':     '\uD83D\uDCC3',          // 📃
    'folder':   '\uD83D\uDCC1',          // 📁
    'default':  '\uD83D\uDCC4',          // 📄
};

// ─── Human-readable type labels ─────────────────────────────────────────────
const TYPE_LABELS = {
    'image':    'Image',
    'pdf':      'Document',
    'markdown': 'Document',
    'video':    'Video',
    'audio':    'Audio',
    'code':     'Code',
    'zip':      'Archive',
    'text':     'Text',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFileExtension(filename) {
    if (!filename) return '';
    const dot = filename.lastIndexOf('.');
    if (dot < 0 || dot === filename.length - 1) return '';
    return filename.substring(dot + 1).toUpperCase();
}

function getFileTypeInfo(file) {
    if (!file) return { icon: TYPE_ICONS['default'], label: '', ext: '' };
    const ext = getFileExtension(file.name);
    const type = (typeof FileTypeDetect !== 'undefined')
        ? FileTypeDetect.detect(file.name, file.type)
        : null;
    const icon  = TYPE_ICONS[type] || TYPE_ICONS['default'];
    const label = TYPE_LABELS[type] || '';
    return { icon, label, ext, type };
}

function isImageFile(file) {
    if (!file) return false;
    const type = (typeof FileTypeDetect !== 'undefined')
        ? FileTypeDetect.detect(file.name, file.type)
        : null;
    return type === 'image';
}

function getFolderBreakdown(folderScan) {
    if (!folderScan || !folderScan.entries) return '';
    const counts = {};
    folderScan.entries
        .filter(e => !e.isDir)
        .forEach(e => {
            const ext  = '.' + (e.name.split('.').pop() || '').toLowerCase();
            const type = (typeof FileTypeDetect !== 'undefined')
                ? (FileTypeDetect._extMap[ext] || 'other')
                : 'other';
            const label = TYPE_LABELS[type] || 'other';
            counts[label] = (counts[label] || 0) + 1;
        });

    const parts = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `${count} ${label.toLowerCase()}${count > 1 ? 's' : ''}`)
        .slice(0, 3);  // Show top 3 types

    return parts.length > 0 ? parts.join(', ') : '';
}

// ─── Override: _v023_advanceToDelivery — pause at file-ready ────────────────
// v0.2.3 calls this from handleDrop, handleFileSelect, and _handleFolderEntry
// to auto-advance past the file summary. v0.2.4 intercepts: first call shows
// file-ready (summary with type info + thumbnail), second call (from Continue
// button) proceeds to actual delivery selection.
SendUpload.prototype._v023_advanceToDelivery = function() {
    if (this._v024_userConfirmed) {
        // User clicked "Continue" — proceed to delivery as v0.2.3 intended
        this._v024_userConfirmed = false;
        _v023_advanceToDelivery.call(this);
    } else {
        // First call from drop/select — pause at file-ready
        this.state = 'file-ready';
        this.render();
        this.setupEventListeners();
    }
};

// ─── Override: Step 1 Idle — enhanced drag zone ─────────────────────────────
SendUpload.prototype._v023_renderStep1Idle = function() {
    const maxSize = this.formatBytes(SendUpload.MAX_FILE_SIZE);
    return `
        <div class="drop-zone v024-drop-zone" id="drop-zone">
            <div class="drop-zone__label">Drop a file or folder</div>
            <div class="v024-drop-zone__paste-hint">or paste from clipboard (Ctrl+V)</div>
            <div class="v023-browse-buttons">
                <button class="v023-browse-btn" id="browse-file-btn">Browse files</button>
                <button class="v023-browse-btn" id="browse-folder-btn">Browse folder</button>
            </div>
            <div class="drop-zone__hint" style="margin-top: var(--space-3, 0.75rem);">
                Your files are encrypted in your browser before upload
            </div>
            <div class="drop-zone__hint" style="margin-top: var(--space-1, 0.25rem); font-size: var(--text-small, 0.75rem); opacity: 0.7;">
                Maximum upload: ${this.escapeHtml(maxSize)}
            </div>
            <input type="file" id="file-input" style="display: none;">
            <input type="file" id="folder-input" style="display: none;" webkitdirectory>
        </div>
        <div class="v023-trust-badge">
            <span class="v023-trust-badge__icon">&#128274;</span>
            <span>Zero cookies &middot; Zero tracking &middot; We cannot read your files</span>
        </div>
    `;
};

// ─── Override: File Ready — rich type info + thumbnail ──────────────────────
SendUpload.prototype._v023_renderFileReady = function() {
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;

    let icon, name, meta;

    if (isFolder) {
        icon = TYPE_ICONS['folder'];
        name = this._folderName + '/';
        const breakdown = getFolderBreakdown(this._folderScan);
        meta = `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`;
        if (breakdown) {
            meta += `<div class="v024-file-breakdown">${this.escapeHtml(breakdown)}</div>`;
        }
    } else if (file) {
        const info = getFileTypeInfo(file);
        icon = info.icon;
        name = file.name;
        const typeParts = [];
        if (info.label) typeParts.push(info.label);
        if (info.ext)   typeParts.push(info.ext);
        const typeLabel = typeParts.length > 0 ? typeParts.join(' &middot; ') + ' &middot; ' : '';
        meta = `${typeLabel}${this.formatBytes(file.size)}`;
    } else {
        icon = TYPE_ICONS['default'];
        name = '';
        meta = '';
    }

    const tooLarge = file && file.size > SendUpload.MAX_FILE_SIZE;
    const largeWarning = file && file.size > 2 * 1024 * 1024 * 1024
        ? '<div class="v023-large-warning">Large files may take several minutes to encrypt. Keep this tab open.</div>'
        : '';

    if (tooLarge) {
        return `
            <div class="v023-file-summary v023-file-summary--error">
                <span class="v023-file-summary__icon">${icon}</span>
                <div>
                    <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                    <div class="v023-file-summary__meta">${meta}</div>
                    <div class="v023-file-summary__meta" style="color: var(--color-error, #FF6B6B);">
                        File too large. Maximum: ${this.escapeHtml(this.formatBytes(SendUpload.MAX_FILE_SIZE))}
                    </div>
                </div>
            </div>
            <button class="v023-back-link" id="v023-back-to-idle">&larr; Choose a different file</button>
        `;
    }

    // Image thumbnail preview
    let thumbnailHtml = '';
    if (!isFolder && file && isImageFile(file) && file.size < 50 * 1024 * 1024) {
        // Create object URL for preview — cleaned up on reset
        if (!this._v024_thumbnailUrl) {
            this._v024_thumbnailUrl = URL.createObjectURL(file);
        }
        thumbnailHtml = `
            <div class="v024-thumbnail">
                <img src="${this._v024_thumbnailUrl}" alt="Preview" class="v024-thumbnail__img">
            </div>
        `;
    }

    return `
        <div class="v023-file-summary">
            <span class="v023-file-summary__icon v024-file-icon">${icon}</span>
            <div class="v024-file-info">
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta}</div>
            </div>
            <div class="v023-file-summary__status">&#10003; Ready</div>
        </div>
        ${thumbnailHtml}
        ${largeWarning}
        <div style="text-align: center; margin-top: var(--space-4, 1rem);">
            <button class="btn btn-primary" id="v023-continue-to-delivery">Choose how to share it &rarr;</button>
        </div>
        <button class="v023-back-link" id="v023-back-to-idle">&larr; Choose a different file</button>
    `;
};

// ─── Override: setupEventListeners — add paste + enhanced drag ──────────────
SendUpload.prototype.setupEventListeners = function() {
    _v023_setupListeners.call(this);

    // Clipboard paste support
    if (this.state === 'idle' && !this._v024_pasteHandler) {
        this._v024_pasteHandler = (e) => this._v024_handlePaste(e);
        document.addEventListener('paste', this._v024_pasteHandler);
    }

    // Enhanced drag-over feedback
    const dz = this.querySelector('#drop-zone');
    if (dz && this.state === 'idle') {
        dz.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dz.classList.add('v024-dragover');
            const label = dz.querySelector('.drop-zone__label');
            if (label) label.textContent = 'Release to upload';
        });
        dz.addEventListener('dragleave', (e) => {
            // Only remove if leaving the drop zone entirely
            if (!dz.contains(e.relatedTarget)) {
                dz.classList.remove('v024-dragover');
                const label = dz.querySelector('.drop-zone__label');
                if (label) label.textContent = 'Drop a file or folder';
            }
        });
        dz.addEventListener('drop', () => {
            dz.classList.remove('v024-dragover');
        });
    }

    // Continue button (file-ready → delivery)
    const continueBtn = this.querySelector('#v023-continue-to-delivery');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            this._v024_userConfirmed = true;
            this._v023_advanceToDelivery();
        });
    }
};

// ─── Paste handler ──────────────────────────────────────────────────────────
SendUpload.prototype._v024_handlePaste = function(e) {
    // Only handle paste when in idle state and component is visible
    if (this.state !== 'idle') return;
    if (!this.isConnected) return;

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                // If no name or generic name, give it a meaningful one
                let pastedFile = file;
                if (!file.name || file.name === 'image.png') {
                    const ext = file.type ? file.type.split('/')[1] || 'png' : 'png';
                    const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    pastedFile = new File([file], `pasted-${ts}.${ext}`, { type: file.type });
                }
                this.selectedFile = pastedFile;
                // Trigger file-ready via the advanceToDelivery intercept
                this._v023_advanceToDelivery();
            }
            return;
        }
    }
};

// ─── Override: resetForNew — clean up thumbnail + paste handler ──────────────
SendUpload.prototype.resetForNew = function() {
    // Clean up thumbnail object URL
    if (this._v024_thumbnailUrl) {
        URL.revokeObjectURL(this._v024_thumbnailUrl);
        this._v024_thumbnailUrl = null;
    }
    this._v024_userConfirmed = false;
    _v023_resetForNew.call(this);
};

// ─── Override disconnectedCallback to clean up paste handler ────────────────
const _v020_disconnectedCallback = SendUpload.prototype.disconnectedCallback;
SendUpload.prototype.disconnectedCallback = function() {
    if (this._v024_pasteHandler) {
        document.removeEventListener('paste', this._v024_pasteHandler);
        this._v024_pasteHandler = null;
    }
    if (this._v024_thumbnailUrl) {
        URL.revokeObjectURL(this._v024_thumbnailUrl);
        this._v024_thumbnailUrl = null;
    }
    _v020_disconnectedCallback.call(this);
};

// ─── Inline styles for v0.2.4 components ────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v024-styles')) return;
    const style = document.createElement('style');
    style.id = 'v024-styles';
    style.textContent = `
        /* Enhanced drop zone drag-over state */
        .v024-drop-zone.v024-dragover {
            border-color: var(--color-primary, #4ECDC4) !important;
            background: rgba(78, 205, 196, 0.08) !important;
            animation: v024-pulse 1.2s ease-in-out infinite;
        }
        .v024-drop-zone.v024-dragover .drop-zone__label {
            color: var(--color-primary, #4ECDC4);
            font-weight: var(--weight-semibold, 600);
        }
        @keyframes v024-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(78, 205, 196, 0.15); }
            50%      { box-shadow: 0 0 0 8px rgba(78, 205, 196, 0.05); }
        }

        /* Paste hint */
        .v024-drop-zone__paste-hint {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            opacity: 0.6;
            margin-top: var(--space-1, 0.25rem);
        }

        /* File icon — slightly larger for type-specific icons */
        .v024-file-icon {
            font-size: 1.5rem;
        }

        /* File info — flex column for name + meta */
        .v024-file-info {
            flex: 1;
            min-width: 0;
        }
        .v024-file-info .v023-file-summary__name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* File type breakdown for folders */
        .v024-file-breakdown {
            font-size: var(--text-micro, 0.625rem);
            color: var(--color-text-secondary, #8892A0);
            opacity: 0.7;
            margin-top: 2px;
        }

        /* Image thumbnail preview */
        .v024-thumbnail {
            display: flex;
            justify-content: center;
            padding: var(--space-3, 0.75rem);
            margin-bottom: var(--space-3, 0.75rem);
            background: rgba(0, 0, 0, 0.15);
            border-radius: var(--radius-sm, 6px);
            overflow: hidden;
        }
        .v024-thumbnail__img {
            max-width: 100%;
            max-height: 160px;
            border-radius: var(--radius-xs, 4px);
            object-fit: contain;
            opacity: 0;
            animation: v024-thumb-fade 300ms ease forwards;
        }
        @keyframes v024-thumb-fade {
            from { opacity: 0; transform: scale(0.97); }
            to   { opacity: 1; transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
})();

console.log('[send-upload-v024] Enhanced Step 1: type icons, thumbnails, paste support, drag feedback');

})();
