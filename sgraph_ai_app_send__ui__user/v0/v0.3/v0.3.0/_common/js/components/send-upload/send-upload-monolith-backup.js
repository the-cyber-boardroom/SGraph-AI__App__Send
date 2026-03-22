/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Component
   v0.3.0 — Consolidated from v0.2.0 base + 14 IFD overlays (v0.2.3–v0.2.17)

   This file combines the base class and all prototype mutation overlays into a
   single file. The overlay pattern is preserved — each section saves references
   to methods it overrides, then replaces them on SendUpload.prototype.

   v0.2.9 was a documented no-op and is excluded.

   Generated: 2026-03-22
   ═══════════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════════
// BASE CLASS (from v0.2.0)
// ═══════════════════════════════════════════════════════════════════════════════

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
        if (files && files.length > 0) {
            this.selectedFile = files[0]; this.state = 'idle'; this.render(); this.setupEventListeners();
            return;
        }
        // Handle drag from test-files component (link drag, no File objects)
        const testFileData = e.dataTransfer && e.dataTransfer.getData('application/x-sgraph-test-file');
        if (testFileData) {
            try {
                const { url, name, mime } = JSON.parse(testFileData);
                fetch(url).then(r => r.arrayBuffer()).then(buf => {
                    this.selectedFile = new File([buf], name, { type: mime });
                    this.state = 'idle'; this.render(); this.setupEventListeners();
                });
            } catch (err) { /* ignore malformed data */ }
        }
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
            // Corrupted token in localStorage causing header rejection — clear and re-show gate
            if (err.message && err.message.includes('ISO-8859-1')) {
                ApiClient.clearAccessToken();
                document.dispatchEvent(new CustomEvent('access-token-invalid'));
                return;
            }
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


// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.3 — Four-step wizard
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.3 — Surgical overlay on v0.2.0

   Changes:
     - Four-step wizard: Upload → Choose delivery → Encrypt & Send → Share
     - Step indicator (<send-step-indicator>) rendered at top of card
     - MAX_FILE_SIZE_PRESIGNED raised to 10GB
     - Encryption happens LAST — after all user choices
     - Folder compression deferred to processing phase (step 3)
     - File/folder selection goes straight to delivery choice (step 2)
     - Processing phase: zipping → reading → encrypting → creating → uploading → completing

   Loads AFTER v0.2.0 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Raise file size limit to 10GB ──────────────────────────────────────────
SendUpload.MAX_FILE_SIZE_PRESIGNED = 10 * 1024 * 1024 * 1024;  // 10GB

// ─── Store v0.2.0 methods we override ───────────────────────────────────────
const _v020_render              = SendUpload.prototype.render;
const _v020_setupEventListeners = SendUpload.prototype.setupEventListeners;
const _v020_startUpload         = SendUpload.prototype.startUpload;
const _v020_resetForNew         = SendUpload.prototype.resetForNew;
const _v020_handleDrop          = SendUpload.prototype.handleDrop;
const _v020_handleFileSelect    = SendUpload.prototype.handleFileSelect;

// ─── Step mapping ───────────────────────────────────────────────────────────
// Maps state to which step the user is on (for the step indicator)
// Steps: 1=Upload, 2=Choose delivery, 3=Encrypt & Send, 4=Share
const TOTAL_STEPS = 4;
const STATE_TO_STEP = {
    'idle':              1,
    'folder-options':    1,
    'file-ready':        1,
    'choosing-delivery': 2,
    'choosing-share':    3,
    'zipping':           3,
    'reading':           3,
    'encrypting':        3,
    'creating':          3,
    'uploading':         3,
    'completing':        3,
    'complete':          4,
    'error':             1
};

// ─── Content detection ──────────────────────────────────────────────────────
const VIEWABLE_EXTENSIONS = new Set([
    'pdf', 'md', 'txt', 'html', 'htm', 'json', 'csv', 'xml',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
]);

const IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
]);

function detectDeliveryOptions(file, folderScan) {
    const ext = (file?.name || '').split('.').pop().toLowerCase();
    const isFolder = !!folderScan;
    const downloadTitle = isFolder ? 'Download zip mode' : 'Download mode';
    const downloadDesc  = isFolder ? 'Recipient downloads a single zip file'  : 'Recipient gets a file to save to their device';
    const options = [{ id: 'download', icon: '\uD83D\uDCE5', title: downloadTitle, desc: downloadDesc, hint: 'Best for: large archives, backups' }];

    if (folderScan) {
        options.push({ id: 'browse', icon: '\uD83D\uDCC2', title: 'Folder view mode', desc: 'Recipient sees files in a browsable view with inline preview', hint: 'Best for: sharing documents, reports' });
        const hasImages = folderScan.entries
            .filter(e => !e.isDir)
            .some(e => IMAGE_EXTENSIONS.has(e.name.split('.').pop().toLowerCase()));
        if (hasImages) {
            options.push({ id: 'gallery', icon: '\uD83D\uDDBC\uFE0F', title: 'Gallery mode', desc: 'Recipient browses files with preview. Thumbnails and metadata will be generated.', hint: 'Best for: photo sets, documents, mixed files' });
        }
    } else if (VIEWABLE_EXTENSIONS.has(ext)) {
        options.push({ id: 'view', icon: '\uD83D\uDC41\uFE0F', title: 'View mode', desc: 'Recipient reads/views directly, no download needed', hint: 'Best for: documents, reports' });
    } else if (ext === 'zip') {
        options.push({ id: 'browse', icon: '\uD83D\uDCC2', title: 'Folder view mode', desc: 'Recipient sees files in a browsable view with inline preview', hint: 'Best for: sharing documents, reports' });
    }

    return options;
}

function getRecommendedDelivery(options, folderScan) {
    if (folderScan) return 'browse';
    if (options.find(o => o.id === 'view'))    return 'view';
    if (options.find(o => o.id === 'gallery')) return 'gallery';
    return 'download';
}

// ─── Override: render ───────────────────────────────────────────────────────
SendUpload.prototype.render = function() {
    this._stageTimestamps[this.state] = Date.now();

    // For states the v0.2.3 overlay doesn't handle, fall back to v0.2.0
    if (!STATE_TO_STEP[this.state]) {
        _v020_render.call(this);
        return;
    }

    const step = STATE_TO_STEP[this.state] || 1;
    const isProcessing = !!SendUpload.PROGRESS_STAGES[this.state] || this.state === 'zipping';

    // Step indicator (always visible — step 4 is Share/complete)
    const stepIndicator = `<send-step-indicator step="${step}" total="${TOTAL_STEPS}"></send-step-indicator>`;

    // Render step content based on current state
    let content = '';
    switch (this.state) {
        case 'idle':
            content = this._v023_renderStep1Idle();
            break;
        case 'folder-options':
            content = this.renderFolderOptions();
            break;
        case 'file-ready':
            content = this._v023_renderFileReady();
            break;
        case 'choosing-delivery':
            content = this._v023_renderStep2();
            break;
        case 'choosing-share':
            content = this._v023_renderStep3();
            break;
        case 'zipping':
        case 'reading':
        case 'encrypting':
        case 'creating':
        case 'uploading':
        case 'completing':
            content = this._v023_renderProcessing();
            break;
        case 'complete':
            content = this.renderResult();
            break;
        case 'error':
            content = this.renderError();
            break;
    }

    this.innerHTML = `
        <div class="card">
            ${stepIndicator}
            <div class="step-content${this._v023_goingBack ? ' step-content--reverse' : ''}">
                ${content}
            </div>
        </div>
    `;
    this._v023_goingBack = false;
};

// ─── Step 1: Idle (drop zone) ───────────────────────────────────────────────
SendUpload.prototype._v023_renderStep1Idle = function() {
    const maxSize = this.formatBytes(SendUpload.MAX_FILE_SIZE);
    return `
        <div class="drop-zone" id="drop-zone">
            <div class="drop-zone__label">Drop a file or folder</div>
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

// ─── Step 1: File Ready (file selected, not yet encrypted) ──────────────────
SendUpload.prototype._v023_renderFileReady = function() {
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;
    const icon = isFolder ? '&#128193;' : '&#128196;';
    const name = isFolder ? this._folderName + '/' : (file ? file.name : '');
    const meta = isFolder
        ? `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`
        : (file ? this.formatBytes(file.size) : '');

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

    return `
        <div class="v023-file-summary">
            <span class="v023-file-summary__icon">${icon}</span>
            <div>
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta}</div>
            </div>
            <div class="v023-file-summary__status">&#10003; Ready</div>
        </div>
        ${largeWarning}
        <div style="text-align: center; margin-top: var(--space-4, 1rem);">
            <button class="btn btn-primary" id="v023-continue-to-delivery">Choose how to share it &rarr;</button>
        </div>
        <button class="v023-back-link" id="v023-back-to-idle">&larr; Choose a different file</button>
    `;
};

// ─── Step 2: Choose Delivery ────────────────────────────────────────────────
SendUpload.prototype._v023_renderStep2 = function() {
    const options = this._v023_deliveryOptions || [];
    const recommended = this._v023_recommendedDelivery || 'download';
    const selected = this._v023_selectedDelivery || null;

    // File summary at top
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;
    const icon = isFolder ? '&#128193;' : '&#128196;';
    const name = isFolder ? this._folderName + '/' : (file ? file.name : '');
    const meta = isFolder
        ? `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`
        : (file ? this.formatBytes(file.size) : '');

    const cardsHtml = options.map(opt => {
        const isRecommended = opt.id === recommended;
        let classes = 'v023-delivery-card';
        if (isRecommended) classes += ' v023-delivery-card--recommended';
        return `
            <div class="${classes}" data-delivery="${opt.id}">
                <div class="v023-delivery-card__icon">${opt.icon}</div>
                <div class="v023-delivery-card__title">${this.escapeHtml(opt.title)}</div>
                <div class="v023-delivery-card__desc">${this.escapeHtml(opt.desc)}</div>
                <div class="v023-delivery-card__hint">${this.escapeHtml(opt.hint)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="v023-file-summary v023-file-summary--compact">
            <span class="v023-file-summary__icon">${icon}</span>
            <div>
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta}</div>
            </div>
        </div>
        <h3 class="v023-step-title">How should the recipient get this?</h3>
        <div class="v023-delivery-cards">${cardsHtml}</div>
        <button class="v023-back-link" id="v023-back-to-idle">&larr; Back</button>
    `;
};

// ─── Step 3: Choose Share Mode ──────────────────────────────────────────────
SendUpload.prototype._v023_renderStep3 = function() {
    const delivery = this._v023_selectedDelivery || 'download';
    const deliveryOpt = (this._v023_deliveryOptions || []).find(o => o.id === delivery);
    const deliveryLabel = deliveryOpt ? deliveryOpt.title : delivery;

    // File summary at top
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;
    const icon = isFolder ? '&#128193;' : '&#128196;';
    const name = isFolder ? this._folderName + '/' : (file ? file.name : '');
    const meta = isFolder
        ? `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`
        : (file ? this.formatBytes(file.size) : '');

    return `
        <div class="v023-file-summary v023-file-summary--compact">
            <span class="v023-file-summary__icon">${icon}</span>
            <div>
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta}</div>
            </div>
        </div>
        <div class="v023-delivery-choice">
            <span class="v023-delivery-choice__label">Delivery:</span>
            <span class="v023-delivery-choice__value">${deliveryOpt ? deliveryOpt.icon + ' ' : ''}${this.escapeHtml(deliveryLabel)}</span>
        </div>
        <h3 class="v023-step-title">Ready to encrypt and send</h3>
        <p class="v023-step-desc">
            Your file will be encrypted in your browser, then uploaded.
            A secure link will be generated for sharing.
        </p>
        <div style="text-align: center; margin-top: var(--space-6, 1.5rem);">
            <button class="btn btn-primary btn-lg" id="v023-send-btn">Encrypt &amp; Send</button>
        </div>
        <button class="v023-back-link" id="v023-back-to-delivery">&larr; Back</button>
    `;
};

// ─── Processing phase ───────────────────────────────────────────────────────
SendUpload.prototype._v023_renderProcessing = function() {
    const stage = SendUpload.PROGRESS_STAGES[this.state];
    const pct = stage ? stage.pct : 5;
    const label = stage ? this.t(stage.label) : 'Processing...';

    return `
        <div class="v023-processing">
            <div class="v023-processing__label">${this.escapeHtml(label)}</div>
            <div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar__fill" style="width: ${pct}%;"></div>
            </div>
            <div class="v023-processing__hint">
                Your file is being encrypted in your browser. Keep this tab open.
            </div>
        </div>
    `;
};

// ─── Override: setupEventListeners ──────────────────────────────────────────
SendUpload.prototype.setupEventListeners = function() {
    // Call base for shared listeners (drag/drop, file input, folder input, mode tabs, etc.)
    _v020_setupEventListeners.call(this);

    // Delivery card click → go straight to step 3
    this.querySelectorAll('[data-delivery]').forEach(card => {
        card.addEventListener('click', () => {
            this._v023_selectedDelivery = card.getAttribute('data-delivery');
            this.state = 'choosing-share';
            this.render();
            this.setupEventListeners();
        });
    });

    // Send button (Step 3 → processing)
    const sendBtn = this.querySelector('#v023-send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            this._v023_startProcessing();
        });
    }

    // Back navigation
    const backToIdle = this.querySelector('#v023-back-to-idle');
    if (backToIdle) {
        backToIdle.addEventListener('click', () => {
            this._v023_goingBack = true;
            this.resetForNew();
        });
    }

    const backToDelivery = this.querySelector('#v023-back-to-delivery');
    if (backToDelivery) {
        backToDelivery.addEventListener('click', () => {
            this._v023_goingBack = true;
            this.state = 'choosing-delivery';
            this.render();
            this.setupEventListeners();
        });
    }
};

// ─── Helper: advance to delivery step ───────────────────────────────────────
SendUpload.prototype._v023_advanceToDelivery = function() {
    this._v023_deliveryOptions = detectDeliveryOptions(this.selectedFile, this._folderScan);
    this._v023_recommendedDelivery = getRecommendedDelivery(this._v023_deliveryOptions, this._folderScan);
    this._v023_selectedDelivery = null;

    if (this._v023_deliveryOptions.length === 1) {
        this._v023_selectedDelivery = this._v023_deliveryOptions[0].id;
        this.state = 'choosing-share';
    } else {
        this.state = 'choosing-delivery';
    }
    this.render();
    this.setupEventListeners();
};

// ─── Override: handleDrop — go straight to delivery step ────────────────────
SendUpload.prototype.handleDrop = function(e) {
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

    // Single file — go straight to delivery step
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
        this.selectedFile = files[0];
        this._v023_advanceToDelivery();
        return;
    }

    // Handle drag from test-files component
    const testFileData = e.dataTransfer && e.dataTransfer.getData('application/x-sgraph-test-file');
    if (testFileData) {
        try {
            const { url, name, mime } = JSON.parse(testFileData);
            fetch(url).then(r => r.arrayBuffer()).then(buf => {
                this.selectedFile = new File([buf], name, { type: mime });
                this._v023_advanceToDelivery();
            });
        } catch (err) { /* ignore malformed data */ }
    }
};

// ─── Override: handleFileSelect — go straight to delivery step ──────────────
SendUpload.prototype.handleFileSelect = function(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
        this.selectedFile = files[0];
        this._v023_advanceToDelivery();
    }
};

// ─── Override: _handleFolderEntry — scan only, skip compression ─────────────
const _v020_handleFolderEntry = SendUpload.prototype._handleFolderEntry;
SendUpload.prototype._handleFolderEntry = function(entry) {
    const self = this;

    // Call base to scan the folder (populates _folderScan, _folderName)
    _v020_handleFolderEntry.call(this, entry);

    // The base method is async (scans folder tree) and transitions to
    // 'folder-options'. We intercept that and go straight to delivery.
    // Compression is deferred to the processing phase (step 3).
    const checkInterval = setInterval(() => {
        if (self.state === 'folder-options') {
            clearInterval(checkInterval);
            self._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
            self._v023_advanceToDelivery();
        }
    }, 50);
    setTimeout(() => clearInterval(checkInterval), 10000);
};

// Override _startFolderZip to prevent base code from zipping early
SendUpload.prototype._startFolderZip = function() {
    // No-op: compression is deferred to _v023_startProcessing
};

// ─── Compress folder to zip (called during processing phase) ────────────────
SendUpload.prototype._v023_compressFolder = async function() {
    await this._loadJSZip();

    const zip = new JSZip();
    const entries = this._folderScan.entries.filter(e => !e.isDir);
    const opts = this._folderOptions;

    for (const entry of entries) {
        if (!opts.includeHidden && entry.name.startsWith('.')) continue;
        if (entry.file) {
            zip.file(entry.path, entry.file, {
                compression: opts.level > 0 ? 'DEFLATE' : 'STORE',
                compressionOptions: { level: opts.level }
            });
        }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const zipName = (this._folderName || 'folder') + '.zip';
    this.selectedFile = new File([blob], zipName, { type: 'application/zip' });
};

// ─── Processing: encrypt + upload (called from Step 3) ──────────────────────
SendUpload.prototype._v023_startProcessing = async function() {
    if (!SendCrypto.isAvailable()) {
        this.errorMessage = this.t('crypto.error.unavailable');
        this.state = 'error'; this.render(); this.setupEventListeners(); return;
    }

    if (!this.selectedFile && !this._folderScan) return;

    // Size check — use folder totalSize for folders, file.size for files
    const checkSize = this._folderScan ? this._folderScan.totalSize : (this.selectedFile ? this.selectedFile.size : 0);
    if (checkSize > SendUpload.MAX_FILE_SIZE) {
        this.errorMessage = this.t('upload.error.file_too_large', { limit: this.formatBytes(SendUpload.MAX_FILE_SIZE) });
        this.state = 'error'; this.render(); this.setupEventListeners(); return;
    }

    try {
        this._setBeforeUnload(true);
        this._stageTimestamps = {};

        // Compress folder to zip if needed (deferred from drop)
        if (this._folderScan) {
            this.state = 'zipping'; this.render(); this.setupEventListeners();
            await this._v023_compressFolder();
        }

        // Reading
        const file = this.selectedFile;
        this.state = 'reading'; this.render(); this.setupEventListeners();
        const rawContent = await this.readFileAsArrayBuffer(file);
        const contentType = file.type || 'application/octet-stream';
        const plaintext = this.packageWithMetadata(rawContent, { filename: file.name });
        const fileSizeBytes = plaintext.byteLength;

        // Encrypting (key is now determined — random key for v0.2.3, PBKDF2 in v0.2.6)
        this.state = 'encrypting'; this.render();
        const key       = await SendCrypto.generateKey();
        const keyString = await SendCrypto.exportKey(key);
        const encrypted = await SendCrypto.encryptFile(key, plaintext);

        // Creating transfer
        this.state = 'creating'; this.render();
        const createResult = await ApiClient.createTransfer(fileSizeBytes, contentType);

        // Uploading
        this.state = 'uploading'; this.render();
        const usePresigned = encrypted.byteLength > SendUpload.MAX_FILE_SIZE_DIRECT
                          && this._capabilities
                          && this._capabilities.multipart_upload;
        if (usePresigned) {
            await this._uploadViaPresigned(createResult.transfer_id, encrypted);
        } else {
            await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
        }

        // Completing
        this.state = 'completing'; this.render();
        const completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

        // Build URLs — use delivery-specific route if available
        const delivery = this._v023_selectedDelivery || 'download';
        const combinedUrl = this._v023_buildUrl(createResult.transfer_id, keyString, delivery);
        const linkOnlyUrl = this.buildLinkOnlyUrl(createResult.transfer_id);

        this.result = {
            transferId:   createResult.transfer_id,
            combinedUrl,
            linkOnlyUrl,
            keyString,
            isText:       false,
            delivery,
            transparency: completeResult.transparency || null
        };
        this._setBeforeUnload(false);
        this.state = 'complete'; this.render(); this.setupDynamicListeners();

        this.dispatchEvent(new CustomEvent('upload-complete', {
            detail: { transferId: createResult.transfer_id, downloadUrl: combinedUrl, key: keyString },
            bubbles: true
        }));

    } catch (err) {
        this._setBeforeUnload(false);
        if (err.message === 'ACCESS_TOKEN_INVALID') { document.dispatchEvent(new CustomEvent('access-token-invalid')); return; }
        if (err.message && err.message.includes('ISO-8859-1')) {
            ApiClient.clearAccessToken();
            document.dispatchEvent(new CustomEvent('access-token-invalid'));
            return;
        }
        this.errorMessage = err.message || this.t('upload.error.upload_failed');
        this.state = 'error'; this.render(); this.setupEventListeners();
    }
};

// ─── Build URL based on delivery mode ───────────────────────────────────────
SendUpload.prototype._v023_buildUrl = function(transferId, keyString, delivery) {
    const locale = this._detectLocalePrefix();
    const route = delivery === 'download' ? 'download' : delivery;
    return `${window.location.origin}/${locale}/${route}/#${transferId}/${keyString}`;
};

