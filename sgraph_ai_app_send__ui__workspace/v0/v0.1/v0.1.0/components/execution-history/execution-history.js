/* =============================================================================
   SGraph Workspace — Execution History
   v0.1.0 — Vault-based LLM execution history storage

   Saves every LLM interaction as a JSON record in the vault's /executions/
   folder. Each record includes the prompt, response, model, tokens, timing,
   and which artifacts were attached.

   Usage:
     await window.sgraphWorkspace.execHistory.save({ ... });
     const entries = await window.sgraphWorkspace.execHistory.list();
     const entry   = await window.sgraphWorkspace.execHistory.load(filename);
   ============================================================================= */

(function() {
    'use strict';

    const FOLDER = '/executions';

    function getVault() {
        const vaultPanel = document.querySelector('vault-panel');
        if (!vaultPanel) return null;
        return vaultPanel.getVault ? vaultPanel.getVault() : null;
    }

    function shortId() {
        return Math.random().toString(16).slice(2, 6);
    }

    function timestampStr() {
        const d = new Date();
        const pad = (n, len) => String(n).padStart(len || 2, '0');
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    /**
     * Save an execution record to the vault.
     *
     * @param {Object} entry
     * @param {string} entry.prompt       - User prompt text
     * @param {string} entry.systemPrompt - System prompt used
     * @param {string} entry.response     - LLM response text
     * @param {string} entry.model        - Model ID
     * @param {string} entry.provider     - Provider name
     * @param {Object} entry.tokens       - { prompt, completion, total }
     * @param {number} entry.latencyMs    - Request latency in ms
     * @param {Object} entry.attachments  - { source: bool, script: bool, result: bool }
     * @param {string} entry.responseType - 'html'|'js'|'json'|'text'
     */
    async function save(entry) {
        const vault = getVault();
        if (!vault) {
            console.warn('[exec-history] No vault available — skipping save');
            return null;
        }

        const ts   = timestampStr();
        const id   = `${ts}-${shortId()}`;
        const filename = `${id}.json`;

        const record = {
            id:           id,
            timestamp:    new Date().toISOString(),
            model:        entry.model        || null,
            provider:     entry.provider      || null,
            prompt:       entry.prompt        || '',
            systemPrompt: entry.systemPrompt  || '',
            attachments:  entry.attachments   || {},
            response:     entry.response      || '',
            tokens:       entry.tokens        || {},
            latencyMs:    entry.latencyMs     || 0,
            responseType: entry.responseType  || 'text',
        };

        try {
            // Ensure /executions folder exists
            try { vault.createFolder(FOLDER); } catch (_) { /* may already exist */ }

            const data = new TextEncoder().encode(JSON.stringify(record, null, 2));
            await vault.writeFile(FOLDER, filename, data);
            return record;
        } catch (e) {
            console.error('[exec-history] Failed to save:', e);
            return null;
        }
    }

    /**
     * List all execution records in the vault.
     * @returns {Promise<Array<{name: string, type: string}>>}
     */
    async function list() {
        const vault = getVault();
        if (!vault) return [];

        try {
            const items = vault.listFolder(FOLDER) || [];
            return items
                .filter(i => i.type !== 'folder' && i.name.endsWith('.json'))
                .sort((a, b) => b.name.localeCompare(a.name)); // newest first
        } catch (_) {
            return [];
        }
    }

    /**
     * Load a specific execution record.
     * @param {string} filename - The .json filename
     * @returns {Promise<Object|null>}
     */
    async function load(filename) {
        const vault = getVault();
        if (!vault) return null;

        try {
            const data = await vault.getFile(FOLDER, filename);
            const text = new TextDecoder().decode(new Uint8Array(data));
            return JSON.parse(text);
        } catch (e) {
            console.error('[exec-history] Failed to load:', e);
            return null;
        }
    }

    // Register on global namespace
    window.sgraphWorkspace = window.sgraphWorkspace || {};
    window.sgraphWorkspace.execHistory = { save, list, load };

})();
