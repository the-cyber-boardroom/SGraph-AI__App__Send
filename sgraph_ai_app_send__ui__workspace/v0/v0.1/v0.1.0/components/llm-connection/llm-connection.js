/* =============================================================================
   SGraph Workspace — LLM Connection Manager (stub)
   v0.1.0 — API key management, provider selection, localStorage persistence

   Full implementation: Session 4
   ============================================================================= */

(function() {
    'use strict';

    class LlmConnection extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
                <div style="max-width: 600px; padding: 1rem;">
                    <h2 style="font-size: 1.125rem; font-weight: 600;
                               color: var(--ws-text, #F0F0F5); margin-bottom: 1rem;">
                        LLM Connection Settings
                    </h2>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; font-size: 0.8125rem; font-weight: 600;
                                      color: var(--ws-text-secondary, #8892A0); margin-bottom: 0.375rem;">
                            OpenRouter API Key
                        </label>
                        <input type="password" placeholder="sk-or-..."
                            style="width: 100%; padding: 0.5rem 0.75rem;
                                   background: var(--ws-bg, #1A1A2E);
                                   color: var(--ws-text, #F0F0F5);
                                   border: 1px solid var(--ws-border, #2C3E6B);
                                   border-radius: var(--ws-radius, 6px);
                                   font-family: var(--ws-font-mono, monospace);
                                   font-size: 0.8125rem;"
                            disabled>
                        <small style="color: var(--ws-text-muted, #5a6478); font-size: 0.75rem;">
                            Get a key at openrouter.ai — stored in localStorage only.
                        </small>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; font-size: 0.8125rem; font-weight: 600;
                                      color: var(--ws-text-secondary, #8892A0); margin-bottom: 0.375rem;">
                            Ollama (Local)
                        </label>
                        <input type="text" placeholder="http://localhost:11434" value="http://localhost:11434"
                            style="width: 100%; padding: 0.5rem 0.75rem;
                                   background: var(--ws-bg, #1A1A2E);
                                   color: var(--ws-text, #F0F0F5);
                                   border: 1px solid var(--ws-border, #2C3E6B);
                                   border-radius: var(--ws-radius, 6px);
                                   font-family: var(--ws-font-mono, monospace);
                                   font-size: 0.8125rem;"
                            disabled>
                    </div>

                    <p style="color: var(--ws-text-muted, #5a6478); font-size: 0.8125rem; font-style: italic;">
                        Settings will be enabled in Session 4.
                    </p>
                </div>
            `;
            window.sgraphWorkspace.events.emit('llm-connection-ready');
        }
    }

    customElements.define('llm-connection', LlmConnection);
})();
