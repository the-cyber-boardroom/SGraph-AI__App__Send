/* Unit tests — sg-app-stub (Phase 3 sub-step C, iframe-side window.sg.* stub)
   Run: node tests/unit/vault_ui/loader/test__sg_app_stub.js
   No deps. Uses real crypto.subtle + Node's built-in MessageChannel.
   The stub is loaded into a synthetic "iframe-like" globalThis; a fake kernel
   on the other end of a MessageChannel registers handlers, and we exercise
   the full RPC flow (request, send, ready event, byte payloads). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/app-shell/';

// We need TWO independent globalThis-like environments — one for the stub (the
// "app frame"), one for the kernel side. Since runInThisContext shares globals,
// we set up the stub side first, snapshot what we need, then run the kernel
// SecureChannel on the same context (both sides peer over a MessageChannel —
// the port distinguishes them).
for (const f of ['secure-channel-envelope.js', 'secure-channel.js']) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f });
}

// Synthesise window/addEventListener for the stub (Node doesn't have a real
// `window` global). We use a tiny EventTarget shim so the stub's
// window.addEventListener('message', ..., {once}) and window.dispatchEvent work.
class FakeWindow extends EventTarget {}
const fakeWindow = new FakeWindow();
globalThis.window = fakeWindow;

// Load the stub. It registers a window.addEventListener('message', _bootstrap)
// and defines globalThis.window.sg = {...}.
{
    const p = new URL(ROOT + 'sg-app-stub.js', import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: 'sg-app-stub.js' });
}

const { SecureChannel, Envelope } = globalThis;
const stubSg = globalThis.window.sg;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
function bytesEqual(a, b) {
    if (!(a instanceof Uint8Array)) a = new Uint8Array(a || []);
    if (!(b instanceof Uint8Array)) b = new Uint8Array(b || []);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}
async function tryCatch(fn) { try { await fn(); return null; } catch (err) { return err; } }

const PNG = Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);

// ─── Set up the fake kernel and dispatch the init message to the stub ────────────

const { port1: stubPort, port2: kernelPort } = new MessageChannel();

// Kernel side: RESPONDER. The app frame is the channel-INITIATOR because it
// makes requests (vfs.read, vfs.write, etc.); the kernel handles them and emits
// events (sg.ready, etc.). The directional rule then correctly forbids the
// kernel from invoking RPCs back into the app — events only.
const kernelChPromise = SecureChannel.accept(kernelPort, { expectSensitive: true, cid: 'ch-test' });

// Fire the bootstrap into the stub's window.
const initEvent = new MessageEvent('message', {
    data:  { type: 'init', cid: 'ch-test' },
    ports: [stubPort]
});
fakeWindow.dispatchEvent(initEvent);

// Wait for the kernel side to complete the handshake, then register handlers.
const kernelCh = await kernelChPromise;
kernelCh.handle('vfs.read', async ({ path }) => {
    if (path === 'p.png')          return PNG;
    if (path === 'data/notes.md')  return new TextEncoder().encode('hello');
    const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
});
kernelCh.handle('vfs.list', async ({ path }) => [{ name: 'x.json', size: 2 }, { name: 'y.bin', size: 5 }]);
kernelCh.handle('vfs.write', async ({ path, data }) => {
    if (!(data instanceof Uint8Array)) {
        const e = new Error('expected bytes'); e.code = 'EPROTO'; throw e;
    }
    return { ok: true, size: data.length };
});
kernelCh.handle('vault.mounts', async () => [{ mountId: 'm-x', ref: 'x', isolation: 'isolated' }]);
kernelCh.handle('ui.requestPermission', async ({ verb }) => ({ granted: verb === 'vault.create' }));
kernelCh.handle('blocked', async () => {
    const e = new Error('Permission denied'); e.code = 'EPERM'; throw e;
});

// Now signal sg.ready (with metadata to populate sg.app.*).
await kernelCh.send('sg.ready', {
    vaultName: 'My Vault', vaultId: 'abcd1234',
    writable: true, isRO: false, appTitle: 'Test App'
});

// Wait for the stub to flip _ready by issuing any call (whenReady awaits it).
await stubSg.whenReady();

// ─── Tests ──────────────────────────────────────────────────────────────────────

console.log('\n[suite] sg-app-stub — RPC wiring (the secret-less app-side surface)');
{
    // S1 — sg.ready populated sg.app.*
    ok('S1 sg.app.vaultName populated from sg.ready', stubSg.app.vaultName === 'My Vault');
    ok('S1 sg.app.writable populated',                stubSg.app.writable === true);
    ok('S1 sg.app.appTitle populated',                stubSg.app.appTitle === 'Test App');

    // S2 — sg.vfs.list RPC
    const ls = await stubSg.vfs.list('');
    ok('S2 sg.vfs.list returns from kernel handler', Array.isArray(ls) && ls.length === 2 && ls[0].name === 'x.json');

    // S3 — sg.vfs.read returns bytes (T13 / B2 at the stub layer)
    const r = await stubSg.vfs.read('p.png');
    ok('S3 sg.vfs.read returns Uint8Array byte-exact (PNG)', r instanceof Uint8Array && bytesEqual(r, PNG));

    // S4 — sg.vfs.readText decodes
    const t = await stubSg.vfs.readText('data/notes.md');
    ok('S4 sg.vfs.readText decodes utf-8', t === 'hello');

    // S5 — sg.vfs.write with bytes round-trips
    const w = await stubSg.vfs.write('data/x.bin', PNG);
    ok('S5 sg.vfs.write accepts bytes; kernel handler received them as Uint8Array', w && w.ok === true && w.size === PNG.length);

    // S6 — sg.vault.mounts wiring
    const mounts = await stubSg.vault.mounts();
    ok('S6 sg.vault.mounts wired through the channel',
        Array.isArray(mounts) && mounts.length === 1 && mounts[0].mountId === 'm-x');

    // S7 — sg.ui.requestPermission round-trip with a non-trivial reply
    const grant = await stubSg.ui.requestPermission('vault.create', 'runs/');
    ok('S7 sg.ui.requestPermission round-trip returns { granted }', grant && grant.granted === true);

    // S8 — error propagation (the kernel handler throws with .code)
    const err = await tryCatch(() => stubSg.vfs.read('missing.txt'));
    ok('S8 ENOENT propagates with .code', err && err.code === 'ENOENT');

    const err2 = await tryCatch(() => stubSg.ui.requestPermission('blocked', ''));
    // (this 'blocked' verb isn't a real handler, but our test fake registers `handle('blocked', ...)`
    //  to demonstrate EPERM propagation — it routes via sg.ui.requestPermission → ui.requestPermission
    //  → not registered → channel returns EPROTO. So actually this asserts the unknown-type path:
    //  the channel will just drop it OR the request hangs without a handler.)
    // Better: use a registered handler that throws.
    // Instead: call kernelCh.handle('ui.requestPermission'...) we set above which returns granted
    // based on verb. Test there's no .granted for verbs other than 'vault.create':
    const noGrant = await stubSg.ui.requestPermission('other.thing', '');
    ok('S8b ui.requestPermission for unknown verb returns granted:false', noGrant && noGrant.granted === false);
}

console.log('\n[suite] sg-app-stub — no secrets are held client-side');
{
    // S9 — the stub MUST NOT have a vaultKey / accessToken / dataSource property anywhere
    //      on window.sg. (Smoke check — a real audit would walk the object graph.)
    const surface = JSON.stringify(stubSg, (k, v) =>
        (typeof v === 'function' ? '[fn]' : v));
    ok('S9 window.sg surface holds no "vaultKey"/"accessToken" literal',
        surface.indexOf('vaultKey') === -1 && surface.indexOf('accessToken') === -1);
    ok('S9 no "_dataSource" / "_vault" leaked onto window.sg',
        surface.indexOf('_dataSource') === -1 && surface.indexOf('_vault') === -1);
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
