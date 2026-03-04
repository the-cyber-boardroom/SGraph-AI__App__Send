/* =============================================================================
   SGraph Workspace — LLM Stats Panel
   v0.1.0 — Request stats, stream toggle, save prompt

   Sits to the right of the chat zone. Displays:
     - Stream/Non-stream toggle (persisted in localStorage)
     - Last request stats: model, tokens in/out, duration, cost
     - Save Prompt button (saves system + user prompt to vault)
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    const STREAM_KEY = 'sgraph-workspace-llm-streaming';

    class LlmStats extends HTMLElement {

        constructor() {
            super();
            this._streaming  = this._loadStreaming();
            this._lastStats  = null;   // { model, provider, promptTokens, completionTokens, totalTokens, durationMs, streaming, cost }
            this._inProgress = false;
            this._startTime  = null;
            this._unsubs     = [];
        }

        _loadStreaming() {
            try {
                const v = localStorage.getItem(STREAM_KEY);
                return v !== null ? v === 'true' : true; // default: streaming on
            } catch (_) { return true; }
        }

        _saveStreaming() {
            try { localStorage.setItem(STREAM_KEY, String(this._streaming)); } catch (_) { /* ignore */ }
        }

        connectedCallback() {
            this._render();

            const onStart = (data) => {
                this._inProgress = true;
                this._startTime  = performance.now();
                this._lastStats  = { model: data.model, provider: data.provider, streaming: this._streaming };
                this._render();
            };

            const onComplete = (data) => {
                this._inProgress = false;
                const durationMs = this._startTime ? Math.round(performance.now() - this._startTime) : null;
                this._lastStats = {
                    ...this._lastStats,
                    ...data,
                    durationMs,
                };
                this._render();
            };

            const onError = (data) => {
                this._inProgress = false;
                const durationMs = this._startTime ? Math.round(performance.now() - this._startTime) : null;
                this._lastStats = {
                    ...this._lastStats,
                    error: data.error,
                    durationMs,
                };
                this._render();
            };

            window.sgraphWorkspace.events.on('llm-request-start', onStart);
            window.sgraphWorkspace.events.on('llm-request-complete', onComplete);
            window.sgraphWorkspace.events.on('llm-request-error', onError);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('llm-request-start', onStart),
                () => window.sgraphWorkspace.events.off('llm-request-complete', onComplete),
                () => window.sgraphWorkspace.events.off('llm-request-error', onError),
            );
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Public API ----------------------------------------------------------

        isStreaming() { return this._streaming; }

        // --- Save Prompt to Vault ------------------------------------------------

        async _savePrompt() {
            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel || vaultPanel.getState() !== 'open') {
                window.sgraphWorkspace.messages.error('Vault is not open — cannot save prompt');
                return;
            }

            const chat = document.querySelector('llm-chat');
            if (!chat) return;

            const systemPrompt = chat._systemPrompt || '';
            const userPrompt   = chat.querySelector('#lc-prompt')?.value || '';

            if (!systemPrompt && !userPrompt) {
                window.sgraphWorkspace.messages.warning('No prompt to save');
                return;
            }

            // Build file content
            let content = '';
            if (systemPrompt) {
                content += '[system]\n' + systemPrompt + '\n\n';
            }
            if (userPrompt) {
                content += '[user]\n' + userPrompt;
            }

            // Generate filename
            const nameInput = this.querySelector('#ls-prompt-name');
            const customName = nameInput ? nameInput.value.trim() : '';
            let filename;
            if (customName) {
                filename = customName.endsWith('.txt') ? customName : customName + '.txt';
            } else {
                // Auto-name from first words of user prompt
                const slug = (userPrompt || 'prompt').split(/\s+/).slice(0, 4).join('-')
                    .toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'prompt';
                filename = slug + '.txt';
            }

            // Ensure we're in /prompts/ folder — navigate there or save in current path
            const currentPath = vaultPanel.getCurrentPath ? vaultPanel.getCurrentPath() : '/';
            const savePath = currentPath === '/prompts' || currentPath.startsWith('/prompts/') ? currentPath : '/prompts';

            try {
                const bytes = new TextEncoder().encode(content);

                // Try to ensure /prompts folder exists
                const vault = vaultPanel.getVault();
                if (vault && savePath === '/prompts') {
                    try { vault.createFolder('/', 'prompts'); } catch (_) { /* already exists */ }
                }

                await vault.addFile(savePath, filename, bytes);
                window.sgraphWorkspace.messages.success(`Prompt saved as "${filename}" in ${savePath}`);
                if (nameInput) nameInput.value = '';

                // Refresh vault panel
                if (typeof vaultPanel._refreshVault === 'function') {
                    vaultPanel._render();
                }
            } catch (e) {
                console.error('[llm-stats] Save prompt failed:', e);
                window.sgraphWorkspace.messages.error('Save prompt failed: ' + e.message);
            }
        }

        // --- Render ---------------------------------------------------------------

        _render() {
            const s = this._lastStats;

            const formatDuration = (ms) => {
                if (ms == null) return '—';
                if (ms < 1000) return ms + 'ms';
                return (ms / 1000).toFixed(1) + 's';
            };

            const formatTokens = (n) => {
                if (n == null) return '—';
                if (n > 1000) return (n / 1000).toFixed(1) + 'k';
                return String(n);
            };

            let statsHtml = '';

            if (this._inProgress) {
                statsHtml = `
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Status</span>
                        <span class="ls-stat-value ls-stat-value--active">In progress...</span>
                    </div>
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Model</span>
                        <span class="ls-stat-value ls-stat-value--model">${esc(s?.model || '—')}</span>
                    </div>`;
            } else if (s) {
                const hasTokens = s.promptTokens != null || s.completionTokens != null;
                statsHtml = `
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Model</span>
                        <span class="ls-stat-value ls-stat-value--model">${esc(s.model || '—')}</span>
                    </div>
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Duration</span>
                        <span class="ls-stat-value">${formatDuration(s.durationMs)}</span>
                    </div>
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Mode</span>
                        <span class="ls-stat-value">${s.streaming ? 'Streamed' : 'Non-streamed'}</span>
                    </div>
                    ${hasTokens ? `
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Tokens In</span>
                        <span class="ls-stat-value">${formatTokens(s.promptTokens)}</span>
                    </div>
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Tokens Out</span>
                        <span class="ls-stat-value">${formatTokens(s.completionTokens)}</span>
                    </div>
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Total</span>
                        <span class="ls-stat-value">${formatTokens(s.totalTokens)}</span>
                    </div>` : `
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Length</span>
                        <span class="ls-stat-value">${s.length != null ? s.length + ' chars' : '—'}</span>
                    </div>`}
                    ${s.error ? `
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">Error</span>
                        <span class="ls-stat-value ls-stat-value--error">${esc(s.error.slice(0, 80))}</span>
                    </div>` : ''}
                    ${s.nativeId ? `
                    <div class="ls-stat-row">
                        <span class="ls-stat-label">ID</span>
                        <span class="ls-stat-value ls-stat-value--mono">${esc(s.nativeId)}</span>
                    </div>` : ''}`;
            } else {
                statsHtml = `<div class="ls-empty">No requests yet</div>`;
            }

            this.innerHTML = `<style>${LlmStats.styles}</style>
            <div class="ls-panel">
                <div class="ls-section">
                    <div class="ls-section-title">Request Mode</div>
                    <label class="ls-toggle-label">
                        <input type="checkbox" class="ls-toggle-cb" id="ls-stream-toggle"
                               ${this._streaming ? 'checked' : ''}>
                        <span class="ls-toggle-text">${this._streaming ? 'Streaming' : 'Non-streaming'}</span>
                    </label>
                    <div class="ls-hint">${this._streaming
                        ? 'Response streams token-by-token'
                        : 'Waits for full response — returns token stats'}</div>
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Last Request</div>
                    ${statsHtml}
                </div>

                <div class="ls-section">
                    <div class="ls-section-title">Save Prompt</div>
                    <input type="text" class="ls-prompt-name" id="ls-prompt-name"
                           placeholder="filename..." title="Leave empty for auto-name">
                    <button class="ls-save-btn" id="ls-save-prompt">Save to /prompts</button>
                    <div class="ls-hint">Saves system + user prompt to vault</div>
                </div>
            </div>`;

            this._bind();
        }

        _bind() {
            const toggle = this.querySelector('#ls-stream-toggle');
            if (toggle) {
                toggle.addEventListener('change', () => {
                    this._streaming = toggle.checked;
                    this._saveStreaming();
                    this._render();
                    window.sgraphWorkspace.events.emit('llm-streaming-changed', { streaming: this._streaming });
                });
            }

            const saveBtn = this.querySelector('#ls-save-prompt');
            if (saveBtn) saveBtn.addEventListener('click', () => this._savePrompt());
        }

        // --- Styles ---------------------------------------------------------------

        static get styles() {
            return `
                .ls-panel {
                    display: flex; flex-direction: column; gap: 0.75rem;
                    padding: 0.5rem 0.625rem;
                    font-size: 0.75rem;
                }
                .ls-section {
                    display: flex; flex-direction: column; gap: 0.25rem;
                }
                .ls-section-title {
                    font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
                    letter-spacing: 0.04em; color: var(--ws-text-muted, #5a6478);
                    padding-bottom: 0.125rem;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                }
                .ls-toggle-label {
                    display: flex; align-items: center; gap: 0.375rem;
                    cursor: pointer; padding: 0.125rem 0;
                }
                .ls-toggle-cb {
                    accent-color: var(--ws-primary, #4ECDC4);
                    width: 14px; height: 14px; cursor: pointer;
                }
                .ls-toggle-text {
                    font-size: 0.75rem; font-weight: 600;
                    color: var(--ws-text, #F0F0F5);
                }
                .ls-hint {
                    font-size: 0.625rem; color: var(--ws-text-muted, #5a6478);
                    line-height: 1.3;
                }
                .ls-stat-row {
                    display: flex; justify-content: space-between;
                    align-items: baseline; padding: 0.125rem 0;
                }
                .ls-stat-label {
                    font-size: 0.6875rem; color: var(--ws-text-muted, #5a6478);
                }
                .ls-stat-value {
                    font-size: 0.6875rem; font-weight: 600;
                    color: var(--ws-text, #F0F0F5);
                    font-family: var(--ws-font-mono, monospace);
                    text-align: right; max-width: 60%;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .ls-stat-value--active {
                    color: var(--ws-primary, #4ECDC4);
                    animation: ls-pulse 1s ease-in-out infinite;
                }
                @keyframes ls-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
                .ls-stat-value--model {
                    font-size: 0.625rem; max-width: 70%;
                }
                .ls-stat-value--error { color: var(--ws-error, #E94560); }
                .ls-stat-value--mono { font-size: 0.5625rem; }
                .ls-empty {
                    font-size: 0.6875rem; color: var(--ws-text-muted, #5a6478);
                    padding: 0.375rem 0; text-align: center;
                }
                .ls-prompt-name {
                    width: 100%; padding: 0.25rem 0.375rem; font-size: 0.6875rem;
                    font-family: var(--ws-font-mono, monospace);
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; box-sizing: border-box;
                }
                .ls-prompt-name:focus { border-color: var(--ws-primary, #4ECDC4); }
                .ls-prompt-name::placeholder { color: var(--ws-text-muted, #5a6478); }
                .ls-save-btn {
                    padding: 0.25rem 0.5rem; font-size: 0.6875rem; font-weight: 600;
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border-radius: var(--ws-radius, 6px); cursor: pointer;
                    font-family: inherit; width: 100%;
                }
                .ls-save-btn:hover { background: rgba(78,205,196,0.2); }
            `;
        }
    }

    customElements.define('llm-stats', LlmStats);
})();
