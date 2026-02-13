/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Web Component
   v0.1.3 — i18n integration

   Changes from v0.1.2:
   - All user-facing strings use I18n.t() instead of hardcoded English
   - Listens for 'locale-changed' event and re-renders (when not mid-flow)

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
    }

    disconnectedCallback() {
        this.cleanup();
        document.removeEventListener('locale-changed', this._localeHandler);
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
    }

    isTextContent() {
        if (!this.transferInfo) return false;
        return (this.transferInfo.content_type_hint || '').toLowerCase().startsWith('text/');
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
            `;
        }

        return `
            <div class="status status--success">${this.escapeHtml(this.t('download.result.file_success'))}</div>
            <send-transparency id="transparency-panel"></send-transparency>
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
            downloadTextBtn.addEventListener('click', () => { if (this.decryptedBytes) this.saveFile(this.decryptedBytes); });
        }

        // Set text content using textContent (XSS-safe)
        const preEl = this.querySelector('#decrypted-text');
        if (preEl && this.decryptedText !== null) { preEl.textContent = this.decryptedText; }

        const panel = this.querySelector('#transparency-panel');
        if (panel && this.transparencyData) { panel.setData(this.transparencyData); }
    }

    cleanup() { this._boundDecryptClick = null; }

    // ─── Download Flow ───────────────────────────────────────────────────

    async startDownload() {
        const keyInput  = this.querySelector('#key-input');
        const keyString = keyInput ? keyInput.value.trim() : '';

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

            this.decryptedBytes = decrypted;

            if (this.isTextContent()) {
                this.decryptedText = new TextDecoder().decode(decrypted);
            } else {
                this.saveFile(decrypted);
            }

            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

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
            if (nki) nki.value = keyString;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    saveFile(data) {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'download';
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
