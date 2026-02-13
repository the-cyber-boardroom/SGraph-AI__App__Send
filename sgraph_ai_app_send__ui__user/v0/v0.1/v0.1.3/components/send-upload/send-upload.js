/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Web Component
   v0.1.3 — i18n integration

   Changes from v0.1.2:
   - All user-facing strings use I18n.t() instead of hardcoded English
   - Listens for 'locale-changed' event and re-renders
   - Download URL points to v0.1.3/download.html

   Inherits from v0.1.2: File/Text mode, hash-fragment URLs, no GA

   Usage:  <send-upload></send-upload>
   Emits:  'upload-complete' — { detail: { transferId, downloadUrl, key } }
   ═══════════════════════════════════════════════════════════════════════════ */

class SendUpload extends HTMLElement {

    constructor() {
        super();
        this.selectedFile      = null;
        this.inputMode         = 'file';
        this.state             = 'idle';
        this._boundDragOver    = null;
        this._boundDragLeave   = null;
        this._boundDrop        = null;
        this._boundFileInput   = null;
        this._boundDropClick   = null;
        this._boundUploadClick = null;
        this._showSeparateKey  = false;
        this._localeHandler    = () => { if (this.state === 'idle' || this.state === 'complete') { this.render(); this.setupEventListeners(); } };
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        document.addEventListener('locale-changed', this._localeHandler);
    }

    disconnectedCallback() {
        this.cleanup();
        document.removeEventListener('locale-changed', this._localeHandler);
    }

    // ─── Shorthand ─────────────────────────────────────────────────────────

    t(key, params) { return I18n.t(key, params); }

    // ─── Rendering ─────────────────────────────────────────────────────────

    render() {
        this.innerHTML = `
            <div class="card">
                ${this.renderModeTabs()}
                ${this.renderDropZone()}
                ${this.renderTextInput()}
                ${this.renderFileInfo()}
                ${this.renderProgress()}
                ${this.renderResult()}
                ${this.renderError()}
            </div>
        `;
    }

    renderModeTabs() {
        if (this.state === 'complete') return '';
        const fileActive = this.inputMode === 'file' ? 'btn-primary' : '';
        const textActive = this.inputMode === 'text' ? 'btn-primary' : '';
        return `
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <button class="btn btn-sm ${fileActive}" id="mode-file">${this.escapeHtml(this.t('upload.mode.file'))}</button>
                <button class="btn btn-sm ${textActive}" id="mode-text">${this.escapeHtml(this.t('upload.mode.text'))}</button>
            </div>
        `;
    }

    renderDropZone() {
        if (this.state === 'complete' || this.inputMode !== 'file') return '';
        const hidden = this.state === 'encrypting' || this.state === 'uploading' ? 'hidden' : '';
        return `
            <div class="drop-zone ${hidden}" id="drop-zone">
                <div class="drop-zone__label">${this.escapeHtml(this.t('upload.drop_zone.label'))}</div>
                <div class="drop-zone__hint">${this.escapeHtml(this.t('upload.drop_zone.hint'))}</div>
                <div class="drop-zone__hint" style="margin-top: 0.5rem;">${this.escapeHtml(this.t('upload.drop_zone.encrypted_hint'))}</div>
                <input type="file" id="file-input" style="display: none;">
            </div>
        `;
    }

    renderTextInput() {
        if (this.state === 'complete' || this.inputMode !== 'text') return '';
        const hidden = this.state === 'encrypting' || this.state === 'uploading' ? 'hidden' : '';
        return `
            <div class="${hidden}">
                <textarea class="input" id="text-input"
                          placeholder="${this.escapeHtml(this.t('upload.text.placeholder'))}"
                          style="width: 100%; min-height: 150px; resize: vertical; font-family: inherit; box-sizing: border-box;"
                          spellcheck="true"></textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem;">
                    <span style="font-size: var(--font-size-sm); color: var(--color-text-secondary);" id="text-char-count">${this.escapeHtml(this.t('upload.text.char_count', { count: 0 }))}</span>
                    <button class="btn btn-primary btn-sm" id="upload-btn"
                            ${this.state !== 'idle' ? 'disabled' : ''}>
                        ${this.t('upload.button.encrypt_send')}
                    </button>
                </div>
            </div>
        `;
    }

    renderFileInfo() {
        if (!this.selectedFile || this.state === 'complete' || this.inputMode !== 'file') return '';
        return `
            <div class="status status--info" style="display: flex; justify-content: space-between; align-items: center;">
                <span><strong>${this.escapeHtml(this.selectedFile.name)}</strong> (${this.formatBytes(this.selectedFile.size)})</span>
                <button class="btn btn-primary btn-sm" id="upload-btn"
                        ${this.state !== 'idle' ? 'disabled' : ''}>
                    ${this.t('upload.button.encrypt_upload')}
                </button>
            </div>
        `;
    }

