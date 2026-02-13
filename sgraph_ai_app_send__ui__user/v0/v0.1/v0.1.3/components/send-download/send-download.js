/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Web Component
   v0.1.3 — i18n integration + auto-decrypt + history

   Changes from v0.1.2:
   - All user-facing strings use I18n.t() instead of hardcoded English
   - Listens for 'locale-changed' event and re-renders (when not mid-flow)
   - Auto-decrypts when key is present in URL hash
   - Stores received items in localStorage with privacy notice
   - Extracts filename from SGMETA envelope if present
   - "Send your own" link after download

   Inherits from v0.1.2: Text display, hash-fragment URLs, URL clearing

   Usage:  <send-download></send-download>
   Emits:  'download-complete' — { detail: { transferId } }
   ═══════════════════════════════════════════════════════════════════════════ */

class SendDownload extends HTMLElement {

    constructor() {
        super();
        this.transferId       = null;
        this.transferInfo     = null;
        this.transparencyData = null;
        this.hashKey          = null;
        this.decryptedText    = null;
        this.decryptedBytes   = null;
        this.fileName         = null;
        this.state            = 'loading';
        this.errorMessage     = null;
        this._boundDecryptClick = null;
        this._localeHandler = () => { if (this.state === 'ready' || this.state === 'complete') { this.render(); this.setupEventListeners(); } };
    }

    connectedCallback() {
        this.parseUrl();
        if (!this.transferId) {
            this.state        = 'error';
            this.errorMessage = this.t('download.error.no_id');
            this.render();
            return;
        }
        this.loadTransferInfo();
        document.addEventListener('locale-changed', this._localeHandler);
        this._boundHashChange = () => this.handleHashChange();
        window.addEventListener('hashchange', this._boundHashChange);
    }

    disconnectedCallback() {
        this.cleanup();
        document.removeEventListener('locale-changed', this._localeHandler);
        if (this._boundHashChange) {
            window.removeEventListener('hashchange', this._boundHashChange);
            this._boundHashChange = null;
        }
    }

    handleHashChange() {
        const oldTransferId = this.transferId;
        this.transferId       = null;
        this.transferInfo     = null;
        this.transparencyData = null;
        this.hashKey          = null;
        this.decryptedText    = null;
        this.decryptedBytes   = null;
        this.fileName         = null;
        this.state            = 'loading';
        this.errorMessage     = null;

        this.parseUrl();
        if (!this.transferId) {
            this.state        = 'error';
            this.errorMessage = this.t('download.error.no_id');
            this.render();
            return;
        }
        this.loadTransferInfo();
    }

    // ─── Shorthand ─────────────────────────────────────────────────────────

    t(key, params) { return I18n.t(key, params); }

    // ─── URL Parsing ──────────────────────────────────────────────────────

