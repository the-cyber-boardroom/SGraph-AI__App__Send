/* Unit tests — kernel-app-handlers (Phase 2, fixes H1 / M1)
   Run: node tests/unit/vault_ui/loader/test__kernel_app_handlers.js

   Exercises the policy-enforcing vfs.* handlers that the shipped child kernel
   ACTUALLY registers (kernel-app-handlers.js). Until this test existed, the relay
   test suite asserted the property on a hand-rolled TestKernel — the shipped
   KERNEL_BOOTSTRAP_JS bypassed AppPermissions entirely (review H1) and silently
   swallowed push errors (review M1). The handlers under test live in production
   code (bundled by build-kernel-shell-bundle.py); failures here ARE shipped bugs.

   No mocks. Synthetic in-memory data source + a synthetic SGVault stub. Real
   AppPermissions, real SecureChannel pair, real MessageChannel. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of [
    'app-permissions.js',
    'secure-channel-envelope.js',
    'secure-channel.js',
    'kernel-app-handlers.js'
]) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { AppPermissions, SecureChannel, registerKernelVfsHandlers } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
async function tryCatch(fn) { try { await fn(); return null; } catch (err) { return err; } }
function bytesEqual(a, b) {
    if (!(a instanceof Uint8Array)) a = new Uint8Array(a || []);
    if (!(b instanceof Uint8Array)) b = new Uint8Array(b || []);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const PNG = Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);

// ─── Synthetic in-memory data source matching VaultDataSource's surface ────────

function makeDataSource({ writable = true, files = {}, onSave, onDelete } = {}) {
    const store = new Map(Object.entries(files).map(([k, v]) => [k, v instanceof Uint8Array ? v : new TextEncoder().encode(v)]));
    return {
        writable,
        async getFileBytes(path) {
            const norm = path.replace(/^\//, '');
            if (!store.has(norm)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
            return store.get(norm);
        },
        listFolder(folder) {
            const f = (folder || '').replace(/^\//, '');
            const out = [];
            for (const [p, b] of store) {
                if (f === '' || p === f || p.startsWith(f + '/')) {
                    out.push({ path: p, name: p.split('/').pop(), size: b.length });
                }
            }
            return out;
        },
        async saveFile(dir, name, data) {
            const full = (dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '');
            store.set(full, data instanceof Uint8Array ? data : new Uint8Array(data || []));
            if (onSave) onSave(full, data);
        },
        async deleteFile(dir, name) {
            const full = (dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '');
            store.delete(full);
            if (onDelete) onDelete(full);
        },
        async createFolder(/* path */) { /* noop for tests */ },
        _store: store
    };
}

// Synthetic SGVault — only push() is touched by the handlers. We can wire success/failure.
function makeVault({ pushBehaviour } = {}) {
    let pushCount = 0;
    return {
        push: async function () {
            pushCount++;
            if (pushBehaviour === 'throw') { throw new Error('upstream 503'); }
            if (typeof pushBehaviour === 'function') return pushBehaviour();
            return true;
        },
        get pushCount() { return pushCount; }
    };
}

// Wire two SecureChannels over a MessageChannel; register the handlers on the responder.
async function wire(ctx) {
    const cid = 'ch-app-handlers';
    const { port1, port2 } = new MessageChannel();
    const [aSide, bSide] = await Promise.all([
        SecureChannel.create(port1, { sensitiveKey: true, cid }),
        SecureChannel.accept(port2, { expectSensitive: true, cid })
    ]);
    registerKernelVfsHandlers(bSide, ctx);
    return { aSide, bSide, close: () => { try { aSide.close(); } catch (_) {} try { bSide.close(); } catch (_) {} } };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n[suite] kernel-app-handlers — happy paths');
{
    const ds = makeDataSource({ files: { 'notes.md': 'hello', 'p.png': PNG, 'data/r.json': '[]' } });
    const vault = makeVault();
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: true, write: ['data/'], 'delete': ['data/'], mkdir: ['data/'] } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault });
    try {
        const buf = await aSide.request('vfs.read', { path: 'notes.md' }, { sensitive: true });
        ok('vfs.read returns bytes byte-exact', new TextDecoder().decode(buf) === 'hello');

        const pn = await aSide.request('vfs.read', { path: 'p.png' }, { sensitive: true });
        ok('vfs.read PNG byte-exact (binary)', bytesEqual(pn, PNG));

        const ls = await aSide.request('vfs.list', { path: '' }, { sensitive: false });
        ok('vfs.list returns array', Array.isArray(ls) && ls.length >= 3);

        const w = await aSide.request('vfs.write', { path: 'data/new.bin', data: PNG }, { sensitive: true });
        ok('vfs.write returns ok + size', w && w.ok === true && w.size === PNG.length && w.path === 'data/new.bin');
        ok('vfs.write actually wrote bytes', bytesEqual(ds._store.get('data/new.bin'), PNG));
        ok('vfs.write triggered vault.push()', vault.pushCount === 1);

        const d = await aSide.request('vfs.delete', { path: 'data/r.json' }, { sensitive: false });
        ok('vfs.delete returns ok', d && d.ok === true);
        ok('vfs.delete actually removed', ds._store.has('data/r.json') === false);
        ok('vfs.delete triggered vault.push()', vault.pushCount === 2);
    } finally { close(); }
}

