/* =============================================================================
   SG/Send — Download Component Override
   v0.1.8 — IFD surgical override (two-column preview layout)

   Changes from v0.1.6:
     - startDownload: intercepts saveFile to prevent auto-download for
       previewable content (images, markdown, PDF, code)
     - renderComplete: two-column layout — details (1/3) + preview (2/3)
     - renderTransferInfo: hidden in preview mode (details panel shows same info)
     - Resizable divider between panels (drag to resize, persisted)
     - Prominent "Save Locally" button (no auto-download for previews)
     - send-download element breaks out of main for full-width preview
     - Non-preview siblings (CTA, disclaimer) stay constrained at 720px
     - Transparency panel: compact, sentence-case sections with left accent bar
     - Mobile responsive: stacks vertically on narrow screens
     - Markdown rendered via MarkdownParser in sandboxed iframe
     - Image files displayed inline as object URLs
     - PDF files displayed in browser's native PDF viewer
     - Code files rendered with syntax highlighting (token-based)
     - "View raw" toggle for markdown and code
     - "Send another" link points to v0.1.8
   ============================================================================= */

(function() {
    'use strict';

    // ─── Inject responsive + transparency styles (once) ─────────────

    if (!document.getElementById('v018-preview-styles')) {
        const style = document.createElement('style');
        style.id = 'v018-preview-styles';
        style.textContent = `
            /* Keep non-preview siblings centred when main expands */
            main.preview-expanded > *:not(send-download) {
                max-width: 672px;
                margin-left: auto;
                margin-right: auto;
            }

            /* Compact transparency panel inside the details sidebar */
            #details-panel .transparency {
                padding: var(--space-3, 12px) var(--space-4, 16px);
            }
            #details-panel .transparency__title {
                font-size: var(--text-small, 0.8rem);
                margin-bottom: var(--space-2, 0.5rem);
            }
            #details-panel .transparency__section-label {
                text-transform: none;
                font-size: var(--text-small, 0.8rem);
                letter-spacing: normal;
                color: var(--accent, #4ECDC4);
                border-left: 2px solid var(--accent, #4ECDC4);
                padding-left: var(--space-2, 0.5rem);
                margin-top: var(--space-3, 0.75rem);
                margin-bottom: var(--space-1, 0.25rem);
            }
            #details-panel .transparency__row {
                padding: 2px 0;
                font-size: var(--text-small, 0.8rem);
            }
            #details-panel .transparency__value {
                font-size: var(--text-small, 0.8rem);
            }
            #details-panel .transparency__footer {
                font-size: var(--text-small, 0.8rem);
                margin-top: var(--space-2, 0.5rem);
                padding-top: var(--space-2, 0.5rem);
            }

            /* Mobile: stack vertically */
            @media (max-width: 768px) {
                #preview-split {
                    grid-template-columns: 1fr !important;
                    grid-template-rows: minmax(250px, 50vh) auto !important;
                    max-height: none !important;
                }
                #split-resize { display: none !important; }
                #preview-panel { order: -1; }
                #details-panel { padding-right: 0 !important; }
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Override renderTransferInfo — hide in preview mode ────────
    //     The details panel already shows filename, type, size, date.

    const _origRenderTransferInfo = SendDownload.prototype.renderTransferInfo;

    SendDownload.prototype.renderTransferInfo = function() {
        if (this.state === 'complete' && this._renderType && this._renderType !== 'text') {
            return '';
        }
        return _origRenderTransferInfo.call(this);
    };

    // ─── Override startDownload — intercept saveFile for previewable types

    const _origStartDownload = SendDownload.prototype.startDownload;

    SendDownload.prototype.startDownload = async function(keyOverride) {
        // Clear previous render state
        this._renderType = null;
        this._objectUrl  = null;
        this._showRaw    = false;

        // Temporarily intercept saveFile so we can suppress auto-download
        // for previewable types. The base startDownload calls saveFile()
        // at line 386 for non-text content — we need to catch that.
        const origSaveFile = this.saveFile.bind(this);
        let pendingSave = null;

        this.saveFile = function(data, filename) {
            // Detect render type before deciding whether to auto-download
            const renderType = (typeof FileTypeDetect !== 'undefined')
                ? FileTypeDetect.detect(filename, null)
                : null;

            if (renderType && renderType !== 'text') {
                // Previewable — suppress auto-download, store for later
                pendingSave = { data, filename };
            } else {
                // Not previewable — download immediately as normal
                origSaveFile(data, filename);
            }
        };

        await _origStartDownload.call(this, keyOverride);

        // Restore original saveFile
        this.saveFile = origSaveFile;

        // After base flow completes, detect render type
        if (this.state === 'complete' && this.decryptedBytes) {
            const filename    = this.fileName || null;
            const contentType = (this.transferInfo && this.transferInfo.content_type_hint) || null;
            this._renderType  = (typeof FileTypeDetect !== 'undefined')
                ? FileTypeDetect.detect(filename, contentType)
                : null;

            // For renderable types, re-render with two-column preview
            if (this._renderType && this._renderType !== 'text') {
                this.render();
                this.setupEventListeners();
            }
        }
    };

    // ─── Override render — expand main + constrain siblings ────────

    const _origRender = SendDownload.prototype.render;

    SendDownload.prototype.render = function() {
        _origRender.call(this);

        const isPreview = this.state === 'complete' && this._renderType && this._renderType !== 'text';
        const main = this.closest('main');
        if (main) {
            if (isPreview) {
                main.style.maxWidth = 'calc(100vw - 2rem)';
                main.style.width    = '100%';
                main.classList.add('preview-expanded');
            } else {
                main.style.maxWidth = '';
                main.style.width    = '';
                main.classList.remove('preview-expanded');
            }
        }
    };

    // ─── Override renderComplete — two-column preview layout ─────────

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

        // Route to two-column preview layout for previewable types
        if (this._renderType && this._renderType !== 'text') {
            return this._renderTwoColumnLayout(timingHtml, sendAnotherHtml);
        }

        // Fallback: text display
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

        // Fallback: non-previewable file (already auto-downloaded)
        return `
            <div class="status status--success">${this.escapeHtml(this.t('download.result.file_success'))}</div>
            <send-transparency id="transparency-panel"></send-transparency>
            ${timingHtml}
            ${sendAnotherHtml}
        `;
    };

    // ─── Two-Column Layout ───────────────────────────────────────────

    SendDownload.prototype._renderTwoColumnLayout = function(timingHtml, sendAnotherHtml) {
        const filename = this.fileName || 'download';
        const type     = this._renderType;

        // Type badge label
        const badgeLabel = (type === 'code' && typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.getLanguage(filename)
            : type;

        // Transfer metadata
        const sizeStr    = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
        const uploadDate = this.transferInfo ? this.formatTimestamp(this.transferInfo.created_at) : '';
        const downloads  = this.transferInfo ? (this.transferInfo.download_count || 0) : 0;

        // Raw toggle (for markdown and code)
        const rawToggle = (type === 'markdown' || type === 'code')
            ? `<button class="btn btn-sm btn-secondary" id="toggle-raw-btn" style="width: 100%; font-size: var(--font-size-sm);">
                   ${this._showRaw ? 'View Rendered' : 'View Raw'}
               </button>`
            : '';

        // Preview content
        let contentHtml = '';
        switch (type) {
            case 'markdown': contentHtml = this._renderMarkdownContent(); break;
            case 'image':    contentHtml = this._renderImageContent();    break;
            case 'pdf':      contentHtml = this._renderPdfContent();      break;
            case 'code':     contentHtml = this._renderCodeContent();     break;
            default:         contentHtml = this._renderRawContent();
        }

        // Load persisted split width
        const savedWidth = this._loadSplitWidth();

        return `
            <div class="status status--success" style="font-size: var(--font-size-sm); padding: 0.5rem 0.75rem; margin-bottom: var(--space-4, 1rem);">
                ${this.escapeHtml(this.t('download.result.file_success'))}
            </div>

            <div id="preview-split" style="
                display: grid;
                grid-template-columns: ${savedWidth}px 4px 1fr;
                gap: 0;
                min-height: 400px;
                max-height: 80vh;
            ">
                <!-- Left: Details Panel -->
                <div id="details-panel" style="
                    overflow-y: auto;
                    padding-right: var(--space-4, 1rem);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-4, 1rem);
                ">
                    <!-- File info -->
                    <div>
                        <h3 style="margin: 0 0 var(--space-2, 0.5rem) 0; font-size: var(--text-h3, 1.1rem); font-weight: var(--weight-bold, 700); color: var(--color-text); word-break: break-all;">
                            ${this.escapeHtml(filename)}
                        </h3>
                        <div style="display: flex; flex-wrap: wrap; gap: var(--space-2, 0.5rem); margin-bottom: var(--space-3, 0.75rem);">
                            <span style="font-size: var(--text-small, 0.8rem); color: var(--accent); font-family: var(--font-mono); background: var(--accent-subtle, rgba(78,205,196,0.12)); padding: 2px 8px; border-radius: var(--radius-sm, 6px);">${this.escapeHtml(badgeLabel)}</span>
                            <span style="font-size: var(--text-small, 0.8rem); color: var(--color-text-secondary); font-family: var(--font-mono);">${this.escapeHtml(sizeStr)}</span>
                        </div>
                        <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); display: flex; flex-direction: column; gap: var(--space-1, 0.25rem);">
                            <div>Uploaded: ${this.escapeHtml(uploadDate)}</div>
                            ${downloads > 0 ? `<div>Downloads: ${downloads}</div>` : ''}
                        </div>
                    </div>

                    <!-- SAVE LOCALLY — large, prominent, primary -->
                    <button class="btn btn-primary" id="save-file-btn" style="
                        width: 100%;
                        padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
                        font-size: var(--text-body, 1rem);
                        font-weight: var(--weight-bold, 700);
                        border-radius: var(--radius-md, 12px);
                        letter-spacing: 0.02em;
                    ">
                        Save Locally
                    </button>

                    <!-- Secondary actions -->
                    <div style="display: flex; gap: var(--space-2, 0.5rem);">
                        <button class="btn btn-sm btn-secondary" id="copy-content-btn" style="flex: 1;">Copy</button>
                    </div>

                    ${rawToggle}

                    <!-- Transparency panel -->
                    <send-transparency id="transparency-panel"></send-transparency>

                    ${timingHtml}
                    ${sendAnotherHtml}
                </div>

                <!-- Resize Handle -->
                <div id="split-resize" style="
                    cursor: col-resize;
                    background: transparent;
                    transition: background 0.15s;
                    z-index: 10;
                    border-radius: 2px;
                "></div>

                <!-- Right: Preview Panel -->
                <div id="preview-panel" style="
                    overflow: auto;
                    border: 2px solid var(--accent, #4ECDC4);
                    border-radius: var(--radius-md, 12px);
                    background: var(--bg-secondary, #16213E);
                ">
                    ${contentHtml}
                </div>
            </div>
        `;
    };

    // ─── Markdown Rendering (sandboxed iframe) ──────────────────────

    SendDownload.prototype._renderMarkdownContent = function() {
        if (this._showRaw) return this._renderRawContent();

        const rawText  = new TextDecoder().decode(this.decryptedBytes);
        const safeHtml = (typeof MarkdownParser !== 'undefined')
            ? MarkdownParser.parse(rawText)
            : this.escapeHtml(rawText);

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

        const encoded = btoa(unescape(encodeURIComponent(iframeDoc)));

        return `
            <iframe id="md-iframe"
                    sandbox="allow-same-origin"
                    style="width: 100%; height: 100%; border: none; background: #1E2A4A; display: block;"
                    src="data:text/html;base64,${encoded}"
                    title="Rendered markdown content"></iframe>
        `;
    };

    // ─── Image Rendering ────────────────────────────────────────────

    SendDownload.prototype._renderImageContent = function() {
        const filename = this.fileName || 'image';
        const isSvg = (typeof FileTypeDetect !== 'undefined') && FileTypeDetect.isSvg(filename);

        if (isSvg) {
            const svgText  = new TextDecoder().decode(this.decryptedBytes);
            const iframeDoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1E2A4A;}</style>
</head><body>${this.escapeHtml(svgText)}</body></html>`;
            const encoded = btoa(unescape(encodeURIComponent(iframeDoc)));
            return `
                <iframe id="svg-iframe"
                        sandbox=""
                        style="width: 100%; height: 100%; border: none; background: #1E2A4A; display: block;"
                        src="data:text/html;base64,${encoded}"
                        title="SVG image"></iframe>
            `;
        }

        // Raster images — create object URL
        const mime = (typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.getImageMime(filename)
            : 'application/octet-stream';
        const blob = new Blob([this.decryptedBytes], { type: mime });

        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);

        return `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding: var(--space-4, 1rem);">
                <img id="preview-image" src="${this._objectUrl}" alt="${this.escapeHtml(filename)}"
                     style="max-width: 100%; max-height: 100%; border-radius: var(--radius-sm, 6px); object-fit: contain;">
            </div>
        `;
    };

    // ─── PDF Rendering ──────────────────────────────────────────────

    SendDownload.prototype._renderPdfContent = function() {
        const blob = new Blob([this.decryptedBytes], { type: 'application/pdf' });
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(blob);

        return `
            <iframe id="pdf-viewer"
                    src="${this._objectUrl}"
                    style="width: 100%; height: 100%; border: none; background: #fff; display: block;"
                    title="PDF document"></iframe>
        `;
    };

    // ─── Code Rendering (token-based syntax highlighting) ───────────

    SendDownload.prototype._renderCodeContent = function() {
        if (this._showRaw) return this._renderRawContent();

        const rawText = new TextDecoder().decode(this.decryptedBytes);
        const lang    = (typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.getLanguage(this.fileName)
            : 'text';

        const highlighted = this._highlightCode(rawText, lang);
        const lineCount   = rawText.split('\n').length;
        const lineNums    = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

        return `
            <div style="height: 100%; overflow: auto; font-family: var(--font-mono, monospace); font-size: 0.85rem; line-height: 1.6; display: flex;">
                <pre style="margin: 0; padding: 1em 0.75em; text-align: right; color: var(--color-text-secondary, #8892A0); user-select: none; border-right: 1px solid var(--color-border, rgba(78,205,196,0.15)); background: rgba(0,0,0,0.1); min-width: 3em; position: sticky; left: 0;">${lineNums}</pre>
                <pre style="margin: 0; padding: 1em; flex: 1; overflow-x: auto; color: var(--color-text, #E0E0E0);">${highlighted}</pre>
            </div>
        `;
    };

    // ─── Token-based Syntax Highlighter ─────────────────────────────

    SendDownload.prototype._highlightCode = function(code, lang) {
        const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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

        const escaped = esc(code);
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

    // ─── Raw Content Renderer ───────────────────────────────────────

    SendDownload.prototype._renderRawContent = function() {
        const rawText = new TextDecoder().decode(this.decryptedBytes);
        return `
            <pre style="height: 100%; overflow: auto; margin: 0; padding: var(--space-6, 1.25rem); white-space: pre-wrap; word-wrap: break-word; font-family: var(--font-mono, monospace); font-size: 0.85rem; line-height: 1.6; color: var(--color-text, #E0E0E0);">${this.escapeHtml(rawText)}</pre>
        `;
    };

    // ─── Split Width Persistence ────────────────────────────────────

    SendDownload.prototype._loadSplitWidth = function() {
        try {
            const raw = localStorage.getItem('sgraph-send-split-width');
            if (raw) {
                const w = parseInt(raw, 10);
                if (w >= 200 && w <= 600) return w;
            }
        } catch (_) {}
        return 300; // default ~1/3 on typical screens
    };

    SendDownload.prototype._saveSplitWidth = function(width) {
        try {
            localStorage.setItem('sgraph-send-split-width', String(width));
        } catch (_) {}
    };

    // ─── Resize Handler (follows admin-shell pattern) ───────────────

    SendDownload.prototype._setupResize = function() {
        const handle = this.querySelector('#split-resize');
        const split  = this.querySelector('#preview-split');
        if (!handle || !split) return;

        let isResizing = false;
        let startX, startWidth;

        const onMouseDown = (e) => {
            isResizing = true;
            startX     = e.clientX;
            const details = this.querySelector('#details-panel');
            startWidth = details ? details.offsetWidth : 300;
            handle.style.background = 'var(--accent, #4ECDC4)';
            document.body.style.cursor     = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const diff     = e.clientX - startX;
            const newWidth = Math.min(Math.max(startWidth + diff, 200), 600);
            split.style.gridTemplateColumns = `${newWidth}px 4px 1fr`;
            this._currentSplitWidth = newWidth;
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            handle.style.background        = '';
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
            if (this._currentSplitWidth) {
                this._saveSplitWidth(this._currentSplitWidth);
            }
        };

        // Hover effect
        handle.addEventListener('mouseenter', () => {
            if (!isResizing) handle.style.background = 'var(--accent, #4ECDC4)';
        });
        handle.addEventListener('mouseleave', () => {
            if (!isResizing) handle.style.background = '';
        });

        handle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        this._resizeCleanup = () => {
            handle.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    };

    // ─── Override setupEventListeners for preview buttons ───────────

    const _origSetupEvents = SendDownload.prototype.setupEventListeners;

    SendDownload.prototype.setupEventListeners = function() {
        _origSetupEvents.call(this);

        // Setup resizable divider
        this._setupResize();

        // Toggle raw/rendered view
        const toggleBtn = this.querySelector('#toggle-raw-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this._showRaw = !this._showRaw;
                this.render();
                this.setupEventListeners();
            });
        }

        // Copy content
        const copyBtn = this.querySelector('#copy-content-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (this.decryptedBytes) {
                    const text = new TextDecoder().decode(this.decryptedBytes);
                    this.copyToClipboard(text, copyBtn);
                }
            });
        }

        // Save file (explicit user action — no auto-download)
        const saveBtn = this.querySelector('#save-file-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (this.decryptedBytes) {
                    this.saveFile(this.decryptedBytes, this.fileName || 'download');
                }
            });
        }
    };

    // ─── Cleanup object URLs + resize listeners ─────────────────────

    const _origCleanup = SendDownload.prototype.cleanup;

    SendDownload.prototype.cleanup = function() {
        if (this._objectUrl) {
            URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
        if (this._resizeCleanup) {
            this._resizeCleanup();
            this._resizeCleanup = null;
        }
        // Restore main width + class
        const main = this.closest('main');
        if (main) {
            main.style.maxWidth = '';
            main.style.width    = '';
            main.classList.remove('preview-expanded');
        }
        _origCleanup.call(this);
    };

    console.log('[v0.1.8] SendDownload patched: two-column preview layout, no auto-download for previewable files');
})();