// ─── Override: resetForNew — clear v0.2.3 state ─────────────────────────────
SendUpload.prototype.resetForNew = function() {
    this._v023_deliveryOptions     = null;
    this._v023_recommendedDelivery = null;
    this._v023_selectedDelivery    = null;
    this._v023_goingBack           = false;
    _v020_resetForNew.call(this);
};

// ─── Inline styles for v0.2.3 components ────────────────────────────────────
// Injected once into the document head
(function injectStyles() {
    if (document.getElementById('v023-styles')) return;
    const style = document.createElement('style');
    style.id = 'v023-styles';
    style.textContent = `
        /* Step content transitions (fade only, no horizontal shift) */
        .step-content {
            animation: v023-step-fade 200ms ease;
        }
        @keyframes v023-step-fade {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        .step-content--reverse {
            animation: v023-step-fade 200ms ease;
        }

        /* Browse buttons (ghost style) */
        .v023-browse-buttons {
            display: flex;
            gap: var(--space-3, 0.75rem);
            justify-content: center;
            margin-top: var(--space-4, 1rem);
        }
        .v023-browse-btn {
            background: transparent;
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            color: var(--color-text-secondary, #8892A0);
            padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
            border-radius: var(--radius-sm, 6px);
            font-size: var(--text-small, 0.75rem);
            cursor: pointer;
            transition: border-color 0.2s, color 0.2s;
        }
        .v023-browse-btn:hover {
            border-color: var(--color-primary, #4ECDC4);
            color: var(--color-primary, #4ECDC4);
        }

        /* Trust badge */
        .v023-trust-badge {
            display: flex;
            align-items: center;
            gap: var(--space-2, 0.5rem);
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            margin-top: var(--space-4, 1rem);
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
            border-radius: var(--radius-sm, 6px);
            background: rgba(78, 205, 196, 0.04);
        }
        .v023-trust-badge__icon { flex-shrink: 0; }

        /* File summary */
        .v023-file-summary {
            display: flex;
            align-items: center;
            gap: var(--space-3, 0.75rem);
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
            background: rgba(78, 205, 196, 0.04);
            border-radius: var(--radius-sm, 6px);
            margin-bottom: var(--space-4, 1rem);
        }
        .v023-file-summary--compact { margin-bottom: var(--space-3, 0.75rem); }
        .v023-file-summary--error { border: 1px solid var(--color-error, #FF6B6B); }
        .v023-file-summary__icon { font-size: 1.25rem; flex-shrink: 0; }
        .v023-file-summary__name {
            font-weight: var(--weight-semibold, 600);
            color: var(--color-text, #E0E0E0);
            font-size: var(--text-sm, 0.875rem);
        }
        .v023-file-summary__meta {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
        }
        .v023-file-summary__status {
            margin-left: auto;
            font-size: var(--text-small, 0.75rem);
            color: var(--color-success, #4ECDC4);
            display: flex;
            align-items: center;
            gap: var(--space-1, 0.25rem);
        }

        /* Large file warning */
        .v023-large-warning {
            margin-top: var(--space-3, 0.75rem);
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
            background: rgba(255, 107, 107, 0.08);
            border: 1px solid rgba(255, 107, 107, 0.2);
            border-radius: var(--radius-sm, 6px);
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
        }

        /* Step titles */
        .v023-step-title {
            font-size: var(--text-body, 1rem);
            font-weight: var(--weight-semibold, 600);
            color: var(--color-text, #E0E0E0);
            margin: 0 0 var(--space-2, 0.5rem) 0;
        }
        .v023-step-desc {
            font-size: var(--text-sm, 0.875rem);
            color: var(--color-text-secondary, #8892A0);
            margin: 0 0 var(--space-4, 1rem) 0;
            line-height: 1.5;
        }

        /* Delivery choice summary (step 3) */
        .v023-delivery-choice {
            display: flex;
            align-items: center;
            gap: var(--space-2, 0.5rem);
            padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
            margin-bottom: var(--space-4, 1rem);
            border-radius: var(--radius-sm, 6px);
            background: rgba(78, 205, 196, 0.06);
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            font-size: var(--text-sm, 0.875rem);
        }
        .v023-delivery-choice__label {
            color: var(--color-text-secondary, #8892A0);
        }
        .v023-delivery-choice__value {
            color: var(--color-primary, #4ECDC4);
            font-weight: var(--weight-semibold, 600);
        }

        /* Delivery cards */
        .v023-delivery-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--space-4, 1rem);
            margin-top: var(--space-4, 1rem);
        }
        .v023-delivery-card {
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            border-radius: var(--radius-md, 12px);
            padding: var(--space-6, 1.5rem);
            background: var(--color-surface, #1E2A4A);
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s, transform 0.2s;
            text-align: left;
        }
        .v023-delivery-card:hover {
            border-color: var(--color-primary, #4ECDC4);
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));
            transform: translateY(-2px);
        }
        .v023-delivery-card--selected {
            border-color: var(--color-primary, #4ECDC4);
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));
            box-shadow: 0 0 0 1px var(--color-primary, #4ECDC4);
        }
        .v023-delivery-card--recommended { position: relative; }
        .v023-delivery-card--recommended::after {
            content: "\\2605 RECOMMENDED";
            position: absolute;
            bottom: var(--space-3, 0.75rem);
            right: var(--space-3, 0.75rem);
            font-size: var(--text-micro, 0.625rem);
            color: var(--color-primary, #4ECDC4);
            font-weight: var(--weight-semibold, 600);
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        .v023-delivery-card__icon { font-size: 1.5rem; margin-bottom: var(--space-3, 0.75rem); }
        .v023-delivery-card__title {
            font-size: var(--text-body, 1rem);
            font-weight: var(--weight-semibold, 600);
            color: var(--color-text, #E0E0E0);
            margin-bottom: var(--space-2, 0.5rem);
        }
        .v023-delivery-card__desc {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            line-height: 1.5;
            margin-bottom: var(--space-3, 0.75rem);
        }
        .v023-delivery-card__hint {
            font-size: var(--text-micro, 0.625rem);
            color: var(--color-text-secondary, #8892A0);
            opacity: 0.7;
        }

        /* Back link */
        .v023-back-link {
            display: inline-flex;
            align-items: center;
            gap: var(--space-1, 0.25rem);
            margin-top: var(--space-4, 1rem);
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            cursor: pointer;
            text-decoration: none;
            border: none;
            background: none;
            padding: 0;
        }
        .v023-back-link:hover {
            color: var(--color-primary, #4ECDC4);
        }

        /* Processing */
        .v023-processing {
            padding: var(--space-6, 1.5rem) 0;
        }
        .v023-processing__label {
            font-size: var(--text-sm, 0.875rem);
            color: var(--color-text-secondary, #8892A0);
            margin-bottom: var(--space-3, 0.75rem);
        }
        .v023-processing__hint {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            margin-top: var(--space-3, 0.75rem);
            opacity: 0.7;
        }

        /* Mobile */
        @media (max-width: 480px) {
            .v023-browse-buttons { flex-direction: column; gap: var(--space-2, 0.5rem); }
            .v023-browse-btn { width: 100%; padding: var(--space-3, 0.75rem) var(--space-4, 1rem); }
            .v023-delivery-cards { grid-template-columns: 1fr; }
        }
    `;
    document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.4 — Rich file icons, thumbnails, paste
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.5 — Multi-file drop, smart skip
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.6 — Five-step wizard, share modes, friendly tokens
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.6 — Surgical overlay on v0.2.5

   Changes:
     - Five-step wizard (was four):
       1. Upload — drop/browse file
       2. Choose delivery — download/view/browse
       3. Choose share — token/combined/separate cards (auto-advances on click)
       4. Confirm & Send — summary of all choices + prominent Encrypt & Send button
       5. Share — result in chosen mode
     - Simple token is default share mode (first card, pre-selected)
     - Skip file-ready pause for ALL files
     - Step indicator updated to 5 steps

   Loads AFTER v0.2.5 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Store methods we override ──────────────────────────────────────────────
const _v025_renderResult       = SendUpload.prototype.renderResult;
const _v025_setupDynamic       = SendUpload.prototype.setupDynamicListeners;
const _v025_setupEvents        = SendUpload.prototype.setupEventListeners;
const _v025_resetForNew        = SendUpload.prototype.resetForNew;
const _v025_advanceToDelivery  = SendUpload.prototype._v023_advanceToDelivery;
const _v025_renderStep3        = SendUpload.prototype._v023_renderStep3;
const _v025_render             = SendUpload.prototype.render;
const _v025_startProcessing    = SendUpload.prototype._v023_startProcessing;

// ─── Update step indicator to 5 steps ───────────────────────────────────────
if (typeof SendStepIndicator !== 'undefined') {
    SendStepIndicator.STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Done'];
}

// ─── New state-to-step mapping (5 steps) ────────────────────────────────────
var V026_TOTAL_STEPS = 5;
var V026_STATE_TO_STEP = {
    'idle':              1,
    'folder-options':    1,
    'file-ready':        1,
    'choosing-delivery': 2,
    'choosing-share':    3,
    'confirming':        4,
    'zipping':           4,
    'reading':           4,
    'encrypting':        4,
    'creating':          4,
    'uploading':         4,
    'completing':        4,
    'complete':          5,
    'error':             1
};

// ─── Override: render — use 5-step mapping ──────────────────────────────────
SendUpload.prototype.render = function() {
    this._stageTimestamps = this._stageTimestamps || {};
    this._stageTimestamps[this.state] = Date.now();

    var step = V026_STATE_TO_STEP[this.state] || 1;
    var stepIndicator = '<send-step-indicator step="' + step + '" total="' + V026_TOTAL_STEPS + '"></send-step-indicator>';

    var content = '';
    switch (this.state) {
        case 'idle':              content = this._v023_renderStep1Idle(); break;
        case 'folder-options':    content = this.renderFolderOptions(); break;
        case 'file-ready':        content = this._v023_renderFileReady(); break;
        case 'choosing-delivery': content = this._v023_renderStep2(); break;
        case 'choosing-share':    content = this._v026_renderShareChoice(); break;
        case 'confirming':        content = this._v026_renderConfirm(); break;
        case 'zipping':
        case 'reading':
        case 'encrypting':
        case 'creating':
        case 'uploading':
        case 'completing':        content = this._v023_renderProcessing(); break;
        case 'complete':          content = this.renderResult(); break;
        case 'error':             content = this.renderError(); break;
        default:                  _v025_render.call(this); return;
    }

    this.innerHTML =
        '<div class="card">' +
            stepIndicator +
            '<div class="step-content' + (this._v023_goingBack ? ' step-content--reverse' : '') + '">' +
                content +
            '</div>' +
        '</div>';
    this._v023_goingBack = false;
};

// ─── Override: skip file-ready for ALL files + reorder delivery (view first) ─
SendUpload.prototype._v023_advanceToDelivery = function() {
    this._v024_userConfirmed = true;
    _v025_advanceToDelivery.call(this);
    // Reorder: viewable options (view/browse/gallery) before download
    var opts = this._v023_deliveryOptions;
    if (opts && opts.length > 1) {
        var viewFirst = [], downloadLast = [];
        opts.forEach(function(o) {
            (o.id === 'download' ? downloadLast : viewFirst).push(o);
        });
        this._v023_deliveryOptions = viewFirst.concat(downloadLast);
        this.render();
        this.setupEventListeners();
    }
};

// ─── Share mode definitions ────────────────────────────────────────────────
var SHARE_MODES = [
    {
        id:    'token',
        icon:  '\uD83C\uDFAB',       // 🎫
        title: 'Simple token',
        desc:  'A short transfer ID they can enter on the site. Key sent separately.',
        hint:  'Easiest — share verbally or in a message',
        security: 'Recipient needs both the token and the key'
    },
    {
        id:    'combined',
        icon:  '\uD83D\uDD17',       // 🔗
        title: 'Combined link',
        desc:  'One link with the decryption key embedded. Recipient clicks and gets the file.',
        hint:  'Simplest — one click for the recipient',
        security: 'Anyone with this link can decrypt the file'
    },
    {
        id:    'separate',
        icon:  '\uD83D\uDD10',       // 🔐
        title: 'Link + key separate',
        desc:  'Send the link and decryption key through different channels.',
        hint:  'More secure — requires both pieces',
        security: 'Neither piece works alone'
    }
];

// ─── Word list for friendly keys (~256 common words) ─────────────────────────
var V026_WORDS = [
    'acorn','agate','alder','amber','anchor','anvil','apple','arrow','aspen','atlas',
    'badge','baker','barn','basin','beach','berry','birch','blade','blank','blaze',
    'bloom','board','bold','bonus','brave','bread','brick','brook','brush','cabin',
    'camel','candy','cargo','cedar','chain','chalk','charm','chess','chief','chill',
    'cider','citrus','civic','claim','clay','cliff','climb','clock','cloud','clover',
    'coach','coast','cobalt','cocoa','coral','craft','crane','crash','creek','crest',
    'crisp','cross','crown','cubic','curve','dance','dawn','delta','depot','diary',
    'dodge','dove','draft','dream','drift','drum','dune','eagle','earth','echo',
    'elder','elite','ember','epoch','equal','fable','faith','falcon','feast','fern',
    'ferry','fiber','field','flame','flash','flint','float','flora','flute','focus',
    'forge','found','frost','fruit','fudge','gaze','giant','glade','glass','gleam',
    'globe','glow','gold','grace','grain','grand','grape','green','grove','guard',
    'guide','guild','halo','harbor','haven','hawk','hazel','heart','hedge','herb',
    'heron','honey','horizon','hound','humor','index','iris','ivory','jasper','jewel','jolly',
    'judge','jungle','karma','kite','knoll','lake','latch','lemon','level','light',
    'lily','linen','lion','lodge','logic','lotus','lucky','lunar','lyre','magic',
    'mango','manor','maple','marsh','match','mayor','medal','melon','mercy','mirth',
    'model','moose','mortar','moss','mount','music','myth','nectar','noble','north','novel',
    'nutmeg','oak','oasis','ocean','olive','onset','onyx','opal','orange','orbit',
    'otter','oxide','palm','panel','patch','peace','pearl','pecan','pepper','petal',
    'pilot','pixel','plant','plaza','plume','plush','polar','pouch','prism','proud',
    'pulse','quail','queen','quest','quick','radar','rain','rapid','raven','reach',
    'realm','reed','reef','relay','ribbon','ridge','river','robin','robot','royal','ruby',
    'rumor','sage','sandy','satin','scale','scene','scout','scroll','shade','shark',
    'shell','shift','shine','silk','slate','smile','solar','solid','sonic','spark',
    'spell','spice','spine','spoke','spruce','staff','stamp','star','steam','steel',
    'stone','storm','sugar','sunny','surge','sweep','swift','table','tango','terra',
    'thistle','thorn','tiger','toast','token','topaz','tower','trace','trail','trend',
    'trout','tulip','twist','ultra','umber','union','unity','urban','valid','valve',
    'vault','velvet','verse','vigor','vine','vinyl','vivid','voice','walnut','water',
    'wave','wheat','whole','wick','willow','wind','wolf','wonder','world','wren',
    'yacht','yarn','yarrow','yield','zenith','zinc','zone'
];

function v026_randomWord() {
    var arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return V026_WORDS[arr[0] % V026_WORDS.length];
}

function v026_randomSuffix() {
    var arr = new Uint16Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 10000).padStart(4, '0');
}

function v026_newFriendlyKey() {
    return { words: [v026_randomWord(), v026_randomWord()], suffix: v026_randomSuffix() };
}

function v026_formatFriendly(parts) {
    return parts.words[0] + '-' + parts.words[1] + '-' + parts.suffix;
}

function v026_combinationsLabel() {
    var total = V026_WORDS.length * V026_WORDS.length * 10000;
    var label;
    if (total >= 1e9) {
        label = (total / 1e9).toFixed(1).replace(/\.0$/, '') + ' billion';
    } else {
        label = Math.round(total / 1e6) + ' million';
    }
    return V026_WORDS.length + ' words &times; ' + V026_WORDS.length + ' words &times; 10,000 = ~' + label + ' combinations';
}

async function v026_deriveKeyFromFriendly(passphrase) {
    var enc = new TextEncoder();
    var material = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('sgraph-send-v1'), iterations: 600000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/** Derive a deterministic 12-char hex transfer ID from a friendly token.
 *  SHA-256(token) → first 12 hex chars. Must match FriendlyCrypto.deriveTransferId. */
async function v026_deriveTransferId(friendlyToken) {
    var enc = new TextEncoder();
    var hash = await crypto.subtle.digest('SHA-256', enc.encode(friendlyToken));
    var bytes = new Uint8Array(hash);
    var hex = '';
    for (var i = 0; i < 6; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

// ─── Step 3: Share mode selection (auto-advances on click) ──────────────────
SendUpload.prototype._v026_renderShareChoice = function() {
    var self = this;
    var selectedMode = this._v026_shareMode || 'token';

    var cardsHtml = SHARE_MODES.map(function(mode) {
        var activeClass = mode.id === selectedMode ? ' v026-share-card--active' : '';
        return '<div class="v026-share-card' + activeClass + '" data-share-mode="' + mode.id + '">' +
            '<div class="v026-share-card__icon">' + mode.icon + '</div>' +
            '<div class="v026-share-card__body">' +
                '<div class="v026-share-card__title">' + self.escapeHtml(mode.title) + '</div>' +
                '<div class="v026-share-card__desc">' + self.escapeHtml(mode.desc) + '</div>' +
                '<div class="v026-share-card__hint">' + self.escapeHtml(mode.hint) + '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    return '<h3 class="v023-step-title">How do you want to share it?</h3>' +
        '<div class="v026-share-cards">' + cardsHtml + '</div>' +
        '<button class="v023-back-link" id="v023-back-to-delivery">&larr; Back</button>';
};

// ─── Step 4: Confirmation summary ──────────────────────────────────────────
SendUpload.prototype._v026_renderConfirm = function() {
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    var icon = isFolder ? '&#128193;' : '&#128196;';
    var name = isFolder ? (this._folderName || 'folder') + '/' : (file ? file.name : '');
    var meta = isFolder
        ? this._folderScan.fileCount + ' files &middot; ' + this.formatBytes(this._folderScan.totalSize)
        : (file ? this.formatBytes(file.size) : '');

    var delivery = this._v023_selectedDelivery || 'download';
    var deliveryOpt = (this._v023_deliveryOptions || []).find(function(o) { return o.id === delivery; });
    var shareMode = this._v026_shareMode || 'token';
    var shareModeConfig = SHARE_MODES.find(function(m) { return m.id === shareMode; });

    // Generate friendly key if not already set and share mode is token
    if (shareMode === 'token' && !this._v026_friendlyParts) {
        this._v026_friendlyParts = v026_newFriendlyKey();
        this._v026_friendlyKey = v026_formatFriendly(this._v026_friendlyParts);
    }

    var largeWarning = file && file.size > 2 * 1024 * 1024 * 1024
        ? '<div class="v023-large-warning" style="margin-top: var(--space-4, 1rem);">Large files may take several minutes to encrypt. Keep this tab open.</div>'
        : '';

    // Word picker (only for token mode)
    var wordPickerHtml = '';
    if (shareMode === 'token' && this._v026_friendlyParts) {
        var fp = this._v026_friendlyParts;
        wordPickerHtml =
            '<div class="v026-word-picker">' +
                '<label class="v026-word-picker__label">Your friendly key</label>' +
                '<div class="v026-word-picker__slots">' +
                    '<div class="v026-word-picker__slot">' +
                        '<span class="v026-word-picker__word">' + this.escapeHtml(fp.words[0]) + '</span>' +
                        '<button class="v026-word-picker__shuffle-btn" data-shuffle-word="0" title="Shuffle this word">&#128256;</button>' +
                    '</div>' +
                    '<span class="v026-word-picker__sep">&mdash;</span>' +
                    '<div class="v026-word-picker__slot">' +
                        '<span class="v026-word-picker__word">' + this.escapeHtml(fp.words[1]) + '</span>' +
                        '<button class="v026-word-picker__shuffle-btn" data-shuffle-word="1" title="Shuffle this word">&#128256;</button>' +
                    '</div>' +
                    '<span class="v026-word-picker__sep">&mdash;</span>' +
                    '<div class="v026-word-picker__slot">' +
                        '<span class="v026-word-picker__suffix">' + this.escapeHtml(fp.suffix) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="v026-word-picker__preview">' +
                    '<span class="v026-word-picker__key" id="v026-friendly-display">' + this.escapeHtml(this._v026_friendlyKey) + '</span>' +
                    '<button class="v026-word-picker__action" data-copy="v026-friendly-display" title="Copy">&#128203;</button>' +
                    '<button class="v026-word-picker__action" id="v026-shuffle-all" title="Generate new key">&#128256; New</button>' +
                '</div>' +
                '<div class="v026-word-picker__hint">Share this verbally or in a message &mdash; easy to remember and type</div>' +
                '<div class="v026-word-picker__hint" style="opacity: 0.5; margin-top: 0.25rem;">' + v026_combinationsLabel() + '</div>' +
            '</div>';
    }

    return '<h3 class="v023-step-title">Ready to encrypt and send</h3>' +
        '<p class="v023-step-desc" style="margin-bottom: var(--space-5, 1.25rem);">Review your choices, then hit the button below.</p>' +

        // Summary rows
        '<div class="v026-summary">' +
            '<div class="v026-summary__row">' +
                '<span class="v026-summary__label">File</span>' +
                '<span class="v026-summary__value">' +
                    '<span class="v026-summary__icon">' + icon + '</span> ' +
                    this.escapeHtml(name) +
                    '<span class="v026-summary__meta"> &middot; ' + meta + '</span>' +
                '</span>' +
            '</div>' +
            (deliveryOpt ? '<div class="v026-summary__row">' +
                '<span class="v026-summary__label">Delivery</span>' +
                '<span class="v026-summary__value">' +
                    deliveryOpt.icon + ' ' + this.escapeHtml(deliveryOpt.title) +
                '</span>' +
                '<button class="v026-summary__change" data-change="delivery">change</button>' +
            '</div>' : '') +
            (shareModeConfig ? '<div class="v026-summary__row">' +
                '<span class="v026-summary__label">Share mode</span>' +
                '<span class="v026-summary__value">' +
                    shareModeConfig.icon + ' ' + this.escapeHtml(shareModeConfig.title) +
                '</span>' +
                '<button class="v026-summary__change" data-change="share">change</button>' +
            '</div>' : '') +
        '</div>' +

        wordPickerHtml +

        // Security note
        '<div class="v026-security-note" style="margin-top: var(--space-4, 1rem);">' +
            '<span>&#128274;</span> Your file will be encrypted in your browser' +
            (shareMode === 'token' ? ' using this key. The server never sees your data or key.' : ' before upload. The server never sees your data.') +
        '</div>' +

        largeWarning +

        // Big Encrypt & Send button
        '<div class="v026-send-action">' +
            '<button class="v026-send-btn" id="v023-send-btn">' +
                '<span class="v026-send-btn__icon">&#128274;</span>' +
                '<span class="v026-send-btn__text">Encrypt &amp; Send</span>' +
            '</button>' +
        '</div>' +

        '<button class="v023-back-link" id="v026-back-to-share">&larr; Back</button>';
};

// ─── Override: startProcessing — derive key + transfer ID from friendly token ──
SendUpload.prototype._v023_startProcessing = async function() {
    var self = this;
    if (this._v026_shareMode === 'token' && this._v026_friendlyKey) {
        // Derive deterministic transfer ID from friendly token (SHA-256 → 12 hex)
        var derivedTransferId = await v026_deriveTransferId(this._v026_friendlyKey);

        // Temporarily swap key generation to use PBKDF2 from friendly key
        var origGenKey = SendCrypto.generateKey;
        SendCrypto.generateKey = function() {
            return v026_deriveKeyFromFriendly(self._v026_friendlyKey);
        };

        // Temporarily swap createTransfer to include derived transfer_id
        var origCreateTransfer = ApiClient.createTransfer;
        ApiClient.createTransfer = async function(fileSize, contentType) {
            var fetchFn = typeof ApiClient._fetch === 'function'
                        ? ApiClient._fetch.bind(ApiClient)
                        : function(path, opts) { return fetch(path, opts); };
            var res = await fetchFn('/api/transfers/create', {
                method:  'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, ApiClient._authHeaders()),
                body:    JSON.stringify({
                    file_size_bytes:   fileSize,
                    content_type_hint: contentType || 'application/octet-stream',
                    transfer_id:       derivedTransferId
                })
            });
            if (!res.ok) {
                if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
                if (res.status === 409) throw new Error('Transfer ID collision — please retry');
                throw new Error('Create transfer failed: ' + res.status);
            }
            return res.json();
        };

        try {
            await _v025_startProcessing.call(this);
        } finally {
            SendCrypto.generateKey    = origGenKey;
            ApiClient.createTransfer  = origCreateTransfer;
        }
        // Store friendly key in result and re-render (original already rendered without it)
        if (this.result) {
            this.result.friendlyKey = this._v026_friendlyKey;
            this.render();
            this.setupDynamicListeners();
        }
    } else {
        await _v025_startProcessing.call(this);
    }
};

// ─── Override: setupEventListeners ──────────────────────────────────────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;
    _v025_setupEvents.call(this);

    // Share mode card click → save selection and auto-advance to confirmation
    this.querySelectorAll('.v026-share-card[data-share-mode]').forEach(function(card) {
        card.addEventListener('click', function() {
            self._v026_shareMode = card.getAttribute('data-share-mode');
            self.state = 'confirming';
            self.render();
            self.setupEventListeners();
        });
    });

    // Back from confirmation → share choice
    var backToShare = this.querySelector('#v026-back-to-share');
    if (backToShare) {
        backToShare.addEventListener('click', function() {
            self._v023_goingBack = true;
            self.state = 'choosing-share';
            self.render();
            self.setupEventListeners();
        });
    }

    // Change buttons in confirmation summary
    var changeDelivery = this.querySelector('[data-change="delivery"]');
    if (changeDelivery) {
        changeDelivery.addEventListener('click', function() {
            self._v023_goingBack = true;
            self.state = 'choosing-delivery';
            self.render();
            self.setupEventListeners();
        });
    }
    var changeShare = this.querySelector('[data-change="share"]');
    if (changeShare) {
        changeShare.addEventListener('click', function() {
            self._v023_goingBack = true;
            self.state = 'choosing-share';
            self.render();
            self.setupEventListeners();
        });
    }

    // Word picker: shuffle individual words
    this.querySelectorAll('[data-shuffle-word]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(btn.getAttribute('data-shuffle-word'), 10);
            if (self._v026_friendlyParts && self._v026_friendlyParts.words[idx] !== undefined) {
                self._v026_friendlyParts.words[idx] = v026_randomWord();
                self._v026_friendlyKey = v026_formatFriendly(self._v026_friendlyParts);
                self.render();
                self.setupEventListeners();
            }
        });
    });

    // Word picker: shuffle all
    var shuffleAll = this.querySelector('#v026-shuffle-all');
    if (shuffleAll) {
        shuffleAll.addEventListener('click', function() {
            self._v026_friendlyParts = v026_newFriendlyKey();
            self._v026_friendlyKey = v026_formatFriendly(self._v026_friendlyParts);
            self.render();
            self.setupEventListeners();
        });
    }
};

// ─── Override: renderResult — show result in chosen mode ────────────────────
SendUpload.prototype.renderResult = function() {
    if (this.state !== 'complete' || !this.result) return '';

    var result = this.result;
    var selectedMode = this._v026_shareMode || 'token';

    // File summary at top
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    var icon = isFolder ? '&#128193;' : '&#128196;';
    var name = isFolder ? (this._folderName || 'folder') + '/' : (file ? file.name : '');
    var meta = isFolder
        ? this._folderScan.fileCount + ' files &middot; ' + this.formatBytes(this._folderScan.totalSize)
        : (file ? this.formatBytes(file.size) : '');

    // Success message
    var successHtml =
        '<div class="v026-success-banner">' +
            '<span class="v026-success-banner__icon">&#10003;</span>' +
            '<span>Encrypted and uploaded successfully</span>' +
        '</div>';

    // File summary
    var summaryHtml =
        '<div class="v023-file-summary v023-file-summary--compact">' +
            '<span class="v023-file-summary__icon">' + icon + '</span>' +
            '<div>' +
                '<div class="v023-file-summary__name">' + this.escapeHtml(name) + '</div>' +
                '<div class="v023-file-summary__meta">' + meta + '</div>' +
            '</div>' +
        '</div>';

    // Card picker mode (user clicked "Change")
    if (this._v026_showPicker) {
        var self = this;
        var cardsHtml = SHARE_MODES.map(function(mode) {
            var activeClass = mode.id === selectedMode ? ' v026-share-card--active' : '';
            return '<div class="v026-share-card' + activeClass + '" data-share-mode="' + mode.id + '">' +
                '<div class="v026-share-card__icon">' + mode.icon + '</div>' +
                '<div class="v026-share-card__body">' +
                    '<div class="v026-share-card__title">' + self.escapeHtml(mode.title) + '</div>' +
                    '<div class="v026-share-card__desc">' + self.escapeHtml(mode.desc) + '</div>' +
                    '<div class="v026-share-card__hint">' + self.escapeHtml(mode.hint) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        return successHtml + summaryHtml +
            '<h3 class="v023-step-title">How do you want to share it?</h3>' +
            '<div class="v026-share-cards">' + cardsHtml + '</div>' +
            '<div style="margin-top: var(--space-6, 1.5rem); text-align: center;">' +
                '<button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">' +
                    this.escapeHtml(this.t('upload.result.send_another')) +
                '</button>' +
            '</div>';
    }

    // Default: show the selected mode's sharing details directly
    var detailHtml = '';
    var modeConfig = SHARE_MODES.find(function(m) { return m.id === selectedMode; });

    if (selectedMode === 'combined') {
        detailHtml = this._v026_renderCombined(result);
    } else if (selectedMode === 'separate') {
        detailHtml = this._v026_renderSeparate(result);
    } else if (selectedMode === 'token') {
        detailHtml = this._v026_renderToken(result);
    }

    // Delivery mode reminder
    var deliveryLabel = '';
    if (result.delivery && result.delivery !== 'download') {
        var deliveryOpt = (this._v023_deliveryOptions || []).find(function(o) { return o.id === result.delivery; });
        if (deliveryOpt) {
            deliveryLabel =
                '<div class="v023-delivery-choice" style="margin-bottom: var(--space-3, 0.75rem);">' +
                    '<span class="v023-delivery-choice__label">Delivery:</span>' +
                    '<span class="v023-delivery-choice__value">' + deliveryOpt.icon + ' ' + this.escapeHtml(deliveryOpt.title) + '</span>' +
                '</div>';
        }
    }

    // When encrypted with a friendly key, mode is locked (key is PBKDF2-derived, can't switch)
    var modeLocked = selectedMode === 'token' && result.friendlyKey;
    var changeBtn = modeLocked ? '' : '<button class="v026-mode-change" id="v026-change-mode">Change</button>';

    return successHtml + summaryHtml + deliveryLabel +
        '<div class="v026-mode-header">' +
            '<span class="v026-mode-header__icon">' + modeConfig.icon + '</span>' +
            '<span class="v026-mode-header__title">' + this.escapeHtml(modeConfig.title) + '</span>' +
            changeBtn +
        '</div>' +
        detailHtml +
        '<div class="v026-security-note">' +
            '<span>&#128274;</span> ' + this.escapeHtml(modeConfig.security) +
        '</div>' +
        this._renderTimings() +
        (result.transparency ? '<send-transparency id="transparency-panel"></send-transparency>' : '') +
        '<div style="margin-top: var(--space-6, 1.5rem); text-align: center;">' +
            '<button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">' +
                this.escapeHtml(this.t('upload.result.send_another')) +
            '</button>' +
        '</div>';
};

// ─── Combined link rendering ───────────────────────────────────────────────
SendUpload.prototype._v026_renderCombined = function(result) {
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">Share this link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="combined-link">' + this.escapeHtml(result.combinedUrl) + '</div>' +
            '<button class="btn btn-primary btn-sm" data-copy="combined-link">' + this.escapeHtml(this.t('upload.result.copy_link')) + '</button>' +
        '</div>' +
        '<a href="' + this.escapeHtml(result.combinedUrl) + '" target="_blank" rel="noopener" class="v026-open-link">Open in new tab &#8599;</a>' +
    '</div>';
};

// ─── Separate link + key rendering ──────────────────────────────────────────
SendUpload.prototype._v026_renderSeparate = function(result) {
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">1. Send this link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="link-only">' + this.escapeHtml(result.linkOnlyUrl) + '</div>' +
            '<button class="btn btn-sm" data-copy="link-only">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">2. Send this key separately</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--key" id="decryption-key">' + this.escapeHtml(result.keyString) + '</div>' +
            '<button class="btn btn-sm" data-copy="decryption-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Send through a different channel (e.g. link via email, key via chat)</div>' +
    '</div>';
};

// ─── Token + key rendering ──────────────────────────────────────────────────
SendUpload.prototype._v026_renderToken = function(result) {
    var transferId = result.transferId || '';
    var friendlyKey = result.friendlyKey || null;

    if (friendlyKey) {
        return '<div class="v026-share-value">' +
            '<label class="v026-share-label">1. Share this token</label>' +
            '<div class="v026-share-row">' +
                '<div class="v026-share-box v026-share-box--token" id="transfer-token">' + this.escapeHtml(transferId) + '</div>' +
                '<button class="btn btn-sm" data-copy="transfer-token">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
            '</div>' +
            '<div class="v026-share-guidance">Recipient enters this at ' + this.escapeHtml(window.location.origin) + '</div>' +
        '</div>' +
        '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
            '<label class="v026-share-label">2. Share this key</label>' +
            '<div class="v026-share-row">' +
                '<div class="v026-share-box v026-share-box--friendly" id="friendly-key">' + this.escapeHtml(friendlyKey) + '</div>' +
                '<button class="btn btn-sm" data-copy="friendly-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
            '</div>' +
            '<div class="v026-share-guidance">Tell them this key &mdash; easy to say and type</div>' +
        '</div>';
    }

    // Fallback: no friendly key, show raw key
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">1. Share this token</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--token" id="transfer-token">' + this.escapeHtml(transferId) + '</div>' +
            '<button class="btn btn-sm" data-copy="transfer-token">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Recipient enters this at ' + this.escapeHtml(window.location.origin) + '</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">2. Share the decryption key</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--key" id="decryption-key">' + this.escapeHtml(result.keyString) + '</div>' +
            '<button class="btn btn-sm" data-copy="decryption-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
    '</div>';
};

// ─── Override: setupDynamicListeners — handle mode cards + copy ──────────────
SendUpload.prototype.setupDynamicListeners = function() {
    var self = this;

    // Copy buttons
    this.querySelectorAll('[data-copy]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            var targetId = e.target.getAttribute('data-copy');
            var el = self.querySelector('#' + targetId);
            if (el) self.copyToClipboard(el.textContent, e.target);
        });
    });

    // Share mode card selection (in picker view on result screen)
    this.querySelectorAll('[data-share-mode]').forEach(function(card) {
        card.addEventListener('click', function() {
            self._v026_shareMode = card.getAttribute('data-share-mode');
            self._v026_showPicker = false;
            self.render();
            self.setupDynamicListeners();
        });
    });

    // Change mode button — show the card picker
    var changeBtn = this.querySelector('#v026-change-mode');
    if (changeBtn) {
        changeBtn.addEventListener('click', function() {
            self._v026_showPicker = true;
            self.render();
            self.setupDynamicListeners();
        });
    }

    // Transparency panel
    var transparencyPanel = this.querySelector('#transparency-panel');
    if (transparencyPanel && self.result && self.result.transparency) {
        transparencyPanel.setData(self.result.transparency);
    }

    // Send another
    var sendAnotherBtn = this.querySelector('#send-another-btn');
    if (sendAnotherBtn) {
        sendAnotherBtn.addEventListener('click', function() { self.resetForNew(); });
    }
};

// ─── Override: resetForNew — clear share mode ───────────────────────────────
SendUpload.prototype.resetForNew = function() {
    this._v026_shareMode      = null;
    this._v026_showPicker     = false;
    this._v026_friendlyParts  = null;
    this._v026_friendlyKey    = null;
    _v025_resetForNew.call(this);
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v026-styles')) return;
    var style = document.createElement('style');
    style.id = 'v026-styles';
    style.textContent = '\
        /* Success banner */\
        .v026-success-banner {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.08);\
            border: 1px solid rgba(78, 205, 196, 0.25);\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-4, 1rem);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-success, #4ECDC4);\
            font-weight: var(--weight-semibold, 600);\
        }\
        .v026-success-banner__icon {\
            font-size: 1.25rem;\
            flex-shrink: 0;\
        }\
        \
        /* Share mode cards */\
        .v026-share-cards {\
            display: flex;\
            flex-direction: column;\
            gap: var(--space-3, 0.75rem);\
            margin-top: var(--space-4, 1rem);\
        }\
        .v026-share-card {\
            display: flex;\
            align-items: flex-start;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
            background: var(--color-surface, #1E2A4A);\
            cursor: pointer;\
            transition: border-color 0.2s, background 0.2s, transform 0.15s;\
        }\
        .v026-share-card:hover {\
            border-color: var(--color-primary, #4ECDC4);\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));\
            transform: translateY(-1px);\
        }\
        .v026-share-card--active {\
            border-color: var(--color-primary, #4ECDC4);\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.08));\
        }\
        .v026-share-card__icon {\
            font-size: 1.5rem;\
            flex-shrink: 0;\
            margin-top: 2px;\
        }\
        .v026-share-card__body { flex: 1; min-width: 0; }\
        .v026-share-card__title {\
            font-size: var(--text-body, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v026-share-card__desc {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            line-height: 1.5;\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v026-share-card__hint {\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-primary, #4ECDC4);\
            opacity: 0.8;\
        }\
        \
        /* Confirmation summary */\
        .v026-summary {\
            display: flex;\
            flex-direction: column;\
            gap: 0;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
            overflow: hidden;\
        }\
        .v026-summary__row {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: var(--color-surface, #1E2A4A);\
            border-bottom: 1px solid var(--color-border, rgba(78, 205, 196, 0.1));\
        }\
        .v026-summary__row:last-child { border-bottom: none; }\
        .v026-summary__label {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            min-width: 80px;\
            flex-shrink: 0;\
            text-transform: uppercase;\
            letter-spacing: 0.05em;\
            font-weight: var(--weight-semibold, 600);\
        }\
        .v026-summary__value {\
            flex: 1;\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text, #E0E0E0);\
            min-width: 0;\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
        }\
        .v026-summary__icon { font-size: 1rem; }\
        .v026-summary__meta {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
        }\
        .v026-summary__change {\
            background: none;\
            border: none;\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-micro, 0.625rem);\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            border-radius: var(--radius-xs, 4px);\
            text-decoration: underline;\
            text-underline-offset: 2px;\
            flex-shrink: 0;\
        }\
        .v026-summary__change:hover {\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Big send button */\
        .v026-send-action {\
            text-align: center;\
            margin-top: var(--space-6, 1.5rem);\
        }\
        .v026-send-btn {\
            display: inline-flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem) var(--space-8, 2rem);\
            background: var(--color-primary, #4ECDC4);\
            color: var(--color-bg, #1A1A2E);\
            border: none;\
            border-radius: var(--radius-md, 12px);\
            font-size: var(--text-lg, 1.25rem);\
            font-weight: var(--weight-bold, 700);\
            cursor: pointer;\
            transition: transform 0.15s, box-shadow 0.2s, background 0.2s;\
            box-shadow: 0 4px 16px rgba(78, 205, 196, 0.3);\
        }\
        .v026-send-btn:hover {\
            transform: translateY(-2px);\
            box-shadow: 0 6px 24px rgba(78, 205, 196, 0.45);\
            background: #5DE0D6;\
        }\
        .v026-send-btn:active {\
            transform: translateY(0);\
            box-shadow: 0 2px 8px rgba(78, 205, 196, 0.25);\
        }\
        .v026-send-btn__icon { font-size: 1.5rem; }\
        .v026-send-btn__text { white-space: nowrap; }\
        \
        /* Mode header (after selection) */\
        .v026-mode-header {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-4, 1rem);\
        }\
        .v026-mode-header__icon { font-size: 1.25rem; }\
        .v026-mode-header__title {\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
            flex: 1;\
        }\
        .v026-mode-change {\
            background: none;\
            border: none;\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-small, 0.75rem);\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            border-radius: var(--radius-xs, 4px);\
        }\
        .v026-mode-change:hover {\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
        }\
        \
        /* Share value blocks */\
        .v026-share-value {\
            margin-top: var(--space-3, 0.75rem);\
        }\
        .v026-share-label {\
            display: block;\
            font-weight: var(--weight-semibold, 600);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v026-share-row {\
            display: flex;\
            gap: var(--space-2, 0.5rem);\
            align-items: center;\
        }\
        .v026-share-box {\
            flex: 1;\
            min-width: 0;\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-sm, 0.875rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            padding: 0.5rem 0.75rem;\
            white-space: nowrap;\
            overflow-x: auto;\
            color: var(--color-text, #E0E0E0);\
        }\
        .v026-share-box--token {\
            font-size: var(--text-lg, 1.25rem);\
            letter-spacing: 0.1em;\
            font-weight: var(--weight-semibold, 600);\
            text-align: center;\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v026-share-box--key {\
            font-size: var(--text-small, 0.75rem);\
            word-break: break-all;\
            white-space: normal;\
        }\
        .v026-share-guidance {\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-text-secondary, #8892A0);\
            opacity: 0.7;\
            margin-top: var(--space-1, 0.25rem);\
        }\
        .v026-open-link {\
            display: inline-block;\
            margin-top: var(--space-2, 0.5rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            text-decoration: none;\
        }\
        .v026-open-link:hover {\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Security note */\
        .v026-security-note {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            margin-top: var(--space-4, 1rem);\
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            background: rgba(78, 205, 196, 0.04);\
            border-radius: var(--radius-sm, 6px);\
        }\
        \
        /* Word picker */\
        .v026-word-picker {\
            margin-top: var(--space-4, 1rem);\
            padding: var(--space-4, 1rem);\
            background: var(--color-surface, #1E2A4A);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
        }\
        .v026-word-picker__label {\
            display: block;\
            font-size: var(--text-sm, 0.875rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
            margin-bottom: var(--space-3, 0.75rem);\
        }\
        .v026-word-picker__slots {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            justify-content: center;\
            flex-wrap: wrap;\
        }\
        .v026-word-picker__slot {\
            display: flex;\
            align-items: center;\
            gap: var(--space-1, 0.25rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);\
        }\
        .v026-word-picker__word,\
        .v026-word-picker__suffix {\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-body, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v026-word-picker__shuffle-btn {\
            background: none;\
            border: none;\
            cursor: pointer;\
            padding: 2px;\
            font-size: 0.875rem;\
            color: var(--color-text-secondary, #8892A0);\
            border-radius: var(--radius-xs, 4px);\
            transition: color 0.2s, background 0.2s;\
            line-height: 1;\
        }\
        .v026-word-picker__shuffle-btn:hover {\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
        }\
        .v026-word-picker__sep {\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-sm, 0.875rem);\
        }\
        .v026-word-picker__preview {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            margin-top: var(--space-3, 0.75rem);\
            justify-content: center;\
        }\
        .v026-word-picker__key {\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-lg, 1.25rem);\
            font-weight: var(--weight-bold, 700);\
            color: var(--color-primary, #4ECDC4);\
            letter-spacing: 0.05em;\
        }\
        .v026-word-picker__action {\
            background: none;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            border-radius: var(--radius-xs, 4px);\
            transition: color 0.2s, border-color 0.2s;\
        }\
        .v026-word-picker__action:hover {\
            color: var(--color-primary, #4ECDC4);\
            border-color: var(--color-primary, #4ECDC4);\
        }\
        .v026-word-picker__hint {\
            text-align: center;\
            margin-top: var(--space-2, 0.5rem);\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-text-secondary, #8892A0);\
            opacity: 0.7;\
        }\
        \
        /* Friendly key box in result */\
        .v026-share-box--friendly {\
            font-size: var(--text-lg, 1.25rem);\
            letter-spacing: 0.05em;\
            font-weight: var(--weight-semibold, 600);\
            text-align: center;\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v026-share-row { flex-direction: column; align-items: stretch; }\
            .v026-share-row .btn { width: 100%; }\
            .v026-summary__label { min-width: 60px; }\
            .v026-send-btn { width: 100%; justify-content: center; }\
            .v026-word-picker__slots { flex-direction: column; }\
            .v026-word-picker__sep { display: none; }\
        }\
    ';
    document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.7 — Next button, trust carousel
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.7 — Surgical overlay on v0.2.6

   Changes:
     - Persistent "Next" button at top-right of wizard (steps 2-4)
       Always in the same position so repeat users can click through defaults
       without reading options each time.
     - Trust-building progress carousel during encrypt/upload
       Rotating messages about privacy, security, and zero-knowledge design
       shown alongside the progress bar.

   Loads AFTER v0.2.6 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Store methods we override ──────────────────────────────────────────────
var _v026_render         = SendUpload.prototype.render;
var _v026_setupEvents    = SendUpload.prototype.setupEventListeners;
var _v026_renderProcess  = SendUpload.prototype._v023_renderProcessing;

// ─── Trust-building messages for the progress carousel ──────────────────────
var CAROUSEL_MESSAGES = [
    {
        icon: '\uD83D\uDD12',   // lock
        text: 'Your file is encrypted with AES-256-GCM. The key never leaves your device.'
    },
    {
        icon: '\uD83D\uDEE1\uFE0F', // shield
        text: 'Even we can\'t read what you\'re uploading. That\'s the point.'
    },
    {
        icon: '\uD83C\uDF6A',   // cookie
        text: 'Zero cookies. Zero tracking. Verify: open DevTools \u2192 Application \u2192 Cookies.'
    },
    {
        icon: '\uD83C\uDFD4\uFE0F', // mountain
        text: 'Tip: Share the code by voice, the link by text \u2014 different channels, maximum security.'
    },
    {
        icon: '\uD83D\uDCDC',   // scroll
        text: 'Our privacy policy is six sentences. No lawyers needed.'
    },
    {
        icon: '\uD83D\uDD11',   // key
        text: 'The decryption key is only in your browser. We never see it, store it, or transmit it.'
    },
    {
        icon: '\u2705',         // check
        text: 'No account required. No email collected. Just encrypted file sharing.'
    },
    {
        icon: '\uD83D\uDD2C',   // microscope
        text: 'Don\'t trust us \u2014 verify. Open the Network tab and inspect every request we make.'
    },
    {
        icon: '\uD83C\uDF0D',   // globe
        text: 'Available in 17 languages. Same zero-knowledge encryption everywhere.'
    },
    {
        icon: '\uD83D\uDCE6',   // package
        text: 'Files are split into encrypted chunks. Each chunk is meaningless without your key.'
    }
];

var CAROUSEL_INTERVAL_MS = 4000;

// Expose carousel messages for later overlays (v0.2.8+)
SendUpload.CAROUSEL_MESSAGES = CAROUSEL_MESSAGES;

// ─── Override: render — inject Next button bar after step indicator ──────────
SendUpload.prototype.render = function() {
    // Let v0.2.6 render normally first
    _v026_render.call(this);

    // Inject the Next button bar for steps 2-4 (choosing-delivery, choosing-share, confirming)
    var needsNext = (this.state === 'choosing-delivery' ||
                     this.state === 'choosing-share'    ||
                     this.state === 'confirming');

    if (needsNext) {
        var stepIndicator = this.querySelector('send-step-indicator');
        if (stepIndicator) {
            var nextBar = document.createElement('div');
            nextBar.className = 'v027-next-bar';

            var label = '';
            if (this.state === 'confirming') {
                label = 'Encrypt & Send \u2192';
                nextBar.innerHTML = '<button class="v027-next-btn v027-next-btn--send" id="v027-next-btn">' + label + '</button>';
            } else {
                label = 'Next \u2192';
                nextBar.innerHTML = '<button class="v027-next-btn" id="v027-next-btn">' + label + '</button>';
            }

            stepIndicator.insertAdjacentElement('afterend', nextBar);
        }
    }

    // Start carousel timer for processing states
    var isProcessing = (this.state === 'zipping'    || this.state === 'reading'    ||
                        this.state === 'encrypting' || this.state === 'creating'   ||
                        this.state === 'uploading'  || this.state === 'completing');

    if (isProcessing) {
        this._v027_startCarousel();
    } else {
        this._v027_stopCarousel();
    }
};

// ─── Override: setupEventListeners — wire the Next button ───────────────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;
    _v026_setupEvents.call(this);

    var nextBtn = this.querySelector('#v027-next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            self._v027_handleNext();
        });
    }
};

// ─── Next button logic — advance with current default ───────────────────────
SendUpload.prototype._v027_handleNext = function() {
    if (this.state === 'choosing-delivery') {
        // Use recommended delivery or first option as default
        var selected = this._v023_selectedDelivery
                    || this._v023_recommendedDelivery
                    || (this._v023_deliveryOptions && this._v023_deliveryOptions.length > 0
                        ? this._v023_deliveryOptions[0].id
                        : 'download');
        this._v023_selectedDelivery = selected;
        this._v026_shareMode = this._v026_shareMode || 'token';
        this.state = 'choosing-share';
        this.render();
        this.setupEventListeners();

    } else if (this.state === 'choosing-share') {
        // Default to token (already pre-selected)
        this._v026_shareMode = this._v026_shareMode || 'token';
        this.state = 'confirming';
        this.render();
        this.setupEventListeners();

    } else if (this.state === 'confirming') {
        // Trigger Encrypt & Send
        this._v023_startProcessing();
    }
};

// ─── Override: renderProcessing — add carousel ──────────────────────────────
SendUpload.prototype._v023_renderProcessing = function() {
    var stage = SendUpload.PROGRESS_STAGES[this.state];
    var pct   = stage ? stage.pct : 5;
    var label = stage ? this.t(stage.label) : 'Processing...';

    // Pick initial message
    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }
    var msg = CAROUSEL_MESSAGES[this._v027_carouselIndex % CAROUSEL_MESSAGES.length];

    return '<div class="v023-processing">' +
        '<div class="v023-processing__label">' + this.escapeHtml(label) + '</div>' +
        '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" style="width: ' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v027-carousel" id="v027-carousel">' +
            '<div class="v027-carousel__message v027-carousel__message--visible">' +
                '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                '<span class="v027-carousel__text">' + this.escapeHtml(msg.text) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="v023-processing__hint" style="margin-top: var(--space-3, 0.75rem); opacity: 0.5; font-size: var(--text-micro, 0.625rem);">' +
            'Keep this tab open while your file uploads.' +
        '</div>' +
    '</div>';
};

// ─── Carousel timer management ──────────────────────────────────────────────
SendUpload.prototype._v027_startCarousel = function() {
    var self = this;
    if (this._v027_carouselTimer) return; // already running

    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }

    this._v027_carouselTimer = setInterval(function() {
        self._v027_carouselIndex = (self._v027_carouselIndex + 1) % CAROUSEL_MESSAGES.length;
        var carousel = self.querySelector('#v027-carousel');
        if (!carousel) return;

        var msg = CAROUSEL_MESSAGES[self._v027_carouselIndex];
        var existing = carousel.querySelector('.v027-carousel__message');

        // Fade out current
        if (existing) {
            existing.classList.remove('v027-carousel__message--visible');
            existing.classList.add('v027-carousel__message--fading');
        }

        // After fade out, swap content and fade in
        setTimeout(function() {
            carousel.innerHTML =
                '<div class="v027-carousel__message">' +
                    '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                    '<span class="v027-carousel__text">' + self.escapeHtml(msg.text) + '</span>' +
                '</div>';
            // Trigger reflow then add visible class for fade-in
            var newMsg = carousel.querySelector('.v027-carousel__message');
            if (newMsg) {
                newMsg.offsetHeight; // force reflow
                newMsg.classList.add('v027-carousel__message--visible');
            }
        }, 400);
    }, CAROUSEL_INTERVAL_MS);
};

SendUpload.prototype._v027_stopCarousel = function() {
    if (this._v027_carouselTimer) {
        clearInterval(this._v027_carouselTimer);
        this._v027_carouselTimer = null;
    }
    this._v027_carouselIndex = 0;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v027-styles')) return;
    var style = document.createElement('style');
    style.id = 'v027-styles';
    style.textContent = '\
        /* Next button bar — fixed position after step indicator */\
        .v027-next-bar {\
            display: flex;\
            justify-content: flex-end;\
            margin-bottom: var(--space-4, 1rem);\
            padding-bottom: var(--space-3, 0.75rem);\
            border-bottom: 1px solid var(--color-border, rgba(78, 205, 196, 0.1));\
        }\
        .v027-next-btn {\
            display: inline-flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-2, 0.5rem) var(--space-5, 1.25rem);\
            background: var(--color-primary, #4ECDC4);\
            color: var(--color-bg, #1A1A2E);\
            border: none;\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-sm, 0.875rem);\
            font-weight: var(--weight-semibold, 600);\
            cursor: pointer;\
            transition: transform 0.15s, box-shadow 0.2s, background 0.2s;\
            white-space: nowrap;\
        }\
        .v027-next-btn:hover {\
            transform: translateY(-1px);\
            box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);\
            background: #5DE0D6;\
        }\
        .v027-next-btn:active {\
            transform: translateY(0);\
        }\
        .v027-next-btn--send {\
            padding: var(--space-2, 0.5rem) var(--space-6, 1.5rem);\
            box-shadow: 0 2px 8px rgba(78, 205, 196, 0.25);\
        }\
        \
        /* Progress carousel */\
        .v027-carousel {\
            margin-top: var(--space-4, 1rem);\
            min-height: 3rem;\
            display: flex;\
            align-items: center;\
            justify-content: center;\
        }\
        .v027-carousel__message {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid rgba(78, 205, 196, 0.1);\
            border-radius: var(--radius-sm, 6px);\
            opacity: 0;\
            transform: translateY(4px);\
            transition: opacity 0.4s ease, transform 0.4s ease;\
            width: 100%;\
            box-sizing: border-box;\
        }\
        .v027-carousel__message--visible {\
            opacity: 1;\
            transform: translateY(0);\
        }\
        .v027-carousel__message--fading {\
            opacity: 0;\
            transform: translateY(-4px);\
        }\
        .v027-carousel__icon {\
            font-size: 1.25rem;\
            flex-shrink: 0;\
        }\
        .v027-carousel__text {\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
            line-height: 1.5;\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v027-next-btn {\
                padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
                font-size: var(--text-small, 0.75rem);\
            }\
            .v027-carousel__message {\
                flex-direction: column;\
                text-align: center;\
                gap: var(--space-2, 0.5rem);\
            }\
        }\
    ';
    document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.8 — Six-step wizard, inline Next, default selection
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.8 — Surgical overlay on v0.2.7

   Changes:
     - Six-step wizard (was five):
       1. Upload — drop/browse file
       2. Delivery — download/view/browse
       3. Share mode — token/combined/separate
       4. Confirm — review choices
       5. Encrypt & Upload — processing (encrypt + upload)
       6. Done — result in chosen mode
     - Next button moved INLINE with step indicator (same row, vertically centred)
       Eliminates the empty space below the step bar.
       Fixed width so the step indicator doesn't shift between states.
     - Next button visible but DISABLED during step 5 (processing)
     - Step 2: Default delivery pre-selected; deselects on hover, reselects
       on mouseout if nothing clicked. Badge: "RECOMMENDED" → "DEFAULT".
     - Step 4: Remove duplicate bottom Encrypt & Send button
     - Step 6: "Email Link" button. In simple token mode, show simple token
       prominently + full link below (no transfer ID, no success banner, etc.)

   Loads AFTER v0.2.7 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Store methods we override ──────────────────────────────────────────────
var _v027_render          = SendUpload.prototype.render;
var _v027_setupEvents     = SendUpload.prototype.setupEventListeners;
var _v027_handleNext      = SendUpload.prototype._v027_handleNext;
var _v026_renderConfirm   = SendUpload.prototype._v026_renderConfirm;
var _v026_renderToken     = SendUpload.prototype._v026_renderToken;

// ─── Update step indicator to 6 steps ───────────────────────────────────────
if (typeof SendStepIndicator !== 'undefined') {
    SendStepIndicator.STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];
}

// ─── New state-to-step mapping (6 steps) ────────────────────────────────────
var V028_TOTAL_STEPS = 6;
var V028_STATE_TO_STEP = {
    'idle':              1,
    'folder-options':    1,
    'file-ready':        1,
    'choosing-delivery': 2,
    'choosing-share':    3,
    'confirming':        4,
    'zipping':           5,
    'reading':           5,
    'encrypting':        5,
    'creating':          5,
    'uploading':         5,
    'completing':        5,
    'complete':          6,
    'error':             1
};

// ─── Override: render — 6-step mapping + inline Next button ─────────────────
SendUpload.prototype.render = function() {
    this._stageTimestamps = this._stageTimestamps || {};
    this._stageTimestamps[this.state] = Date.now();

    var step = V028_STATE_TO_STEP[this.state] || 1;
    var stepIndicator = '<send-step-indicator step="' + step + '" total="' + V028_TOTAL_STEPS + '"></send-step-indicator>';

    // Build content via existing renderers
    var content = '';
    switch (this.state) {
        case 'idle':              content = this._v023_renderStep1Idle(); break;
        case 'folder-options':    content = this.renderFolderOptions(); break;
        case 'file-ready':        content = this._v023_renderFileReady(); break;
        case 'choosing-delivery': content = this._v023_renderStep2(); break;
        case 'choosing-share':    content = this._v026_renderShareChoice(); break;
        case 'confirming':        content = this._v026_renderConfirm(); break;
        case 'zipping':
        case 'reading':
        case 'encrypting':
        case 'creating':
        case 'uploading':
        case 'completing':        content = this._v023_renderProcessing(); break;
        case 'complete':          content = this.renderResult(); break;
        case 'error':             content = this.renderError(); break;
        default:                  _v027_render.call(this); return;
    }

    // ── Build Next button (inline with step indicator) ──
    var nextBtnHtml = '';
    var isProcessing = (this.state === 'zipping'    || this.state === 'reading'    ||
                        this.state === 'encrypting' || this.state === 'creating'   ||
                        this.state === 'uploading'  || this.state === 'completing');

    if (this.state === 'choosing-delivery' || this.state === 'choosing-share') {
        nextBtnHtml = '<button class="v028-inline-next" id="v028-next-btn">Next \u2192</button>';
    } else if (this.state === 'confirming') {
        nextBtnHtml = '<button class="v028-inline-next v028-inline-next--send" id="v028-next-btn">Encrypt &amp; Upload \u2192</button>';
    } else if (isProcessing) {
        nextBtnHtml = '<button class="v028-inline-next v028-inline-next--disabled" disabled>Encrypting\u2026</button>';
    } else if (this.state === 'complete') {
        nextBtnHtml = '<button class="v028-inline-next" id="v028-email-link-btn">Email Link</button>';
    }

    // Wrap step indicator + button in a flex row
    var headerRow = '<div class="v028-header-row">' +
        '<div class="v028-header-row__steps">' + stepIndicator + '</div>' +
        (nextBtnHtml ? '<div class="v028-header-row__action">' + nextBtnHtml + '</div>' : '') +
    '</div>';

    this.innerHTML =
        '<div class="card">' +
            headerRow +
            '<div class="step-content' + (this._v023_goingBack ? ' step-content--reverse' : '') + '">' +
                content +
            '</div>' +
        '</div>';
    this._v023_goingBack = false;

    // ── Step 2: Pre-select the recommended delivery option ──
    if (this.state === 'choosing-delivery') {
        var recommended = this._v023_recommendedDelivery || 'download';
        var cards = this.querySelectorAll('.v023-delivery-card');
        cards.forEach(function(card) {
            if (card.getAttribute('data-delivery') === recommended) {
                card.classList.add('v028-default-selected');
            }
        });
    }

    // ── Step 4: Remove the bottom Encrypt & Send button (inline button has it) ──
    if (this.state === 'confirming') {
        var sendAction = this.querySelector('.v026-send-action');
        if (sendAction) sendAction.remove();
    }

    // ── Step 6: In simple token mode, strip everything except token + key ──
    if (this.state === 'complete' && this._v026_shareMode === 'token' && !this._v026_showPicker) {
        // Remove success banner, file summary, delivery label, mode header,
        // security note, timings, transparency — keep only the share values + send another
        var toRemove = [
            '.v026-success-banner',
            '.v023-file-summary',
            '.v023-delivery-choice',
            '.v026-mode-header',
            '.v026-security-note',
            '.v023-timings',
            '#transparency-panel'
        ];
        var self = this;
        toRemove.forEach(function(sel) {
            var el = self.querySelector(sel);
            if (el) el.remove();
        });
    }

    // ── Step 6: Email Link button handler (must be in render, not setupEventListeners,
    //    because complete state calls setupDynamicListeners not setupEventListeners) ──
    if (this.state === 'complete') {
        var self = this;
        var emailBtn = this.querySelector('#v028-email-link-btn');
        if (emailBtn && this.result) {
            emailBtn.addEventListener('click', function() {
                var friendlyKey = self.result.friendlyKey || '';
                var tokenLink = self._v028_buildTokenLink(friendlyKey);
                var subject = 'Secure file shared via SGraph Send';
                var body = '';
                if (self._v026_shareMode === 'token' && friendlyKey) {
                    body = 'I\'ve shared a file with you via SGraph Send.\n\n' +
                           'Simple token: ' + friendlyKey + '\n\n' +
                           'Or use this direct link:\n' + tokenLink;
                } else {
                    var link = self.result.combinedUrl || self.result.linkOnlyUrl || '';
                    body = 'I\'ve shared a file with you via SGraph Send.\n\n' +
                           'Link: ' + link;
                }
                window.open('mailto:?subject=' + encodeURIComponent(subject) +
                            '&body=' + encodeURIComponent(body), '_blank');
            });
        }
    }

    // Start/stop carousel for processing states
    if (isProcessing) {
        this._v027_startCarousel();
    } else {
        this._v027_stopCarousel();
    }
};

// ─── Override: setupEventListeners — inline Next + hover + Copy Link ────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;

    // Call v0.2.7's setup (which calls v0.2.6's setup)
    _v027_setupEvents.call(this);

    // ── Inline Next button ──
    var nextBtn = this.querySelector('#v028-next-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            self._v027_handleNext();
        });
    }

    // ── Step 2: Hover deselects default, mouseout reselects ──
    if (this.state === 'choosing-delivery') {
        var recommended = this._v023_recommendedDelivery || 'download';
        var cards = this.querySelectorAll('.v023-delivery-card');
        var defaultCard = this.querySelector('.v023-delivery-card[data-delivery="' + recommended + '"]');

        cards.forEach(function(card) {
            var isDefault = card.getAttribute('data-delivery') === recommended;

            card.addEventListener('mouseenter', function() {
                if (!isDefault && defaultCard) {
                    defaultCard.classList.remove('v028-default-selected');
                    card.classList.add('v028-hover-highlight');
                }
            });

            card.addEventListener('mouseleave', function() {
                card.classList.remove('v028-hover-highlight');
                if (!self._v023_selectedDelivery && defaultCard) {
                    defaultCard.classList.add('v028-default-selected');
                }
            });
        });
    }

    // Note: Email Link button handler is in render() because complete state
    // calls setupDynamicListeners, not setupEventListeners
};

// ─── Helper: build token-based link (origin/locale/route/#friendlyKey) ───────
SendUpload.prototype._v028_buildTokenLink = function(friendlyKey) {
    var locale   = this._detectLocalePrefix();
    var delivery = this.result && this.result.delivery || 'download';
    var route    = delivery === 'download' ? 'download' : delivery;
    return window.location.origin + '/' + locale + '/' + route + '/#' + friendlyKey;
};

// ─── Override: _v026_renderToken — file info + simple token + full link + QR ──
SendUpload.prototype._v026_renderToken = function(result) {
    var friendlyKey = result.friendlyKey || '';
    var tokenLink   = this._v028_buildTokenLink(friendlyKey);

    // File info
    var fileInfoHtml = '';
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    if (file || isFolder) {
        var icon = isFolder ? '&#128193;' : '&#128196;';
        var name = isFolder ? (this._folderName || 'folder') + '/' : file.name;
        var size = isFolder ? this.formatBytes(this._folderScan.totalSize) : this.formatBytes(file.size);
        fileInfoHtml = '<div class="v028-file-info">' +
            '<span class="v028-file-info__icon">' + icon + '</span>' +
            '<span class="v028-file-info__name">' + this.escapeHtml(name) + '</span>' +
            '<span class="v028-file-info__size">' + size + '</span>' +
        '</div>';
    }

    // QR code + Open in new tab — side by side
    var qrHtml = '';
    var qrSvg = (window.sgraphSend && window.sgraphSend.qr && tokenLink)
              ? window.sgraphSend.qr.toSvg(tokenLink, { ecl: 'medium', border: 2, lightColor: '#ffffff', darkColor: '#1A1A2E' })
              : '';
    var openLinkHtml = tokenLink
        ? '<a class="v028-open-link" href="' + this.escapeHtml(tokenLink) + '" target="_blank" rel="noopener">' +
              '<span class="v028-open-link__icon">&#8599;</span>' +
              '<span class="v028-open-link__text">Open in new tab</span>' +
              '<span class="v028-open-link__hint">Test the recipient experience</span>' +
          '</a>'
        : '';
    if (qrSvg || openLinkHtml) {
        qrHtml = '<div class="v028-qr-open-row">' +
            (qrSvg ? '<div class="v028-qr-section">' +
                '<div class="v028-qr-code">' + qrSvg + '</div>' +
                '<div class="v028-qr-label">Scan to open link</div>' +
            '</div>' : '') +
            (openLinkHtml ? openLinkHtml : '') +
        '</div>';
    }

    return fileInfoHtml +
    '<div class="v026-share-value">' +
        '<label class="v026-share-label">Simple token</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--friendly" id="simple-token">' + this.escapeHtml(friendlyKey) + '</div>' +
            '<button class="btn btn-sm v028-copy-btn" data-copy="simple-token">Copy</button>' +
        '</div>' +
        '<div class="v026-share-guidance">This token derives both the transfer ID and decryption key</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">Full link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="full-link">' + this.escapeHtml(tokenLink) + '</div>' +
            '<button class="btn btn-sm v028-copy-btn" data-copy="full-link">Copy</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Direct link &mdash; anyone with this can decrypt the file</div>' +
    '</div>' +
    qrHtml;
};

// ─── Override: _v023_renderProcessing — trust messages + stats side by side ──
SendUpload.prototype._v023_renderProcessing = function() {
    var stage = SendUpload.PROGRESS_STAGES[this.state];
    var pct   = stage ? stage.pct : 5;
    var label = stage ? this.t(stage.label) : 'Processing...';

    // Build completed stage rows from timestamps
    var allStages = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing'];
    var ts = this._stageTimestamps || {};
    var completedRows = '';
    var currentIndex = allStages.indexOf(this.state);

    for (var i = 0; i < allStages.length; i++) {
        var s = allStages[i];
        var next = allStages[i + 1] || this.state;
        if (ts[s] && ts[next] && i < currentIndex) {
            var ms = ts[next] - ts[s];
            var stageLabel = this.t(SendUpload.PROGRESS_STAGES[s]?.label || s).replace('...', '');
            completedRows +=
                '<div class="v028-live-timing__row">' +
                    '<span class="v028-live-timing__label">' + this.escapeHtml(stageLabel) + '</span>' +
                    '<span class="v028-live-timing__check">&#10003;</span>' +
                    '<span class="v028-live-timing__ms">' + ms + 'ms</span>' +
                '</div>';
        }
    }

    // Carousel message (left column)
    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }
    var CAROUSEL = SendUpload.CAROUSEL_MESSAGES || [];
    var msg = CAROUSEL.length > 0 ? CAROUSEL[this._v027_carouselIndex % CAROUSEL.length] : null;
    var carouselHtml = msg
        ? '<div class="v028-process-col v028-process-col--messages">' +
              '<div class="v027-carousel" id="v027-carousel">' +
                  '<div class="v027-carousel__message v027-carousel__message--visible">' +
                      '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                      '<span class="v027-carousel__text">' + this.escapeHtml(msg.text) + '</span>' +
                  '</div>' +
              '</div>' +
          '</div>'
        : '<div class="v028-process-col v028-process-col--messages">' +
              '<div class="v023-processing__hint">Your file is being encrypted in your browser. Keep this tab open.</div>' +
          '</div>';

    // Stats column (right column)
    var statsHtml = completedRows
        ? '<div class="v028-process-col v028-process-col--stats">' +
              '<div class="v028-live-timing">' + completedRows + '</div>' +
          '</div>'
        : '';

    return '<div class="v023-processing">' +
        '<div class="v023-processing__label">' + this.escapeHtml(label) + '</div>' +
        '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" style="width: ' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v028-process-columns">' +
            carouselHtml +
            statsHtml +
        '</div>' +
    '</div>';
};

// ─── Override: _v026_renderConfirm — update hint text ───────────────────────
SendUpload.prototype._v026_renderConfirm = function() {
    var html = _v026_renderConfirm.call(this);
    html = html.replace(
        'Review your choices, then hit the button below.',
        'Review your choices, then hit Encrypt &amp; Upload.'
    );
    return html;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v028-styles')) return;
    var style = document.createElement('style');
    style.id = 'v028-styles';
    style.textContent = '\
        /* Widen the main content area to match header width */\
        main {\
            max-width: 1100px !important;\
        }\
        \
        /* Kill the step-content fade animation — causes flicker on re-renders */\
        .step-content,\
        .step-content--reverse {\
            animation: none !important;\
        }\
        \
        /* Header row: step indicator + Next button inline, aligned to top */\
        .v028-header-row {\
            display: flex;\
            align-items: flex-start;\
            gap: var(--space-5, 1.25rem);\
            margin-bottom: var(--space-5, 1.25rem);\
        }\
        .v028-header-row__steps {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-header-row__action {\
            flex-shrink: 0;\
        }\
        \
        /* Inline Next button — fixed size so step indicator does not shift */\
        .v028-inline-next {\
            display: inline-flex;\
            align-items: center;\
            justify-content: center;\
            min-width: 180px;\
            height: 54px;\
            padding: 0 var(--space-6, 1.5rem);\
            background: var(--color-primary, #4ECDC4);\
            color: var(--color-bg, #1A1A2E);\
            border: none;\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-base, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            cursor: pointer;\
            transition: transform 0.15s, box-shadow 0.2s, background 0.2s;\
            white-space: nowrap;\
            box-sizing: border-box;\
        }\
        .v028-inline-next:hover:not(:disabled) {\
            transform: translateY(-1px);\
            box-shadow: 0 4px 12px rgba(78, 205, 196, 0.3);\
            background: #5DE0D6;\
        }\
        .v028-inline-next:active:not(:disabled) {\
            transform: translateY(0);\
        }\
        .v028-inline-next--send {\
            box-shadow: 0 2px 8px rgba(78, 205, 196, 0.25);\
        }\
        .v028-inline-next--disabled {\
            opacity: 0.5;\
            cursor: not-allowed;\
        }\
        \
        /* Hide v0.2.7 separate next-bar (we inline it now) */\
        .v027-next-bar {\
            display: none !important;\
        }\
        \
        /* Override RECOMMENDED → DEFAULT badge */\
        .v023-delivery-card--recommended::after {\
            content: "\\2605 DEFAULT" !important;\
        }\
        \
        /* Default-selected delivery card (pre-selected state) */\
        .v028-default-selected {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.08)) !important;\
        }\
        \
        /* Hover highlight for non-default cards */\
        .v028-hover-highlight {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12)) !important;\
        }\
        \
        /* File info bar on Done screen */\
        .v028-file-info {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: 0.5rem 0.75rem;\
            margin-bottom: var(--space-4, 1rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            font-size: var(--text-sm, 0.875rem);\
        }\
        .v028-file-info__icon {\
            font-size: 1.1rem;\
        }\
        .v028-file-info__name {\
            color: var(--color-text, #E0E0E0);\
            font-weight: var(--weight-medium, 500);\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-file-info__size {\
            color: var(--color-text-secondary, #8892A0);\
            white-space: nowrap;\
        }\
        \
        /* QR + Open link row — side by side, equal height */\
        .v028-qr-open-row {\
            display: flex;\
            align-items: stretch;\
            justify-content: center;\
            gap: var(--space-5, 1.25rem);\
            margin-top: var(--space-5, 1.25rem);\
            padding: var(--space-5, 1.25rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
        }\
        .v028-qr-section {\
            display: flex;\
            flex-direction: column;\
            align-items: center;\
            justify-content: center;\
            flex: 1;\
        }\
        .v028-qr-code {\
            width: 120px;\
            height: 120px;\
            padding: 6px;\
            background: #ffffff;\
            border-radius: var(--radius-sm, 6px);\
        }\
        .v028-qr-code svg {\
            width: 100%;\
            height: 100%;\
        }\
        .v028-qr-label {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-top: var(--space-2, 0.5rem);\
            opacity: 0.7;\
        }\
        .v028-open-link {\
            display: flex;\
            flex-direction: column;\
            align-items: center;\
            justify-content: center;\
            text-decoration: none;\
            flex: 1;\
            padding: var(--space-4, 1rem) var(--space-5, 1.25rem);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.2));\
            border-radius: var(--radius-sm, 6px);\
            background: rgba(78, 205, 196, 0.04);\
            transition: border-color 0.2s, background 0.2s, transform 0.15s;\
            cursor: pointer;\
        }\
        .v028-open-link:hover {\
            border-color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.1);\
            transform: translateY(-1px);\
        }\
        .v028-open-link__icon {\
            font-size: 2rem;\
            color: var(--color-primary, #4ECDC4);\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v028-open-link__text {\
            font-size: var(--text-base, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v028-open-link__hint {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-top: var(--space-2, 0.5rem);\
            opacity: 0.7;\
        }\
        \
        /* Two-column processing layout: messages left, stats right */\
        .v028-process-columns {\
            display: flex;\
            gap: var(--space-5, 1.25rem);\
            margin-top: var(--space-4, 1rem);\
            min-height: 120px;\
            align-items: stretch;\
        }\
        .v028-process-col {\
            flex: 1;\
            min-width: 0;\
            display: flex;\
            align-self: stretch;\
        }\
        .v028-process-col--messages {\
            align-items: stretch;\
            justify-content: center;\
            padding: 0;\
            background: none;\
            border: none;\
            border-radius: 0;\
        }\
        .v028-process-col--messages .v027-carousel {\
            width: 100%;\
            height: 100%;\
            margin-top: 0;\
            min-height: auto;\
            display: flex;\
            align-items: stretch;\
        }\
        .v028-process-col--messages .v027-carousel__message {\
            flex: 1;\
            display: flex;\
            align-items: center;\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.1));\
            border-radius: var(--radius-sm, 6px);\
        }\
        .v028-process-col--stats {\
            align-items: center;\
            justify-content: flex-end;\
            padding: var(--space-3, 0.75rem);\
        }\
        \
        /* Live timing rows during processing */\
        .v028-live-timing {\
            display: flex;\
            flex-direction: column;\
            gap: var(--space-1, 0.25rem);\
            width: 100%;\
        }\
        .v028-live-timing__row {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
        }\
        .v028-live-timing__label {\
            min-width: 110px;\
        }\
        .v028-live-timing__check {\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v028-live-timing__ms {\
            margin-left: auto;\
            font-family: var(--font-mono, monospace);\
        }\
        \
        /* Copy buttons — outlined, compact */\
        .v028-copy-btn {\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.3)) !important;\
            background: transparent !important;\
            color: var(--color-text, #E0E0E0) !important;\
            padding: 0.4rem 1rem !important;\
            font-size: var(--text-sm, 0.875rem) !important;\
            font-weight: var(--weight-medium, 500) !important;\
            border-radius: var(--radius-sm, 6px) !important;\
            cursor: pointer;\
            transition: border-color 0.2s, background 0.2s, color 0.2s;\
            white-space: nowrap;\
            min-width: 60px;\
        }\
        .v028-copy-btn:hover {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            color: var(--color-primary, #4ECDC4) !important;\
            background: rgba(78, 205, 196, 0.08) !important;\
        }\
        \
        /* Send another — larger ghost button, not primary color */\
        #send-another-btn {\
            font-size: var(--text-base, 1rem) !important;\
            padding: 0.625rem 2rem !important;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.25)) !important;\
            border-radius: var(--radius-sm, 6px) !important;\
            background: transparent !important;\
            color: var(--color-text-secondary, #8892A0) !important;\
            cursor: pointer;\
            transition: border-color 0.2s, color 0.2s, background 0.2s;\
            margin-top: var(--space-6, 1.5rem);\
        }\
        #send-another-btn:hover {\
            border-color: var(--color-text-secondary, #8892A0) !important;\
            color: var(--color-text, #E0E0E0) !important;\
            background: rgba(136, 146, 160, 0.08) !important;\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v028-header-row {\
                flex-direction: column;\
            }\
            .v028-header-row__action {\
                align-self: flex-end;\
            }\
            .v028-inline-next {\
                min-width: 120px;\
                padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
                font-size: var(--text-small, 0.75rem);\
            }\
            .v028-process-columns {\
                flex-direction: column;\
            }\
            .v028-qr-open-row {\
                flex-direction: column;\
                gap: var(--space-3, 0.75rem);\
            }\
        }\
    ';
    document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.10 — Gallery first, clickable test files, processing fix
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.10 — Surgical overlay on v0.2.9

   Changes:
     - Fix stepper + button position: consistent height header row so the
       progress indicator doesn't shift between steps
     - Fix encryption message (step 5): remove lighter blue box around the
       carousel message, place it directly in the dark section, vertically
       centred with the stats column
     - Gallery first: when all uploaded files are images, reorder delivery
       options so "Show as photo gallery" comes before "Let them browse"
     - Clickable test files: all test file cards work on click (fetch file
       and feed into upload flow), not just drag-and-drop
     - Multi-image test: "4 test images" card generates sample images
     - Folder simulation: "Test folder" card bundles all test files as a
       multi-file upload to test folder/browse delivery options

   Loads AFTER v0.2.9 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Store methods we override ──────────────────────────────────────────────
var _v028_advanceToDelivery = SendUpload.prototype._v023_advanceToDelivery;
var _v028_renderProcessing  = SendUpload.prototype._v023_renderProcessing;

// ─── Fix 1: Gallery first when all images ───────────────────────────────────
SendUpload.prototype._v023_advanceToDelivery = function() {
    _v028_advanceToDelivery.call(this);

    var opts = this._v023_deliveryOptions;
    if (!opts || opts.length <= 1) return;

    // Check if all files are images
    var scan = this._folderScan;
    var allImages = false;
    if (scan && scan.entries) {
        var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
        var files = scan.entries.filter(function(e) { return !e.isDir; });
        allImages = files.length > 0 && files.every(function(e) {
            var ext = (e.name || '').split('.').pop().toLowerCase();
            return IMAGE_EXTS.indexOf(ext) !== -1;
        });
    }

    if (allImages) {
        var gallery = [], browse = [], rest = [];
        opts.forEach(function(o) {
            if (o.id === 'gallery')       gallery.push(o);
            else if (o.id === 'browse')   browse.push(o);
            else if (o.id === 'download') rest.push(o);
            else                          browse.push(o);
        });
        this._v023_deliveryOptions = gallery.concat(browse).concat(rest);
        this._v023_recommendedDelivery = 'gallery';
        this.render();
        this.setupEventListeners();
    }
};

// ─── Fix 2: Encryption message — remove lighter blue box, vertically centre ─
SendUpload.prototype._v023_renderProcessing = function() {
    var stage = SendUpload.PROGRESS_STAGES[this.state];
    var pct   = stage ? stage.pct : 5;
    var label = stage ? this.t(stage.label) : 'Processing...';

    var allStages = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing'];
    var ts = this._stageTimestamps || {};
    var completedRows = '';
    var currentIndex = allStages.indexOf(this.state);

    for (var i = 0; i < allStages.length; i++) {
        var s = allStages[i];
        var next = allStages[i + 1] || this.state;
        if (ts[s] && ts[next] && i < currentIndex) {
            var ms = ts[next] - ts[s];
            var stageInfo = SendUpload.PROGRESS_STAGES[s];
            var stageLabel = stageInfo ? this.t(stageInfo.label) : s;
            stageLabel = stageLabel.replace('...', '');
            completedRows +=
                '<div class="v028-live-timing__row">' +
                    '<span class="v028-live-timing__label">' + this.escapeHtml(stageLabel) + '</span>' +
                    '<span class="v028-live-timing__check">&#10003;</span>' +
                    '<span class="v028-live-timing__ms">' + ms + 'ms</span>' +
                '</div>';
        }
    }

    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }
    var CAROUSEL = SendUpload.CAROUSEL_MESSAGES || [];
    var msg = CAROUSEL.length > 0 ? CAROUSEL[this._v027_carouselIndex % CAROUSEL.length] : null;
    var carouselHtml = msg
        ? '<div class="v028-process-col v0210-process-col--messages">' +
              '<div class="v027-carousel" id="v027-carousel">' +
                  '<div class="v027-carousel__message v027-carousel__message--visible">' +
                      '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                      '<span class="v027-carousel__text">' + this.escapeHtml(msg.text) + '</span>' +
                  '</div>' +
              '</div>' +
          '</div>'
        : '<div class="v028-process-col v0210-process-col--messages">' +
              '<div class="v023-processing__hint">Your file is being encrypted in your browser. Keep this tab open.</div>' +
          '</div>';

    var statsHtml = completedRows
        ? '<div class="v028-process-col v028-process-col--stats">' +
              '<div class="v028-live-timing">' + completedRows + '</div>' +
          '</div>'
        : '';

    return '<div class="v023-processing">' +
        '<div class="v023-processing__label">' + this.escapeHtml(label) + '</div>' +
        '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" style="width: ' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v028-process-columns">' +
            carouselHtml +
            statsHtml +
        '</div>' +
    '</div>';
};

// ─── Fix 3: Clickable test files + multi-image + folder simulation ──────────
if (typeof SendTestFiles !== 'undefined') {
    var _origRender = SendTestFiles.prototype.render;

    // Helper: feed a single file into the upload component
    function feedSingleFile(file) {
        var upload = document.querySelector('send-upload');
        if (!upload) return;
        upload._v025_multiFile = false;
        upload._folderScan = null;
        upload._folderName = null;
        upload.selectedFile = file;
        upload._v023_advanceToDelivery();
    }

    // Helper: feed multiple files into the upload component as a bundle
    function feedMultiFiles(files, folderName) {
        var upload = document.querySelector('send-upload');
        if (!upload) return;
        upload._v025_multiFile = true;
        upload._folderName = folderName || (files.length + ' files');
        upload._folderScan = {
            entries: files.map(function(f) {
                return { path: f.name, file: f, isDir: false, name: f.name };
            }),
            fileCount: files.length,
            folderCount: 0,
            totalSize: files.reduce(function(sum, f) { return sum + f.size; }, 0)
        };
        upload._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        upload._v023_advanceToDelivery();
    }

    // Helper: generate sample images
    function generateTestImages() {
        var colours = [
            { name: 'sunset.png',   r: 255, g: 107, b:  74 },
            { name: 'ocean.png',    r:  78, g: 205, b: 196 },
            { name: 'meadow.png',   r: 107, g: 203, b:  80 },
            { name: 'lavender.png', r: 155, g:  89, b: 182 }
        ];

        return colours.map(function(c) {
            var canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 300;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
            ctx.fillRect(0, 0, 400, 300);
            var grad = ctx.createLinearGradient(0, 0, 400, 300);
            grad.addColorStop(0, 'rgba(255,255,255,0.3)');
            grad.addColorStop(0.5, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.3)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 24px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(c.name.replace('.png', ''), 200, 160);
            var dataUrl = canvas.toDataURL('image/png');
            var byteString = atob(dataUrl.split(',')[1]);
            var ab = new ArrayBuffer(byteString.length);
            var ia = new Uint8Array(ab);
            for (var i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new File([ab], c.name, { type: 'image/png' });
        });
    }

    SendTestFiles.prototype.render = function() {
        _origRender.call(this);

        var grid = this.querySelector('.test-files__grid');
        if (!grid) return;

        // ── Make existing file cards clickable (fetch + feed into upload) ──
        var basePath = this._basePath();
        grid.querySelectorAll('.test-file[data-file-url]').forEach(function(card) {
            card.addEventListener('click', function(e) {
                e.preventDefault();
                var url  = card.getAttribute('data-file-url');
                var name = card.getAttribute('data-file-name');
                var mime = card.getAttribute('data-file-mime');
                card.style.opacity = '0.5';
                fetch(url).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                    card.style.opacity = '';
                    feedSingleFile(new File([buf], name, { type: mime }));
                }).catch(function() { card.style.opacity = ''; });
            });
        });

        // ── "4 test images" card ──
        var imagesCard = document.createElement('a');
        imagesCard.className = 'test-file v0210-test-special';
        imagesCard.href = '#';
        imagesCard.draggable = false;
        imagesCard.innerHTML =
            '<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#9B59B6" stroke-width=".75"/>' +
                '<path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#9B59B6" stroke-width=".75"/>' +
                '<rect x="3" y="10" width="10" height="7" rx="1" fill="none" stroke="#9B59B6" stroke-width=".75"/>' +
                '<circle cx="5.5" cy="12.5" r="1" fill="#4ECDC4"/>' +
                '<path d="M3 16l3-3 2 1.5 2.5-2.5L13 15" stroke="#4ECDC4" stroke-width=".75" fill="none"/>' +
            '</svg>' +
            '<span class="test-file__name">4 test images</span>' +
            '<span class="test-file__size">click to load</span>';
        grid.appendChild(imagesCard);
        imagesCard.addEventListener('click', function(e) {
            e.preventDefault();
            feedMultiFiles(generateTestImages(), '4 files');
        });

        // ── "Test folder" card — bundles all test files as a folder ──
        var folderCard = document.createElement('a');
        folderCard.className = 'test-file v0210-test-special';
        folderCard.href = '#';
        folderCard.draggable = false;
        folderCard.innerHTML =
            '<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M0 4C0 2.9.9 2 2 2h4l2 2h6c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V4z" fill="#16213E" stroke="#E07C4F" stroke-width=".75"/>' +
                '<line x1="4" y1="10" x2="12" y2="10" stroke="#E07C4F" stroke-width=".5"/>' +
                '<line x1="4" y1="13" x2="10" y2="13" stroke="#E07C4F" stroke-width=".5"/>' +
            '</svg>' +
            '<span class="test-file__name">Test folder</span>' +
            '<span class="test-file__size">all 5 files</span>';
        grid.appendChild(folderCard);

        var self = this;
        folderCard.addEventListener('click', function(e) {
            e.preventDefault();
            folderCard.style.opacity = '0.5';

            // Fetch all test files and bundle them
            var files = SendTestFiles.FILES;
            var promises = files.map(function(f) {
                var url = basePath + '/' + f.name;
                return fetch(url).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                    return new File([buf], f.name, { type: f.mime });
                });
            });
            Promise.all(promises).then(function(fetched) {
                folderCard.style.opacity = '';
                feedMultiFiles(fetched, 'test-files');
            }).catch(function() { folderCard.style.opacity = ''; });
        });
    };
}

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0210-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0210-styles';
    style.textContent = '\
        /* Fix 1: Stable header row height — prevent stepper shifting */\
        .v028-header-row {\
            min-height: 72px;\
            align-items: center;\
        }\
        \
        /* Fix 2: Remove lighter blue box from processing messages column */\
        .v0210-process-col--messages {\
            background: transparent !important;\
            border: none !important;\
            padding: var(--space-3, 0.75rem) !important;\
            display: flex !important;\
            align-items: center !important;\
            justify-content: center !important;\
        }\
        .v0210-process-col--messages .v027-carousel {\
            width: 100%;\
        }\
        .v0210-process-col--messages .v027-carousel__message {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
        }\
        .v028-process-columns {\
            align-items: center !important;\
        }\
        \
        /* Special test cards (images + folder) */\
        .v0210-test-special {\
            border-style: dashed !important;\
            cursor: pointer !important;\
        }\
        .v0210-test-special:hover {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: rgba(78, 205, 196, 0.08) !important;\
        }\
    ';
    document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.11 — Upload gallery preview in Step 2
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.12 — Rich preview Phase 1: image thumbnails
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.12 — Surgical overlay on v0.2.11

   Changes:
     - Phase 1: Rich Preview — sender-side thumbnail generation for images
     - During zip creation, generates _gallery/ folder with:
       - _gallery/_manifest.json  — gallery config, file index, metadata
       - _gallery/thumbnails/     — 200px-wide JPEG thumbnails per image
       - _gallery/metadata/       — per-file metadata JSON (type, size, dimensions)
     - Uses Canvas API (zero dependencies) to resize images client-side
     - All processing happens in the browser — server never sees plaintext
     - Receiver gets instant preview without re-processing full images

   Loads AFTER v0.2.11 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Constants ──────────────────────────────────────────────────────────────
