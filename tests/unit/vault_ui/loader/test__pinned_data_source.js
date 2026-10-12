/* PinnedVaultDataSource — a vault as it was at one commit, read-only.
   Run: node tests/unit/vault_ui/loader/test__pinned_data_source.js

   This adapter is the whole release-channels feature: every mount path in app-shell
   talks only to getFileList() / getFileBytes() / writable, so serving those three from a
   historical commit pins the entire app — its app.json, its resources, every sg.vfs.read
   — with no changes downstream. What is pinned here is that contract.

   `writable === false` is a safety rule, not a gap: committing on top of an old tree
   would fork the branch. Pinned is read-only for the owner too. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/adapters/pinned-data-source.js',
    import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'pinned-data-source.js', displayErrors: true });
const { PinnedVaultDataSource } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// A vault with two commits. v1 is the old release; HEAD has different content.
const COMMITS = {
    c_old: new Map([
        ['app.json',            { blob_id: 'b1', size: 40 }],
        ['index.html',          { blob_id: 'b2', size: 120 }],
        ['assets/app.css',      { blob_id: 'b3', size: 30 }],
        ['docs/deep/notes.md',  { blob_id: 'b4', size: 10 }]
    ]),
    c_head: new Map([
        ['app.json',   { blob_id: 'b9', size: 44 }],
        ['index.html', { blob_id: 'b8', size: 999 }]
    ])
};
const BLOBS = {
    b1: '{"entry":"index.html","title":"v1"}',
    b2: '<h1>version one</h1>',
    b3: 'body{color:red}',
    b4: '# notes',
    b9: '{"entry":"index.html","title":"HEAD"}',
    b8: '<h1>latest</h1>'
};

const vault = {
    name: 'Demo Vault',
    async _flattenCommitTree(id) {
        if (!COMMITS[id]) throw new Error('no such commit: ' + id);
        return COMMITS[id];
    },
    async readFileAt(id, path) {
        const m = COMMITS[id].get(String(path).replace(/^\/+/, ''));
        if (!m) { const e = new Error('ENOENT'); e.path = path; throw e; }
        return new TextEncoder().encode(BLOBS[m.blob_id]).buffer;
    }
};

const text = (buf) => new TextDecoder().decode(buf);

console.log('\n[suite] it serves the OLD commit, not HEAD');
{
    const ds = await new PinnedVaultDataSource(vault, 'c_old').warm();
    ok('app.json comes from the pinned commit', /"title":"v1"/.test(text(await ds.getFileBytes('app.json'))));
    ok('the entry file is the old one', /version one/.test(text(await ds.getFileBytes('index.html'))));
    ok('a leading slash is tolerated', /version one/.test(text(await ds.getFileBytes('/index.html'))));
    ok('a file that only exists in the old commit is served',
        /body\{color:red\}/.test(text(await ds.getFileBytes('assets/app.css'))));

    let missing = null;
    try { await ds.getFileBytes('nope.txt'); } catch (e) { missing = e; }
    ok('a missing file still throws ENOENT', missing && /ENOENT/.test(missing.message));
}

console.log('\n[suite] getFileList() is synchronous after warm() — the contract callers assume');
{
    const ds = await new PinnedVaultDataSource(vault, 'c_old').warm();
    const list = ds.getFileList();
    ok('it returns an array synchronously', Array.isArray(list));
    const files = list.filter((e) => !e.dir).map((e) => e.path).sort();
    ok('every file at that commit is listed',
        files.join(',') === 'app.json,assets/app.css,docs/deep/notes.md,index.html', files.join(','));
    ok('sizes are carried', list.find((e) => e.path === 'index.html').size === 120);
    ok('names are the basename', list.find((e) => e.path === 'docs/deep/notes.md').name === 'notes.md');

    // A flat commit map has no folder rows; tree views need them synthesised.
    const dirs = list.filter((e) => e.dir).map((e) => e.path).sort();
    ok('intermediate folders are synthesised', dirs.join(',') === 'assets/,docs/,docs/deep/', dirs.join(','));
    ok('folder rows are marked dir', list.filter((e) => e.dir).every((e) => e.dir === true));

    // Before warm() the list is empty rather than throwing — a caller that forgets sees
    // an empty vault, not a crash.
    const cold = new PinnedVaultDataSource(vault, 'c_old');
    ok('an un-warmed source lists nothing rather than throwing', cold.getFileList().length === 0);
}

console.log('\n[suite] pinned is read-only — for everyone, including the owner');
{
    const ds = await new PinnedVaultDataSource(vault, 'c_old').warm();
    ok('writable is false', ds.writable === false);
    ok('it advertises that it is pinned', ds.pinned === true);

    const refuses = async (fn, label) => {
        let err = null;
        try { await fn(); } catch (e) { err = e; }
        ok(label + ' is refused with EPINNED', err && err.code === 'EPINNED', err && err.code);
        return err;
    };
    const e = await refuses(() => ds.saveFile('/', 'x.txt', new Uint8Array()), 'saveFile');
    ok('…and the message says how to fix it', /Switch to Live/.test(e.message));
    await refuses(() => ds.deleteFile('/', 'x.txt'), 'deleteFile');
    await refuses(() => ds.renameFile('/', 'a', 'b'), 'renameFile');
    await refuses(() => ds.createFolder('/x'), 'createFolder');
    ok('EPINNED is distinct from EREADONLY (different problem, different fix)', e.code !== 'EREADONLY');
}

console.log('\n[suite] surface parity — the polite lazy-load hooks are no-ops, not errors');
{
    const ds = await new PinnedVaultDataSource(vault, 'c_old').warm();
    let threw = false;
    try { await ds.loadAllSubTrees(); await ds.loadFolder('/docs'); await ds._ensureLoaded('/docs'); }
    catch (_) { threw = true; }
    ok('load hooks resolve quietly', !threw);
    ok('the vault name is still available', ds.getOrigName() === 'Demo Vault');
    ok('release metadata is carried for the HUD badge',
        new PinnedVaultDataSource(vault, 'c_old', { name: 'v1.2', label: 'Black Hat demo' }).release.label === 'Black Hat demo');
}

console.log('\n[suite] two pins of the same vault are independent');
{
    const oldDs  = await new PinnedVaultDataSource(vault, 'c_old').warm();
    const headDs = await new PinnedVaultDataSource(vault, 'c_head').warm();
    ok('the old pin still serves old bytes', /version one/.test(text(await oldDs.getFileBytes('index.html'))));
    ok('the head pin serves head bytes', /latest/.test(text(await headDs.getFileBytes('index.html'))));
    ok('their file lists differ', oldDs.getFileList().length !== headDs.getFileList().length);
    ok('warm() is idempotent', (await oldDs.warm()) === oldDs && oldDs.getFileList().length > 0);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
