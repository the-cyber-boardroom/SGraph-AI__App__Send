/* =============================================================================
   SGraph Send Admin Console — Vault Editor
   v0.1.6 — In-vault text/markdown editor

   Standalone web component that edits text files stored in the vault.
   Used by vault-manager to provide an edit-in-place experience for text
   and markdown files without downloading.

   Usage:
     const editor = document.createElement('vault-editor');
     editor.open({ text, filename, mime, onSave: async (newText) => { ... } });

   The editor:
   - Shows a full-height textarea with monospace font
   - Markdown files get a live preview toggle
   - Save encrypts + writes back to vault via the onSave callback
   - Cancel closes without saving
   ============================================================================= */

(function() {
    'use strict';

    const { escapeHtml, PKI_SHARED_STYLES } = window.sgraphAdmin.pki;

    const EDITOR_STYLES = `
        ${PKI_SHARED_STYLES}

        :host, vault-editor { display: block; height: 100%; }

        .ve-container { display: flex; flex-direction: column; height: 100%; background: var(--admin-surface, #1a1d27); border-radius: var(--admin-radius-lg, 10px); overflow: hidden; }

        .ve-toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); flex-shrink: 0; }
        .ve-filename { font-size: 0.8125rem; font-weight: 600; color: var(--admin-text, #e4e6ef); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ve-dirty-indicator { font-size: 0.625rem; color: var(--admin-warning, #fbbf24); margin-left: 0.25rem; }
        .ve-mime { font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); font-family: var(--admin-font-mono, monospace); }

        .ve-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }

        .ve-editor-pane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .ve-textarea { flex: 1; width: 100%; resize: none; border: none; outline: none; padding: 0.75rem; font-family: var(--admin-font-mono, 'SF Mono', 'Fira Code', 'Cascadia Code', monospace); font-size: 0.8125rem; line-height: 1.5; background: var(--admin-bg, #0f1117); color: var(--admin-text, #e4e6ef); tab-size: 4; }
        .ve-textarea::placeholder { color: var(--admin-text-muted, #5e6280); }

        .ve-preview-pane { flex: 1; overflow-y: auto; padding: 0.75rem; border-left: 1px solid var(--admin-border-subtle, #252838); font-size: 0.8125rem; line-height: 1.6; color: var(--admin-text-secondary, #8b8fa7); }
        .ve-preview-pane h1, .ve-preview-pane h2, .ve-preview-pane h3 { color: var(--admin-text, #e4e6ef); margin: 0.5em 0 0.25em; }
        .ve-preview-pane h1 { font-size: 1.25rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); padding-bottom: 0.25em; }
        .ve-preview-pane h2 { font-size: 1.1rem; }
        .ve-preview-pane h3 { font-size: 0.95rem; }
        .ve-preview-pane p { margin: 0.5em 0; }
        .ve-preview-pane code { font-family: var(--admin-font-mono, monospace); background: var(--admin-bg, #0f1117); padding: 0.125em 0.25em; border-radius: 3px; font-size: 0.9em; }
        .ve-preview-pane pre { background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border-subtle, #252838); border-radius: var(--admin-radius, 6px); padding: 0.5rem; overflow-x: auto; }
        .ve-preview-pane pre code { background: none; padding: 0; }
        .ve-preview-pane blockquote { border-left: 3px solid var(--admin-primary, #4f8ff7); margin: 0.5em 0; padding: 0.25em 0.75em; color: var(--admin-text-muted, #5e6280); }
        .ve-preview-pane ul, .ve-preview-pane ol { padding-left: 1.5em; margin: 0.5em 0; }
        .ve-preview-pane a { color: var(--admin-primary, #4f8ff7); }
        .ve-preview-pane hr { border: none; border-top: 1px solid var(--admin-border-subtle, #252838); margin: 0.75em 0; }

        .ve-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.75rem; border-top: 1px solid var(--admin-border-subtle, #252838); flex-shrink: 0; }
        .ve-stats { font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); font-family: var(--admin-font-mono, monospace); }
        .ve-footer-actions { display: flex; gap: 0.375rem; }
    `;

    class VaultEditor extends HTMLElement {
        constructor() {
            super();
            this._text       = '';
            this._original   = '';
            this._filename   = '';
            this._mime       = '';
            this._onSave     = null;
            this._showPreview = false;
            this._saving     = false;
        }

        open({ text, filename, mime, onSave }) {
            this._text       = text || '';
            this._original   = this._text;
            this._filename   = filename || 'untitled';
            this._mime       = mime || 'text/plain';
            this._onSave     = onSave;
            this._showPreview = this._isMarkdown();
            this._render();
        }

        _isMarkdown() {
            const m = this._mime.toLowerCase();
            const f = this._filename.toLowerCase();
            return m === 'text/markdown' || m === 'text/x-markdown' ||
                   f.endsWith('.md') || f.endsWith('.markdown');
        }

        _isDirty() {
            return this._text !== this._original;
        }

        _render() {
            const isMarkdown = this._isMarkdown();
            const dirty = this._isDirty();

            this.innerHTML = `
                <style>${EDITOR_STYLES}</style>
                <div class="ve-container">
                    <div class="ve-toolbar">
                        <span class="ve-filename">${escapeHtml(this._filename)}${dirty ? '<span class="ve-dirty-indicator">\u25CF modified</span>' : ''}</span>
                        <span class="ve-mime">${escapeHtml(this._mime)}</span>
                        ${isMarkdown ? `<button class="pk-btn pk-btn--xs pk-btn--ghost" id="ve-toggle-preview">${this._showPreview ? '📝 Editor' : '👁 Preview'}</button>` : ''}
                    </div>
                    <div class="ve-body">
                        <div class="ve-editor-pane"${isMarkdown && this._showPreview ? ' style="display:none"' : ''}>
                            <textarea class="ve-textarea" id="ve-textarea" spellcheck="false" placeholder="Start typing...">${escapeHtml(this._text)}</textarea>
                        </div>
                        ${isMarkdown && this._showPreview ? `<div class="ve-preview-pane" id="ve-preview">${this._renderMarkdown(this._text)}</div>` : ''}
                    </div>
                    <div class="ve-footer">
                        <span class="ve-stats" id="ve-stats">${this._computeStats()}</span>
                        <div class="ve-footer-actions">
                            <button class="pk-btn pk-btn--xs pk-btn--ghost" id="ve-cancel">Cancel</button>
                            <button class="pk-btn pk-btn--xs pk-btn--primary${this._saving ? ' pk-btn--loading' : ''}" id="ve-save" ${this._saving ? 'disabled' : ''}>💾 Save</button>
                        </div>
                    </div>
                </div>
            `;

            this._bindEvents();
        }

        _bindEvents() {
            const textarea = this.querySelector('#ve-textarea');
            if (textarea) {
                textarea.addEventListener('input', () => {
                    this._text = textarea.value;
                    this._updateStats();
                    this._updateDirty();
                });

                // Tab key inserts spaces instead of changing focus
                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = textarea.selectionStart;
                        const end   = textarea.selectionEnd;
                        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                        textarea.selectionStart = textarea.selectionEnd = start + 4;
                        this._text = textarea.value;
                    }
                    // Ctrl/Cmd+S to save
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                        e.preventDefault();
                        this._save();
                    }
                });
            }

            const toggleBtn = this.querySelector('#ve-toggle-preview');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    this._showPreview = !this._showPreview;
                    this._render();
                });
            }

            const cancelBtn = this.querySelector('#ve-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => this._close());

            const saveBtn = this.querySelector('#ve-save');
            if (saveBtn) saveBtn.addEventListener('click', () => this._save());
        }

        _updateStats() {
            const statsEl = this.querySelector('#ve-stats');
            if (statsEl) statsEl.textContent = this._computeStats();
        }

        _updateDirty() {
            const nameEl = this.querySelector('.ve-filename');
            if (!nameEl) return;
            const dirty = this._isDirty();
            const indicator = nameEl.querySelector('.ve-dirty-indicator');
            if (dirty && !indicator) {
                nameEl.insertAdjacentHTML('beforeend', '<span class="ve-dirty-indicator">\u25CF modified</span>');
            } else if (!dirty && indicator) {
                indicator.remove();
            }
        }

        _computeStats() {
            const lines = this._text.split('\n').length;
            const chars = this._text.length;
            const bytes = new TextEncoder().encode(this._text).length;
            return `${lines} lines \u00B7 ${chars} chars \u00B7 ${this._formatSize(bytes)}`;
        }

        _formatSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        async _save() {
            if (this._saving || !this._onSave) return;
            this._saving = true;
            const saveBtn = this.querySelector('#ve-save');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

            try {
                await this._onSave(this._text);
                this._original = this._text;
                this._saving = false;
                this._render();
            } catch (err) {
                this._saving = false;
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save'; }
                // Re-throw so vault-manager can show error in message center
                throw err;
            }
        }

        _close() {
            if (this._isDirty()) {
                // Show a simple inline confirmation
                const footer = this.querySelector('.ve-footer-actions');
                if (footer && !footer.querySelector('#ve-discard-confirm')) {
                    footer.innerHTML = `
                        <span style="font-size: 0.75rem; color: var(--admin-warning, #fbbf24);">Unsaved changes</span>
                        <button class="pk-btn pk-btn--xs pk-btn--ghost" id="ve-discard-cancel">Keep editing</button>
                        <button class="pk-btn pk-btn--xs pk-btn--danger" id="ve-discard-confirm">Discard</button>
                    `;
                    footer.querySelector('#ve-discard-cancel').addEventListener('click', () => this._render());
                    footer.querySelector('#ve-discard-confirm').addEventListener('click', () => {
                        this.dispatchEvent(new CustomEvent('vault-editor-close'));
                    });
                    return;
                }
            }
            this.dispatchEvent(new CustomEvent('vault-editor-close'));
        }

        // Very basic markdown → HTML renderer (no dependencies)
        _renderMarkdown(text) {
            let html = escapeHtml(text);

            // Code blocks (``` ... ```)
            html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

            // Headers
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

    customElements.define('vault-editor', VaultEditor);
})();
