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

})();
