/* =============================================================================
   SGraph Vault — File Preview Component
   v0.1.1 — Dispatches to appropriate viewer based on file type

   Renders previews for: markdown, images, PDF, code, audio, video, text.
   Uses FileTypeDetect and MarkdownParser from shared modules.
   ============================================================================= */

(function() {
    'use strict';

    class VaultFilePreview extends HTMLElement {

        constructor() {
            super();
            this._blobUrl = null;
        }

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vfpv-container">
                    <div class="vfpv-placeholder">
                        Select a file from the tree to preview
                    </div>
                    <div class="vfpv-loading" style="display:none">
                        Decrypting and loading...
                    </div>
                    <div class="vfpv-content" style="display:none"></div>
                    <div class="vfpv-error" style="display:none"></div>
                </div>
            `;
        }

        disconnectedCallback() {
            this._revokeBlob();
        }

        async loadFile(vault, folderPath, fileName, fileEntry) {
            this._revokeBlob();

            const placeholder = this.querySelector('.vfpv-placeholder');
            const loading     = this.querySelector('.vfpv-loading');
            const content     = this.querySelector('.vfpv-content');
            const errorEl     = this.querySelector('.vfpv-error');

            placeholder.style.display = 'none';
            errorEl.style.display     = 'none';
            content.style.display     = 'none';
            content.innerHTML         = '';
            loading.style.display     = '';

            try {
                const data = await vault.getFile(folderPath, fileName);
                const type = typeof FileTypeDetect !== 'undefined'
                    ? FileTypeDetect.detect(fileName)
                    : null;

                loading.style.display = 'none';
                content.style.display = '';

                switch (type) {
                    case 'markdown':
                        this._renderMarkdown(content, data, fileName);
                        break;
                    case 'image':
                        this._renderImage(content, data, fileName);
                        break;
                    case 'pdf':
                        this._renderPdf(content, data);
                        break;
                    case 'code':
                        this._renderCode(content, data, fileName);
                        break;
                    case 'audio':
                        this._renderAudio(content, data, fileName);
                        break;
                    case 'video':
                        this._renderVideo(content, data, fileName);
                        break;
                    case 'text':
                        this._renderText(content, data);
                        break;
                    default:
                        this._renderBinary(content, fileName, fileEntry);
                        break;
                }
            } catch (err) {
                loading.style.display = 'none';
                errorEl.style.display = '';
                errorEl.textContent = `Preview failed: ${err.message}`;
            }
        }

        clearPreview() {
            this._revokeBlob();
            const placeholder = this.querySelector('.vfpv-placeholder');
            const content     = this.querySelector('.vfpv-content');
            const loading     = this.querySelector('.vfpv-loading');
            const errorEl     = this.querySelector('.vfpv-error');
            if (placeholder) placeholder.style.display = '';
            if (content)     { content.style.display = 'none'; content.innerHTML = ''; }
            if (loading)     loading.style.display = 'none';
            if (errorEl)     errorEl.style.display = 'none';
        }

        // --- Renderers ----------------------------------------------------------

        _renderMarkdown(container, data, fileName) {
            const text = new TextDecoder().decode(data);
            const html = typeof MarkdownParser !== 'undefined'
                ? MarkdownParser.parse(text)
                : this._escapeHtml(text);

            const iframe = document.createElement('iframe');
            iframe.className = 'vfpv-iframe';
            iframe.sandbox = 'allow-same-origin';
            container.appendChild(iframe);

            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(`<!DOCTYPE html><html><head><style>
                body { font-family: var(--font-body, 'DM Sans', system-ui, sans-serif); color: #E0E0E0; background: #1A1A2E; padding: 1rem; line-height: 1.6; margin: 0; }
                pre { background: #16213E; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.875rem; }
                code { font-family: var(--font-mono, 'JetBrains Mono', monospace); }
                a { color: #4ECDC4; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid rgba(78,205,196,0.15); padding: 0.5rem; text-align: left; }
                th { background: #16213E; }
                blockquote { border-left: 3px solid #4ECDC4; margin-left: 0; padding-left: 1rem; color: #8892A0; }
                hr { border: none; border-top: 1px solid rgba(78,205,196,0.15); }
                img { max-width: 100%; }
            </style></head><body>${html}</body></html>`);
            doc.close();
        }

        _renderImage(container, data, fileName) {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getImageMime(fileName)
                : 'image/png';
            const blob = new Blob([data], { type: mime });
            this._blobUrl = URL.createObjectURL(blob);

            const img = document.createElement('img');
            img.className = 'vfpv-image';
            img.src = this._blobUrl;
            img.alt = fileName;
            container.appendChild(img);
        }

        _renderPdf(container, data) {
            const blob = new Blob([data], { type: 'application/pdf' });
            this._blobUrl = URL.createObjectURL(blob);

            const iframe = document.createElement('iframe');
            iframe.className = 'vfpv-pdf';
            iframe.src = this._blobUrl;
            container.appendChild(iframe);
        }

        _renderCode(container, data, fileName) {
            const text = new TextDecoder().decode(data);
            const lang = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getLanguage(fileName)
                : 'text';

            const pre  = document.createElement('pre');
            pre.className = 'vfpv-code';
            const code = document.createElement('code');
            code.dataset.lang = lang;

            // Simple line-numbered display
            const lines = text.split('\n');
            code.innerHTML = lines.map((line, i) => {
                const num = `<span class="vfpv-line-num">${i + 1}</span>`;
                return `${num}${this._escapeHtml(line)}`;
            }).join('\n');

            pre.appendChild(code);
            container.appendChild(pre);
        }

        _renderAudio(container, data, fileName) {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getAudioMime(fileName)
                : 'audio/mpeg';
            const blob = new Blob([data], { type: mime });
            this._blobUrl = URL.createObjectURL(blob);

            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = this._blobUrl;
            audio.className = 'vfpv-audio';
            container.appendChild(audio);
        }

        _renderVideo(container, data, fileName) {
            const mime = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.getVideoMime(fileName)
                : 'video/mp4';
            const blob = new Blob([data], { type: mime });
            this._blobUrl = URL.createObjectURL(blob);

            const video = document.createElement('video');
            video.controls = true;
            video.src = this._blobUrl;
            video.className = 'vfpv-video';
            container.appendChild(video);
        }

        _renderText(container, data) {
            const text = new TextDecoder().decode(data);
            const pre  = document.createElement('pre');
            pre.className = 'vfpv-text';
            pre.textContent = text;
            container.appendChild(pre);
        }

        _renderBinary(container, fileName, fileEntry) {
            container.innerHTML = `
                <div class="vfpv-binary">
                    <span class="vfpv-binary-icon">\uD83D\uDCC4</span>
                    <span class="vfpv-binary-name">${this._escapeHtml(fileName)}</span>
                    <span class="vfpv-binary-size">${VaultHelpers.formatBytes(fileEntry.size || 0)}</span>
                    <p>No preview available for this file type.</p>
                </div>
            `;
        }

        // --- Helpers ------------------------------------------------------------

        _revokeBlob() {
            if (this._blobUrl) {
                URL.revokeObjectURL(this._blobUrl);
                this._blobUrl = null;
            }
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        getStyles() {
            return `
                .vfpv-container { min-height: 200px; }
                .vfpv-placeholder { padding: 3rem; text-align: center; color: var(--color-text-secondary); font-size: var(--text-sm); }
                .vfpv-loading { padding: 2rem; text-align: center; color: var(--color-primary); font-size: var(--text-sm); }
                .vfpv-error { padding: 1rem; background: rgba(233,69,96,0.1); border: 1px solid rgba(233,69,96,0.2); border-radius: var(--radius-sm); color: var(--color-error); font-size: var(--text-sm); }
                .vfpv-content { }
                .vfpv-iframe { width: 100%; min-height: 500px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--bg-primary); }
                .vfpv-image { max-width: 100%; max-height: 70vh; border-radius: var(--radius-sm); display: block; }
                .vfpv-pdf { width: 100%; height: 70vh; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
                .vfpv-code { background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); overflow-x: auto; font-size: var(--text-small); font-family: var(--font-mono); color: var(--color-text); margin: 0; line-height: 1.5; max-height: 70vh; overflow-y: auto; }
                .vfpv-code code { font-family: var(--font-mono); }
                .vfpv-line-num { display: inline-block; width: 3rem; text-align: right; padding-right: 1rem; color: var(--color-text-secondary); user-select: none; opacity: 0.5; }
                .vfpv-audio { width: 100%; margin: 1rem 0; }
                .vfpv-video { width: 100%; max-height: 70vh; border-radius: var(--radius-sm); }
                .vfpv-text { background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); overflow-x: auto; font-size: var(--text-small); font-family: var(--font-mono); color: var(--color-text); margin: 0; max-height: 70vh; overflow-y: auto; white-space: pre-wrap; }
                .vfpv-binary { padding: 3rem; text-align: center; color: var(--color-text-secondary); }
                .vfpv-binary-icon { font-size: 3rem; display: block; margin-bottom: var(--space-2); }
                .vfpv-binary-name { display: block; font-weight: 600; color: var(--color-text); margin-bottom: var(--space-1); }
                .vfpv-binary-size { font-family: var(--font-mono); font-size: var(--text-small); }
            `;
        }
    }

    customElements.define('vault-file-preview', VaultFilePreview);
})();
