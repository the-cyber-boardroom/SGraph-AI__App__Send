/* =================================================================================
   LLM config — pure logic (no DOM, no crypto, no bridge, no `this`)

   The policy half of the `sg.llm.*` capability: what a vault's admin has configured
   for LLM access. Unit-tested in Node via runInThisContext
   (tests/unit/vault_ui/loader/test__sg_llm_config.js).

   Stored at `.vault/llm/config.json` — inside the floor, so NO app can read it via
   the bridge under any grant (AppPermissions.isFloor denies every `.vault/**` path).
   The vault UI (real origin) reads and writes it; the kernel reads it to service
   sg.llm.* calls.

   KEY TIERS — the credential itself lives in one of two places:
     'owner'  (default) the key is SEALED with SGVaultOwnerSecrets, whose AES key is
              derived from the vault's WRITE key. A read-only (ro-token) session has
              no write key, so it cannot open the seal — sharing a read-only link
              does NOT share the credential.
     'shared' the key sits in this file in clear (still read_key-encrypted at rest
              like every vault file). ANY session that can open the vault can use it
              AND extract it. Opt-in, for vaults where every reader should be able to
              spend the owner's budget.

   Exposes globalThis.SGLlmConfig:
     parse(obj)              → normalised policy (junk collapses to safe defaults)
     serialize(policy)       → plain object to persist
     modelAllowed(p, id)     → bool (supports '*' and 'vendor/*' globs)
     defaultModel(p)         → the configured default, or null
     limitsFor(p, appId)     → effective limits (per-app override merged over global)
     looksLikeKey(s)         → cheap shape check for an OpenRouter key
     redact(s)               → 'sk-or-…4f2a' for display; never the whole key
     summarise(p)            → {configured, tier, models, cost} for a status line
   ================================================================================= */