    parseUrl() {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const i = hash.indexOf('/');
            if (i > 0) { this.transferId = hash.substring(0, i); this.hashKey = hash.substring(i + 1); }
            else        { this.transferId = hash; }
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
                this.errorMessage = this.t('download.error.not_ready');
            } else {
                this.state = 'ready';
            }
        } catch (e) {
            this.state        = 'error';
            this.errorMessage = this.t('download.error.not_found');
        }
        this.render();
        this.setupEventListeners();

        // Auto-decrypt if key was in URL
        if (this.state === 'ready' && this.hashKey) {
            this.startDownload(this.hashKey);
        }
    }

    isTextContent() {
        if (!this.transferInfo) return false;
        return (this.transferInfo.content_type_hint || '').toLowerCase().startsWith('text/');
    }

    // ─── SGMETA Envelope ────────────────────────────────────────────────

    static SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41, 0x00]; // "SGMETA\0"

    extractMetadata(decryptedBuffer) {
        const bytes = new Uint8Array(decryptedBuffer);
        const magic = SendDownload.SGMETA_MAGIC;

        if (bytes.length < magic.length + 4) return { metadata: null, content: decryptedBuffer };

        for (let i = 0; i < magic.length; i++) {
            if (bytes[i] !== magic[i]) return { metadata: null, content: decryptedBuffer };
        }

        const metaLen = (bytes[magic.length] << 24) | (bytes[magic.length + 1] << 16) |
                        (bytes[magic.length + 2] << 8) | bytes[magic.length + 3];
        const metaStart = magic.length + 4;
        const contentStart = metaStart + metaLen;

        if (contentStart > bytes.length) return { metadata: null, content: decryptedBuffer };

        try {
            const metaStr = new TextDecoder().decode(bytes.slice(metaStart, contentStart));
            const metadata = JSON.parse(metaStr);
            const content = decryptedBuffer.slice(contentStart);
            return { metadata, content };
        } catch (e) {
            return { metadata: null, content: decryptedBuffer };
        }
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
        return `<div class="status status--info">${this.escapeHtml(this.t('download.loading'))}</div>`;
    }

    renderTransferInfo() {
        if (!this.transferInfo || this.state === 'error') return '';
        const typeKey = this.isTextContent() ? 'download.info.encrypted_text' : 'download.info.encrypted_file';
        return `
            <div class="status status--info">
                <strong>${this.escapeHtml(this.t(typeKey))}</strong> — ${this.formatBytes(this.transferInfo.file_size_bytes)}
                <br><small>${this.escapeHtml(this.t('download.info.uploaded', { timestamp: this.formatTimestamp(this.transferInfo.created_at) }))}</small>
                ${this.transferInfo.download_count > 0
                    ? `<br><small>${this.escapeHtml(this.t('download.info.download_count', { count: this.transferInfo.download_count }))}</small>`
                    : ''}
            </div>
        `;
    }

    renderKeyInput() {
        if (this.state !== 'ready') return '';
        const btnKey = this.isTextContent() ? 'download.button.decrypt_view' : 'download.button.decrypt_download';
        return `
            <div style="margin-top: 1rem;">
                <label style="display: block; font-weight: 600; font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${this.escapeHtml(this.t('download.key.label'))}
                </label>
                <input type="text" class="input" id="key-input"
                       placeholder="${this.escapeHtml(this.t('download.key.placeholder'))}"
                       value="${this.hashKey ? this.escapeHtml(this.hashKey) : ''}"
                       autocomplete="off" spellcheck="false">
                <button class="btn btn-primary" id="decrypt-btn" style="margin-top: 0.75rem; width: 100%;">
                    ${this.t(btnKey)}
                </button>
            </div>
        `;
    }

    renderProgress() {
        if (this.state !== 'decrypting') return '';
        return `
            <div style="margin: 1rem 0;">
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${this.escapeHtml(this.t('download.progress.decrypting'))}
                </div>
                <div class="progress-bar"><div class="progress-bar__fill" style="width: 50%;"></div></div>
            </div>
        `;
    }

    renderComplete() {
        if (this.state !== 'complete') return '';

        const sendAnotherHtml = `
            <div style="margin-top: 1.5rem; text-align: center;">
                <a href="${window.location.origin}/send/v0/v0.1/v0.1.3/index.html" class="btn btn-sm" style="color: var(--color-primary); text-decoration: none;">
                    ${this.escapeHtml(this.t('download.result.send_another'))}
                </a>
            </div>
        `;

        if (this.decryptedText !== null) {
            return `
                <div class="status status--success">${this.escapeHtml(this.t('download.result.text_success'))}</div>
                <div style="margin-top: 1rem;">
                    <pre id="decrypted-text" style="background: var(--color-drop-zone-bg); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1rem; white-space: pre-wrap; word-wrap: break-word; font-size: var(--font-size-sm); max-height: 400px; overflow-y: auto;"></pre>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                        <button class="btn btn-primary btn-sm" id="copy-text-btn">${this.escapeHtml(this.t('download.result.copy_text'))}</button>
                        <button class="btn btn-sm" id="download-text-btn">${this.escapeHtml(this.t('download.result.download_file'))}</button>
                    </div>
                </div>
                <send-transparency id="transparency-panel"></send-transparency>
                ${sendAnotherHtml}
            `;
        }

        return `
            <div class="status status--success">${this.escapeHtml(this.t('download.result.file_success'))}</div>
            <send-transparency id="transparency-panel"></send-transparency>
            ${sendAnotherHtml}
        `;
    }

    renderError() {
        if (this.state !== 'error' || !this.errorMessage) return '';
        return `<div class="status status--error">${this.escapeHtml(this.errorMessage)}</div>`;
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
            keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.startDownload(); });
        }

        const copyTextBtn = this.querySelector('#copy-text-btn');
        if (copyTextBtn) {
            copyTextBtn.addEventListener('click', () => {
                if (this.decryptedText !== null) this.copyToClipboard(this.decryptedText, copyTextBtn);
            });
        }

        const downloadTextBtn = this.querySelector('#download-text-btn');
        if (downloadTextBtn) {
            downloadTextBtn.addEventListener('click', () => {
                if (this.decryptedBytes) this.saveFile(this.decryptedBytes, this.fileName || 'download.txt');
            });
        }

        // Set text content using textContent (XSS-safe)
        const preEl = this.querySelector('#decrypted-text');
        if (preEl && this.decryptedText !== null) { preEl.textContent = this.decryptedText; }

        const panel = this.querySelector('#transparency-panel');
        if (panel && this.transparencyData) { panel.setData(this.transparencyData); }
    }

    cleanup() { this._boundDecryptClick = null; }

    // ─── Download Flow ───────────────────────────────────────────────────

    async startDownload(keyOverride) {
        const keyString = keyOverride || (this.querySelector('#key-input') ? this.querySelector('#key-input').value.trim() : '');

        if (!keyString) {
            this.errorMessage = this.t('download.error.no_key');
            this.state = 'error'; this.render(); this.setupEventListeners(); return;
        }

        if (!SendCrypto.isAvailable()) {
            this.errorMessage = this.t('crypto.error.unavailable');
            this.state = 'error'; this.render(); this.setupEventListeners(); return;
        }

        try {
            this.state = 'decrypting'; this.render();

            const key       = await SendCrypto.importKey(keyString);
            const encrypted = await ApiClient.downloadPayload(this.transferId);
            const decrypted = await SendCrypto.decryptFile(key, encrypted);

            // Check for SGMETA envelope (contains filename and other metadata)
            const { metadata, content } = this.extractMetadata(decrypted);
            if (metadata && metadata.filename) {
                this.fileName = metadata.filename;
            }

            this.decryptedBytes = content;

            if (this.isTextContent()) {
                this.decryptedText = new TextDecoder().decode(content);
            } else {
                this.saveFile(content, this.fileName || 'download');
            }

            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            // Save to localStorage history
            this.saveToHistory(content);

            this.transparencyData = {
                download_timestamp: new Date().toISOString(),
                file_size_bytes:    this.transferInfo.file_size_bytes,
                not_stored:         ['file_name', 'file_content', 'decryption_key']
            };
            this.state = 'complete'; this.render(); this.setupEventListeners();

            this.dispatchEvent(new CustomEvent('download-complete', {
                detail: { transferId: this.transferId }, bubbles: true
            }));

        } catch (err) {
            this.errorMessage = err.message || this.t('download.error.failed');
            this.state = 'ready'; this.render(); this.setupEventListeners();
            const nki = this.querySelector('#key-input');
            if (nki) nki.value = keyOverride || keyString;
        }
    }

    // ─── LocalStorage History ────────────────────────────────────────────

    static HISTORY_KEY = 'sgraph-send-history';
    static MAX_HISTORY = 20;
    static MAX_TEXT_STORE = 50000; // ~50KB per text entry

    saveToHistory(content) {
        try {
            const history = this.getHistory();
            const isText = this.isTextContent();
            const entry = {
                transferId: this.transferId,
                type:       isText ? 'text' : 'file',
                timestamp:  new Date().toISOString(),
                size:       content.byteLength,
                fileName:   this.fileName || null,
                contentType: this.transferInfo.content_type_hint || null,
            };

            // Store text content if small enough
            if (isText && content.byteLength <= SendDownload.MAX_TEXT_STORE) {
                entry.text = new TextDecoder().decode(content);
            }

            // Remove duplicate transfer IDs
            const filtered = history.filter(h => h.transferId !== this.transferId);
            filtered.unshift(entry);

            // Trim to max
            const trimmed = filtered.slice(0, SendDownload.MAX_HISTORY);
            localStorage.setItem(SendDownload.HISTORY_KEY, JSON.stringify(trimmed));
        } catch (e) { /* localStorage full or unavailable */ }
    }

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(SendDownload.HISTORY_KEY) || '[]');
        } catch (e) { return []; }
    }

    clearHistory() {
        localStorage.removeItem(SendDownload.HISTORY_KEY);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    saveFile(data, filename) {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || 'download';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async copyToClipboard(text, button) {
        try { await navigator.clipboard.writeText(text); }
        catch (e) {
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

    formatTimestamp(ts) { try { return new Date(ts).toUTCString(); } catch (e) { return ts; } }
    escapeHtml(str)     { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
}

customElements.define('send-download', SendDownload);
