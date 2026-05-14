/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Step Select (Step 1: File Selection)
   v0.4.0 — Shadow DOM Web Component (Secret tab inlined from v0.3.2)

   States: idle, folder-options, file-ready
   Modes:  file (drop-zone), secret (textarea + expiry / max-views pills)
   Events: step-file-dropped, step-file-selected, step-folder-selected,
           step-paste, step-continue, step-folder-upload, step-folder-cancel,
           step-back-to-idle, step-secret-submit
   ═══════════════════════════════════════════════════════════════════════════════ */

// Secret-tab styles (injected into Shadow DOM on first secret render)
const _UPLOAD_SECRET_TAB_CSS = [
    '.secret-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3,0.75rem);}',
    '.secret-header .mode-toggle{margin-bottom:0;}',
    '.btn--secret-send{white-space:nowrap;flex-shrink:0;padding:0.375rem 0.875rem;font-size:var(--text-sm,0.875rem);}',
    '.secret-input-area{margin-bottom:var(--space-4,1rem);}',
    '.secret-config{display:flex;flex-direction:column;gap:var(--space-2,0.5rem);margin-bottom:var(--space-4,1rem);padding:var(--space-3,0.75rem);background:rgba(78,205,196,0.03);border:1px solid rgba(78,205,196,0.1);border-radius:var(--radius-md,12px);}',
    '.secret-config__row{display:flex;align-items:center;gap:var(--space-3,0.75rem);}',
    '.secret-config__label{font-size:var(--text-small,0.75rem);font-weight:var(--weight-semibold,600);color:var(--color-text-secondary,#8892A0);text-transform:uppercase;letter-spacing:0.05em;min-width:3.5rem;flex-shrink:0;}',
    '.secret-config__pills{display:flex;flex-wrap:wrap;gap:var(--space-1,0.25rem);}',
    '.secret-pill{padding:0.25rem 0.75rem;background:transparent;border:1px solid rgba(78,205,196,0.2);border-radius:999px;color:var(--color-text-secondary,#8892A0);font-size:var(--text-small,0.75rem);cursor:pointer;transition:all 0.15s ease;line-height:1.5;}',
    '.secret-pill:hover{border-color:var(--color-primary,#4ECDC4);color:var(--color-primary,#4ECDC4);}',
    '.secret-pill--active{background:rgba(78,205,196,0.15);border-color:var(--color-primary,#4ECDC4);color:var(--color-primary,#4ECDC4);font-weight:var(--weight-semibold,600);}'
].join('\n');

class UploadStepSelect extends HTMLElement {
    static _templateHtml = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._ready = false;

        // Internal state
        this._state        = 'idle';
        this._inputMode    = 'file';   // 'file' or 'secret'
        this._selectedFile = null;
        this._folderScan   = null;
        this._folderName   = null;
        this._folderOptions = { level: 4, includeEmpty: false, includeHidden: false };
        this._maxFileSize  = 5 * 1024 * 1024;
        this._thumbnailUrl = null;

        // Drag counter to prevent flicker when dragging over child elements
        this._dragCounter = 0;

        // Bound handlers (for cleanup)
        this._boundOnDragOver   = this._onDragOver.bind(this);
        this._boundOnDragEnter  = this._onDragEnter.bind(this);
        this._boundOnDragLeave  = this._onDragLeave.bind(this);
        this._boundOnDrop       = this._onDrop.bind(this);
        this._boundOnPaste     = this._onPaste.bind(this);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    connectedCallback() {
        this._init();
    }

    disconnectedCallback() {
        document.removeEventListener('paste', this._boundOnPaste);
    }

    async _init() {
        const base = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath)
            || '../_common';
        const dir = base + '/js/components/send-upload/upload-step-select';

        // CSS
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = dir + '/upload-step-select.css';
        this.shadowRoot.appendChild(link);

        // HTML template — fetch once, cache on class
        if (!UploadStepSelect._templateHtml) {
            try {
                const res = await fetch(dir + '/upload-step-select.html');
                UploadStepSelect._templateHtml = await res.text();
            } catch (e) {
                UploadStepSelect._templateHtml =
                    '<div class="step-select"><div class="step-select__content"></div></div>';
            }
        }
        const tpl = document.createElement('template');
        tpl.innerHTML = UploadStepSelect._templateHtml;
        this.shadowRoot.appendChild(tpl.content.cloneNode(true));