var THUMB_MAX_WIDTH  = 400;
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

// ─── Core: build _gallery/ folder contents and add to zip ───────────────────
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
            metadata:  '_gallery/metadata/' + id + '.meta.json'
        };

        // For images: generate thumbnail + extract dimensions
        if (category === 'image') {
            return generateImageThumbnail(entry.file).then(function(result) {
                // Add thumbnail to zip
                var thumbExt = ext === 'svg' ? 'svg' : 'jpg';
                var thumbPath = '_gallery/thumbnails/' + id + '.thumb.' + thumbExt;
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
                zip.file('_gallery/metadata/' + id + '.meta.json',
                    JSON.stringify(meta, null, 2));

                return manifestEntry;
            }).catch(function(err) {
                // Thumbnail generation failed — still include metadata without thumbnail
                console.warn('[v0212] Thumbnail failed for ' + entry.name + ':', err.message);
                zip.file('_gallery/metadata/' + id + '.meta.json',
                    JSON.stringify(meta, null, 2));
                return manifestEntry;
            });
        }

        // For non-images: just metadata (Phase 2+ will add PDF/MD thumbnails)
        zip.file('_gallery/metadata/' + id + '.meta.json',
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
        zip.file('_gallery/_manifest.json', JSON.stringify(manifest, null, 2));

        console.log('[v0212] Preview generated: ' +
            manifest.thumbnails_generated + ' thumbnails for ' +
            manifest.total_files + ' files');
    });
}

