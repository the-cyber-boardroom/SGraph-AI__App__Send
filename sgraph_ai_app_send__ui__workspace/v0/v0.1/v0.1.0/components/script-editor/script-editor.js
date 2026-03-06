/* =============================================================================
   SGraph Workspace — Script Editor
   v0.3.0 — Full-panel JS editor with browser-style console and object browser

   Lives in the middle "Script" panel of the 3-column layout (JSFiddle-style).
   Features:
     - Resizable split between code editor and console
     - Browser-style console: logs + errors interleaved chronologically
     - Expandable object browser (1 level deep) for console.log objects
     - Auto-loads .js files from vault selection
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
            this._script       = SAMPLE_SCRIPT;
            this._filename     = 'transform.js';
            this._running      = false;
            this._consoleLogs  = [];   // [{ level, args, data }]  data = structured objects
            this._unsubs       = [];
            this._codeFraction = 0.6;  // fraction of height for code editor
        }

        connectedCallback() {
            this._render();

            const onJS = (data) => {
                this.loadScript(data.code || '', data.filename || 'transform.js');
            };
            window.sgraphWorkspace.events.on('llm-response-js', onJS);
            this._unsubs.push(() => window.sgraphWorkspace.events.off('llm-response-js', onJS));

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
            const textarea = this.querySelector('.se-code');
            if (textarea) {
                textarea.value = code;
                this._syncHighlight();
            } else {
                this._render();
            }
            this._updateFilename();
        }

        getScript() {
            const textarea = this.querySelector('.se-code');
            return textarea ? textarea.value : this._script;
        }

        getFilename() { return this._filename; }

        clear() {
            this._script      = '';
            this._filename    = 'transform.js';
            this._consoleLogs = [];
            this._render();
        }

        // --- Run ---------------------------------------------------------------

        async _run() {
            if (this._running) return;

            const script = this.getScript();
            if (!script.trim()) {
                this._addConsoleEntry('error', 'No script to execute');
                return;
            }

            const sourceViewer = document.querySelector('document-viewer[data-role="source"]');
            const sourceHtml   = sourceViewer ? sourceViewer.getTextContent() : null;
            if (!sourceHtml) {
                this._addConsoleEntry('error', 'No source HTML loaded. Load a file in the source panel first.');
                return;
            }

            this._running     = true;
            this._consoleLogs = [];
            this._updateButtons();
            this._renderConsole();
            window.sgraphWorkspace.events.emit('activity-start', { label: 'Running script...' });

            const startTime = Date.now();

            try {
                const result = await window.sgraphWorkspace.executeJS(sourceHtml, script);
                const elapsed = Date.now() - startTime;

                // Add captured console logs
                if (result.consoleLogs && result.consoleLogs.length > 0) {
                    for (const log of result.consoleLogs) {
                        this._consoleLogs.push(log);
                    }
                }

                if (result.error) {
                    this._addConsoleEntry('error', result.error);
                    window.sgraphWorkspace.events.emit('script-executed', {
                        success: false, error: result.error, elapsedMs: elapsed
                    });
                } else {
                    const transformViewer = document.querySelector('document-viewer[data-role="transform"]');
                    if (transformViewer) {
                        const ext = result.resultType === 'json' ? 'json' : 'html';
                        transformViewer.loadText(result.data, `result.${ext}`);
                    }

                    this._addConsoleEntry('info', `Script executed in ${elapsed}ms — ${result.resultType} output (${(result.data || '').length} chars)`);
                    window.sgraphWorkspace.messages.success(`Script executed in ${elapsed}ms`);
                    window.sgraphWorkspace.events.emit('script-executed', {
                        success: true,
                        resultType: result.resultType,
                        resultLength: (result.data || '').length,
                        elapsedMs: elapsed,
                    });
                }
            } catch (e) {
                this._addConsoleEntry('error', 'Execution failed: ' + e.message);
            }

            this._running = false;
            this._updateButtons();
            this._renderConsole();
            window.sgraphWorkspace.events.emit('activity-end');
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

        // --- Console entries ---------------------------------------------------

        _addConsoleEntry(level, text, data) {
            this._consoleLogs.push({ level, args: text, data: data || null });
        }

        _clearConsole() {
            this._consoleLogs = [];
            this._renderConsole();
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

        // --- Object browser (1-level expandable) --------------------------------

        _renderObjectValue(val) {
            if (val === null) return '<span class="se-val-null">null</span>';
            if (val === undefined) return '<span class="se-val-null">undefined</span>';
            if (typeof val === 'string') return `<span class="se-val-string">"${esc(val)}"</span>`;
            if (typeof val === 'number') return `<span class="se-val-number">${val}</span>`;
            if (typeof val === 'boolean') return `<span class="se-val-bool">${val}</span>`;
            if (Array.isArray(val)) {
                if (val.length === 0) return '<span class="se-val-null">[]</span>';
                return `<span class="se-val-type">Array(${val.length})</span>`;
            }
            if (typeof val === 'object') {
                const keys = Object.keys(val);
                if (keys.length === 0) return '<span class="se-val-null">{}</span>';
                return `<span class="se-val-type">Object {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}</span>`;
            }
            return esc(String(val));
        }

        _renderExpandableObject(data) {
            if (!data || typeof data !== 'object') return '';
            const entries = Array.isArray(data)
                ? data.map((v, i) => [String(i), v])
                : Object.entries(data);
            if (entries.length === 0) return '';

            const rows = entries.slice(0, 50).map(([k, v]) => {
                const valHtml = this._renderObjectValue(v);
                // If value is an object/array, show its properties too (1 level)
                let subRows = '';
                if (v && typeof v === 'object') {
                    const subEntries = Array.isArray(v)
                        ? v.map((sv, si) => [String(si), sv])
                        : Object.entries(v);
                    subRows = subEntries.slice(0, 20).map(([sk, sv]) =>
                        `<div class="se-obj-row se-obj-row--sub"><span class="se-obj-key">${esc(sk)}:</span> ${this._renderObjectValue(sv)}</div>`
                    ).join('');
                }
                return `<div class="se-obj-row"><span class="se-obj-key">${esc(k)}:</span> ${valHtml}</div>${subRows}`;
            }).join('');

            return `<div class="se-obj-browser">${rows}</div>`;
        }

        _renderConsole() {
            const consoleEl = this.querySelector('.se-console-body');
            if (!consoleEl) return;
            if (this._consoleLogs.length === 0) {
                consoleEl.innerHTML = '<span class="se-console-empty">Console output appears here after Run</span>';
                return;
            }
            consoleEl.innerHTML = this._consoleLogs.map(log => {
                const cls = log.level === 'error' ? 'se-log--error'
                          : log.level === 'warn'  ? 'se-log--warn'
                          : log.level === 'info'   ? 'se-log--system'
                          : 'se-log--log';
                const prefix = log.level === 'error' ? '<span class="se-log-prefix se-log-prefix--error">ERR</span> '
                             : log.level === 'warn'  ? '<span class="se-log-prefix se-log-prefix--warn">WRN</span> '
                             : '';

                let objHtml = '';
                if (log.data && typeof log.data === 'object') {
                    objHtml = this._renderExpandableObject(log.data);
                }

                return `<div class="se-log ${cls}">${prefix}${esc(log.args)}${objHtml}</div>`;
            }).join('');

            // Auto-scroll to bottom
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }

        // --- Syntax highlighting -----------------------------------------------

        _highlightCode(code) {
            if (typeof JsHighlighter !== 'undefined') {
                return JsHighlighter.highlight(code);
            }
            return esc(code);
        }

        _syncHighlight() {
            const pre  = this.querySelector('.se-highlight');
            const code = this.querySelector('.se-code');
            if (!pre || !code) return;
            // Re-highlight and add trailing newline so pre height matches textarea
            pre.innerHTML = this._highlightCode(code.value) + '\n';
        }

        _syncScroll() {
            const pre  = this.querySelector('.se-highlight');
            const code = this.querySelector('.se-code');
            if (!pre || !code) return;
            pre.scrollTop  = code.scrollTop;
            pre.scrollLeft = code.scrollLeft;
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
                <div class="se-split">
                    <div class="se-code-wrap" style="flex:${this._codeFraction}">
                        <pre class="se-highlight" aria-hidden="true">${this._highlightCode(this._script)}</pre>
                        <textarea class="se-code" spellcheck="false">${esc(this._script)}</textarea>
                    </div>
                    <div class="se-split-handle" title="Drag to resize"></div>
                    <div class="se-console-wrap" style="flex:${1 - this._codeFraction}">
                        <div class="se-console-header">
                            <span>Console</span>
                            <button class="se-console-clear" title="Clear console">Clear</button>
                        </div>
                        <div class="se-console-body">
                            <span class="se-console-empty">Console output appears here after Run</span>
                        </div>
                    </div>
                </div>
            </div>`;

            this._bind();
        }

        _bind() {
            const runBtn  = this.querySelector('.se-run');
            const saveBtn = this.querySelector('.se-save');
            const code    = this.querySelector('.se-code');
            const clearBtn = this.querySelector('.se-console-clear');

            if (runBtn)  runBtn.addEventListener('click', () => this._run());
            if (saveBtn) saveBtn.addEventListener('click', () => this._save());
            if (clearBtn) clearBtn.addEventListener('click', () => this._clearConsole());

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
                code.addEventListener('input', () => {
                    this._script = code.value;
                    this._syncHighlight();
                });
                code.addEventListener('scroll', () => this._syncScroll());
            }

            // Resizable split between code and console
            this._setupSplitResize();
        }

        _setupSplitResize() {
            const handle    = this.querySelector('.se-split-handle');
            const split     = this.querySelector('.se-split');
            const codeWrap  = this.querySelector('.se-code-wrap');
            const consWrap  = this.querySelector('.se-console-wrap');
            if (!handle || !split || !codeWrap || !consWrap) return;

            let isResizing = false;
            let startY, startCodeH, totalH;

            handle.addEventListener('mousedown', (e) => {
                isResizing = true;
                startY     = e.clientY;
                startCodeH = codeWrap.offsetHeight;
                totalH     = split.offsetHeight - 4; // minus handle height
                handle.classList.add('se-split-handle--active');
                document.body.style.cursor    = 'row-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff     = e.clientY - startY;
                const newCodeH = Math.max(60, Math.min(startCodeH + diff, totalH - 40));
                this._codeFraction = newCodeH / totalH;
                codeWrap.style.flex = String(this._codeFraction);
                consWrap.style.flex = String(1 - this._codeFraction);
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                handle.classList.remove('se-split-handle--active');
                document.body.style.cursor     = '';
                document.body.style.userSelect = '';
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
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
                .se-actions { display: flex; gap: 0.375rem; }
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

                /* Split layout */
                .se-split {
                    flex: 1; min-height: 0;
                    display: flex; flex-direction: column;
                }
                .se-code-wrap {
                    position: relative;
                    display: flex; min-height: 0;
                    overflow: hidden;
                }
                .se-highlight {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    margin: 0;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.75rem;
                    padding: 0.5rem 0.75rem; line-height: 1.5;
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: none;
                    tab-size: 4; box-sizing: border-box;
                    white-space: pre-wrap; word-wrap: break-word;
                    overflow: auto;
                    pointer-events: none;
                    z-index: 0;
                }
                .se-code {
                    position: relative; z-index: 1;
                    flex: 1; width: 100%; min-height: 0; resize: none;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.75rem;
                    padding: 0.5rem 0.75rem; line-height: 1.5;
                    background: transparent;
                    color: transparent;
                    caret-color: var(--ws-text, #F0F0F5);
                    border: none; outline: none;
                    tab-size: 4; box-sizing: border-box;
                }
                .se-code::placeholder { color: var(--ws-text-muted, #5a6478); }
                .se-code::selection { background: rgba(78, 205, 196, 0.25); }

                .se-split-handle {
                    height: 4px; flex-shrink: 0;
                    cursor: row-resize;
                    background: var(--ws-border-subtle, #222d4d);
                    transition: background 0.15s;
                }
                .se-split-handle:hover,
                .se-split-handle--active { background: var(--ws-primary, #4ECDC4); }

                .se-console-wrap {
                    display: flex; flex-direction: column;
                    min-height: 0; overflow: hidden;
                }
                .se-console-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0.1875rem 0.75rem;
                    font-size: 0.625rem; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.04em;
                    color: var(--ws-text-muted, #5a6478);
                    background: var(--ws-surface, #162040);
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .se-console-clear {
                    padding: 0 0.375rem; font-size: 0.5625rem; font-weight: 600;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: 3px; cursor: pointer; font-family: inherit;
                }
                .se-console-clear:hover { color: var(--ws-text, #F0F0F5); }
                .se-console-body {
                    flex: 1; overflow-y: auto; padding: 0.25rem 0;
                    font-family: var(--ws-font-mono, monospace);
                    font-size: 0.6875rem; line-height: 1.5;
                    background: var(--ws-bg, #1A1A2E);
                }
                .se-console-empty {
                    color: var(--ws-text-muted, #5a6478); font-style: italic;
                    padding: 0.25rem 0.75rem;
                }

                /* Log entries (browser-style) */
                .se-log {
                    padding: 0.125rem 0.75rem;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                }
                .se-log--log    { color: var(--ws-text, #F0F0F5); }
                .se-log--system { color: var(--ws-text-muted, #5a6478); font-style: italic; }
                .se-log--warn   { color: #f0ad4e; background: rgba(240,173,78,0.04); }
                .se-log--error  {
                    color: var(--ws-error, #E94560);
                    background: var(--ws-error-bg, rgba(233,69,96,0.06));
                }
                .se-log-prefix {
                    font-size: 0.5625rem; font-weight: 700;
                    padding: 0 0.25rem; border-radius: 2px;
                    vertical-align: middle;
                }
                .se-log-prefix--error { background: var(--ws-error, #E94560); color: #fff; }
                .se-log-prefix--warn  { background: #f0ad4e; color: #000; }

                /* Object browser */
                .se-obj-browser {
                    margin: 0.125rem 0 0 1rem;
                    border-left: 2px solid var(--ws-border-subtle, #222d4d);
                    padding-left: 0.5rem;
                }
                .se-obj-row {
                    padding: 0.0625rem 0;
                    color: var(--ws-text, #F0F0F5);
                }
                .se-obj-row--sub {
                    margin-left: 1rem;
                    color: var(--ws-text-secondary, #8892A0);
                }
                .se-obj-key {
                    color: #c792ea; font-weight: 600;
                }
                .se-val-string { color: #c3e88d; }
                .se-val-number { color: #f78c6c; }
                .se-val-bool   { color: #89ddff; }
                .se-val-null   { color: var(--ws-text-muted, #5a6478); font-style: italic; }
                .se-val-type   { color: #82aaff; font-style: italic; }
            `;
        }
    }

    customElements.define('script-editor', ScriptEditor);
})();
