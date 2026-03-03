/* =============================================================================
   SGraph Workspace — LLM Chat Panel
   v0.1.0 — prompt input, prompt library, streaming LLM calls

   Reads the source document-viewer content, combines with user prompt,
   sends to the connected LLM, and streams the response into the
   transform document-viewer.

   Supports:
     - Free-text prompts
     - Prompt library selector (5 built-in prompts)
     - Model selector (from llm-connection)
     - Streaming responses (SSE via OpenRouter or Ollama)
     - Ctrl+Enter to send
     - Cancel in-flight requests
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    class LlmChat extends HTMLElement {

        constructor() {
            super();
            this._sending    = false;
            this._abortCtrl  = null;
            this._connected  = false;
            this._models     = [];
            this._unsubs     = [];
        }

        connectedCallback() {
            this._render();

            // Listen for connection events
            const onConnected = (data) => {
                this._connected = true;
                this._models = document.querySelector('llm-connection')?.getModels() || [];
                this._render();
            };
            const onDisconnected = () => {
                this._connected = false;
                this._models = [];
                this._render();
            };
            const onModelChanged = () => this._updateModelSelect();

            window.sgraphWorkspace.events.on('llm-connected', onConnected);
            window.sgraphWorkspace.events.on('llm-disconnected', onDisconnected);
            window.sgraphWorkspace.events.on('llm-model-changed', onModelChanged);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('llm-connected', onConnected),
                () => window.sgraphWorkspace.events.off('llm-disconnected', onDisconnected),
                () => window.sgraphWorkspace.events.off('llm-model-changed', onModelChanged),
            );

            // Check if already connected
            const conn = document.querySelector('llm-connection');
            if (conn && conn.isConnected()) {
                this._connected = true;
                this._models = conn.getModels();
                this._render();
            }

            window.sgraphWorkspace.events.emit('llm-chat-ready');
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
            if (this._abortCtrl) this._abortCtrl.abort();
        }

        // --- Send to LLM -------------------------------------------------------

        async _send() {
            if (this._sending) return;

            const textarea = this.querySelector('#lc-prompt');
            const userPrompt = textarea ? textarea.value.trim() : '';
            if (!userPrompt) return;

            const conn = document.querySelector('llm-connection');
            if (!conn || !conn.isConnected()) {
                window.sgraphWorkspace.messages.error('No LLM connected. Go to Settings to connect.');
                return;
            }

            // Get source document content
            const sourceViewer = document.querySelector('document-viewer[data-role="source"]');
            const docContent   = sourceViewer ? sourceViewer.getTextContent() : null;

            // Build the final prompt
            let finalPrompt = userPrompt;
            if (docContent) {
                // If the prompt contains {{document}}, replace it
                if (finalPrompt.includes('{{document}}')) {
                    finalPrompt = finalPrompt.replace('{{document}}', docContent);
                } else {
                    // Otherwise append the document
                    finalPrompt = finalPrompt + '\n\n---\n\n' + docContent;
                }
            }

            const provider = conn.getProvider();
            const model    = conn.getSelectedModel();
            const apiKey   = conn.getApiKey();
            const baseUrl  = conn.getBaseUrl();

            if (!model) {
                window.sgraphWorkspace.messages.error('No model selected.');
                return;
            }

            this._sending   = true;
            this._abortCtrl = new AbortController();
            this._updateUI();

            window.sgraphWorkspace.messages.info(`Sending to ${model}...`);
            window.sgraphWorkspace.events.emit('llm-request-start', { model, provider });

            const transformViewer = document.querySelector('document-viewer[data-role="transform"]');
            let accumulated = '';

            try {
                if (provider === 'openrouter') {
                    accumulated = await this._streamOpenRouter(baseUrl, apiKey, model, finalPrompt, (chunk) => {
                        accumulated += chunk;
                        if (transformViewer) {
                            const ext = sourceViewer?.getFilename()?.split('.').pop() || 'md';
                            transformViewer.loadText(accumulated, `transform.${ext}`);
                        }
                    });
                } else if (provider === 'ollama') {
                    accumulated = await this._streamOllama(baseUrl, model, finalPrompt, (chunk) => {
                        accumulated += chunk;
                        if (transformViewer) {
                            const ext = sourceViewer?.getFilename()?.split('.').pop() || 'md';
                            transformViewer.loadText(accumulated, `transform.${ext}`);
                        }
                    });
                }

                window.sgraphWorkspace.messages.success(`Response complete — ${accumulated.length} chars`);
                window.sgraphWorkspace.events.emit('llm-request-complete', {
                    model, provider, length: accumulated.length
                });

            } catch (e) {
                if (e.name === 'AbortError') {
                    window.sgraphWorkspace.messages.warning('Request cancelled');
                } else {
                    console.error('[llm-chat] Request failed:', e);
                    window.sgraphWorkspace.messages.error('LLM request failed: ' + e.message);
                }
                window.sgraphWorkspace.events.emit('llm-request-error', { error: e.message });
            }

            this._sending   = false;
            this._abortCtrl = null;
            this._updateUI();
        }

        // --- Streaming: OpenRouter (OpenAI-compatible SSE) ----------------------

        async _streamOpenRouter(baseUrl, apiKey, model, prompt, onChunk) {
            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type':  'application/json',
                    'HTTP-Referer':  location.origin,
                    'X-Title':       'SGraph Workspace',
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true,
                }),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) {
                const errBody = await resp.text().catch(() => '');
                throw new Error(`API error ${resp.status}: ${errBody.slice(0, 200)}`);
            }

            return this._readSSE(resp.body, onChunk);
        }

        // --- Streaming: Ollama (NDJSON) -----------------------------------------

        async _streamOllama(baseUrl, model, prompt, onChunk) {
            const base = baseUrl.replace(/\/+$/, '');
            const resp = await fetch(`${base}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt, stream: true }),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);

            return this._readNDJSON(resp.body, onChunk);
        }

        // --- SSE reader (OpenAI format) -----------------------------------------

        async _readSSE(body, onChunk) {
            const reader  = body.getReader();
            const decoder = new TextDecoder();
            let buffer    = '';
            let full      = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') return full;

                    try {
                        const parsed = JSON.parse(data);
                        const delta  = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            full += delta;
                            onChunk(delta);
                        }
                    } catch (_) { /* skip malformed chunks */ }
                }
            }
            return full;
        }

        // --- NDJSON reader (Ollama format) --------------------------------------

        async _readNDJSON(body, onChunk) {
            const reader  = body.getReader();
            const decoder = new TextDecoder();
            let buffer    = '';
            let full      = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.response) {
                            full += parsed.response;
                            onChunk(parsed.response);
                        }
                        if (parsed.done) return full;
                    } catch (_) { /* skip */ }
                }
            }
            return full;
        }

        // --- Cancel --------------------------------------------------------------

        _cancel() {
            if (this._abortCtrl) {
                this._abortCtrl.abort();
            }
        }

        // --- Prompt library integration -----------------------------------------

        _applyPrompt(promptId) {
            const library = document.querySelector('prompt-library');
            if (!library) return;
            const p = library.getPrompt(promptId);
            if (!p) return;

            const textarea = this.querySelector('#lc-prompt');
            if (textarea) {
                textarea.value = p.prompt;
                textarea.focus();
            }
        }

        // --- UI update (enable/disable during send) -----------------------------

        _updateUI() {
            const sendBtn   = this.querySelector('#lc-send');
            const cancelBtn = this.querySelector('#lc-cancel');
            const textarea  = this.querySelector('#lc-prompt');

            if (sendBtn)   sendBtn.disabled   = this._sending || !this._connected;
            if (cancelBtn) cancelBtn.style.display = this._sending ? '' : 'none';
            if (textarea)  textarea.disabled  = this._sending;
        }

        _updateModelSelect() {
            const conn = document.querySelector('llm-connection');
            if (!conn) return;
            const select = this.querySelector('#lc-model-inline');
            if (!select) return;
            const model = conn.getSelectedModel();
            if (model) {
                for (const opt of select.options) {
                    opt.selected = opt.value === model;
                }
            }
        }

        // --- Render --------------------------------------------------------------

        _render() {
            const conn = document.querySelector('llm-connection');
            const models = conn ? conn.getModels() : [];
            const selectedModel = conn ? conn.getSelectedModel() : null;
            const isConnected = conn && conn.isConnected();

            // Get prompts from library
            const library = document.querySelector('prompt-library');
            const prompts = library ? library.getPrompts() : [];

            this.innerHTML = `<style>${LlmChat.styles}</style>
            <div class="lcc-panel">
                <!-- Prompt library quick-select -->
                <div class="lcc-top-bar">
                    <select class="lcc-prompt-select" id="lc-prompt-lib">
                        <option value="">Custom prompt...</option>
                        ${prompts.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
                    </select>
                    <select class="lcc-model-select" id="lc-model-inline" ${!isConnected ? 'disabled' : ''}>
                        ${!isConnected
                            ? '<option>Not connected</option>'
                            : models.map(m =>
                                `<option value="${esc(m.id)}" ${m.id === selectedModel ? 'selected' : ''}>${esc(m.name)}</option>`
                              ).join('')}
                    </select>
                </div>

                <!-- Prompt input + actions -->
                <div class="lcc-input-row">
                    <textarea class="lcc-textarea" id="lc-prompt"
                              placeholder="Describe the transformation you want... (Ctrl+Enter to send)"
                              ${this._sending ? 'disabled' : ''}></textarea>
                    <div class="lcc-actions">
                        <button class="lcc-send-btn" id="lc-send"
                                ${this._sending || !isConnected ? 'disabled' : ''}>
                            ${this._sending ? 'Sending...' : 'Send'}
                        </button>
                        <button class="lcc-cancel-btn" id="lc-cancel"
                                style="${this._sending ? '' : 'display:none'}">Cancel</button>
                    </div>
                </div>
            </div>`;

            this._bind();
        }

        _bind() {
            // Send button
            const sendBtn = this.querySelector('#lc-send');
            if (sendBtn) sendBtn.addEventListener('click', () => this._send());

            // Cancel button
            const cancelBtn = this.querySelector('#lc-cancel');
            if (cancelBtn) cancelBtn.addEventListener('click', () => this._cancel());

            // Ctrl+Enter in textarea
            const textarea = this.querySelector('#lc-prompt');
            if (textarea) {
                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        this._send();
                    }
                });
            }

            // Prompt library selector
            const promptSelect = this.querySelector('#lc-prompt-lib');
            if (promptSelect) {
                promptSelect.addEventListener('change', () => {
                    if (promptSelect.value) {
                        this._applyPrompt(promptSelect.value);
                        promptSelect.value = ''; // reset selector
                    }
                });
            }

            // Inline model selector
            const modelSelect = this.querySelector('#lc-model-inline');
            if (modelSelect) {
                modelSelect.addEventListener('change', () => {
                    const conn = document.querySelector('llm-connection');
                    if (conn) {
                        conn._selectedModel = modelSelect.value;
                        conn._saveSettings();
                        conn._updateStatusBar();
                        window.sgraphWorkspace.events.emit('llm-model-changed', { model: modelSelect.value });
                    }
                });
            }
        }

        // --- Styles --------------------------------------------------------------

        static get styles() {
            return `
                .lcc-panel {
                    display: flex; flex-direction: column; height: 100%;
                    padding: 0.5rem 0.75rem; gap: 0.375rem;
                }
                .lcc-top-bar {
                    display: flex; gap: 0.5rem; flex-shrink: 0;
                }
                .lcc-prompt-select, .lcc-model-select {
                    padding: 0.25rem 0.5rem; font-size: 0.75rem;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; font-family: inherit;
                }
                .lcc-prompt-select { flex: 1; }
                .lcc-model-select { flex: 1; max-width: 220px; }
                .lcc-model-select:disabled { opacity: 0.5; }

                .lcc-input-row {
                    display: flex; gap: 0.5rem; flex: 1; min-height: 0;
                }
                .lcc-textarea {
                    flex: 1; resize: none;
                    font-family: var(--ws-font, sans-serif); font-size: 0.875rem;
                    padding: 0.5rem 0.75rem;
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; line-height: 1.5;
                }
                .lcc-textarea:focus { border-color: var(--ws-primary, #4ECDC4); }
                .lcc-textarea:disabled { opacity: 0.5; }

                .lcc-actions {
                    display: flex; flex-direction: column; gap: 0.375rem;
                    justify-content: flex-end; flex-shrink: 0;
                }
                .lcc-send-btn {
                    padding: 0.5rem 1.25rem; border-radius: var(--ws-radius, 6px);
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    font-weight: 600; font-size: 0.8125rem;
                    cursor: pointer; font-family: inherit;
                    transition: background 100ms;
                }
                .lcc-send-btn:hover:not(:disabled) { background: rgba(78,205,196,0.2); }
                .lcc-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

                .lcc-cancel-btn {
                    padding: 0.375rem 0.75rem; border-radius: var(--ws-radius, 6px);
                    background: transparent;
                    color: var(--ws-error, #E94560);
                    border: 1px solid var(--ws-error, #E94560);
                    font-size: 0.75rem; cursor: pointer; font-family: inherit;
                }
                .lcc-cancel-btn:hover { background: var(--ws-error-bg, rgba(233,69,96,0.08)); }
            `;
        }
    }

    customElements.define('llm-chat', LlmChat);
})();