// ─── Override: _v023_compressFolder — inject preview generation ──────────────
// NOTE: v0.2.3 replaced _startFolderZip with a no-op and uses
// _v023_compressFolder as the actual zip path (called from _v023_startProcessing).
// We must override _v023_compressFolder to inject preview generation.
var _orig_v023_compressFolder = SendUpload.prototype._v023_compressFolder;

SendUpload.prototype._v023_compressFolder = async function() {
    await this._loadJSZip();

    var zip     = new JSZip();
    var entries = this._folderScan.entries.filter(function(e) { return !e.isDir; });
    var opts    = this._folderOptions || {};

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!opts.includeHidden && entry.name.startsWith('.')) continue;
        if (entry.file) {
            zip.file(entry.path, entry.file, {
                compression: (opts.level || 4) > 0 ? 'DEFLATE' : 'STORE',
                compressionOptions: { level: opts.level || 4 }
            });
        }
    }

    // ═══ v0.2.12: Generate _gallery/ folder — only for gallery delivery ═══
    var delivery = this._v023_selectedDelivery || 'download';
    if (delivery === 'gallery') {
        await addPreviewToZip(zip, entries);
    }

    var blob    = await zip.generateAsync({ type: 'blob' });
    var zipName = (this._folderName || 'folder') + '.zip';
    this.selectedFile = new File([blob], zipName, { type: 'application/zip' });
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
    // Otherwise call v0.2.11's Step 2 but suppress its inline preview grid
    // Use a flag instead of nulling _folderScan (which breaks the file summary)
    this._v0212_suppressPreview = true;
    var html = _v0211_renderStep2.call(this);
    this._v0212_suppressPreview = false;
    return html;
};