(function () {
    'use strict';

    var SCHEMA          = 'sg-llm-config/v1';
    var DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1';

    // Conservative defaults. These are UX/accident bounds, NOT security: the enforceable
    // cap is the upstream key's own credit limit, set when the key is minted.
    var DEFAULT_LIMITS = {
        maxCostPerSession : 1.00,
        maxCallsPerSession: 200,
        maxTokensPerCall  : 8000,
        maxConcurrent     : 2
    };

    function _num(v, dflt, min, max) {
        var n = (typeof v === 'number' && isFinite(v)) ? v : Number(v);
        if (!isFinite(n) || n < 0) return dflt;
        if (min != null && n < min) return min;
        if (max != null && n > max) return max;
        return n;
    }

    function _strArray(v, dflt) {
        if (!Array.isArray(v)) return dflt;
        var out = [];
        for (var i = 0; i < v.length; i++) {
            if (typeof v[i] === 'string' && v[i].trim()) out.push(v[i].trim());
        }
        return out.length ? out : dflt;
    }

    function _limits(raw) {
        var l = (raw && typeof raw === 'object') ? raw : {};
        return {
            maxCostPerSession : _num(l.maxCostPerSession,  DEFAULT_LIMITS.maxCostPerSession,  0, 1000),
            maxCallsPerSession: _num(l.maxCallsPerSession, DEFAULT_LIMITS.maxCallsPerSession, 0, 100000),
            maxTokensPerCall  : _num(l.maxTokensPerCall,   DEFAULT_LIMITS.maxTokensPerCall,   0, 1000000),
            maxConcurrent     : _num(l.maxConcurrent,      DEFAULT_LIMITS.maxConcurrent,      1, 16)
        };
    }

    // Parse `.vault/llm/config.json` into a normalised policy. Anything malformed
    // collapses to a safe default rather than throwing — a corrupt config must not
    // brick the settings page.
    function parse(obj) {
        var o = (obj && typeof obj === 'object') ? obj : {};
        var m = (o.models && typeof o.models === 'object') ? o.models : {};
        var tier = (o.keyTier === 'shared') ? 'shared' : 'owner';   // default-safe
        var apps = {};
        if (o.apps && typeof o.apps === 'object') {
            for (var k in o.apps) {
                if (Object.prototype.hasOwnProperty.call(o.apps, k)) apps[k] = _limits(o.apps[k]);
            }
        }
        return {
            schema  : SCHEMA,
            provider: 'openrouter',                                  // Phase 1: the only provider
            endpoint: (typeof o.endpoint === 'string' && o.endpoint) ? o.endpoint : DEFAULT_ENDPOINT,
            keyTier : tier,
            // Only ONE of these is ever populated, per tier.
            key      : (tier === 'shared' && typeof o.key === 'string' && o.key) ? o.key : null,
            keySealed: (tier === 'owner'  && o.keySealed && o.keySealed.iv && o.keySealed.ct)
                         ? { iv: String(o.keySealed.iv), ct: String(o.keySealed.ct) } : null,
            models  : {
                allow  : _strArray(m.allow, ['*']),
                'default': (typeof m['default'] === 'string' && m['default']) ? m['default'] : null
            },
            limits  : _limits(o.limits),
            apps    : apps
        };
    }

    function serialize(policy) {
        var p = parse(policy);
        var out = {
            schema  : SCHEMA,
            provider: p.provider,
            endpoint: p.endpoint,
            keyTier : p.keyTier,
            models  : { allow: p.models.allow, 'default': p.models['default'] },
            limits  : p.limits
        };
        if (p.keyTier === 'shared') out.key       = p.key;
        else                        out.keySealed = p.keySealed;
        if (Object.keys(p.apps).length) out.apps = p.apps;
        return out;
    }

    // Glob match for model ids: exact, '*' (all), or 'vendor/*'.
    function modelAllowed(policy, modelId) {
        var p  = parse(policy);
        var id = String(modelId == null ? '' : modelId).trim();
        if (!id) return false;
        var allow = p.models.allow;
        for (var i = 0; i < allow.length; i++) {
            var a = allow[i];
            if (a === '*') return true;
            if (a === id)  return true;
            if (a.length > 1 && a.charAt(a.length - 1) === '*') {
                if (id.indexOf(a.slice(0, -1)) === 0) return true;
            }
        }
        return false;
    }

    function defaultModel(policy) {
        var p = parse(policy);
        if (!p.models['default']) return null;
        return modelAllowed(p, p.models['default']) ? p.models['default'] : null;
    }

    // Effective limits for an app: a per-app block fully replaces the global one. It may
    // raise or lower a cap — this file is written by the vault admin, who is trusted to
    // grant a specific app more room. (App manifests can never set limits: a limit the
    // app author chooses is not a limit.)
    function limitsFor(policy, appId) {
        var p = parse(policy);
        if (!appId || !p.apps[appId]) return p.limits;
        return p.apps[appId];
    }

    // Cheap shape check — catches paste errors, not forgeries. OpenRouter keys are
    // 'sk-or-v1-…'; we accept any 'sk-' prefix of plausible length so a provider tweak
    // doesn't lock users out of their own settings page.
    function looksLikeKey(s) {
        var v = String(s == null ? '' : s).trim();
        return v.indexOf('sk-') === 0 && v.length >= 20 && !/\s/.test(v);
    }

    // Display form. Never render a full key back into the DOM.
    function redact(s) {
        var v = String(s == null ? '' : s).trim();
        if (!v) return '';
        if (v.length <= 12) return '…';
        return v.slice(0, 6) + '…' + v.slice(-4);
    }

    // Choose a model when the admin left `models.default` empty. Order:
    //   1. the configured default, if it is allowed
    //   2. the first allowed id matching a PREFERRED vendor prefix (stable across model
    //      renames — we match the vendor, never a version)
    //   3. the first allowed id at all
    // Returns null only when nothing is allowed/available. Callers should SHOW which
    // model was auto-picked rather than choosing silently.
    var PREFERRED = ['anthropic/', 'openai/', 'google/', 'meta-llama/', 'mistralai/'];

    function pickModel(policy, availableIds) {
        var p   = parse(policy);
        var ids = Array.isArray(availableIds) ? availableIds.filter(function (i) { return typeof i === 'string' && i; }) : [];
        var allowed = ids.filter(function (id) { return modelAllowed(p, id); });

        var dflt = p.models['default'];
        if (dflt && modelAllowed(p, dflt)) {
            // Honour the configured default even if the /models list is unavailable.
            if (!allowed.length || allowed.indexOf(dflt) > -1) return dflt;
        }
        for (var v = 0; v < PREFERRED.length; v++) {
            for (var i = 0; i < allowed.length; i++) {
                if (allowed[i].indexOf(PREFERRED[v]) === 0) return allowed[i];
            }
        }
        return allowed.length ? allowed[0] : null;
    }

    function summarise(policy) {
        var p = parse(policy);
        var configured = !!(p.key || p.keySealed);
        return {
            configured: configured,
            tier      : p.keyTier,
            models    : p.models.allow.join(', '),
            'default' : p.models['default'],
            cost      : p.limits.maxCostPerSession,
            calls     : p.limits.maxCallsPerSession
        };
    }

    globalThis.SGLlmConfig = {
        SCHEMA          : SCHEMA,
        DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
        DEFAULT_LIMITS  : DEFAULT_LIMITS,
        PREFERRED       : PREFERRED,
        parse           : parse,
        serialize       : serialize,
        modelAllowed    : modelAllowed,
        defaultModel    : defaultModel,
        pickModel       : pickModel,
        limitsFor       : limitsFor,
        looksLikeKey    : looksLikeKey,
        redact          : redact,
        summarise       : summarise
    };
})();
