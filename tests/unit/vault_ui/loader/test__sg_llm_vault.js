/* SGLlmVault — resolving a vault's LLM config through LAZY sub-trees.
   Run: node tests/unit/vault_ui/loader/test__sg_llm_vault.js

   REGRESSION GUARD for: "I have the key defined but the chat didn't pick it up."

   Root cause: `loadSubTreeOnDemand(path)` expands exactly ONE level. Expanding `/.vault`
   inserts `llm` as ANOTHER unloaded folder, so `listFolder('/.vault/llm')` still returned
   [] and readConfig() reported "no config" → the panel showed ENOKEY ("No AI key
   configured for this vault") even though `.vault/llm/config.json` was right there.

   It only reproduced on a FRESH open: in the session where Settings had just written the
   config, that tree node was already loaded in memory, so it worked — and then stopped
   working after a reload. Hence a test that models lazy loading faithfully rather than
   handing readConfig a fully-materialised tree. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-llm/';
const src  = (f) => readFileSync(fileURLToPath(new URL('../../../../' + base + f, import.meta.url)), 'utf8');
runInThisContext(src('sg-llm-config.js'), { filename: 'sg-llm-config.js' });
runInThisContext(src('sg-llm.js'),        { filename: 'sg-llm.js' });
runInThisContext(src('sg-llm-vault.js'),  { filename: 'sg-llm-vault.js' });
const { SGLlmVault } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const CONFIG = {
    schema: 'sg-llm-config/v1', provider: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1',
    keyTier: 'shared', key: 'sk-or-v1-testkey',
    models: { allow: ['*'], default: null },
    limits: { maxCostPerSession: 1, maxCallsPerSession: 200, maxTokensPerCall: 8000, maxConcurrent: 2 }
};

/* A vault that lazily materialises sub-trees ONE LEVEL AT A TIME — the real behaviour of
   SGVault.loadSubTreeOnDemand (sg-vault--folder-ops.js). Every folder starts unloaded;
   expanding it reveals its children, each itself unloaded. */
function makeLazyVault(opts = {}) {
    const tree = {
        '/.vault':     { loaded: false, children: { llm: 'folder', 'access-token.json': 'file' } },
        '/.vault/llm': { loaded: false, children: { 'config.json': 'file' } }
    };
    const loads = [];
    return {
        loads,
        writeKeyHex: opts.writeKeyHex || null,
        needsLoading(p) { return !!tree[p] && tree[p].loaded === false; },
        async loadSubTreeOnDemand(p) {
            if (!tree[p] || tree[p].loaded) return false;
            tree[p].loaded = true; loads.push(p); return true;
        },
        listFolder(p) {
            const node = tree[p];
            if (!node) return null;
            if (!node.loaded) return [];            // THE TRAP: unloaded reads as empty
            return Object.entries(node.children).map(([name, type]) => ({ name, type }));
        },
        async getFile(folder, name) {
            if (folder === '/.vault/llm' && name === 'config.json' && tree['/.vault/llm'].loaded) {
                return new TextEncoder().encode(JSON.stringify(opts.config || CONFIG));
            }
            throw new Error('File not found: ' + name);
        }
    };
}

console.log('\n[suite] readConfig walks EVERY lazy level, not just the first');
{
    const v = makeLazyVault();
    const cfg = await SGLlmVault.readConfig(v);
    ok('config is found through two lazy levels', !!cfg, 'got ' + JSON.stringify(cfg));
    ok('it is the real config', cfg && cfg.schema === 'sg-llm-config/v1');
    ok('both sub-trees were expanded', v.loads.includes('/.vault') && v.loads.includes('/.vault/llm'),
       'loads=' + JSON.stringify(v.loads));
}

console.log('\n[suite] open() reports a usable client, not ENOKEY');
{
    const v = makeLazyVault();
    const s = await SGLlmVault.open(v);
    ok('session is ok', s.ok === true, 'reason=' + s.reason);
    ok('a client is returned', !!s.client);
    ok('the endpoint comes from the config', s.client.endpoint === 'https://openrouter.ai/api/v1');
    ok('no bogus ENOKEY', s.reason !== 'ENOKEY');
}

console.log('\n[suite] already-loaded trees still work (no regression for the write-then-read case)');
{
    const v = makeLazyVault();
    await v.loadSubTreeOnDemand('/.vault');
    await v.loadSubTreeOnDemand('/.vault/llm');
    v.loads.length = 0;
    const cfg = await SGLlmVault.readConfig(v);
    ok('config still resolves', !!cfg);
    ok('nothing is re-expanded unnecessarily', v.loads.length === 0);
}

console.log('\n[suite] genuinely-absent config still reports ENOKEY');
{
    const bare = {
        writeKeyHex: null,
        needsLoading() { return false; },
        async loadSubTreeOnDemand() { return false; },
        listFolder(p) { return p === '/.vault' ? [{ name: 'access-token.json', type: 'file' }] : null; },
        async getFile() { throw new Error('nope'); }
    };
    ok('no llm folder → null config', (await SGLlmVault.readConfig(bare)) === null);
    const s = await SGLlmVault.open(bare);
    ok('open() says ENOKEY', s.ok === false && s.reason === 'ENOKEY');
    ok('a policy is still returned so the UI can render', !!s.policy);
}

console.log('\n[suite] an owner-sealed key in a read-only session fails as EREADONLY, not ENOKEY');
{
    const sealed = Object.assign({}, CONFIG, {
        keyTier: 'owner', key: null,
        keySealed: { iv: 'KBiXr5Y6HmVuSPAc', ct: 'PFK8kNOywV' }
    });
    const v = makeLazyVault({ config: sealed, writeKeyHex: null });   // ro session: no write key
    const s = await SGLlmVault.open(v);
    ok('config was found (the lazy walk worked)', s.reason !== 'ENOKEY', 'reason=' + s.reason);
    ok('it reports EREADONLY', s.reason === 'EREADONLY');
    ok('the message explains what to do', /full key/i.test(s.message || ''));
}

console.log('\n[suite] a corrupt config never throws — the UI must still render');
{
    const v = makeLazyVault();
    v.getFile = async () => new TextEncoder().encode('{ this is not json');
    ok('malformed JSON → null, not a throw', (await SGLlmVault.readConfig(v)) === null);
    const s = await SGLlmVault.open(v);
    ok('open() degrades to ENOKEY', s.ok === false && s.reason === 'ENOKEY');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