// ─── Render the gallery preview page ────────────────────────────────────────
SendUpload.prototype._v0212_renderGalleryPreview = function() {
    var entries = this._v0212_savedScan ? this._v0212_savedScan.entries : [];
    var files = entries.filter(function(e) {
        if (e.isDir || !e.file) return false;
        // Filter out dot-files (.DS_Store, .gitkeep, etc.)
        var name = e.name || '';
        if (name.charAt(0) === '.') return false;
        return true;
    });

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
            '<span>This is what gallery mode will look like for the recipient</span>' +
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
    var files = entries.filter(function(e) {
        if (e.isDir || !e.file) return false;
        var name = e.name || '';
        if (name.charAt(0) === '.') return false;
        return true;
    });
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

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.13 — Phase 2: PDF, markdown, video thumbnails
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.13 — Surgical overlay on v0.2.12

   Changes:
     - Phase 2: PDF thumbnails via pdf.js (first page rendered to canvas)
     - Phase 2: Markdown thumbnails via MarkdownParser + SVG foreignObject → canvas
     - "Generating thumbnails" progress indicator during zip creation
     - Content-hashed _preview folder: _preview.{hash} with enriched manifest
     - Video frame capture thumbnails (first frame)
     - Audio metadata extraction (duration)
     - SVG pass-through (already handled in v0.2.12, confirmed)
     - Tick alignment fix for upload progress rows

   Loads AFTER v0.2.12 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Constants ──────────────────────────────────────────────────────────────
var THUMB_MAX_WIDTH  = 400;
var THUMB_HEIGHT     = 520;   // Max height for non-image thumbnails (MD, PDF)
var THUMB_QUALITY    = 0.75;
var THUMB_FORMAT     = 'image/jpeg';

var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
var PDF_EXTS   = ['pdf'];
var MD_EXTS    = ['md', 'markdown'];
var VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
var AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];

