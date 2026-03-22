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
        this.innerHTML = `
            <style>${SendViewer.CSS}</style>
            <div class="sv-container">
                <div class="sv-header">
                    <span class="sv-header__name">${SendHelpers.escapeHtml(this.fileName || 'File')}</span>
                    <span class="sv-header__size">${SendHelpers.formatBytes(this.fileBytes ? this.fileBytes.byteLength : 0)}</span>
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
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Static Assets
    // ═══════════════════════════════════════════════════════════════════════════

    // Icons are in SendIcons (send-icons.js)

    static CSS = `
.sv-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 80px);
    overflow: hidden;
}

.sv-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
}

.sv-header__name {
    font-weight: 600;
    font-size: 0.9rem;
    flex: 1;
}

.sv-header__size {
    font-size: 0.8rem;
    color: var(--color-text-secondary, #8892A0);
}

.sv-save-btn {
    background: var(--accent, #4ECDC4);
    color: #0a0e17;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.sv-save-btn:hover { opacity: 0.85; }

.sv-content {
    flex: 1;
    overflow: auto;
    min-height: 0;
}

.sv-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
    margin: auto;
    padding: 1rem;
    box-sizing: border-box;
}

.sv-markdown {
    background: white;
    color: #1a1a1a;
    padding: 2rem;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    min-height: 100%;
    box-sizing: border-box;
}

.sv-markdown h1, .sv-markdown h2 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
.sv-markdown code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
.sv-markdown pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
.sv-markdown pre code { background: none; padding: 0; }
.sv-markdown blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 1rem; color: #555; }
.sv-markdown table { border-collapse: collapse; width: 100%; }
.sv-markdown th, .sv-markdown td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.sv-markdown th { background: #f4f4f4; }

.sv-pdf {
    width: 100%;
    height: 100%;
    border: none;
}

.sv-code {
    margin: 0;
    padding: 1.5rem;
    font-size: 0.85rem;
    line-height: 1.5;
    background: #0d1117;
    color: #e6edf3;
    min-height: 100%;
    box-sizing: border-box;
    overflow: auto;
}

.sv-text-display {
    padding: 1.5rem;
    max-width: 800px;
    margin: 0 auto;
}

.sv-text-display pre {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 1.5rem;
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.sv-copy-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.15);
    color: var(--accent, #4ECDC4);
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
}

.sv-copy-btn:hover {
    border-color: var(--accent, #4ECDC4);
}
`;
}

customElements.define('send-viewer', SendViewer);