    renderProgress() {
        if (this.state !== 'encrypting' && this.state !== 'uploading') return '';
        const label = this.state === 'encrypting' ? this.t('upload.progress.encrypting') : this.t('upload.progress.uploading');
        const pct   = this.state === 'encrypting' ? '33' : '66';
        return `
            <div style="margin: 1rem 0;">
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${this.escapeHtml(label)}
                </div>
                <div class="progress-bar">
                    <div class="progress-bar__fill" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }

    renderResult() {
        if (this.state !== 'complete' || !this.result) return '';
        const { combinedUrl, linkOnlyUrl, keyString, transparency } = this.result;
        const successKey = this.result.isText ? 'upload.result.text_success' : 'upload.result.file_success';

        const separateSection = this._showSeparateKey ? `
            <div class="result-panel" style="margin-top: 0.75rem;">
                <div class="result-row">
                    <label>${this.escapeHtml(this.t('upload.result.link_only'))}</label>
                    <span class="value" id="link-only">${this.escapeHtml(linkOnlyUrl)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="link-only">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                </div>
                <div class="result-row">
                    <label>${this.escapeHtml(this.t('upload.result.decryption_key'))}</label>
                    <span class="value" id="decryption-key">${this.escapeHtml(keyString)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="decryption-key">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                </div>
            </div>
            <div class="guidance">
                ${this.t('upload.guidance.split_channels')}
            </div>
        ` : '';

        return `
            <div class="status status--success">
                ${this.escapeHtml(this.t(successKey))}
            </div>
            <div class="result-panel">
                <div class="result-row">
                    <label>${this.escapeHtml(this.t('upload.result.share_link'))}</label>
                    <span class="value" id="combined-link">${this.escapeHtml(combinedUrl)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="combined-link">${this.escapeHtml(this.t('upload.result.copy_link'))}</button>
                </div>
            </div>
            <div style="margin-top: 0.5rem; text-align: right;">
                <button class="btn btn-sm" id="toggle-separate-key" style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                    ${this.escapeHtml(this._showSeparateKey ? this.t('upload.result.hide_key') : this.t('upload.result.show_separate_key'))}
                </button>
            </div>
            ${separateSection}
            ${transparency ? `<send-transparency id="transparency-panel"></send-transparency>` : ''}
        `;
    }

    renderError() {
        if (this.state !== 'error' || !this.errorMessage) return '';
        return `<div class="status status--error">${this.escapeHtml(this.errorMessage)}</div>`;
    }

    // ─── Event Listeners ───────────────────────────────────────────────────

    setupEventListeners() {
        const modeFile = this.querySelector('#mode-file');
        const modeText = this.querySelector('#mode-text');
        if (modeFile) modeFile.addEventListener('click', () => this.switchMode('file'));
        if (modeText) modeText.addEventListener('click', () => this.switchMode('text'));

        const dropZone  = this.querySelector('#drop-zone');
        const fileInput = this.querySelector('#file-input');

        if (dropZone) {
            this._boundDragOver = (e) => this.handleDragOver(e);
            this._boundDragLeave = (e) => this.handleDragLeave(e);
            this._boundDrop = (e) => this.handleDrop(e);
            this._boundDropClick = () => fileInput && fileInput.click();

            dropZone.addEventListener('dragover',  this._boundDragOver);
            dropZone.addEventListener('dragleave', this._boundDragLeave);
            dropZone.addEventListener('drop',      this._boundDrop);
            dropZone.addEventListener('click',     this._boundDropClick);
        }

        if (fileInput) {
            this._boundFileInput = (e) => this.handleFileSelect(e);
            fileInput.addEventListener('change', this._boundFileInput);
        }

        const textInput = this.querySelector('#text-input');
        if (textInput) {
            textInput.addEventListener('input', () => {
                const counter = this.querySelector('#text-char-count');
                if (counter) counter.textContent = this.t('upload.text.char_count', { count: textInput.value.length });
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
                const el       = this.querySelector(`#${targetId}`);
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
    }

    cleanup() {
        const dropZone  = this.querySelector('#drop-zone');
        const fileInput = this.querySelector('#file-input');
        if (dropZone) {
            if (this._boundDragOver)  dropZone.removeEventListener('dragover',  this._boundDragOver);
            if (this._boundDragLeave) dropZone.removeEventListener('dragleave', this._boundDragLeave);
            if (this._boundDrop)      dropZone.removeEventListener('drop',      this._boundDrop);
            if (this._boundDropClick) dropZone.removeEventListener('click',     this._boundDropClick);
        }
        if (fileInput && this._boundFileInput) {
            fileInput.removeEventListener('change', this._boundFileInput);
        }
        this._boundDragOver    = null;
        this._boundDragLeave   = null;
        this._boundDrop        = null;
        this._boundFileInput   = null;
        this._boundDropClick   = null;
        this._boundUploadClick = null;
    }

    switchMode(mode) {
        if (this.inputMode === mode || this.state !== 'idle') return;
        this.inputMode = mode;
        this.render();
        this.setupEventListeners();
    }

    // ─── Drag and Drop ─────────────────────────────────────────────────────

    handleDragOver(e)  { e.preventDefault(); e.stopPropagation(); const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.add('dragover');    }
    handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.remove('dragover'); }

    handleDrop(e) {
        e.preventDefault(); e.stopPropagation();
        const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.remove('dragover');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) { this.selectedFile = files[0]; this.state = 'idle'; this.render(); this.setupEventListeners(); }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files && files.length > 0) { this.selectedFile = files[0]; this.state = 'idle'; this.render(); this.setupEventListeners(); }
    }

