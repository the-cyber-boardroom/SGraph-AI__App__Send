/* =============================================================================
   SGraph Workspace — LLM Chat Panel (stub)
   v0.1.0 — prompt input + streaming response display

   Full implementation: Session 4
   ============================================================================= */

(function() {
    'use strict';

    class LlmChat extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.5rem;
                            padding: 0.75rem; height: 100%;">
                    <textarea placeholder="Describe the transformation you want..."
                        style="flex: 1; resize: none; height: 100%;
                               font-family: var(--ws-font, sans-serif); font-size: 0.875rem;
                               padding: 0.5rem 0.75rem;
                               background: var(--ws-bg, #1A1A2E);
                               color: var(--ws-text, #F0F0F5);
                               border: 1px solid var(--ws-border, #2C3E6B);
                               border-radius: var(--ws-radius, 6px);
                               outline: none;"
                        disabled></textarea>
                    <div style="display: flex; flex-direction: column; gap: 0.375rem;">
                        <button disabled
                            style="padding: 0.5rem 1rem; border-radius: var(--ws-radius, 6px);
                                   background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                                   color: var(--ws-primary, #4ECDC4);
                                   border: 1px solid var(--ws-primary, #4ECDC4);
                                   font-weight: 600; font-size: 0.8125rem;
                                   cursor: not-allowed; opacity: 0.5;">
                            Send
                        </button>
                        <select disabled
                            style="padding: 0.25rem; font-size: var(--ws-font-size-xs, 0.75rem);
                                   background: var(--ws-surface, #16213E);
                                   color: var(--ws-text-secondary, #8892A0);
                                   border: 1px solid var(--ws-border, #2C3E6B);
                                   border-radius: var(--ws-radius, 6px);">
                            <option>No model connected</option>
                        </select>
                    </div>
                </div>
            `;
            window.sgraphWorkspace.events.emit('llm-chat-ready');
        }
    }

    customElements.define('llm-chat', LlmChat);
})();
