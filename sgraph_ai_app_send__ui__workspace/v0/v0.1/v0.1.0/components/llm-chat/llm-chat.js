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

    const DEFAULT_SYSTEM_PROMPT = 'You are an HTML transformation agent. You will receive HTML source code and a transformation instruction. Reply with ONLY the transformed HTML. Do not include markdown backtick fences. Do not include any explanation or commentary. Start your response with `<!DOCTYPE html>`.';
    const SYSTEM_PROMPT_KEY = 'sgraph-workspace-system-prompt';

    class LlmChat extends HTMLElement {

        constructor() {
            super();
            this._sending       = false;
            this._abortCtrl     = null;
            this._connected     = false;
            this._models        = [];
            this._unsubs        = [];
            this._systemPrompt  = this._loadSystemPrompt();
            this._sysPromptOpen = false;
        }

        _loadSystemPrompt() {
            try {
                const saved = localStorage.getItem(SYSTEM_PROMPT_KEY);
                return saved !== null ? saved : DEFAULT_SYSTEM_PROMPT;
            } catch (_) { return DEFAULT_SYSTEM_PROMPT; }
        }

        _saveSystemPrompt() {
            try { localStorage.setItem(SYSTEM_PROMPT_KEY, this._systemPrompt); } catch (_) { /* ignore */ }
        }

        connectedCallback() {
            try {
                this._render();
            } catch (e) {
                console.error('[llm-chat] Render failed:', e);
                if (window.sgraphWorkspace?.messages) {
                    window.sgraphWorkspace.messages.error('LLM Chat render failed: ' + e.message);
                }
            }

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
            const onModelChanged  = () => this._updateModelSelect();
            const onPromptsUpdate = () => this._updatePromptSelect();

            window.sgraphWorkspace.events.on('llm-connected', onConnected);
            window.sgraphWorkspace.events.on('llm-disconnected', onDisconnected);
            window.sgraphWorkspace.events.on('llm-model-changed', onModelChanged);
            window.sgraphWorkspace.events.on('prompt-library-updated', onPromptsUpdate);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('llm-connected', onConnected),
                () => window.sgraphWorkspace.events.off('llm-disconnected', onDisconnected),
                () => window.sgraphWorkspace.events.off('llm-model-changed', onModelChanged),
                () => window.sgraphWorkspace.events.off('prompt-library-updated', onPromptsUpdate),
            );

            // Check if already connected
            const conn = document.querySelector('llm-connection');
            if (conn && typeof conn.isConnected === 'function' && conn.isConnected()) {
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

            const systemPrompt = this._systemPrompt ? this._systemPrompt.trim() : '';

            try {
                if (provider === 'openrouter') {
                    accumulated = await this._streamOpenRouter(baseUrl, apiKey, model, finalPrompt, systemPrompt, (chunk) => {
                        accumulated += chunk;
                        if (transformViewer) {
                            const ext = sourceViewer?.getFilename()?.split('.').pop() || 'md';
                            transformViewer.loadText(accumulated, `transform.${ext}`);
                        }
                    });
                } else if (provider === 'ollama') {
                    accumulated = await this._streamOllama(baseUrl, model, finalPrompt, systemPrompt, (chunk) => {
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

        async _streamOpenRouter(baseUrl, apiKey, model, prompt, systemPrompt, onChunk) {
            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: prompt });

            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type':  'application/json',
                    'HTTP-Referer':  location.origin,
                    'X-Title':       'SGraph Workspace',
                },
                body: JSON.stringify({ model, messages, stream: true }),
                signal: this._abortCtrl.signal,
            });

            if (!resp.ok) {
                const errBody = await resp.text().catch(() => '');
                throw new Error(`API error ${resp.status}: ${errBody.slice(0, 200)}`);
            }

            return this._readSSE(resp.body, onChunk);
        }

        // --- Streaming: Ollama (NDJSON) -----------------------------------------

        async _streamOllama(baseUrl, model, prompt, systemPrompt, onChunk) {
            const base = baseUrl.replace(/\/+$/, '');
            const body = { model, prompt, stream: true };
            if (systemPrompt) body.system = systemPrompt;
            const resp = await fetch(`${base}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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

        _updatePromptSelect() {
            const select = this.querySelector('#lc-prompt-lib');
            if (!select) return;
            const library = document.querySelector('prompt-library');
            const prompts = library && typeof library.getPrompts === 'function' ? library.getPrompts() : [];
            select.innerHTML = `<option value="">Custom prompt...</option>`
                + prompts.map(p => {
                    const prefix = p.builtin ? '' : '\u{1F4C1} ';
                    return `<option value="${esc(p.id)}">${prefix}${esc(p.name)}</option>`;
                }).join('');
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
            const isUpgraded = conn && typeof conn.getModels === 'function';
            const models = isUpgraded ? conn.getModels() : [];
            const selectedModel = isUpgraded ? conn.getSelectedModel() : null;
            const isConnected = isUpgraded && conn.isConnected();

            // Get prompts from library
            const library = document.querySelector('prompt-library');
            const prompts = library && typeof library.getPrompts === 'function' ? library.getPrompts() : [];

            this.innerHTML = `<style>${LlmChat.styles}</style>
            <div class="lcc-panel">
                <!-- System prompt (collapsible) -->
                <div class="lcc-sys-row">
                    <button class="lcc-sys-toggle" id="lc-sys-toggle">
                        ${this._sysPromptOpen ? '&#9660;' : '&#9654;'} System Prompt
                        <span class="lcc-sys-status">${this._systemPrompt ? 'Active' : 'None'}</span>
                    </button>
                </div>
                ${this._sysPromptOpen ? `
                <div class="lcc-sys-editor">
                    <textarea class="lcc-sys-textarea" id="lc-sys-prompt"
                              placeholder="System prompt sent with every request...">${esc(this._systemPrompt || '')}</textarea>
                    <div class="lcc-sys-actions">
                        <button class="lcc-sys-reset" id="lc-sys-reset" title="Reset to default">Reset</button>
                    </div>
                </div>` : ''}

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
            // System prompt toggle
            const sysToggle = this.querySelector('#lc-sys-toggle');
            if (sysToggle) sysToggle.addEventListener('click', () => {
                this._sysPromptOpen = !this._sysPromptOpen;
                this._render();
            });

            // System prompt textarea — save on input
            const sysTextarea = this.querySelector('#lc-sys-prompt');
            if (sysTextarea) sysTextarea.addEventListener('input', () => {
                this._systemPrompt = sysTextarea.value;
                this._saveSystemPrompt();
            });

            // System prompt reset
            const sysReset = this.querySelector('#lc-sys-reset');
            if (sysReset) sysReset.addEventListener('click', () => {
                this._systemPrompt = DEFAULT_SYSTEM_PROMPT;
                this._saveSystemPrompt();
                const ta = this.querySelector('#lc-sys-prompt');
                if (ta) ta.value = DEFAULT_SYSTEM_PROMPT;
            });

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
                    display: flex; flex-direction: column; flex: 1; min-height: 0;
                    padding: 0.5rem 0.75rem; gap: 0.375rem;
                }
                .lcc-sys-row { flex-shrink: 0; }
                .lcc-sys-toggle {
                    background: none; border: none; cursor: pointer;
                    font-size: 0.6875rem; font-weight: 600;
                    color: var(--ws-text-muted, #5a6478); font-family: inherit;
                    padding: 0.125rem 0; display: flex; align-items: center; gap: 0.375rem;
                }
                .lcc-sys-toggle:hover { color: var(--ws-text-secondary, #8892A0); }
                .lcc-sys-status {
                    font-size: 0.625rem; font-weight: 600;
                    padding: 0.0625rem 0.375rem; border-radius: 9999px;
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                }
                .lcc-sys-editor {
                    display: flex; gap: 0.375rem; flex-shrink: 0;
                }
                .lcc-sys-textarea {
                    flex: 1; resize: none; height: 3.5rem;
                    font-family: var(--ws-font-mono, monospace); font-size: 0.75rem;
                    padding: 0.375rem 0.5rem;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; line-height: 1.4;
                }
                .lcc-sys-textarea:focus { border-color: var(--ws-primary, #4ECDC4); }
                .lcc-sys-actions { display: flex; flex-direction: column; justify-content: flex-end; }
                .lcc-sys-reset {
                    padding: 0.25rem 0.5rem; font-size: 0.6875rem;
                    background: transparent; border: 1px solid var(--ws-border, #2C3E6B);
                    color: var(--ws-text-muted, #5a6478); border-radius: var(--ws-radius, 6px);
                    cursor: pointer; font-family: inherit;
                }
                .lcc-sys-reset:hover { color: var(--ws-text-secondary, #8892A0); background: var(--ws-surface-hover, #253254); }
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
