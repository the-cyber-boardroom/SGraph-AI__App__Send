/* =============================================================================
   SGraph Workspace — LLM Output Panel
   v0.1.0 — Dedicated LLM response display with copy-to buttons

   Shows streaming/complete LLM responses. Copy buttons route content
   to Script, Data, or Result panels via events.
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    class LlmOutput extends HTMLElement {

        constructor() {
            super();
            this._text      = '';
            this._streaming = false;
            this._status    = '';  // 'streaming' | 'complete' | ''
        }

        connectedCallback() {
            this._render();
        }

        // --- Public API --------------------------------------------------------

        startStreaming() {
            this._text      = '';
            this._streaming = true;
            this._status    = 'streaming';
            this._render();
        }

        appendChunk(text) {
            if (!this._streaming) return;
            this._text += text;
            const content = this.querySelector('.lo-content');
            if (content) {
                // Use highlighted rendering if JsHighlighter is available and content looks like code
                content.textContent = this._text;
                content.scrollTop = content.scrollHeight;
            }
            this._updateStatus();
        }

        endStreaming() {
            this._streaming = false;
            this._status    = 'complete';
            this._updateStatus();
            this._updateButtons();
        }

        loadText(text) {
            this._text      = text || '';
            this._streaming = false;
            this._status    = 'complete';
            this._render();
        }

        getText() {
            return this._text;
        }

        clear() {
            this._text      = '';
            this._streaming = false;
            this._status    = '';
            this._render();
        }

        // --- UI updates --------------------------------------------------------

        _updateStatus() {
            const el = this.querySelector('.lo-status');
            if (!el) return;
            if (this._status === 'streaming') {
                el.textContent = `Streaming... (${this._text.length} chars)`;
            } else if (this._status === 'complete') {
                el.textContent = `Complete (${this._text.length} chars)`;
            } else {
                el.textContent = '';
            }
        }

        _updateButtons() {
            this.querySelectorAll('.lo-copy-btn').forEach(btn => {
                btn.disabled = !this._text;
            });
        }

        _emitCopy(target) {
            if (!this._text) return;
            window.sgraphWorkspace.events.emit('llm-output-copy', {
                target: target,
                content: this._text,
            });
            window.sgraphWorkspace.messages.success(`Copied to ${target}`);
        }

        // --- Render ------------------------------------------------------------

        _render() {
            const hasText = !!this._text;
            this.innerHTML = `<style>${LlmOutput.styles}</style>
            <div class="lo-panel">
                <div class="lo-header">
                    <span class="lo-title">LLM Output</span>
                    <span class="lo-status">${this._status === 'streaming' ? 'Streaming...' : this._status === 'complete' ? `Complete (${this._text.length} chars)` : ''}</span>
                    <button class="lo-clear" title="Clear output">Clear</button>
                </div>
                <pre class="lo-content">${hasText ? esc(this._text) : '<span class="lo-empty">LLM response will appear here</span>'}</pre>
                <div class="lo-actions">
                    <button class="lo-copy-btn" data-target="script" ${hasText ? '' : 'disabled'} title="Copy to Script panel">&rarr; Script</button>
                    <button class="lo-copy-btn" data-target="data" ${hasText ? '' : 'disabled'} title="Copy to Data panel">&rarr; Data</button>
                    <button class="lo-copy-btn" data-target="result" ${hasText ? '' : 'disabled'} title="Copy to Result panel">&rarr; Result</button>
                </div>
            </div>`;

            this._bind();
        }

        _bind() {
            const clearBtn = this.querySelector('.lo-clear');
            if (clearBtn) clearBtn.addEventListener('click', () => this.clear());

            this.querySelectorAll('.lo-copy-btn').forEach(btn => {
                btn.addEventListener('click', () => this._emitCopy(btn.dataset.target));
            });
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .lo-panel {
                    display: flex; flex-direction: column;
                    height: 100%; min-height: 0;
                    padding: 0.375rem 0.5rem; gap: 0.25rem;
                }
                .lo-header {
                    display: flex; align-items: center; gap: 0.375rem;
                    flex-shrink: 0;
                }
                .lo-title {
                    font-size: 0.625rem; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.04em;
                    color: var(--ws-text-muted, #5a6478);
                }
                .lo-status {
                    font-size: 0.5625rem;
                    color: var(--ws-text-muted, #5a6478);
                    font-family: var(--ws-font-mono, monospace);
                }
                .lo-clear {
                    margin-left: auto;
                    padding: 0.125rem 0.375rem; font-size: 0.5625rem; font-weight: 600;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: 3px; cursor: pointer; font-family: inherit;
                }
                .lo-clear:hover { color: var(--ws-text-secondary, #8892A0); background: var(--ws-surface-hover, #253254); }
                .lo-content {
                    flex: 1; min-height: 0;
                    overflow-y: auto;
                    margin: 0;
                    padding: 0.375rem 0.5rem;
                    font-family: var(--ws-font-mono, monospace);
                    font-size: 0.6875rem; line-height: 1.5;
                    color: var(--ws-text, #F0F0F5);
                    background: var(--ws-bg, #1A1A2E);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    white-space: pre-wrap; word-wrap: break-word;
                }
                .lo-empty {
                    color: var(--ws-text-muted, #5a6478); font-style: italic;
                }
                .lo-actions {
                    display: flex; gap: 0.25rem; flex-shrink: 0;
                }
                .lo-copy-btn {
                    flex: 1;
                    padding: 0.25rem 0.375rem; font-size: 0.625rem; font-weight: 600;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-primary, #4ECDC4);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    cursor: pointer; font-family: inherit;
                    transition: background 100ms;
                }
                .lo-copy-btn:hover:not(:disabled) { background: var(--ws-primary-bg, rgba(78,205,196,0.1)); border-color: var(--ws-primary, #4ECDC4); }
                .lo-copy-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            `;
        }
    }

    customElements.define('llm-output', LlmOutput);
})();
