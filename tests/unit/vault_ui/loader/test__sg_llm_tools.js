/* SGLlmTools — opt-in tool groups for the vault chat: grants, scope, dispatch.
   Run: node tests/unit/vault_ui/loader/test__sg_llm_tools.js

   The properties worth pinning are the SECURITY ones, because each was a deliberate
   decision in the architect review (08/06) and none is visible by reading a call site:

     - default is NOTHING: no grants file → every group off → compileTools() === []
       (and therefore zero tokens added to requests);
     - the `.vault/**` floor beats every grant — including path-traversal spellings —
       so the model can never reach the key, the policy, or its OWN grants file;
     - deny wins over allow; a single '*' does not span segments; '**' does;
     - a corrupt grants file fails CLOSED (everything off), not open;
     - file content returns FENCED, and truncation is stated inside the fence;
     - a tool failure is a RESULT the model can read, never a throw. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const load = (rel) => {
    const p = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/' + rel, import.meta.url));
    runInThisContext(readFileSync(p, 'utf8'), { filename: rel, displayErrors: true });
};
load('lib/sg-llm/vault-llm-log.js');
load('lib/sg-llm/sg-llm-tools.js');
const T   = globalThis.SGLlmTools;
const Log = globalThis.VaultLlmLog;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// A fake vault: flat listing per folder + byte content per path.
function makeVault(tree, opts = {}) {
    // tree: { '/': [{name,type,size}], '/docs': [...] }, files: { 'docs/a.md': 'text' }
    return {
        writable: opts.writable !== false,
        listFolder: (p) => tree[(p === '' ? '/' : p)] || null,
        getFile: async (dir, name) => {
            const key = (dir === '/' ? '' : dir.replace(/^\//, '') + '/') + name;
            if (!(key in (opts.files || {}))) throw new Error('no file ' + key);
            return new TextEncoder().encode(opts.files[key]);
        },
        _findNode: (p) => true,
        createFolder: async () => {},
        addFile: async (dir, name, data) => { opts.writes = (opts.writes || []).concat([{ dir, name, data }]); },
        updateFile: async (dir, name, data) => { opts.writes = (opts.writes || []).concat([{ dir, name, data, update: true }]); }
    };
}

// files.read now REQUIRES an explicit allow-list (an empty one grants nothing), so the
// shared helper opts into '**'. The unscoped case is asserted on its own below.
const grantsOn = (over) => T.parseGrants(Object.assign({
    'session': { enabled: true }, 'files.read': { enabled: true, allow: ['**'] }
}, over || {}));

console.log('\n[suite] the default is NOTHING');
{
    const g = T.parseGrants(null);
    ok('no grants file → every group off', !T.anyEnabled(g));
    ok('…and compileTools is EMPTY (zero tokens, not refusals)', T.compileTools(g).length === 0);
    ok('a corrupt file fails CLOSED', !T.anyEnabled(T.parseGrants('garbage')));
    ok('enabled must be exactly true', !T.parseGrants({ 'files.read': { enabled: 'yes' } }).groups['files.read'].enabled);
    ok('unknown groups survive a round-trip (forward compat)', (() => {
        const rt = T.serializeGrants(T.parseGrants({ 'future.group': { enabled: true, allow: ['x/**'] } }));
        return rt['future.group'] && rt['future.group'].enabled === true;
    })());
    ok('serialize omits empty allow/deny (small diffs in the audit log)', (() => {
        // Explicitly-empty grant: grantsOn() now carries allow:['**'], which would be
        // serialised (correctly) and defeat the point of this assertion.
        const rt = T.serializeGrants(T.parseGrants({ 'files.read': { enabled: true } }));
        return !('allow' in rt['files.read']) && !('deny' in rt['files.read']);
    })());
    ok('serialize KEEPS a non-empty allow (the scope must survive a save)', (() => {
        const rt = T.serializeGrants(grantsOn());
        return Array.isArray(rt['files.read'].allow) && rt['files.read'].allow[0] === '**';
    })());
}

console.log('\n[suite] the floor beats every grant — including its own grants file');
{
    const g = grantsOn({ 'files.read': { enabled: true, allow: ['**'] } });
    ok('.vault itself',            T.pathAllowed(g, 'files.read', '.vault').code === 'EPROTECTED');
    ok('the key/config file',      T.pathAllowed(g, 'files.read', '.vault/llm/config.json').code === 'EPROTECTED');
    ok('the grants file ITSELF — no self-inspection, no self-escalation',
        T.pathAllowed(g, 'files.read', T.TOOLS_PATH).code === 'EPROTECTED');
    ok('leading-slash spelling',   T.pathAllowed(g, 'files.read', '/.vault/llm/tools.json').code === 'EPROTECTED');
    ok('traversal spelling',       T.pathAllowed(g, 'files.read', 'docs/../.vault/llm/tools.json').code === 'EPROTECTED');
    ok('backslash spelling',       T.pathAllowed(g, 'files.read', '.vault\\llm\\config.json').code === 'EPROTECTED');
    ok('an ordinary path passes',  T.pathAllowed(g, 'files.read', 'docs/a.md').ok === true);
}

console.log('\n[suite] scope globs — deny wins, * does not span, ** does');
{
    const g = grantsOn({ 'files.read': { enabled: true, allow: ['docs/**', '*.md'], deny: ['docs/private/**'] } });
    ok('docs/** allows nested',            T.pathAllowed(g, 'files.read', 'docs/a/b.md').ok);
    ok('*.md allows root files',           T.pathAllowed(g, 'files.read', 'readme.md').ok);
    ok('* does NOT span segments',         T.pathAllowed(g, 'files.read', 'other/readme.md').code === 'ESCOPE');
    ok('deny wins over allow',             T.pathAllowed(g, 'files.read', 'docs/private/x.md').code === 'ESCOPE');
    ok('…and the refusal names the scope', /docs\/private/.test(T.pathAllowed(g, 'files.read', 'docs/private/x.md').reason));
    // CHANGED 2026-08-13 (F5): an empty allow-list used to mean "the whole vault minus the
    // floor". Enabling a group is not by itself a grant over everything, so absent scope
    // now means NO scope.
    ok('empty allow grants NOTHING',
        T.pathAllowed(T.parseGrants({ 'files.read': { enabled: true } }), 'files.read', 'anything/at/all.txt').code === 'ENOSCOPE');
    ok('an explicit ** still grants everything (minus floor)',
        T.pathAllowed(grantsOn(), 'files.read', 'anything/at/all.txt').ok);
    ok('a disabled group refuses with EOFF',
        T.pathAllowed(T.parseGrants(null), 'files.read', 'docs/a.md').code === 'EOFF');
    ok('regex metacharacters in globs stay literal',
        !T.globToRegExp('a.b').test('axb') && T.globToRegExp('a.b').test('a.b'));
}

console.log('\n[suite] compileTools — omitted means omitted, and scope is STATED');
{
    const all = T.compileTools(grantsOn());
    ok('both groups compile to 6 tools', all.length === 6);
    const onlySession = T.compileTools(grantsOn({ 'files.read': { enabled: false } }));
    ok('a disabled group contributes nothing', onlySession.length === 2 &&
        onlySession.every((t) => ['get_costs', 'get_exchanges'].includes(t['function'].name)));
    const scoped = T.compileTools(grantsOn({ 'files.read': { enabled: true, allow: ['docs/**'] } }));
    const readDef = scoped.find((t) => t['function'].name === 'read_file');
    ok('the allowed scope appears in the description the model reads',
        /docs\/\*\*/.test(readDef['function'].description));
    ok('tokenWeight is measured, not hand-maintained',
        T.tokenWeight(grantsOn(), 'files.read') > 50 && T.tokenWeight(grantsOn(), 'session') > 20);
}

