/* Unit tests — kernel-bootstrap (Phase 2, fixes M4 / M5)
   Run: node tests/unit/vault_ui/loader/test__kernel_bootstrap.js

   Exercises `bootKernelOnPort` — the function the shipped KERNEL_BOOTSTRAP_JS now
   calls (build-kernel-shell-bundle.py). The previous bootstrap was completely
   untested (review M4) and hardcoded the dev endpoint (review M5). This test
   covers both: factories are injected so we don't need a real SGVault or network,
   but the bootstrap goes through the same SecureChannel handshake the browser
   does — no mocks, just synthetic implementations of the factories' return shape.

   Coverage:
     - happy-path boot completes (handshake, vault open, app.json read, handlers registered)
     - endpoint comes from secrets payload (M5)
     - replayed `secrets` is rejected (idempotence)
     - app.json drives the child policy (read-only manifest blocks writes the parent might allow)
     - missing vaultKey → EPROTO */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of [
    'app-permissions.js',
    'secure-channel-envelope.js',
    'secure-channel.js',
    'kernel-app-handlers.js',
    'kernel-bootstrap.js'
]) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { SecureChannel, bootKernelOnPort } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
async function tryCatch(fn) { try { await fn(); return null; } catch (err) { return err; } }

const PNG = Uint8Array.of(0x89, 0x50, 0x4E, 0x47);

// ─── Synthetic factories ───────────────────────────────────────────────────────

