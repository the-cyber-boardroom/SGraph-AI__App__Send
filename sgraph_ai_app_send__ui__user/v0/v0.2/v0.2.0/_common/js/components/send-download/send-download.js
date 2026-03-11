/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Component
   v0.2.0 — Consolidated from v0.1.0 → v0.1.8 (7 IFD layers merged)

   Merged layers:
     v0.1.0  — Base download (query-param URL, key input, decrypt, save)
     v0.1.1  — Hash-fragment URLs (#transferId/key), auto-populate key
     v0.1.2  — Text display mode (inline <pre>, copy, download as file)
     v0.1.4  — i18n, SGMETA envelope, token validation, presigned download,
               auto-decrypt when key in URL, download history, beforeunload
     v0.1.5  — Workflow timing capture
     v0.1.6  — Dark-theme-aware renderComplete with design tokens
     v0.1.8  — Two-column preview layout (markdown, image, PDF, code),
               resizable divider, "Save Locally" button, no auto-download
               for previewable content

   Design: Each render method is overridable. v0.2.1+ can surgically override
   individual methods (e.g. just renderComplete) without touching the rest.

   Usage:  <send-download></send-download>
   Emits:  'download-complete' — { detail: { transferId } }
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendDownload extends HTMLElement {

    constructor() {
        super();
        this.transferId       = null;
        this.transferInfo     = null;
        this.transparencyData = null;
        this.hashKey          = null;
        this.tokenName        = null;
        this.decryptedText    = null;
        this.decryptedBytes   = null;
        this.fileName         = null;
        this.tokenRemaining   = undefined;
        this.state            = 'loading';
        this.errorMessage     = null;
        this._boundDecryptClick = null;
        this._stageTimestamps = {};
        this._renderType      = null;
        this._objectUrl       = null;
        this._showRaw         = false;
        this._zipInstance     = null;
        this._zipTree         = null;
        this._zipOrigBytes    = null;
        this._zipOrigName     = null;
        this._currentEntryBytes    = null;
        this._currentEntryFilename = null;
        this._selectedZipPath      = null;
        this._isMaximised     = false;
        this._escapeHandler   = null;
        this._keyNavHandler   = null;
        this._localeHandler   = () => { if (this.state === 'ready' || this.state === 'complete') { this.render(); this.setupEventListeners(); } };
    }

    connectedCallback() {
        this.parseUrl();
        if (!this.transferId) {
            this.state = 'error';
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
        if (this._boundHashChange) { window.removeEventListener('hashchange', this._boundHashChange); this._boundHashChange = null; }
    }

    // ─── Shorthand ───────────────────────────────────────────────────────

    t(key, params) { return I18n.t(key, params); }
    escapeHtml(str) { return SendHelpers.escapeHtml(str); }
    formatBytes(bytes) { return SendHelpers.formatBytes(bytes); }
    formatTimestamp(ts) { return SendHelpers.formatTimestamp(ts); }

    // ─── URL Parsing ─────────────────────────────────────────────────────

    parseUrl() {
        const params = new URLSearchParams(window.location.search);
        this.tokenName = params.get('token') || null;

        const hash = window.location.hash.substring(1);
        if (hash) {
            const i = hash.indexOf('/');
            if (i > 0) { this.transferId = hash.substring(0, i); this.hashKey = hash.substring(i + 1); }
            else        { this.transferId = hash; }
            return;
        }
        this.transferId = params.get('id') || null;
    }

    handleHashChange() {
        this.transferId = null; this.transferInfo = null; this.transparencyData = null;
        this.hashKey = null; this.tokenName = null; this.decryptedText = null;
        this.decryptedBytes = null; this.fileName = null; this.tokenRemaining = undefined;
        this.state = 'loading'; this.errorMessage = null;
        this._renderType = null; this._objectUrl = null; this._showRaw = false;
        this._stageTimestamps = {};

        this.parseUrl();
        if (!this.transferId) {
            this.state = 'error'; this.errorMessage = this.t('download.error.no_id'); this.render(); return;
        }
        this.loadTransferInfo();
    }

    // ─── Data Loading ────────────────────────────────────────────────────

    async loadTransferInfo() {
        try {
            if (this.tokenName) {
                try {
                    const tokenResult = await ApiClient.validateToken(this.tokenName);
                    if (tokenResult.remaining !== undefined) this.tokenRemaining = tokenResult.remaining;
                    if (!tokenResult.success) {
                        this.state = 'error'; this.errorMessage = this.getTokenErrorMessage(tokenResult.reason);
                        this.render(); return;
                    }
                } catch (e) { /* token validation unavailable — allow through */ }
            }

            this.transferInfo = await ApiClient.getTransferInfo(this.transferId);
            if (this.transferInfo.status !== 'completed') {
                this.state = 'error'; this.errorMessage = this.t('download.error.not_ready');
            } else {
                this.state = 'ready';
            }
        } catch (e) {
            this.state = 'error'; this.errorMessage = this.t('download.error.not_found');
        }
        this.render(); this.setupEventListeners();

        if (this.state === 'ready' && this.hashKey) this.startDownload(this.hashKey);
    }

    getTokenErrorMessage(reason) {
        const messages = {
            'not_found': this.t('download.error.token_not_found'),
            'exhausted': this.t('download.error.token_exhausted'),
            'revoked':   this.t('download.error.token_revoked'),
        };
        return messages[reason] || this.t('download.error.token_not_found');
    }

    isTextContent() {
        if (!this.transferInfo) return false;
        return (this.transferInfo.content_type_hint || '').toLowerCase().startsWith('text/');
    }

    // ─── SGMETA Envelope ─────────────────────────────────────────────────

    static SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41, 0x00];

    extractMetadata(decryptedBuffer) {
        const bytes = new Uint8Array(decryptedBuffer);
        const magic = SendDownload.SGMETA_MAGIC;
        if (bytes.length < magic.length + 4) return { metadata: null, content: decryptedBuffer };
        for (let i = 0; i < magic.length; i++) {
            if (bytes[i] !== magic[i]) return { metadata: null, content: decryptedBuffer };
        }
        const metaLen = (bytes[magic.length] << 24) | (bytes[magic.length + 1] << 16) | (bytes[magic.length + 2] << 8) | bytes[magic.length + 3];
        const metaStart = magic.length + 4;
        const contentStart = metaStart + metaLen;
        if (contentStart > bytes.length) return { metadata: null, content: decryptedBuffer };
        try {
            const metaStr = new TextDecoder().decode(bytes.slice(metaStart, contentStart));
            const metadata = JSON.parse(metaStr);
            return { metadata, content: decryptedBuffer.slice(contentStart) };
        } catch (e) { return { metadata: null, content: decryptedBuffer }; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Rendering
    // ═══════════════════════════════════════════════════════════════════════

    render() {
        this._stageTimestamps[this.state] = Date.now();

        const isPreview = this.state === 'complete' && (this._zipTree || (this._renderType && this._renderType !== 'text'));
        const main = this.closest('main');
        if (main) {
            if (isPreview) {
                main.style.maxWidth = 'calc(100vw - 2rem)'; main.style.width = '100%';
                main.classList.add('preview-expanded');
            } else {
                main.style.maxWidth = ''; main.style.width = '';
                main.classList.remove('preview-expanded');
            }
        }

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

        // Fill available viewport height for preview
        const sizable = this.querySelector('#preview-split') || this.querySelector('#preview-panel');
        if (sizable && isPreview) {
            requestAnimationFrame(() => {
                const rect = sizable.getBoundingClientRect();
                const available = window.innerHeight - rect.top - 16;
                sizable.style.height = Math.max(available, 300) + 'px';
            });
        }
    }

    renderLoading() {
        if (this.state !== 'loading') return '';
        return `<div class="status status--info">${this.escapeHtml(this.t('download.loading'))}</div>`;
    }

    renderTransferInfo() {
        if (!this.transferInfo || this.state === 'error') return '';
        // Hide in preview mode — details panel shows the same info
        if (this.state === 'complete' && this._renderType && this._renderType !== 'text') return '';

        const typeKey = this.isTextContent() ? 'download.info.encrypted_text' : 'download.info.encrypted_file';
        return `
            <div class="status status--info">
                <strong>${this.escapeHtml(this.t(typeKey))}</strong> — ${this.formatBytes(this.transferInfo.file_size_bytes)}
                <br><small>${this.escapeHtml(this.t('download.info.uploaded', { timestamp: this.formatTimestamp(this.transferInfo.created_at) }))}</small>
                ${this.transferInfo.download_count > 0
                    ? `<br><small>${this.escapeHtml(this.t('download.info.download_count', { count: this.transferInfo.download_count }))}</small>`
                    : ''}
                ${this.tokenRemaining !== undefined
                    ? `<br><small>${this.escapeHtml(this.t('download.token.uses_remaining', { remaining: this.tokenRemaining }))}</small>`
                    : ''}
            </div>
        `;
    }

    renderKeyInput() {
        if (this.state !== 'ready') return '';
        const btnKey = this.isTextContent() ? 'download.button.decrypt_view' : 'download.button.decrypt_download';
        return `
            <div style="margin-top: 1rem;">
                <label style="display: block; font-weight: 600; font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
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
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${this.escapeHtml(this.t('download.progress.decrypting'))}
                </div>
                <div class="progress-bar"><div class="progress-bar__fill" style="width: 50%;"></div></div>
            </div>
        `;
    }

    renderComplete() {
        if (this.state !== 'complete') return '';

        const sendAnotherHtml = `
            <div style="margin-top: var(--space-6); text-align: center;">
                <a href="${window.location.origin}/${I18n.locale}/" class="btn btn-sm" style="color: var(--accent); text-decoration: none;">
                    ${this.escapeHtml(this.t('download.result.send_another'))}
                </a>
            </div>
        `;
        const timingHtml = this._renderTimings();

        // Route to zip viewer for zip archives
        if (this._renderType === 'zip' && this._zipTree) {
            return this._renderZipLayout(timingHtml, sendAnotherHtml);
        }

        // Route to two-column preview for previewable types
        if (this._renderType && this._renderType !== 'text') {
            return this._renderTwoColumnLayout(timingHtml, sendAnotherHtml);
        }

        // Text display
        if (this.decryptedText !== null) {
            return `
                <div class="status status--success" style="font-size: var(--text-sm); padding: 0.5rem 0.75rem;">
                    ${this.escapeHtml(this.t('download.result.text_success'))}
                </div>
                <div style="margin-top: var(--space-4);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3);">
                        <h3 style="margin: 0; font-size: var(--text-h3); font-weight: var(--weight-bold); color: var(--color-text);">
                            ${this.escapeHtml(this.t('download.result.decrypted_message'))}
                        </h3>
                        <button class="btn btn-primary btn-sm" id="copy-text-btn">
                            ${this.escapeHtml(this.t('download.result.copy_text'))}
                        </button>
                    </div>
                    <pre id="decrypted-text" style="background: var(--accent-subtle); border: 2px solid var(--accent); border-radius: var(--radius-md); padding: var(--space-6); white-space: pre-wrap; word-wrap: break-word; font-size: var(--text-body); line-height: 1.6; max-height: 400px; overflow-y: auto; min-height: 60px; margin: 0; color: var(--color-text);"></pre>
                    <div style="text-align: right; margin-top: var(--space-2);">
                        <button class="btn btn-sm btn-secondary" id="download-text-btn">
                            ${this.escapeHtml(this.t('download.result.download_file'))}
                        </button>
                    </div>
                </div>
                <send-transparency id="transparency-panel"></send-transparency>
                ${timingHtml}
                ${sendAnotherHtml}
            `;
        }

        // Non-previewable file (already auto-downloaded)
        return `
            <div class="status status--success">${this.escapeHtml(this.t('download.result.file_success'))}</div>
            <send-transparency id="transparency-panel"></send-transparency>
            ${timingHtml}
            ${sendAnotherHtml}
        `;
    }

    renderError() {
        if (this.state !== 'error' || !this.errorMessage) return '';
        return `<div class="status status--error">${this.escapeHtml(this.errorMessage)}</div>`;
    }

    // ─── Timing Display ──────────────────────────────────────────────────

    _renderTimings() {
        if (!this._stageTimestamps || !this._stageTimestamps.decrypting || !this._stageTimestamps.complete) return '';
        const totalMs = this._stageTimestamps.complete - this._stageTimestamps.decrypting;
        return `
            <div style="margin-top: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--accent-subtle); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: var(--text-small);">
                <span style="color: var(--accent); font-weight: var(--weight-semibold);">
                    ${this.t('download.timing.title')} ${(totalMs / 1000).toFixed(2)}s
                </span>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Two-Column Preview Layout (from v0.1.8)
    // ═══════════════════════════════════════════════════════════════════════

    _renderTwoColumnLayout(timingHtml, sendAnotherHtml) {
        const filename = this.fileName || 'download';
        const type     = this._renderType;
        const badgeLabel = (type === 'code' && typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getLanguage(filename) : type;
        const sizeStr    = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
        const uploadDate = this.transferInfo ? this.formatTimestamp(this.transferInfo.created_at) : '';
        const downloads  = this.transferInfo ? (this.transferInfo.download_count || 0) : 0;
        const rawToggle  = (type === 'markdown' || type === 'code')
            ? `<button class="btn btn-sm btn-secondary" id="toggle-raw-btn" style="width: 100%; font-size: var(--text-sm);">${this.escapeHtml(this._showRaw ? this.t('download.preview.view_rendered') : this.t('download.preview.view_raw'))}</button>` : '';
        const printBtn = '';

        let contentHtml = '';
        switch (type) {
            case 'markdown': contentHtml = this._renderMarkdownContent(); break;
            case 'image':    contentHtml = this._renderImageContent();    break;
            case 'pdf':      contentHtml = this._renderPdfContent();      break;
            case 'code':     contentHtml = this._renderCodeContent();     break;
            case 'audio':    contentHtml = this._renderAudioContent();    break;
            case 'video':    contentHtml = this._renderVideoContent();    break;
            default:         contentHtml = this._renderRawContent();
        }

        const savedWidth = this._loadSplitWidth();

        return `
            <div class="status status--success" style="font-size: var(--text-sm); padding: 0.5rem 0.75rem; margin-bottom: var(--space-4);">
                ${this.escapeHtml(this.t('download.result.file_success'))}
            </div>
            <div id="preview-split" style="display: grid; grid-template-columns: ${savedWidth}px 4px 1fr; gap: 0; min-height: 300px;">
                <div id="details-panel" style="overflow-y: auto; padding-right: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3);">
                    <div>
                        <h3 style="margin: 0 0 var(--space-2) 0; font-size: var(--text-h3); font-weight: var(--weight-bold); color: var(--color-text); word-break: break-all;">${this.escapeHtml(filename)}</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3);">
                            <span style="font-size: var(--text-small); color: var(--accent); font-family: var(--font-mono); background: var(--accent-subtle); padding: 2px 8px; border-radius: var(--radius-sm);">${this.escapeHtml(badgeLabel)}</span>
                            <span style="font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono);">${this.escapeHtml(sizeStr)}</span>
                        </div>
                        <div style="font-size: var(--text-sm); color: var(--color-text-secondary); display: flex; flex-direction: column; gap: var(--space-1);">
                            <div>${this.escapeHtml(this.t('download.info.uploaded_label'))}: ${this.escapeHtml(uploadDate)}</div>
                            ${downloads > 0 ? `<div>${this.escapeHtml(this.t('download.info.downloads_label'))}: ${downloads}</div>` : ''}
                        </div>
                    </div>
                    <button class="btn btn-primary" id="save-file-btn" style="width: 100%; padding: var(--space-4) var(--space-6); font-size: var(--text-body); font-weight: var(--weight-bold); border-radius: var(--radius-md); letter-spacing: 0.02em;">${this.escapeHtml(this.t('download.preview.save_locally'))}</button>
                    <div style="display: flex; gap: var(--space-2);"><button class="btn btn-sm btn-secondary" id="copy-content-btn" style="flex: 1;">${this.escapeHtml(this.t('common.copy'))}</button>${printBtn}</div>
                    ${rawToggle}
                    <send-transparency id="transparency-panel"></send-transparency>
                    ${timingHtml}
                    ${sendAnotherHtml}
                </div>
                <div id="split-resize" style="cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 10; border-radius: 2px;"></div>
                <div id="preview-panel" style="overflow: auto; border: 2px solid var(--accent); border-radius: var(--radius-md); background: var(--bg-secondary);">
                    ${contentHtml}
                </div>
            </div>
        `;
    }

    // ─── Content Renderers ───────────────────────────────────────────────

    _renderMarkdownContent() {
        if (this._showRaw) return this._renderRawContent();
        const rawText  = new TextDecoder().decode(this.decryptedBytes);
        const safeHtml = (typeof MarkdownParser !== 'undefined') ? MarkdownParser.parse(rawText) : this.escapeHtml(rawText);
        const iframeDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{font-family:'DM Sans',system-ui,sans-serif;font-size:1rem;line-height:1.7;color:#1a1a1a;background:#FAFAFA;margin:0;padding:1.25rem;word-wrap:break-word}h1,h2,h3,h4,h5,h6{color:#111;margin:1.5em 0 .5em;line-height:1.3}h1{font-size:1.6rem;border-bottom:1px solid rgba(0,0,0,.1);padding-bottom:.3em}h2{font-size:1.35rem}h3{font-size:1.15rem}p{margin:.8em 0}a{color:#0066cc;text-decoration:none}a:hover{text-decoration:underline}code{font-family:'JetBrains Mono',monospace;font-size:.88em;background:rgba(0,0,0,.05);padding:.15em .4em;border-radius:4px;color:#d63384}pre{background:#f5f5f5;border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:1em;overflow-x:auto;margin:1em 0}pre code{background:none;padding:0;color:#333;font-size:.85em}blockquote{border-left:3px solid #6c757d;margin:1em 0;padding:.5em 1em;background:rgba(0,0,0,.03);color:#555}ul,ol{padding-left:1.5em;margin:.8em 0}li{margin:.3em 0}hr{border:none;border-top:1px solid rgba(0,0,0,.1);margin:1.5em 0}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid rgba(0,0,0,.1);padding:.5em .75em;text-align:left}th{background:rgba(0,0,0,.04);font-weight:600;color:#111}del{color:#999}strong{color:#111}</style></head><body>${safeHtml}</body></html>`;
        const blob = new Blob([iframeDoc], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        return `<iframe id="md-iframe" sandbox="allow-same-origin" style="width:100%;height:100%;border:none;background:#FAFAFA;display:block;" src="${blobUrl}" title="Rendered markdown"></iframe>`;
    }

    _renderImageContent() {
        const filename = this.fileName || 'image';
        const isSvg = (typeof FileTypeDetect !== 'undefined') && FileTypeDetect.isSvg(filename);
        if (isSvg) {
            const svgText = new TextDecoder().decode(this.decryptedBytes);
            const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1E2A4A;}</style></head><body>${this.escapeHtml(svgText)}</body></html>`;
            const enc = btoa(unescape(encodeURIComponent(doc)));
            return `<iframe id="svg-iframe" sandbox="" style="width:100%;height:100%;border:none;background:#1E2A4A;display:block;" src="data:text/html;base64,${enc}" title="SVG image"></iframe>`;
        }
        const mime = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getImageMime(filename) : 'application/octet-stream';
        const blob = new Blob([this.decryptedBytes], { type: mime });
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:var(--space-4);"><img id="preview-image" src="${this._objectUrl}" alt="${this.escapeHtml(filename)}" style="max-width:100%;max-height:100%;border-radius:var(--radius-sm);object-fit:contain;"></div>`;
    }

    _renderPdfContent() {
        const blob = new Blob([this.decryptedBytes], { type: 'application/pdf' });
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);
        return `<iframe id="pdf-viewer" src="${this._objectUrl}" style="width:100%;height:100%;border:none;background:#fff;display:block;" title="PDF document"></iframe>`;
    }

    _renderCodeContent() {
        if (this._showRaw) return this._renderRawContent();
        const rawText = new TextDecoder().decode(this.decryptedBytes);
        const lang = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getLanguage(this.fileName) : 'text';
        const highlighted = this._highlightCode(rawText, lang);
        const lineCount = rawText.split('\n').length;
        const lineNums = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
        return `<div style="height:100%;overflow:auto;font-family:var(--font-mono);font-size:0.85rem;line-height:1.6;display:flex;"><pre style="margin:0;padding:1em .75em;text-align:right;color:var(--color-text-secondary);user-select:none;border-right:1px solid var(--color-border);background:rgba(0,0,0,.1);min-width:3em;position:sticky;left:0;">${lineNums}</pre><pre style="margin:0;padding:1em;flex:1;overflow-x:auto;color:var(--color-text);">${highlighted}</pre></div>`;
    }

    _renderRawContent() {
        const rawText = new TextDecoder().decode(this.decryptedBytes);
        return `<pre style="height:100%;overflow:auto;margin:0;padding:var(--space-6);white-space:pre-wrap;word-wrap:break-word;font-family:var(--font-mono);font-size:0.85rem;line-height:1.6;color:var(--color-text);">${this.escapeHtml(rawText)}</pre>`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Zip Content Viewer
    // ═══════════════════════════════════════════════════════════════════════

    async _parseZip(bytes) {
        const zip  = await JSZip.loadAsync(bytes);
        const tree = [];
        zip.forEach((relativePath, zipEntry) => {
            const parts = relativePath.split('/').filter(Boolean);
            tree.push({
                path  : relativePath,
                name  : parts[parts.length - 1] || relativePath,
                dir   : zipEntry.dir,
                size  : zipEntry._data ? zipEntry._data.uncompressedSize : 0,
                entry : zipEntry
            });
        });
        // Sort: folders first, then files, alphabetical within each
        tree.sort((a, b) => {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.path.localeCompare(b.path);
        });
        return { zip, tree };
    }

    _renderZipLayout(timingHtml, sendAnotherHtml) {
        const zipName    = this._zipOrigName || 'archive.zip';
        const sizeStr    = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
        const allFiles   = this._zipTree.filter(e => !e.dir);
        const allFolders = this._zipTree.filter(e => e.dir);
        const summary    = this.t('download.zip.summary', { files: allFiles.length, folders: allFolders.length });

        // Build folder structure for the browser
        const folderStructure = this._buildFolderStructure();
        const currentFolder   = this._selectedZipFolder || '';
        const folderTreeHtml  = this._renderFolderTree(folderStructure, currentFolder);
        const fileListHtml    = this._renderFileList(currentFolder);
        const previewHtml     = this._renderZipPreview();
        const savedWidth      = this._loadSplitWidth();

        // Save-entry button (only when a file is selected)
        const saveEntryHtml = this._currentEntryBytes
            ? `<button class="btn btn-sm btn-secondary" id="save-entry-btn" style="width: 100%; margin-top: var(--space-2);">${this.escapeHtml(this.t('download.zip.save_file'))}: ${this.escapeHtml(this._currentEntryFilename || '')}</button>`
            : '';

        // Progress indicator
        const selectedIndex = this._selectedZipPath
            ? allFiles.findIndex(f => f.path === this._selectedZipPath) + 1
            : 0;
        const progressHtml = selectedIndex > 0
            ? `<div class="zip-progress">${selectedIndex} of ${allFiles.length} files</div>`
            : '';

        // Breadcrumb trail
        const breadcrumbHtml = this._renderBreadcrumb(currentFolder);

        // First-load hint
        const hintShown = (() => { try { return localStorage.getItem('sgraph-zip-hint-shown'); } catch(_) { return null; } })();
        const hintHtml = !hintShown
            ? `<div class="zip-hint" id="zip-hint">Click any file to preview it. Use the folder tree to navigate. <button class="zip-hint__dismiss" id="zip-hint-dismiss">&times;</button></div>`
            : '';

        return `
            <div class="status status--success" style="font-size: var(--text-sm); padding: 0.5rem 0.75rem; margin-bottom: var(--space-3);">
                ${this.escapeHtml(this.t('download.result.file_success'))}
            </div>

            <div class="zip-header zip-header--sticky">
                <div class="zip-header__info">
                    <span class="zip-header__folder-icon">&#128193;</span>
                    <h3 class="zip-header__name">${this.escapeHtml(zipName)}</h3>
                    <span class="zip-header__badge">zip</span>
                    <span class="zip-header__size">${this.escapeHtml(sizeStr)}</span>
                    <span class="zip-header__summary">${this.escapeHtml(summary)}</span>
                </div>
                <div class="zip-header__actions">
                    <button class="btn btn-sm btn-secondary" id="zip-info-btn" title="Transfer details">&#9432;</button>
                    <button class="btn btn-primary btn-sm" id="save-file-btn">${this.escapeHtml(this.t('download.zip.save_all'))}</button>
                </div>
            </div>

            ${hintHtml}

            <div id="preview-split" style="display: grid; grid-template-columns: ${savedWidth}px 4px 1fr; gap: 0; min-height: calc(100vh - 180px);">
                <div id="details-panel" class="zip-left-rail">
                    <div class="zip-left-rail__folders" id="zip-folder-tree">
                        ${folderTreeHtml}
                    </div>
                    <div class="zip-left-rail__divider"></div>
                    <div class="zip-left-rail__files" id="zip-file-list">
                        ${breadcrumbHtml}
                        ${fileListHtml}
                    </div>
                    ${progressHtml}
                    ${saveEntryHtml}
                </div>
                <div id="split-resize" style="cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 10; border-radius: 2px;"></div>
                <div id="preview-panel" class="zip-preview zip-preview--split">
                    <button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>
                    ${previewHtml}
                </div>
            </div>

            <div id="zip-info-panel" class="zip-info-panel" style="display: none;">
                <send-transparency id="transparency-panel"></send-transparency>
                ${timingHtml}
            </div>

            ${sendAnotherHtml}
        `;
    }

    _buildFolderStructure() {
        const root = { name: '/', path: '', children: [] };
        const folderMap = { '': root };

        for (const item of this._zipTree) {
            const parts = item.path.replace(/\/$/, '').split('/');
            for (let i = 0; i < (item.dir ? parts.length : parts.length - 1); i++) {
                const folderPath = parts.slice(0, i + 1).join('/') + '/';
                if (!folderMap[folderPath]) {
                    const parentPath = i > 0 ? parts.slice(0, i).join('/') + '/' : '';
                    const node = { name: parts[i], path: folderPath, children: [] };
                    folderMap[folderPath] = node;
                    if (folderMap[parentPath]) folderMap[parentPath].children.push(node);
                }
            }
        }
        return root;
    }

    _renderFolderTree(node, selectedFolder) {
        const isSelected = node.path === selectedFolder;
        const cls = `zip-folder-item${isSelected ? ' zip-folder-item--selected' : ''}`;
        let html = `<div class="${cls}" data-folder="${this.escapeHtml(node.path)}">${this.escapeHtml(node.name)}</div>`;

        if (node.children.length > 0) {
            const sorted = [...node.children].sort((a, b) => a.name.localeCompare(b.name));
            html += '<div class="zip-folder-nested">';
            for (const child of sorted) {
                html += this._renderFolderTree(child, selectedFolder);
            }
            html += '</div>';
        }
        return html;
    }

    _renderFileList(folderPath) {
        const files = this._zipTree.filter(e => {
            if (e.dir) return false;
            const parts = e.path.split('/');
            const fileFolder = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
            return fileFolder === folderPath;
        });

        if (files.length === 0) {
            return `<div class="zip-file-list__empty">${this.escapeHtml(this.t('download.zip.no_files'))}</div>`;
        }

        files.sort((a, b) => a.name.localeCompare(b.name));
        return files.map(file => {
            const isSelected = this._selectedZipPath === file.path;
            const type = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.detect(file.name, null) : null;
            const typeIcon = this._fileTypeIcon(type);
            return `<div class="zip-file-item${isSelected ? ' zip-file-item--selected' : ''}" data-path="${this.escapeHtml(file.path)}">
                <span class="zip-file-item__icon">${typeIcon}</span>
                <span class="zip-file-item__name">${this.escapeHtml(file.name)}</span>
                <span class="zip-file-item__size">${this.formatBytes(file.size)}</span>
            </div>`;
        }).join('');
    }

    _fileTypeIcon(type) {
        const icons = {
            audio:    '<svg class="zip-icon zip-icon--audio" viewBox="0 0 16 16"><path d="M8 1v10.07A3 3 0 1 0 10 14V5h3V1H8z"/></svg>',
            video:    '<svg class="zip-icon zip-icon--video" viewBox="0 0 16 16"><path d="M1 3h10v10H1V3zm11 2l3-2v10l-3-2V5z"/></svg>',
            image:    '<svg class="zip-icon zip-icon--image" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="6" r="1.5"/><path d="M1 12l4-4 2 2 3-3 5 5H1z"/></svg>',
            pdf:      '<svg class="zip-icon zip-icon--pdf" viewBox="0 0 16 16"><path d="M4 1h6l4 4v10H4V1z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1v4h4"/><text x="8" y="12" font-size="5" font-weight="bold" fill="currentColor" text-anchor="middle">P</text></svg>',
            markdown: '<svg class="zip-icon zip-icon--markdown" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V5l2.5 3L8 5v6m3-6v4l2-2m0 0l-2-2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
            code:     '<svg class="zip-icon zip-icon--code" viewBox="0 0 16 16"><path d="M5 4L1 8l4 4M11 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
        };
        return icons[type] || '<svg class="zip-icon" viewBox="0 0 16 16"><path d="M4 1h6l4 4v10H4V1z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1v4h4"/></svg>';
    }

    _renderBreadcrumb(folderPath) {
        if (!folderPath) return '';
        const parts = folderPath.replace(/\/$/, '').split('/');
        let html = '<div class="zip-breadcrumb">';
        html += `<span class="zip-breadcrumb__item" data-folder="">/</span>`;
        let accumulated = '';
        for (const part of parts) {
            accumulated += part + '/';
            html += ` <span class="zip-breadcrumb__sep">&rsaquo;</span> `;
            html += `<span class="zip-breadcrumb__item" data-folder="${this.escapeHtml(accumulated)}">${this.escapeHtml(part)}</span>`;
        }
        html += '</div>';
        return html;
    }

    _toggleMaximise() {
        const split    = this.querySelector('#preview-split');
        const leftRail = this.querySelector('#details-panel');
        const divider  = this.querySelector('#split-resize');

        if (!split) return;

        this._isMaximised = !this._isMaximised;

        if (this._isMaximised) {
            this._savedGridColumns = split.style.gridTemplateColumns;
            split.style.gridTemplateColumns = '0px 0px 1fr';
            if (leftRail) leftRail.style.display = 'none';
            if (divider)  divider.style.display  = 'none';
        } else {
            split.style.gridTemplateColumns = this._savedGridColumns || `${this._loadSplitWidth()}px 4px 1fr`;
            if (leftRail) leftRail.style.display = '';
            if (divider)  divider.style.display  = '';
        }

        const btn = this.querySelector('#maximise-btn');
        if (btn) btn.textContent = this._isMaximised ? '\u2716' : '\u26F6';
    }

    _enterFullscreen() {
        const panel = this.querySelector('#preview-panel');
        if (panel && panel.requestFullscreen) {
            panel.requestFullscreen();
        }
    }

    _renderZipPreview() {
        if (!this._currentEntryBytes) {
            return `<div class="zip-preview__empty">${this.escapeHtml(this.t('download.zip.select_file'))}</div>`;
        }
        const entryType = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.detect(this._currentEntryFilename, null) : null;
        const savedBytes = this.decryptedBytes;
        const savedName  = this.fileName;
        this.decryptedBytes = this._currentEntryBytes;
        this.fileName       = this._currentEntryFilename;

        let html;
        if (entryType === 'pdf')           html = this._renderPdfContent();
        else if (entryType === 'image')    html = this._renderImageContent();
        else if (entryType === 'markdown') html = this._renderMarkdownContent();
        else if (entryType === 'code')     html = this._renderCodeContent();
        else if (entryType === 'audio')    html = this._renderAudioContent();
        else if (entryType === 'video')    html = this._renderVideoContent();
        else {
            try {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(this._currentEntryBytes);
                html = `<pre style="height:100%;overflow:auto;margin:0;padding:var(--space-6);white-space:pre-wrap;word-wrap:break-word;font-family:var(--font-mono);font-size:0.85rem;line-height:1.6;color:var(--color-text);">${this.escapeHtml(text)}</pre>`;
            } catch (e) {
                html = `<div class="zip-preview__empty">${this.escapeHtml(this.t('download.zip.no_preview'))}</div>`;
            }
        }
        this.decryptedBytes = savedBytes;
        this.fileName       = savedName;
        return html;
    }

    _renderAudioContent() {
        const filename = this.fileName || 'audio';
        const mime = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getAudioMime(filename) : 'audio/mpeg';
        const blob = new Blob([this.decryptedBytes], { type: mime });
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:var(--space-4);padding:var(--space-6);">
            <div style="font-size:var(--text-sm);color:var(--color-text);font-weight:var(--weight-semibold);word-break:break-all;text-align:center;">${this.escapeHtml(filename)}</div>
            <audio controls preload="auto" style="width:100%;max-width:500px;" src="${this._objectUrl}"></audio>
        </div>`;
    }

    _renderVideoContent() {
        const filename = this.fileName || 'video';
        const mime = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getVideoMime(filename) : 'video/mp4';
        const blob = new Blob([this.decryptedBytes], { type: mime });
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:var(--space-4);">
            <video controls preload="auto" style="max-width:100%;max-height:100%;border-radius:var(--radius-sm);" src="${this._objectUrl}"></video>
        </div>`;
    }

    async _previewZipEntry(path) {
        const entry = this._zipTree.find(e => e.path === path && !e.dir);
        if (!entry) return;

        this._selectedZipPath      = path;
        const bytes = await entry.entry.async('arraybuffer');
        this._currentEntryBytes    = bytes;
        this._currentEntryFilename = entry.name;

        // Also select the folder this file is in
        const parts = path.split('/');
        this._selectedZipFolder = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';

        // Update preview panel
        const previewPanel = this.querySelector('#preview-panel');
        if (previewPanel) {
            const savedBytes = this.decryptedBytes;
            const savedName  = this.fileName;
            this.decryptedBytes = bytes;
            this.fileName       = entry.name;

            const entryType = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.detect(entry.name, null) : null;
            let html;
            if (entryType === 'pdf')           html = this._renderPdfContent();
            else if (entryType === 'image')    html = this._renderImageContent();
            else if (entryType === 'markdown') html = this._renderMarkdownContent();
            else if (entryType === 'code')     html = this._renderCodeContent();
            else if (entryType === 'audio')    html = this._renderAudioContent();
            else if (entryType === 'video')    html = this._renderVideoContent();
            else {
                try {
                    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                    html = `<pre style="height:100%;overflow:auto;margin:0;padding:var(--space-6);white-space:pre-wrap;word-wrap:break-word;font-family:var(--font-mono);font-size:0.85rem;line-height:1.6;color:var(--color-text);">${this.escapeHtml(text)}</pre>`;
                } catch (e) {
                    html = `<div class="zip-preview__empty">${this.escapeHtml(this.t('download.zip.no_preview'))}</div>`;
                }
            }
            this.decryptedBytes = savedBytes;
            this.fileName       = savedName;
            previewPanel.innerHTML = html;
        }

        // Update file list highlighting
        this.querySelectorAll('.zip-file-item').forEach(el => {
            el.classList.toggle('zip-file-item--selected', el.dataset.path === path);
        });

        // Update save-entry button
        const existing = this.querySelector('#save-entry-btn');
        if (existing) {
            existing.textContent = `${this.t('download.zip.save_file')}: ${entry.name}`;
        } else {
            // In left-rail layout, add save button to left rail
            const leftRail = this.querySelector('#details-panel.zip-left-rail');
            if (leftRail) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-secondary';
                btn.id = 'save-entry-btn';
                btn.style.cssText = 'width: 100%; margin-top: var(--space-2);';
                btn.textContent = `${this.t('download.zip.save_file')}: ${entry.name}`;
                btn.addEventListener('click', () => this._saveCurrentEntry());
                leftRail.appendChild(btn);
            } else {
                const saveAll = this.querySelector('#save-file-btn');
                if (saveAll) {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-sm btn-secondary';
                    btn.id = 'save-entry-btn';
                    btn.textContent = `${this.t('download.zip.save_file')}: ${entry.name}`;
                    btn.addEventListener('click', () => this._saveCurrentEntry());
                    saveAll.insertAdjacentElement('afterend', btn);
                }
            }
        }

        // Update progress indicator
        const allFiles = this._zipTree.filter(f => !f.dir);
        const selectedIndex = allFiles.findIndex(f => f.path === path) + 1;
        const progressEl = this.querySelector('.zip-progress');
        if (progressEl) {
            progressEl.textContent = `${selectedIndex} of ${allFiles.length} files`;
        } else if (selectedIndex > 0) {
            const leftRail = this.querySelector('#details-panel.zip-left-rail');
            if (leftRail) {
                const div = document.createElement('div');
                div.className = 'zip-progress';
                div.textContent = `${selectedIndex} of ${allFiles.length} files`;
                const saveBtn = leftRail.querySelector('#save-entry-btn');
                if (saveBtn) leftRail.insertBefore(div, saveBtn);
                else leftRail.appendChild(div);
            }
        }
    }

    _selectZipFolder(folderPath) {
        this._selectedZipFolder = folderPath;
        this.querySelectorAll('.zip-folder-item').forEach(el => {
            el.classList.toggle('zip-folder-item--selected', el.dataset.folder === folderPath);
        });
        const fileList = this.querySelector('#zip-file-list');
        if (fileList) {
            fileList.innerHTML = this._renderBreadcrumb(folderPath) + this._renderFileList(folderPath);
            fileList.querySelectorAll('.zip-file-item').forEach(el => {
                el.addEventListener('click', () => {
                    const p = el.dataset.path;
                    if (p) this._previewZipEntry(p);
                });
            });
            fileList.querySelectorAll('.zip-breadcrumb__item').forEach(el => {
                el.addEventListener('click', () => {
                    const folder = el.dataset.folder;
                    if (folder !== undefined) this._selectZipFolder(folder);
                });
            });
        }
    }

    _saveCurrentEntry() {
        if (this._currentEntryBytes) {
            this.saveFile(this._currentEntryBytes, this._currentEntryFilename || 'download');
        }
    }

    async _saveFolder(folderPath) {
        const subZip = new JSZip();
        this._zipInstance.forEach((relativePath, zipEntry) => {
            if (relativePath.startsWith(folderPath) && !zipEntry.dir) {
                const innerPath = relativePath.slice(folderPath.length);
                subZip.file(innerPath, zipEntry.async('arraybuffer'));
            }
        });
        const folderName = folderPath.replace(/\/$/, '').split('/').pop();
        const blob = await subZip.generateAsync({ type: 'blob' });
        this.saveFile(blob, `${folderName}.zip`);
    }

    // ─── Syntax Highlighter ──────────────────────────────────────────────

    _highlightCode(code, lang) {
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const keywords = {
            javascript: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|default|async|await|new|this|try|catch|finally|throw|typeof|instanceof|in|of|switch|case|break|continue|do|yield|null|undefined|true|false)\b/g,
            typescript: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|default|async|await|new|this|try|catch|finally|throw|typeof|instanceof|in|of|switch|case|break|continue|do|yield|null|undefined|true|false|type|interface|enum|implements|declare|readonly|as|keyof|never|unknown|any|void)\b/g,
            python: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|and|or|not|in|is|None|True|False|pass|break|continue|global|nonlocal|assert|async|await|del)\b/g,
            go: /\b(func|package|import|var|const|type|struct|interface|map|chan|range|return|if|else|for|switch|case|break|continue|default|go|select|defer|nil|true|false|make|new|len|cap|append)\b/g,
            rust: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|mod|use|return|if|else|for|while|loop|match|break|continue|self|Self|super|crate|async|await|move|ref|type|where|unsafe|dyn|true|false|None|Some|Ok|Err)\b/g,
            java: /\b(public|private|protected|class|interface|extends|implements|static|final|abstract|return|if|else|for|while|do|switch|case|break|continue|new|this|super|try|catch|finally|throw|throws|import|package|void|int|long|double|float|boolean|char|null|true|false)\b/g,
            ruby: /\b(def|class|module|if|elsif|else|unless|while|until|for|do|end|return|yield|begin|rescue|ensure|raise|require|include|nil|true|false|self|super|puts|print)\b/g,
            bash: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|export|source|echo|exit|test|read|set|unset|declare|readonly|true|false)\b/g,
            sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|INTO|VALUES|SET|AND|OR|NOT|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|AS|IN|EXISTS|BETWEEN|LIKE|IS|DISTINCT|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END)\b/gi,
            c: /\b(int|long|short|char|float|double|void|unsigned|signed|const|static|extern|struct|union|enum|typedef|sizeof|return|if|else|for|while|do|switch|case|break|continue|default|goto|NULL|true|false|include|define)\b/g,
            cpp: /\b(int|long|short|char|float|double|void|unsigned|signed|const|static|extern|struct|union|enum|typedef|sizeof|return|if|else|for|while|do|switch|case|break|continue|default|goto|NULL|true|false|include|define|class|public|private|protected|virtual|override|template|typename|namespace|using|new|delete|this|throw|try|catch|nullptr|constexpr|noexcept)\b/g,
            php: /\b(function|class|extends|implements|public|private|protected|static|abstract|final|return|if|else|elseif|for|foreach|while|do|switch|case|break|continue|default|try|catch|finally|throw|new|echo|print|var|const|use|namespace|require|include|null|true|false)\b/g,
        };

        const escaped = esc(code);
        let result = escaped;
        result = result.replace(/((&quot;|&#39;))(.*?)\1/g, '<span style="color:#98C379;">$1$3$1</span>');
        result = result.replace(/(\/\/[^\n]*)/g, '<span style="color:#5C6370;font-style:italic;">$1</span>');
        if (['python', 'bash', 'ruby', 'yaml', 'toml', 'ini'].includes(lang)) {
            result = result.replace(/(#[^\n]*)/g, '<span style="color:#5C6370;font-style:italic;">$1</span>');
        }
        result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#D19A66;">$1</span>');
        const kwPattern = keywords[lang];
        if (kwPattern) result = result.replace(kwPattern, '<span style="color:#C678DD;font-weight:500;">$&</span>');
        return result;
    }

    // ─── Split Width Persistence ─────────────────────────────────────────

    _loadSplitWidth() {
        try { const raw = localStorage.getItem('sgraph-send-split-width'); if (raw) { const w = parseInt(raw, 10); if (w >= 200 && w <= 600) return w; } } catch (_) {}
        return 300;
    }

    _saveSplitWidth(width) {
        try { localStorage.setItem('sgraph-send-split-width', String(width)); } catch (_) {}
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Event Listeners
    // ═══════════════════════════════════════════════════════════════════════

    setupEventListeners() {
        const decryptBtn = this.querySelector('#decrypt-btn');
        if (decryptBtn) {
            this._boundDecryptClick = () => this.startDownload();
            decryptBtn.addEventListener('click', this._boundDecryptClick);
        }
        const keyInput = this.querySelector('#key-input');
        if (keyInput) keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.startDownload(); });

        const copyTextBtn = this.querySelector('#copy-text-btn');
        if (copyTextBtn) copyTextBtn.addEventListener('click', () => { if (this.decryptedText !== null) this.copyToClipboard(this.decryptedText, copyTextBtn); });

        const downloadTextBtn = this.querySelector('#download-text-btn');
        if (downloadTextBtn) downloadTextBtn.addEventListener('click', () => { if (this.decryptedBytes) this.saveFile(this.decryptedBytes, this.fileName || 'download.txt'); });

        const preEl = this.querySelector('#decrypted-text');
        if (preEl && this.decryptedText !== null) preEl.textContent = this.decryptedText;

        const panel = this.querySelector('#transparency-panel');
        if (panel && this.transparencyData) panel.setData(this.transparencyData);

        // Preview-mode listeners
        this._setupResize();

        const toggleBtn = this.querySelector('#toggle-raw-btn');
        if (toggleBtn) toggleBtn.addEventListener('click', () => { this._showRaw = !this._showRaw; this.render(); this.setupEventListeners(); });

        const copyBtn = this.querySelector('#copy-content-btn');
        if (copyBtn) copyBtn.addEventListener('click', () => {
            if (this.decryptedBytes) { const text = new TextDecoder().decode(this.decryptedBytes); this.copyToClipboard(text, copyBtn); }
        });

        const saveBtn = this.querySelector('#save-file-btn');
        if (saveBtn) {
            if (this._zipOrigBytes) {
                // Zip mode: "Save All" saves the entire zip
                saveBtn.addEventListener('click', () => this.saveFile(this._zipOrigBytes, this._zipOrigName || 'archive.zip'));
            } else {
                saveBtn.addEventListener('click', () => { if (this.decryptedBytes) this.saveFile(this.decryptedBytes, this.fileName || 'download'); });
            }
        }

        // Zip browser: folder clicks, file clicks, save-entry button
        const saveEntryBtn = this.querySelector('#save-entry-btn');
        if (saveEntryBtn) saveEntryBtn.addEventListener('click', () => this._saveCurrentEntry());

        this.querySelectorAll('.zip-folder-item').forEach(el => {
            el.addEventListener('click', () => {
                const folder = el.dataset.folder;
                if (folder !== undefined) this._selectZipFolder(folder);
            });
        });

        this.querySelectorAll('.zip-file-item').forEach(el => {
            el.addEventListener('click', () => {
                const path = el.dataset.path;
                if (path) this._previewZipEntry(path);
            });
        });

        // Info panel toggle (transparency + timing)
        const infoBtn   = this.querySelector('#zip-info-btn');
        const infoPanel = this.querySelector('#zip-info-panel');
        if (infoBtn && infoPanel) {
            infoBtn.addEventListener('click', () => {
                const visible = infoPanel.style.display !== 'none';
                infoPanel.style.display = visible ? 'none' : 'block';
                infoBtn.classList.toggle('btn--active', !visible);
            });
        }

        // Maximise toggle
        const maxBtn = this.querySelector('#maximise-btn');
        if (maxBtn) maxBtn.addEventListener('click', () => this._toggleMaximise());

        // Escape exits maximised mode
        if (this._zipTree && !this._escapeHandler) {
            this._escapeHandler = (e) => {
                if (e.key === 'Escape' && this._isMaximised) {
                    this._toggleMaximise();
                }
            };
            document.addEventListener('keydown', this._escapeHandler);
        }

        // Keyboard navigation for zip file list
        if (this._zipTree && !this._keyNavHandler) {
            this._keyNavHandler = (e) => {
                if (!this._zipTree) return;
                const files = this._zipTree.filter(f => !f.dir);
                if (files.length === 0) return;

                const currentIdx = this._selectedZipPath
                    ? files.findIndex(f => f.path === this._selectedZipPath)
                    : -1;

                if (e.key === 'ArrowDown' || e.key === 'j') {
                    e.preventDefault();
                    const next = Math.min(currentIdx + 1, files.length - 1);
                    this._previewZipEntry(files[next].path);
                } else if (e.key === 'ArrowUp' || e.key === 'k') {
                    e.preventDefault();
                    const prev = Math.max(currentIdx - 1, 0);
                    this._previewZipEntry(files[prev].path);
                } else if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
                    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        this._saveCurrentEntry();
                    }
                }
            };
            document.addEventListener('keydown', this._keyNavHandler);
        }

        // Hint dismiss
        const hintDismiss = this.querySelector('#zip-hint-dismiss');
        if (hintDismiss) {
            hintDismiss.addEventListener('click', () => {
                try { localStorage.setItem('sgraph-zip-hint-shown', '1'); } catch(_) {}
                const hint = this.querySelector('#zip-hint');
                if (hint) hint.remove();
            });
        }

        // Breadcrumb navigation
        this.querySelectorAll('.zip-breadcrumb__item').forEach(el => {
            el.addEventListener('click', () => {
                const folder = el.dataset.folder;
                if (folder !== undefined) this._selectZipFolder(folder);
            });
        });

    }

    _setupResize() {
        const handle = this.querySelector('#split-resize');
        const split  = this.querySelector('#preview-split');
        if (!handle || !split) return;

        let isResizing = false, startX, startWidth;

        const onMouseDown = (e) => {
            isResizing = true; startX = e.clientX;
            const details = this.querySelector('#details-panel');
            startWidth = details ? details.offsetWidth : 300;
            handle.style.background = 'var(--accent)';
            document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
            e.preventDefault();
        };
        const onMouseMove = (e) => {
            if (!isResizing) return;
            const diff = e.clientX - startX;
            const newWidth = Math.min(Math.max(startWidth + diff, 200), 600);
            split.style.gridTemplateColumns = `${newWidth}px 4px 1fr`;
            this._currentSplitWidth = newWidth;
        };
        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            handle.style.background = ''; document.body.style.cursor = ''; document.body.style.userSelect = '';
            if (this._currentSplitWidth) this._saveSplitWidth(this._currentSplitWidth);
        };

        handle.addEventListener('mouseenter', () => { if (!isResizing) handle.style.background = 'var(--accent)'; });
        handle.addEventListener('mouseleave', () => { if (!isResizing) handle.style.background = ''; });
        handle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        this._resizeCleanup = () => {
            handle.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    cleanup() {
        if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
        if (this._resizeCleanup) { this._resizeCleanup(); this._resizeCleanup = null; }
        if (this._escapeHandler) { document.removeEventListener('keydown', this._escapeHandler); this._escapeHandler = null; }
        if (this._keyNavHandler) { document.removeEventListener('keydown', this._keyNavHandler); this._keyNavHandler = null; }
        const main = this.closest('main');
        if (main) { main.style.maxWidth = ''; main.style.width = ''; main.classList.remove('preview-expanded'); }
        this._boundDecryptClick = null;
        this._setBeforeUnload(false);
    }

    _setBeforeUnload(active) {
        if (active && !this._beforeUnloadHandler) {
            this._beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ''; };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        } else if (!active && this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Download Flow
    // ═══════════════════════════════════════════════════════════════════════

    async startDownload(keyOverride) {
        const keyString = keyOverride || (this.querySelector('#key-input') ? this.querySelector('#key-input').value.trim() : '');

        if (!keyString) { this.errorMessage = this.t('download.error.no_key'); this.state = 'error'; this.render(); this.setupEventListeners(); return; }
        // Check crypto.subtle requires a secure context (HTTPS or localhost)
        if (!SendCrypto.isAvailable()) { this.errorMessage = this.t('crypto.error.unavailable'); this.state = 'error'; this.render(); this.setupEventListeners(); return; }

        try {
            this._renderType = null; this._objectUrl = null; this._showRaw = false;
            this._zipInstance = null; this._zipTree = null; this._zipOrigBytes = null; this._zipOrigName = null;
            this._currentEntryBytes = null; this._currentEntryFilename = null; this._selectedZipPath = null;
            this._selectedZipFolder = '';
            this._stageTimestamps = {};
            this.state = 'decrypting'; this._setBeforeUnload(true); this.render();

            const key       = await SendCrypto.importKey(keyString);
            const encrypted = await this._downloadEncryptedPayload();
            const decrypted = await SendCrypto.decryptFile(key, encrypted);

            const { metadata, content } = this.extractMetadata(decrypted);
            if (metadata && metadata.filename) this.fileName = metadata.filename;

            this.decryptedBytes = content;

            // Detect render type for preview
            const filename    = this.fileName || null;
            const contentType = (this.transferInfo && this.transferInfo.content_type_hint) || null;
            this._renderType  = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.detect(filename, contentType) : null;

            if (this._renderType === 'zip' && typeof JSZip !== 'undefined') {
                // Parse zip for browsable tree viewer
                try {
                    this._zipOrigBytes = new Uint8Array(content);
                    this._zipOrigName  = this.fileName || 'archive.zip';
                    const parsed = await this._parseZip(content);
                    this._zipInstance = parsed.zip;
                    this._zipTree     = parsed.tree;
                    // Auto-preview first previewable file
                    const first = parsed.tree.find(e => !e.dir);
                    if (first) {
                        this._selectedZipPath = first.path;
                        const firstParts = first.path.split('/');
                        this._selectedZipFolder = firstParts.length > 1 ? firstParts.slice(0, -1).join('/') + '/' : '';
                        const bytes = await first.entry.async('arraybuffer');
                        this._currentEntryBytes    = bytes;
                        this._currentEntryFilename = first.name;
                        this.decryptedBytes = bytes;
                        this.fileName       = first.name;
                        this._renderType    = 'zip';
                    }
                } catch (zipErr) {
                    // Zip parsing failed — fall back to auto-download
                    this._zipInstance = null; this._zipTree = null;
                    this._renderType = null;
                    this.saveFile(content, this._zipOrigName || this.fileName || 'download.zip');
                }
            } else if (this._renderType === 'zip') {
                // JSZip not available — auto-download the zip file
                this._renderType = null;
                this.saveFile(content, this.fileName || 'download.zip');
            } else if (this.isTextContent()) {
                this.decryptedText = new TextDecoder().decode(content);
            } else if (!this._renderType || this._renderType === 'text') {
                // Not previewable — auto-download
                this.saveFile(content, this.fileName || 'download');
            }
            // Previewable types: no auto-download (user clicks "Save Locally")

            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            this.saveToHistory(content);
            this._setBeforeUnload(false);

            this.transparencyData = {
                download_timestamp: new Date().toISOString(),
                file_size_bytes:    this.transferInfo.file_size_bytes,
                encryption_method:  'AES-256-GCM',
                encrypted:          ['file_name', 'file_content'],
                not_stored:         ['decryption_key', 'raw_ip']
            };
            this.state = 'complete'; this.render(); this.setupEventListeners();

            this.dispatchEvent(new CustomEvent('download-complete', {
                detail: { transferId: this.transferId }, bubbles: true
            }));

        } catch (err) {
            this._setBeforeUnload(false);
            this.errorMessage = err.message || this.t('download.error.failed');
            this.state = 'ready'; this.render(); this.setupEventListeners();
            const nki = this.querySelector('#key-input');
            if (nki) nki.value = keyOverride || keyString;
        }
    }

    async _downloadEncryptedPayload() {
        try {
            const result = await ApiClient.getPresignedDownloadUrl(this.transferId);
            if (result && result.download_url) {
                const response = await fetch(result.download_url);
                if (response.ok) return response.arrayBuffer();
            }
        } catch (e) { /* presigned not available */ }
        return ApiClient.downloadPayload(this.transferId);
    }

    // ─── LocalStorage History ────────────────────────────────────────────

    static HISTORY_KEY    = 'sgraph-send-history';
    static MAX_HISTORY    = 20;
    static MAX_TEXT_STORE = 50000;

    saveToHistory(content) {
        try {
            const history = this.getHistory();
            const isText = this.isTextContent();
            const entry = {
                transferId:  this.transferId,
                type:        isText ? 'text' : 'file',
                timestamp:   new Date().toISOString(),
                size:        content.byteLength,
                fileName:    this.fileName || null,
                contentType: this.transferInfo.content_type_hint || null,
            };
            if (isText && content.byteLength <= SendDownload.MAX_TEXT_STORE) entry.text = new TextDecoder().decode(content);
            const filtered = history.filter(h => h.transferId !== this.transferId);
            filtered.unshift(entry);
            localStorage.setItem(SendDownload.HISTORY_KEY, JSON.stringify(filtered.slice(0, SendDownload.MAX_HISTORY)));
        } catch (e) { /* localStorage full */ }
    }

    getHistory()  { try { return JSON.parse(localStorage.getItem(SendDownload.HISTORY_KEY) || '[]'); } catch (e) { return []; } }
    clearHistory() { localStorage.removeItem(SendDownload.HISTORY_KEY); }

    // ─── File Helpers ────────────────────────────────────────────────────

    saveFile(data, filename) {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || 'download';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async copyToClipboard(text, button) {
        await SendHelpers.copyToClipboard(text);
        const original = button.textContent;
        button.textContent = this.t('common.copied');
        setTimeout(() => { button.textContent = original; }, 2000);
    }
}

customElements.define('send-download', SendDownload);
