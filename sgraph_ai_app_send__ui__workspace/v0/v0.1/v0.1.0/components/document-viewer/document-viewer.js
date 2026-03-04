/* =============================================================================
   SGraph Workspace — Document Viewer
   v0.1.0 — Type-aware file rendering with source/rendered toggle

   Two instances live in the workspace shell:
     <document-viewer data-role="source">    — shows the original file
     <document-viewer data-role="transform"> — shows the LLM output

   The source viewer listens for 'file-selected' events from vault-panel,
   downloads + decrypts the file, detects its type, and renders it.

   Supported render types (via FileTypeDetect):
     'markdown' — parsed to HTML via MarkdownParser (safe subset)
     'code'     — syntax-highlighted <pre><code> with language label
     'text'     — plain text in <pre>
     'html'     — rendered in sandboxed iframe
     'image'    — inline <img> from blob URL
     'pdf'      — embedded via <object> from blob URL
     null       — binary — shows metadata only

   Source/Rendered toggle: user can switch between rendered view and raw
   source text for any text-based format.
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatSize(bytes) {
        if (bytes == null) return '';
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824)  return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    // --- Component -----------------------------------------------------------

    class DocumentViewer extends HTMLElement {

        constructor() {
            super();
            this._content    = null;    // Uint8Array (raw decrypted bytes)
            this._textContent = null;   // string (decoded text, if text-based)
            this._filename   = null;
            this._fileType   = null;    // from FileTypeDetect
            this._renderType = null;    // 'markdown' | 'code' | 'text' | 'html' | 'image' | 'pdf' | null
            this._mode       = 'rendered';  // 'rendered' | 'source' | 'edit'
            this._blobUrl    = null;
            this._version    = 0;
            this._loading    = false;
            this._unsub      = null;
            this._dirty      = false;       // true when user has edited content
        }

        connectedCallback() {
            this._role = this.dataset.role || 'viewer';
            this._renderEmpty();

            // Only the 'source' viewer auto-loads files from the vault
            if (this._role === 'source') {
                const handler = (data) => this._onFileSelected(data);
                window.sgraphWorkspace.events.on('file-selected', handler);
                this._unsub = () => window.sgraphWorkspace.events.off('file-selected', handler);
            }

            window.sgraphWorkspace.events.emit('document-viewer-ready', { role: this._role });
        }

        disconnectedCallback() {
            if (this._unsub) this._unsub();
            this._revokeBlobUrl();
        }

        // --- Public API --------------------------------------------------------

        /** Load raw content directly (used by LLM chat to set transform output) */
        loadText(text, filename) {
            this._textContent = text;
            this._content     = new TextEncoder().encode(text);
            this._filename    = filename || 'output.md';
            this._detectType();
            this._version++;
            this._renderContent();

            window.sgraphWorkspace.events.emit('document-loaded', {
                role: this._role, filename: this._filename, type: this._renderType
            });
        }

        /** Load raw bytes (used by vault decryption pipeline) */
        loadBytes(bytes, filename, mimeType) {
            this._content  = bytes;
            this._filename = filename;
            this._detectType();
            // Try to decode as text if it's a text-based type
            if (this._renderType && this._renderType !== 'image' && this._renderType !== 'pdf') {
                try {
                    this._textContent = new TextDecoder().decode(bytes);
                } catch (_) {
                    this._textContent = null;
                }
            } else {
                this._textContent = null;
            }
            this._version++;
            this._renderContent();

            window.sgraphWorkspace.events.emit('document-loaded', {
                role: this._role, filename: this._filename, type: this._renderType
            });
        }

        clear() {
            this._content     = null;
            this._textContent = null;
            this._filename    = null;
            this._renderType  = null;
            this._mode        = 'rendered';
            this._dirty       = false;
            this._revokeBlobUrl();
            this._renderEmpty();
        }

        getContent()     { return this._content; }
        getTextContent() { return this._textContent; }
        getFilename()    { return this._filename; }
        getRenderType()  { return this._renderType; }
        getVersion()     { return this._version; }

        /** Save current content to vault as a view file (view-N.html) */
        async saveToVault() {
            if (!this._content || !this._filename) {
                window.sgraphWorkspace.messages.warning('Nothing to save');
                return;
            }

            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel || vaultPanel.getState() !== 'open') {
                window.sgraphWorkspace.messages.error('Vault is not open — cannot save');
                return;
            }

            // Use custom name from input if provided, else auto-number
            const nameInput = this.querySelector('.dv-view-name');
            const customName = nameInput ? nameInput.value.trim() : '';

            let saveName;
            if (customName) {
                // Ensure it has the right extension
                const ext = this._filename.includes('.') ? '.' + this._filename.split('.').pop() : '.html';
                saveName = customName.endsWith(ext) ? customName
                         : customName.startsWith('view-') ? customName + ext
                         : 'view-' + customName + ext;
            } else {
                // Auto-number: find next available view-N
                const ext = this._filename.includes('.') ? '.' + this._filename.split('.').pop() : '.html';
                const vault = vaultPanel.getVault();
                const currentPath = vaultPanel.getCurrentPath ? vaultPanel.getCurrentPath() : '/';
                let nextNum = 1;
                if (vault) {
                    try {
                        const items = vault.listFolder(currentPath) || [];
                        const viewNums = items
                            .map(i => i.name.match(/^view-(\d+)\./))
                            .filter(Boolean)
                            .map(m => parseInt(m[1]));
                        if (viewNums.length > 0) nextNum = Math.max(...viewNums) + 1;
                    } catch (_) { /* ignore */ }
                }
                saveName = `view-${nextNum}${ext}`;
            }

            this._setSaveState('saving');
            window.sgraphWorkspace.messages.info(`Saving as "${saveName}"...`);

            try {
                const result = await vaultPanel.saveFile(this._content, saveName);
                this._setSaveState('saved');
                window.sgraphWorkspace.messages.success(`"${saveName}" saved to vault`);
                window.sgraphWorkspace.events.emit('file-saved', {
                    role: this._role, fileId: result.fileId, name: saveName
                });

                // Clear custom name input
                if (nameInput) nameInput.value = '';

                // Reset save button after 2s
                setTimeout(() => this._setSaveState('idle'), 2000);
            } catch (e) {
                console.error('[document-viewer] Save to vault failed:', e);
                this._setSaveState('idle');
                window.sgraphWorkspace.messages.error('Save failed: ' + e.message);
            }
        }

        _setSaveState(state) {
            this._saveState = state;
            const btn = this.querySelector('.dv-save-btn');
            if (!btn) return;
            if (state === 'saving') {
                btn.disabled = true;
                btn.textContent = 'Saving...';
            } else if (state === 'saved') {
                btn.disabled = true;
                btn.textContent = 'Saved!';
                btn.classList.add('dv-save-btn--saved');
            } else {
                btn.disabled = false;
                btn.textContent = 'Save';
                btn.classList.remove('dv-save-btn--saved');
            }
        }

        // --- File detection ----------------------------------------------------

        _detectType() {
            if (typeof FileTypeDetect !== 'undefined') {
                this._renderType = FileTypeDetect.detect(this._filename, null);
            }

            // Override: HTML files must render as 'html' (iframe), not 'code'
            // FileTypeDetect may classify .html as 'code' — force correct type
            const ext = (this._filename || '').split('.').pop().toLowerCase();
            if (['html', 'htm'].includes(ext)) {
                this._renderType = 'html';
                return;
            }

            // Fallback for types FileTypeDetect doesn't cover (e.g. .txt) or if it's not loaded
            if (!this._renderType && this._filename) {
                const textExts = ['md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'xml', 'csv', 'log', 'cfg', 'conf'];
                const codeExts = ['js', 'ts', 'py', 'css', 'sh', 'sql', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'php'];
                if (['md', 'markdown'].includes(ext)) this._renderType = 'markdown';
                else if (codeExts.includes(ext))       this._renderType = 'code';
                else if (textExts.includes(ext))       this._renderType = 'text';
                else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) this._renderType = 'image';
                else if (ext === 'pdf')                this._renderType = 'pdf';
            }
        }

        // --- Event handler: file-selected from vault-panel ---------------------

        async _onFileSelected(data) {
            if (this._loading) return;
            this._loading = true;
            this._filename = data.name;
            this._renderLoading(data.name);

            try {
                // Get vault panel reference for file decryption via SGVault
                const vaultPanel = document.querySelector('vault-panel');
                if (!vaultPanel) throw new Error('Vault panel not found');

                const vault = vaultPanel.getVault();
                if (!vault) throw new Error('Vault is not open');

                // Download + decrypt file via SGVault (Transfer API)
                const plaintext = await vault.getFile(data.folderPath, data.name);

                // Load into viewer
                this.loadBytes(new Uint8Array(plaintext), data.name, data.type);

                window.sgraphWorkspace.messages.success('"' + data.name + '" loaded');
            } catch (e) {
                console.error('[document-viewer] Failed to load file:', e);
                this._renderError(data.name, e.message);
                window.sgraphWorkspace.messages.error('Failed to load "' + data.name + '": ' + e.message);
            }

            this._loading = false;
        }

        // --- Blob URL management -----------------------------------------------

        _revokeBlobUrl() {
            if (this._blobUrl) {
                URL.revokeObjectURL(this._blobUrl);
                this._blobUrl = null;
            }
        }

        _createBlobUrl(data, mimeType) {
            this._revokeBlobUrl();
            const blob = new Blob([data], { type: mimeType });
            this._blobUrl = URL.createObjectURL(blob);
            return this._blobUrl;
        }

        // --- Render: States ----------------------------------------------------

        _renderEmpty() {
            this.innerHTML = `
                <div class="dv-empty">
                    <div class="dv-empty-icon">
                        ${this._role === 'source' ? '&#128196;' : '&#10024;'}
                    </div>
                    ${this._role === 'source'
                        ? 'Select a file from the vault<br>to load it here.'
                        : 'Transformation output<br>will appear here.'}
                </div>
                <style>${DocumentViewer.styles}</style>`;
        }

        _renderLoading(filename) {
            this.innerHTML = `
                <div class="dv-empty">
                    <div class="dv-spinner">/</div>
                    <div>Decrypting "${esc(filename)}"...</div>
                </div>
                <style>${DocumentViewer.styles}</style>`;
        }

        _renderError(filename, error) {
            this.innerHTML = `
                <div class="dv-empty">
                    <div class="dv-empty-icon" style="color: var(--ws-error, #E94560);">&#9888;</div>
                    <div>Failed to load "${esc(filename)}"</div>
                    <div class="dv-error-detail">${esc(error)}</div>
                </div>
                <style>${DocumentViewer.styles}</style>`;
        }

        // --- Render: Content ---------------------------------------------------

        _renderContent() {
            const isTextBased = this._renderType && !['image', 'pdf'].includes(this._renderType);
            const lang = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getLanguage(this._filename) : 'text';

            // Toolbar: filename + toggle + save button
            // HTML files get custom labels: "Browser" (iframe) and "HTML Code" (source)
            const isHtml  = this._renderType === 'html';
            const renderedLabel = isHtml ? 'Browser'   : 'Rendered';
            const sourceLabel   = isHtml ? 'HTML Code'  : 'Source';
            const canSave = this._content;
            const toolbar = `
                <div class="dv-toolbar">
                    <span class="dv-filename">${esc(this._filename || 'untitled')}</span>
                    <span class="dv-filetype">${esc(this._renderType || 'binary')}</span>
                    ${this._dirty ? '<span class="dv-dirty-badge">modified</span>' : ''}
                    ${isTextBased ? `
                        <div class="dv-toggle">
                            <button class="dv-toggle-btn ${this._mode === 'rendered' ? 'dv-toggle-btn--active' : ''}"
                                    data-mode="rendered">${renderedLabel}</button>
                            <button class="dv-toggle-btn ${this._mode === 'source' ? 'dv-toggle-btn--active' : ''}"
                                    data-mode="source">${sourceLabel}</button>
                            <button class="dv-toggle-btn ${this._mode === 'edit' ? 'dv-toggle-btn--active' : ''}"
                                    data-mode="edit">Edit</button>
                        </div>
                    ` : ''}
                    ${this._content ? `<span class="dv-filesize">${formatSize(this._content.byteLength)}</span>` : ''}
                    ${canSave ? `
                        <input class="dv-view-name" type="text" placeholder="view name..." title="Custom view name (e.g. dark-mode). Leave empty for auto-numbering.">
                        <button class="dv-save-btn">Save</button>
                    ` : ''}
                </div>`;

            let body = '';

            if (this._mode === 'edit' && isTextBased) {
                // Edit mode: editable textarea
                body = `<div class="dv-edit"><textarea class="dv-editor" spellcheck="false">${esc(this._textContent || '')}</textarea></div>`;
            } else if (this._mode === 'source' && isTextBased && this._textContent) {
                // Source mode: show as code block with language label
                const srcLang = isHtml ? 'html' : (lang || 'text');
                body = this._renderCode(srcLang);
            } else {
                // Rendered mode: type-specific
                switch (this._renderType) {
                    case 'markdown':
                        body = this._renderMarkdown();
                        break;
                    case 'code':
                        body = this._renderCode(lang);
                        break;
                    case 'text':
                        body = `<div class="dv-text"><pre class="dv-pre">${esc(this._textContent || '')}</pre></div>`;
                        break;
                    case 'html':
                        body = this._renderHtml();
                        break;
                    case 'image':
                        body = this._renderImage();
                        break;
                    case 'pdf':
                        body = this._renderPdf();
                        break;
                    default:
                        body = this._renderBinary();
                        break;
                }
            }

            this.innerHTML = `
                ${toolbar}
                <div class="dv-body">${body}</div>
                <style>${DocumentViewer.styles}</style>`;

            this._bindToggle();
        }

        // --- Render: Type-specific ---------------------------------------------

        _renderMarkdown() {
            if (!this._textContent) return '<div class="dv-text">No text content</div>';
            const html = typeof MarkdownParser !== 'undefined'
                ? MarkdownParser.parse(this._textContent)
                : `<pre>${esc(this._textContent)}</pre>`;
            return `<div class="dv-markdown">${html}</div>`;
        }

        _renderCode(lang) {
            if (!this._textContent) return '<div class="dv-text">No text content</div>';
            return `<div class="dv-code">
                <div class="dv-code-lang">${esc(lang)}</div>
                <pre class="dv-pre"><code data-lang="${esc(lang)}">${esc(this._textContent)}</code></pre>
            </div>`;
        }

        _renderHtml() {
            if (!this._textContent) return '<div class="dv-text">No HTML content</div>';
            // Render in sandboxed iframe for security
            const blobUrl = this._createBlobUrl(this._content, 'text/html');
            return `<iframe class="dv-iframe" src="${blobUrl}" sandbox="allow-same-origin" title="HTML preview"></iframe>`;
        }

        _renderImage() {
            if (!this._content) return '<div class="dv-text">No image data</div>';
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getImageMime(this._filename)
                : 'image/png';
            const blobUrl = this._createBlobUrl(this._content, mime);
            return `<div class="dv-image-container"><img class="dv-image" src="${blobUrl}" alt="${esc(this._filename || 'image')}"></div>`;
        }

        _renderPdf() {
            if (!this._content) return '<div class="dv-text">No PDF data</div>';
            const blobUrl = this._createBlobUrl(this._content, 'application/pdf');
            return `<object class="dv-pdf" data="${blobUrl}" type="application/pdf">
                <div class="dv-text">PDF preview not supported in this browser.</div>
            </object>`;
        }

        _renderBinary() {
            return `<div class="dv-empty">
                <div class="dv-empty-icon">&#128230;</div>
                <div>Binary file — ${esc(this._filename || 'unknown')}</div>
                ${this._content ? `<div class="dv-error-detail">${formatSize(this._content.byteLength)}</div>` : ''}
            </div>`;
        }

        // --- Toggle binding ----------------------------------------------------

        _bindToggle() {
            this.querySelectorAll('.dv-toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Before leaving edit mode, capture textarea content
                    if (this._mode === 'edit') this._captureEditorContent();
                    this._mode = btn.dataset.mode;
                    this._renderContent();
                });
            });

            const saveBtn = this.querySelector('.dv-save-btn');
            if (saveBtn) saveBtn.addEventListener('click', () => {
                // Capture editor content if in edit mode before saving
                if (this._mode === 'edit') this._captureEditorContent();
                this.saveToVault();
            });

            // Bind editor textarea events
            const editor = this.querySelector('.dv-editor');
            if (editor) {
                editor.addEventListener('input', () => {
                    this._dirty = true;
                    // Update dirty badge without full re-render
                    const badge = this.querySelector('.dv-dirty-badge');
                    if (!badge) {
                        const filetype = this.querySelector('.dv-filetype');
                        if (filetype) {
                            const span = document.createElement('span');
                            span.className = 'dv-dirty-badge';
                            span.textContent = 'modified';
                            filetype.after(span);
                        }
                    }
                });
                // Focus the editor
                editor.focus();
            }
        }

        /** Capture content from the editor textarea back into internal state */
        _captureEditorContent() {
            const editor = this.querySelector('.dv-editor');
            if (!editor) return;
            const text = editor.value;
            if (text !== this._textContent) {
                this._textContent = text;
                this._content     = new TextEncoder().encode(text);
                this._dirty       = true;
                this._version++;
                window.sgraphWorkspace.events.emit('document-edited', {
                    role: this._role, filename: this._filename, type: this._renderType
                });
            }
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .dv-empty {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; height: 100%;
                    color: var(--ws-text-muted, #5a6478); font-size: 0.8125rem; text-align: center;
                    line-height: 1.6; gap: 0.25rem;
                }
                .dv-empty-icon { font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem; }
                .dv-spinner {
                    font-size: 1.5rem; font-weight: 800; color: var(--ws-primary, #4ECDC4);
                    animation: dv-spin 1s ease-in-out infinite;
                }
                @keyframes dv-spin { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
                .dv-error-detail { font-size: 0.75rem; color: var(--ws-text-muted, #5a6478); margin-top: 0.25rem; }

                .dv-toolbar {
                    display: flex; align-items: center; gap: 0.5rem;
                    padding: 0.375rem 0.75rem;
                    background: var(--ws-surface-raised, #1c2a4a);
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .dv-filename {
                    font-size: 0.8125rem; font-weight: 600; color: var(--ws-text, #F0F0F5);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .dv-filetype {
                    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.04em; padding: 0.0625rem 0.375rem;
                    border-radius: 9999px; background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4); flex-shrink: 0;
                }
                .dv-filesize {
                    font-size: 0.6875rem; color: var(--ws-text-muted, #5a6478);
                    font-family: var(--ws-font-mono, monospace); margin-left: auto; flex-shrink: 0;
                }
                .dv-toggle {
                    display: flex; gap: 1px; margin-left: auto;
                    background: var(--ws-border-subtle, #222d4d); border-radius: var(--ws-radius, 6px);
                    overflow: hidden;
                }
                .dv-toggle-btn {
                    padding: 0.1875rem 0.5rem; font-size: 0.6875rem; font-weight: 600;
                    border: none; cursor: pointer; font-family: inherit;
                    background: var(--ws-surface, #16213E); color: var(--ws-text-muted, #5a6478);
                    transition: background 100ms, color 100ms;
                }
                .dv-toggle-btn:hover { color: var(--ws-text-secondary, #8892A0); }
                .dv-toggle-btn--active {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                }
                .dv-toggle + .dv-filesize { margin-left: 0; }

                .dv-view-name {
                    width: 7rem; padding: 0.1875rem 0.5rem; font-size: 0.6875rem;
                    font-family: var(--ws-font-mono, monospace);
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; flex-shrink: 0;
                }
                .dv-view-name:focus { border-color: var(--ws-primary, #4ECDC4); }
                .dv-view-name::placeholder { color: var(--ws-text-muted, #5a6478); }

                .dv-save-btn {
                    padding: 0.1875rem 0.625rem; font-size: 0.6875rem; font-weight: 600;
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border-radius: var(--ws-radius, 6px); cursor: pointer;
                    font-family: inherit; transition: background 100ms;
                    flex-shrink: 0; margin-left: auto;
                }
                .dv-save-btn:hover:not(:disabled) { background: rgba(78,205,196,0.2); }
                .dv-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .dv-save-btn--saved {
                    background: rgba(78,205,196,0.15);
                    border-color: var(--ws-success, #4ECDC4);
                    color: var(--ws-success, #4ECDC4);
                }

                .dv-dirty-badge {
                    font-size: 0.6875rem; font-weight: 600; padding: 0.0625rem 0.375rem;
                    border-radius: 9999px; background: var(--ws-warning-bg, rgba(251,191,36,0.08));
                    color: var(--ws-warning, #fbbf24); flex-shrink: 0;
                }

                .dv-body { flex: 1; overflow-y: auto; }

                /* Edit mode */
                .dv-edit { height: 100%; display: flex; flex-direction: column; }
                .dv-editor {
                    flex: 1; width: 100%; resize: none; border: none; outline: none;
                    padding: 0.75rem;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.8125rem;
                    line-height: 1.6; color: var(--ws-text, #F0F0F5);
                    background: var(--ws-bg, #1A1A2E);
                    white-space: pre-wrap; word-wrap: break-word;
                    tab-size: 2;
                }

                /* Markdown rendered output */
                .dv-markdown {
                    padding: 1rem; line-height: 1.7;
                    color: var(--ws-text, #F0F0F5); font-size: 0.875rem;
                }
                .dv-markdown h1 { font-size: 1.5rem; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid var(--ws-border-subtle, #222d4d); padding-bottom: 0.375rem; }
                .dv-markdown h2 { font-size: 1.25rem; margin: 1.25rem 0 0.5rem; }
                .dv-markdown h3 { font-size: 1.0625rem; margin: 1rem 0 0.375rem; }
                .dv-markdown h4, .dv-markdown h5, .dv-markdown h6 { font-size: 0.9375rem; margin: 0.75rem 0 0.375rem; }
                .dv-markdown p { margin: 0.625rem 0; }
                .dv-markdown ul, .dv-markdown ol { margin: 0.625rem 0; padding-left: 1.5rem; }
                .dv-markdown li { margin: 0.25rem 0; }
                .dv-markdown blockquote {
                    border-left: 3px solid var(--ws-primary, #4ECDC4); margin: 0.75rem 0;
                    padding: 0.5rem 1rem; color: var(--ws-text-secondary, #8892A0);
                    background: var(--ws-surface-raised, #1c2a4a); border-radius: 0 var(--ws-radius, 6px) var(--ws-radius, 6px) 0;
                }
                .dv-markdown pre {
                    background: var(--ws-surface, #16213E); border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px); padding: 0.75rem; overflow-x: auto;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.8125rem; margin: 0.75rem 0;
                }
                .dv-markdown code {
                    font-family: var(--ws-font-mono, monospace); font-size: 0.85em;
                    background: var(--ws-surface-raised, #1c2a4a); padding: 0.125rem 0.375rem;
                    border-radius: 3px;
                }
                .dv-markdown pre code { background: none; padding: 0; }
                .dv-markdown table {
                    border-collapse: collapse; width: 100%; margin: 0.75rem 0;
                    font-size: 0.8125rem;
                }
                .dv-markdown th, .dv-markdown td {
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    padding: 0.375rem 0.75rem; text-align: left;
                }
                .dv-markdown th {
                    background: var(--ws-surface-raised, #1c2a4a);
                    font-weight: 600; color: var(--ws-text, #F0F0F5);
                }
                .dv-markdown hr { border: none; border-top: 1px solid var(--ws-border-subtle, #222d4d); margin: 1.5rem 0; }
                .dv-markdown a { color: var(--ws-primary, #4ECDC4); text-decoration: none; }
                .dv-markdown a:hover { text-decoration: underline; }
                .dv-markdown strong { color: var(--ws-text, #F0F0F5); }

                /* Code view */
                .dv-code { position: relative; }
                .dv-code-lang {
                    position: absolute; top: 0.5rem; right: 0.75rem;
                    font-size: 0.6875rem; font-weight: 600; text-transform: uppercase;
                    color: var(--ws-text-muted, #5a6478); font-family: var(--ws-font-mono, monospace);
                }

                /* Shared pre styles */
                .dv-pre, .dv-text pre {
                    margin: 0; padding: 0.75rem;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.8125rem;
                    line-height: 1.6; color: var(--ws-text, #F0F0F5);
                    white-space: pre-wrap; word-wrap: break-word;
                    background: var(--ws-bg, #1A1A2E);
                }
                .dv-source .dv-pre {
                    background: var(--ws-surface, #16213E);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    margin: 0.5rem;
                }

                /* HTML iframe */
                .dv-iframe {
                    width: 100%; height: 100%; border: none;
                    background: #fff;
                }

                /* Image */
                .dv-image-container { display: flex; justify-content: center; align-items: center; padding: 1rem; height: 100%; }
                .dv-image { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--ws-radius, 6px); }

                /* PDF */
                .dv-pdf { width: 100%; height: 100%; border: none; }
            `;
        }
    }

    customElements.define('document-viewer', DocumentViewer);
})();
