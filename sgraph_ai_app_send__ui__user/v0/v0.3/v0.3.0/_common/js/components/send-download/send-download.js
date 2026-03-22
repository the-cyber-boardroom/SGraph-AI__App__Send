/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Component v0.3.0
   Clean rewrite — zero dependency on v0.1.x / v0.2.x

   Responsibilities:
     1. Parse URL (hash, query params, friendly tokens)
     2. Load transfer info (token validation, API call)
     3. Decrypt payload (AES-256-GCM via Web Crypto)
     4. Detect content type and route to the correct view:
        - Gallery view (send-gallery) for image-heavy zips
        - Browse view  (send-browse)  for folder tree + tabbed preview
        - Inline view  for single files (markdown, image, PDF, code, text)
        - Auto-download for non-previewable content

   Route modes: /download/ /gallery/ /browse/
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendDownload extends HTMLElement {

    constructor() {
        super();
        this.transferId       = null;
        this.transferInfo     = null;
        this.hashKey          = null;
        this.tokenName        = null;
        this.state            = 'loading';  // loading | ready | decrypting | complete | error
        this.errorMessage     = null;

        // Decrypted data
        this.decryptedBytes   = null;
        this.decryptedText    = null;
        this.fileName         = null;
        this._renderType      = null;

        // Zip data
        this._zipInstance     = null;
        this._zipTree         = null;
        this._zipOrigBytes    = null;
        this._zipOrigName     = null;

        // Route mode
        this._routeMode       = this._detectRouteMode();

        // Timing
        this._stageTimestamps = {};

        // Listeners
        this._localeHandler   = () => { if (this.state === 'complete') this.render(); };
    }

    connectedCallback() {
        this._parseUrl();
        if (!this.transferId) {
            this.state = 'error';
            this.errorMessage = this.t('download.error.no_id');
            this.render();
            return;
        }
        this._loadTransferInfo();
        document.addEventListener('locale-changed', this._localeHandler);
    }

    disconnectedCallback() {
        document.removeEventListener('locale-changed', this._localeHandler);
        this._revokeObjectUrls();
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    t(key, params) { return typeof I18n !== 'undefined' ? I18n.t(key, params) : key; }
    _esc(s) { return SendHelpers.escapeHtml(s); }
    _fmtBytes(b) { return SendHelpers.formatBytes(b); }
    _fmtTime(ts) { return SendHelpers.formatTimestamp(ts); }

    _objectUrls = [];
    _createObjectUrl(blob) {
        const url = URL.createObjectURL(blob);
        this._objectUrls.push(url);
        return url;
    }
    _revokeObjectUrls() {
        this._objectUrls.forEach(u => URL.revokeObjectURL(u));
        this._objectUrls = [];
    }

    // ─── Route Detection ────────────────────────────────────────────────────

    _detectRouteMode() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/gallery')) return 'gallery';
        if (path.includes('/browse'))  return 'browse';
        if (path.includes('/download')) return 'download';
        return 'auto';
    }

    // ─── URL Parsing ────────────────────────────────────────────────────────

    _parseUrl() {
        const params = new URLSearchParams(window.location.search);
        this.tokenName = params.get('token') || null;

        const hash = window.location.hash.substring(1);
        if (!hash) {
            this.transferId = params.get('id') || null;
            return;
        }

        // Check for friendly token (word-word-NNNN)
        if (typeof FriendlyCrypto !== 'undefined' && FriendlyCrypto.isFriendlyToken(hash)) {
            this._friendlyToken = hash;
            // Don't set transferId yet — resolved during decrypt
            this.transferId = '__friendly__';
            return;
        }

        const i = hash.indexOf('/');
        if (i > 0) {
            this.transferId = hash.substring(0, i);
            this.hashKey    = hash.substring(i + 1);
        } else {
            this.transferId = hash;
        }
    }

    // ─── Data Loading ───────────────────────────────────────────────────────

    async _loadTransferInfo() {
        try {
            // Friendly token — resolve first, then load info
            if (this._friendlyToken) {
                await this._resolveFriendlyToken();
                return;
            }

            if (this.tokenName) {
                try {
                    const result = await ApiClient.validateToken(this.tokenName);
                    if (result.remaining !== undefined) this.tokenRemaining = result.remaining;
                    if (!result.success) {
                        this.state = 'error';
                        this.errorMessage = this._getTokenError(result.reason);
                        this.render();
                        return;
                    }
                } catch (_) { /* token validation unavailable */ }
            }

            this.transferInfo = await ApiClient.getTransferInfo(this.transferId);
            this.state = this.transferInfo.status === 'completed' ? 'ready' : 'error';
            if (this.state === 'error') this.errorMessage = this.t('download.error.not_ready');
        } catch (e) {
            this.state = 'error';
            this.errorMessage = this.t('download.error.not_found');
        }
        this.render();
        if (this.state === 'ready' && this.hashKey) this.startDownload(this.hashKey);
    }

    async _resolveFriendlyToken() {
        try {
            const resolved = await FriendlyCrypto.resolve(this._friendlyToken);
            this.transferId = resolved.transferId;
            this.hashKey    = resolved.key;

            this.transferInfo = await ApiClient.getTransferInfo(this.transferId);
            this.state = this.transferInfo.status === 'completed' ? 'ready' : 'error';
            if (this.state === 'error') this.errorMessage = this.t('download.error.not_ready');
        } catch (e) {
            this.state = 'error';
            this.errorMessage = this.t('download.error.not_found');
        }
        this.render();
        if (this.state === 'ready' && this.hashKey) this.startDownload(this.hashKey);
    }

    _getTokenError(reason) {
        const map = {
            not_found: this.t('download.error.token_not_found'),
            exhausted: this.t('download.error.token_exhausted'),
            revoked:   this.t('download.error.token_revoked'),
        };
        return map[reason] || this.t('download.error.token_not_found');
    }

    // ─── Content Type Check ─────────────────────────────────────────────────

    _isTextContent() {
        return this.transferInfo && (this.transferInfo.content_type_hint || '').toLowerCase().startsWith('text/');
    }

    // ─── SGMETA Envelope ────────────────────────────────────────────────────

    static SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41, 0x00];

    _extractMetadata(buf) {
        const bytes = new Uint8Array(buf);
        const magic = SendDownload.SGMETA_MAGIC;
        if (bytes.length < magic.length + 4) return { metadata: null, content: buf };
        for (let i = 0; i < magic.length; i++) {
            if (bytes[i] !== magic[i]) return { metadata: null, content: buf };
        }
        const metaLen = (bytes[magic.length] << 24) | (bytes[magic.length+1] << 16) |
                        (bytes[magic.length+2] << 8) | bytes[magic.length+3];
        const metaStart = magic.length + 4;
        const contentStart = metaStart + metaLen;
        if (contentStart > bytes.length) return { metadata: null, content: buf };
        try {
            const metaStr = new TextDecoder().decode(bytes.slice(metaStart, contentStart));
            return { metadata: JSON.parse(metaStr), content: buf.slice(contentStart) };
        } catch (_) { return { metadata: null, content: buf }; }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Download + Decrypt Flow
    // ═══════════════════════════════════════════════════════════════════════════

    async startDownload(keyOverride) {
        const keyString = keyOverride ||
            (this.querySelector('#key-input') ? this.querySelector('#key-input').value.trim() : '');

        if (!keyString) {
            this.errorMessage = this.t('download.error.no_key');
            this.state = 'error'; this.render(); return;
        }
        if (!SendCrypto.isAvailable()) {
            this.errorMessage = this.t('crypto.error.unavailable');
            this.state = 'error'; this.render(); return;
        }

        try {
            this.state = 'decrypting';
            this.render();

            const key       = await SendCrypto.importKey(keyString);
            const encrypted = await this._downloadPayload();
            const decrypted = await SendCrypto.decryptFile(key, encrypted);
            const { metadata, content } = this._extractMetadata(decrypted);

            if (metadata && metadata.filename) this.fileName = metadata.filename;
            this.decryptedBytes = content;

            const filename    = this.fileName || null;
            const contentType = (this.transferInfo && this.transferInfo.content_type_hint) || null;
            this._renderType  = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.detect(filename, contentType) : null;

            // Zip handling
            if (this._renderType === 'zip' && typeof JSZip !== 'undefined') {
                try {
                    this._zipOrigBytes = new Uint8Array(content);
                    this._zipOrigName  = this.fileName || 'archive.zip';
                    const zip  = await JSZip.loadAsync(content);
                    this._zipInstance = zip;
                    this._zipTree = [];
                    zip.forEach((path, entry) => {
                        // Filter _preview* folders and dotfiles
                        if (path.startsWith('_preview') || path.startsWith('.')) return;
                        this._zipTree.push({ path, name: entry.name, dir: entry.dir, entry });
                    });
                } catch (zipErr) {
                    this._zipInstance = null;
                    this._renderType = null;
                    this._saveFile(content, this._zipOrigName || this.fileName || 'download.zip');
                }
            } else if (this._isTextContent()) {
                this.decryptedText = new TextDecoder().decode(content);
            } else if (!this._renderType || this._renderType === 'text') {
                this._saveFile(content, this.fileName || 'download');
            }

            // Clear hash after decrypt (don't leak key in URL)
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            this._saveToHistory(content);
            this.state = 'complete';
            this.render();

            this.dispatchEvent(new CustomEvent('download-complete', {
                detail: { transferId: this.transferId }, bubbles: true
            }));

        } catch (err) {
            this.errorMessage = err.message || this.t('download.error.failed');
            this.state = 'ready'; this.render();
            const inp = this.querySelector('#key-input');
            if (inp) inp.value = keyOverride || keyString;
        }
    }

    async _downloadPayload() {
        try {
            const result = await ApiClient.getPresignedDownloadUrl(this.transferId);
            if (result && result.download_url) {
                const resp = await fetch(result.download_url);
                if (resp.ok) return resp.arrayBuffer();
            }
        } catch (_) { /* presigned not available */ }
        return ApiClient.downloadPayload(this.transferId);
    }

    // ─── File Save ──────────────────────────────────────────────────────────

    _saveFile(data, filename) {
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || 'download';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ─── History ────────────────────────────────────────────────────────────

    static HISTORY_KEY = 'sgraph-send-history';
    static MAX_HISTORY = 20;

    _saveToHistory(content) {
        try {
            const history = JSON.parse(localStorage.getItem(SendDownload.HISTORY_KEY) || '[]');
            const entry = {
                transferId: this.transferId,
                type:       this._isTextContent() ? 'text' : 'file',
                timestamp:  new Date().toISOString(),
                size:       content.byteLength,
                fileName:   this.fileName || null,
            };
            const filtered = history.filter(h => h.transferId !== this.transferId);
            filtered.unshift(entry);
            localStorage.setItem(SendDownload.HISTORY_KEY,
                JSON.stringify(filtered.slice(0, SendDownload.MAX_HISTORY)));
        } catch (_) { /* localStorage full */ }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Rendering
    // ═══════════════════════════════════════════════════════════════════════════

    render() {
        this._stageTimestamps[this.state] = Date.now();

        if (this.state === 'complete') {
            this._renderComplete();
            return;
        }

        this.innerHTML = `<div class="card">${this._renderPreDecrypt()}</div>`;
        this._setupPreDecryptListeners();
    }

    _renderPreDecrypt() {
        if (this.state === 'loading') {
            return `<div class="status status--info">${this._esc(this.t('download.loading'))}</div>`;
        }
        if (this.state === 'error') {
            return `<div class="status status--error">${this._esc(this.errorMessage)}</div>`;
        }
        if (this.state === 'decrypting') {
            return `
                <div style="margin: 1rem 0;">
                    <div style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                        ${this._esc(this.t('download.progress.decrypting'))}
                    </div>
                    <div class="progress-bar"><div class="progress-bar__fill" style="width: 50%;"></div></div>
                </div>`;
        }
        // state === 'ready'
        const info = this.transferInfo;
        const typeKey = this._isTextContent() ? 'download.info.encrypted_text' : 'download.info.encrypted_file';
        const btnKey  = this._isTextContent() ? 'download.button.decrypt_view' : 'download.button.decrypt_download';

        return `
            <div class="status status--info">
                <strong>${this._esc(this.t(typeKey))}</strong> — ${this._fmtBytes(info.file_size_bytes)}
                <br><small>${this._esc(this.t('download.info.uploaded', { timestamp: this._fmtTime(info.created_at) }))}</small>
                ${info.download_count > 0 ? `<br><small>${this._esc(this.t('download.info.download_count', { count: info.download_count }))}</small>` : ''}
            </div>
            <div style="margin-top: 1rem;">
                <label style="display: block; font-weight: 600; font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">
                    ${this._esc(this.t('download.key.label'))}
                </label>
                <input type="text" class="input" id="key-input"
                       placeholder="${this._esc(this.t('download.key.placeholder'))}"
                       value="${this.hashKey ? this._esc(this.hashKey) : ''}"
                       autocomplete="off" spellcheck="false">
                <button class="btn btn-primary" id="decrypt-btn" style="margin-top: 0.75rem; width: 100%;">
                    ${this.t(btnKey)}
                </button>
            </div>`;
    }

    _setupPreDecryptListeners() {
        const btn = this.querySelector('#decrypt-btn');
        if (btn) btn.addEventListener('click', () => this.startDownload());

        const inp = this.querySelector('#key-input');
        if (inp) inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.startDownload();
        });
    }

    // ─── Post-Decrypt Rendering ─────────────────────────────────────────────

    _renderComplete() {
        // Expand main for full-width views
        const main = this.closest('main');
        if (main) {
            main.style.maxWidth = 'calc(100vw - 2rem)';
            main.style.width    = '100%';
            main.classList.add('preview-expanded');
        }

        // Determine view mode
        const mode = this._resolveViewMode();

        if (mode === 'gallery') {
            this._renderGalleryView();
        } else if (mode === 'browse') {
            this._renderBrowseView();
        } else if (mode === 'download') {
            this._renderDownloadMode();
        } else {
            this._renderSingleFile();
        }
    }

    _resolveViewMode() {
        // Route takes priority
        if (this._routeMode !== 'auto') return this._routeMode;

        // Zip with images → gallery; zip without → browse
        if (this._renderType === 'zip' && this._zipTree) {
            const files   = this._zipTree.filter(e => !e.dir);
            const images  = files.filter(e => {
                const t = FileTypeDetect.detect(e.name, null);
                return t === 'image';
            });
            return images.length >= 3 ? 'gallery' : 'browse';
        }

        // Single file
        return 'single';
    }

    // ─── Gallery View ───────────────────────────────────────────────────────

    _renderGalleryView() {
        const gallery = document.createElement('send-gallery');
        gallery.zipTree      = this._zipTree;
        gallery.zipInstance   = this._zipInstance;
        gallery.zipOrigBytes = this._zipOrigBytes;
        gallery.zipOrigName  = this._zipOrigName;
        gallery.fileName     = this._zipOrigName;
        gallery.transferId   = this.transferId;
        gallery.downloadUrl  = window.location.href;
        this.innerHTML = '';
        this.appendChild(gallery);
    }

    // ─── Browse View (sg-layout) ────────────────────────────────────────────

    _renderBrowseView() {
        const browse = document.createElement('send-browse');
        browse.zipTree      = this._zipTree;
        browse.zipInstance   = this._zipInstance;
        browse.zipOrigBytes = this._zipOrigBytes;
        browse.zipOrigName  = this._zipOrigName;
        browse.fileName     = this._zipOrigName;
        browse.transferId   = this.transferId;
        browse.downloadUrl  = window.location.href;
        this.innerHTML = '';
        this.appendChild(browse);
    }

    // ─── Download Mode (auto-download, minimal UI) ──────────────────────────

    _renderDownloadMode() {
        this._saveFile(this.decryptedBytes, this.fileName || 'download');
        this.innerHTML = `
            <div class="card">
                <div class="status status--success" style="font-size: var(--text-sm);">
                    ${this._esc(this.t('download.result.success'))}
                </div>
            </div>`;
    }

    // ─── Single File View ───────────────────────────────────────────────────

    _renderSingleFile() {
        const viewer = document.createElement('send-viewer');
        viewer.fileBytes = this.decryptedBytes;
        viewer.fileName  = this.fileName;
        viewer.fileType  = this._renderType;
        viewer.fileText  = this.decryptedText;
        this.innerHTML = '';
        this.appendChild(viewer);
    }
}

customElements.define('send-download', SendDownload);
