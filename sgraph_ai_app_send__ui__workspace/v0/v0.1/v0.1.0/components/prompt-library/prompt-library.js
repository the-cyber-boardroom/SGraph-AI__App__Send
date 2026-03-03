/* =============================================================================
   SGraph Workspace — Prompt Library (stub)
   v0.1.0 — pre-built + custom prompt management

   Full implementation: Session 5
   ============================================================================= */

(function() {
    'use strict';

    // Built-in prompts (embedded, no vault dependency)
    const BUILTIN_PROMPTS = [
        { id: 'improve-clarity',  name: 'Improve Clarity',      prompt: 'Rewrite the following document for clarity. Preserve all facts and key points. Do not add new information. Output the full revised document.\n\n---\n\n{{document}}' },
        { id: 'exec-summary',     name: 'Executive Summary',    prompt: 'Create a concise executive summary (3-5 paragraphs) of the following document. Focus on key findings, decisions, and action items.\n\n---\n\n{{document}}' },
        { id: 'extract-actions',  name: 'Extract Action Items',  prompt: 'Extract all action items, decisions, and next steps from the following document. Format as a bulleted list with owners if mentioned.\n\n---\n\n{{document}}' },
        { id: 'simplify',         name: 'Simplify Language',     prompt: 'Rewrite the following document using simpler language. Target a general audience. Preserve all information but remove jargon and complex sentence structures.\n\n---\n\n{{document}}' },
        { id: 'translate-md',     name: 'Convert to Markdown',   prompt: 'Convert the following document to well-structured Markdown. Use appropriate headers, lists, code blocks, and emphasis. Preserve all content.\n\n---\n\n{{document}}' },
    ];

    class PromptLibrary extends HTMLElement {
        constructor() {
            super();
            this._prompts = [...BUILTIN_PROMPTS];
        }

        getPrompts()       { return [...this._prompts]; }
        getPrompt(id)      { return this._prompts.find(p => p.id === id); }
        getBuiltinPrompts() { return [...BUILTIN_PROMPTS]; }

        connectedCallback() {
            // Prompt library is not visible — it's a data component.
            // The llm-chat panel will query it for available prompts.
            window.sgraphWorkspace.events.emit('prompt-library-ready', {
                count: this._prompts.length
            });
        }
    }

    customElements.define('prompt-library', PromptLibrary);
})();
