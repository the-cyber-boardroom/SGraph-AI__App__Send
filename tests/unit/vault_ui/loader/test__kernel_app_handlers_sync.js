/* Unit tests — kernel-app-handlers: sync discipline + real-data-source parity (07 Sep Phase 5)
   Run: node tests/unit/vault_ui/loader/test__kernel_app_handlers_sync.js

   The live counterpart (tests/integration/vault_ui/live/test__child_kernel_sync_live.js)
   drives these handlers against the REAL server. This file pins the paths that need a
   controlled failure to reach:
     • vfs.list on a data source shaped like the real VaultDataSource (getFileList, no
       listFolder) — the shipped kernel used to throw "ds.listFolder is not a function";
     • the child's settings record (.vault-settings.json) hidden + refused through a mount;
     • vfs.status / vfs.sync on a vault with no ref manager (synthetic) → syncable:false,
       plain push path unchanged;
     • CAS push: ECAS once → reconcile → retry ok; ECAS twice → EDIVERGED (no blind push);
     • refresh-before-read throttle (registerKernelVfsHandlers.REFRESH_MS).
   Synthetic in-memory vault/data source objects — the same style as test__kernel_app_handlers. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of ['app-permissions.js', 'kernel-app-handlers.js']) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { AppPermissions, registerKernelVfsHandlers } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? ' — ' + info : '')); } }
async function errOf(fn) { try { await fn(); return null; } catch (e) { return e; } }
const enc = (s) => new TextEncoder().encode(s);

function makeChannel() {
    const h = {};
    return { handle(n, f) { h[n] = f; }, request(n, p) { return h[n](p || {}); } };
}

// Shaped like the REAL VaultDataSource: getFileList() + getFileBytes(); NO listFolder.
function makeRealShapedDs(files, { writable = true } = {}) {
    const store = new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]));
    return {
        writable,
        getFileList() {
            const out = [], dirs = new Set();
            for (const p of store.keys()) {
                const parts = p.split('/');
                for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/');
            }
            for (const d of dirs) out.push({ path: d, name: d.split('/').filter(Boolean).pop(), dir: true, size: 0 });
            for (const [p, b] of store) out.push({ path: p, name: p.split('/').pop(), dir: false, size: b.length });
            return out;
        },
        async getFileBytes(path) {
            const n = path.replace(/^\//, '');
            if (!store.has(n)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
            return store.get(n);
        },
        async saveFile(dir, name, data) { store.set((dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, ''), data); },
        async deleteFile(dir, name) { store.delete((dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '')); },
        async createFolder() {},
        _store: store
    };
}

const PERM_ALL = AppPermissions.parsePermissions({ permissions: { fs: { read: true, write: true, delete: true, mkdir: true } } });

console.log('\n[suite] vfs.list on a real-shaped data source (getFileList, no listFolder)');
{
    const ds = makeRealShapedDs({ '.vault-settings.json': '{}', '.vault/app.json': '{}', 'records/seed.json': '[]', 'report.json': '{}' });
    const ch = makeChannel();
    registerKernelVfsHandlers(ch, { dataSource: ds, perm: PERM_ALL, vault: { push: async () => {} } });
    const root = await ch.request('vfs.list', { path: '' });
    const paths = root.map(e => e.path).sort();
    ok('lists files and folders', paths.includes('records/seed.json') && paths.includes('report.json') && paths.includes('records/'), paths.join(','));
    ok('hides .vault/** (floor)', !paths.some(p => p.startsWith('.vault/')));
    ok('hides the child settings record', !paths.includes('.vault-settings.json'));
    const sub = await ch.request('vfs.list', { path: 'records' });
    ok('prefix listing (folder entry + its files, nothing outside)',
       sub.every(e => e.path === 'records/' || e.path.startsWith('records/')) && sub.some(e => e.path === 'records/seed.json'), JSON.stringify(sub));
    const eR = await errOf(() => ch.request('vfs.read', { path: '.vault-settings.json' }));
    ok('read of the settings record → EPROTECTED', eR && eR.code === 'EPROTECTED', eR && eR.code);
    const eW = await errOf(() => ch.request('vfs.write', { path: '/.vault-settings.json', data: enc('x') }));
    ok('write of the settings record → EPROTECTED', eW && eW.code === 'EPROTECTED', eW && eW.code);
}

console.log('\n[suite] synthetic vault (no ref manager): plain push, syncable:false');
{
    const ds = makeRealShapedDs({ 'a.txt': 'a' });
    let pushes = 0;
    const vault = { push: async () => { pushes++; } };
    const ch = makeChannel();
    registerKernelVfsHandlers(ch, { dataSource: ds, perm: PERM_ALL, vault });
    const w = await ch.request('vfs.write', { path: 'b.txt', data: enc('b') });
    ok('write ok via plain push', w.ok === true && pushes === 1);
    const st = await ch.request('vfs.status');
    ok('status syncable:false', st.syncable === false, JSON.stringify(st));
    const sy = await ch.request('vfs.sync');
    ok('sync changed:false', sy.changed === false && sy.syncable === false, JSON.stringify(sy));
}

// A syncable synthetic vault: enough of SGVault's surface for the CAS paths.
function makeSyncableVault({ ecasTimes = 0, serverHead = 'c1' } = {}) {
    const calls = { pushIfMatch: 0, merge: 0, readRef: 0, push: 0 };
    let remainingEcas = ecasTimes;
    const v = {
        writable: true,
        _refFileId: 'ref-named',
        _namedHeadId: 'c1',
        _headCommitId: 'c1',
        _refManager: {
            async readRef() { calls.readRef++; return serverHead; },
            lastRawRef() { return new Uint8Array([1]); }
        },
        async merge(their) { calls.merge++; v._namedHeadId = their; v._headCommitId = their; return { merged: true, fastForward: true, conflicts: [] }; },
        async pushIfMatch() {
            calls.pushIfMatch++;
            if (remainingEcas > 0) { remainingEcas--; const e = new Error('moved'); e.code = 'ECAS'; throw e; }
            v._namedHeadId = v._headCommitId;
        },
        async push() { calls.push++; },
        async getAheadCount() { return v._headCommitId === v._namedHeadId ? 0 : 1; },
        async getBehindCount() { return 0; },
        calls
    };
    return v;
}

console.log('\n[suite] CAS push: ECAS once → reconcile → retry ok');
{
    const ds = makeRealShapedDs({ 'a.txt': 'a' });
    const vault = makeSyncableVault({ ecasTimes: 1 });
    const ch = makeChannel();
    registerKernelVfsHandlers(ch, { dataSource: ds, perm: PERM_ALL, vault });
    const w = await ch.request('vfs.write', { path: 'b.txt', data: enc('b') });
    ok('write ok', w.ok === true);
    ok('pushIfMatch called twice (ECAS then ok)', vault.calls.pushIfMatch === 2, vault.calls.pushIfMatch);
    ok('never fell back to a blind push()', vault.calls.push === 0);
    const st = await ch.request('vfs.status');
    ok('status records the push', st.syncable === true && st.lastPush && st.state === 'clean', JSON.stringify(st));
}

console.log('\n[suite] CAS push: ECAS twice → EDIVERGED, no blind push');
{
    const ds = makeRealShapedDs({ 'a.txt': 'a' });
    const vault = makeSyncableVault({ ecasTimes: 5 });
    const ch = makeChannel();
    registerKernelVfsHandlers(ch, { dataSource: ds, perm: PERM_ALL, vault });
    const e = await errOf(() => ch.request('vfs.write', { path: 'b.txt', data: enc('b') }));
    ok('write → EDIVERGED', e && e.code === 'EDIVERGED', e && e.code);
    ok('exactly two CAS attempts', vault.calls.pushIfMatch === 2, vault.calls.pushIfMatch);
    ok('never fell back to a blind push()', vault.calls.push === 0);
    const st = await ch.request('vfs.status');
    ok('lastError records EDIVERGED', st.lastError && st.lastError.code === 'EDIVERGED', JSON.stringify(st.lastError));
}

console.log('\n[suite] refresh-before-read throttle');
{
    const ds = makeRealShapedDs({ 'a.txt': 'a' });
    const vault = makeSyncableVault();
    const ch = makeChannel();
    registerKernelVfsHandlers(ch, { dataSource: ds, perm: PERM_ALL, vault });
    registerKernelVfsHandlers.REFRESH_MS = 60_000;
    await ch.request('vfs.read', { path: 'a.txt' });
    await ch.request('vfs.read', { path: 'a.txt' });
    await ch.request('vfs.list', { path: '' });
    ok('one ref read inside the window', vault.calls.readRef === 1, vault.calls.readRef);
    registerKernelVfsHandlers.REFRESH_MS = 0;
    await ch.request('vfs.read', { path: 'a.txt' });
    await ch.request('vfs.read', { path: 'a.txt' });
    ok('REFRESH_MS=0 → a ref read per call', vault.calls.readRef === 3, vault.calls.readRef);
    registerKernelVfsHandlers.REFRESH_MS = undefined;
    const st = await ch.request('vfs.status');
    ok('status shape', ['syncable', 'writable', 'head', 'named', 'serverHead', 'ahead', 'behind', 'diverged', 'lastPush', 'lastMerge', 'lastError', 'state'].every(k => k in st), Object.keys(st).join(','));
}

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