function makeSyntheticVault(files = {}) {
    const store = new Map(Object.entries(files).map(([k, v]) => [k, v instanceof Uint8Array ? v : new TextEncoder().encode(v)]));
    let pushCount = 0;
    return {
        _vaultId: 'synth-' + Math.random().toString(36).slice(2, 8),
        async getFileBytes(path) {
            const n = path.replace(/^\//, '');
            if (!store.has(n)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
            return store.get(n);
        },
        async push() { pushCount++; },
        _store: store,
        get pushCount() { return pushCount; }
    };
}

function makeDataSource(vault) {
    return {
        writable: true,
        async getFileBytes(p) { return vault.getFileBytes(p); },
        listFolder(f) {
            const out = []; const norm = (f || '').replace(/^\//, '');
            for (const [p, b] of vault._store) {
                if (norm === '' || p === norm || p.startsWith(norm + '/')) out.push({ path: p, size: b.length });
            }
            return out;
        },
        async saveFile(dir, name, data) {
            const full = (dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '');
            vault._store.set(full, data instanceof Uint8Array ? data : new Uint8Array(data || []));
        },
        async deleteFile(dir, name) {
            const full = (dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '');
            vault._store.delete(full);
        },
        async createFolder(/* path */) {}
    };
}

async function wirePair() {
    const cid = 'ch-boot-' + Math.random().toString(36).slice(2, 6);
    const { port1, port2 } = new MessageChannel();
    // Parent side first; child runs bootKernelOnPort against port2.
    // SecureChannel handshake is symmetric — both sides start at the same time.
    return { cid, parentPort: port1, childPort: port2 };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n[suite] kernel-bootstrap — happy path');
{
    const { cid, parentPort, childPort } = await wirePair();
    const vault = makeSyntheticVault({
        'notes.md': 'hello',
        'data/r.json': '[]',
        '.vault/app.json': JSON.stringify({ permissions: { fs: { read: true, write: ['data/'] } } })
    });
    let capturedEndpoint = null;
    let readyPayload = null;
    const bootP = bootKernelOnPort(childPort, {
        cid,
        vaultFactory: async (vaultKey, accessToken, endpoint) => {
            capturedEndpoint = endpoint;
            ok('vaultFactory receives vaultKey from secrets', vaultKey === 'vault-key-xyz');
            ok('vaultFactory receives accessToken from secrets', accessToken === 'tok-abc');
            return vault;
        },
        dataSourceFactory: (v /*, tok */) => makeDataSource(v),
        onReady: (p) => { readyPayload = p; }
    });
    const parent = await SecureChannel.create(parentPort, { sensitiveKey: true, cid });
    parent.on('ready', () => {});
    const ch = await bootP;

    // Deliver secrets — must arrive over the handshaken channel as a request so we
    // can detect a possible reply.  The bootstrap registers `secrets` as a handler.
    const res = await parent.request('secrets', {
        vaultKey:    'vault-key-xyz',
        accessToken: 'tok-abc',
        endpoint:    'https://my-private-endpoint.example.com'
    }, { sensitive: true });
    ok('secrets request completes (handler resolved)', res && typeof res.kernelId === 'string');
    ok('M5 endpoint from secrets payload used (not hardcoded)', capturedEndpoint === 'https://my-private-endpoint.example.com');
    ok('onReady callback fired with kernelId', readyPayload && typeof readyPayload.kernelId === 'string');

    // Now the handlers are registered — exercise one read across the channel.
    const buf = await parent.request('vfs.read', { path: 'notes.md' }, { sensitive: true });
    ok('vfs.read works after bootstrap completes (handlers wired)', new TextDecoder().decode(buf) === 'hello');

    // app.json drives child policy: write outside data/ → EPERM (proves manifest was honoured).
    const err = await tryCatch(() => parent.request('vfs.write', { path: 'top.bin', data: PNG }, { sensitive: true }));
    ok('child policy from .vault/app.json enforces fs.write scope (write outside data/ → EPERM)', err && err.code === 'EPERM');

    try { parent.close(); ch.close(); } catch (_) {}
}

console.log('\n[suite] kernel-bootstrap — falls back to legacy app.json location');
{
    const { cid, parentPort, childPort } = await wirePair();
    const vault = makeSyntheticVault({
        'app.json': JSON.stringify({ permissions: { fs: { read: true /* no write */ } } }),
        'doc.txt': 'd'
    });
    const bootP = bootKernelOnPort(childPort, {
        cid,
        vaultFactory: async () => vault,
        dataSourceFactory: (v) => makeDataSource(v),
    });
    const parent = await SecureChannel.create(parentPort, { sensitiveKey: true, cid });
    const ch = await bootP;
    await parent.request('secrets', { vaultKey: 'k', accessToken: 't' }, { sensitive: true });

    const buf = await parent.request('vfs.read', { path: 'doc.txt' }, { sensitive: true });
    ok('legacy app.json (root) read by bootstrap', new TextDecoder().decode(buf) === 'd');

    const err = await tryCatch(() => parent.request('vfs.write', { path: 'doc.txt', data: PNG }, { sensitive: true }));
    ok('legacy app.json policy applied (no fs.write grant → EPERM)', err && err.code === 'EPERM');

    try { parent.close(); ch.close(); } catch (_) {}
}

console.log('\n[suite] kernel-bootstrap — replayed secrets rejected (idempotence)');
{
    const { cid, parentPort, childPort } = await wirePair();
    const vault = makeSyntheticVault({
        '.vault/app.json': JSON.stringify({ permissions: { fs: { read: true } } })
    });
    let vaultOpenCount = 0;
    const bootP = bootKernelOnPort(childPort, {
        cid,
        vaultFactory: async () => { vaultOpenCount++; return vault; },
        dataSourceFactory: (v) => makeDataSource(v),
    });
    const parent = await SecureChannel.create(parentPort, { sensitiveKey: true, cid });
    const ch = await bootP;

    await parent.request('secrets', { vaultKey: 'k', accessToken: 't' }, { sensitive: true });
    const err = await tryCatch(() => parent.request('secrets', { vaultKey: 'k', accessToken: 't' }, { sensitive: true }));
    ok('second secrets request rejected with EPROTO', err && err.code === 'EPROTO');
    ok('vault opened only once', vaultOpenCount === 1);

    try { parent.close(); ch.close(); } catch (_) {}
}

console.log('\n[suite] kernel-bootstrap — missing vaultKey → EPROTO');
{
    const { cid, parentPort, childPort } = await wirePair();
    const bootP = bootKernelOnPort(childPort, {
        cid,
        vaultFactory: async () => { throw new Error('should not be called'); },
        dataSourceFactory: () => { throw new Error('should not be called'); },
    });
    const parent = await SecureChannel.create(parentPort, { sensitiveKey: true, cid });
    const ch = await bootP;
    const err = await tryCatch(() => parent.request('secrets', { /* no vaultKey */ }, { sensitive: true }));
    ok('missing vaultKey rejected with EPROTO', err && err.code === 'EPROTO');
    try { parent.close(); ch.close(); } catch (_) {}
}

console.log('\n[suite] kernel-bootstrap — vault factory failure → EUNREACH');
{
    const { cid, parentPort, childPort } = await wirePair();
    const bootP = bootKernelOnPort(childPort, {
        cid,
        vaultFactory: async () => { throw new Error('server unreachable'); },
        dataSourceFactory: () => { throw new Error('should not be called'); },
    });
    const parent = await SecureChannel.create(parentPort, { sensitiveKey: true, cid });
    const ch = await bootP;
    const err = await tryCatch(() => parent.request('secrets', { vaultKey: 'k', accessToken: 't' }, { sensitive: true }));
    ok('vault open failure surfaces as EUNREACH', err && err.code === 'EUNREACH');
    try { parent.close(); ch.close(); } catch (_) {}
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
