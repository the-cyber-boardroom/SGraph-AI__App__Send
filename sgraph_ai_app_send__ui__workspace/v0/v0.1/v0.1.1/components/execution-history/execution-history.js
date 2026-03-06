/* =============================================================================
   SGraph Workspace — Execution History Override
   v0.1.1 — Fix: vault.writeFile -> vault.addFile, await createFolder

   v0.1.0 execution-history.js has two bugs:
   1. Calls vault.writeFile() which doesn't exist — the API is vault.addFile()
   2. vault.createFolder() is async but not awaited, causing unhandled
      "Already exists" promise rejections

   This surgical override patches the save() function via the global namespace.
   ============================================================================= */

(function() {
    'use strict';

    const FOLDER = '/executions';

    function getVault() {
        const vaultPanel = document.querySelector('vault-panel');
        if (!vaultPanel) return null;
        return vaultPanel.getVault ? vaultPanel.getVault() : null;
    }

    // Override the save function on the global namespace
    if (window.sgraphWorkspace && window.sgraphWorkspace.execHistory) {
        const originalList = window.sgraphWorkspace.execHistory.list;
        const originalLoad = window.sgraphWorkspace.execHistory.load;

        window.sgraphWorkspace.execHistory.save = async function(entry) {
            const vault = getVault();
            if (!vault) {
                console.warn('[exec-history] No vault available — skipping save');
                return null;
            }

            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const ts = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
            const id = `${ts}-${Math.random().toString(16).slice(2, 6)}`;
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
                // Ensure /executions folder exists (await + catch for "already exists")
                try { await vault.createFolder(FOLDER); } catch (_) { /* already exists */ }

                // Use addFile (correct API), not writeFile
                const data = new TextEncoder().encode(JSON.stringify(record, null, 2));
                await vault.addFile(FOLDER, filename, data);
                return record;
            } catch (e) {
                console.error('[exec-history] Failed to save:', e);
                return null;
            }
        };

        // Preserve list and load from v0.1.0
        window.sgraphWorkspace.execHistory.list = originalList;
        window.sgraphWorkspace.execHistory.load = originalLoad;
    }
})();
