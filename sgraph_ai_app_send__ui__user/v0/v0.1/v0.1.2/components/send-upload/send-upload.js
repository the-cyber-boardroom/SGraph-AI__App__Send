/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Web Component
   v0.1.2 — Text input mode

   Changes from v0.1.1:
   - Mode toggle: "File" | "Text" tabs
   - Text mode: textarea instead of drop zone, encodes to bytes
   - Sends content_type_hint = 'text/plain' for text mode
   - Download URL points to v0.1.2/download.html

   Inherits from v0.1.1:
   - Hash-fragment URLs (combined link + expandable separate key)
   - No Google Analytics

   Usage:
     <send-upload></send-upload>

   Emits:
     'upload-complete' — { detail: { transferId, downloadUrl, key } }
   ═══════════════════════════════════════════════════════════════════════════ */

class SendUpload extends HTMLElement {

    constructor() {
        super();
        this.selectedFile = null;
        this.inputMode    = 'file';  // 'file' | 'text'
        this.state        = 'idle';  // idle | encrypting | uploading | complete | error
        this._boundDragOver  = null;
        this._boundDragLeave = null;
        this._boundDrop      = null;
        this._boundFileInput = null;
        this._boundDropClick = null;
        this._boundUploadClick = null;
        this._showSeparateKey  = false;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    disconnectedCallback() {
        this.cleanup();
    }

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
                <button class="btn btn-sm ${fileActive}" id="mode-file">File</button>
                <button class="btn btn-sm ${textActive}" id="mode-text">Text</button>
            </div>
        `;
    }

    renderDropZone() {
        if (this.state === 'complete' || this.inputMode !== 'file') return '';
        const hidden = this.state === 'encrypting' || this.state === 'uploading' ? 'hidden' : '';
        return `
            <div class="drop-zone ${hidden}" id="drop-zone">
                <div class="drop-zone__label">Drop your file here</div>
                <div class="drop-zone__hint">or click to browse</div>
                <div class="drop-zone__hint" style="margin-top: 0.5rem;">Encrypted in your browser before upload</div>
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
                          placeholder="Type or paste your text here"
                          style="width: 100%; min-height: 150px; resize: vertical; font-family: inherit; box-sizing: border-box;"
                          spellcheck="true"></textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem;">
                    <span style="font-size: var(--font-size-sm); color: var(--color-text-secondary);" id="text-char-count">0 characters</span>
                    <button class="btn btn-primary btn-sm" id="upload-btn"
                            ${this.state !== 'idle' ? 'disabled' : ''}>
                        Encrypt &amp; Send
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
                    Encrypt &amp; Upload
                </button>
            </div>
        `;
    }

    renderProgress() {
        if (this.state !== 'encrypting' && this.state !== 'uploading') return '';
        const label = this.state === 'encrypting' ? 'Encrypting...' : 'Uploading...';
        const pct   = this.state === 'encrypting' ? '33' : '66';
        return `
            <div style="margin: 1rem 0;">
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${label}
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

        const separateSection = this._showSeparateKey ? `
            <div class="result-panel" style="margin-top: 0.75rem;">
                <div class="result-row">
                    <label>Link only</label>
                    <span class="value" id="link-only">${this.escapeHtml(linkOnlyUrl)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="link-only">Copy</button>
                </div>
                <div class="result-row">
                    <label>Decryption key</label>
                    <span class="value" id="decryption-key">${this.escapeHtml(keyString)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="decryption-key">Copy</button>
                </div>
            </div>
            <div class="guidance">
                For best security, share the link and the key via <strong>different channels</strong>
                (e.g. link via email, key via messaging app).
            </div>
        ` : '';

        return `
            <div class="status status--success">
                Your ${this.result.isText ? 'text has' : 'file has'} been encrypted and uploaded.
            </div>
            <div class="result-panel">
                <div class="result-row">
                    <label>Share this link</label>
                    <span class="value" id="combined-link">${this.escapeHtml(combinedUrl)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="combined-link">Copy link</button>
                </div>
            </div>
            <div style="margin-top: 0.5rem; text-align: right;">
                <button class="btn btn-sm" id="toggle-separate-key" style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                    ${this._showSeparateKey ? 'Hide key' : 'Share key separately'}
                </button>
            </div>
            ${separateSection}
            ${transparency ? `<send-transparency id="transparency-panel"></send-transparency>` : ''}
        `;
    }

    renderError() {
        if (this.state !== 'error' || !this.errorMessage) return '';
        return `
            <div class="status status--error">
                ${this.escapeHtml(this.errorMessage)}
            </div>
        `;
    }

    // ─── Event Listeners ───────────────────────────────────────────────────

    setupEventListeners() {
        // Mode tabs
        const modeFile = this.querySelector('#mode-file');
        const modeText = this.querySelector('#mode-text');
        if (modeFile) modeFile.addEventListener('click', () => this.switchMode('file'));
        if (modeText) modeText.addEventListener('click', () => this.switchMode('text'));

        // File mode listeners
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

        // Text mode listeners
        const textInput = this.querySelector('#text-input');
        if (textInput) {
            textInput.addEventListener('input', () => {
                const counter = this.querySelector('#text-char-count');
                if (counter) counter.textContent = `${textInput.value.length} characters`;
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

        // Copy buttons
        this.querySelectorAll('[data-copy]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-copy');
                const el       = this.querySelector(`#${targetId}`);
                if (el) this.copyToClipboard(el.textContent, e.target);
            });
        });

