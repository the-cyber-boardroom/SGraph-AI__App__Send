/* SGLlmConfig — policy parse/serialize/match for `.vault/llm/config.json`.
   Run: node tests/unit/vault_ui/loader/test__sg_llm_config.js

   Pure module (no DOM, no crypto) → loaded with runInThisContext like the other
   lib tests. The security-relevant assertions here are the DEFAULTS: an absent or
   junk config must never silently produce a permissive policy, and the key tier
   must default to 'owner' (sealed) rather than 'shared' (extractable by readers). */

import { readFileSync }      from 'node:fs';
import { runInThisContext }  from 'node:vm';

runInThisContext(readFileSync(
    'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-llm/sg-llm-config.js', 'utf8'));

const C = globalThis.SGLlmConfig;
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

console.log('\n[suite] SGLlmConfig — parse defaults (safe-by-default)');
{
    const p = C.parse(null);
    ok('null config parses without throwing', !!p);
    ok('provider is openrouter', p.provider === 'openrouter');
    ok('endpoint defaults to OpenRouter v1', p.endpoint === C.DEFAULT_ENDPOINT);
    ok('key tier defaults to OWNER (sealed), not shared', p.keyTier === 'owner');
    ok('no key and no seal when unconfigured', p.key === null && p.keySealed === null);
    ok('summarise reports not-configured', C.summarise(p).configured === false);

    const junk = C.parse({ keyTier: 'nonsense', models: 'nope', limits: 'nope', endpoint: 42 });
    ok('junk keyTier collapses to owner', junk.keyTier === 'owner');
    ok('junk models collapses to allow-all + no default',
        junk.models.allow.length === 1 && junk.models.allow[0] === '*' && junk.models['default'] === null);
    ok('junk limits collapse to defaults', junk.limits.maxCostPerSession === C.DEFAULT_LIMITS.maxCostPerSession);
    ok('junk endpoint collapses to default', junk.endpoint === C.DEFAULT_ENDPOINT);
}

console.log('\n[suite] SGLlmConfig — key tiers are mutually exclusive');
{
    // A config claiming BOTH must not leak the clear key while presenting as owner-sealed.
    const both = C.parse({ keyTier: 'owner', key: 'sk-or-v1-plaintext', keySealed: { iv: 'aa', ct: 'bb' } });
    ok('owner tier ignores a clear key field', both.key === null);
    ok('owner tier keeps the seal', both.keySealed && both.keySealed.ct === 'bb');

    const shared = C.parse({ keyTier: 'shared', key: 'sk-or-v1-abc', keySealed: { iv: 'aa', ct: 'bb' } });
    ok('shared tier keeps the clear key', shared.key === 'sk-or-v1-abc');
    ok('shared tier drops the seal', shared.keySealed === null);

    const outO = C.serialize(C.parse({ keyTier: 'owner', keySealed: { iv: 'i', ct: 'c' } }));
    ok('serialize(owner) emits keySealed only', !!outO.keySealed && !('key' in outO));
    const outS = C.serialize(C.parse({ keyTier: 'shared', key: 'sk-or-v1-abc' }));
    ok('serialize(shared) emits key only', outS.key === 'sk-or-v1-abc' && !('keySealed' in outS));
}

console.log('\n[suite] SGLlmConfig — model allow-list');
{
    const star   = C.parse({ models: { allow: ['*'] } });
    const vendor = C.parse({ models: { allow: ['anthropic/*', 'openai/gpt-4o-mini'] } });
    ok("'*' allows anything", C.modelAllowed(star, 'anything/at-all'));
    ok('vendor glob matches its prefix', C.modelAllowed(vendor, 'anthropic/claude-sonnet-4'));
    ok('exact entry matches', C.modelAllowed(vendor, 'openai/gpt-4o-mini'));
    ok('non-listed vendor is denied', !C.modelAllowed(vendor, 'google/gemini-pro'));
    ok('near-miss on exact entry is denied', !C.modelAllowed(vendor, 'openai/gpt-4o'));
    ok('empty model id is denied', !C.modelAllowed(star, ''));

    ok('defaultModel returns a listed default',
        C.defaultModel(C.parse({ models: { allow: ['anthropic/*'], 'default': 'anthropic/x' } })) === 'anthropic/x');
    ok('defaultModel refuses a default outside the allow-list',
        C.defaultModel(C.parse({ models: { allow: ['anthropic/*'], 'default': 'openai/x' } })) === null);
}

