/* =============================================================================
   SGraph Send Admin Console — Vault Preview
   v0.1.6 — Multi-format file preview renderer

   Standalone web component that renders text, markdown, images, and other
   previewable content. Used by vault-manager in row 3 of the layout.

   Usage:
     const preview = document.querySelector('vault-preview');
     preview.show({ type: 'text', data: '...', filename: 'readme.md' });
     preview.show({ type: 'image', data: 'blob:...', filename: 'photo.jpg' });
     preview.showLoading('Decrypting preview...');
     preview.showEmpty();
     preview.clear();
   ============================================================================= */

(function() {
    'use strict';

    const { escapeHtml, PKI_SHARED_STYLES } = window.sgraphAdmin.pki;

    const PREVIEW_STYLES = `
        ${PKI_SHARED_STYLES}

        :host, vault-preview { display: block; height: 100%; }

        .vp-container { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

        .vp-toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); flex-shrink: 0; min-height: 28px; }
        .vp-title { font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; flex: 1; }
        .vp-filename { font-size: 0.75rem; color: var(--admin-text-secondary, #8b8fa7); font-family: var(--admin-font-mono, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .vp-body { flex: 1; overflow: auto; min-height: 0; }

        /* Empty state */
        .vp-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--admin-text-muted, #5e6280); font-size: 0.75rem; font-style: italic; }

        /* Loading state */
        .vp-loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; height: 100%; color: var(--admin-text-muted, #5e6280); font-size: 0.75rem; }
        .vp-loading .pk-spinner { width: 16px; height: 16px; }

        /* Text preview */
        .vp-text { padding: 0.5rem 0.75rem; font-family: var(--admin-font-mono, 'SF Mono', 'Fira Code', monospace); font-size: 0.8125rem; line-height: 1.5; color: var(--admin-text, #e4e6ef); white-space: pre-wrap; word-break: break-word; }

        /* Markdown preview */
        .vp-markdown { padding: 0.5rem 0.75rem; font-size: 0.8125rem; line-height: 1.6; color: var(--admin-text-secondary, #8b8fa7); }
        .vp-markdown h1, .vp-markdown h2, .vp-markdown h3, .vp-markdown h4 { color: var(--admin-text, #e4e6ef); margin: 0.75em 0 0.375em; }
        .vp-markdown h1 { font-size: 1.25rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); padding-bottom: 0.25em; }
        .vp-markdown h2 { font-size: 1.1rem; }
        .vp-markdown h3 { font-size: 0.95rem; }
        .vp-markdown h4 { font-size: 0.875rem; }
        .vp-markdown p { margin: 0.5em 0; }
        .vp-markdown code { font-family: var(--admin-font-mono, monospace); background: var(--admin-bg, #0f1117); padding: 0.125em 0.25em; border-radius: 3px; font-size: 0.9em; }
        .vp-markdown pre { background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border-subtle, #252838); border-radius: var(--admin-radius, 6px); padding: 0.5rem; overflow-x: auto; margin: 0.5em 0; }
        .vp-markdown pre code { background: none; padding: 0; }
        .vp-markdown blockquote { border-left: 3px solid var(--admin-primary, #4f8ff7); margin: 0.5em 0; padding: 0.25em 0.75em; color: var(--admin-text-muted, #5e6280); }
        .vp-markdown ul, .vp-markdown ol { padding-left: 1.5em; margin: 0.5em 0; }
        .vp-markdown li { margin: 0.25em 0; }
        .vp-markdown a { color: var(--admin-primary, #4f8ff7); }
        .vp-markdown hr { border: none; border-top: 1px solid var(--admin-border-subtle, #252838); margin: 0.75em 0; }
        .vp-markdown strong { color: var(--admin-text, #e4e6ef); }
        .vp-markdown table { border-collapse: collapse; margin: 0.5em 0; width: 100%; }
        .vp-markdown th, .vp-markdown td { border: 1px solid var(--admin-border-subtle, #252838); padding: 0.375rem 0.5rem; text-align: left; font-size: 0.75rem; }
        .vp-markdown th { background: var(--admin-surface-hover, #2a2e3d); font-weight: 600; color: var(--admin-text, #e4e6ef); }

        /* Image preview */
        .vp-image { padding: 0.5rem; display: flex; align-items: flex-start; justify-content: center; }
        .vp-image img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--admin-radius, 6px); border: 1px solid var(--admin-border-subtle, #252838); }

        /* Error state */
        .vp-error { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--admin-error, #ef4444); font-size: 0.75rem; }
    `;

    class VaultPreview extends HTMLElement {
        constructor() {
            super();
            this._state = 'empty'; // empty | loading | content | error
            this._contentType = null; // text | markdown | image
            this._data = null;
            this._filename = '';
            this._renderInitial();
        }

        _renderInitial() {
            this.innerHTML = `<style>${PREVIEW_STYLES}</style>
                <div class="vp-container">
                    <div class="vp-toolbar">
                        <span class="vp-title">Preview</span>
                        <span class="vp-filename" id="vp-filename"></span>
                    </div>
                    <div class="vp-body" id="vp-body">
                        <div class="vp-empty">Select a file to preview</div>
                    </div>
                </div>`;
        }

        show({ type, data, filename }) {
            this._state = 'content';
            this._contentType = type;
            this._data = data;
            this._filename = filename || '';
            this._renderContent();
        }

        showLoading(message) {
            this._state = 'loading';
            this._filename = '';
            const body = this.querySelector('#vp-body');
            const fn = this.querySelector('#vp-filename');
            if (fn) fn.textContent = '';
            if (body) body.innerHTML = `<div class="vp-loading"><span class="pk-spinner"></span> ${escapeHtml(message || 'Loading...')}</div>`;
        }

        showEmpty(message) {
            this._state = 'empty';
            this._filename = '';
            const body = this.querySelector('#vp-body');
            const fn = this.querySelector('#vp-filename');
            if (fn) fn.textContent = '';
            if (body) body.innerHTML = `<div class="vp-empty">${escapeHtml(message || 'Select a file to preview')}</div>`;
        }

        showError(message) {
            this._state = 'error';
            const body = this.querySelector('#vp-body');
            if (body) body.innerHTML = `<div class="vp-error">${escapeHtml(message)}</div>`;
        }

        clear() {
            this.showEmpty();
        }

        _isMarkdown(filename) {
            if (!filename) return false;
            const f = filename.toLowerCase();
            return f.endsWith('.md') || f.endsWith('.markdown');
        }

        _renderContent() {
            const body = this.querySelector('#vp-body');
            const fn = this.querySelector('#vp-filename');
            if (!body) return;
            if (fn) fn.textContent = this._filename;

            if (this._contentType === 'image') {
                body.innerHTML = `<div class="vp-image"><img src="${this._data}" alt="${escapeHtml(this._filename)}"></div>`;
            } else if (this._contentType === 'text') {
                // Check if it's markdown
                if (this._isMarkdown(this._filename)) {
                    body.innerHTML = `<div class="vp-markdown">${this._renderMarkdown(this._data)}</div>`;
                } else {
                    body.innerHTML = `<div class="vp-text">${escapeHtml(this._data)}</div>`;
                }
            } else {
                body.innerHTML = `<div class="vp-empty">No preview available for this file type</div>`;
            }
        }

        // Basic markdown → HTML renderer (no dependencies)
        _renderMarkdown(text) {
            let html = escapeHtml(text);

            // Code blocks (``` ... ```)
            html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

            // Headers
            html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
            html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

            // Bold and italic
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

            // Inline code
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Blockquotes
            html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

            // Horizontal rules
            html = html.replace(/^---$/gm, '<hr>');

            // Unordered lists
            html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

            // Links [text](url)
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

            // Paragraphs — wrap remaining lines
            html = html.replace(/^(?!<[hupblo]|<\/|<hr|<li|<a)(.+)$/gm, '<p>$1</p>');

            return html;
        }
    }

    customElements.define('vault-preview', VaultPreview);
})();
