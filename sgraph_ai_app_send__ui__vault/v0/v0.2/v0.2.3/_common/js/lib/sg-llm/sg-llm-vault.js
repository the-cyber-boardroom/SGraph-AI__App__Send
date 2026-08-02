/* =================================================================================
   SGLlmVault — resolve a usable LLM client from a vault's .vault/llm/config.json

   The one place that turns "a vault" into "an SGLlm you can call". Used by the vault
   UI's native chat today; the kernel will use the same resolver to service sg.llm.*
   for app frames (which is the point — one key path, one policy path, one audit
   point).

   Reads `.vault/llm/config.json` (inside the permission floor → invisible to app
   code), unseals the credential when the tier is 'owner', and hands back a
   configured SGLlm plus the parsed policy.

   Requires: SGLlmConfig, SGLlm, SGVaultOwnerSecrets.
   ================================================================================= */

(function () {
    'use strict';

    var FOLDER = '/.vault/llm';
    var FILE   = 'config.json';

    // `.vault` is a LAZY sub-tree after open — listFolder returns [] until expanded.
    async function _ensureSubtree(vault) {
        try {
            if (vault.needsLoading && vault.needsLoading('/.vault')) await vault.loadSubTreeOnDemand('/.vault');
        } catch (_) { /* absent */ }
    }

    // Raw config object, or null when the vault has no LLM configuration.
    async function readConfig(vault) {
        if (!vault) return null;
        await _ensureSubtree(vault);
        try {
            var top = vault.listFolder('/.vault') || [];
            if (!top.some(function (e) { return e.name === 'llm' && e.type === 'folder'; })) return null;
            var inner = vault.listFolder(FOLDER) || [];
            if (!inner.some(function (e) { return e.name === FILE; })) return null;
            var bytes = await vault.getFile(FOLDER, FILE);
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (_) { return null; }
    }

    // Resolve the credential per tier.
    //   'shared' → the clear key in the config (any opener can use it)
    //   'owner'  → unseal with the write-key-derived owner secret. A read-only
    //              (ro-token) session has no write key, so this THROWS EREADONLY —
    //              by construction, not by policy check.
    async function resolveKey(vault, policy) {
        var p = SGLlmConfig.parse(policy);
        if (p.keyTier === 'shared') return p.key || null;
        if (!p.keySealed) return null;
        var wk = vault && vault.writeKeyHex;
        if (!wk) throw Object.assign(
            new Error('This vault\'s AI key is owner-sealed — open the vault with its full key to use it'),
            { code: 'EREADONLY' });
        var oKey = await SGVaultOwnerSecrets.deriveKey(wk);
        var rec  = await SGVaultOwnerSecrets.open(oKey, p.keySealed);   // throws on tamper
        return (rec && rec.key) || null;
    }

    // → { ok, client, policy, model, reason }
    //   reason: 'ENOKEY' (not configured) | 'EREADONLY' (owner-sealed, ro session)
    // Never throws for the ordinary "not available here" cases — callers render a
    // state, not an error.
    async function open(vault) {
        var raw = await readConfig(vault);
        if (!raw) return { ok: false, reason: 'ENOKEY', policy: SGLlmConfig.parse({}) };
        var policy = SGLlmConfig.parse(raw);
        var key;
        try {
            key = await resolveKey(vault, policy);
        } catch (e) {
            return { ok: false, reason: e.code || 'EPROTO', policy: policy, message: e.message };
        }
        if (!key) return { ok: false, reason: 'ENOKEY', policy: policy };
        var client = new SGLlm({ apiKey: key, endpoint: policy.endpoint, title: 'SG/Vault chat' });
        return {
            ok    : true,
            client: client,
            policy: policy,
            model : SGLlmConfig.defaultModel(policy) || null
        };
    }

    globalThis.SGLlmVault = {
        FOLDER    : FOLDER,
        FILE      : FILE,
        readConfig: readConfig,
        resolveKey: resolveKey,
        open      : open
    };
})();
