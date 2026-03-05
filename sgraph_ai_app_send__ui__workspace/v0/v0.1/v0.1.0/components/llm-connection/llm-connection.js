/* =============================================================================
   SGraph Workspace — LLM Connection Manager
   v0.1.0 — API key management, provider selection, model listing

   Supports two providers for Phase 1:
     - OpenRouter (api key → openrouter.ai, access to many models)
     - Ollama     (local → http://localhost:11434, fully private)

   All keys stored in localStorage only — never sent to SG/Send server.
   LLM calls happen entirely in the browser (zero-knowledge).

   Emits 'llm-connected' when a provider is configured and models listed.
   Emits 'llm-disconnected' when a provider loses connection.
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    const STORAGE_KEY = 'sgraph-workspace-llm';

    // --- Provider definitions ------------------------------------------------

    const PROVIDERS = {
        openrouter: {
            name:    'OpenRouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            hint:    'Get a key at openrouter.ai — access to Claude, GPT, Gemini, Llama, and more.',
            placeholder: 'sk-or-...',
            defaultModels: [
                { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
                { id: 'anthropic/claude-haiku-4',  name: 'Claude Haiku 4' },
                { id: 'openai/gpt-4o',             name: 'GPT-4o' },
                { id: 'openai/gpt-4o-mini',        name: 'GPT-4o Mini' },
                { id: 'google/gemini-2.5-flash',    name: 'Gemini 2.5 Flash' },
                { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
            ],
        },
        ollama: {
            name:    'Ollama (Local)',
            baseUrl: 'http://localhost:11434',
            hint:    'Ollama runs locally — nothing leaves your machine.',
            placeholder: 'http://localhost:11434',
            defaultModels: [],
        },
    };

    // --- Component -----------------------------------------------------------

    class LlmConnection extends HTMLElement {

        constructor() {
            super();
            this._provider      = null;       // 'openrouter' | 'ollama'
            this._apiKey        = '';
            this._ollamaUrl     = 'http://localhost:11434';
            this._models        = [];         // [{ id, name }]
            this._selectedModel = null;
            this._status        = 'disconnected'; // disconnected | connecting | connected | error
            this._errorMsg      = null;
            this._loadSettings();
        }

        connectedCallback() {
            this._render();

            // Auto-connect if we have saved settings
            if (this._provider === 'openrouter' && this._apiKey) {
                this._connect();
            } else if (this._provider === 'ollama') {
                this._connect();
            }

            window.sgraphWorkspace.events.emit('llm-connection-ready');
        }

        // --- Settings persistence ----------------------------------------------

        _loadSettings() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const s = JSON.parse(raw);
                    this._provider      = s.provider || null;
                    this._apiKey        = s.apiKey || '';
                    this._ollamaUrl     = s.ollamaUrl || 'http://localhost:11434';
                    this._selectedModel = s.selectedModel || null;
                }
            } catch (_) { /* ignore */ }
        }

        _saveSettings() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    provider:      this._provider,
                    apiKey:        this._apiKey,
                    ollamaUrl:     this._ollamaUrl,
                    selectedModel: this._selectedModel,
                }));
            } catch (_) { /* ignore */ }
        }

        // --- Public API (used by llm-chat) ------------------------------------

        getProvider()      { return this._provider; }
        getApiKey()        { return this._apiKey; }
        getBaseUrl()       {
            if (this._provider === 'openrouter') return PROVIDERS.openrouter.baseUrl;
            if (this._provider === 'ollama')     return this._ollamaUrl;
            return null;
        }
        getModels()        { return [...this._models]; }
        getSelectedModel() { return this._selectedModel; }
        isConnected()      { return this._status === 'connected'; }

        setSelectedModel(modelId) {
            this._selectedModel = modelId;
            this._saveSettings();
            this._updateStatusBar();
            window.sgraphWorkspace.events.emit('llm-model-changed', { model: modelId });
        }

        // --- Connection --------------------------------------------------------

        async _connect() {
            if (!this._provider) return;

            this._status   = 'connecting';
            this._errorMsg = null;
            this._render();

            try {
                if (this._provider === 'openrouter') {
                    await this._connectOpenRouter();
                } else if (this._provider === 'ollama') {
                    await this._connectOllama();
                }

                this._status = 'connected';
                this._saveSettings();
                this._render();

                window.sgraphWorkspace.events.emit('llm-connected', {
                    provider: this._provider,
                    model:    this._selectedModel,
                    models:   this._models.length,
                });
                window.sgraphWorkspace.messages.success(
                    `Connected to ${PROVIDERS[this._provider].name} — ${this._models.length} models`
                );
                this._updateStatusBar();

            } catch (e) {
                console.error('[llm-connection] Connect failed:', e);
                this._status   = 'error';
                this._errorMsg = e.message;
                this._render();
                window.sgraphWorkspace.messages.error('LLM connection failed: ' + e.message);
            }
        }

        async _connectOpenRouter() {
            if (!this._apiKey) throw new Error('API key required');

            const resp = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${this._apiKey}` },
            });

            if (!resp.ok) {
                if (resp.status === 401) throw new Error('Invalid API key');
                throw new Error(`OpenRouter API error: ${resp.status}`);
            }

            const data = await resp.json();
            if (data.data && Array.isArray(data.data)) {
                this._models = data.data
                    .filter(m => m.id && !m.id.includes('image'))
                    .map(m => ({ id: m.id, name: m.name || m.id }))
                    .sort((a, b) => a.name.localeCompare(b.name));
            } else {
                this._models = [...PROVIDERS.openrouter.defaultModels];
            }

            if (!this._selectedModel || !this._models.find(m => m.id === this._selectedModel)) {
                this._selectedModel = this._models.length > 0 ? this._models[0].id : null;
            }
        }

        async _connectOllama() {
            const base = this._ollamaUrl.replace(/\/+$/, '');
            const resp = await fetch(`${base}/api/tags`);
            if (!resp.ok) throw new Error(`Ollama not reachable at ${base}`);

            const data = await resp.json();
            if (data.models && Array.isArray(data.models)) {
                this._models = data.models.map(m => ({ id: m.name, name: m.name }));
            } else {
                this._models = [];
            }

            if (!this._selectedModel || !this._models.find(m => m.id === this._selectedModel)) {
                this._selectedModel = this._models.length > 0 ? this._models[0].id : null;
            }
        }

        _disconnect() {
            this._status   = 'disconnected';
            this._models   = [];
            this._errorMsg = null;
            this._render();
            window.sgraphWorkspace.events.emit('llm-disconnected');
            this._updateStatusBar();
        }

        _updateStatusBar() {
            const el = document.querySelector('.ws-status-model');
            if (!el) return;
            if (this._status === 'connected' && this._selectedModel) {
                const m = this._models.find(m => m.id === this._selectedModel);
                el.textContent = `Model: ${m ? m.name : this._selectedModel}`;
            } else {
                el.textContent = 'Model: not connected';
            }
        }

        // --- Render ------------------------------------------------------------

        _render() {
            const dot = this._status === 'connected'  ? `<span class="lc-dot lc-dot--ok"></span>`
                      : this._status === 'connecting'  ? `<span class="lc-dot lc-dot--connecting"></span>`
                      : this._status === 'error'       ? `<span class="lc-dot lc-dot--error"></span>`
                      :                                  `<span class="lc-dot"></span>`;

            this.innerHTML = `<style>${LlmConnection.styles}</style>
            <div class="lc-settings">
                <h2 class="lc-title">LLM Connection ${dot}</h2>

                <div class="lc-section">
                    <label class="lc-label">Provider</label>
                    <div class="lc-provider-btns">
                        <button class="lc-provider-btn ${this._provider === 'openrouter' ? 'lc-provider-btn--active' : ''}"
                                data-provider="openrouter">OpenRouter</button>
                        <button class="lc-provider-btn ${this._provider === 'ollama' ? 'lc-provider-btn--active' : ''}"
                                data-provider="ollama">Ollama (Local)</button>
                    </div>
                </div>

                ${this._provider === 'openrouter' ? `
                <div class="lc-section">
                    <label class="lc-label">API Key</label>
                    <input type="password" class="lc-input" id="lc-apikey"
                           placeholder="${PROVIDERS.openrouter.placeholder}" value="${esc(this._apiKey)}">
                    <div class="lc-hint">${PROVIDERS.openrouter.hint}</div>
                </div>` : ''}

                ${this._provider === 'ollama' ? `
                <div class="lc-section">
                    <label class="lc-label">Ollama URL</label>
                    <input type="text" class="lc-input" id="lc-ollama-url"
                           placeholder="${PROVIDERS.ollama.placeholder}" value="${esc(this._ollamaUrl)}">
                    <div class="lc-hint">${PROVIDERS.ollama.hint}</div>
                </div>` : ''}

                ${this._errorMsg ? `<div class="lc-error">${esc(this._errorMsg)}</div>` : ''}

                ${this._provider ? `
                <div class="lc-actions">
                    <button class="lc-btn lc-btn--primary" id="lc-connect"
                            ${this._status === 'connecting' ? 'disabled' : ''}>
                        ${this._status === 'connecting' ? 'Connecting...' : this._status === 'connected' ? 'Reconnect' : 'Connect'}
                    </button>
                    ${this._status === 'connected' ? `<button class="lc-btn" id="lc-disconnect">Disconnect</button>` : ''}
                </div>` : `<div class="lc-hint">Select a provider to get started.</div>`}

                ${this._status === 'connected' && this._models.length > 0 ? `
                <div class="lc-section">
                    <label class="lc-label">Model (${this._models.length} available)</label>
                    <select class="lc-select" id="lc-model-select">
                        ${this._models.map(m =>
                            `<option value="${esc(m.id)}" ${m.id === this._selectedModel ? 'selected' : ''}>${esc(m.name)}</option>`
                        ).join('')}
                    </select>
                </div>` : ''}

                <hr class="lc-divider">
                <h2 class="lc-title">Workspace Storage</h2>
                <div class="lc-hint" style="margin-bottom: 0.75rem">Data stored in your browser's localStorage. Never sent to the server.</div>
                ${this._renderStorageSection()}
            </div>`;

            this._bind();
        }

        // --- Storage display ----------------------------------------------------

        _renderStorageSection() {
            const KEYS = [
                { key: 'sgraph-workspace-vault', label: 'Vault Settings' },
                { key: 'sgraph-workspace-llm',   label: 'LLM Settings' },
            ];

            let html = '';
            for (const { key, label } of KEYS) {
                try {
                    const raw = localStorage.getItem(key);
                    if (!raw) {
                        html += `<div class="lc-section"><label class="lc-label">${esc(label)}</label><div class="lc-hint">Not set</div></div>`;
                        continue;
                    }
                    const data = JSON.parse(raw);
                    const rows = Object.entries(data).map(([k, v]) => {
                        let display = v;
                        // Mask sensitive values (show first/last chars)
                        if (k === 'apiKey' && typeof v === 'string' && v.length > 8) {
                            display = v.slice(0, 6) + '...' + v.slice(-4);
                        }
                        if (typeof display === 'object') display = JSON.stringify(display);
                        return `<div class="lc-storage-row">
                            <span class="lc-storage-key">${esc(k)}</span>
                            <input type="text" class="lc-storage-value" value="${esc(String(display || ''))}" readonly
                                   data-storage-key="${esc(key)}" data-field="${esc(k)}" data-full="${esc(String(v || ''))}">
                            <button class="lc-storage-copy" data-copy="${esc(String(v || ''))}" title="Copy to clipboard">Copy</button>
                        </div>`;
                    }).join('');
                    html += `<div class="lc-section"><label class="lc-label">${esc(label)}</label>${rows}</div>`;
                } catch (_) {
                    html += `<div class="lc-section"><label class="lc-label">${esc(label)}</label><div class="lc-hint">Error reading</div></div>`;
                }
            }
            return html;
        }

        // --- Event binding -----------------------------------------------------

        _bind() {
            this.querySelectorAll('.lc-provider-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._provider = btn.dataset.provider;
                    this._status   = 'disconnected';
                    this._errorMsg = null;
                    this._saveSettings();
                    this._render();
                });
            });

            const apiKeyInput = this.querySelector('#lc-apikey');
            if (apiKeyInput) {
                apiKeyInput.addEventListener('input', () => { this._apiKey = apiKeyInput.value; });
                apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._connect(); });
            }

            const ollamaInput = this.querySelector('#lc-ollama-url');
            if (ollamaInput) {
                ollamaInput.addEventListener('input', () => { this._ollamaUrl = ollamaInput.value; });
                ollamaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._connect(); });
            }

            const connectBtn = this.querySelector('#lc-connect');
            if (connectBtn) connectBtn.addEventListener('click', () => { this._saveSettings(); this._connect(); });

            const disconnectBtn = this.querySelector('#lc-disconnect');
            if (disconnectBtn) disconnectBtn.addEventListener('click', () => this._disconnect());

            // Copy buttons for storage values
            this.querySelectorAll('.lc-storage-copy').forEach(btn => {
                btn.addEventListener('click', () => {
                    const val = btn.dataset.copy;
                    navigator.clipboard.writeText(val).then(() => {
                        btn.textContent = 'Copied';
                        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                    }).catch(() => {
                        // Fallback: select the input
                        const input = btn.previousElementSibling;
                        if (input) { input.value = btn.dataset.copy; input.select(); }
                    });
                });
            });

            // Clicking on storage value input reveals full value
            this.querySelectorAll('.lc-storage-value').forEach(input => {
                input.addEventListener('click', () => {
                    input.value = input.dataset.full;
                    input.select();
                });
            });

            const modelSelect = this.querySelector('#lc-model-select');
            if (modelSelect) {
                modelSelect.addEventListener('change', () => {
                    this._selectedModel = modelSelect.value;
                    this._saveSettings();
                    this._updateStatusBar();
                    window.sgraphWorkspace.events.emit('llm-model-changed', { model: this._selectedModel });
                });
            }
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .lc-settings { max-width: 600px; padding: 1rem; }
                .lc-title {
                    font-size: 1.125rem; font-weight: 600;
                    color: var(--ws-text, #F0F0F5); margin: 0 0 1rem;
                    display: flex; align-items: center; gap: 0.5rem;
                }
                .lc-dot {
                    width: 8px; height: 8px; border-radius: 50%;
                    background: var(--ws-text-muted, #5a6478); display: inline-block;
                }
                .lc-dot--ok { background: var(--ws-success, #4ECDC4); box-shadow: 0 0 6px var(--ws-success); }
                .lc-dot--connecting { background: var(--ws-warning, #fbbf24); animation: lc-pulse 1s infinite; }
                .lc-dot--error { background: var(--ws-error, #E94560); }
                @keyframes lc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

                .lc-section { margin-bottom: 1.25rem; }
                .lc-label {
                    display: block; font-size: 0.8125rem; font-weight: 600;
                    color: var(--ws-text-secondary, #8892A0); margin-bottom: 0.375rem;
                }
                .lc-input {
                    width: 100%; padding: 0.5rem 0.75rem;
                    background: var(--ws-bg, #1A1A2E); color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    font-family: var(--ws-font-mono, monospace); font-size: 0.8125rem;
                    outline: none; box-sizing: border-box;
                }
                .lc-input:focus { border-color: var(--ws-primary, #4ECDC4); }
                .lc-select {
                    width: 100%; padding: 0.5rem 0.75rem;
                    background: var(--ws-bg, #1A1A2E); color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px); font-size: 0.8125rem;
                    outline: none; box-sizing: border-box;
                }
                .lc-hint { font-size: 0.75rem; color: var(--ws-text-muted, #5a6478); margin-top: 0.25rem; }
                .lc-error {
                    padding: 0.5rem 0.75rem; margin-bottom: 1rem;
                    background: var(--ws-error-bg, rgba(233,69,96,0.08));
                    border: 1px solid var(--ws-error, #E94560);
                    border-radius: var(--ws-radius, 6px);
                    color: var(--ws-error, #E94560); font-size: 0.8125rem;
                }
                .lc-provider-btns { display: flex; gap: 0.5rem; }
                .lc-provider-btn {
                    flex: 1; padding: 0.5rem 0.75rem;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    cursor: pointer; font-size: 0.8125rem; font-weight: 600;
                    font-family: inherit; transition: all 100ms;
                }
                .lc-provider-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text, #F0F0F5); }
                .lc-provider-btn--active {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4); border-color: var(--ws-primary, #4ECDC4);
                }
                .lc-actions { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
                .lc-btn {
                    padding: 0.5rem 1rem; border-radius: var(--ws-radius, 6px);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    background: transparent; color: var(--ws-text-secondary, #8892A0);
                    font-size: 0.8125rem; font-weight: 600; cursor: pointer; font-family: inherit;
                }
                .lc-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text, #F0F0F5); }
                .lc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .lc-btn--primary {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4); border-color: var(--ws-primary, #4ECDC4);
                }
                .lc-btn--primary:hover { background: rgba(78,205,196,0.2); }
                .lc-divider {
                    border: none; border-top: 1px solid var(--ws-border, #2C3E6B);
                    margin: 1.5rem 0;
                }
                .lc-storage-row {
                    display: flex; align-items: center; gap: 0.5rem;
                    margin-bottom: 0.375rem;
                }
                .lc-storage-key {
                    font-size: 0.75rem; font-weight: 600;
                    color: var(--ws-text-muted, #5a6478);
                    font-family: var(--ws-font-mono, monospace);
                    min-width: 100px; flex-shrink: 0;
                }
                .lc-storage-value {
                    flex: 1; padding: 0.25rem 0.5rem;
                    font-size: 0.75rem; font-family: var(--ws-font-mono, monospace);
                    background: var(--ws-bg, #1A1A2E); color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; box-sizing: border-box; cursor: pointer;
                }
                .lc-storage-value:focus { border-color: var(--ws-primary, #4ECDC4); }
                .lc-storage-copy {
                    padding: 0.1875rem 0.5rem; font-size: 0.625rem; font-weight: 600;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    cursor: pointer; font-family: inherit; flex-shrink: 0;
                }
                .lc-storage-copy:hover { color: var(--ws-text, #F0F0F5); background: var(--ws-surface-hover, #253254); }
            `;
        }
    }

    customElements.define('llm-connection', LlmConnection);
})();
