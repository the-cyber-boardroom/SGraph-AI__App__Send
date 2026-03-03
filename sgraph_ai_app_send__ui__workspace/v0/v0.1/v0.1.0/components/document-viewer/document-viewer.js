/* =============================================================================
   SGraph Workspace — Document Viewer (stub)
   v0.1.0 — type-aware rendering for text, HTML, markdown

   Two instances in the shell: source (left) and transform (right).
   Both are independently editable and versionable.

   Full implementation: Session 3
   ============================================================================= */

(function() {
    'use strict';

    class DocumentViewer extends HTMLElement {
        constructor() {
            super();
            this._content    = null;
            this._filename   = null;
            this._renderType = null;   // 'markdown' | 'text' | 'html'
            this._mode       = 'rendered';  // 'rendered' | 'source'
            this._editable   = true;
            this._version    = 0;
        }

        connectedCallback() {
            const role = this.dataset.role || 'viewer';
            this.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center;
                            height: 100%; color: var(--ws-text-muted, #5a6478);
                            font-size: 0.8125rem; text-align: center;">
                    <div>
                        <div style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;">
                            ${role === 'source' ? '&#128196;' : '&#10024;'}
                        </div>
                        ${role === 'source'
                            ? 'Select a file from the vault<br>to load it here.'
                            : 'Transformation output<br>will appear here.'}
                    </div>
                </div>
            `;
            window.sgraphWorkspace.events.emit('document-viewer-ready', { role });
        }

        // --- Public API (implemented in Session 3) ---

        load(content, filename)  { this._content = content; this._filename = filename; }
        clear()                  { this._content = null; this._filename = null; }
        getContent()             { return this._content; }
        getVersion()             { return this._version; }
        setEditable(bool)        { this._editable = bool; }
    }

    customElements.define('document-viewer', DocumentViewer);
})();
