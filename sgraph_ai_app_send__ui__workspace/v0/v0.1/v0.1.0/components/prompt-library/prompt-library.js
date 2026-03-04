/* =============================================================================
   SGraph Workspace — Prompt Library
   v0.1.1 — Built-in prompts + vault-backed prompt files

   Loads transformation prompts from a 'prompts/' folder in the vault.
   Prompt files are .txt or .md files whose content IS the prompt text.
   The filename (minus extension) becomes the display name.

   Falls back to 5 built-in prompts when vault is not open or prompts
   folder does not exist.
   ============================================================================= */

(function() {
    'use strict';

    const PROMPTS_FOLDER = '/prompts';

    // Built-in prompts (always available, no vault dependency)
    const BUILTIN_PROMPTS = [
        { id: 'improve-clarity',  name: 'Improve Clarity',      prompt: 'Rewrite the following document for clarity. Preserve all facts and key points. Do not add new information. Output the full revised document.\n\n---\n\n{{document}}', builtin: true },
        { id: 'exec-summary',     name: 'Executive Summary',    prompt: 'Create a concise executive summary (3-5 paragraphs) of the following document. Focus on key findings, decisions, and action items.\n\n---\n\n{{document}}', builtin: true },
        { id: 'extract-actions',  name: 'Extract Action Items',  prompt: 'Extract all action items, decisions, and next steps from the following document. Format as a bulleted list with owners if mentioned.\n\n---\n\n{{document}}', builtin: true },
        { id: 'simplify',         name: 'Simplify Language',     prompt: 'Rewrite the following document using simpler language. Target a general audience. Preserve all information but remove jargon and complex sentence structures.\n\n---\n\n{{document}}', builtin: true },
        { id: 'translate-md',     name: 'Convert to Markdown',   prompt: 'Convert the following document to well-structured Markdown. Use appropriate headers, lists, code blocks, and emphasis. Preserve all content.\n\n---\n\n{{document}}', builtin: true },
    ];

    const PROMPT_EXTS = ['txt', 'md'];

    class PromptLibrary extends HTMLElement {
        constructor() {
            super();
            this._builtinPrompts = [...BUILTIN_PROMPTS];
            this._vaultPrompts   = [];
            this._prompts        = [...BUILTIN_PROMPTS];
            this._loading        = false;
            this._unsubs         = [];
        }

        getPrompts()        { return [...this._prompts]; }
        getPrompt(id)       { return this._prompts.find(p => p.id === id); }
        getBuiltinPrompts() { return [...BUILTIN_PROMPTS]; }
        getVaultPrompts()   { return [...this._vaultPrompts]; }
        isLoading()         { return this._loading; }

        connectedCallback() {
            // Listen for vault open/lock events to load/clear vault prompts
            const onVaultOpened = () => this._loadVaultPrompts();
            const onVaultLocked = () => {
                this._vaultPrompts = [];
                this._mergePrompts();
            };

            window.sgraphWorkspace.events.on('vault-opened', onVaultOpened);
            window.sgraphWorkspace.events.on('vault-locked', onVaultLocked);
            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('vault-opened', onVaultOpened),
                () => window.sgraphWorkspace.events.off('vault-locked', onVaultLocked),
            );

            window.sgraphWorkspace.events.emit('prompt-library-ready', {
                count: this._prompts.length
            });

            // If vault is already open, load prompts now
            const vaultPanel = document.querySelector('vault-panel');
            if (vaultPanel && vaultPanel.getState() === 'open') {
                this._loadVaultPrompts();
            }
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        /** Scan the vault's /prompts folder for .txt and .md files */
        async _loadVaultPrompts() {
            const vaultPanel = document.querySelector('vault-panel');
            if (!vaultPanel || vaultPanel.getState() !== 'open') return;

            const vault = vaultPanel.getVault();
            if (!vault) return;

            this._loading = true;

            try {
                const items = vault.listFolder(PROMPTS_FOLDER);
                if (!items || items.length === 0) {
                    this._vaultPrompts = [];
                    this._mergePrompts();
                    return;
                }

                const promptFiles = items.filter(item => {
                    if (item.type === 'folder') return false;
                    const ext = (item.name || '').split('.').pop().toLowerCase();
                    return PROMPT_EXTS.includes(ext);
                });

                const loaded = [];
                for (const file of promptFiles) {
                    try {
                        const bytes = await vault.getFile(PROMPTS_FOLDER, file.name);
                        const text  = new TextDecoder().decode(bytes);
                        const name  = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
                        loaded.push({
                            id:      'vault-' + file.name,
                            name:    name,
                            prompt:  text,
                            builtin: false,
                            vaultFile: file.name,
                        });
                    } catch (e) {
                        console.warn('[prompt-library] Failed to load prompt file:', file.name, e.message);
                    }
                }

                this._vaultPrompts = loaded;
                this._mergePrompts();

                if (loaded.length > 0) {
                    window.sgraphWorkspace.messages.info(`Loaded ${loaded.length} prompt(s) from vault`);
                }
            } catch (e) {
                // Prompts folder may not exist — that's fine
                console.log('[prompt-library] No prompts folder in vault:', e.message);
                this._vaultPrompts = [];
                this._mergePrompts();
            } finally {
                this._loading = false;
            }
        }

        /** Merge built-in and vault prompts, emit update event */
        _mergePrompts() {
            this._prompts = [...this._vaultPrompts, ...this._builtinPrompts];
            window.sgraphWorkspace.events.emit('prompt-library-updated', {
                total:   this._prompts.length,
                vault:   this._vaultPrompts.length,
                builtin: this._builtinPrompts.length,
            });
        }
    }

    customElements.define('prompt-library', PromptLibrary);
})();
