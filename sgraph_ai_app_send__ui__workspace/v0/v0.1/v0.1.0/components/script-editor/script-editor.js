/* =============================================================================
   SGraph Workspace — Script Editor
   v0.1.0 — JavaScript transformation code editor with Run/Save

   Provides a code editing panel for writing and executing JavaScript
   transformation scripts. Scripts execute against the source HTML via
   the js-executor sandboxed iframe.

   Workflow:
     1. LLM generates JS → emits 'llm-response-js' → auto-loads here
     2. User reviews/edits the code
     3. User clicks Run (or Ctrl+Enter) → executes against source HTML
     4. Result displayed in transform document-viewer
     5. User can Save the script to the vault
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    class ScriptEditor extends HTMLElement {

        constructor() {
            super();
            this._script   = '';
            this._filename = 'transform.js';
            this._error    = null;
            this._running  = false;
            this._unsubs   = [];
        }

        connectedCallback() {
            this._render();

            // Listen for LLM-generated JS
            const onJS = (data) => {
                this.loadScript(data.code || '', data.filename || 'transform.js');
            };
            window.sgraphWorkspace.events.on('llm-response-js', onJS);
            this._unsubs.push(() => window.sgraphWorkspace.events.off('llm-response-js', onJS));
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Public API --------------------------------------------------------

        loadScript(code, filename) {
            this._script   = code;
            this._filename = filename || 'transform.js';
            this._error    = null;
            const textarea = this.querySelector('.se-code');
            if (textarea) {
                textarea.value = code;
            } else {
                this._render();
            }
            this._updateFilename();
        }

        getScript() {
            const textarea = this.querySelector('.se-code');
            return textarea ? textarea.value : this._script;
        }

        getFilename() {
            return this._filename;
        }

        // --- Run ---------------------------------------------------------------

        async _run() {
            if (this._running) return;

            const script = this.getScript();
            if (!script.trim()) {
                this._showError('No script to execute');
                return;
            }

            // Get source HTML
            const sourceViewer = document.querySelector('document-viewer[data-role="source"]');
            const sourceHtml   = sourceViewer ? sourceViewer.getTextContent() : null;
            if (!sourceHtml) {
                this._showError('No source HTML loaded. Load a file in the source panel first.');
                return;
            }

            this._running = true;
            this._error   = null;
            this._updateButtons();

            const startTime = Date.now();

            try {
                const result = await window.sgraphWorkspace.executeJS(sourceHtml, script);
                const elapsed = Date.now() - startTime;

                if (result.error) {
                    this._showError(result.error);
                    window.sgraphWorkspace.events.emit('script-executed', {
                        success: false, error: result.error, elapsedMs: elapsed
                    });
                } else {
                    // Display result in transform viewer
                    const transformViewer = document.querySelector('document-viewer[data-role="transform"]');
                    if (transformViewer) {
                        const ext = result.resultType === 'json' ? 'json' : 'html';
                        transformViewer.loadText(result.data, `result.${ext}`);
                    }

                    this._clearError();
                    window.sgraphWorkspace.messages.success(`Script executed in ${elapsed}ms`);
                    window.sgraphWorkspace.events.emit('script-executed', {
                        success: true,
                        resultType: result.resultType,
                        resultLength: (result.data || '').length,
                        elapsedMs: elapsed,
                    });
                }
            } catch (e) {
                this._showError('Execution failed: ' + e.message);
            }

            this._running = false;
            this._updateButtons();
        }

        // --- Save to vault -----------------------------------------------------

        async _save() {
            const script = this.getScript();
            if (!script.trim()) return;

            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel) {
                window.sgraphWorkspace.messages.error('No vault open');
                return;
            }
            const vault = vaultPanel.getVault();
            if (!vault) {
                window.sgraphWorkspace.messages.error('Vault not unlocked');
                return;
            }

            const currentPath = vaultPanel.getCurrentPath ? vaultPanel.getCurrentPath() : '/';

            try {
                const data = new TextEncoder().encode(script);
                await vault.writeFile(currentPath, this._filename, data);
                window.sgraphWorkspace.messages.success(`Saved ${this._filename} to vault`);
                window.sgraphWorkspace.events.emit('script-saved', {
                    filename: this._filename, path: currentPath
                });
            } catch (e) {
                window.sgraphWorkspace.messages.error('Save failed: ' + e.message);
            }
        }

        // --- Error display -----------------------------------------------------

        _showError(msg) {
            this._error = msg;
            const el = this.querySelector('.se-error');
            if (el) {
                el.textContent = msg;
                el.style.display = '';
            }
        }

        _clearError() {
            this._error = null;
            const el = this.querySelector('.se-error');
            if (el) el.style.display = 'none';
        }

        _updateButtons() {
            const runBtn = this.querySelector('.se-run');
            if (runBtn) {
                runBtn.disabled   = this._running;
                runBtn.textContent = this._running ? 'Running...' : 'Run';
            }
        }

        _updateFilename() {
            const el = this.querySelector('.se-filename');
            if (el) el.textContent = this._filename;
        }

        // --- Render ------------------------------------------------------------

        _render() {
            this.innerHTML = `<style>${ScriptEditor.styles}</style>
            <div class="se-panel">
                <div class="se-header">
                    <span class="se-filename">${esc(this._filename)}</span>
                    <div class="se-actions">
                        <button class="se-run" title="Run script (Ctrl+Enter)">Run</button>
                        <button class="se-save" title="Save to vault">Save</button>
                    </div>
                </div>
                <textarea class="se-code" placeholder="// JavaScript transformation code...\n// Modify document DOM or return a value\n// Example: document.querySelectorAll('script').forEach(s => s.remove());" spellcheck="false">${esc(this._script)}</textarea>
                <div class="se-error" style="display:${this._error ? '' : 'none'}">${esc(this._error || '')}</div>
            </div>`;

            this._bind();
        }

        _bind() {
            const runBtn  = this.querySelector('.se-run');
            const saveBtn = this.querySelector('.se-save');
            const code    = this.querySelector('.se-code');

            if (runBtn)  runBtn.addEventListener('click', () => this._run());
            if (saveBtn) saveBtn.addEventListener('click', () => this._save());

            if (code) {
                // Ctrl+Enter to run
                code.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        this._run();
                    }
                    // Tab inserts spaces instead of changing focus
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = code.selectionStart;
                        const end   = code.selectionEnd;
                        code.value = code.value.substring(0, start) + '    ' + code.value.substring(end);
                        code.selectionStart = code.selectionEnd = start + 4;
                    }
                });
                // Track content changes
                code.addEventListener('input', () => {
                    this._script = code.value;
                });
            }
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .se-panel {
                    display: flex; flex-direction: column;
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                    min-height: 0;
                }
                .se-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0.25rem 0.75rem;
                    background: var(--ws-surface, #162040);
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .se-filename {
                    font-size: 0.6875rem; font-weight: 600;
                    color: var(--ws-text-muted, #5a6478);
                    font-family: var(--ws-font-mono, monospace);
                }
                .se-actions {
                    display: flex; gap: 0.375rem;
                }
                .se-run, .se-save {
                    padding: 0.1875rem 0.625rem; border-radius: var(--ws-radius, 6px);
                    font-size: 0.6875rem; font-weight: 600;
                    cursor: pointer; font-family: inherit;
                    border: 1px solid var(--ws-border, #2C3E6B);
                    transition: background 100ms;
                }
                .se-run {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border-color: var(--ws-primary, #4ECDC4);
                }
                .se-run:hover:not(:disabled) { background: rgba(78,205,196,0.2); }
                .se-run:disabled { opacity: 0.5; cursor: not-allowed; }
                .se-save {
                    background: transparent;
                    color: var(--ws-text-muted, #5a6478);
                }
                .se-save:hover { color: var(--ws-text-secondary, #8892A0); background: var(--ws-surface-hover, #253254); }
                .se-code {
                    flex: 1; min-height: 80px; max-height: 200px; resize: vertical;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.75rem;
                    padding: 0.5rem 0.75rem; line-height: 1.5;
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: none; outline: none;
                    tab-size: 4;
                }
                .se-code::placeholder { color: var(--ws-text-muted, #5a6478); }
                .se-error {
                    padding: 0.375rem 0.75rem;
                    font-size: 0.6875rem; font-family: var(--ws-font-mono, monospace);
                    color: var(--ws-error, #E94560);
                    background: var(--ws-error-bg, rgba(233,69,96,0.08));
                    border-top: 1px solid var(--ws-error, #E94560);
                    white-space: pre-wrap; word-break: break-all;
                }
            `;
        }
    }

    customElements.define('script-editor', ScriptEditor);
})();