console.log('\n[suite] dispatch — session tools read the real ledger');
{
    Log.clear();
    Log.add({ model: 'm1', status: 'ok', promptChars: 10, cost: 0.002 });
    const g = grantsOn();
    const costs = await T.dispatch({ name: 'get_costs', args: {} }, { grants: g });
    ok('get_costs answers from VaultLlmLog', costs.ok && costs.result.calls === 1);
    const ex = await T.dispatch({ name: 'get_exchanges', args: {} }, { grants: g });
    ok('get_exchanges lists the calls', ex.ok && ex.result.length === 1 && ex.result[0].model === 'm1');
    ok('…without leaking message bodies', !('messages' in (ex.result[0] || {})));
    const off = await T.dispatch({ name: 'get_costs', args: {} }, { grants: T.parseGrants(null) });
    ok('a disabled group refuses at dispatch too (defence in depth)', !off.ok && off.code === 'EOFF');
}

console.log('\n[suite] dispatch — file tools against a fake vault');
{
    const tree = {
        '/':      [{ name: 'docs', type: 'folder' }, { name: 'a.md', type: 'file', size: 5 }, { name: '.vault', type: 'folder' }],
        '/docs':  [{ name: 'plan.md', type: 'file', size: 11 }]
    };
    const vault = makeVault(tree, { files: { 'docs/plan.md': 'the plan is', 'a.md': 'hello' } });
    const g   = grantsOn();
    const ctx = { vault, grants: g };

    const ls = await T.dispatch({ name: 'list_folder', args: { path: '' } }, ctx);
    ok('list_folder lists the root when scoped', ls.ok && ls.result.entries.some((e) => e.name === 'docs'));

    // The root-listing exemption exists so a SCOPED model can navigate. It must not paper
    // over a group with no scope at all, or "no allow-list" would still leak the root.
    const unscopedCtx = { vault, grants: T.parseGrants({ 'files.read': { enabled: true } }) };
    const lsNo = await T.dispatch({ name: 'list_folder', args: { path: '' } }, unscopedCtx);
    ok('…but an UNSCOPED group cannot even list the root', !lsNo.ok && lsNo.code === 'ENOSCOPE');
    ok('…but NEVER shows .vault',    !ls.result.entries.some((e) => e.name === '.vault'));

    const rd = await T.dispatch({ name: 'read_file', args: { path: 'docs/plan.md' } }, ctx);
    ok('read_file returns the content', rd.ok && /the plan is/.test(rd.result.content));
    ok('…FENCED as untrusted data',     rd.result.content.indexOf(T.FENCE_BEGIN) === 0 || rd.result.content.includes(T.FENCE_BEGIN));
    ok('…with the source path in the fence tag', rd.result.content.includes('source: /docs/plan.md'));

    const st = await T.dispatch({ name: 'stat', args: { path: 'docs/plan.md' } }, ctx);
    ok('stat reports size', st.ok && st.result.size === 11);
    ok('exists true/false', (await T.dispatch({ name: 'exists', args: { path: 'a.md' } }, ctx)).result.exists === true &&
                            (await T.dispatch({ name: 'exists', args: { path: 'nope.md' } }, ctx)).result.exists === false);

    const enoent = await T.dispatch({ name: 'read_file', args: { path: 'nope.md' } }, ctx);
    ok('a missing file is a RESULT, not a throw', !enoent.ok && enoent.code === 'ENOENT');
    const floor = await T.dispatch({ name: 'read_file', args: { path: '.vault/llm/config.json' } }, ctx);
    ok('the floor refuses at dispatch', !floor.ok && floor.code === 'EPROTECTED');
    const badargs = await T.dispatch({ name: 'read_file', args: null }, ctx);
    ok('malformed arguments are a RESULT (EARGS)', !badargs.ok && badargs.code === 'EARGS');
    const unknown = await T.dispatch({ name: 'rm_rf', args: {} }, ctx);
    ok('an unknown tool is refused', !unknown.ok && unknown.code === 'EUNKNOWN');

    // Scope enforcement end-to-end.
    const scoped = { vault, grants: grantsOn({ 'files.read': { enabled: true, allow: ['docs/**'] } }) };
    const inScope  = await T.dispatch({ name: 'read_file', args: { path: 'docs/plan.md' } }, scoped);
    const outScope = await T.dispatch({ name: 'read_file', args: { path: 'a.md' } }, scoped);
    ok('in-scope read passes',   inScope.ok);
    ok('out-of-scope read is ESCOPE with the scope named', !outScope.ok && outScope.code === 'ESCOPE' && /docs\/\*\*/.test(outScope.error));
    // The root listing stays visible even under an allow-scope — navigation must work.
    const lsScoped = await T.dispatch({ name: 'list_folder', args: { path: '' } }, scoped);
    ok('the root stays listable under an allow-scope', lsScoped.ok);
}

