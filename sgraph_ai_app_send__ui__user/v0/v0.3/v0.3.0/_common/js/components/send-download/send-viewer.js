/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Viewer Component v0.3.0 (extends SendComponent)
   Single file preview — markdown, image, PDF, code, text, audio, video

   Used for non-zip single-file transfers.
   Properties set by parent (send-download) before element is connected.
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendViewer extends SendComponent {

    /** Light DOM — CSS goes to document.head. No HTML template — dynamic render. */
    static useShadow   = false;
    static useTemplate = false;

    constructor() {
        super();
        this.fileBytes   = null;
        this.fileName    = null;
        this.fileType    = null;
        this.fileText    = null;
        this.downloadUrl = null;
        this.transferId  = null;
        this.embedded    = false;   // When true, render without header (used in two-column layout)
        this._objectUrl  = null;
    }

    async connectedCallback() {
        await this.loadResources();
        this._resourcesLoaded = true;
        if (this.fileBytes || this.fileText) this._build();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
    }

    _build() {
        if (this.embedded) {
            // No header — just content (used when embedded in single-file two-column layout)
            this.innerHTML = `<div class="sv-content" id="sv-content" style="height: 100%; overflow: auto;"></div>`;
            this._renderContent();
            return;
        }

        const url = this.downloadUrl || '';
        this.innerHTML = `
            <div class="sv-container">
                <div class="sv-header">
                    <span class="sv-header__name">${this.escapeHtml(this.fileName || 'File')}</span>
                    <span class="sv-header__size">${this.formatBytes(this.fileBytes ? this.fileBytes.byteLength : 0)}</span>
                    <button class="sv-action-btn" id="sv-share-toggle">${SendIcons.LINK_SM || '🔗'} Share</button>
                    <button class="sv-save-btn" id="sv-print">${SendIcons.PRINT || '🖨️'} Print</button>
                    <button class="sv-save-btn" id="sv-save">${SendIcons.DOWNLOAD} Save locally</button>
                </div>
                ${url ? `
                <div class="sv-share" id="sv-share" style="display: none;">
                    <div class="sv-share__row">
                        <span class="sv-share__label">Download link</span>
                        <div class="sv-share__input-row">
                            <input type="text" class="sv-share__url" value="${this.escapeHtml(url)}" readonly id="sv-share-url">
                            <button class="sv-action-btn" id="sv-copy-link">${SendIcons.LINK_SM || '🔗'} Copy</button>
                        </div>
                    </div>
                    <div class="sv-share__actions">
                        <button class="sv-action-btn" id="sv-email">${SendIcons.MAIL || '✉'} Email link</button>
                    </div>
                </div>` : ''}
                <div class="sv-content" id="sv-content"></div>
            </div>
        `;

        this._renderContent();
        this._setupListeners();
    }

    _renderContent() {
        const content = this.$('#sv-content');
        if (!content) return;

        const type = this.fileType;

        if (type === 'image') {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getImageMime(this.fileName) : 'image/jpeg';
            const blob = new Blob([this.fileBytes], { type: mime });
            this._objectUrl = URL.createObjectURL(blob);
            content.innerHTML = `<img src="${this._objectUrl}" class="sv-image" alt="${this.escapeHtml(this.fileName)}">`;

        } else if (type === 'markdown') {
            const text = this.fileText || new TextDecoder().decode(this.fileBytes);
            const html = typeof MarkdownParser !== 'undefined' ? MarkdownParser.parse(text) : this.escapeHtml(text);
            content.innerHTML = `<div class="sv-markdown">${html}</div>`;

        } else if (type === 'pdf') {
            const blob = new Blob([this.fileBytes], { type: 'application/pdf' });
            this._objectUrl = URL.createObjectURL(blob);
            content.innerHTML = `<iframe src="${this._objectUrl}" class="sv-pdf"></iframe>`;

        } else if (type === 'audio') {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getAudioMime(this.fileName) : 'audio/mpeg';
            const blob = new Blob([this.fileBytes], { type: mime });
            this._objectUrl = URL.createObjectURL(blob);
            content.innerHTML = `<div style="padding: 3rem; text-align: center;"><audio controls src="${this._objectUrl}" style="width: 100%; max-width: 600px;"></audio></div>`;

        } else if (type === 'video') {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getVideoMime(this.fileName) : 'video/mp4';
            const blob = new Blob([this.fileBytes], { type: mime });
            this._objectUrl = URL.createObjectURL(blob);
            content.innerHTML = `<video controls src="${this._objectUrl}" style="max-width: 100%; max-height: 80vh; display: block; margin: auto;"></video>`;

        } else if (type === 'code' || type === 'text') {
            const text = this.fileText || new TextDecoder().decode(this.fileBytes);
            content.innerHTML = `<pre class="sv-code">${this.escapeHtml(text)}</pre>`;

        } else if (this.fileText !== null) {
            content.innerHTML = `
                <div class="sv-text-display">
                    <pre>${this.escapeHtml(this.fileText)}</pre>
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="sv-copy-btn" id="sv-copy">Copy to clipboard</button>
                    </div>
                </div>`;

        } else {
            content.innerHTML = `
                <div style="padding: 3rem; text-align: center; color: var(--color-text-secondary);">
                    <p>File downloaded successfully.</p>
                    <p style="font-size: 0.85rem;">${this.escapeHtml(this.fileName || 'download')} · ${this.formatBytes(this.fileBytes ? this.fileBytes.byteLength : 0)}</p>
                </div>`;
        }
    }

    _setupListeners() {
        const saveBtn = this.$('#sv-save');
        if (saveBtn && this.fileBytes) {
            saveBtn.addEventListener('click', () => {
                const blob = new Blob([this.fileBytes]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = this.fileName || 'download';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }

        const copyBtn = this.$('#sv-copy');
        if (copyBtn && this.fileText) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await this.copyToClipboard(this.fileText);
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 2000);
                } catch (_) {}
            });
        }

        const printBtn = this.$('#sv-print');
        if (printBtn) {
            printBtn.addEventListener('click', () => this._print());
        }

        // Share panel toggle
        const shareToggle = this.$('#sv-share-toggle');
        const sharePanel  = this.$('#sv-share');
        if (shareToggle && sharePanel) {
            shareToggle.addEventListener('click', () => {
                const visible = sharePanel.style.display !== 'none';
                sharePanel.style.display = visible ? 'none' : '';
                shareToggle.classList.toggle('sv-action-btn--active', !visible);
            });
        }

        // Copy link
        const copyLink = this.$('#sv-copy-link');
        if (copyLink && this.downloadUrl) {
            copyLink.addEventListener('click', async () => {
                try {
                    await this.copyToClipboard(this.downloadUrl);
                    copyLink.textContent = 'Copied!';
                    setTimeout(() => { copyLink.innerHTML = `${SendIcons.LINK_SM || '🔗'} Copy`; }, 2000);
                } catch (_) {}
            });
        }

        // Email link
        const emailBtn = this.$('#sv-email');
        if (emailBtn && this.downloadUrl) {
            emailBtn.addEventListener('click', () => {
                window.location.href = `mailto:?subject=Shared file via SG/Send&body=${encodeURIComponent(this.downloadUrl)}`;
            });
        }
    }

    _print() {
        var content = this.$('#sv-content');
        if (!content) return;

        if (typeof SgPrint !== 'undefined' && SgPrint.print) {
            SgPrint.print(content.innerHTML, this.fileName || 'File');
        } else {
            var win = window.open('', '_blank');
            if (!win) return;
            win.document.write('<html><head><title>' + this.escapeHtml(this.fileName || 'Print') + '</title>');
            win.document.write('<style>body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; } img { max-width: 100%; } pre { white-space: pre-wrap; }</style>');
            win.document.write('</head><body>');
            win.document.write(content.innerHTML);
            win.document.write('</body></html>');
            win.document.close();
            win.print();
        }
    }
}

customElements.define('send-viewer', SendViewer);
