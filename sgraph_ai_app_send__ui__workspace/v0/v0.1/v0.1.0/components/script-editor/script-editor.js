/* =============================================================================
   SGraph Workspace — Script Editor
   v0.2.0 — Full-panel JavaScript editor with Run/Save and console output

   Lives in the middle "Script" panel of the 3-column layout (JSFiddle-style).
   Includes a console output area that captures console.log/warn/error from
   the executed script.

   Workflow:
     1. LLM generates JS → emits 'llm-response-js' → auto-loads here
     2. User reviews/edits the code (or uses sample script)
     3. User clicks Run (or Ctrl+Enter) → executes against source HTML
     4. Result displayed in transform document-viewer
     5. Console output shown below the editor
     6. User can Save the script to the vault
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    const SAMPLE_SCRIPT = `// Remove ads, tracking, and script tags
document.querySelectorAll('.ad-banner, .tracking, script').forEach(el => el.remove());

// Log what's left
var articles = document.querySelectorAll('.article');
console.log('Found ' + articles.length + ' articles after cleaning');

articles.forEach(function(el) {
    console.log('  - ' + (el.querySelector('h2')?.textContent || 'untitled'));
});`;

    class ScriptEditor extends HTMLElement {

        constructor() {
            super();
            this._script     = SAMPLE_SCRIPT;
            this._filename   = 'transform.js';
            this._error      = null;
            this._running    = false;
            this._consoleLogs = [];   // [{ level, args }]
            this._unsubs     = [];
        }

        connectedCallback() {
            this._render();

            // Listen for LLM-generated JS
            const onJS = (data) => {
                this.loadScript(data.code || '', data.filename || 'transform.js');
            };
            window.sgraphWorkspace.events.on('llm-response-js', onJS);
            this._unsubs.push(() => window.sgraphWorkspace.events.off('llm-response-js', onJS));

            // Listen for .js file selections from vault
            const onFileSelected = (data) => this._onFileSelected(data);
            window.sgraphWorkspace.events.on('file-selected', onFileSelected);
            this._unsubs.push(() => window.sgraphWorkspace.events.off('file-selected', onFileSelected));
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

            this._running     = true;
            this._error       = null;
            this._consoleLogs = [];
            this._updateButtons();
            this._renderConsole();

            const startTime = Date.now();

            try {
                const result = await window.sgraphWorkspace.executeJS(sourceHtml, script);
                const elapsed = Date.now() - startTime;

                // Capture console logs from result
                if (result.consoleLogs && result.consoleLogs.length > 0) {
                    this._consoleLogs = result.consoleLogs;
                    this._renderConsole();
                }

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
                await vault.addFile(currentPath, this._filename, data);
                window.sgraphWorkspace.messages.success(`Saved ${this._filename} to vault`);
                window.sgraphWorkspace.events.emit('script-saved', {
                    filename: this._filename, path: currentPath
                });
            } catch (e) {
                window.sgraphWorkspace.messages.error('Save failed: ' + e.message);
            }
        }

        // --- Load from vault ---------------------------------------------------

        _onFileSelected(data) {
            if (!data.name || !data.name.endsWith('.js')) return;
            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel) return;
            const vault = vaultPanel.getVault();
            if (!vault) return;

            vault.getFile(data.folderPath, data.name).then(content => {
                const text = new TextDecoder().decode(new Uint8Array(content));
                this.loadScript(text, data.name);
            }).catch(e => {
                console.error('[script-editor] Load failed:', e);
            });
        }

        // --- Error display -----------------------------------------------------

        _showError(msg) {
            this._error = msg;
            const el = this.querySelector('.se-error');
            if (el) { el.textContent = msg; el.style.display = ''; }
        }

        _clearError() {
            this._error = null;
            const el = this.querySelector('.se-error');
            if (el) el.style.display = 'none';
        }

        _updateButtons() {
            const runBtn = this.querySelector('.se-run');
            if (runBtn) {
                runBtn.disabled    = this._running;
                runBtn.textContent = this._running ? 'Running...' : 'Run';
            }
        }

        _updateFilename() {
            const el = this.querySelector('.se-filename');
            if (el) el.textContent = this._filename;
        }

        _renderConsole() {
            const consoleEl = this.querySelector('.se-console-body');
            if (!consoleEl) return;
            if (this._consoleLogs.length === 0) {
                consoleEl.innerHTML = '<span class="se-console-empty">Console output will appear here after Run</span>';
                return;
            }
            consoleEl.innerHTML = this._consoleLogs.map(log => {
                const cls = log.level === 'error' ? 'se-log--error'
                          : log.level === 'warn'  ? 'se-log--warn'
                          : 'se-log--info';
                return `<div class="se-log ${cls}">${esc(log.args)}</div>`;
            }).join('');
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
                <textarea class="se-code" spellcheck="false">${esc(this._script)}</textarea>
                <div class="se-error" style="display:${this._error ? '' : 'none'}">${esc(this._error || '')}</div>
                <div class="se-console">
                    <div class="se-console-header">Console</div>
                    <div class="se-console-body">
                        <span class="se-console-empty">Console output will appear here after Run</span>
                    </div>
                </div>
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
                code.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        this._run();
                    }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = code.selectionStart;
                        const end   = code.selectionEnd;
                        code.value = code.value.substring(0, start) + '    ' + code.value.substring(end);
                        code.selectionStart = code.selectionEnd = start + 4;
                    }
                });
                code.addEventListener('input', () => { this._script = code.value; });
            }
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .se-panel {
                    display: flex; flex-direction: column;
                    height: 100%; min-height: 0;
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
                    flex: 1; min-height: 0; resize: none;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.75rem;
                    padding: 0.5rem 0.75rem; line-height: 1.5;
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: none; outline: none;
                    tab-size: 4;
                }
                .se-code::placeholder { color: var(--ws-text-muted, #5a6478); }
                .se-error {
                    padding: 0.375rem 0.75rem; flex-shrink: 0;
                    font-size: 0.6875rem; font-family: var(--ws-font-mono, monospace);
                    color: var(--ws-error, #E94560);
                    background: var(--ws-error-bg, rgba(233,69,96,0.08));
                    border-top: 1px solid var(--ws-error, #E94560);
                    white-space: pre-wrap; word-break: break-all;
                }
                .se-console {
                    flex-shrink: 0;
                    max-height: 30%;
                    display: flex; flex-direction: column;
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                }
                .se-console-header {
                    padding: 0.1875rem 0.75rem;
                    font-size: 0.625rem; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.04em;
                    color: var(--ws-text-muted, #5a6478);
                    background: var(--ws-surface, #162040);
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .se-console-body {
                    overflow-y: auto; padding: 0.25rem 0.75rem;
                    font-family: var(--ws-font-mono, monospace);
                    font-size: 0.6875rem; line-height: 1.4;
                    background: var(--ws-bg, #1A1A2E);
                    min-height: 2rem;
                }
                .se-console-empty {
                    color: var(--ws-text-muted, #5a6478); font-style: italic;
                }
                .se-log { padding: 0.0625rem 0; }
                .se-log--info  { color: var(--ws-text-secondary, #8892A0); }
                .se-log--warn  { color: #f0ad4e; }
                .se-log--error { color: var(--ws-error, #E94560); }
            `;
        }
    }

    customElements.define('script-editor', ScriptEditor);
})();
