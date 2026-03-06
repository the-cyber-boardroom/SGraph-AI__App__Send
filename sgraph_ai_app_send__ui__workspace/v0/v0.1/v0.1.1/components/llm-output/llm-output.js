/* =============================================================================
   SGraph Workspace — LLM Output Override
   v0.1.1 — Code block detection, visual indicator, extract-only on copy

   Detects ```javascript blocks in LLM responses. When detected:
   - Shows a visual "JS" badge in the header
   - Copy to Script extracts ONLY the code from the first ``` block
   ============================================================================= */

(function() {
    'use strict';

    const FENCE_RE = /```(?:javascript|js)?\s*\n([\s\S]*?)```/;

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    const Cls = customElements.get('llm-output');
    if (!Cls) return;

    // --- Override _emitCopy: extract code block when copying to script --------

    Cls.prototype._emitCopy = function(target) {
        if (!this._text) return;

        let content = this._text;

        // When copying to script, extract only the first code block content
        if (target === 'script') {
            const match = content.match(FENCE_RE);
            if (match) {
                content = match[1].trim();
            }
        }

        window.sgraphWorkspace.events.emit('llm-output-copy', {
            target: target,
            content: content,
        });
        window.sgraphWorkspace.messages.success(`Copied to ${target}`);
    };

    // --- Override endStreaming: add code block indicator after streaming ends --

    const _origEndStreaming = Cls.prototype.endStreaming;
    Cls.prototype.endStreaming = function() {
        _origEndStreaming.call(this);
        this._updateCodeBlockIndicator();
    };

    // --- Override loadText: add indicator when text loaded directly -----------

    const _origLoadText = Cls.prototype.loadText;
    Cls.prototype.loadText = function(text) {
        _origLoadText.call(this, text);
        this._updateCodeBlockIndicator();
    };

    // --- Override _render to add Run button after each render ----------------

    const _origRender = Cls.prototype._render;
    Cls.prototype._render = function() {
        _origRender.call(this);
        this._addRunButton();
    };

    // --- Override _updateButtons to include Run button state ----------------

    const _origUpdateButtons = Cls.prototype._updateButtons;
    Cls.prototype._updateButtons = function() {
        _origUpdateButtons.call(this);
        const runBtn = this.querySelector('.lo-run-btn');
        if (runBtn) runBtn.disabled = !this._text;
    };

    // --- Add Run button to actions bar -------------------------------------

    Cls.prototype._addRunButton = function() {
        const actions = this.querySelector('.lo-actions');
        if (!actions || actions.querySelector('.lo-run-btn')) return;

        const runBtn = document.createElement('button');
        runBtn.className = 'lo-run-btn';
        runBtn.disabled  = !this._text;
        runBtn.title     = 'Extract JS and run against source HTML (does not modify Script editor)';
        runBtn.innerHTML = '&#9654; Run';
        runBtn.style.cssText = `
            flex: 1;
            padding: 0.25rem 0.375rem; font-size: 0.625rem; font-weight: 600;
            background: var(--ws-primary-bg, rgba(78,205,196,0.1));
            color: var(--ws-primary, #4ECDC4);
            border: 1px solid var(--ws-primary, #4ECDC4);
            border-radius: var(--ws-radius, 6px);
            cursor: pointer; font-family: inherit;
            transition: background 100ms;
        `;

        runBtn.addEventListener('click', () => this._runExtracted());
        actions.insertBefore(runBtn, actions.firstChild);
    };

    // --- Run extracted JS directly from LLM output -------------------------

    Cls.prototype._runExtracted = async function() {
        if (!this._text) return;

        // Extract JS code block (or use raw text)
        const match  = this._text.match(FENCE_RE);
        const script = match ? match[1].trim() : this._text.trim();
        if (!script) {
            window.sgraphWorkspace.messages.warning('No JavaScript code found in LLM response');
            return;
        }

        // Get source HTML
        const sourceViewer = document.querySelector('document-viewer[data-role="source"]');
        const sourceHtml   = sourceViewer ? sourceViewer.getTextContent() : null;
        if (!sourceHtml) {
            window.sgraphWorkspace.messages.error('No source HTML loaded — load a file in the Source panel first');
            return;
        }

        window.sgraphWorkspace.events.emit('activity-start', { label: 'Running LLM script...' });

        try {
            const startTime = Date.now();
            const result    = await window.sgraphWorkspace.executeJS(sourceHtml, script);
            const elapsed   = Date.now() - startTime;

            if (result.error) {
                window.sgraphWorkspace.messages.error('LLM script error: ' + result.error);
            } else {
                const transformViewer = document.querySelector('document-viewer[data-role="transform"]');
                if (transformViewer) {
                    const ext = result.resultType === 'json' ? 'json' : 'html';
                    transformViewer.loadText(result.data, 'result.' + ext);
                }
                window.sgraphWorkspace.messages.success('LLM script executed in ' + elapsed + 'ms — ' + (result.data || '').length + ' chars');
            }
        } catch (e) {
            window.sgraphWorkspace.messages.error('LLM script failed: ' + e.message);
        }

        window.sgraphWorkspace.events.emit('activity-end');
    };

    // --- Code block indicator ------------------------------------------------

    Cls.prototype._updateCodeBlockIndicator = function() {
        // Remove existing badge
        const existing = this.querySelector('.lo-code-badge');
        if (existing) existing.remove();

        if (!this._text) return;

        const hasCodeBlock = FENCE_RE.test(this._text);
        if (!hasCodeBlock) return;

        const header = this.querySelector('.lo-header');
        if (!header) return;

        const badge = document.createElement('span');
        badge.className = 'lo-code-badge';
        badge.textContent = 'JS';
        badge.title = 'Response contains a JavaScript code block — "→ Script" will extract it';
        badge.style.cssText = `
            font-size: 0.5625rem; font-weight: 700;
            padding: 0.0625rem 0.3125rem; border-radius: 3px;
            background: rgba(78,205,196,0.15);
            color: var(--ws-primary, #4ECDC4);
            text-transform: uppercase; letter-spacing: 0.04em;
            margin-left: 0.375rem;
        `;

        // Insert after the status span
        const status = header.querySelector('.lo-status');
        if (status) {
            status.insertAdjacentElement('afterend', badge);
        } else {
            header.appendChild(badge);
        }
    };

    // --- Apply Run button to already-rendered instance ----------------------

    const existingOutput = document.querySelector('llm-output');
    if (existingOutput) existingOutput._addRunButton();

})();
