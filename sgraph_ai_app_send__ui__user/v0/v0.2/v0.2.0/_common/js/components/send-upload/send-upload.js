/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Component
   v0.2.0 — Consolidated from v0.1.0 → v0.1.8 (7 IFD layers merged)

   Merged layers:
     v0.1.0  — Base upload (drop zone, encrypt, upload, result)
     v0.1.1  — Hash-fragment URLs (#transferId/key)
     v0.1.2  — File/Text mode tabs, text input
     v0.1.4  — i18n, presigned multipart, SGMETA envelope, capabilities check
     v0.1.5  — Workflow timing capture, token usage counter
     v0.1.6  — Dark-theme-aware renderResult with design system tokens
     v0.1.8  — Download URL points to v0.2.0 download page

   Design: Each render method is a separate overridable method.
   v0.2.1+ can surgically override individual methods without touching others.

   Usage:  <send-upload></send-upload>
   Emits:  'upload-complete' — { detail: { transferId, downloadUrl, key } }
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendUpload extends HTMLElement {

    constructor() {
        super();
        this.selectedFile      = null;
        this._mode             = 'file';
        this.state             = 'idle';
        this._boundDragOver    = null;
        this._boundDragLeave   = null;
        this._boundDrop        = null;
        this._boundFileInput   = null;
        this._boundDropClick   = null;
        this._boundUploadClick = null;
        this._showSeparateKey  = false;
        this._stageTimestamps  = {};
        this._folderScan       = null;          // { entries, fileCount, folderCount, totalSize }
        this._folderName       = null;          // Name of the dropped/selected folder
        this._folderOptions    = { level: 4, includeEmpty: false, includeHidden: false };
        this._localeHandler    = () => { if (this.state === 'idle' || this.state === 'complete') { this.render(); this.setupEventListeners(); } };
    }

    connectedCallback() {
        if (this._mode === undefined) this._mode = 'file';
        if (this.state === undefined) this.state = 'idle';
        this.render();
        this.setupEventListeners();
        document.addEventListener('locale-changed', this._localeHandler);
        this._checkCapabilities();
    }

    disconnectedCallback() {
        this.cleanup();
        this._setBeforeUnload(false);
        document.removeEventListener('locale-changed', this._localeHandler);
    }

    // ─── Shorthand ───────────────────────────────────────────────────────

    t(key, params) { return I18n.t(key, params); }
    escapeHtml(str) { return SendHelpers.escapeHtml(str); }
    formatBytes(bytes) { return SendHelpers.formatBytes(bytes); }

    // ─── Capabilities Check ──────────────────────────────────────────────

    async _checkCapabilities() {
        try {
            const caps = await ApiClient.getCapabilities();
            this._capabilities = caps;
            if (caps.presigned_upload || caps.multipart_upload) {
                SendUpload.MAX_FILE_SIZE = SendUpload.MAX_FILE_SIZE_PRESIGNED;
            } else {
                SendUpload.MAX_FILE_SIZE = SendUpload.MAX_FILE_SIZE_DIRECT;
            }
            if (this.state === 'idle') { this.render(); this.setupEventListeners(); }
        } catch (e) { /* keep default 5MB limit */ }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Rendering — each method is overridable for v0.2.1+
    // ═══════════════════════════════════════════════════════════════════════

    render() {
        this._stageTimestamps[this.state] = Date.now();
        this.innerHTML = `
            <div class="card">
                ${this.renderModeTabs()}
                ${this.renderDropZone()}
                ${this.renderTextInput()}
                ${this.renderFolderOptions()}
                ${this.renderFileInfo()}
                ${this.renderProgress()}
                ${this.renderResult()}
                ${this.renderError()}
            </div>
        `;
    }

    renderModeTabs() {
        if (this.state === 'complete') return '';
        const fileActive = this._mode === 'file' ? 'btn-primary' : '';
        const textActive = this._mode === 'text' ? 'btn-primary' : '';
        return `
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button class="btn btn-sm ${fileActive}" id="mode-file">${this.escapeHtml(this.t('upload.mode.file'))}</button>
                <button class="btn btn-sm ${textActive}" id="mode-text">${this.escapeHtml(this.t('upload.mode.text'))}</button>
            </div>
        `;
    }

    _isUploading() { return !!SendUpload.PROGRESS_STAGES[this.state]; }

    renderDropZone() {
        if (this.state === 'complete' || this.state === 'folder-options' || this._mode !== 'file') return '';
        const hidden = this._isUploading() || this.state === 'zipping' ? 'hidden' : '';
        return `
            <div class="drop-zone ${hidden}" id="drop-zone">
                <div class="drop-zone__label">${this.escapeHtml(this.t('upload.drop_zone.label'))}</div>
                <div style="display: flex; gap: var(--space-2, 0.5rem); margin-top: var(--space-2, 0.5rem); justify-content: center;">
                    <button class="btn btn-sm" id="browse-file-btn">${this.escapeHtml(this.t('upload.drop_zone.browse_file'))}</button>
                    <button class="btn btn-sm" id="browse-folder-btn">${this.escapeHtml(this.t('upload.drop_zone.browse_folder'))}</button>
                </div>
                <div class="drop-zone__hint" style="margin-top: 0.5rem;">${this.escapeHtml(this.t('upload.drop_zone.encrypted_hint'))}</div>
                <div class="drop-zone__hint" style="margin-top: 0.25rem; font-size: var(--text-small); opacity: 0.7;">${this.escapeHtml(this.t('upload.drop_zone.size_limit', { limit: this.formatBytes(SendUpload.MAX_FILE_SIZE) }))}</div>
                <input type="file" id="file-input" style="display: none;">
                <input type="file" id="folder-input" style="display: none;" webkitdirectory>
            </div>
        `;
    }

    renderTextInput() {
        if (this.state === 'complete' || this._mode !== 'text') return '';
        const hidden = this._isUploading() ? 'hidden' : '';
        return `
            <div class="${hidden}">
                <textarea class="input" id="text-input"
                          placeholder="${this.escapeHtml(this.t('upload.text.placeholder'))}"
                          style="width: 100%; min-height: 150px; resize: vertical; font-family: inherit; box-sizing: border-box;"
                          spellcheck="true"></textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem;">
                    <span style="font-size: var(--text-sm); color: var(--color-text-secondary);" id="text-char-count">${this.escapeHtml(this.t('upload.text.char_count', { count: 0 }))}</span>
                    <button class="btn btn-primary btn-sm" id="upload-btn"
                            ${this.state !== 'idle' ? 'disabled' : ''}>
                        ${this.t('upload.button.encrypt_send')}
                    </button>
                </div>
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-top: 0.5rem; text-align: center;">
                    ${this.escapeHtml(this.t('upload.text.drop_hint'))}
                </div>
            </div>
        `;
    }

    renderFileInfo() {
        if (!this.selectedFile || this.state === 'complete' || this._mode !== 'file') return '';
        const tooLarge = this.selectedFile.size > SendUpload.MAX_FILE_SIZE;
        return `
            <div class="status ${tooLarge ? 'status--error' : 'status--info'}" style="display: flex; justify-content: space-between; align-items: center;">
                <span>
                    <strong>${this.escapeHtml(this.selectedFile.name)}</strong> (${this.formatBytes(this.selectedFile.size)})
                    ${tooLarge ? '<br><small>' + this.escapeHtml(this.t('upload.error.file_too_large')) + '</small>' : ''}
                </span>
                <button class="btn btn-primary btn-sm" id="upload-btn"
                        ${(this.state !== 'idle' || tooLarge) ? 'disabled' : ''}>
                    ${this.t('upload.button.encrypt_upload')}
                </button>
            </div>
        `;
    }

    static MAX_FILE_SIZE_DIRECT    = 5 * 1024 * 1024;
    static MAX_FILE_SIZE_PRESIGNED = 1024 * 1024 * 1024;
    static MAX_FILE_SIZE           = 5 * 1024 * 1024;

    static PROGRESS_STAGES = {
        'zipping':    { label: 'upload.progress.zipping',    pct: 5  },
        'reading':    { label: 'upload.progress.reading',    pct: 10 },
        'encrypting': { label: 'upload.progress.encrypting', pct: 30 },
        'creating':   { label: 'upload.progress.creating',   pct: 50 },
        'uploading':  { label: 'upload.progress.uploading',  pct: 70 },
        'completing': { label: 'upload.progress.completing', pct: 90 },
    };

    renderFolderOptions() {
        if (this.state !== 'folder-options' || !this._folderScan) return '';
        const { fileCount, folderCount, totalSize } = this._folderScan;
        const opts = this._folderOptions;

        const selectStyle = `width: 100%; background: var(--bg-secondary, #16213E); color: var(--color-text, #E0E0E0); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius-sm, 6px); padding: 0.5rem 0.625rem; font-size: var(--text-sm, 0.875rem); appearance: auto;`;
        const sectionBorder = `border-top: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); padding-top: var(--space-3, 0.75rem); margin-top: var(--space-3, 0.75rem);`;

        return `
            <div style="background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius-md, 12px); padding: var(--space-4, 1rem); text-align: left;">

                <!-- Folder header -->
                <div style="display: flex; align-items: center; gap: var(--space-2, 0.5rem); margin-bottom: var(--space-1, 0.25rem);">
                    <span style="font-size: 1.25rem; line-height: 1;">&#128193;</span>
                    <span style="font-weight: var(--weight-semibold, 600); font-size: var(--text-body, 1rem);">
                        ${this.escapeHtml(this._folderName)}
                    </span>
                </div>
                <div style="font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-2, 0.5rem); padding-left: 1.75rem;">
                    ${this.escapeHtml(this.t('upload.folder.summary', { files: fileCount, folders: folderCount, size: this.formatBytes(totalSize) }))}
                </div>

                <!-- Compression -->
                <div style="${sectionBorder}">
                    <label for="folder-compression" style="display: block; font-size: var(--text-sm, 0.875rem); font-weight: var(--weight-semibold, 600); color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-2, 0.5rem);">
                        ${this.escapeHtml(this.t('upload.folder.compression'))}
                    </label>
                    <select id="folder-compression" style="${selectStyle}">
                        <option value="0" ${opts.level === 0 ? 'selected' : ''}>${this.escapeHtml(this.t('upload.folder.level_0'))}</option>
                        <option value="4" ${opts.level === 4 ? 'selected' : ''}>${this.escapeHtml(this.t('upload.folder.level_4'))}</option>
                        <option value="6" ${opts.level === 6 ? 'selected' : ''}>${this.escapeHtml(this.t('upload.folder.level_6'))}</option>
                        <option value="9" ${opts.level === 9 ? 'selected' : ''}>${this.escapeHtml(this.t('upload.folder.level_9'))}</option>
                    </select>
                </div>

                <!-- Options -->
                <div style="${sectionBorder} display: flex; flex-direction: column; gap: var(--space-2, 0.5rem);">
                    <label style="display: flex; align-items: center; gap: var(--space-2, 0.5rem); font-size: var(--text-sm, 0.875rem); cursor: pointer;">
                        <input type="checkbox" id="folder-include-empty" ${opts.includeEmpty ? 'checked' : ''}>
                        ${this.escapeHtml(this.t('upload.folder.include_empty'))}
                    </label>
                    <label style="display: flex; align-items: center; gap: var(--space-2, 0.5rem); font-size: var(--text-sm, 0.875rem); cursor: pointer;">
                        <input type="checkbox" id="folder-include-hidden" ${opts.includeHidden ? 'checked' : ''}>
                        ${this.escapeHtml(this.t('upload.folder.include_hidden'))}
                    </label>
                </div>

                <!-- Actions -->
                <div style="${sectionBorder} display: flex; gap: var(--space-2, 0.5rem); justify-content: flex-end;">
                    <button class="btn btn-sm" id="folder-cancel-btn">
                        ${this.escapeHtml(this.t('upload.folder.cancel'))}
                    </button>
                    <button class="btn btn-primary btn-sm" id="folder-upload-btn">
                        ${this.escapeHtml(this.t('upload.folder.compress_upload'))}
                    </button>
                </div>
            </div>
        `;
    }

    renderProgress() {
        const stage = SendUpload.PROGRESS_STAGES[this.state];
        if (!stage) return '';
        return `
            <div style="margin: 1rem 0;">
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${this.escapeHtml(this.t(stage.label))}
                </div>
                <div class="progress-bar">
                    <div class="progress-bar__fill" style="width: ${stage.pct}%;"></div>
                </div>
            </div>
        `;
    }

    renderResult() {
        if (this.state !== 'complete' || !this.result) return '';
        const { combinedUrl, linkOnlyUrl, keyString, transparency } = this.result;
        const successKey = this.result.isText ? 'upload.result.text_success' : 'upload.result.file_success';

        const monoStyle   = "font-family: var(--font-mono, monospace); font-size: var(--text-sm, 0.875rem);";
        const valueBoxStyle = `${monoStyle} flex: 1; min-width: 0; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius-sm, 6px); padding: 0.375rem 0.5rem; white-space: nowrap; overflow-x: auto; color: var(--color-text, #E0E0E0);`;

        const separateSection = this._showSeparateKey ? `
            <div style="margin-top: var(--space-3, 0.75rem); padding: var(--space-4, 1rem); background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius-md, 12px);">
                <div style="margin-bottom: var(--space-3, 0.75rem);">
                    <label style="display: block; font-weight: var(--weight-semibold, 600); font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-1, 0.25rem);">
                        ${this.escapeHtml(this.t('upload.result.link_only'))}
                    </label>
                    <div style="display: flex; gap: var(--space-2, 0.5rem); align-items: center;">
                        <div style="${valueBoxStyle}" id="link-only">${this.escapeHtml(linkOnlyUrl)}</div>
                        <button class="btn btn-copy btn-sm" data-copy="link-only">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                    </div>
                </div>
                <div style="margin-bottom: var(--space-3, 0.75rem);">
                    <label style="display: block; font-weight: var(--weight-semibold, 600); font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-1, 0.25rem);">
                        ${this.escapeHtml(this.t('upload.result.decryption_key'))}
                    </label>
                    <div style="display: flex; gap: var(--space-2, 0.5rem); align-items: center;">
                        <div style="${valueBoxStyle}" id="decryption-key">${this.escapeHtml(keyString)}</div>
                        <button class="btn btn-copy btn-sm" data-copy="decryption-key">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                    </div>
                </div>
                <div class="guidance">${this.t('upload.guidance.split_channels')}</div>
            </div>
        ` : '';

        return `
            <div class="status status--success">${this.escapeHtml(this.t(successKey))}</div>
            <div id="token-usage" class="token-usage" style="display: none; margin-top: var(--space-2, 0.5rem); font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); text-align: center;"></div>
            <div style="margin-top: var(--space-4, 1rem);">
                <label style="display: block; font-weight: var(--weight-semibold, 600); font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-2, 0.5rem);">
                    ${this.escapeHtml(this.t('upload.result.share_link'))}
                </label>
                <div style="background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius-sm, 6px); padding: 0.5rem 0.75rem; ${monoStyle} white-space: nowrap; overflow-x: auto; color: var(--color-text, #E0E0E0);" id="combined-link">${this.escapeHtml(combinedUrl)}</div>
                <div style="display: flex; gap: var(--space-2, 0.5rem); margin-top: var(--space-3, 0.75rem); flex-wrap: wrap; align-items: center;">
                    <button class="btn btn-primary btn-sm" data-copy="combined-link">${this.escapeHtml(this.t('upload.result.copy_link'))}</button>
                    <a href="${this.escapeHtml(combinedUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="text-decoration: none;">${this.escapeHtml(this.t('upload.result.open_tab'))}</a>
                    <button class="btn btn-sm" id="toggle-separate-key" style="margin-left: auto; font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0);">
                        ${this.escapeHtml(this._showSeparateKey ? this.t('upload.result.hide_key') : this.t('upload.result.show_separate_key'))}
                    </button>
                </div>
            </div>
            ${separateSection}
            ${this._renderTimings()}
            ${transparency ? '<send-transparency id="transparency-panel"></send-transparency>' : ''}
            <div style="margin-top: var(--space-6, 1.5rem); text-align: center;">
                <button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">
                    ${this.escapeHtml(this.t('upload.result.send_another'))}
                </button>
            </div>
        `;
    }

    renderError() {
        if (this.state !== 'error' || !this.errorMessage) return '';
        return `<div class="status status--error">${this.escapeHtml(this.errorMessage)}</div>`;
    }

    // ─── Timing Display (from v0.1.5/v0.1.6) ────────────────────────────

    _renderTimings() {
        if (!this._stageTimestamps || !this._stageTimestamps.complete) return '';

        const allStages = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing', 'complete'];
        const stages = allStages.filter(s => this._stageTimestamps[s] !== undefined);
        if (stages.length < 2) return '';
        const totalMs = this._stageTimestamps.complete - this._stageTimestamps[stages[0]];
        const rows = [];

        for (let i = 0; i < stages.length - 1; i++) {
            const from = stages[i];
            const to   = stages[i + 1];
            if (this._stageTimestamps[from] && this._stageTimestamps[to]) {
                const ms  = this._stageTimestamps[to] - this._stageTimestamps[from];
                const pct = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
                const label = this.t(SendUpload.PROGRESS_STAGES[from]?.label || from).replace('...', '');
                rows.push(`
                    <div style="display: flex; align-items: center; gap: var(--space-2, 0.5rem); font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0);">
                        <span style="min-width: 110px;">${this.escapeHtml(label)}</span>
                        <div style="flex: 1; height: 4px; background: var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: 2px; overflow: hidden;">
                            <div style="width: ${pct}%; height: 100%; background: var(--accent, #4ECDC4); border-radius: 2px;"></div>
                        </div>
                        <span style="min-width: 50px; text-align: right; font-family: var(--font-mono, monospace);">${ms}ms</span>
                    </div>
                `);
            }
        }

        if (rows.length === 0) return '';

        return `
            <div style="margin-top: var(--space-3, 0.75rem); padding: var(--space-3, 0.75rem); background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: var(--radius-sm, 6px);">
                <div style="font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #8892A0); margin-bottom: var(--space-2, 0.5rem); font-weight: var(--weight-semibold, 600);">
                    ${this.escapeHtml(this.t('upload.timing.title'))} ${(totalMs / 1000).toFixed(2)}s
                </div>
                <div style="display: flex; flex-direction: column; gap: var(--space-1, 0.25rem);">
                    ${rows.join('')}
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Event Listeners
    // ═══════════════════════════════════════════════════════════════════════

    setupEventListeners() {
        const modeFile = this.querySelector('#mode-file');
        const modeText = this.querySelector('#mode-text');
        if (modeFile) modeFile.addEventListener('click', () => this.switchMode('file'));
        if (modeText) modeText.addEventListener('click', () => this.switchMode('text'));

        const dropZone  = this.querySelector('#drop-zone');
        const fileInput = this.querySelector('#file-input');

        if (dropZone) {
            this._boundDragOver  = (e) => this.handleDragOver(e);
            this._boundDragLeave = (e) => this.handleDragLeave(e);
            this._boundDrop      = (e) => this.handleDrop(e);

            dropZone.addEventListener('dragover',  this._boundDragOver);
            dropZone.addEventListener('dragleave', this._boundDragLeave);
            dropZone.addEventListener('drop',      this._boundDrop);
        }

        const browseFileBtn   = this.querySelector('#browse-file-btn');
        const browseFolderBtn = this.querySelector('#browse-folder-btn');
        if (browseFileBtn)   browseFileBtn.addEventListener('click',   (e) => { e.stopPropagation(); fileInput && fileInput.click(); });
        if (browseFolderBtn) browseFolderBtn.addEventListener('click', (e) => { e.stopPropagation(); const fi = this.querySelector('#folder-input'); if (fi) fi.click(); });

        if (fileInput) {
            this._boundFileInput = (e) => this.handleFileSelect(e);
            fileInput.addEventListener('change', this._boundFileInput);
        }

        const folderInput = this.querySelector('#folder-input');
        if (folderInput) {
            this._boundFolderInput = (e) => this.handleFolderSelect(e);
            folderInput.addEventListener('change', this._boundFolderInput);
        }

        // Folder options panel listeners
        const folderUploadBtn = this.querySelector('#folder-upload-btn');
        if (folderUploadBtn) folderUploadBtn.addEventListener('click', () => this._startFolderZip());

        const folderCancelBtn = this.querySelector('#folder-cancel-btn');
        if (folderCancelBtn) folderCancelBtn.addEventListener('click', () => this.resetForNew());

        const textInput = this.querySelector('#text-input');
        if (textInput) {
            textInput.addEventListener('input', () => {
                const counter = this.querySelector('#text-char-count');
                if (counter) counter.textContent = this.t('upload.text.char_count', { count: textInput.value.length });
            });
            textInput.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); textInput.style.borderColor = 'var(--accent)'; });
            textInput.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); textInput.style.borderColor = ''; });
            textInput.addEventListener('drop', (e) => {
                e.preventDefault(); e.stopPropagation();
                textInput.style.borderColor = '';
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    if (file.type.startsWith('text/') || /\.(txt|md|json|csv|xml|html|css|js|ts|py|yml|yaml|log|ini|cfg|conf|sh|bat)$/i.test(file.name)) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            textInput.value = reader.result;
                            const counter = this.querySelector('#text-char-count');
                            if (counter) counter.textContent = this.t('upload.text.char_count', { count: textInput.value.length });
                        };
                        reader.readAsText(file);
                    }
                }
            });
        }

        this.setupDynamicListeners();
    }

    setupDynamicListeners() {
        const uploadBtn = this.querySelector('#upload-btn');
        if (uploadBtn) {
            this._boundUploadClick = () => this.startUpload();
            uploadBtn.addEventListener('click', this._boundUploadClick);
        }

        this.querySelectorAll('[data-copy]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-copy');
                const el = this.querySelector(`#${targetId}`);
                if (el) this.copyToClipboard(el.textContent, e.target);
            });
        });

        const toggleBtn = this.querySelector('#toggle-separate-key');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this._showSeparateKey = !this._showSeparateKey;
                this.render();
                this.setupDynamicListeners();
            });
        }

        const transparencyPanel = this.querySelector('#transparency-panel');
        if (transparencyPanel && this.result && this.result.transparency) {
            transparencyPanel.setData(this.result.transparency);
        }

        const sendAnotherBtn = this.querySelector('#send-another-btn');
        if (sendAnotherBtn) {
            sendAnotherBtn.addEventListener('click', () => this.resetForNew());
        }
    }

    resetForNew() {
        this.selectedFile     = null;
        this._mode            = 'file';
        this.state            = 'idle';
        this.result           = null;
        this.errorMessage     = null;
        this._showSeparateKey = false;
        this._stageTimestamps = {};
        this._folderScan      = null;
        this._folderName      = null;
        this._folderOptions   = { level: 4, includeEmpty: false, includeHidden: false };
        this.render();
        this.setupEventListeners();
    }

    cleanup() {
        const dropZone    = this.querySelector('#drop-zone');
        const fileInput   = this.querySelector('#file-input');
        const folderInput = this.querySelector('#folder-input');
        if (dropZone) {
            if (this._boundDragOver)  dropZone.removeEventListener('dragover',  this._boundDragOver);
            if (this._boundDragLeave) dropZone.removeEventListener('dragleave', this._boundDragLeave);
            if (this._boundDrop)      dropZone.removeEventListener('drop',      this._boundDrop);
        }
        if (fileInput   && this._boundFileInput)   fileInput.removeEventListener('change',   this._boundFileInput);
        if (folderInput && this._boundFolderInput) folderInput.removeEventListener('change', this._boundFolderInput);
        this._boundDragOver = this._boundDragLeave = this._boundDrop = this._boundFileInput = this._boundUploadClick = this._boundFolderInput = null;
    }

    switchMode(mode) {
        if (this._mode === mode || this.state !== 'idle') return;
        this._mode = mode;
        this.render();
        this.setupEventListeners();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Drag and Drop
    // ═══════════════════════════════════════════════════════════════════════

    handleDragOver(e)  { e.preventDefault(); e.stopPropagation(); const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.add('dragover');    }
    handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.remove('dragover'); }

    handleDrop(e) {
        e.preventDefault(); e.stopPropagation();
        const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.remove('dragover');

        // Check if a folder was dropped
        const items = e.dataTransfer && e.dataTransfer.items;
        if (items && items.length > 0) {
            const entry = items[0].webkitGetAsEntry && items[0].webkitGetAsEntry();
            if (entry && entry.isDirectory) {
                this._handleFolderEntry(entry);
                return;
            }
        }

        // Single file (existing path)
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) { this.selectedFile = files[0]; this.state = 'idle'; this.render(); this.setupEventListeners(); }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files && files.length > 0) { this.selectedFile = files[0]; this.state = 'idle'; this.render(); this.setupEventListeners(); }
    }

    handleFolderSelect(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Build entries from the flat file list (webkitdirectory gives webkitRelativePath)
        const entries = [];
        const folderPaths = new Set();
        for (const file of files) {
            const relPath = file.webkitRelativePath || file.name;
            entries.push({ path: relPath.replace(/^[^/]+\//, ''), file, isDir: false, name: file.name });
            // Track folder paths
            const parts = relPath.split('/');
            for (let i = 1; i < parts.length; i++) {
                folderPaths.add(parts.slice(1, i).join('/') + '/');
            }
        }
        for (const fp of folderPaths) {
            if (fp && fp !== '/') entries.push({ path: fp, file: null, isDir: true, name: fp.split('/').filter(Boolean).pop() });
        }

        // Folder name is the common root
        const firstPath = files[0].webkitRelativePath || '';
        this._folderName = firstPath.split('/')[0] || 'folder';

        this._folderScan = {
            entries,
            fileCount:   entries.filter(e => !e.isDir).length,
            folderCount: entries.filter(e => e.isDir).length,
            totalSize:   entries.reduce((sum, e) => sum + (e.file ? e.file.size : 0), 0)
        };

        this.state = 'folder-options';
        this.render();
        this.setupEventListeners();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Upload Flow
    // ═══════════════════════════════════════════════════════════════════════

    _setBeforeUnload(active) {
        if (active && !this._beforeUnloadHandler) {
            this._beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ''; };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        } else if (!active && this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    async startUpload() {
        if (this.state !== 'idle') return;
        // Check crypto.subtle requires a secure context (HTTPS or localhost)
        if (!SendCrypto.isAvailable()) {
            this.errorMessage = this.t('crypto.error.unavailable');
            this.state = 'error'; this.render(); this.setupEventListeners(); return;
        }

        const isText = this._mode === 'text';
        let textValue = '';
        if (isText) {
            const ti = this.querySelector('#text-input');
            if (!ti || !ti.value.trim()) {
                this.errorMessage = this.t('upload.error.empty_text');
                this.state = 'error'; this.render(); this.setupEventListeners(); return;
            }
            textValue = ti.value;
        } else if (!this.selectedFile) { return;
        } else if (this.selectedFile.size > SendUpload.MAX_FILE_SIZE) {
            this.errorMessage = this.t('upload.error.file_too_large', { limit: this.formatBytes(SendUpload.MAX_FILE_SIZE) });
            this.state = 'error'; this.render(); this.setupEventListeners(); return;
        }

        try {
            this._setBeforeUnload(true);
            this._stageTimestamps = {};
            this.state = 'reading'; this.render(); this.setupEventListeners();

            let plaintext, fileSizeBytes, contentType;
            if (isText) {
                plaintext     = new TextEncoder().encode(textValue).buffer;
                fileSizeBytes = plaintext.byteLength;
                contentType   = 'text/plain';
            } else {
                const rawContent = await this.readFileAsArrayBuffer(this.selectedFile);
                contentType      = this.selectedFile.type || 'application/octet-stream';
                plaintext     = this.packageWithMetadata(rawContent, { filename: this.selectedFile.name });
                fileSizeBytes = plaintext.byteLength;
            }

            this.state = 'encrypting'; this.render();
            const key       = await SendCrypto.generateKey();
            const keyString = await SendCrypto.exportKey(key);
            const encrypted = await SendCrypto.encryptFile(key, plaintext);

            this.state = 'creating'; this.render();
            const createResult = await ApiClient.createTransfer(fileSizeBytes, contentType);

            this.state = 'uploading'; this.render();
            const usePresigned = encrypted.byteLength > SendUpload.MAX_FILE_SIZE_DIRECT
                              && this._capabilities
                              && this._capabilities.multipart_upload;
            if (usePresigned) {
                await this._uploadViaPresigned(createResult.transfer_id, encrypted);
            } else {
                await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
            }

            this.state = 'completing'; this.render();
            const completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

            const combinedUrl = this.buildCombinedUrl(createResult.transfer_id, keyString);
            const linkOnlyUrl = this.buildLinkOnlyUrl(createResult.transfer_id);

            this.result = { transferId: createResult.transfer_id, combinedUrl, linkOnlyUrl, keyString, isText, transparency: completeResult.transparency || null };
            this._setBeforeUnload(false);
            this.state = 'complete'; this.render(); this.setupDynamicListeners();

            this.dispatchEvent(new CustomEvent('upload-complete', {
                detail: { transferId: createResult.transfer_id, downloadUrl: combinedUrl, key: keyString },
                bubbles: true
            }));

        } catch (err) {
            this._setBeforeUnload(false);
            if (err.message === 'ACCESS_TOKEN_INVALID') { document.dispatchEvent(new CustomEvent('access-token-invalid')); return; }
            this.errorMessage = err.message || this.t('upload.error.upload_failed');
            this.state = 'error'; this.render(); this.setupEventListeners();
        }
    }

    // ─── Presigned Multipart Upload ──────────────────────────────────────

    static PARALLEL_UPLOADS = 5;

    async _uploadViaPresigned(transferId, encrypted) {
        const partSize = (this._capabilities && this._capabilities.max_part_size) || (10 * 1024 * 1024);
        const numParts = Math.ceil(encrypted.byteLength / partSize);
        const initResult = await ApiClient.initiateMultipart(transferId, encrypted.byteLength, numParts);
        const uploadId   = initResult.upload_id;
        const partUrls   = initResult.part_urls;

        try {
            const completedParts = new Array(partUrls.length);
            let partsCompleted = 0;

            const uploadOnePart = async (i) => {
                const start = i * partSize;
                const end   = Math.min(start + partSize, encrypted.byteLength);
                const partBuf = encrypted.slice(start, end);
                const etag = await ApiClient.uploadPart(partUrls[i].upload_url, partBuf);
                completedParts[i] = { part_number: partUrls[i].part_number, etag };
                partsCompleted++;
                const partPct = Math.round(70 + (20 * partsCompleted / partUrls.length));
                const bar = this.querySelector('.progress-bar__fill');
                if (bar) bar.style.width = `${partPct}%`;
                const label = bar?.parentElement?.previousElementSibling;
                if (label) label.textContent = this.t('upload.progress.uploading_part', { current: partsCompleted, total: partUrls.length });
            };

            const active  = new Set();
            const maxPool = SendUpload.PARALLEL_UPLOADS;
            for (let i = 0; i < partUrls.length; i++) {
                const p = uploadOnePart(i).then(() => active.delete(p));
                active.add(p);
                if (active.size >= maxPool) await Promise.race(active);
            }
            await Promise.all(active);

            await ApiClient.completeMultipart(transferId, uploadId, completedParts);
        } catch (err) {
            await ApiClient.abortMultipart(transferId, uploadId);
            throw err;
        }
    }

    // ─── SGMETA Envelope ─────────────────────────────────────────────────

    static SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41, 0x00];

    packageWithMetadata(contentBuffer, metadata) {
        const magic = SendUpload.SGMETA_MAGIC;
        const metaBytes = new TextEncoder().encode(JSON.stringify(metadata));
        const metaLen = metaBytes.length;
        const result = new Uint8Array(magic.length + 4 + metaLen + contentBuffer.byteLength);
        result.set(magic, 0);
        result[magic.length]     = (metaLen >> 24) & 0xFF;
        result[magic.length + 1] = (metaLen >> 16) & 0xFF;
        result[magic.length + 2] = (metaLen >> 8)  & 0xFF;
        result[magic.length + 3] = metaLen & 0xFF;
        result.set(metaBytes, magic.length + 4);
        result.set(new Uint8Array(contentBuffer), magic.length + 4 + metaLen);
        return result.buffer;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Folder Upload
    // ═══════════════════════════════════════════════════════════════════════

    /** Lazy-load JSZip only when folder upload is needed */
    async _loadJSZip() {
        if (typeof JSZip !== 'undefined') return;
        return new Promise((resolve, reject) => {
            const script  = document.createElement('script');
            const basePath = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.base) || '../_common';
            script.src    = `${basePath}/js/vendor/jszip.min.js`;
            script.onload = resolve;
            script.onerror = () => reject(new Error(this.t('upload.folder.error_jszip')));
            document.head.appendChild(script);
        });
    }

    /** Handle a dropped folder (FileSystemDirectoryEntry from webkitGetAsEntry) */
    async _handleFolderEntry(directoryEntry) {
        this._folderName = directoryEntry.name;
        const entries = await this._readDirectoryTree(directoryEntry);

        this._folderScan = {
            entries,
            fileCount:   entries.filter(e => !e.isDir).length,
            folderCount: entries.filter(e => e.isDir).length,
            totalSize:   entries.reduce((sum, e) => sum + (e.file ? e.file.size : 0), 0)
        };

        this.state = 'folder-options';
        this.render();
        this.setupEventListeners();
    }

    /** Recursively read all files from a FileSystemDirectoryEntry */
    async _readDirectoryTree(directoryEntry) {
        const results = [];

        const readEntries = (dirEntry, path) => {
            return new Promise((resolve, reject) => {
                const reader  = dirEntry.createReader();
                const allEntries = [];

                const readBatch = () => {
                    reader.readEntries(async (entries) => {
                        if (entries.length === 0) {
                            // Process all collected entries
                            for (const entry of allEntries) {
                                if (entry.isFile) {
                                    try {
                                        const file = await new Promise((res, rej) => entry.file(res, rej));
                                        results.push({ path: path + entry.name, file, isDir: false, name: entry.name });
                                    } catch (e) { /* skip unreadable files */ }
                                } else if (entry.isDirectory) {
                                    results.push({ path: path + entry.name + '/', file: null, isDir: true, name: entry.name });
                                    await readEntries(entry, path + entry.name + '/');
                                }
                            }
                            resolve();
                        } else {
                            allEntries.push(...entries);
                            readBatch();   // readEntries may not return all entries in one call
                        }
                    }, reject);
                };
                readBatch();
            });
        };

        await readEntries(directoryEntry, '');
        return results;
    }

    /** Read options from the folder options panel and start zipping */
    async _startFolderZip() {
        // Read current option values from the DOM
        const levelSelect     = this.querySelector('#folder-compression');
        const includeEmptyChk = this.querySelector('#folder-include-empty');
        const includeHiddenChk = this.querySelector('#folder-include-hidden');

        this._folderOptions = {
            level:         levelSelect     ? parseInt(levelSelect.value, 10) : 4,
            includeEmpty:  includeEmptyChk ? includeEmptyChk.checked : false,
            includeHidden: includeHiddenChk ? includeHiddenChk.checked : false
        };

        // Check total size
        const totalSize = this._folderScan.totalSize;
        if (totalSize > SendUpload.MAX_FILE_SIZE) {
            this.errorMessage = this.t('upload.folder.error_too_large', { limit: this.formatBytes(SendUpload.MAX_FILE_SIZE) });
            this.state = 'error'; this.render(); this.setupEventListeners();
            return;
        }

        try {
            this.state = 'zipping'; this.render();

            // Lazy-load JSZip
            await this._loadJSZip();

            const opts    = this._folderOptions;
            const entries = this._folderScan.entries.filter(e => {
                if (!opts.includeHidden && e.name.startsWith('.')) return false;
                if (e.isDir && !opts.includeEmpty) return false;
                return true;
            });

            const zip = new JSZip();
            for (const entry of entries) {
                if (entry.isDir) {
                    zip.folder(entry.path);
                } else {
                    const buffer = await entry.file.arrayBuffer();
                    zip.file(entry.path, buffer);
                }
            }

            const compression = opts.level === 0 ? 'STORE' : 'DEFLATE';
            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression,
                compressionOptions: { level: opts.level }
            });

            // Feed into existing pipeline as a File object
            this.selectedFile = new File([zipBlob], `${this._folderName}.zip`, { type: 'application/zip' });

            // Clear folder state and go straight to upload
            this._folderScan = null;
            this.state = 'idle';
            this.startUpload();
        } catch (err) {
            this.errorMessage = err.message || this.t('upload.folder.error_zip_failed');
            this.state = 'error'; this.render(); this.setupEventListeners();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════════

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(new Error(this.t('crypto.error.read_failed')));
            reader.readAsArrayBuffer(file);
        });
    }

    /** Override this method in v0.2.1+ to change download URL */
    buildCombinedUrl(tid, key) {
        const locale = this._detectLocalePrefix();
        return `${window.location.origin}/${locale}/download/#${tid}/${key}`;
    }

    /** Override this method in v0.2.1+ to change download URL */
    buildLinkOnlyUrl(tid) {
        const locale = this._detectLocalePrefix();
        return `${window.location.origin}/${locale}/download/#${tid}`;
    }

    /** Detect the locale prefix from the current URL path */
    _detectLocalePrefix() {
        const path = window.location.pathname;
        const match = path.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
        return match ? match[1] : 'en-gb';
    }

    async copyToClipboard(text, button) {
        await SendHelpers.copyToClipboard(text);
        const original = button.textContent;
        button.textContent = this.t('common.copied');
        setTimeout(() => { button.textContent = original; }, 2000);
    }
}

customElements.define('send-upload', SendUpload);
