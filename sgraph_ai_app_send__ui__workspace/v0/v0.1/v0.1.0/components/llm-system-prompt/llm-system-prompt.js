/* =============================================================================
   SGraph Workspace — LLM System Prompt
   v0.1.0 — Always-visible system prompt editor with auto-context preview

   Shows the system prompt that will be sent with every LLM request.
   Displays a preview of auto-appended context based on Include checkboxes.
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    const DEFAULT_SYSTEM_PROMPT = 'You are an experienced web developer and architect who is helping to create HTML and JS transformations. When creating a script ONLY reply with the script, since the objective is to copy and paste the output into the execution area (don\'t start with ```javascript since that will make it all comments in JS).';
    const JS_SYSTEM_PROMPT = 'You are an experienced web developer and architect who is helping to create HTML and JS transformations. When creating a script ONLY reply with the script, since the objective is to copy and paste the output into the execution area (don\'t start with ```javascript since that will make it all comments in JS).';
    const SYSTEM_PROMPT_KEY = 'sgraph-workspace-system-prompt';

    class LlmSystemPrompt extends HTMLElement {

        constructor() {
            super();
            this._systemPrompt = this._loadPrompt();
            this._contextFlags = { incSource: true, incScript: false, incData: false, incResult: false, genJS: false };
            this._unsubs = [];
        }

        connectedCallback() {
            this._render();

            const onContextChanged = (data) => {
                this._contextFlags = data;
                this._updatePreview();
            };
            window.sgraphWorkspace.events.on('prompt-context-changed', onContextChanged);
            this._unsubs.push(() => window.sgraphWorkspace.events.off('prompt-context-changed', onContextChanged));

            // Update preview when documents change
            const onDocLoaded = () => this._updatePreview();
            window.sgraphWorkspace.events.on('document-loaded', onDocLoaded);
            window.sgraphWorkspace.events.on('document-edited', onDocLoaded);
            window.sgraphWorkspace.events.on('script-executed', onDocLoaded);
            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('document-loaded', onDocLoaded),
                () => window.sgraphWorkspace.events.off('document-edited', onDocLoaded),
                () => window.sgraphWorkspace.events.off('script-executed', onDocLoaded),
            );
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Public API --------------------------------------------------------

        getSystemPrompt() {
            return this._systemPrompt;
        }

        getJSSystemPrompt() {
            return JS_SYSTEM_PROMPT;
        }

        getDefaultPrompt() {
            return DEFAULT_SYSTEM_PROMPT;
        }

        setPrompt(text) {
            this._systemPrompt = text;
            this._savePrompt();
            const ta = this.querySelector('.lsp-textarea');
            if (ta) ta.value = text;
            this._updateBadge();
        }

        // --- Storage -----------------------------------------------------------

        _loadPrompt() {
            try {
                const saved = localStorage.getItem(SYSTEM_PROMPT_KEY);
                return saved !== null ? saved : DEFAULT_SYSTEM_PROMPT;
            } catch (_) { return DEFAULT_SYSTEM_PROMPT; }
        }

        _savePrompt() {
            try { localStorage.setItem(SYSTEM_PROMPT_KEY, this._systemPrompt); } catch (_) {}
        }

        // --- Auto-context preview ----------------------------------------------

        _updatePreview() {
            const preview = this.querySelector('.lsp-preview');
            if (!preview) return;

            const flags = this._contextFlags;
            const parts = [];

            if (flags.incSource) {
                const sv = document.querySelector('document-viewer[data-role="source"]');
                const txt = sv ? sv.getTextContent() : null;
                parts.push({ label: 'Source', text: txt ? this._truncate(txt, 120) : '(empty)' });
            }
            if (flags.incData) {
                const dv = document.querySelector('document-viewer[data-role="data"]');
                const txt = dv ? dv.getTextContent() : null;
                parts.push({ label: 'Data', text: txt ? this._truncate(txt, 120) : '(empty)' });
            }
            if (flags.incScript) {
                const se = document.querySelector('script-editor');
                const txt = se ? se.getScript() : null;
                parts.push({ label: 'Script', text: txt ? this._truncate(txt, 120) : '(empty)' });
            }
            if (flags.incResult) {
                const rv = document.querySelector('document-viewer[data-role="transform"]');
                const txt = rv ? rv.getTextContent() : null;
                parts.push({ label: 'Result', text: txt ? this._truncate(txt, 120) : '(empty)' });
            }

            if (parts.length === 0) {
                preview.innerHTML = '<span class="lsp-preview-empty">No context will be appended</span>';
                return;
            }

            preview.innerHTML = parts.map(p =>
                `<div class="lsp-preview-item"><span class="lsp-preview-label">${esc(p.label)}:</span> <span class="lsp-preview-text">${esc(p.text)}</span></div>`
            ).join('');
        }

        _truncate(text, max) {
            if (!text) return '';
            const clean = text.replace(/\s+/g, ' ').trim();
            return clean.length > max ? clean.slice(0, max) + '...' : clean;
        }

        _updateBadge() {
            const badge = this.querySelector('.lsp-badge');
            if (badge) {
                badge.textContent = this._systemPrompt ? 'Active' : 'None';
                badge.className = 'lsp-badge' + (this._systemPrompt ? '' : ' lsp-badge--none');
            }
        }

        // --- Render ------------------------------------------------------------

        _render() {
            this.innerHTML = `<style>${LlmSystemPrompt.styles}</style>
            <div class="lsp-panel">
                <div class="lsp-header">
                    <span class="lsp-title">System Prompt</span>
                    <span class="lsp-badge">${this._systemPrompt ? 'Active' : 'None'}</span>
                    <button class="lsp-reset" title="Reset to default">Reset</button>
                </div>
                <textarea class="lsp-textarea" spellcheck="false" placeholder="System prompt sent with every request...">${esc(this._systemPrompt || '')}</textarea>
                <div class="lsp-preview-header">Auto-appended context:</div>
                <div class="lsp-preview">
                    <span class="lsp-preview-empty">No context will be appended</span>
                </div>
            </div>`;

            this._bind();
            this._updatePreview();
        }

        _bind() {
            const textarea = this.querySelector('.lsp-textarea');
            if (textarea) {
                textarea.addEventListener('input', () => {
                    this._systemPrompt = textarea.value;
                    this._savePrompt();
                    this._updateBadge();
                    window.sgraphWorkspace.events.emit('system-prompt-changed', { prompt: this._systemPrompt });
                });
            }

            const resetBtn = this.querySelector('.lsp-reset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    this._systemPrompt = DEFAULT_SYSTEM_PROMPT;
                    this._savePrompt();
                    if (textarea) textarea.value = DEFAULT_SYSTEM_PROMPT;
                    this._updateBadge();
                    window.sgraphWorkspace.events.emit('system-prompt-changed', { prompt: this._systemPrompt });
                });
            }
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .lsp-panel {
                    display: flex; flex-direction: column;
                    height: 100%; min-height: 0;
                    padding: 0.375rem 0.5rem; gap: 0.25rem;
                }
                .lsp-header {
                    display: flex; align-items: center; gap: 0.375rem;
                    flex-shrink: 0;
                }
                .lsp-title {
                    font-size: 0.625rem; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.04em;
                    color: var(--ws-text-muted, #5a6478);
                }
                .lsp-badge {
                    font-size: 0.5625rem; font-weight: 600;
                    padding: 0.0625rem 0.3125rem; border-radius: 9999px;
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                }
                .lsp-badge--none {
                    background: var(--ws-surface-hover, #253254);
                    color: var(--ws-text-muted, #5a6478);
                }
                .lsp-reset {
                    margin-left: auto;
                    padding: 0.125rem 0.375rem; font-size: 0.5625rem; font-weight: 600;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: 3px; cursor: pointer; font-family: inherit;
                }
                .lsp-reset:hover { color: var(--ws-text-secondary, #8892A0); background: var(--ws-surface-hover, #253254); }
                .lsp-textarea {
                    flex: 1; min-height: 0; resize: none;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.6875rem;
                    padding: 0.375rem 0.5rem; line-height: 1.4;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    outline: none;
                }
                .lsp-textarea:focus { border-color: var(--ws-primary, #4ECDC4); }
                .lsp-preview-header {
                    font-size: 0.5625rem; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.04em;
                    color: var(--ws-text-muted, #5a6478);
                    flex-shrink: 0;
                }
                .lsp-preview {
                    flex-shrink: 0; max-height: 4rem;
                    overflow-y: auto;
                    font-size: 0.625rem; line-height: 1.4;
                    padding: 0.25rem 0.375rem;
                    background: var(--ws-bg, #1A1A2E);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                }
                .lsp-preview-empty {
                    color: var(--ws-text-muted, #5a6478); font-style: italic;
                }
                .lsp-preview-item { margin-bottom: 0.125rem; }
                .lsp-preview-label {
                    font-weight: 600; color: var(--ws-primary, #4ECDC4);
                }
                .lsp-preview-text {
                    color: var(--ws-text-muted, #5a6478);
                    word-break: break-all;
                }
            `;
        }
    }

    customElements.define('llm-system-prompt', LlmSystemPrompt);
})();
