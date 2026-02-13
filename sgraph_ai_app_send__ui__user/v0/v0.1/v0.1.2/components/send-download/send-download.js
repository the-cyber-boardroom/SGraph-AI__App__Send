/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Web Component
   v0.1.2 — Text display mode

   Changes from v0.1.1:
   - If content_type_hint starts with 'text/', displays decrypted text inline
   - Text display uses <pre> with textContent (XSS-safe, per AppSec)
   - "Copy to clipboard" button for text content
   - "Download as file" secondary action for text
   - Non-text content: same download-as-file behaviour as v0.1.1

   Inherits from v0.1.1:
   - Hash-fragment URL parsing (#transferId/key)
   - Backwards compat with ?id= query param
   - URL hash cleared after successful decryption

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
        this.hashKey          = null;
        this.decryptedText    = null;   // Holds decrypted text for inline display
        this.decryptedBytes   = null;   // Holds raw decrypted bytes for "download as file"
        this.state            = 'loading';  // loading | ready | decrypting | complete | error
        this.errorMessage     = null;
        this._boundDecryptClick = null;
    }

    connectedCallback() {
        this.parseUrl();
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

    // ─── URL Parsing ──────────────────────────────────────────────────────

    parseUrl() {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const slashIndex = hash.indexOf('/');
            if (slashIndex > 0) {
                this.transferId = hash.substring(0, slashIndex);
                this.hashKey    = hash.substring(slashIndex + 1);
            } else {
                this.transferId = hash;
            }
            return;
        }
        const params = new URLSearchParams(window.location.search);
        this.transferId = params.get('id') || null;
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

    // ─── Content Type Detection ──────────────────────────────────────────

    isTextContent() {
        if (!this.transferInfo) return false;
        const hint = (this.transferInfo.content_type_hint || '').toLowerCase();
        return hint.startsWith('text/');
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
        const typeLabel = this.isTextContent() ? 'Encrypted text' : 'Encrypted file';
        return `
            <div class="status status--info">
                <strong>${typeLabel}</strong> — ${this.formatBytes(this.transferInfo.file_size_bytes)}
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
                       value="${this.hashKey ? this.escapeHtml(this.hashKey) : ''}"
                       autocomplete="off" spellcheck="false">
                <button class="btn btn-primary" id="decrypt-btn" style="margin-top: 0.75rem; width: 100%;">
                    ${this.isTextContent() ? 'Decrypt &amp; View' : 'Download &amp; Decrypt'}
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

        if (this.decryptedText !== null) {
            return `
                <div class="status status--success">
                    Text decrypted successfully.
                </div>
                <div style="margin-top: 1rem;">
                    <pre id="decrypted-text" style="background: var(--color-drop-zone-bg); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1rem; white-space: pre-wrap; word-wrap: break-word; font-size: var(--font-size-sm); max-height: 400px; overflow-y: auto;"></pre>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                        <button class="btn btn-primary btn-sm" id="copy-text-btn">Copy to clipboard</button>
                        <button class="btn btn-sm" id="download-text-btn">Download as file</button>
                    </div>
                </div>
                <send-transparency id="transparency-panel"></send-transparency>
            `;
        }

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

        // Text-mode buttons
        const copyTextBtn = this.querySelector('#copy-text-btn');
        if (copyTextBtn) {
            copyTextBtn.addEventListener('click', () => {
                if (this.decryptedText !== null) {
                    this.copyToClipboard(this.decryptedText, copyTextBtn);
                }
            });
        }

        const downloadTextBtn = this.querySelector('#download-text-btn');
        if (downloadTextBtn) {
            downloadTextBtn.addEventListener('click', () => {
                if (this.decryptedBytes) this.saveFile(this.decryptedBytes);
            });
        }

        // Set decrypted text content using textContent (XSS-safe, per AppSec)
        const preEl = this.querySelector('#decrypted-text');
        if (preEl && this.decryptedText !== null) {
            preEl.textContent = this.decryptedText;
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

            const key       = await SendCrypto.importKey(keyString);
            const encrypted = await ApiClient.downloadPayload(this.transferId);
            const decrypted = await SendCrypto.decryptFile(key, encrypted);

            // Store raw bytes for "download as file" option
            this.decryptedBytes = decrypted;

            // Check content type — display text inline or save file
            if (this.isTextContent()) {
                this.decryptedText = new TextDecoder().decode(decrypted);
            } else {
                this.saveFile(decrypted);
            }

            // Clear hash from URL after successful decryption (per AppSec)
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

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
            const newKeyInput = this.querySelector('#key-input');
            if (newKeyInput) newKeyInput.value = keyString;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

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

    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            const original       = button.textContent;
            button.textContent   = 'Copied!';
            setTimeout(() => { button.textContent = original; }, 2000);
        } catch (e) {
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
