/* =============================================================================
   SG/Send — Download Component Override
   v0.1.8 — IFD surgical override (inline content rendering)

   Changes from v0.1.6:
     - renderComplete: route decrypted content through FileTypeDetect
     - Markdown files rendered via MarkdownParser inside sandboxed iframe
     - Image files displayed inline as object URLs
     - PDF files displayed in browser's native PDF viewer
     - Code files rendered with syntax highlighting (token-based)
     - "View raw" toggle for all rendered content
     - "Send another" link points to v0.1.8
   ============================================================================= */

(function() {
    'use strict';

    // ─── Override startDownload to capture render type ─────────────────

    const _origStartDownload = SendDownload.prototype.startDownload;

    SendDownload.prototype.startDownload = async function(keyOverride) {
        // Clear previous render state
        this._renderType = null;
        this._renderedHtml = null;
        this._objectUrl = null;
        this._showRaw = false;

        await _origStartDownload.call(this, keyOverride);

        // After base flow completes, detect render type
        if (this.state === 'complete' && this.decryptedBytes) {
            const filename = this.fileName || null;
            const contentType = (this.transferInfo && this.transferInfo.content_type_hint) || null;
            this._renderType = (typeof FileTypeDetect !== 'undefined')
                ? FileTypeDetect.detect(filename, contentType)
                : null;

            // For renderable types, re-render with inline view
            if (this._renderType && this._renderType !== 'text') {
                this.render();
                this.setupEventListeners();
            }
        }
    };

    // ─── Override renderComplete for inline rendering ─────────────────

    SendDownload.prototype.renderComplete = function() {
        if (this.state !== 'complete') return '';

        const sendAnotherHtml = `
            <div style="margin-top: var(--space-6, 1.5rem); text-align: center;">
                <a href="${window.location.origin}/send/v0/v0.1/v0.1.8/index.html" class="btn btn-sm" style="color: var(--accent, var(--color-primary)); text-decoration: none;">
                    ${this.escapeHtml(this.t('download.result.send_another'))}
                </a>
            </div>
        `;

        const timingHtml = typeof this._renderTimings === 'function' ? this._renderTimings() : '';

        // Route to inline renderer if applicable
        if (this._renderType && this._renderType !== 'text') {
            return this._renderInlineContent() + timingHtml + sendAnotherHtml;
        }

        // Fallback: existing text display or file download confirmation
        if (this.decryptedText !== null) {
            return `
                <div class="status status--success" style="font-size: var(--font-size-sm); padding: 0.5rem 0.75rem;">
                    ${this.escapeHtml(this.t('download.result.text_success'))}
                </div>
                <div style="margin-top: var(--space-4, 1rem);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3, 0.75rem);">
                        <h3 style="margin: 0; font-size: var(--text-h3, 1.1rem); font-weight: var(--weight-bold, 700); color: var(--color-text);">
                            ${this.escapeHtml(this.t('download.result.decrypted_message'))}
                        </h3>
                        <button class="btn btn-primary btn-sm" id="copy-text-btn">
                            ${this.escapeHtml(this.t('download.result.copy_text'))}
                        </button>
                    </div>
                    <pre id="decrypted-text" style="background: var(--accent-subtle, rgba(78, 205, 196, 0.12)); border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px); padding: var(--space-6, 1.25rem); white-space: pre-wrap; word-wrap: break-word; font-size: var(--text-body, 1rem); line-height: 1.6; max-height: 400px; overflow-y: auto; min-height: 60px; margin: 0; color: var(--color-text);"></pre>
                    <div style="text-align: right; margin-top: var(--space-2, 0.5rem);">
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

        return `
            <div class="status status--success">${this.escapeHtml(this.t('download.result.file_success'))}</div>
            <send-transparency id="transparency-panel"></send-transparency>
            ${timingHtml}
            ${sendAnotherHtml}
        `;
    };

    // ─── Inline Content Renderer ──────────────────────────────────────

    SendDownload.prototype._renderInlineContent = function() {
        const type = this._renderType;
        const filename = this.fileName || 'download';

        // Toolbar: filename + action buttons
        const toolbar = this._renderContentToolbar(filename, type);

        let contentHtml = '';

        switch (type) {
            case 'markdown':
                contentHtml = this._renderMarkdownContent();
                break;
            case 'image':
                contentHtml = this._renderImageContent();
                break;
            case 'pdf':
                contentHtml = this._renderPdfContent();
                break;
            case 'code':
                contentHtml = this._renderCodeContent();
                break;
            default:
                contentHtml = this._renderRawContent();
        }

        return `
            <div class="status status--success" style="font-size: var(--font-size-sm); padding: 0.5rem 0.75rem;">
                ${this.escapeHtml(this.t('download.result.file_success'))}
            </div>
            ${toolbar}
            <div id="content-display" style="margin-top: var(--space-3, 0.75rem);">
                ${contentHtml}
            </div>
            <send-transparency id="transparency-panel"></send-transparency>
        `;
    };

    // ─── Content Toolbar ──────────────────────────────────────────────

    SendDownload.prototype._renderContentToolbar = function(filename, type) {
        const langBadge = (type === 'code' && typeof FileTypeDetect !== 'undefined')
            ? `<span style="font-size: var(--text-small, 0.8rem); color: var(--accent); font-family: var(--font-mono); background: var(--accent-subtle, rgba(78,205,196,0.12)); padding: 2px 8px; border-radius: var(--radius-sm, 6px);">${this.escapeHtml(FileTypeDetect.getLanguage(filename))}</span>`
            : '';

        const typeBadge = (type === 'markdown')
            ? '<span style="font-size: var(--text-small, 0.8rem); color: var(--accent); font-family: var(--font-mono); background: var(--accent-subtle, rgba(78,205,196,0.12)); padding: 2px 8px; border-radius: var(--radius-sm, 6px);">markdown</span>'
            : '';

        const rawToggle = (type === 'markdown' || type === 'code')
            ? `<button class="btn btn-sm btn-secondary" id="toggle-raw-btn" style="font-size: var(--text-small, 0.8rem);">
                   ${this._showRaw ? 'View Rendered' : 'View Raw'}
               </button>`
            : '';

        return `
            <div style="margin-top: var(--space-4, 1rem); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-2, 0.5rem);">
                <div style="display: flex; align-items: center; gap: var(--space-2, 0.5rem);">
                    <h3 style="margin: 0; font-size: var(--text-h3, 1.1rem); font-weight: var(--weight-bold, 700); color: var(--color-text);">
                        ${this.escapeHtml(filename)}
                    </h3>
                    ${langBadge}${typeBadge}
                </div>
                <div style="display: flex; gap: var(--space-2, 0.5rem); align-items: center;">
                    ${rawToggle}
                    <button class="btn btn-sm btn-secondary" id="copy-content-btn">Copy</button>
                    <button class="btn btn-primary btn-sm" id="save-file-btn">Download</button>
                </div>
            </div>
        `;
    };

    // ─── Markdown Rendering (sandboxed iframe) ────────────────────────

    SendDownload.prototype._renderMarkdownContent = function() {
        if (this._showRaw) return this._renderRawContent();

        // Parse markdown to safe HTML
        const rawText = new TextDecoder().decode(this.decryptedBytes);
        const safeHtml = (typeof MarkdownParser !== 'undefined')
            ? MarkdownParser.parse(rawText)
            : this.escapeHtml(rawText);

        // Wrap in styled document for sandboxed iframe
        const iframeDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
        font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
        font-size: 1rem; line-height: 1.7; color: #E0E0E0;
        background: #1E2A4A; margin: 0; padding: 1.25rem;
        word-wrap: break-word; overflow-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 { color: #fff; margin: 1.5em 0 0.5em; line-height: 1.3; }
    h1 { font-size: 1.6rem; border-bottom: 1px solid rgba(78,205,196,0.2); padding-bottom: 0.3em; }
    h2 { font-size: 1.35rem; border-bottom: 1px solid rgba(78,205,196,0.1); padding-bottom: 0.2em; }
    h3 { font-size: 1.15rem; }
    p { margin: 0.8em 0; }
    a { color: #4ECDC4; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
        font-family: 'JetBrains Mono', monospace; font-size: 0.88em;
        background: rgba(78,205,196,0.1); padding: 0.15em 0.4em;
        border-radius: 4px; color: #4ECDC4;
    }
    pre { background: #16213E; border: 1px solid rgba(78,205,196,0.15);
          border-radius: 8px; padding: 1em; overflow-x: auto; margin: 1em 0; }
    pre code { background: none; padding: 0; color: #E0E0E0; font-size: 0.85em; }
    blockquote {
        border-left: 3px solid #4ECDC4; margin: 1em 0; padding: 0.5em 1em;
        background: rgba(78,205,196,0.05); color: #8892A0;
    }
    ul, ol { padding-left: 1.5em; margin: 0.8em 0; }
    li { margin: 0.3em 0; }
    hr { border: none; border-top: 1px solid rgba(78,205,196,0.2); margin: 1.5em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid rgba(78,205,196,0.2); padding: 0.5em 0.75em; text-align: left; }
    th { background: rgba(78,205,196,0.1); font-weight: 600; color: #fff; }
    del { color: #8892A0; }
    em { color: #8892A0; font-style: italic; }
    strong { color: #fff; }
    img { max-width: 100%; }
</style></head><body>${safeHtml}</body></html>`;

        // Encode as data URI for srcdoc-like behaviour
        const encoded = btoa(unescape(encodeURIComponent(iframeDoc)));

        return `
            <iframe id="md-iframe"
                    sandbox="allow-same-origin"
                    style="width: 100%; border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px);
                           background: #1E2A4A; min-height: 200px; max-height: 600px;"
                    src="data:text/html;base64,${encoded}"
                    title="Rendered markdown content"></iframe>
        `;
    };

    // ─── Image Rendering ──────────────────────────────────────────────

    SendDownload.prototype._renderImageContent = function() {
        const filename = this.fileName || 'image';
        const isSvg = (typeof FileTypeDetect !== 'undefined') && FileTypeDetect.isSvg(filename);

        if (isSvg) {
            // SVG can contain scripts — render inside sandboxed iframe
            const svgText = new TextDecoder().decode(this.decryptedBytes);
            const iframeDoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1E2A4A;}</style>
</head><body>${this.escapeHtml(svgText)}</body></html>`;
            const encoded = btoa(unescape(encodeURIComponent(iframeDoc)));
            return `
                <iframe id="svg-iframe"
                        sandbox=""
                        style="width: 100%; min-height: 300px; max-height: 600px; border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px); background: #1E2A4A;"
                        src="data:text/html;base64,${encoded}"
                        title="SVG image"></iframe>
            `;
        }

        // Raster images — create object URL
        const mime = (typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.getImageMime(filename)
            : 'application/octet-stream';
        const blob = new Blob([this.decryptedBytes], { type: mime });

        // Revoke previous object URL if any
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);

        return `
            <div style="text-align: center; padding: var(--space-4, 1rem); background: var(--bg-secondary, #16213E); border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px);">
                <img id="preview-image" src="${this._objectUrl}" alt="${this.escapeHtml(filename)}"
                     style="max-width: 100%; max-height: 500px; border-radius: var(--radius-sm, 6px); object-fit: contain;">
            </div>
        `;
    };

    // ─── PDF Rendering ────────────────────────────────────────────────

    SendDownload.prototype._renderPdfContent = function() {
        const blob = new Blob([this.decryptedBytes], { type: 'application/pdf' });
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);

        return `
            <iframe id="pdf-viewer"
                    src="${this._objectUrl}"
                    style="width: 100%; height: 600px; border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px); background: #fff;"
                    title="PDF document"></iframe>
        `;
    };

    // ─── Code Rendering (token-based syntax highlighting) ─────────────

    SendDownload.prototype._renderCodeContent = function() {
        if (this._showRaw) return this._renderRawContent();

        const rawText = new TextDecoder().decode(this.decryptedBytes);
        const lang = (typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.getLanguage(this.fileName)
            : 'text';

        const highlighted = this._highlightCode(rawText, lang);
        const lineCount = rawText.split('\n').length;

        // Line numbers + highlighted code
        const lineNums = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

        return `
            <div style="position: relative; border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px); overflow: hidden; background: #16213E;">
                <div style="display: flex; max-height: 500px; overflow-y: auto; font-family: var(--font-mono, monospace); font-size: 0.85rem; line-height: 1.6;">
                    <pre style="margin: 0; padding: 1em 0.75em; text-align: right; color: var(--color-text-secondary, #8892A0); user-select: none; border-right: 1px solid var(--color-border, rgba(78,205,196,0.15)); background: rgba(0,0,0,0.1); min-width: 3em;">${lineNums}</pre>
                    <pre style="margin: 0; padding: 1em; flex: 1; overflow-x: auto; color: var(--color-text, #E0E0E0);">${highlighted}</pre>
                </div>
            </div>
        `;
    };

    // ─── Token-based Syntax Highlighter ───────────────────────────────
    // Lightweight — no external dependencies. Covers common patterns.

    SendDownload.prototype._highlightCode = function(code, lang) {
        const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // Language-specific keyword sets
        const keywords = {
            javascript: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|default|async|await|new|this|try|catch|finally|throw|typeof|instanceof|in|of|switch|case|break|continue|do|yield|null|undefined|true|false)\b/g,
            typescript: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|default|async|await|new|this|try|catch|finally|throw|typeof|instanceof|in|of|switch|case|break|continue|do|yield|null|undefined|true|false|type|interface|enum|implements|declare|readonly|as|keyof|never|unknown|any|void)\b/g,
            python: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|and|or|not|in|is|None|True|False|pass|break|continue|global|nonlocal|assert|async|await|del)\b/g,
            go: /\b(func|package|import|var|const|type|struct|interface|map|chan|range|return|if|else|for|switch|case|break|continue|default|go|select|defer|nil|true|false|make|new|len|cap|append)\b/g,
            rust: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|mod|use|return|if|else|for|while|loop|match|break|continue|self|Self|super|crate|async|await|move|ref|type|where|unsafe|dyn|impl|true|false|None|Some|Ok|Err)\b/g,
            java: /\b(public|private|protected|class|interface|extends|implements|static|final|abstract|return|if|else|for|while|do|switch|case|break|continue|new|this|super|try|catch|finally|throw|throws|import|package|void|int|long|double|float|boolean|char|byte|short|null|true|false)\b/g,
            ruby: /\b(def|class|module|if|elsif|else|unless|while|until|for|do|end|return|yield|begin|rescue|ensure|raise|require|include|attr_accessor|attr_reader|attr_writer|nil|true|false|self|super|puts|print)\b/g,
            bash: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|export|source|echo|exit|test|read|set|unset|declare|readonly|shift|eval|exec|trap|wait|true|false)\b/g,
            sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|INTO|VALUES|SET|AND|OR|NOT|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|AS|IN|EXISTS|BETWEEN|LIKE|IS|DISTINCT|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|CHECK|UNIQUE)\b/gi,
            c: /\b(int|long|short|char|float|double|void|unsigned|signed|const|static|extern|auto|register|volatile|struct|union|enum|typedef|sizeof|return|if|else|for|while|do|switch|case|break|continue|default|goto|NULL|true|false|include|define|ifdef|ifndef|endif)\b/g,
            cpp: /\b(int|long|short|char|float|double|void|unsigned|signed|const|static|extern|auto|register|volatile|struct|union|enum|typedef|sizeof|return|if|else|for|while|do|switch|case|break|continue|default|goto|NULL|true|false|include|define|ifdef|ifndef|endif|class|public|private|protected|virtual|override|template|typename|namespace|using|new|delete|this|throw|try|catch|nullptr|constexpr|noexcept|decltype|auto)\b/g,
            php: /\b(function|class|extends|implements|public|private|protected|static|abstract|final|return|if|else|elseif|for|foreach|while|do|switch|case|break|continue|default|try|catch|finally|throw|new|echo|print|var|const|use|namespace|require|include|null|true|false|array|string|int|float|bool)\b/g,
        };

        // Tokenize: strings, comments, numbers, keywords
        const escaped = esc(code);

        // Apply highlighting with regex replacements
        let result = escaped;

        // Strings (double and single quoted)
        result = result.replace(/((&quot;|&#39;))(.*?)\1/g,
            '<span style="color:#98C379;">$1$3$1</span>');

        // Single-line comments
        result = result.replace(/(\/\/[^\n]*)/g,
            '<span style="color:#5C6370;font-style:italic;">$1</span>');

        // Hash comments (Python, Bash, Ruby)
        if (['python', 'bash', 'ruby', 'yaml', 'toml', 'ini'].includes(lang)) {
            result = result.replace(/(#[^\n]*)/g,
                '<span style="color:#5C6370;font-style:italic;">$1</span>');
        }

        // Numbers
        result = result.replace(/\b(\d+\.?\d*)\b/g,
            '<span style="color:#D19A66;">$1</span>');

        // Keywords
        const kwPattern = keywords[lang];
        if (kwPattern) {
            result = result.replace(kwPattern,
                '<span style="color:#C678DD;font-weight:500;">$&</span>');
        }

        return result;
    };

    // ─── Raw Content Renderer ─────────────────────────────────────────

    SendDownload.prototype._renderRawContent = function() {
        const rawText = new TextDecoder().decode(this.decryptedBytes);
        return `
            <pre style="background: #16213E; border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px); padding: var(--space-6, 1.25rem); white-space: pre-wrap; word-wrap: break-word; font-family: var(--font-mono, monospace); font-size: 0.85rem; line-height: 1.6; max-height: 500px; overflow-y: auto; margin: 0; color: var(--color-text, #E0E0E0);">${this.escapeHtml(rawText)}</pre>
        `;
    };

    // ─── Override setupEventListeners for new buttons ──────────────────

    const _origSetupEvents = SendDownload.prototype.setupEventListeners;

    SendDownload.prototype.setupEventListeners = function() {
        _origSetupEvents.call(this);

        // Toggle raw/rendered view
        const toggleBtn = this.querySelector('#toggle-raw-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this._showRaw = !this._showRaw;
                this.render();
                this.setupEventListeners();
            });
        }

        // Copy content (for rendered types)
        const copyBtn = this.querySelector('#copy-content-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (this.decryptedBytes) {
                    const text = new TextDecoder().decode(this.decryptedBytes);
                    this.copyToClipboard(text, copyBtn);
                }
            });
        }

        // Save file (for rendered types)
        const saveBtn = this.querySelector('#save-file-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (this.decryptedBytes) {
                    this.saveFile(this.decryptedBytes, this.fileName || 'download');
                }
            });
        }

        // Auto-resize markdown iframe
        const mdIframe = this.querySelector('#md-iframe');
        if (mdIframe) {
            mdIframe.addEventListener('load', () => {
                try {
                    const body = mdIframe.contentDocument.body;
                    const height = Math.min(Math.max(body.scrollHeight + 32, 200), 600);
                    mdIframe.style.height = height + 'px';
                } catch (e) { /* cross-origin fallback — use default height */ }
            });
        }
    };

    // ─── Cleanup object URLs on disconnect ────────────────────────────

    const _origCleanup = SendDownload.prototype.cleanup;

    SendDownload.prototype.cleanup = function() {
        if (this._objectUrl) {
            URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
        _origCleanup.call(this);
    };

    console.log('[v0.1.8] SendDownload patched: inline content rendering (markdown, images, PDF, code)');
})();
