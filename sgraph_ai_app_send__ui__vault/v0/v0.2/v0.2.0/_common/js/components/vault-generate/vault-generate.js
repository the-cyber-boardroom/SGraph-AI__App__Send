/* =================================================================================
   SGraph Vault -- Generate Panel Component
   v0.2.0 -- LLM infographic generation from vault files

   Shadow DOM component. Uses the data-llm-bus pattern from tools.sgraph.ai.
   Receives vault instance via setVault(). Selected file content is sent to
   an LLM via sg-llm-request, rendered by sg-llm-infographic, and can be
   saved back to the vault.

   Emits (composed: true):
     'vault-generate-save' -- { path, content } when user saves generated content
   ================================================================================= */

(function() {
    'use strict';

    const TOOLS_CDN = 'https://dev.tools.sgraph.ai';

    const DEFAULT_MODELS = [
        { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image · ~$0.10/img' },
        { id: 'google/gemini-2.5-flash-image',         label: 'Gemini 2.5 Flash Image · ~$0.08/img' },
        { id: 'openai/gpt-5-image-mini',               label: 'GPT-5 Image Mini · ~$0.03/img'       },
    ];

    const DEFAULT_MODEL = 'google/gemini-3.1-flash-image-preview';

    class VaultGenerate extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._vault      = null;
            this._accessKey   = '';
            this._selectedFile = null;
            this._currentSvg   = null;
            this._connected    = false;
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultGenerate.styles}</style>
                <div class="vg-panel">

                    <!-- API Key bar -->
                    <div class="vg-conn">
                        <label class="vg-conn-label">OpenRouter Key</label>
                        <input type="password" class="vg-conn-input" placeholder="sk-or-v1-..." autocomplete="off" spellcheck="false">
                        <button class="vg-conn-btn">Connect</button>
                        <span class="vg-conn-status"></span>
                    </div>

                    <!-- Main content: bus div with LLM components -->
                    <div class="vg-bus" data-llm-bus>
                        <sg-llm-request></sg-llm-request>

                        <div class="vg-body">
                            <!-- Left: prompt + controls -->
                            <div class="vg-left">
                                <div class="vg-selected-file">
                                    <span class="vg-file-label">No file selected</span>
                                    <span class="vg-file-hint">Click a file in the tree, then generate</span>
                                </div>

                                <div class="vg-model-row">
                                    <label class="vg-label">Model</label>
                                    <select class="vg-model-select">
                                        ${DEFAULT_MODELS.map(m => `<option value="${m.id}"${m.id === DEFAULT_MODEL ? ' selected' : ''}>${m.label}</option>`).join('')}
                                    </select>
                                </div>

                                <div class="vg-prompt-row">
                                    <label class="vg-label">Prompt</label>
                                    <textarea class="vg-prompt" rows="4" placeholder="Describe what to generate from this file...">Create a professional infographic summarising the key points of this document.</textarea>
                                </div>

                                <button class="vg-generate-btn" disabled>Generate</button>

                                <div class="vg-save-row" style="display:none">
                                    <button class="vg-save-btn">Save to Vault</button>
                                    <input type="text" class="vg-save-name" placeholder="output.svg">
                                </div>
                            </div>

                            <!-- Right: infographic render -->
                            <div class="vg-right">
                                <sg-llm-infographic></sg-llm-infographic>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            this._setupListeners();
            this._restoreApiKey();
        }

        // --- Public API ---

        setVault(vault, accessKey) {
            this._vault    = vault;
            this._accessKey = accessKey;
        }

        setSelectedFile(path, fileName) {
            this._selectedFile = { path, fileName };
            const label = this.shadowRoot.querySelector('.vg-file-label');
            const hint  = this.shadowRoot.querySelector('.vg-file-hint');
            if (label) label.textContent = path;
            if (hint)  hint.textContent = fileName;
            this._updateGenerateBtn();
        }

        // --- Private ---

        _restoreApiKey() {
            try {
                const key = localStorage.getItem('sg-vault-openrouter-key');
                if (key) {
                    this.shadowRoot.querySelector('.vg-conn-input').value = key;
                    this._doConnect(key);
                }
            } catch (_) {}
        }

        _setupListeners() {
            const root = this.shadowRoot;

            // Connect
            root.querySelector('.vg-conn-btn').addEventListener('click', () => {
                const key = root.querySelector('.vg-conn-input').value.trim();
                if (key) this._doConnect(key);
            });
            root.querySelector('.vg-conn-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const key = root.querySelector('.vg-conn-input').value.trim();
                    if (key) this._doConnect(key);
                }
            });

            // Generate
            root.querySelector('.vg-generate-btn').addEventListener('click', () => this._onGenerate());

            // Save
            root.querySelector('.vg-save-btn').addEventListener('click', () => this._onSave());

            // Listen for infographic ready on the bus
            const bus = root.querySelector('.vg-bus');
            bus.addEventListener('llm:infographic-ready', (e) => {
                this._currentSvg = e.detail.svg;
                const saveRow = root.querySelector('.vg-save-row');
                if (saveRow) saveRow.style.display = '';
                const nameInput = root.querySelector('.vg-save-name');
                if (nameInput && this._selectedFile) {
                    const base = this._selectedFile.fileName.replace(/\.[^.]+$/, '');
                    nameInput.value = base + '.infographic.svg';
                }
            });
        }

        _doConnect(apiKey) {
            localStorage.setItem('sg-vault-openrouter-key', apiKey);
            this._connected = true;

            const bus = this.shadowRoot.querySelector('.vg-bus');
            bus.dispatchEvent(new CustomEvent('llm:connected', {
                bubbles: true,
                detail: { provider: 'openrouter', apiKey }
            }));

            const status = this.shadowRoot.querySelector('.vg-conn-status');
            if (status) { status.textContent = 'Connected'; status.className = 'vg-conn-status vg-conn-ok'; }
            this._updateGenerateBtn();
        }

        _updateGenerateBtn() {
            const btn = this.shadowRoot.querySelector('.vg-generate-btn');
            if (btn) btn.disabled = !(this._connected && this._selectedFile);
        }

        async _onGenerate() {
            if (!this._vault || !this._selectedFile || !this._connected) return;

            const btn = this.shadowRoot.querySelector('.vg-generate-btn');
            if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

            // Hide save row from previous run
            const saveRow = this.shadowRoot.querySelector('.vg-save-row');
            if (saveRow) saveRow.style.display = 'none';
            this._currentSvg = null;

            try {
                // Read file content from vault
                const { path, fileName } = this._selectedFile;
                const parts    = path.split('/');
                const fName    = parts.pop();
                const folder   = '/' + parts.join('/');
                const data     = await this._vault.getFile(folder === '/' ? '/' : folder, fName);
                const content  = new TextDecoder().decode(data);

                // Get prompt
                const prompt = this.shadowRoot.querySelector('.vg-prompt').value.trim()
                    || 'Create a professional infographic from this document.';

                // Get model
                const model = this.shadowRoot.querySelector('.vg-model-select').value;

                // Get system prompt from infographic component if available
                const inf = this.shadowRoot.querySelector('sg-llm-infographic');
                const sysPrompt = (inf && inf.getSystemPrompt)
                    ? inf.getSystemPrompt()
                    : 'You are a professional infographic designer. Create a high-quality SVG infographic. Output ONLY raw SVG, no markdown fences.';

                // Dispatch on the LLM bus
                const bus = this.shadowRoot.querySelector('.vg-bus');
                bus.dispatchEvent(new CustomEvent('llm:send', {
                    bubbles: true,
                    detail: {
                        model,
                        stream: true,
                        messages: [
                            { role: 'system', content: sysPrompt },
                            { role: 'user',   content: `${prompt}\n\n--- FILE CONTENT ---\n${content}` }
                        ]
                    }
                }));
            } catch (err) {
                window.sgraphVault.messages.error(`Generate failed: ${err.message}`);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }
            }
        }

        async _onSave() {
            if (!this._vault || !this._currentSvg || !this._accessKey) {
                window.sgraphVault.messages.error('Cannot save: vault not writable or no content');
                return;
            }
            const nameInput = this.shadowRoot.querySelector('.vg-save-name');
            const fileName  = nameInput?.value?.trim() || 'infographic.svg';

            try {
                const data = new TextEncoder().encode(this._currentSvg);
                await this._vault.addFile('/', fileName, data);
                window.sgraphVault.messages.success(`Saved "${fileName}" to vault`);
                this.dispatchEvent(new CustomEvent('vault-generate-save', {
                    detail: { path: '/' + fileName, content: this._currentSvg },
                    bubbles: true, composed: true
                }));
            } catch (err) {
                window.sgraphVault.messages.error(`Save failed: ${err.message}`);
            }
        }
    }

    VaultGenerate.styles = `
        :host { display: block; height: 100%; overflow: hidden; }
        .vg-panel { display: flex; flex-direction: column; height: 100%; background: var(--bg-primary, #0a0a18); }

        /* Connection bar */
        .vg-conn {
            display: flex; align-items: center; gap: 8px; padding: 8px 14px;
            background: var(--bg-surface, #111122); border-bottom: 1px solid var(--color-border, #1a1a3a);
            flex-shrink: 0;
        }
        .vg-conn-label { font-size: 11px; font-weight: 600; color: var(--color-text-secondary, #a0aec0); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .vg-conn-input {
            flex: 1; max-width: 280px; background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-border, #333d5a);
            border-radius: 4px; color: var(--color-text, #e2e8f0); padding: 5px 10px; font-size: 13px; outline: none;
        }
        .vg-conn-input:focus { border-color: var(--accent, #4ECDC4); }
        .vg-conn-btn {
            background: var(--accent, #4ECDC4); color: var(--bg-primary, #0d0d1a); border: none; border-radius: 4px;
            padding: 5px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
        }
        .vg-conn-btn:hover { opacity: 0.85; }
        .vg-conn-status { font-size: 12px; }
        .vg-conn-ok { color: var(--accent, #4ECDC4); }

        /* Bus + body */
        .vg-bus { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .vg-body { flex: 1; display: flex; overflow: hidden; }

        /* Left panel: controls */
        .vg-left {
            width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px;
            padding: 14px; overflow-y: auto; border-right: 1px solid var(--color-border, #1a1a3a);
        }
        .vg-selected-file {
            padding: 10px; border-radius: 6px; background: rgba(78, 205, 196, 0.06);
            border: 1px solid rgba(78, 205, 196, 0.15);
        }
        .vg-file-label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text, #e2e8f0); font-family: var(--font-mono, monospace); word-break: break-all; }
        .vg-file-hint { display: block; font-size: 11px; color: var(--color-text-secondary, #a0aec0); margin-top: 2px; }
        .vg-label { font-size: 11px; font-weight: 600; color: var(--color-text-secondary, #a0aec0); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px; }
        .vg-model-select {
            width: 100%; background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-border, #333d5a);
            border-radius: 4px; color: var(--color-text, #e2e8f0); padding: 6px 8px; font-size: 13px;
        }
        .vg-prompt {
            width: 100%; background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-border, #333d5a);
            border-radius: 4px; color: var(--color-text, #e2e8f0); padding: 8px; font-size: 13px;
            font-family: inherit; resize: vertical; box-sizing: border-box;
        }
        .vg-prompt:focus { border-color: var(--accent, #4ECDC4); outline: none; }
        .vg-generate-btn {
            background: var(--accent, #4ECDC4); color: var(--bg-primary, #0d0d1a); border: none; border-radius: 6px;
            padding: 10px 20px; font-size: 14px; font-weight: 700; cursor: pointer; width: 100%;
        }
        .vg-generate-btn:disabled { opacity: 0.4; cursor: default; }
        .vg-generate-btn:hover:not(:disabled) { opacity: 0.85; }

        /* Save row */
        .vg-save-row { display: flex; gap: 8px; align-items: center; }
        .vg-save-btn {
            background: var(--color-primary, #4F8FF7); color: #fff; border: none; border-radius: 4px;
            padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .vg-save-name {
            flex: 1; background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-border, #333d5a);
            border-radius: 4px; color: var(--color-text, #e2e8f0); padding: 6px 8px; font-size: 12px;
            font-family: var(--font-mono, monospace); box-sizing: border-box;
        }

        /* Right panel: infographic */
        .vg-right { flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center; background: var(--bg-primary, #0a0a18); }
        .vg-right sg-llm-infographic { width: 100%; height: 100%; }
    `;

    customElements.define('vault-generate', VaultGenerate);
})();