console.log('\n[suite] kernel-app-handlers — H1: two-sided authority gate');
{
    // Child has fs.read true, but no fs.write grant at all.
    const ds = makeDataSource({ files: { 'x.txt': 'x' } });
    const vault = makeVault();
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: true } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault });
    try {
        const err = await tryCatch(() => aSide.request('vfs.write', { path: 'x.txt', data: PNG }, { sensitive: true }));
        ok('H1 write with no fs.write grant → EPERM (child enforces its policy)', err && err.code === 'EPERM');
        ok('H1 failed write did NOT push', vault.pushCount === 0);
        ok('H1 failed write did NOT mutate store', new TextDecoder().decode(ds._store.get('x.txt')) === 'x');
    } finally { close(); }
}

console.log('\n[suite] kernel-app-handlers — H1: floor (.vault/**) is non-grantable');
{
    // Child explicitly grants fs.read true and fs.write to .vault/** — the floor must still deny.
    const ds = makeDataSource({ files: { '.vault/secret': 'k' } });
    const vault = makeVault();
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: ['.vault/'], write: ['.vault/'] } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault });
    try {
        const errR = await tryCatch(() => aSide.request('vfs.read',  { path: '.vault/secret' }, { sensitive: true }));
        ok('floor — read of .vault/** rejected with EPROTECTED', errR && errR.code === 'EPROTECTED');
        const errW = await tryCatch(() => aSide.request('vfs.write', { path: '.vault/secret', data: PNG }, { sensitive: true }));
        ok('floor — write to .vault/** rejected with EPROTECTED', errW && errW.code === 'EPROTECTED');
        ok('floor — no push fired on rejected ops', vault.pushCount === 0);
    } finally { close(); }
}

console.log('\n[suite] kernel-app-handlers — H1: write outside grant scope is EPERM');
{
    const ds = makeDataSource({ files: {} });
    const vault = makeVault();
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: true, write: ['data/'] } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault });
    try {
        const ok1 = await aSide.request('vfs.write', { path: 'data/x.bin', data: PNG }, { sensitive: true });
        const err = await tryCatch(() => aSide.request('vfs.write', { path: 'elsewhere/x.bin', data: PNG }, { sensitive: true }));
        ok('write inside grant succeeds; write outside scope → EPERM', ok1 && ok1.ok === true && err && err.code === 'EPERM');
    } finally { close(); }
}

console.log('\n[suite] kernel-app-handlers — read-only vault gate (EREADONLY)');
{
    const ds = makeDataSource({ writable: false, files: { 'data/x': 'x' } });
    const vault = makeVault();
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: true, write: ['data/'], 'delete': ['data/'], mkdir: ['data/'] } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault });
    try {
        const e1 = await tryCatch(() => aSide.request('vfs.write',  { path: 'data/x.bin', data: PNG }));
        const e2 = await tryCatch(() => aSide.request('vfs.delete', { path: 'data/x' }));
        const e3 = await tryCatch(() => aSide.request('vfs.mkdir',  { path: 'data/sub' }));
        ok('read-only vault rejects write with EREADONLY',  e1 && e1.code === 'EREADONLY');
        ok('read-only vault rejects delete with EREADONLY', e2 && e2.code === 'EREADONLY');
        ok('read-only vault rejects mkdir with EREADONLY',  e3 && e3.code === 'EREADONLY');
    } finally { close(); }
}

console.log('\n[suite] kernel-app-handlers — M1: push errors surface as EUNREACH');
{
    const ds = makeDataSource({ files: {} });
    const vault = makeVault({ pushBehaviour: 'throw' });
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: true, write: ['data/'] } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault });
    try {
        const err = await tryCatch(() => aSide.request('vfs.write', { path: 'data/lost.bin', data: PNG }, { sensitive: true }));
        ok('M1 push failure surfaces as EUNREACH (not silent success)', err && err.code === 'EUNREACH');
        ok('M1 push was attempted (pushCount > 0)', vault.pushCount === 1);
        // The bytes DID land in the working tree, but the caller knows they failed to persist.
        ok('M1 working tree mutation is observable for retry', ds._store.has('data/lost.bin'));
    } finally { close(); }
}

console.log('\n[suite] kernel-app-handlers — onUpdated fires only on success');
{
    let updates = [];
    const ds = makeDataSource({ files: { 'x': 'x' } });
    const vault = makeVault();
    const perm  = AppPermissions.parsePermissions({ permissions: { fs: { read: true, write: ['data/'], 'delete': ['data/'] } } });
    const { aSide, close } = await wire({ dataSource: ds, perm, vault, onUpdated: (p) => updates.push(p) });
    try {
        await aSide.request('vfs.write', { path: 'data/n.bin', data: PNG }, { sensitive: true });
        ok('onUpdated fires after successful write', updates[updates.length - 1] === 'data/n.bin');
        // Floor rejection should NOT fire onUpdated.
        await tryCatch(() => aSide.request('vfs.write', { path: '.vault/whatever', data: PNG }, { sensitive: true }));
        ok('onUpdated does NOT fire on floor-rejected write', updates.indexOf('.vault/whatever') === -1);
    } finally { close(); }
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