console.log('\n[suite] read_file truncation is stated INSIDE the fence');
{
    const big = 'x'.repeat(T.MAX_READ_CHARS + 500);
    const vault = makeVault({ '/': [{ name: 'big.txt', type: 'file', size: big.length }] }, { files: { 'big.txt': big } });
    const r = await T.dispatch({ name: 'read_file', args: { path: 'big.txt' } },
                               { vault, grants: grantsOn() });
    ok('truncated flag set',     r.ok && r.result.truncated === true);
    ok('content capped',         r.result.content.length < big.length);
    ok('the note is INSIDE the fence, where the model reads it',
        r.result.content.indexOf('[TRUNCATED') > -1 &&
        r.result.content.indexOf('[TRUNCATED') < r.result.content.indexOf(T.FENCE_END));
}

console.log('\n[suite] grants persistence — the commit is the audit log');
{
    const opts = { files: {} };
    const tree = { '/': [{ name: '.vault', type: 'folder' }], '/.vault': [{ name: 'llm', type: 'folder' }], '/.vault/llm': [] };
    const vault = makeVault(tree, opts);
    await T.saveGrants(vault, grantsOn());
    ok('saveGrants writes tools.json', opts.writes.length === 1 && opts.writes[0].name === 'tools.json');
    ok('…into /.vault/llm',            opts.writes[0].dir === '/.vault/llm');
    const body = JSON.parse(new TextDecoder().decode(opts.writes[0].data));
    ok('…with the schema and both groups', body.schema === 1 && body['files.read'].enabled === true);

    let err = null;
    try { await T.saveGrants(makeVault(tree, { writable: false }), grantsOn()); } catch (e) { err = e; }
    ok('a read-only vault cannot change grants', err && err.code === 'EREADONLY');

    // loadGrants: an absent file is all-off, not an error.
    const empty = await T.loadGrants(makeVault({ '/': [], '/.vault': [] }, {}));
    ok('no tools.json → everything off', !T.anyEnabled(empty));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