console.log('\n[suite] SGLlmConfig — pickModel (regression: default:null → {model:null} → upstream 404)');
{
    const ids = ['zz/last', 'openai/gpt-4o-mini', 'anthropic/claude-x', 'aaa/first'];

    // THE BUG: a saved config with models.default = null used to flow straight through to
    // the request body as model:null, and OpenRouter answered "No endpoints found for .".
    const noDefault = C.parse({ models: { allow: ['*'] } });
    ok('config with no default still yields a model', C.pickModel(noDefault, ids) !== null);
    ok('…and prefers a known vendor over alphabetical', C.pickModel(noDefault, ids) === 'anthropic/claude-x');

    const withDefault = C.parse({ models: { allow: ['*'], 'default': 'openai/gpt-4o-mini' } });
    ok('a configured default wins', C.pickModel(withDefault, ids) === 'openai/gpt-4o-mini');

    // A default the admin later disallowed must not be resurrected.
    const stale = C.parse({ models: { allow: ['anthropic/*'], 'default': 'openai/gpt-4o-mini' } });
    ok('a default outside the allow-list is not used', C.pickModel(stale, ids) === 'anthropic/claude-x');

    const narrow = C.parse({ models: { allow: ['zz/*'] } });
    ok('falls back to the first allowed id when no vendor matches', C.pickModel(narrow, ids) === 'zz/last');

    ok('no available ids + a valid default → the default (list may be unreachable)',
        C.pickModel(withDefault, []) === 'openai/gpt-4o-mini');
    ok('nothing allowed and nothing available → null (caller must show an error)',
        C.pickModel(C.parse({ models: { allow: ['nope/*'] } }), ids) === null);
    ok('junk availableIds does not throw', C.pickModel(noDefault, null) === null);

    /* THE SECOND BUG, found in use: the caller passes an ALPHABETICALLY SORTED id list, so
       matching only on the vendor prefix picked `anthropic/claude-3-haiku` — "3" sorts
       before "opus" and "sonnet", so a vault with no configured default silently got the
       oldest, weakest model on the key. It could not read a pasted screenshot either, haiku
       not being a vision model. Named models are now tried first. */
    const real = ['anthropic/claude-3-haiku', 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5',
                  'google/gemini-3.5-flash', 'openai/gpt-5'].sort();
    ok('a real catalogue picks sonnet-5, not the alphabetically-first haiku',
        C.pickModel(noDefault, real) === 'anthropic/claude-sonnet-5', C.pickModel(noDefault, real));
    ok('…and the named list is ordered, opus after sonnet',
        C.PREFERRED_MODELS.indexOf('anthropic/claude-sonnet-5') < C.PREFERRED_MODELS.indexOf('anthropic/claude-opus-5'));

    // Only the weak model plus a good non-anthropic one: the named list must beat the
    // vendor order, or we are back to haiku.
    ok('a named model from ANOTHER vendor beats a weak anthropic one',
        C.pickModel(noDefault, ['anthropic/claude-3-haiku', 'google/gemini-3.5-flash'].sort())
            === 'google/gemini-3.5-flash');

    // The named list must never override what an admin actually configured, or the
    // Settings page becomes advisory.
    ok('an explicit default still wins over the named list',
        C.pickModel(C.parse({ models: { allow: ['*'], 'default': 'anthropic/claude-3-haiku' } }), real)
            === 'anthropic/claude-3-haiku');
    ok('…and the allow-list still wins over the named list',
        C.pickModel(C.parse({ models: { allow: ['google/*'] } }), real) === 'google/gemini-3.5-flash');

    // A rename must degrade to the vendor fallback, not pin a dead id.
    ok('none of the named models available → vendor fallback',
        C.pickModel(noDefault, ['anthropic/claude-7-future', 'zz/other'].sort()) === 'anthropic/claude-7-future');

    // Every named default should be able to read a screenshot — the chat panel accepts
    // pasted images, and a default that cannot see them is a bad default.
    ok('the top named default is a vision model',
        C.PREFERRED_MODELS[0] === 'anthropic/claude-sonnet-5');
}

console.log('\n[suite] SGLlmConfig — limits and per-app overrides');
{
    const p = C.parse({ limits: { maxCostPerSession: 5, maxCallsPerSession: 50 },
                        apps: { 'workbench.html': { maxCostPerSession: 0.5 } } });
    ok('global limits parse', p.limits.maxCostPerSession === 5);
    ok('unknown app falls back to global', C.limitsFor(p, 'other.html').maxCostPerSession === 5);
    ok('known app uses its override', C.limitsFor(p, 'workbench.html').maxCostPerSession === 0.5);
    ok('no appId falls back to global', C.limitsFor(p, null).maxCallsPerSession === 50);
    ok('negative cost is rejected → default',
        C.parse({ limits: { maxCostPerSession: -5 } }).limits.maxCostPerSession === C.DEFAULT_LIMITS.maxCostPerSession);
    ok('maxConcurrent floors at 1', C.parse({ limits: { maxConcurrent: 0 } }).limits.maxConcurrent === 1);
}

console.log('\n[suite] SGLlmConfig — key shape check and redaction');
{
    ok('accepts an OpenRouter-shaped key', C.looksLikeKey('sk-or-v1-0123456789abcdef0123'));
    ok('rejects empty', !C.looksLikeKey(''));
    ok('rejects a short string', !C.looksLikeKey('sk-or-1'));
    ok('rejects a key with whitespace (paste error)', !C.looksLikeKey('sk-or-v1-0123456789abcdef 0123'));
    ok('rejects a non-sk prefix', !C.looksLikeKey('or-v1-0123456789abcdef0123'));

    const r = C.redact('sk-or-v1-0123456789abcdef4f2a');
    ok('redaction keeps only head and tail', r === 'sk-or-…4f2a', r);
    ok('redaction never returns the whole key', r.indexOf('0123456789') === -1);
    ok('redaction of empty is empty', C.redact('') === '');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
