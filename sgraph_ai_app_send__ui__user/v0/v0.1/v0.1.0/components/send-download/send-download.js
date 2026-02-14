/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Web Component
   v0.1.0 — Base major version

   Implements the download flow:
   1. Read transfer_id from URL query parameter ?id=xxx
   2. Fetch transfer info (show file size, created date)
   3. Key input field
   4. On "Download & Decrypt": import key, download blob, decrypt, save
   5. Show transparency panel after download

   Usage:
     <send-download></send-download>

   Emits:
     'download-complete' — { detail: { transferId } }
   ═══════════════════════════════════════════════════════════════════════════ */

class SendDownload extends HTMLElement {

    constructor() {
        super();
        this.transferId       = null;
        this.transferInfo     = null;
        this.transparencyData = null;
        this.state            = 'loading';  // loading | ready | decrypting | complete | error
        this.errorMessage     = null;
        this._boundDecryptClick = null;
    }

    connectedCallback() {
        this.transferId = this.getTransferIdFromUrl();
        if (!this.transferId) {
            this.state        = 'error';
            this.errorMessage = 'No transfer ID found in URL. Please check your link.';
            this.render();
            return;
        }
        this.loadTransferInfo();
    }

    disconnectedCallback() {
        this.cleanup();
    }

    // ─── Data Loading ────────────────────────────────────────────────────

    async loadTransferInfo() {
        try {
            this.transferInfo = await ApiClient.getTransferInfo(this.transferId);
            if (this.transferInfo.status !== 'completed') {
                this.state        = 'error';
                this.errorMessage = 'This transfer is not yet available for download.';
            } else {
                this.state = 'ready';
            }
        } catch (e) {
            this.state        = 'error';
            this.errorMessage = 'Transfer not found. The link may have expired.';
        }
        this.render();
        this.setupEventListeners();
    }

    // ─── Rendering ───────────────────────────────────────────────────────

    render() {
        this.innerHTML = `
            <div class="card">
                ${this.renderLoading()}
                ${this.renderTransferInfo()}
                ${this.renderKeyInput()}
                ${this.renderProgress()}
                ${this.renderComplete()}
                ${this.renderError()}
            </div>
        `;
    }

    renderLoading() {
        if (this.state !== 'loading') return '';
        return `<div class="status status--info">Loading transfer info...</div>`;
    }

    renderTransferInfo() {
        if (!this.transferInfo || this.state === 'error') return '';
        return `
            <div class="status status--info">
                <strong>Encrypted file</strong> — ${this.formatBytes(this.transferInfo.file_size_bytes)}
                <br><small>Uploaded ${this.formatTimestamp(this.transferInfo.created_at)}</small>
                ${this.transferInfo.download_count > 0 ? `<br><small>Downloaded ${this.transferInfo.download_count} time(s)</small>` : ''}
            </div>
        `;
    }

    renderKeyInput() {
        if (this.state !== 'ready') return '';
        return `
            <div style="margin-top: 1rem;">
                <label style="display: block; font-weight: 600; font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    Decryption key
                </label>
                <input type="text" class="input" id="key-input"
                       placeholder="Paste the decryption key here"
                       autocomplete="off" spellcheck="false">
                <button class="btn btn-primary" id="decrypt-btn" style="margin-top: 0.75rem; width: 100%;">
                    Download &amp; Decrypt
                </button>
            </div>
        `;
    }

    renderProgress() {
        if (this.state !== 'decrypting') return '';
        return `
            <div style="margin: 1rem 0;">
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    Downloading and decrypting...
                </div>
                <div class="progress-bar">
                    <div class="progress-bar__fill" style="width: 50%;"></div>
                </div>
            </div>
        `;
    }

    renderComplete() {
        if (this.state !== 'complete') return '';
        return `
            <div class="status status--success">
                File decrypted and saved successfully.
            </div>
            <send-transparency id="transparency-panel"></send-transparency>
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

    // ─── Event Listeners ─────────────────────────────────────────────────

    setupEventListeners() {
        const decryptBtn = this.querySelector('#decrypt-btn');
        if (decryptBtn) {
            this._boundDecryptClick = () => this.startDownload();
            decryptBtn.addEventListener('click', this._boundDecryptClick);
        }

        const keyInput = this.querySelector('#key-input');
        if (keyInput) {
            keyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.startDownload();
            });
        }

        // Set transparency data if panel exists
        const panel = this.querySelector('#transparency-panel');
        if (panel && this.transparencyData) {
            panel.setData(this.transparencyData);
        }
    }

    cleanup() {
        this._boundDecryptClick = null;
    }

    // ─── Download Flow ───────────────────────────────────────────────────

    async startDownload() {
        const keyInput  = this.querySelector('#key-input');
        const keyString = keyInput ? keyInput.value.trim() : '';

        if (!keyString) {
            this.errorMessage = 'Please enter the decryption key.';
            this.state        = 'error';
            this.render();
            this.setupEventListeners();
            return;
        }

        // Check crypto availability before attempting decryption
        if (!SendCrypto.isAvailable()) {
            this.errorMessage = 'Web Crypto API is not available. '
                              + 'It requires a secure context (HTTPS or localhost). '
                              + 'If running locally, use "localhost" instead of "127.0.0.1".';
            this.state        = 'error';
            this.render();
            this.setupEventListeners();
            return;
        }

        try {
            this.state = 'decrypting';
            this.render();

            // Import key
            const key = await SendCrypto.importKey(keyString);

            // Download encrypted payload
            const encrypted = await ApiClient.downloadPayload(this.transferId);

            // Decrypt
            const decrypted = await SendCrypto.decryptFile(key, encrypted);

            // Trigger "Save As"
            this.saveFile(decrypted);

            // Show success
            this.transparencyData = {
                download_timestamp: new Date().toISOString(),
                file_size_bytes:    this.transferInfo.file_size_bytes,
                not_stored:         ['file_name', 'file_content', 'decryption_key']
            };
            this.state = 'complete';
            this.render();
            this.setupEventListeners();

            this.dispatchEvent(new CustomEvent('download-complete', {
                detail: { transferId: this.transferId },
                bubbles: true
            }));

        } catch (err) {
            this.errorMessage = err.message || 'Download or decryption failed.';
            this.state        = 'ready';
            this.render();
            this.setupEventListeners();
            // Preserve the key input value on error
            const newKeyInput = this.querySelector('#key-input');
            if (newKeyInput) newKeyInput.value = keyString;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    getTransferIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id') || null;
    }

    saveFile(decryptedData) {
        const blob = new Blob([decryptedData]);
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'download';  // Generic — server doesn't know the original file name
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const k     = 1024;
        const i     = Math.floor(Math.log(bytes) / Math.log(k));
        const value = bytes / Math.pow(k, i);
        return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
    }

    formatTimestamp(ts) {
        try {
            return new Date(ts).toUTCString();
        } catch (e) {
            return ts;
        }
    }

    escapeHtml(str) {
        const div       = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

customElements.define('send-download', SendDownload);