        // Toggle separate key display
        const toggleBtn = this.querySelector('#toggle-separate-key');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this._showSeparateKey = !this._showSeparateKey;
                this.render();
                this.setupDynamicListeners();
            });
        }

        // Set transparency data if panel exists
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

        this._boundDragOver  = null;
        this._boundDragLeave = null;
        this._boundDrop      = null;
        this._boundFileInput = null;
        this._boundDropClick = null;
        this._boundUploadClick = null;
    }

    // ─── Mode Switching ────────────────────────────────────────────────────

    switchMode(mode) {
        if (this.inputMode === mode || this.state !== 'idle') return;
        this.inputMode = mode;
        this.render();
        this.setupEventListeners();
    }

    // ─── Drag and Drop Handlers ────────────────────────────────────────────

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropZone = this.querySelector('#drop-zone');
        if (dropZone) dropZone.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropZone = this.querySelector('#drop-zone');
        if (dropZone) dropZone.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropZone = this.querySelector('#drop-zone');
        if (dropZone) dropZone.classList.remove('dragover');

        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
            this.selectedFile = files[0];
            this.state        = 'idle';
            this.render();
            this.setupEventListeners();
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files && files.length > 0) {
            this.selectedFile = files[0];
            this.state        = 'idle';
            this.render();
            this.setupEventListeners();
        }
    }

    // ─── Upload Flow ───────────────────────────────────────────────────────

    async startUpload() {
        if (this.state !== 'idle') return;

        // Check crypto availability before attempting encryption
        if (!SendCrypto.isAvailable()) {
            this.errorMessage = 'Web Crypto API is not available. '
                              + 'It requires a secure context (HTTPS or localhost). '
                              + 'If running locally, use "localhost" instead of "127.0.0.1".';
            this.state        = 'error';
            this.render();
            this.setupEventListeners();
            return;
        }

        const isText = this.inputMode === 'text';

        // Validate input
        if (isText) {
            const textInput = this.querySelector('#text-input');
            const text      = textInput ? textInput.value : '';
            if (!text.trim()) {
                this.errorMessage = 'Please enter some text to encrypt.';
                this.state        = 'error';
                this.render();
                this.setupEventListeners();
                return;
            }
        } else if (!this.selectedFile) {
            return;
        }

        try {
            // Step 1: Encrypt
            this.state = 'encrypting';
            this.render();
            this.setupEventListeners();

            let plaintext;
            let fileSizeBytes;
            let contentType;

            if (isText) {
                const textInput = this.querySelector('#text-input');
                const text      = textInput ? textInput.value : '';
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

            // Step 2: Upload
            this.state = 'uploading';
            this.render();
            this.setupEventListeners();

            const createResult = await ApiClient.createTransfer(fileSizeBytes, contentType);
            await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
            const completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

            // Step 3: Show result — hash-fragment URLs
            const combinedUrl  = this.buildCombinedUrl(createResult.transfer_id, keyString);
            const linkOnlyUrl  = this.buildLinkOnlyUrl(createResult.transfer_id);

            this.result = {
                transferId:   createResult.transfer_id,
                combinedUrl:  combinedUrl,
                linkOnlyUrl:  linkOnlyUrl,
                keyString:    keyString,
                isText:       isText,
                transparency: completeResult.transparency || null
            };

            this.state = 'complete';
            this.render();
            this.setupDynamicListeners();

            // Dispatch event
            this.dispatchEvent(new CustomEvent('upload-complete', {
                detail: {
                    transferId:  createResult.transfer_id,
                    downloadUrl: combinedUrl,
                    key:         keyString
                },
                bubbles: true
            }));

        } catch (err) {
            if (err.message === 'ACCESS_TOKEN_INVALID') {
                document.dispatchEvent(new CustomEvent('access-token-invalid'));
                return;
            }
            this.errorMessage = err.message || 'Upload failed. Please try again.';
            this.state        = 'error';
            this.render();
            this.setupEventListeners();
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    buildCombinedUrl(transferId, keyString) {
        return `${window.location.origin}/send/v0/v0.1/v0.1.2/download.html#${transferId}/${keyString}`;
    }

    buildLinkOnlyUrl(transferId) {
        return `${window.location.origin}/send/v0/v0.1/v0.1.2/download.html#${transferId}`;
    }

    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const original       = button.textContent;
            button.textContent   = 'Copied!';
            setTimeout(() => { button.textContent = original; }, 2000);
        } catch (e) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity  = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            const original       = button.textContent;
            button.textContent   = 'Copied!';
            setTimeout(() => { button.textContent = original; }, 2000);
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const k     = 1024;
        const i     = Math.floor(Math.log(bytes) / Math.log(k));
        const value = bytes / Math.pow(k, i);
        return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
    }

    escapeHtml(str) {
        const div       = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

customElements.define('send-upload', SendUpload);
