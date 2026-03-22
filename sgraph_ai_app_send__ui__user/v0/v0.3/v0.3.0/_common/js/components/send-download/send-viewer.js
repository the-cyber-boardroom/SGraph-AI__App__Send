/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Viewer Component v0.3.0
   Clean rewrite — single file preview (markdown, image, PDF, code, text, audio, video)

   Used for non-zip single-file transfers.
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendViewer extends HTMLElement {

    constructor() {
        super();
        this.fileBytes  = null;
        this.fileName   = null;
        this.fileType   = null;
        this.fileText   = null;
        this._objectUrl = null;
    }

    connectedCallback() {
        if (this.fileBytes || this.fileText) this._build();
    }

    disconnectedCallback() {
        if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
    }

    _build() {
        SendViewer._injectCss();
        this.innerHTML = `
            <div class="sv-container">
                <div class="sv-header">
                    <span class="sv-header__name">${SendHelpers.escapeHtml(this.fileName || 'File')}</span>
                    <span class="sv-header__size">${SendHelpers.formatBytes(this.fileBytes ? this.fileBytes.byteLength : 0)}</span>
                    <button class="sv-save-btn" id="sv-print">${SendIcons.PRINT || '🖨️'} Print</button>
                    <button class="sv-save-btn" id="sv-save">${SendIcons.DOWNLOAD} Save locally</button>
                </div>
                <div class="sv-content" id="sv-content"></div>
            </div>
        `;

        this._renderContent();
        this._setupListeners();
    }

    _renderContent() {
        const content = this.querySelector('#sv-content');
        if (!content) return;

        const type = this.fileType;

        if (type === 'image') {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getImageMime(this.fileName) : 'image/jpeg';
            const blob = new Blob([this.fileBytes], { type: mime });
            this._objectUrl = URL.createObjectURL(blob);
            content.innerHTML = `<img src="${this._objectUrl}" class="sv-image" alt="${SendHelpers.escapeHtml(this.fileName)}">`;

        } else if (type === 'markdown') {
            const text = this.fileText || new TextDecoder().decode(this.fileBytes);
            const html = typeof MarkdownParser !== 'undefined' ? MarkdownParser.parse(text) : SendHelpers.escapeHtml(text);
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
            content.innerHTML = `<pre class="sv-code">${SendHelpers.escapeHtml(text)}</pre>`;

        } else if (this.fileText !== null) {
            // Fallback text display
            content.innerHTML = `
                <div class="sv-text-display">
                    <pre>${SendHelpers.escapeHtml(this.fileText)}</pre>
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="sv-copy-btn" id="sv-copy">Copy to clipboard</button>
                    </div>
                </div>`;

        } else {
            content.innerHTML = `
                <div style="padding: 3rem; text-align: center; color: var(--color-text-secondary);">
                    <p>File downloaded successfully.</p>
                    <p style="font-size: 0.85rem;">${SendHelpers.escapeHtml(this.fileName || 'download')} · ${SendHelpers.formatBytes(this.fileBytes ? this.fileBytes.byteLength : 0)}</p>
                </div>`;
        }
    }

    _setupListeners() {
        const saveBtn = this.querySelector('#sv-save');
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

        const copyBtn = this.querySelector('#sv-copy');
        if (copyBtn && this.fileText) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(this.fileText);
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy to clipboard'; }, 2000);
                } catch (_) {}
            });
        }

        const printBtn = this.querySelector('#sv-print');
        if (printBtn) {
            printBtn.addEventListener('click', () => this._print());
        }
    }

    _print() {
        var content = this.querySelector('#sv-content');
        if (!content) return;

        // Use sg-print if available (clean A4 output), otherwise window.print
        if (typeof SgPrint !== 'undefined' && SgPrint.print) {
            SgPrint.print(content.innerHTML, this.fileName || 'File');
        } else {
            var win = window.open('', '_blank');
            if (!win) return;
            win.document.write('<html><head><title>' + SendHelpers.escapeHtml(this.fileName || 'Print') + '</title>');
            win.document.write('<style>body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; } img { max-width: 100%; } pre { white-space: pre-wrap; }</style>');
            win.document.write('</head><body>');
            win.document.write(content.innerHTML);
            win.document.write('</body></html>');
            win.document.close();
            win.print();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CSS Loading
    // ═══════════════════════════════════════════════════════════════════════════

    static _cssInjected = false;

    static _injectCss() {
        if (SendViewer._cssInjected) return;
        SendViewer._cssInjected = true;
        const base = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath)
            || '../_common';
        const link  = document.createElement('link');
        link.rel    = 'stylesheet';
        link.href   = base + '/js/components/send-download/send-viewer.css';
        document.head.appendChild(link);
    }
}

customElements.define('send-viewer', SendViewer);