        this._container = this.shadowRoot.querySelector('.step-select__content');
        this._ready = true;
        this.render();
    }

    // ─── Property setters (trigger re-render) ──────────────────────────────

    get state()        { return this._state; }
    set state(v)       { this._state = v; this.render(); }

    get selectedFile()  { return this._selectedFile; }
    set selectedFile(v) { this._selectedFile = v; this.render(); }

    get folderScan()    { return this._folderScan; }
    set folderScan(v)   { this._folderScan = v; this.render(); }

    get folderName()    { return this._folderName; }
    set folderName(v)   { this._folderName = v; this.render(); }

    get folderOptions()  { return this._folderOptions; }
    set folderOptions(v) { this._folderOptions = v; this.render(); }

    get maxFileSize()    { return this._maxFileSize; }
    set maxFileSize(v)   { this._maxFileSize = v; this.render(); }

    get thumbnailUrl()   { return this._thumbnailUrl; }
    set thumbnailUrl(v)  { this._thumbnailUrl = v; this.render(); }

    // ─── Render dispatch ────────────────────────────────────────────────────

    render() {
        if (!this._ready) return;
        switch (this._state) {
            case 'idle':           this._renderIdle();          break;
            case 'folder-options': this._renderFolderOptions(); break;
            case 'file-ready':     this._renderFileReady();     break;
        }
        this._setupListeners();
    }

    // ─── Idle state ─────────────────────────────────────────────────────────

    _renderIdle() {
        const maxSize  = this._fmt(this._maxFileSize);
        const isFile   = this._inputMode === 'file';
        const isSecret = this._inputMode === 'secret';

        const modeToggle = `
            <div class="mode-toggle">
                <button class="mode-toggle__btn ${isFile ? 'mode-toggle__btn--active' : ''}" id="mode-file" data-testid="mode-file">File</button>
                <button class="mode-toggle__btn mode-toggle__btn--secret ${isSecret ? 'mode-toggle__btn--active' : ''}" id="mode-secret" data-testid="mode-secret">🔒 Secret</button>
            </div>
        `;

        if (isSecret) {
            const sr = this.shadowRoot;
            if (sr && !sr.getElementById('sgraph-secret-styles')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'sgraph-secret-styles';
                styleEl.textContent = _UPLOAD_SECRET_TAB_CSS;
                sr.appendChild(styleEl);
            }

            this._container.innerHTML = `
                <div class="secret-header">
                    ${modeToggle}
                    <button class="btn btn-primary btn--secret-send" id="secret-send-btn" data-testid="secret-send-btn" disabled>Review &rarr;</button>
                </div>
                <div class="secret-input-area">
                    <textarea class="text-input" id="secret-input" data-testid="secret-input"
                              placeholder="Type or paste the secret to encrypt and share..."
                              spellcheck="false" rows="6"></textarea>
                    <div class="text-input-footer">
                        <span class="text-input-count" id="secret-char-count">0 characters</span>
                    </div>
                </div>
                <div class="secret-config">
                    <div class="secret-config__row">
                        <span class="secret-config__label">Views</span>
                        <div class="secret-config__pills" id="max-dl-pills">
                            <button type="button" class="secret-pill secret-pill--active" data-name="max-dl" data-value="1">1 view</button>
                            <button type="button" class="secret-pill" data-name="max-dl" data-value="5">5 views</button>
                            <button type="button" class="secret-pill" data-name="max-dl" data-value="10">10 views</button>
                        </div>
                    </div>
                    <div class="secret-config__row">
                        <span class="secret-config__label">Expires</span>
                        <div class="secret-config__pills" id="expiry-pills">
                            <button type="button" class="secret-pill" data-name="expiry" data-value="1">1 hour</button>
                            <button type="button" class="secret-pill secret-pill--active" data-name="expiry" data-value="24">24 hours</button>
                            <button type="button" class="secret-pill" data-name="expiry" data-value="168">7 days</button>
                            <button type="button" class="secret-pill" data-name="expiry" data-value="0">Never</button>
                        </div>
                    </div>
                </div>
                <div class="trust-badge">
                    <span class="trust-badge__icon">🔒</span>
                    <span>Zero cookies &middot; Zero tracking &middot; We cannot read your secret</span>
                </div>
            `;
        } else {
            this._container.innerHTML = `
                ${modeToggle}
                <div class="drop-zone" id="drop-zone" data-testid="drop-zone">
                    <div class="drop-zone__label">Drop files or a folder</div>
                    <div class="drop-zone__paste-hint">or paste from clipboard (Ctrl+V)</div>
                    <div class="browse-buttons">
                        <button class="browse-btn" id="browse-file-btn" data-testid="browse-file-btn">Browse files</button>
                        <button class="browse-btn" id="browse-folder-btn" data-testid="browse-folder-btn">Browse folder</button>
                    </div>
                    <div class="drop-zone__hint" style="margin-top: var(--space-3, 0.75rem);">
                        Your files are encrypted in your browser before upload
                    </div>
                    <div class="drop-zone__hint" style="margin-top: var(--space-1, 0.25rem); font-size: var(--text-small, 0.75rem); opacity: 0.7;">
                        Maximum upload: ${this._esc(maxSize)}
                    </div>
                    <input type="file" id="file-input" data-testid="file-input" style="display: none;" multiple>
                    <input type="file" id="folder-input" data-testid="folder-input" style="display: none;" webkitdirectory>
                </div>
                <div class="trust-badge">
                    <span class="trust-badge__icon">&#128274;</span>
                    <span>Zero cookies &middot; Zero tracking &middot; We cannot read your files</span>
                </div>
            `;
        }
    }

    // ─── Folder options state ───────────────────────────────────────────────

    _renderFolderOptions() {
        if (!this._folderScan) return;
        const { fileCount, folderCount, totalSize } = this._folderScan;
        const opts = this._folderOptions;

        this._container.innerHTML = `
            <div class="folder-options">
                <!-- Folder header -->
                <div class="folder-options__header">
                    <span class="folder-options__icon">&#128193;</span>
                    <span class="folder-options__name">
                        ${this._esc(this._folderName)}
                    </span>
                </div>
                <div class="folder-options__summary">
                    ${this._esc(this._t('upload.folder.summary', { files: fileCount, folders: folderCount, size: this._fmt(totalSize) }))}
                </div>

                <!-- Compression -->
                <div class="folder-options__section">
                    <label for="folder-compression" class="folder-options__label">
                        ${this._esc(this._t('upload.folder.compression'))}
                    </label>
                    <select id="folder-compression" class="folder-options__select">
                        <option value="0" ${opts.level === 0 ? 'selected' : ''}>${this._esc(this._t('upload.folder.level_0'))}</option>
                        <option value="4" ${opts.level === 4 ? 'selected' : ''}>${this._esc(this._t('upload.folder.level_4'))}</option>
                        <option value="6" ${opts.level === 6 ? 'selected' : ''}>${this._esc(this._t('upload.folder.level_6'))}</option>
                        <option value="9" ${opts.level === 9 ? 'selected' : ''}>${this._esc(this._t('upload.folder.level_9'))}</option>
                    </select>
                </div>

                <!-- Options -->
                <div class="folder-options__section folder-options__checkboxes">
                    <label class="folder-options__checkbox-label">
                        <input type="checkbox" id="folder-include-empty" ${opts.includeEmpty ? 'checked' : ''}>
                        ${this._esc(this._t('upload.folder.include_empty'))}
                    </label>
                    <label class="folder-options__checkbox-label">
                        <input type="checkbox" id="folder-include-hidden" ${opts.includeHidden ? 'checked' : ''}>
                        ${this._esc(this._t('upload.folder.include_hidden'))}
                    </label>
                </div>

                <!-- Actions -->
                <div class="folder-options__section folder-options__actions">
                    <button class="btn btn-sm" id="folder-cancel-btn">
                        ${this._esc(this._t('upload.folder.cancel'))}
                    </button>
                    <button class="btn btn-primary btn-sm" id="folder-upload-btn">
                        ${this._esc(this._t('upload.folder.compress_upload'))}
                    </button>
                </div>
            </div>
        `;
    }

    // ─── File ready state ───────────────────────────────────────────────────

    _renderFileReady() {
        const file     = this._selectedFile;
        const isFolder = !!this._folderScan;

        let icon, name, meta;

        if (isFolder) {
            icon = this._typeIcon('folder');
            name = this._folderName + '/';
            const breakdown = this._getFolderBreakdown(this._folderScan);
            meta = `${this._folderScan.fileCount} files &middot; ${this._fmt(this._folderScan.totalSize)}`;
            if (breakdown) {
                meta += `<div class="file-breakdown">${this._esc(breakdown)}</div>`;
            }
        } else if (file) {
            const info = this._getFileTypeInfo(file);
            icon = info.icon;
            name = file.name;
            const typeParts = [];
            if (info.label) typeParts.push(info.label);
            if (info.ext)   typeParts.push(this._esc(info.ext));
            const typeLabel = typeParts.length > 0 ? typeParts.join(' &middot; ') + ' &middot; ' : '';
            meta = `${typeLabel}${this._fmt(file.size)}`;
        } else {
            icon = this._typeIcon('default');
            name = '';
            meta = '';
        }

        const tooLarge = file && file.size > this._maxFileSize;
        const largeWarning = file && file.size > 2 * 1024 * 1024 * 1024
            ? '<div class="large-warning">Large files may take several minutes to encrypt. Keep this tab open.</div>'
            : '';

        if (tooLarge) {
            this._container.innerHTML = `
                <div class="file-summary file-summary--error">
                    <span class="file-summary__icon">${icon}</span>
                    <div>
                        <div class="file-summary__name">${this._esc(name)}</div>
                        <div class="file-summary__meta">${meta}</div>
                        <div class="file-summary__meta" style="color: var(--color-error, #FF6B6B);">
                            File too large. Maximum: ${this._esc(this._fmt(this._maxFileSize))}
                        </div>
                    </div>
                </div>
                <button class="back-link" id="back-to-idle">&larr; Choose a different file</button>
            `;
            return;
        }

        // Image thumbnail preview
        let thumbnailHtml = '';
        if (this._thumbnailUrl) {
            thumbnailHtml = `
                <div class="thumbnail">
                    <img src="${this._thumbnailUrl}" alt="Preview" class="thumbnail__img">
                </div>
            `;
        }

        this._container.innerHTML = `
            <div class="file-summary">
                <span class="file-summary__icon file-icon">${icon}</span>
                <div class="file-info">
                    <div class="file-summary__name">${this._esc(name)}</div>
                    <div class="file-summary__meta">${meta}</div>
                </div>
                <div class="file-summary__status">&#10003; Ready</div>
            </div>
            ${thumbnailHtml}
            ${largeWarning}
            <div style="text-align: center; margin-top: var(--space-4, 1rem);">
                <button class="btn btn-primary" id="continue-to-delivery">Choose how to share it &rarr;</button>
            </div>
            <button class="back-link" id="back-to-idle">&larr; Choose a different file</button>
        `;
    }

    // ─── Event listeners ────────────────────────────────────────────────────

    _setupListeners() {
        const sr = this.shadowRoot;

        // Drop zone (idle state)
        const dropZone = sr.querySelector('#drop-zone');
        if (dropZone) {
            dropZone.addEventListener('dragover',  this._boundOnDragOver);
            dropZone.addEventListener('dragenter', this._boundOnDragEnter);
            dropZone.addEventListener('dragleave', this._boundOnDragLeave);
            dropZone.addEventListener('drop',      this._boundOnDrop);

            // Click on drop zone triggers file browse
            dropZone.addEventListener('click', (e) => {
                // Don't trigger if clicking a button or input
                if (e.target.closest('button') || e.target.closest('input')) return;
                const fileInput = sr.querySelector('#file-input');
                if (fileInput) fileInput.click();
            });
        }

        // Browse file button
        const browseFileBtn = sr.querySelector('#browse-file-btn');
        if (browseFileBtn) {
            browseFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileInput = sr.querySelector('#file-input');
                if (fileInput) fileInput.click();
            });
        }

        // Browse folder button
        const browseFolderBtn = sr.querySelector('#browse-folder-btn');
        if (browseFolderBtn) {
            browseFolderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderInput = sr.querySelector('#folder-input');
                if (folderInput) folderInput.click();
            });
        }

        // File input change
        const fileInput = sr.querySelector('#file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this._emit('step-file-selected', { files: e.target.files });
                }
            });
        }

        // Folder input change
        const folderInput = sr.querySelector('#folder-input');
        if (folderInput) {
            folderInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this._emit('step-folder-selected', { files: e.target.files });
                }
            });
        }

        // Paste listener (document-level, only when idle)
        document.removeEventListener('paste', this._boundOnPaste);
        if (this._state === 'idle') {
            document.addEventListener('paste', this._boundOnPaste);
        }

        // Folder options buttons
        const folderCancelBtn = sr.querySelector('#folder-cancel-btn');
        if (folderCancelBtn) {
            folderCancelBtn.addEventListener('click', () => {
                this._emit('step-folder-cancel');
            });
        }

        const folderUploadBtn = sr.querySelector('#folder-upload-btn');
        if (folderUploadBtn) {
            folderUploadBtn.addEventListener('click', () => {
                const compressionEl  = sr.querySelector('#folder-compression');
                const includeEmptyEl = sr.querySelector('#folder-include-empty');
                const includeHiddenEl = sr.querySelector('#folder-include-hidden');
                const options = {
                    level:         compressionEl  ? parseInt(compressionEl.value, 10)  : this._folderOptions.level,
                    includeEmpty:  includeEmptyEl ? includeEmptyEl.checked             : this._folderOptions.includeEmpty,
                    includeHidden: includeHiddenEl ? includeHiddenEl.checked           : this._folderOptions.includeHidden,
                };
                this._emit('step-folder-upload', { options });
            });
        }

        // File ready buttons
        const continueBtn = sr.querySelector('#continue-to-delivery');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                this._emit('step-continue');
            });
        }

        const backBtn = sr.querySelector('#back-to-idle');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this._emit('step-back-to-idle');
            });
        }

        // Mode toggle (file/secret)
        const modeFileBtn   = sr.querySelector('#mode-file');
        const modeSecretBtn = sr.querySelector('#mode-secret');
        if (modeFileBtn) {
            modeFileBtn.addEventListener('click', () => {
                if (this._inputMode !== 'file') { this._inputMode = 'file'; this.render(); }
            });
        }
        if (modeSecretBtn) {
            modeSecretBtn.addEventListener('click', () => {
                if (this._inputMode !== 'secret') { this._inputMode = 'secret'; this.render(); }
            });
        }

        // Secret mode: char counter + enable/disable send button
        const secretInput   = sr.querySelector('#secret-input');
        const secretCount   = sr.querySelector('#secret-char-count');
        const secretSendBtn = sr.querySelector('#secret-send-btn');
        if (secretInput) {
            secretInput.addEventListener('input', () => {
                const len = secretInput.value.length;
                if (secretCount)   secretCount.textContent = len + ' characters';
                if (secretSendBtn) secretSendBtn.disabled  = !secretInput.value.trim();
            });
        }

        // Secret mode: pill toggle buttons
        sr.querySelectorAll('.secret-pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                const name = pill.dataset.name;
                sr.querySelectorAll(`.secret-pill[data-name="${name}"]`).forEach((p) => {
                    p.classList.remove('secret-pill--active');
                });
                pill.classList.add('secret-pill--active');
            });
        });

        // Secret mode: send button
        if (secretSendBtn) {
            secretSendBtn.addEventListener('click', () => {
                const ta = sr.querySelector('#secret-input');
                if (!ta || !ta.value.trim()) return;

                const maxDlPill  = sr.querySelector('.secret-pill[data-name="max-dl"].secret-pill--active');
                const expiryPill = sr.querySelector('.secret-pill[data-name="expiry"].secret-pill--active');

                const maxDownloads   = maxDlPill  ? parseInt(maxDlPill.dataset.value,  10) : 1;
                const expiresInHours = expiryPill ? parseInt(expiryPill.dataset.value, 10) : 24;

                this._emit('step-secret-submit', {
                    text:   ta.value,
                    config: { maxDownloads, expiresInHours }
                });
            });
        }
    }

    // ─── Drag and drop handlers ─────────────────────────────────────────────

    _onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    _onDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this._dragCounter++;
        if (this._dragCounter === 1) {
            const dropZone = this.shadowRoot.querySelector('#drop-zone');
            if (dropZone) {
                dropZone.classList.add('dragover');
                const label = dropZone.querySelector('.drop-zone__label');
                if (label && !label._originalText) {
                    label._originalText = label.textContent;
                    label.textContent = 'Release to upload';
                }
            }
        }
    }

    _onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this._dragCounter--;
        if (this._dragCounter <= 0) {
            this._dragCounter = 0;
            const dropZone = this.shadowRoot.querySelector('#drop-zone');
            if (dropZone) {
                dropZone.classList.remove('dragover');
                const label = dropZone.querySelector('.drop-zone__label');
                if (label && label._originalText) {
                    label.textContent = label._originalText;
                    label._originalText = null;
                }
            }
        }
    }

    _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this._dragCounter = 0;
        const dropZone = this.shadowRoot.querySelector('#drop-zone');
        if (dropZone) {
            dropZone.classList.remove('dragover');
            const label = dropZone.querySelector('.drop-zone__label');
            if (label && label._originalText) {
                label.textContent = label._originalText;
                label._originalText = null;
            }
        }
        this._emit('step-file-dropped', {
            files: e.dataTransfer.files,
            items: e.dataTransfer.items,
        });
    }

    _onPaste(e) {
        if (this._state !== 'idle') return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const f = items[i].getAsFile();
                if (f) files.push(f);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            this._emit('step-paste', { files });
        }
    }

    // ─── Event emission ─────────────────────────────────────────────────────

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, {
            bubbles: true,
            composed: true,
            detail: detail || {},
        }));
    }

    // ─── Helper methods ─────────────────────────────────────────────────────

    _t(key, params) {
        return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key;
    }

    _esc(str) {
        return (typeof SendHelpers !== 'undefined') ? SendHelpers.escapeHtml(str) : String(str);
    }

    _fmt(bytes) {
        return (typeof SendHelpers !== 'undefined') ? SendHelpers.formatBytes(bytes) : bytes + ' B';
    }

    _typeIcon(type) {
        if (typeof UploadFileUtils !== 'undefined') {
            return UploadFileUtils.TYPE_ICONS[type] || UploadFileUtils.TYPE_ICONS['default'];
        }
        // Fallback icons
        var fallback = {
            'image': '\uD83D\uDDBC\uFE0F', 'pdf': '\uD83D\uDCC4', 'markdown': '\uD83D\uDCDD',
            'video': '\uD83C\uDFA5', 'audio': '\uD83C\uDFB5', 'code': '\uD83D\uDCBB',
            'zip': '\uD83D\uDCE6', 'text': '\uD83D\uDCC3', 'folder': '\uD83D\uDCC1',
            'default': '\uD83D\uDCC4',
        };
        return fallback[type] || fallback['default'];
    }

    _getFileTypeInfo(file) {
        if (typeof UploadFileUtils !== 'undefined') {
            return UploadFileUtils.getFileTypeInfo(file);
        }
        // Minimal fallback
        return { icon: this._typeIcon('default'), label: '', ext: '', type: null };
    }

    _isImageFile(file) {
        if (typeof UploadFileUtils !== 'undefined') {
            return UploadFileUtils.isImageFile(file);
        }
        return false;
    }

    _getFolderBreakdown(folderScan) {
        if (typeof UploadFileUtils !== 'undefined') {
            return UploadFileUtils.getFolderBreakdown(folderScan);
        }
        return '';
    }
}

customElements.define('upload-step-select', UploadStepSelect);
