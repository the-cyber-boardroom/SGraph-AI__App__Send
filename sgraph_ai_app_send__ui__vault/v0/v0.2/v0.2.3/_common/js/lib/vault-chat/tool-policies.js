/* =================================================================================
   Vault Chat — Tool policies & loadouts (doc 04 §1)

   A policy decides, per tool: tier, mode (AUTO/CONFIRM/DRY_RUN/OFF), and whether it
   is available at all. The crucial semantic: an UNAVAILABLE (or OFF) tool is omitted
   from the tools[] sent to the model — invisible, not refused at runtime.

   Browser global: window.VaultChat.ToolPolicies
   ================================================================================= */
(function (root) {
    'use strict';

    // Default Track-A policy table (doc 04 §1). run_code is intentionally absent (D6).
    const DEFAULTS = [
        { name: 'list_folder',         tier: 'READ',        mode: 'AUTO',    available: true },
        { name: 'read_file',           tier: 'READ',        mode: 'AUTO',    available: true },
        { name: 'stat',                tier: 'READ',        mode: 'AUTO',    available: true },
        { name: 'exists',              tier: 'READ',        mode: 'AUTO',    available: true },
        { name: 'write_file',          tier: 'WRITE',       mode: 'CONFIRM', available: true },
        { name: 'create_folder',       tier: 'WRITE',       mode: 'CONFIRM', available: true },
        { name: 'rename',              tier: 'WRITE',       mode: 'CONFIRM', available: true },
        { name: 'delete_file',         tier: 'DESTRUCTIVE', mode: 'CONFIRM', available: true },
        { name: 'create_infographic',  tier: 'COSTLY',      mode: 'CONFIRM', available: true },
        { name: 'flush_memory',        tier: 'WRITE',       mode: 'CONFIRM', available: true },
        { name: 'consolidate_memory',  tier: 'WRITE',       mode: 'AUTO',    available: true },
    ];

    const MUTATING = new Set(['WRITE', 'DESTRUCTIVE']);

    // Named loadouts: per-task availability overrides (doc 04 §1).
    const LOADOUTS = {
        'read-only': (p) => ({ ...p, available: p.tier === 'READ' }),
        'edit':      (p) => p,                                  // defaults (read + write + infographic)
        'memory-curation': (p) => ({
            ...p,
            available: p.tier === 'READ'
                || p.name === 'consolidate_memory'
                || p.name === 'flush_memory'
        }),
    };

    function defaults() { return DEFAULTS.map((p) => ({ ...p })); }

    function applyLoadout(policies, name) {
        const fn = LOADOUTS[name];
        if (!fn) return policies.map((p) => ({ ...p }));
        return policies.map((p) => fn({ ...p }));
    }

    // When the vault is opened read-only, WRITE/DESTRUCTIVE/flush become unavailable.
    function degradeIfReadOnly(policies, writable) {
        if (writable) return policies.map((p) => ({ ...p }));
        return policies.map((p) => (MUTATING.has(p.tier) || p.name === 'flush_memory')
            ? { ...p, available: false }
            : { ...p });
    }

    // Build the tools[] for llm:send from available && mode!==OFF policies (doc 04 §1).
    // `registry` maps tool name -> tool definition ({name, description, parameters}).
    function compileTools(policies, registry) {
        registry = registry || {};
        return policies
            .filter((p) => p.available && p.mode !== 'OFF')
            .map((p) => registry[p.name] || { name: p.name })
            .filter(Boolean);
    }

    function byName(policies) {
        const m = {};
        for (const p of policies) m[p.name] = p;
        return m;
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.ToolPolicies = {
        DEFAULTS, MUTATING, LOADOUTS,
        defaults, applyLoadout, degradeIfReadOnly, compileTools, byName,
    };
})(typeof window !== 'undefined' ? window : globalThis);
