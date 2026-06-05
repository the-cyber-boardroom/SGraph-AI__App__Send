/* Unit tests — SGVault history methods (logCommits / listTreeAt / readFileAt / readBlob)
   Run: node tests/unit/vault_ui/loader/test__vault_history.js
   Stubs SGVault (so the prototype methods attach), SGSendCrypto (identity decrypt), and a
   fake vault with _commitManager / _flattenCommitTree / _objectStore. No real crypto. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

globalThis.SGVault = function SGVault() {};
globalThis.SGSendCrypto = { decrypt: async (cipher /*, key */) => cipher };   // identity

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault--history.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-vault--history.js', displayErrors: true });

const enc = s => new TextEncoder().encode(s);

// fake vault
const commits = {
    c3: { parents: ['c2'], tree_id: 't3', timestamp_ms: 300, message: 'third' },
    c2: { parents: ['c1'], tree_id: 't2', timestamp_ms: 200, message: 'second' },
    c1: { parents: [],     tree_id: 't1', timestamp_ms: 100, message: 'first' }
};
const blobs = { b1: enc('hi\n'), b2: enc('hello'), b3: enc('xx') };
const v = new globalThis.SGVault();
v._headCommitId  = 'c3';
v._readKey       = {};
v._commitManager = { loadCommit: async id => { if (!commits[id]) throw new Error('no commit ' + id); return JSON.parse(JSON.stringify(commits[id])); } };
v._objectStore   = { load: async id => { if (!blobs[id]) throw new Error('no blob ' + id); return blobs[id]; } };
v._flattenCommitTree = async (/* commitId */) => new Map([
    ['readme.md',     { blob_id: 'b1', size: 3 }],
    ['maps/a.md',     { blob_id: 'b2', size: 5 }],
    ['maps/sub/b.md', { blob_id: 'b3', size: 7 }]
]);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b));

(async () => {
    console.log('\n[suite] SGVault history');

    // logCommits — first-parent walk, limit, from
    const log = await v.logCommits({});
    eq('log: walks first-parent chain (c3,c2,c1)', log.map(c => c.id), ['c3', 'c2', 'c1']);
    ok('log: carries message + timestamp', log[0].message === 'third' && log[0].timestamp_ms === 300);
    eq('log: limit honoured', (await v.logCommits({ limit: 2 })).map(c => c.id), ['c3', 'c2']);
    eq('log: from a given commit', (await v.logCommits({ from: 'c2' })).map(c => c.id), ['c2', 'c1']);

    // listTreeAt — one level
    const root = await v.listTreeAt('c3', '');
    ok('list root: readme.md (file)', root.some(e => e.path === 'readme.md' && !e.dir && e.size === 3));
    ok('list root: maps/ (dir, collapsed)', root.some(e => e.path === 'maps/' && e.dir));
    ok('list root: does not leak nested files', !root.some(e => e.path === 'maps/a.md'));
    const maps = await v.listTreeAt('c3', 'maps');
    ok('list maps: a.md (file)', maps.some(e => e.path === 'maps/a.md' && !e.dir));
    ok('list maps: sub/ (dir)', maps.some(e => e.path === 'maps/sub/' && e.dir));

    // readFileAt — decrypt the blob at that commit
    const buf = await v.readFileAt('c3', 'maps/a.md');
    ok('readFileAt returns ArrayBuffer', buf instanceof ArrayBuffer);
    eq('readFileAt content', new TextDecoder().decode(buf), 'hello');
    let threw = false; try { await v.readFileAt('c3', 'nope.md'); } catch (_) { threw = true; }
    ok('readFileAt missing → throws ENOENT', threw);

    // readBlob — by id
    eq('readBlob by id', new TextDecoder().decode(await v.readBlob('b1')), 'hi\n');

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