function getExt(name) { return (name || '').split('.').pop().toLowerCase(); }

function getFileCategory(name) {
    var ext = getExt(name);
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (PDF_EXTS.indexOf(ext)   !== -1) return 'pdf';
    if (MD_EXTS.indexOf(ext)    !== -1) return 'markdown';
    if (VIDEO_EXTS.indexOf(ext) !== -1) return 'video';
    if (AUDIO_EXTS.indexOf(ext) !== -1) return 'audio';
    return 'other';
}

function fileId(index) {
    var num = String(index + 1);
    while (num.length < 3) num = '0' + num;
    return 'file-' + num;
}

// ─── PDF.js lazy loader ─────────────────────────────────────────────────────
// Uses non-module CDN (pdf.min.js, not .mjs) to reliably set window.pdfjsLib.
// ES module versions don't expose globals on window and fail silently.
var _pdfJsLoaded = false;
var _pdfJsLoading = null;

// CDN URLs — non-module versions that set window.pdfjsLib
var PDF_JS_CDNS = [
    { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
    { js: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
];

function loadPdfJs() {
    if (_pdfJsLoaded && window.pdfjsLib) return Promise.resolve();
    if (_pdfJsLoading) return _pdfJsLoading;

    _pdfJsLoading = new Promise(function(resolve, reject) {
        // Check if already available
        if (window.pdfjsLib) {
            _pdfJsLoaded = true;
            resolve();
            return;
        }

        function tryLoad(urls, idx) {
            if (idx >= urls.length) {
                reject(new Error('Failed to load pdf.js from all sources'));
                return;
            }
            var entry = urls[idx];
            var script = document.createElement('script');
            script.src = entry.js;
            script.onload = function() {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = entry.worker;
                    _pdfJsLoaded = true;
                    console.log('[v0213] pdf.js loaded from: ' + entry.js);
                    resolve();
                } else {
                    console.warn('[v0213] pdf.js loaded but pdfjsLib not on window, trying next...');
                    tryLoad(urls, idx + 1);
                }
            };
            script.onerror = function() {
                console.warn('[v0213] Failed to load pdf.js from: ' + entry.js);
                tryLoad(urls, idx + 1);
            };
            document.head.appendChild(script);
        }

        // CDN fallback list
        var urls = PDF_JS_CDNS;

        tryLoad(urls, 0);
    });

    return _pdfJsLoading;
}

// ─── PDF thumbnail: render page 1 to canvas → JPEG ─────────────────────────
function generatePdfThumbnail(file) {
    return loadPdfJs().then(function() {
        return file.arrayBuffer();
    }).then(function(buf) {
        var loadingTask = window.pdfjsLib.getDocument({ data: buf });
        return loadingTask.promise;
    }).then(function(pdfDoc) {
        var pageCount = pdfDoc.numPages;
        return pdfDoc.getPage(1).then(function(page) {
            // Scale to fit THUMB_MAX_WIDTH
            var viewport = page.getViewport({ scale: 1.0 });
            var scale = THUMB_MAX_WIDTH / viewport.width;
            var scaledViewport = page.getViewport({ scale: scale });

            var canvas = document.createElement('canvas');
            canvas.width  = Math.round(scaledViewport.width);
            canvas.height = Math.round(scaledViewport.height);
            var ctx = canvas.getContext('2d');

            // White background (PDFs can have transparent areas)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            return page.render({ canvasContext: ctx, viewport: scaledViewport }).promise.then(function() {
                return new Promise(function(resolve, reject) {
                    canvas.toBlob(function(blob) {
                        if (!blob) {
                            reject(new Error('PDF canvas toBlob failed'));
                            return;
                        }
                        blob.arrayBuffer().then(function(thumbBuf) {
                            resolve({
                                buffer:     thumbBuf,
                                width:      canvas.width,
                                height:     canvas.height,
                                format:     THUMB_FORMAT,
                                pageCount:  pageCount
                            });
                        }).catch(reject);
                    }, THUMB_FORMAT, THUMB_QUALITY);
                });
            });
        });
    });
}