    // ─── Upload Flow ───────────────────────────────────────────────────────

    async startUpload() {
        if (this.state !== 'idle') return;

        if (!SendCrypto.isAvailable()) {
            this.errorMessage = this.t('crypto.error.unavailable');
            this.state = 'error'; this.render(); this.setupEventListeners(); return;
        }

        const isText = this.inputMode === 'text';

        if (isText) {
            const ti = this.querySelector('#text-input');
            if (!ti || !ti.value.trim()) {
                this.errorMessage = this.t('upload.error.empty_text');
                this.state = 'error'; this.render(); this.setupEventListeners(); return;
            }
        } else if (!this.selectedFile) { return; }

        try {
            this.state = 'encrypting'; this.render(); this.setupEventListeners();

            let plaintext, fileSizeBytes, contentType;
            if (isText) {
                const text  = this.querySelector('#text-input')?.value || '';
                plaintext     = new TextEncoder().encode(text).buffer;
                fileSizeBytes = plaintext.byteLength;
                contentType   = 'text/plain';
            } else {
                plaintext     = await this.readFileAsArrayBuffer(this.selectedFile);
                fileSizeBytes = this.selectedFile.size;
                contentType   = this.selectedFile.type || 'application/octet-stream';
            }

            const key       = await SendCrypto.generateKey();
            const keyString = await SendCrypto.exportKey(key);
            const encrypted = await SendCrypto.encryptFile(key, plaintext);

            this.state = 'uploading'; this.render(); this.setupEventListeners();

            const createResult   = await ApiClient.createTransfer(fileSizeBytes, contentType);
            await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
            const completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

            const combinedUrl = this.buildCombinedUrl(createResult.transfer_id, keyString);
            const linkOnlyUrl = this.buildLinkOnlyUrl(createResult.transfer_id);

            this.result = { transferId: createResult.transfer_id, combinedUrl, linkOnlyUrl, keyString, isText, transparency: completeResult.transparency || null };
            this.state = 'complete'; this.render(); this.setupDynamicListeners();

            this.dispatchEvent(new CustomEvent('upload-complete', {
                detail: { transferId: createResult.transfer_id, downloadUrl: combinedUrl, key: keyString },
                bubbles: true
            }));

        } catch (err) {
            if (err.message === 'ACCESS_TOKEN_INVALID') { document.dispatchEvent(new CustomEvent('access-token-invalid')); return; }
            this.errorMessage = err.message || this.t('upload.error.upload_failed');
            this.state = 'error'; this.render(); this.setupEventListeners();
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(new Error(this.t('crypto.error.read_failed')));
            reader.readAsArrayBuffer(file);
        });
    }

    buildCombinedUrl(tid, key) { return `${window.location.origin}/send/v0/v0.1/v0.1.3/download.html#${tid}/${key}`; }
    buildLinkOnlyUrl(tid)      { return `${window.location.origin}/send/v0/v0.1/v0.1.3/download.html#${tid}`; }

    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
        const original = button.textContent;
        button.textContent = this.t('common.copied');
        setTimeout(() => { button.textContent = original; }, 2000);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'], k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const v = bytes / Math.pow(k, i);
        return `${v % 1 === 0 ? v : v.toFixed(1)} ${units[i]}`;
    }

    escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
}

customElements.define('send-upload', SendUpload);
