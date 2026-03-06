/* =============================================================================
   SGraph Workspace — Bundle Manager
   v0.1.1 — Execution Bundle state capture, save, load, and tree management

   Invisible orchestrator (like llm-orchestrator). Captures complete workspace
   state as JSON bundles, stores them in the vault's /.bundles/ folder, and
   restores workspace state from saved bundles.

   Listens:
     bundle-save-requested  -> capture state and save to vault
     bundle-load-requested  -> load bundle and restore workspace state
     llm-request-complete   -> auto-save bundle after LLM response

   Emits:
     bundle-saved           -> { bundle } after successful save
     bundle-loaded          -> { bundle } after successful restore
     bundle-list-changed    -> after tree.json is updated
   ============================================================================= */

(function() {
    'use strict';

    const BUNDLE_FOLDER = '/.bundles';

    // Data file extensions (mirrors DocumentViewer.DATA_EXTS for file-origin tracking)
    const DocumentViewer_DATA_EXTS = ['json', 'csv', 'xml', 'yaml', 'yml', 'tsv'];

    function shortId() {
        return Math.random().toString(16).slice(2, 6);
    }

    function timestampStr() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    class BundleManager extends HTMLElement {

        constructor() {
            super();
            this._activeBundle = null;   // currently loaded bundle ID (for parent_id tracking)
            this._unsubs       = [];
            this._autoSave     = false;  // auto-save after LLM responses (off by default)

            // Track vault file origins for vault:// references
            this._sourceRef = null;  // { folderPath, name } from last file-selected into source
            this._dataRef   = null;  // { folderPath, name } from last file-selected into data
            this._scriptRef = null;  // { folderPath, name } from last file-selected into script
        }

        connectedCallback() {
            const onSave   = (data) => this._handleSave(data);
            const onLoad   = (data) => this._handleLoad(data);
            const onLLMComplete = (data) => this._handleLLMComplete(data);
            const onFileSelected = (data) => this._trackFileOrigin(data);

            window.sgraphWorkspace.events.on('bundle-save-requested', onSave);
            window.sgraphWorkspace.events.on('bundle-load-requested', onLoad);
            window.sgraphWorkspace.events.on('llm-request-complete', onLLMComplete);
            window.sgraphWorkspace.events.on('file-selected', onFileSelected);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('bundle-save-requested', onSave),
                () => window.sgraphWorkspace.events.off('bundle-load-requested', onLoad),
                () => window.sgraphWorkspace.events.off('llm-request-complete', onLLMComplete),
                () => window.sgraphWorkspace.events.off('file-selected', onFileSelected),
            );
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Public API --------------------------------------------------------

        getActiveBundle() { return this._activeBundle; }

        // --- State Capture -----------------------------------------------------

        captureState(llmResponseData) {
            const id = `bundle-${timestampStr()}-${shortId()}`;

            // LLM connection state
            const conn = document.querySelector('llm-connection');
            const model    = conn && conn.getSelectedModel ? conn.getSelectedModel() : null;
            const provider = conn && conn.getProvider      ? conn.getProvider()      : null;

            // Include flags from prompt input checkboxes
            const incSource  = document.querySelector('#lpi-inc-source')?.checked  ?? true;
            const incData    = document.querySelector('#lpi-inc-data')?.checked    ?? false;
            const incScript  = document.querySelector('#lpi-inc-script')?.checked  ?? false;
            const incResult  = document.querySelector('#lpi-inc-result')?.checked  ?? false;
            const incConsole = document.querySelector('#lpi-inc-console')?.checked ?? false;
            const genJS      = document.querySelector('#lpi-gen-js')?.checked      ?? false;

            // Streaming preference
            let streaming = true;
            try {
                const v = localStorage.getItem('sgraph-workspace-llm-streaming');
                streaming = v !== null ? v === 'true' : true;
            } catch (_) {}

            // Source content
            const sourceViewer = document.querySelector('document-viewer[data-role="source"]');
            const sourceText   = sourceViewer ? sourceViewer.getTextContent() : null;

            // Data content
            const dataViewer = document.querySelector('document-viewer[data-role="data"]');
            const dataText   = dataViewer ? dataViewer.getTextContent() : null;

            // Script content
            const scriptEditor = document.querySelector('script-editor');
            const scriptText   = scriptEditor ? scriptEditor.getScript() : null;
            const scriptFile   = scriptEditor ? scriptEditor.getFilename() : 'transform.js';

            // Result content
            const resultViewer = document.querySelector('document-viewer[data-role="transform"]');
            const resultText   = resultViewer ? resultViewer.getTextContent() : null;

            // Console output
            const consoleLogs = scriptEditor ? scriptEditor._consoleLogs : [];
            const consoleText = (consoleLogs || []).map(log => {
                const prefix = log.level === 'error' ? '[ERROR] ' : log.level === 'warn' ? '[WARN] ' : '';
                return prefix + log.args;
            }).join('\n');

            // Prompts
            const sysPromptEl = document.querySelector('llm-system-prompt');
            const systemPrompt = sysPromptEl ? sysPromptEl.getSystemPrompt() : '';

            const promptInput = document.querySelector('llm-prompt-input');
            const userPrompt  = promptInput ? promptInput.getPromptText() : '';

            // Screenshots (from prompt input's pasted images)
            const screenshots = [];
            if (promptInput && promptInput._pastedImages) {
                for (const img of promptInput._pastedImages.slice(0, 3)) {
                    screenshots.push({
                        type: img.type || 'image/png',
                        data: img.dataUrl,
                    });
                }
            }

            // LLM output
            const llmOutput = document.querySelector('llm-output');
            const responseText = llmOutput ? llmOutput.getText() : '';

            // Build bundle
            const bundle = {
                id:        id,
                timestamp: new Date().toISOString(),
                parent_id: this._activeBundle || null,

                config: {
                    model:     model,
                    provider:  provider,
                    streaming: streaming,
                    gen_js_mode: genJS,
                    include_flags: {
                        src:     incSource,
                        data:    incData,
                        script:  incScript,
                        result:  incResult,
                        console: incConsole,
                    },
                },

                context: {
                    source:      sourceText ? { ref: this._buildVaultRef(this._sourceRef), inline: sourceText } : null,
                    data:        dataText   ? { ref: this._buildVaultRef(this._dataRef),   inline: dataText }   : null,
                    script:      scriptText ? { ref: this._buildVaultRef(this._scriptRef), inline: scriptText, filename: scriptFile } : null,
                    result:      resultText ? { inline: resultText } : null,
                    console:     consoleText || null,
                    screenshots: screenshots,
                },

                prompts: {
                    system: systemPrompt || '',
                    user:   userPrompt   || '',
                },

                response: null,
            };

            // If we have LLM response data (from llm-request-complete event)
            if (llmResponseData) {
                bundle.response = {
                    text:          responseText || '',
                    tokens: {
                        prompt:     llmResponseData.promptTokens     || null,
                        completion: llmResponseData.completionTokens || null,
                        total:      llmResponseData.totalTokens      || null,
                    },
                    cost:          llmResponseData.cost          || null,
                    duration_ms:   llmResponseData.latencyMs     || null,
                    finish_reason: llmResponseData.finishReason  || null,
                };
            }

            return bundle;
        }

        // --- Save Bundle -------------------------------------------------------

        async saveBundle(bundle) {
            const vault = this._getVault();
            if (!vault) {
                window.sgraphWorkspace.messages.error('No vault open — cannot save bundle');
                return null;
            }

            try {
                // Ensure .bundles folder exists
                try { await vault.createFolder(BUNDLE_FOLDER); } catch (_) { /* already exists */ }

                const filename = `${bundle.id}.json`;
                const data = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
                await vault.addFile(BUNDLE_FOLDER, filename, data);

                // Update tree.json
                await this._updateTreeIndex(vault, bundle);

                // Track as active bundle
                this._activeBundle = bundle.id;

                window.sgraphWorkspace.messages.success(`Bundle saved: ${bundle.id}`);
                window.sgraphWorkspace.events.emit('bundle-saved', { bundle });
                window.sgraphWorkspace.events.emit('bundle-list-changed');

                return bundle;
            } catch (e) {
                console.error('[bundle-manager] Save failed:', e);
                window.sgraphWorkspace.messages.error('Bundle save failed: ' + e.message);
                return null;
            }
        }

        // --- Load Bundle -------------------------------------------------------

        async loadBundle(bundleId) {
            const vault = this._getVault();
            if (!vault) {
                window.sgraphWorkspace.messages.error('No vault open — cannot load bundle');
                return null;
            }

            try {
                window.sgraphWorkspace.events.emit('activity-start', { label: 'Loading bundle...' });

                const filename = `${bundleId}.json`;
                const raw = await vault.getFile(BUNDLE_FOLDER, filename);
                const text = new TextDecoder().decode(new Uint8Array(raw));
                const bundle = JSON.parse(text);

                // Restore workspace state
                await this._restoreState(bundle);

                // Track as active bundle (for forking)
                this._activeBundle = bundle.id;

                window.sgraphWorkspace.messages.success(`Bundle loaded: ${bundle.id}`);
                window.sgraphWorkspace.events.emit('bundle-loaded', { bundle });
                window.sgraphWorkspace.events.emit('activity-end');

                return bundle;
            } catch (e) {
                console.error('[bundle-manager] Load failed:', e);
                window.sgraphWorkspace.messages.error('Bundle load failed: ' + e.message);
                window.sgraphWorkspace.events.emit('activity-end');
                return null;
            }
        }

        // --- List Bundles ------------------------------------------------------

        async listBundles() {
            const vault = this._getVault();
            if (!vault) return {};

            try {
                const raw = await vault.getFile(BUNDLE_FOLDER, 'tree.json');
                const text = new TextDecoder().decode(new Uint8Array(raw));
                return JSON.parse(text);
            } catch (_) {
                return { bundles: {} };
            }
        }

        // --- Restore State -----------------------------------------------------

        async _restoreState(bundle) {
            const ctx = bundle.context || {};
            const prompts = bundle.prompts || {};
            const config  = bundle.config  || {};

            // Restore source panel
            if (ctx.source && ctx.source.inline) {
                const sv = document.querySelector('document-viewer[data-role="source"]');
                if (sv) sv.loadText(ctx.source.inline, 'source.html');
            }

            // Restore data panel
            if (ctx.data && ctx.data.inline) {
                const dv = document.querySelector('document-viewer[data-role="data"]');
                if (dv) dv.loadText(ctx.data.inline, 'data.json');
            }

            // Restore script
            if (ctx.script && ctx.script.inline) {
                const se = document.querySelector('script-editor');
                if (se) se.loadScript(ctx.script.inline, ctx.script.filename || 'transform.js');
            }

            // Restore result panel
            if (ctx.result && ctx.result.inline) {
                const rv = document.querySelector('document-viewer[data-role="transform"]');
                if (rv) rv.loadText(ctx.result.inline, 'result.html');
            }

            // Restore system prompt
            if (prompts.system !== undefined) {
                const sp = document.querySelector('llm-system-prompt');
                if (sp) sp.setPrompt(prompts.system);
            }

            // Restore user prompt text
            if (prompts.user) {
                const pi = document.querySelector('llm-prompt-input');
                const ta = pi ? pi.querySelector('.lpi-textarea') : null;
                if (ta) ta.value = prompts.user;
            }

            // Restore include flags
            if (config.include_flags) {
                const flags = config.include_flags;
                this._setCheckbox('#lpi-inc-source',  flags.src);
                this._setCheckbox('#lpi-inc-data',    flags.data);
                this._setCheckbox('#lpi-inc-script',  flags.script);
                this._setCheckbox('#lpi-inc-result',  flags.result);
                this._setCheckbox('#lpi-inc-console', flags.console);
            }
            if (config.gen_js_mode !== undefined) {
                this._setCheckbox('#lpi-gen-js', config.gen_js_mode);
            }

            // Restore screenshots into prompt input's pasted images
            if (ctx.screenshots && ctx.screenshots.length > 0) {
                const pi = document.querySelector('llm-prompt-input');
                if (pi) {
                    pi._pastedImages = ctx.screenshots.map(s => ({
                        dataUrl: s.data,
                        type:    s.type || 'image/png',
                    }));
                    if (pi._renderImagePreviews) pi._renderImagePreviews();
                }
            }

            // Restore LLM response
            if (bundle.response && bundle.response.text) {
                const lo = document.querySelector('llm-output');
                if (lo) lo.loadText(bundle.response.text);
            }
        }

        _setCheckbox(selector, value) {
            const cb = document.querySelector(selector);
            if (cb && cb.type === 'checkbox') cb.checked = !!value;
        }

        // --- Tree Index --------------------------------------------------------

        async _updateTreeIndex(vault, bundle) {
            let tree = { bundles: {} };

            try {
                const raw = await vault.getFile(BUNDLE_FOLDER, 'tree.json');
                const text = new TextDecoder().decode(new Uint8Array(raw));
                tree = JSON.parse(text);
            } catch (_) {
                // tree.json doesn't exist yet
            }

            tree.bundles[bundle.id] = {
                parent_id:      bundle.parent_id || null,
                timestamp:      bundle.timestamp,
                model:          bundle.config?.model || null,
                prompt_preview: (bundle.prompts?.user || '').slice(0, 60),
            };

            const data = new TextEncoder().encode(JSON.stringify(tree, null, 2));
            await vault.addFile(BUNDLE_FOLDER, 'tree.json', data);
        }

        // --- Event Handlers ----------------------------------------------------

        async _handleSave(data) {
            const llmData = (data && data.llmResponse) || null;
            const bundle = this.captureState(llmData);
            await this.saveBundle(bundle);
        }

        async _handleLoad(data) {
            if (!data || !data.bundleId) return;
            await this.loadBundle(data.bundleId);
        }

        async _handleLLMComplete(data) {
            if (!this._autoSave) return;
            const bundle = this.captureState(data);
            await this.saveBundle(bundle);
        }

        // --- Track vault file origins for vault:// references ------------------

        _trackFileOrigin(data) {
            if (!data || !data.name || !data.folderPath) return;
            const name = data.name;
            const ref = { folderPath: data.folderPath, name: name };

            if (name.endsWith('.js')) {
                // JS files go to script editor
                this._scriptRef = ref;
            } else if (DocumentViewer_DATA_EXTS.includes(name.split('.').pop().toLowerCase())) {
                // Data files go to data viewer
                this._dataRef = ref;
            } else {
                // Everything else goes to source viewer
                this._sourceRef = ref;
            }
        }

        _buildVaultRef(ref) {
            if (!ref) return null;
            return `vault://${ref.folderPath}/${ref.name}`.replace(/\/+/g, '/').replace('vault:/', 'vault://');
        }

        // --- Helpers -----------------------------------------------------------

        _getVault() {
            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel) return null;
            return vaultPanel.getVault ? vaultPanel.getVault() : null;
        }
    }

    customElements.define('bundle-manager', BundleManager);
})();
