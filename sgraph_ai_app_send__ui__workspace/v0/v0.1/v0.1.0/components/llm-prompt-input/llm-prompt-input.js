/* =============================================================================
   SGraph Workspace — LLM Prompt Input
   v0.1.0 — Model selector, include toggles, prompt textarea, send button

   Focused prompt input — the slimmed-down core of the old llm-chat.
   Emits llm-send when user submits, prompt-context-changed on toggle.
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    const STREAM_KEY = 'sgraph-workspace-llm-streaming';

    class LlmPromptInput extends HTMLElement {

        constructor() {
            super();
            this._sending       = false;
            this._connected     = false;
            this._models        = [];
            this._vaultPrompts  = [];
            this._unsubs        = [];
        }

        connectedCallback() {
            this._render();

            const onConnected = () => {
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
            const onFileSelected = (data) => this._onFileSelected(data);
            const onVaultOpened  = () => this._scanVaultPrompts();

            window.sgraphWorkspace.events.on('llm-connected', onConnected);
            window.sgraphWorkspace.events.on('llm-disconnected', onDisconnected);
            window.sgraphWorkspace.events.on('llm-model-changed', onModelChanged);
            window.sgraphWorkspace.events.on('file-selected', onFileSelected);
            window.sgraphWorkspace.events.on('vault-opened', onVaultOpened);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('llm-connected', onConnected),
                () => window.sgraphWorkspace.events.off('llm-disconnected', onDisconnected),
                () => window.sgraphWorkspace.events.off('llm-model-changed', onModelChanged),
                () => window.sgraphWorkspace.events.off('file-selected', onFileSelected),
                () => window.sgraphWorkspace.events.off('vault-opened', onVaultOpened),
            );

            // Check if already connected
            const conn = document.querySelector('llm-connection');
            if (conn && typeof conn.isConnected === 'function' && conn.isConnected()) {
                this._connected = true;
                this._models = conn.getModels();
                this._render();
            }

            // Scan for vault prompts if vault is already open
            const vaultPanel = document.querySelector('vault-panel');
            if (vaultPanel && vaultPanel.getState() === 'open') {
                this._scanVaultPrompts();
            }
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Public API --------------------------------------------------------

        setSending(state) {
            this._sending = state;
            this._updateSendUI();
        }

        getPromptText() {
            const ta = this.querySelector('.lpi-textarea');
            return ta ? ta.value.trim() : '';
        }

        // --- Vault prompt scanning ---------------------------------------------

        _scanVaultPrompts() {
            this._vaultPrompts = [];
            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel) return;
            const vault = vaultPanel.getVault();
            if (!vault) return;

            try {
                const items = vault.listFolder('/prompts') || [];
                this._vaultPrompts = items
                    .filter(i => i.type !== 'folder')
                    .map(i => ({ name: i.name, folderPath: '/prompts' }));
            } catch (_) {}

            this._render();
        }

        async _onFileSelected(data) {
            if (!data.folderPath || !data.folderPath.startsWith('/prompts')) return;
            if (!data.name) return;

            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel) return;
            const vault = vaultPanel.getVault();
            if (!vault) return;

            try {
                const plaintext = await vault.getFile(data.folderPath, data.name);
                const text = new TextDecoder().decode(new Uint8Array(plaintext));

                const systemMatch = text.match(/\[system\]\n([\s\S]*?)(?=\n\[user\]|\n*$)/);
                const userMatch   = text.match(/\[user\]\n([\s\S]*?)$/);

                if (systemMatch) {
                    const sysPrompt = document.querySelector('llm-system-prompt');
                    if (sysPrompt) sysPrompt.setPrompt(systemMatch[1].trim());
                }
                if (userMatch) {
                    const textarea = this.querySelector('.lpi-textarea');
                    if (textarea) textarea.value = userMatch[1].trim();
                } else if (!systemMatch) {
                    const textarea = this.querySelector('.lpi-textarea');
                    if (textarea) textarea.value = text.trim();
                }
                window.sgraphWorkspace.messages.success(`Prompt "${data.name}" loaded`);
            } catch (e) {
                console.error('[llm-prompt-input] Failed to load prompt file:', e);
            }
        }

        // --- Send --------------------------------------------------------------

        _send() {
            if (this._sending) return;

            const textarea = this.querySelector('.lpi-textarea');
            const userPrompt = textarea ? textarea.value.trim() : '';
            if (!userPrompt) return;

            const incSource = this.querySelector('#lpi-inc-source')?.checked ?? true;
            const incScript = this.querySelector('#lpi-inc-script')?.checked ?? false;
            const incData   = this.querySelector('#lpi-inc-data')?.checked ?? false;
            const incResult = this.querySelector('#lpi-inc-result')?.checked ?? false;
            const genJS     = this.querySelector('#lpi-gen-js')?.checked ?? false;

            window.sgraphWorkspace.events.emit('llm-send', {
                userPrompt, incSource, incScript, incData, incResult, genJS,
            });
        }

        _cancel() {
            window.sgraphWorkspace.events.emit('llm-cancel');
        }

        _emitContextChanged() {
            const incSource = this.querySelector('#lpi-inc-source')?.checked ?? true;
            const incScript = this.querySelector('#lpi-inc-script')?.checked ?? false;
            const incData   = this.querySelector('#lpi-inc-data')?.checked ?? false;
            const incResult = this.querySelector('#lpi-inc-result')?.checked ?? false;
            const genJS     = this.querySelector('#lpi-gen-js')?.checked ?? false;

            window.sgraphWorkspace.events.emit('prompt-context-changed', {
                incSource, incScript, incData, incResult, genJS,
            });
        }

        _updateSendUI() {
            const sendBtn   = this.querySelector('.lpi-send');
            const cancelBtn = this.querySelector('.lpi-cancel');
            const textarea  = this.querySelector('.lpi-textarea');

            if (sendBtn)   { sendBtn.disabled = this._sending || !this._connected; sendBtn.textContent = this._sending ? 'Sending...' : 'Send'; }
            if (cancelBtn) cancelBtn.style.display = this._sending ? '' : 'none';
            if (textarea)  textarea.disabled = this._sending;
        }

        _updateModelSelect() {
            const conn = document.querySelector('llm-connection');
            if (!conn) return;
            const select = this.querySelector('.lpi-model');
            if (!select) return;
            const model = conn.getSelectedModel();
            if (model) {
                for (const opt of select.options) {
                    opt.selected = opt.value === model;
                }
            }
        }

        _isStreaming() {
            try {
                const v = localStorage.getItem(STREAM_KEY);
                return v !== null ? v === 'true' : true;
            } catch (_) { return true; }
        }

        // --- Render ------------------------------------------------------------

        _render() {
            const conn = document.querySelector('llm-connection');
            const isUpgraded = conn && typeof conn.getModels === 'function';
            const models = isUpgraded ? conn.getModels() : [];
            const selectedModel = isUpgraded ? conn.getSelectedModel() : null;
            const isConnected = isUpgraded && conn.isConnected();

            this.innerHTML = `<style>${LlmPromptInput.styles}</style>
            <div class="lpi-panel">
                <div class="lpi-top-row">
                    <select class="lpi-model" ${!isConnected ? 'disabled' : ''}>
                        ${!isConnected
                            ? '<option>Not connected</option>'
                            : models.map(m =>
                                `<option value="${esc(m.id)}" ${m.id === selectedModel ? 'selected' : ''}>${esc(m.name)}</option>`
                              ).join('')}
                    </select>
                    ${this._vaultPrompts.length > 0 ? `
                        <select class="lpi-prompts" id="lpi-prompt-select">
                            <option value="">Prompts</option>
                            ${this._vaultPrompts.map(p =>
                                `<option value="${esc(p.name)}">${esc(p.name)}</option>`
                            ).join('')}
                        </select>
                    ` : ''}
                </div>
                <div class="lpi-toggles">
                    <span class="lpi-label">Include:</span>
                    <label class="lpi-toggle"><input type="checkbox" id="lpi-inc-source" checked> Src</label>
                    <label class="lpi-toggle"><input type="checkbox" id="lpi-inc-data"> Data</label>
                    <label class="lpi-toggle"><input type="checkbox" id="lpi-inc-script"> Script</label>
                    <label class="lpi-toggle"><input type="checkbox" id="lpi-inc-result"> Result</label>
                    <span class="lpi-sep">|</span>
                    <label class="lpi-toggle lpi-toggle--accent"><input type="checkbox" id="lpi-gen-js"> Gen JS</label>
                </div>
                <textarea class="lpi-textarea" placeholder="Describe the transformation... (Ctrl+Enter to send)" ${this._sending ? 'disabled' : ''}></textarea>
                <div class="lpi-actions">
                    <button class="lpi-send" ${this._sending || !isConnected ? 'disabled' : ''}>Send</button>
                    <button class="lpi-cancel" style="${this._sending ? '' : 'display:none'}">Cancel</button>
                </div>
            </div>`;

            this._bind();
        }

        _bind() {
            const sendBtn   = this.querySelector('.lpi-send');
            const cancelBtn = this.querySelector('.lpi-cancel');
            const textarea  = this.querySelector('.lpi-textarea');

            if (sendBtn) sendBtn.addEventListener('click', () => this._send());
            if (cancelBtn) cancelBtn.addEventListener('click', () => this._cancel());

            if (textarea) {
                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        this._send();
                    }
                });
            }

            // Checkbox changes emit context-changed
            this.querySelectorAll('.lpi-toggle input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => this._emitContextChanged());
            });

            // Emit initial context state
            this._emitContextChanged();

            // Model selector
            const modelSelect = this.querySelector('.lpi-model');
            if (modelSelect) {
                modelSelect.addEventListener('change', () => {
                    const conn = document.querySelector('llm-connection');
                    if (conn && typeof conn.setSelectedModel === 'function') {
                        conn.setSelectedModel(modelSelect.value);
                    }
                });
            }

            // Prompt selector
            const promptSelect = this.querySelector('#lpi-prompt-select');
            if (promptSelect) {
                promptSelect.addEventListener('change', () => {
                    const name = promptSelect.value;
                    if (!name) return;
                    promptSelect.value = '';
                    this._onFileSelected({ name, folderPath: '/prompts' });
                });
            }
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .lpi-panel {
                    display: flex; flex-direction: column;
                    height: 100%; min-height: 0;
                    padding: 0.375rem 0.5rem; gap: 0.25rem;
                }
                .lpi-top-row {
                    display: flex; gap: 0.375rem; flex-shrink: 0;
                }
                .lpi-model, .lpi-prompts {
                    padding: 0.1875rem 0.375rem; font-size: 0.6875rem;
                    background: var(--ws-surface-raised, #1c2a4a);
                    color: var(--ws-text-secondary, #8892A0);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    outline: none; font-family: inherit;
                }
                .lpi-model { flex: 1; min-width: 0; }
                .lpi-model:disabled { opacity: 0.5; }
                .lpi-prompts { max-width: 120px; }
                .lpi-toggles {
                    display: flex; align-items: center; gap: 0.375rem;
                    flex-shrink: 0; flex-wrap: wrap;
                }
                .lpi-label {
                    font-size: 0.5625rem; font-weight: 600;
                    color: var(--ws-text-muted, #5a6478);
                    text-transform: uppercase; letter-spacing: 0.04em;
                }
                .lpi-toggle {
                    display: flex; align-items: center; gap: 0.1875rem;
                    font-size: 0.625rem; color: var(--ws-text-secondary, #8892A0);
                    cursor: pointer; user-select: none;
                }
                .lpi-toggle input[type="checkbox"] {
                    accent-color: var(--ws-primary, #4ECDC4);
                    margin: 0; cursor: pointer;
                    width: 12px; height: 12px;
                }
                .lpi-toggle--accent { color: var(--ws-primary, #4ECDC4); font-weight: 600; }
                .lpi-sep { color: var(--ws-border, #2C3E6B); font-size: 0.625rem; }
                .lpi-textarea {
                    flex: 1; min-height: 0; resize: none;
                    font-family: var(--ws-font, sans-serif); font-size: 0.8125rem;
                    padding: 0.375rem 0.5rem; line-height: 1.4;
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    outline: none;
                }
                .lpi-textarea:focus { border-color: var(--ws-primary, #4ECDC4); }
                .lpi-textarea:disabled { opacity: 0.5; }
                .lpi-actions {
                    display: flex; gap: 0.25rem; flex-shrink: 0;
                }
                .lpi-send {
                    flex: 1; padding: 0.375rem 0.5rem;
                    border-radius: var(--ws-radius, 6px);
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    font-weight: 600; font-size: 0.75rem;
                    cursor: pointer; font-family: inherit;
                    transition: background 100ms;
                }
                .lpi-send:hover:not(:disabled) { background: rgba(78,205,196,0.2); }
                .lpi-send:disabled { opacity: 0.5; cursor: not-allowed; }
                .lpi-cancel {
                    padding: 0.375rem 0.5rem;
                    border-radius: var(--ws-radius, 6px);
                    background: transparent;
                    color: var(--ws-error, #E94560);
                    border: 1px solid var(--ws-error, #E94560);
                    font-size: 0.6875rem; cursor: pointer; font-family: inherit;
                }
                .lpi-cancel:hover { background: var(--ws-error-bg, rgba(233,69,96,0.08)); }
            `;
        }
    }

    customElements.define('llm-prompt-input', LlmPromptInput);
})();
