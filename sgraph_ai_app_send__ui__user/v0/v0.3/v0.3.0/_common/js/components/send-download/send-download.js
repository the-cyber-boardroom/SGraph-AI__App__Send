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

        // Original download URL (captured before hash is cleared)
        this._downloadUrl     = window.location.href;

        // Stale response guard (v0.2.4)
        this._loadGeneration  = 0;

        // Timing
        this._stageTimestamps = {};

        // Listeners
        this._localeHandler   = () => { if (this.state === 'complete') this.render(); };
    }

    connectedCallback() {
        this._parseUrl();
        if (!this.transferId) {
            this.state = 'entry';
            this.render();
            this._setupEntryListeners();
            return;
        }
        this.render();                                                          // Show loading state immediately (don't leave page blank)
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
        if (path.includes('/view'))    return 'view';
        if (path.includes('/download')) return 'download';
        // /v/ is a short URL — auto-detect content type
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
        var gen = ++this._loadGeneration;
        try {
            // Friendly token — resolve first, then load info
            if (this._friendlyToken) {
                await this._resolveFriendlyToken(gen);
                return;
            }

            if (this.tokenName) {
                try {
                    const result = await ApiClient.validateToken(this.tokenName);
                    if (gen !== this._loadGeneration) return;  // stale
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
            if (gen !== this._loadGeneration) return;  // stale
            this.state = this.transferInfo.status === 'completed' ? 'ready' : 'error';
            if (this.state === 'error') this.errorMessage = this.t('download.error.not_ready');
        } catch (e) {
            if (gen !== this._loadGeneration) return;  // stale
            this.state = 'error';
            this.errorMessage = this.t('download.error.not_found');
        }
        this.render();
        if (this.state === 'ready' && this.hashKey) this.startDownload(this.hashKey);
    }

    async _resolveFriendlyToken(gen) {
        try {
            // Derive transfer ID (SHA-256 → 12 hex chars) and AES key (PBKDF2)
            this.transferId = await FriendlyCrypto.deriveTransferId(this._friendlyToken);
            const cryptoKey = await FriendlyCrypto.deriveKey(this._friendlyToken);
            this.hashKey    = await FriendlyCrypto.exportKey(cryptoKey);
            if (gen !== this._loadGeneration) return;  // stale

            this.transferInfo = await ApiClient.getTransferInfo(this.transferId);
            if (gen !== this._loadGeneration) return;  // stale
            this.state = this.transferInfo.status === 'completed' ? 'ready' : 'error';
            if (this.state === 'error') this.errorMessage = this.t('download.error.not_ready');
        } catch (e) {
            if (gen !== this._loadGeneration) return;  // stale
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

    static SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41];  // "SGMETA" — 6 bytes, matches upload-constants.js

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
                        // Filter macOS artifacts, preview/gallery metadata, and dotfiles
                        if (path.indexOf('__MACOSX') !== -1)                      return;
                        if (path.startsWith('_preview'))                             return;
                        if (path.startsWith('.'))                                  return;
                        const name = entry.name;
                        if (name === '.DS_Store' || (name.length > 2 && name.startsWith('._'))) return;
                        this._zipTree.push({ path, name, dir: entry.dir, entry });
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

            // Capture the full URL before clearing hash (for share/copy link)
            this._downloadUrl = window.location.href;

            // Clear hash after decrypt — but only for raw crypto keys (not friendly tokens)
            // Friendly tokens (word-word-NNNN) are safe to keep in the URL bar
            if (window.location.hash && !this._friendlyToken) {
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
        if (this.state === 'entry') {
            return `
                <h3 style="margin: 0 0 0.5rem 0; color: var(--color-primary, #4ECDC4);">Receive a file</h3>
                <p style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 1rem;">
                    Enter the token or transfer ID you were given.
                </p>
                <div>
                    <input type="text" class="input" id="entry-input"
                           placeholder="e.g. ocean-maple-4217 or a3b2c1d4e5f6"
                           autocomplete="off" spellcheck="false"
                           style="width: 100%; padding: 0.75rem; font-size: var(--text-base, 1rem);">
                    <button class="btn btn-primary" id="entry-btn"
                            style="margin-top: 0.75rem; width: 100%;">
                        Decrypt &amp; Download
                    </button>
                </div>
                <div style="font-size: var(--text-small, 0.75rem); color: var(--color-text-secondary); margin-top: 1rem; text-align: center;">
                    The token was shared by the sender. It derives both the transfer ID and the decryption key.
                </div>`;
        }
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

        // Also wire entry form listeners if the state is 'entry' and form is visible
        this._setupEntryListeners();
    }

    _setupEntryListeners() {
        const entryBtn = this.querySelector('#entry-btn');
        const entryInp = this.querySelector('#entry-input');
        if (!entryBtn || !entryInp) return;

        const submit = () => {
            const val = entryInp.value.trim();
            if (!val) return;
            // Set as hash and re-navigate (the page will re-parse)
            window.location.hash = val;
            // Re-parse and load
            this._parseUrl();
            if (this.transferId) {
                this._loadTransferInfo();
            } else {
                this.state = 'error';
                this.errorMessage = 'Could not resolve token or transfer ID';
                this.render();
            }
        };

        entryBtn.addEventListener('click', submit);
        entryInp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit();
        });
        // Auto-focus the input
        setTimeout(() => entryInp.focus(), 50);
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
            // 'view' or 'auto' single-file fallback
            this._renderSingleFile();
        }
    }

    _resolveViewMode() {
        const isZip = this._renderType === 'zip' && this._zipTree;

        // Route takes priority — but only if the content supports it
        if (this._routeMode === 'view') return 'view';
        if (this._routeMode === 'download') return 'download';
        if (this._routeMode === 'gallery' && isZip) return 'gallery';
        if (this._routeMode === 'browse'  && isZip) return 'browse';

        // Auto-detect: zip with images → gallery; zip without → browse
        if (isZip) {
            const files   = this._zipTree.filter(e => !e.dir);
            const images  = files.filter(e => {
                const t = FileTypeDetect.detect(e.name, null);
                return t === 'image';
            });
            return images.length >= 3 ? 'gallery' : 'browse';
        }

        // Single file — inline preview (regardless of route)
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
        gallery.downloadUrl  = this._downloadUrl;
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
        browse.downloadUrl  = this._downloadUrl;
        this.innerHTML = '';
        this.appendChild(browse);
    }

    // ─── Download Mode (auto-download, minimal UI) ──────────────────────────

    _renderDownloadMode() {
        this._saveFile(this.decryptedBytes, this.fileName || 'download');
        const url = this._downloadUrl || '';
        this.innerHTML = `
            <div class="card">
                <div class="status status--success" style="font-size: var(--text-sm);">
                    ${this._esc(this.t('download.result.file_success'))}
                </div>
                ${url ? `
                <div style="margin-top: 1rem;">
                    <div style="font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem;">Download link</div>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" class="input" value="${this._esc(url)}" readonly style="flex: 1; font-size: 0.75rem; font-family: monospace;">
                        <button class="btn btn-sm btn-secondary" id="dl-copy-link">Copy</button>
                    </div>
                </div>` : ''}
            </div>`;
        const copyBtn = this.querySelector('#dl-copy-link');
        if (copyBtn) copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(url);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
            } catch (_) {}
        });
    }

    // ─── Single File View (two-column layout) ──────────────────────────────

    _renderSingleFile() {
        const filename  = this.fileName || 'download';
        const type      = this._renderType;
        const info      = this.transferInfo;
        const url       = this._downloadUrl || '';

        // Type badge label
        const badgeLabel = (type === 'code' && typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.getLanguage(filename) : (type || 'file');
        const sizeStr    = info ? this._fmtBytes(info.file_size_bytes) : '';
        const uploadDate = info ? this._fmtTime(info.created_at) : '';
        const downloads  = info ? (info.download_count || 0) : 0;

        // Restore saved split width
        let splitWidth = 320;
        try { splitWidth = parseInt(localStorage.getItem('sg-send-split-width'), 10) || 320; } catch (_) {}

        this.innerHTML = `
            <style>
                .sf-layout { display: grid; grid-template-columns: ${splitWidth}px 4px 1fr; min-height: calc(100vh - 120px); gap: 0; }
                .sf-details { overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
                .sf-filename { margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 700; color: var(--color-text, #E0E0E0); word-break: break-all; }
                .sf-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
                .sf-badge { font-size: 0.7rem; color: var(--accent, #4ECDC4); font-family: var(--font-mono, monospace); background: var(--accent-subtle, rgba(78,205,196,0.08)); padding: 2px 8px; border-radius: 4px; }
                .sf-size { font-size: 0.75rem; color: var(--color-text-secondary, #8892A0); font-family: var(--font-mono, monospace); }
                .sf-info { font-size: 0.8rem; color: var(--color-text-secondary, #8892A0); display: flex; flex-direction: column; gap: 0.25rem; }
                .sf-divider { cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 10; border-radius: 2px; }
                .sf-divider:hover { background: rgba(78, 205, 196, 0.3); }
                .sf-preview { overflow: auto; border-left: 1px solid rgba(255,255,255,0.08); min-height: 0; }
                .sf-share { padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); }
                .sf-share-label { font-size: 0.75rem; color: var(--color-text-secondary, #8892A0); margin-bottom: 0.35rem; }
                @media (max-width: 768px) {
                    .sf-layout { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; }
                    .sf-divider { display: none; }
                    .sf-preview { border-left: none; border-top: 1px solid rgba(255,255,255,0.08); }
                }
            </style>
            <div class="sf-layout" data-testid="download-layout">
                <div class="sf-details" data-testid="download-details">
                    <!-- File info -->
                    <div>
                        <h3 class="sf-filename">${this._esc(filename)}</h3>
                        <div class="sf-meta">
                            <span class="sf-badge">${this._esc(badgeLabel)}</span>
                            <span class="sf-size">${this._esc(sizeStr)}</span>
                        </div>
                        <div class="sf-info">
                            ${uploadDate ? `<div>Uploaded: ${this._esc(uploadDate)}</div>` : ''}
                            ${downloads > 0 ? `<div>Downloaded ${downloads} time${downloads !== 1 ? 's' : ''}</div>` : ''}
                        </div>
                    </div>

                    <!-- Actions -->
                    <button class="btn btn-primary" id="sf-save" data-testid="save-locally-btn" style="width: 100%;">
                        ${SendIcons.DOWNLOAD} Save Locally
                    </button>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-sm btn-secondary" id="sf-copy-link" style="flex: 1;">
                            ${SendIcons.LINK_SM} Copy Link
                        </button>
                        <button class="btn btn-sm btn-secondary" id="sf-email">
                            ${SendIcons.MAIL}
                        </button>
                        <button class="btn btn-sm btn-secondary" id="sf-print">
                            ${SendIcons.PRINT}
                        </button>
                    </div>

                    <!-- Share section -->
                    ${url ? `
                    <div class="sf-share">
                        <div class="sf-share-label">Download link</div>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" class="input" value="${this._esc(url)}" readonly
                                   style="flex: 1; font-size: 0.75rem; font-family: monospace;">
                            <button class="btn btn-sm btn-secondary" id="sf-copy-url">Copy</button>
                        </div>
                    </div>` : ''}

                    <!-- Transparency panel -->
                    <send-transparency id="transparency-panel" data-testid="transparency-panel"></send-transparency>

                    <!-- Timing -->
                    ${this._renderTimings()}

                    <!-- Send another -->
                    <div style="text-align: center; margin-top: 0.5rem;">
                        <a href="${window.location.origin}/${typeof I18n !== 'undefined' ? I18n.locale : 'en-gb'}/"
                           style="color: var(--accent); text-decoration: none; font-size: var(--text-sm);">
                            Send another file
                        </a>
                    </div>
                </div>

                <!-- Resizable divider -->
                <div class="sf-divider" id="sf-divider"></div>

                <!-- Content preview -->
                <div class="sf-preview" id="sf-preview" data-testid="download-preview"></div>
            </div>
        `;

        // Insert send-viewer into the preview panel
        const previewPanel = this.querySelector('#sf-preview');
        const viewer = document.createElement('send-viewer');
        viewer.fileBytes   = this.decryptedBytes;
        viewer.fileName    = this.fileName;
        viewer.fileType    = this._renderType;
        viewer.fileText    = this.decryptedText;
        viewer.downloadUrl = this._downloadUrl;
        viewer.transferId  = this.transferId;
        viewer.embedded    = true;
        previewPanel.appendChild(viewer);

        this._setupSingleFileListeners();
    }

    _renderTimings() {
        if (!this._stageTimestamps || !this._stageTimestamps.decrypting || !this._stageTimestamps.complete) return '';
        const totalMs = this._stageTimestamps.complete - this._stageTimestamps.decrypting;
        return `
            <div style="padding: 0.5rem 0.75rem; background: var(--accent-subtle, rgba(78,205,196,0.08));
                 border-radius: 6px; font-family: var(--font-mono, monospace); font-size: 0.75rem;">
                <span style="color: var(--accent, #4ECDC4); font-weight: 600;">
                    Decrypted in ${(totalMs / 1000).toFixed(2)}s
                </span>
            </div>
        `;
    }

    _setupSingleFileListeners() {
        // Save locally
        const saveBtn = this.querySelector('#sf-save');
        if (saveBtn) saveBtn.addEventListener('click', () => {
            this._saveFile(this.decryptedBytes, this.fileName || 'download');
        });

        // Copy link
        const copyLink = this.querySelector('#sf-copy-link');
        if (copyLink) copyLink.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this._downloadUrl || '');
                copyLink.textContent = 'Copied!';
                setTimeout(() => { copyLink.innerHTML = `${SendIcons.LINK_SM} Copy Link`; }, 2000);
            } catch (_) {}
        });

        // Copy URL from input
        const copyUrl = this.querySelector('#sf-copy-url');
        if (copyUrl) copyUrl.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this._downloadUrl || '');
                copyUrl.textContent = 'Copied!';
                setTimeout(() => { copyUrl.textContent = 'Copy'; }, 2000);
            } catch (_) {}
        });

        // Email
        const emailBtn = this.querySelector('#sf-email');
        if (emailBtn) emailBtn.addEventListener('click', () => {
            window.location.href = `mailto:?subject=Shared file via SG/Send&body=${encodeURIComponent(this._downloadUrl || '')}`;
        });

        // Print
        const printBtn = this.querySelector('#sf-print');
        if (printBtn) printBtn.addEventListener('click', () => window.print());

        // Resizable divider
        this._setupDividerDrag();
    }

    _setupDividerDrag() {
        const divider = this.querySelector('#sf-divider');
        const layout  = this.querySelector('.sf-layout');
        if (!divider || !layout) return;

        let dragging = false;

        divider.addEventListener('mousedown', (e) => {
            dragging = true;
            e.preventDefault();
            divider.style.background = 'var(--accent, #4ECDC4)';
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const rect  = layout.getBoundingClientRect();
            const width = Math.max(200, Math.min(e.clientX - rect.left, rect.width - 200));
            layout.style.gridTemplateColumns = `${width}px 4px 1fr`;
            try { localStorage.setItem('sg-send-split-width', width); } catch (_) {}
        });

        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                divider.style.background = 'transparent';
            }
        });
    }
}

customElements.define('send-download', SendDownload);