// ─── Markdown thumbnail: render text directly to canvas → JPEG ──────────────
// Uses direct canvas text drawing — reliable across all browsers
// (SVG foreignObject approach is fragile due to security/tainted canvas)
function generateMarkdownThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
            var text = reader.result || '';

            var canvas = document.createElement('canvas');
            canvas.width  = THUMB_MAX_WIDTH;
            canvas.height = THUMB_HEIGHT;
            var ctx = canvas.getContext('2d');

            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Parse markdown into lines with basic formatting
            var lines = text.split('\n');
            var y = 14;
            var padding = 12;
            var maxWidth = THUMB_MAX_WIDTH - (padding * 2);
            var lineHeight;
            var maxY = THUMB_HEIGHT - 10;

            for (var i = 0; i < lines.length && y < maxY; i++) {
                var line = lines[i];
                var trimmed = line.trim();

                if (!trimmed) {
                    y += 6; // Empty line spacing
                    continue;
                }

                // Heading detection
                if (trimmed.match(/^#{1,2}\s/)) {
                    var headingText = trimmed.replace(/^#+\s*/, '');
                    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#111111';
                    lineHeight = 13;

                    // Draw heading underline for H1
                    if (trimmed.match(/^#\s/)) {
                        var wrappedH = wrapText(ctx, headingText, maxWidth);
                        for (var wh = 0; wh < wrappedH.length && y < maxY; wh++) {
                            ctx.fillText(wrappedH[wh], padding, y);
                            y += lineHeight;
                        }
                        ctx.strokeStyle = '#e0e0e0';
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(padding, y - 2);
                        ctx.lineTo(THUMB_MAX_WIDTH - padding, y - 2);
                        ctx.stroke();
                        y += 4;
                    } else {
                        var wrappedH2 = wrapText(ctx, headingText, maxWidth);
                        for (var wh2 = 0; wh2 < wrappedH2.length && y < maxY; wh2++) {
                            ctx.fillText(wrappedH2[wh2], padding, y);
                            y += lineHeight;
                        }
                        y += 3;
                    }
                }
                else if (trimmed.match(/^#{3,6}\s/)) {
                    var h3Text = trimmed.replace(/^#+\s*/, '');
                    ctx.font = 'bold 8px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#222222';
                    lineHeight = 11;
                    var wrappedH3 = wrapText(ctx, h3Text, maxWidth);
                    for (var wh3 = 0; wh3 < wrappedH3.length && y < maxY; wh3++) {
                        ctx.fillText(wrappedH3[wh3], padding, y);
                        y += lineHeight;
                    }
                    y += 2;
                }
                // Code block
                else if (trimmed.match(/^```/)) {
                    ctx.fillStyle = '#f5f5f5';
                    var codeY = y - 8;
                    var codeLines = 0;
                    i++;
                    var codeStart = y;
                    ctx.font = '7px monospace';
                    while (i < lines.length && !lines[i].trim().match(/^```/) && y < maxY) {
                        codeLines++;
                        y += 9;
                        i++;
                    }
                    // Draw code block background
                    if (codeLines > 0) {
                        ctx.fillStyle = '#f5f5f5';
                        ctx.fillRect(padding - 2, codeY, maxWidth + 4, y - codeY + 2);
                        // Re-draw code text
                        ctx.fillStyle = '#333333';
                        var cy = codeStart;
                        for (var ci = 0; ci < codeLines && ci < 8; ci++) {
                            var codeLine = lines[i - codeLines + ci] || '';
                            ctx.fillText(codeLine.substring(0, 40), padding + 2, cy);
                            cy += 9;
                        }
                    }
                    y += 3;
                }
                // Blockquote
                else if (trimmed.match(/^>/)) {
                    var quoteText = trimmed.replace(/^>\s*/, '');
                    ctx.font = 'italic 7px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#555555';
                    lineHeight = 10;
                    // Draw quote bar
                    ctx.fillStyle = '#dddddd';
                    ctx.fillRect(padding, y - 8, 2, 12);
                    ctx.fillStyle = '#555555';
                    var wrappedQ = wrapText(ctx, quoteText, maxWidth - 10);
                    for (var wq = 0; wq < wrappedQ.length && y < maxY; wq++) {
                        ctx.fillText(wrappedQ[wq], padding + 8, y);
                        y += lineHeight;
                    }
                    y += 2;
                }
                // Horizontal rule
                else if (trimmed.match(/^[-*_]{3,}$/)) {
                    ctx.strokeStyle = '#e0e0e0';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(padding, y);
                    ctx.lineTo(THUMB_MAX_WIDTH - padding, y);
                    ctx.stroke();
                    y += 6;
                }
                // List items
                else if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) {
                    var listText = trimmed.replace(/^[-*+]\s*/, '').replace(/^\d+\.\s*/, '');
                    ctx.font = '7px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#1a1a2e';
                    lineHeight = 10;
                    ctx.fillText('\u2022', padding, y);
                    var wrappedL = wrapText(ctx, listText, maxWidth - 10);
                    for (var wl = 0; wl < wrappedL.length && y < maxY; wl++) {
                        ctx.fillText(wrappedL[wl], padding + 10, y);
                        y += lineHeight;
                    }
                }
                // Regular text
                else {
                    // Strip inline markdown formatting
                    var cleanText = trimmed
                        .replace(/\*\*([^*]+)\*\*/g, '$1')
                        .replace(/__([^_]+)__/g, '$1')
                        .replace(/\*([^*]+)\*/g, '$1')
                        .replace(/_([^_]+)_/g, '$1')
                        .replace(/`([^`]+)`/g, '$1')
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

                    ctx.font = '7px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#1a1a2e';
                    lineHeight = 10;
                    var wrapped = wrapText(ctx, cleanText, maxWidth);
                    for (var w = 0; w < wrapped.length && y < maxY; w++) {
                        ctx.fillText(wrapped[w], padding, y);
                        y += lineHeight;
                    }
                    y += 2;
                }
            }

            // Fade-out at bottom if content was truncated
            if (y >= maxY) {
                var gradient = ctx.createLinearGradient(0, THUMB_HEIGHT - 30, 0, THUMB_HEIGHT);
                gradient.addColorStop(0, 'rgba(255,255,255,0)');
                gradient.addColorStop(1, 'rgba(255,255,255,1)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, THUMB_HEIGHT - 30, THUMB_MAX_WIDTH, 30);
            }

            canvas.toBlob(function(blob) {
                if (!blob) {
                    reject(new Error('Markdown canvas toBlob failed'));
                    return;
                }
                blob.arrayBuffer().then(function(thumbBuf) {
                    resolve({
                        buffer:   thumbBuf,
                        width:    THUMB_MAX_WIDTH,
                        height:   THUMB_HEIGHT,
                        format:   THUMB_FORMAT,
                        textLen:  text.length
                    });
                }).catch(reject);
            }, THUMB_FORMAT, THUMB_QUALITY);
        };
        reader.onerror = function() { reject(new Error('Failed to read markdown file')); };
        reader.readAsText(file);
    });
}

// ─── Helper: wrap text to fit within maxWidth ───────────────────────────────
function wrapText(ctx, text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var currentLine = '';

    for (var i = 0; i < words.length; i++) {
        var testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
}

// ─── Video thumbnail: capture first frame → JPEG ────────────────────────────
function generateVideoThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;

        // Timeout: if video doesn't load in 10s, skip
        var timeout = setTimeout(function() {
            URL.revokeObjectURL(url);
            reject(new Error('Video thumbnail timeout'));
        }, 10000);

        video.onloadeddata = function() {
            // Seek to 1 second (or 0 if shorter)
            video.currentTime = Math.min(1, video.duration / 4);
        };

        video.onseeked = function() {
            clearTimeout(timeout);
            var origW = video.videoWidth;
            var origH = video.videoHeight;
            var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
            var thumbW = Math.round(origW * scale);
            var thumbH = Math.round(origH * scale);

            var canvas = document.createElement('canvas');
            canvas.width  = thumbW;
            canvas.height = thumbH;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, thumbW, thumbH);

            URL.revokeObjectURL(url);

            canvas.toBlob(function(blob) {
                if (!blob) {
                    reject(new Error('Video canvas toBlob failed'));
                    return;
                }
                blob.arrayBuffer().then(function(buf) {
                    resolve({
                        buffer:    buf,
                        width:     thumbW,
                        height:    thumbH,
                        format:    THUMB_FORMAT,
                        duration:  video.duration,
                        videoW:    origW,
                        videoH:    origH
                    });
                }).catch(reject);
            }, THUMB_FORMAT, THUMB_QUALITY);
        };

        video.onerror = function() {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video: ' + file.name));
        };

        video.src = url;
    });
}

// ─── Audio metadata extraction ──────────────────────────────────────────────
function extractAudioMetadata(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file);
        var audio = document.createElement('audio');
        audio.preload = 'metadata';

        var timeout = setTimeout(function() {
            URL.revokeObjectURL(url);
            reject(new Error('Audio metadata timeout'));
        }, 5000);

        audio.onloadedmetadata = function() {
            clearTimeout(timeout);
            var duration = audio.duration;
            URL.revokeObjectURL(url);
            resolve({
                duration: duration,
                durationFormatted: formatDuration(duration)
            });
        };

        audio.onerror = function() {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load audio: ' + file.name));
        };

        audio.src = url;
    });
}

function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

// ─── Content hash: SHA-256 of file contents → 8-char hex ────────────────────
function computeFileHash(file) {
    return file.arrayBuffer().then(function(buf) {
        return crypto.subtle.digest('SHA-256', buf);
    }).then(function(hashBuf) {
        var arr = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
            hex += ('0' + arr[i].toString(16)).slice(-2);
        }
        return hex;
    });
}

function computeFolderHash(fileHashes) {
    // Hash of all hashes concatenated → deterministic folder hash
    var combined = fileHashes.join('');
    var encoder = new TextEncoder();
    var data = encoder.encode(combined);
    return crypto.subtle.digest('SHA-256', data).then(function(hashBuf) {
        var arr = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < 8; i++) {
            hex += ('0' + arr[i].toString(16)).slice(-2);
        }
        return hex; // 16-char hex (8 bytes)
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Override: _v023_compressFolder — replace v0.2.12's preview with enhanced version
//
// NOTE: v0.2.3 replaced _startFolderZip with a no-op and uses
// _v023_compressFolder as the actual zip path (called from _v023_startProcessing).
// We must override _v023_compressFolder (not _startFolderZip) to inject
// PDF/MD/video thumbnail generation.
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_compressFolder = SendUpload.prototype._v023_compressFolder;

SendUpload.prototype._v023_compressFolder = async function() {
    await this._loadJSZip();

    var zip     = new JSZip();
    var entries = this._folderScan.entries.filter(function(e) { return !e.isDir; });
    var opts    = this._folderOptions || {};

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!opts.includeHidden && entry.name.startsWith('.')) continue;
        if (entry.file) {
            zip.file(entry.path, entry.file, {
                compression: (opts.level || 4) > 0 ? 'DEFLATE' : 'STORE',
                compressionOptions: { level: opts.level || 4 }
            });
        }
    }

    // ═══ v0.2.13: Generate _gallery.{hash}/ folder — only for gallery delivery ═══
    var delivery = this._v023_selectedDelivery || 'download';
    if (delivery === 'gallery') {
        await this._v0213_addPreviewToZip(zip, entries);
    }

    var blob    = await zip.generateAsync({ type: 'blob' });
    var zipName = (this._folderName || 'folder') + '.zip';
    this.selectedFile = new File([blob], zipName, { type: 'application/zip' });
};

// ─── Core: generate _preview.{hash}/ folder ─────────────────────────────────
SendUpload.prototype._v0213_addPreviewToZip = async function(zip, entries) {
    var files = entries.filter(function(e) { return !e.isDir && e.file; });
    if (files.length === 0) return;

    var self = this;

    // Show thumbnail progress
    this._v0213_updateProgress('Computing file hashes...', 0, files.length);

    // Step 1: Compute file hashes for content-addressed folder name
    var fileHashes = [];
    for (var h = 0; h < files.length; h++) {
        try {
            var hash = await computeFileHash(files[h].file);
            fileHashes.push(hash);
        } catch (e) {
            fileHashes.push('0000000000000000');
        }
    }
    var folderHash = await computeFolderHash(fileHashes);
    var previewDir = '_gallery.' + folderHash;  // Content-hashed folder name

    // Step 2: Check if PDF.js is needed and preload it
    var hasPdfs = files.some(function(e) { return getFileCategory(e.name) === 'pdf'; });
    if (hasPdfs) {
        this._v0213_updateProgress('Loading PDF renderer...', 0, files.length);
        try {
            await loadPdfJs();
        } catch (e) {
            console.warn('[v0213] pdf.js not available — PDF thumbnails will be skipped:', e.message);
            hasPdfs = false;
        }
    }

    // Step 3: Generate thumbnails + metadata for each file
    var manifest = {
        version:             '0.2',
        preview_enabled:     true,
        generated_at:        new Date().toISOString(),
        folder_hash:         folderHash,
        thumbnail_max_width: THUMB_MAX_WIDTH,
        thumbnail_format:    THUMB_FORMAT,
        thumbnail_quality:   THUMB_QUALITY,
        total_files:         files.length,
        file_hashes:         {},
        files:               []
    };

    var thumbnailsGenerated = 0;
    var startTime = performance.now();

    for (var i = 0; i < files.length; i++) {
        var entry    = files[i];
        var id       = fileId(i);
        var category = getFileCategory(entry.name);
        var ext      = getExt(entry.name);

        this._v0213_updateProgress('Generating thumbnails...', i, files.length);

        // Base metadata
        var meta = {
            id:        id,
            name:      entry.name,
            path:      entry.path,
            type:      category,
            extension: ext,
            size:      entry.file.size,
            mime:      entry.file.type || 'application/octet-stream',
            hash:      fileHashes[i]
        };

        // Manifest entry
        var manifestEntry = {
            id:        id,
            name:      entry.name,
            path:      entry.path,
            type:      category,
            size:      entry.file.size,
            hash:      fileHashes[i],
            thumbnail: null,
            metadata:  previewDir + '/metadata/' + id + '.meta.json'
        };

        manifest.file_hashes[id] = fileHashes[i];

        // ── Image thumbnails (from v0.2.12, enhanced) ──
        if (category === 'image') {
            try {
                var imgResult = await self._v0212_generateImageThumbnail(entry.file);
                var thumbExt = ext === 'svg' ? 'svg' : 'jpg';
                var thumbPath = previewDir + '/thumbnails/' + id + '.thumb.' + thumbExt;
                zip.file(thumbPath, imgResult.buffer);

                meta.dimensions = { width: imgResult.originalWidth, height: imgResult.originalHeight };
                meta.thumbnail  = { path: thumbPath, width: imgResult.width, height: imgResult.height, format: imgResult.format, size: imgResult.buffer.byteLength };
                manifestEntry.thumbnail = thumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] Image thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── PDF thumbnails (Phase 2 — NEW) ──
        else if (category === 'pdf' && hasPdfs) {
            try {
                var pdfResult = await generatePdfThumbnail(entry.file);
                var pdfThumbPath = previewDir + '/thumbnails/' + id + '.thumb.jpg';
                zip.file(pdfThumbPath, pdfResult.buffer);

                meta.pageCount = pdfResult.pageCount;
                meta.thumbnail = { path: pdfThumbPath, width: pdfResult.width, height: pdfResult.height, format: THUMB_FORMAT, size: pdfResult.buffer.byteLength };
                manifestEntry.thumbnail = pdfThumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] PDF thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── Markdown thumbnails (Phase 2 — NEW) ──
        else if (category === 'markdown') {
            try {
                var mdResult = await generateMarkdownThumbnail(entry.file);
                var mdThumbPath = previewDir + '/thumbnails/' + id + '.thumb.jpg';
                zip.file(mdThumbPath, mdResult.buffer);

                meta.textLength = mdResult.textLen;
                meta.thumbnail  = { path: mdThumbPath, width: mdResult.width, height: mdResult.height, format: THUMB_FORMAT, size: mdResult.buffer.byteLength };
                manifestEntry.thumbnail = mdThumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] Markdown thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── Video thumbnails (first frame) ──
        else if (category === 'video') {
            try {
                var vidResult = await generateVideoThumbnail(entry.file);
                var vidThumbPath = previewDir + '/thumbnails/' + id + '.thumb.jpg';
                zip.file(vidThumbPath, vidResult.buffer);

                meta.duration = vidResult.duration;
                meta.durationFormatted = formatDuration(vidResult.duration);
                meta.dimensions = { width: vidResult.videoW, height: vidResult.videoH };
                meta.thumbnail  = { path: vidThumbPath, width: vidResult.width, height: vidResult.height, format: THUMB_FORMAT, size: vidResult.buffer.byteLength };
                manifestEntry.thumbnail = vidThumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] Video thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── Audio metadata (duration — no visual thumbnail yet) ──
        else if (category === 'audio') {
            try {
                var audioMeta = await extractAudioMetadata(entry.file);
                meta.duration = audioMeta.duration;
                meta.durationFormatted = audioMeta.durationFormatted;
            } catch (e) {
                console.warn('[v0213] Audio metadata failed for ' + entry.name + ':', e.message);
            }
        }

        // Write metadata JSON
        zip.file(previewDir + '/metadata/' + id + '.meta.json', JSON.stringify(meta, null, 2));
        manifest.files.push(manifestEntry);
    }

    var elapsed = Math.round(performance.now() - startTime);

    // Count files by type
    var typeCounts = {};
    manifest.files.forEach(function(e) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    });
    manifest.type_counts = typeCounts;
    manifest.thumbnails_generated = thumbnailsGenerated;
    manifest.generation_time_ms   = elapsed;

    // Write manifest
    zip.file(previewDir + '/_manifest.json', JSON.stringify(manifest, null, 2));

    this._v0213_updateProgress('Thumbnails ready', files.length, files.length);

    console.log('[v0213] Preview generated in ' + elapsed + 'ms: ' +
        thumbnailsGenerated + ' thumbnails for ' + files.length + ' files → ' + previewDir);
};

// ─── Helper: access v0.2.12's image thumbnail generator ─────────────────────
// Reuse the existing generateImageThumbnail from v0.2.12's scope
// We need to expose it. If not available, re-implement inline.
if (!SendUpload.prototype._v0212_generateImageThumbnail) {
    SendUpload.prototype._v0212_generateImageThumbnail = function(file) {
        return new Promise(function(resolve, reject) {
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
                var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
                var thumbW = Math.round(origW * scale);
                var thumbH = Math.round(origH * scale);

                var canvas = document.createElement('canvas');
                canvas.width = thumbW; canvas.height = thumbH;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, thumbW, thumbH);

                canvas.toBlob(function(blob) {
                    URL.revokeObjectURL(url);
                    if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
                    blob.arrayBuffer().then(function(buf) {
                        resolve({ buffer: buf, width: thumbW, height: thumbH, originalWidth: origW, originalHeight: origH, format: THUMB_FORMAT });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };
            img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
            img.src = url;
        });
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Progress indicator for thumbnail generation
// ═══════════════════════════════════════════════════════════════════════════

SendUpload.prototype._v0213_updateProgress = function(label, current, total) {
    var el = this.querySelector('#v0213-thumb-progress');
    if (!el) {
        // Inject progress element into the zipping state UI
        var container = this.querySelector('.v023-processing') || this.querySelector('.step-content');
        if (container) {
            var div = document.createElement('div');
            div.id = 'v0213-thumb-progress';
            div.className = 'v0213-thumb-progress';
            container.appendChild(div);
        } else {
            return;
        }
        el = this.querySelector('#v0213-thumb-progress');
        if (!el) return;
    }

    var pct = total > 0 ? Math.round((current / total) * 100) : 0;
    el.innerHTML =
        '<div class="v0213-tp__label">' + label + '</div>' +
        '<div class="v0213-tp__bar">' +
            '<div class="v0213-tp__fill" style="width:' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v0213-tp__count">' + current + ' / ' + total + '</div>';
};

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0213-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0213-styles';
    style.textContent = '\
        /* ── Thumbnail generation progress ── */\
        .v0213-thumb-progress {\
            margin-top: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem);\
            background: rgba(77, 208, 225, 0.06);\
            border: 1px solid rgba(77, 208, 225, 0.12);\
            border-radius: var(--radius-md, 8px);\
        }\
        .v0213-tp__label {\
            font-size: 0.8rem;\
            color: rgba(255,255,255,0.7);\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v0213-tp__bar {\
            height: 4px;\
            background: rgba(255,255,255,0.06);\
            border-radius: 2px;\
            overflow: hidden;\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v0213-tp__fill {\
            height: 100%;\
            background: var(--color-primary, #4DD0E1);\
            border-radius: 2px;\
            transition: width 0.2s ease;\
        }\
        .v0213-tp__count {\
            font-size: 0.7rem;\
            color: rgba(255,255,255,0.4);\
            text-align: right;\
            font-family: var(--font-mono, monospace);\
        }\
        \
        /* ── Tick alignment fix for upload progress rows ── */\
        .v028-live-timing__row {\
            display: flex !important;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v028-live-timing__label {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-live-timing__check {\
            flex-shrink: 0;\
            width: 16px;\
            text-align: center;\
        }\
        .v028-live-timing__ms {\
            flex-shrink: 0;\
            min-width: 70px;\
            text-align: right;\
            margin-left: 0 !important;\
        }\
    ';
    document.head.appendChild(style);
})();

// NOTE: Gallery delivery card language ("Gallery mode") and dot-file filtering
// are now handled at the source in v0.2.3 (detectDeliveryOptions) and v0.2.12
// (_v0212_renderGalleryPreview / _v0212_loadGalleryThumbnails).

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.14 — Gallery always, click fix, hover dim, clickable steps
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.14 — Surgical overlay on v0.2.13

   Changes:
     - Remove gallery preview from Step 2 (Delivery) entirely.
       Thumbnails aren't calculated until zip creation, so showing a
       preview at this stage is misleading. The gallery card in Step 2
       now goes straight to Step 3 (share mode) like other delivery options.
     - Fix gallery card click: v0.2.12 cloned the gallery card and attached
       a preview handler. We re-clone it with a handler that just proceeds.
     - Dim default-selected card when hovering another delivery option
       (instead of fully removing styling).
     - Always show gallery option for all folder uploads (not just images).
     - Consistent card order: browse → gallery → download (never reorder).
     - Gallery is always DEFAULT (recommended) — it supports all file types.
     - Consistent "mode" naming: Folder view mode, Gallery mode, Download zip mode.
     - Gallery card shows thumbnail/metadata generation note on Step 2.
     - Fix back from Share Mode preserving delivery selection.
     - Clickable completed steps in step indicator for full back-navigation.
     - Add thumbnail generation note to confirmation step.

   Loads AFTER v0.2.13 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Override: Step 2 render never shows gallery preview ────────────────────
var _v0213_renderStep2 = SendUpload.prototype._v023_renderStep2;

SendUpload.prototype._v023_renderStep2 = function() {
    // Force-suppress gallery preview — always render normal Step 2
    this._v0212_galleryPreview = false;
    this._v0212_suppressPreview = true;
    var html = _v0213_renderStep2.call(this);
    this._v0212_suppressPreview = false;
    return html;
};

// ─── Override: advanceToDelivery — always show gallery, smart defaults ──────
var _v0210_advanceToDelivery = SendUpload.prototype._v023_advanceToDelivery;

SendUpload.prototype._v023_advanceToDelivery = function() {
    // Call existing chain (v0.2.10 → v0.2.3 base)
    _v0210_advanceToDelivery.call(this);

    var opts = this._v023_deliveryOptions;
    if (!opts) return;

    var scan = this._folderScan;
    if (!scan || !scan.entries) return;

    // ── Ensure gallery is always in the options for folders ──
    var hasGallery = opts.some(function(o) { return o.id === 'gallery'; });
    if (!hasGallery) {
        opts.push({
            id: 'gallery',
            icon: '\uD83D\uDDBC\uFE0F',
            title: 'Gallery mode',
            desc: 'Recipient browses files with preview. Thumbnails and metadata will be generated.',
            hint: 'Best for: photo sets, documents, mixed files'
        });
        this._v023_deliveryOptions = opts;
    }

    // ── Classify files ──
    var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
    var files = scan.entries.filter(function(e) { return !e.isDir; });
    var allImages = files.length > 0 && files.every(function(e) {
        var ext = (e.name || '').split('.').pop().toLowerCase();
        return IMAGE_EXTS.indexOf(ext) !== -1;
    });

    // ── Consistent order: always browse → gallery → download ──
    var browse = [], gallery = [], rest = [];
    opts.forEach(function(o) {
        if (o.id === 'browse')        browse.push(o);
        else if (o.id === 'gallery')  gallery.push(o);
        else                          rest.push(o);
    });
    this._v023_deliveryOptions = browse.concat(gallery).concat(rest);

    // Gallery is always recommended (default badge) — it supports all file types
    this._v023_recommendedDelivery = 'gallery';

    this.render();
    this.setupEventListeners();
};

// ─── Override: setupEventListeners — fix gallery card + hover + step clicks ──
var _v0213_setupListeners = SendUpload.prototype.setupEventListeners;

SendUpload.prototype.setupEventListeners = function() {
    // Always suppress the gallery preview flag BEFORE calling the chain
    this._v0212_galleryPreview = false;

    // Call the full chain (v0.2.13 → v0.2.12 → ... → v0.2.3)
    // v0.2.12 will clone-replace the gallery card and attach a preview handler.
    _v0213_setupListeners.call(this);

    var self = this;

    if (this.state === 'choosing-delivery') {
        // ── When returning from a later step, highlight previously selected card ──
        var selected = this._v023_selectedDelivery;
        var recommended = this._v023_recommendedDelivery || 'download';
        var highlightId = selected || recommended;

        // Apply v028-default-selected to the right card
        var allCards = this.querySelectorAll('.v023-delivery-card');
        allCards.forEach(function(card) {
            card.classList.remove('v028-default-selected');
            if (card.getAttribute('data-delivery') === highlightId) {
                card.classList.add('v028-default-selected');
            }
        });

        var defaultCard = this.querySelector('.v028-default-selected');

        // ── Fix ALL delivery cards: re-clone with proper handlers ──
        allCards = this.querySelectorAll('.v023-delivery-card');
        allCards.forEach(function(card) {
            var isDefault = card.classList.contains('v028-default-selected');
            var delivery = card.getAttribute('data-delivery');

            // Clone to strip ALL previous handlers (v0.2.3, v0.2.8, v0.2.12)
            var newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);

            // Click handler: select delivery and proceed to step 3
            newCard.addEventListener('click', function() {
                self._v0212_galleryPreview = false;
                self._v023_selectedDelivery = delivery;
                self.state = 'choosing-share';
                self.render();
                self.setupEventListeners();
            });

            // Hover: dim default card when hovering a non-default
            if (!isDefault && defaultCard) {
                newCard.addEventListener('mouseenter', function() {
                    defaultCard.classList.add('v0214-default-dimmed');
                    defaultCard.classList.remove('v028-default-selected');
                    newCard.classList.add('v028-hover-highlight');
                });
                newCard.addEventListener('mouseleave', function() {
                    newCard.classList.remove('v028-hover-highlight');
                    defaultCard.classList.remove('v0214-default-dimmed');
                    if (!self._v023_selectedDelivery || self._v023_selectedDelivery === highlightId) {
                        defaultCard.classList.add('v028-default-selected');
                    }
                });
            }
        });
    }

    // ── Clickable completed steps in the step indicator ──
    this._v0214_setupStepClicks();
};

// ─── Override: setupDynamicListeners — also set up step clicks on Done page ──
var _v0214_prevDynamic = SendUpload.prototype.setupDynamicListeners;

SendUpload.prototype.setupDynamicListeners = function() {
    _v0214_prevDynamic.call(this);
    // Step clicks need to work on the Done page too
    this._v0214_setupStepClicks();
};

// ─── Step click navigation — click any completed step to go back ─────────
SendUpload.prototype._v0214_setupStepClicks = function() {
    var self = this;
    var indicator = this.querySelector('send-step-indicator');
    if (!indicator || !indicator.shadowRoot) return;

    // Collect all .step elements (not .line) to get correct step numbers
    var allStepEls = indicator.shadowRoot.querySelectorAll('.step');
    allStepEls.forEach(function(stepEl, idx) {
        var stepNum = idx + 1; // 1-based
        var isCompleted = stepEl.classList.contains('step--completed');
        var isActive    = stepEl.classList.contains('step--active');

        if (isCompleted || isActive) {
            stepEl.style.cursor = 'pointer';
            stepEl.addEventListener('click', function() {
                self._v023_goingBack = true;
                self._v0214_navigateToStep(stepNum);
            });
        }
    });
};

// ─── Navigate to a specific step number ──────────────────────────────────
SendUpload.prototype._v0214_navigateToStep = function(step) {
    // Map step numbers to states (using 6-step wizard from v0.2.8)
    // 1=Upload, 2=Delivery, 3=Share mode, 4=Confirm, 5=Encrypt, 6=Done

    // If navigating back past share mode (step ≤ 3), clear the friendly key
    // so a new transfer ID is derived on the next upload (avoids ID collision)
    if (step <= 3) {
        this._v026_friendlyParts = null;
        this._v026_friendlyKey   = null;
    }

    switch (step) {
        case 1:
            this.state = 'idle';
            break;
        case 2:
            this.state = 'choosing-delivery';
            break;
        case 3:
            this.state = 'choosing-share';
            break;
        case 4:
            this.state = 'confirming';
            break;
        default:
            return; // Can't navigate to processing/done
    }
    this.render();
    this.setupEventListeners();
};

// ─── Override: confirm step — add thumbnail generation note ─────────────────
var _v026_renderConfirm = SendUpload.prototype._v026_renderConfirm;

SendUpload.prototype._v026_renderConfirm = function() {
    var html = _v026_renderConfirm.call(this);

    // Add thumbnail note for gallery delivery (folders and single file gallery)
    var delivery = this._v023_selectedDelivery || 'download';
    var isFolder = !!this._folderScan;

    if (delivery === 'gallery' || (isFolder && delivery === 'browse')) {
        var noteHtml =
            '<div class="v0214-thumbnail-note">' +
                '<span class="v0214-thumbnail-note__icon">&#128247;</span>' +
                '<div class="v0214-thumbnail-note__text">' +
                    '<strong>Preview generation</strong><br>' +
                    'Thumbnails and metadata will be generated from your files during encryption. ' +
                    'This happens entirely in your browser — nothing is sent to the server unencrypted.' +
                '</div>' +
            '</div>';

        // Insert before the back button
        html = html.replace(
            '<button class="v023-back-link" id="v026-back-to-share">',
            noteHtml + '<button class="v023-back-link" id="v026-back-to-share">'
        );
    }

    return html;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0214-upload-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0214-upload-styles';
    style.textContent = '\
        /* ── Dimmed default card when hovering another option ── */\
        .v0214-default-dimmed {\
            border-color: rgba(78, 205, 196, 0.35) !important;\
            background: rgba(78, 205, 196, 0.03) !important;\
            opacity: 0.75;\
            transition: border-color 0.2s, background 0.2s, opacity 0.2s;\
        }\
        .v0214-default-dimmed::after {\
            opacity: 0.5 !important;\
        }\
        /* Smooth transitions on default card */\
        .v028-default-selected {\
            transition: border-color 0.2s, background 0.2s, opacity 0.2s;\
        }\
        \
        /* ── Thumbnail generation note on confirm step ── */\
        .v0214-thumbnail-note {\
            display: flex;\
            gap: var(--space-3, 0.75rem);\
            align-items: flex-start;\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            margin-top: var(--space-4, 1rem);\
            border-radius: var(--radius-md, 8px);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid rgba(78, 205, 196, 0.15);\
            font-size: 0.85rem;\
            line-height: 1.4;\
            color: var(--text-secondary, rgba(255,255,255,0.65));\
        }\
        .v0214-thumbnail-note__icon {\
            font-size: 1.2rem;\
            flex-shrink: 0;\
            margin-top: 0.1rem;\
        }\
        .v0214-thumbnail-note__text strong {\
            color: var(--text-primary, rgba(255,255,255,0.9));\
            font-size: 0.85rem;\
        }\
    ';
    document.head.appendChild(style);
})();

// ─── Make step indicator completed steps look clickable ──────────────────
// We patch the _render method of SendStepIndicator to add :hover styles
(function patchStepIndicator() {
    if (typeof SendStepIndicator === 'undefined') return;
    var _origRender = SendStepIndicator.prototype._render;
    SendStepIndicator.prototype._render = function() {
        _origRender.call(this);
        // Inject clickable styles into shadow root
        if (this.shadowRoot && !this.shadowRoot.querySelector('#v0214-step-click-styles')) {
            var extraStyle = document.createElement('style');
            extraStyle.id = 'v0214-step-click-styles';
            extraStyle.textContent =
                '.step--completed, .step--active { cursor: pointer; } ' +
                '.step--completed:hover .step__label, .step--active:hover .step__label { text-decoration: underline; } ' +
                '.step--completed:hover .dot--completed, .step--active:hover .dot--active { box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.4); }';
            this.shadowRoot.appendChild(extraStyle);
        }
    };

})();
// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.15 — All 3 delivery options, smart defaults, taller carousel
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.16 — Upload step resets file selection
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.16 — Surgical overlay on v0.2.15

   Changes:
     - Fix: clicking "Upload" step resets file selection so user can drop
       a new file. Other step links (Delivery, Share mode, Confirm) still
       preserve state for back-navigation.

   Loads AFTER v0.2.15 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Override navigateToStep: reset file state when going back to Upload ──

var _v0215_navigateToStep = SendUpload.prototype._v0214_navigateToStep;

SendUpload.prototype._v0214_navigateToStep = function(step) {
    if (step === 1) {
        // Reset file-related state so user can drop a new file
        this.selectedFile       = null;
        this._folderScan        = null;
        this._v023_deliveryOptions     = null;
        this._v023_selectedDelivery    = null;
        this._v023_recommendedDelivery = null;
        this._v026_friendlyParts       = null;
        this._v026_friendlyKey         = null;

        // Reset the file input so the same file can be re-selected
        var fileInput = this.querySelector('#file-input');
        if (fileInput) fileInput.value = '';
        var folderInput = this.querySelector('#folder-input');
        if (folderInput) folderInput.value = '';
    }

    _v0215_navigateToStep.call(this, step);
};

// ═══════════════════════════════════════════════════════════════════════════════
// v0.2.17 — Single file gallery delivery
// ═══════════════════════════════════════════════════════════════════════════════

/* =============================================================================
   SGraph Send — Upload Component
   v0.2.17 — Surgical overlay on v0.2.16

   Changes:
     - Gallery delivery for single files: when user selects Gallery for a
       single file upload, wrap it in a zip with _gallery.{hash}/ folder
       containing thumbnail + manifest. The share link opens Gallery view
       with the single file displayed with its thumbnail.
     - Previously, gallery was only generated for folder uploads (via
       _v023_compressFolder). Single file uploads skipped the zip step
       entirely, so the gallery URL pointed to raw content with no
       _gallery folder.

   Loads AFTER v0.2.16 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

// ─── Override: _v023_startProcessing — wrap single file in zip for gallery ──
//
// The v0.2.3 startProcessing only zips when _folderScan exists (folder upload).
// For single file + gallery delivery, we need to:
//   1. Create a JSZip with the single file
//   2. Call _v0213_addPreviewToZip to generate _gallery.{hash}/ with thumbnails
//   3. Replace this.selectedFile with the zip
//   4. Continue with the normal processing chain
//
// We intercept at the v0.2.3 level by synthesising a _folderScan so the
// existing _v023_compressFolder → _v0213_addPreviewToZip pipeline works.

var _v0216_startProcessing = SendUpload.prototype._v023_startProcessing;

SendUpload.prototype._v023_startProcessing = async function() {
    var delivery = this._v023_selectedDelivery || 'download';
    var isSingleFile = !this._folderScan && this.selectedFile;

    if (delivery === 'gallery' && isSingleFile) {
        // Synthesise a minimal _folderScan so the existing pipeline works.
        // The _v023_compressFolder → _v0213_addPreviewToZip pipeline will:
        //   1. Create a zip with the single file
        //   2. Generate _gallery.{hash}/ folder with thumbnail + manifest
        //   3. Replace this.selectedFile with the zip
        var file = this.selectedFile;
        this._folderScan = {
            entries:   [{ name: file.name, path: file.name, isDir: false, file: file }],
            totalSize: file.size,
            fileCount: 1
        };
        this._folderName = file.name.replace(/\.[^.]+$/, '') || 'file';
        this._folderOptions = this._folderOptions || { level: 4, includeEmpty: false, includeHidden: false };
        this._v0217_singleFileGallery = true;

        console.log('[v0217] Single file gallery: wrapping "' + file.name + '" in zip with gallery folder');
    }

    await _v0216_startProcessing.call(this);
};
