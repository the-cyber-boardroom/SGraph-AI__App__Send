/* Integration tests — kernel relay (KernelMounts + KernelBroker + SecureChannel)
   Phase 2's load-bearing test: cross-vault read/write across the relay edge.
   Run: node tests/unit/vault_ui/loader/test__kernel_relay.js

   Uses a synthetic in-memory data source (real bytes; no SGVault). The full
   SGVault-backed end-to-end is the Phase 2 §7 browser check; this test pins
   the relay machinery itself + the adversarial properties T3/T4/T7/T8/T9/T11/T13. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/app-shell/';
for (const f of [
    'app-permissions.js',
    'secure-channel-envelope.js',
    'secure-channel.js',
    'kernel-mounts.js',
    'kernel-broker.js'
]) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { AppPermissions, SecureChannel, Envelope, KernelMounts, KernelBroker } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ '+name); } else { fail++; console.log('  ✗ '+name+(info?' — '+info:'')); } }
async function tryCatch(fn) { try { await fn(); return null; } catch (err) { return err; } }
function bytesEqual(a, b) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const PNG = Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);

// ─── Synthetic kernel (just enough to exercise the relay) ──────────────────────

class TestKernel {
    constructor({ id, files, perm, ui }) {
        this.id        = id;
        this._files    = new Map(Object.entries(files || {}));     // path → Uint8Array | string
        this._perm     = AppPermissions.parsePermissions(perm || null);
        this._mounts   = new KernelMounts();
        this._broker   = new KernelBroker({ kernelId: id, ui });
        this._channels = new Map();   // (mountId|appLabel) → SecureChannel
        // Per-request credential demo: pretend any 'write-token-A' enables one write.
        this._oneShotToken = null;
    }

    bytesFor(path) {
        const v = this._files.get(path);
        if (v == null) return null;
        return (v instanceof Uint8Array) ? v : new TextEncoder().encode(v);
    }

    // The handler invoked when a parent relays a vfs.* request to us.
    async serveRelayed(op, { path, data, credential }) {
        // Per-request elevation demo: if a credential is presented, allow ONE write.
        if (credential && credential.token === 'write-token-A') this._oneShotToken = true;

        if (op === 'read') {
            if (AppPermissions.isFloor('read', path) || !AppPermissions.can(this._perm, 'fs.read', path)) {
                const e = new Error('EPERM'); e.code = 'EPERM'; throw e;
            }
            const b = this.bytesFor(path);
            if (b == null) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
            return b;
        }
        if (op === 'list') {
            if (AppPermissions.isFloor('read', path) || !AppPermissions.can(this._perm, 'fs.read', path)) {
                const e = new Error('EPERM'); e.code = 'EPERM'; throw e;
            }
            // path:'' (root) or a prefix
            const norm = AppPermissions.normalizePath(path || '');
            const out  = [];
            for (const p of this._files.keys()) {
                if (norm === '' || p === norm || p.startsWith(norm + '/')) out.push({ path: p });
            }
            return out;
        }
        if (op === 'write') {
            const allowedByCred   = (this._oneShotToken === true);
            const allowedByPolicy = !AppPermissions.isFloor('write', path) && AppPermissions.can(this._perm, 'fs.write', path);
            if (!allowedByCred && !allowedByPolicy) {
                const e = new Error('EPERM'); e.code = 'EPERM'; throw e;
            }
            // consume one-shot
            this._oneShotToken = null;
            this._files.set(path, data instanceof Uint8Array ? data : new Uint8Array(data || []));
            return { ok: true, size: data ? data.length : 0 };
        }
        const e = new Error('EPERM'); e.code = 'EPERM'; throw e;
    }

    // The handler invoked locally OR by relaying through a mount.
    async handleVfs(op, { path, data, credential }) {
        const hit = this._mounts.resolve(path);
        if (!hit) {
            return this.serveRelayed(op, { path, data, credential });   // local op
        }
        const credentialClass = credential ? 'perRequest-rw' : 'standing';
        const { decision, entryId } = await this._broker.mediate(op, hit.mount.mountId, hit.rest, credentialClass);
        if (decision !== 'allow') {
            this._broker.finalize(entryId, 'ECONSENT');
            const e = new Error('ECONSENT'); e.code = 'ECONSENT'; throw e;
        }
        try {
            const res = await hit.mount.channel.request('vfs.' + op, { path: hit.rest, data, credential }, { sensitive: !!data || op === 'read' });
            this._broker.finalize(entryId, 'ok');
            return res;
        } catch (err) {
            this._broker.finalize(entryId, err.code || 'EPROTO');
            throw err;
        }
    }
}

// Wire kernel A to kernel B via a MessageChannel; A has the mount, B handles relayed requests.
// Tests auto-allow the broker (the default fs.write policy is 'ask' which is correct for prod
// but would block every test without an HUD). Setting per-mount policies to 'auto' keeps the
// test focused on the relay path; a separate test could exercise 'ask' explicitly.
async function wireMount({ parent, child, mountId, prefix, ref, sensitive = true, autoAllow = true }) {
    const { port1, port2 } = new MessageChannel();
    const [aSide, bSide] = await Promise.all([
        SecureChannel.create(port1, { sensitiveKey: sensitive, cid: 'ch-' + ref }),
        SecureChannel.accept(port2, { expectSensitive: sensitive,  cid: 'ch-' + ref })
    ]);
    bSide.handle('vfs.read',   async (p) => child.serveRelayed('read',  p));
    bSide.handle('vfs.list',   async (p) => child.serveRelayed('list',  p));
    bSide.handle('vfs.write',  async (p) => child.serveRelayed('write', p));
    parent._mounts.add({ mountId, prefix, ref, channel: aSide });
    if (autoAllow) {
        for (const cap of ['fs.read', 'fs.write', 'fs.delete', 'fs.mkdir', 'fs.move']) {
            parent._broker.setPolicy(mountId, cap, 'auto');
        }
    }
    return { aSide, bSide };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

console.log('\n[suite] kernel relay — happy path (R1 / R2 / R3 / R5)');
{
    const A = new TestKernel({ id: 'A', perm: null });
    const B = new TestKernel({
        id: 'B',
        files: { 'notes.md': 'hello from B', 'p.png': PNG, 'data/reviews.json': '[]' },
        perm: { permissions: { fs: { read: true, write: ['data/'] } } }
    });
    await wireMount({ parent: A, child: B, mountId: 'm-b', prefix: 'mounts/b/', ref: 'b' });

    // R1 — text read across the relay
    const r1 = await A.handleVfs('read', { path: 'mounts/b/notes.md' });
    ok('R1 text read across relay (utf8)', new TextDecoder().decode(r1) === 'hello from B');

    // R2 — BINARY read across the relay (review B2 / T13)
    const r2 = await A.handleVfs('read', { path: 'mounts/b/p.png' });
    ok('R2 PNG bytes read across relay byte-exact (T13 / B2)', bytesEqual(r2, PNG));

    // R3 — BINARY write across the relay (review B2 / T13)
    const w  = await A.handleVfs('write', { path: 'mounts/b/data/blob.bin', data: PNG });
    const rb = await A.handleVfs('read',  { path: 'mounts/b/data/blob.bin' });
    ok('R3 binary write across relay round-trips byte-exact', w && w.ok === true && bytesEqual(rb, PNG));

    // R5 — mount-root list (review N1: rest === '')
    const ls = await A.handleVfs('list', { path: 'mounts/b' });
    ok('R5 mount-root list (rest==="") returns child root entries', Array.isArray(ls) && ls.length >= 3);

    // Broker log: should have entries for each relay invocation.
    const log = A._broker.log({ mountId: 'm-b' });
    ok('R12 broker entries recorded per relay invocation', log.length >= 4 && log.every(e => e.result !== 'pending'));
}

console.log('\n[suite] kernel relay — capability gates (T7 / T8)');
{
    // T7: B's policy lacks fs.write → relay write returns EPERM.
    const A = new TestKernel({ id: 'A' });
    const B = new TestKernel({
        id: 'B',
        files: {},
        perm: { permissions: { fs: { read: true /* no write grant */ } } }
    });
    await wireMount({ parent: A, child: B, mountId: 'm-b', prefix: 'mounts/b/', ref: 'b' });

    const err7 = await tryCatch(() => A.handleVfs('write', { path: 'mounts/b/data/x', data: PNG }));
    ok('T7 write across relay with no fs.write grant on child → EPERM', err7 && err7.code === 'EPERM');

    // T8: B's policy grants fs.write only for data/ → write to elsewhere is EPERM.
    const A2 = new TestKernel({ id: 'A' });
    const B2 = new TestKernel({
        id: 'B',
        files: {},
        perm: { permissions: { fs: { read: true, write: ['data/'] } } }
    });
    await wireMount({ parent: A2, child: B2, mountId: 'm-b', prefix: 'mounts/b/', ref: 'b' });
    const okWrite = await A2.handleVfs('write', { path: 'mounts/b/data/x', data: PNG });
    const err8    = await tryCatch(() => A2.handleVfs('write', { path: 'mounts/b/elsewhere/x', data: PNG }));
    ok('T8 child policy refuses write outside scope (two-sided gate)',
        okWrite && okWrite.ok === true && err8 && err8.code === 'EPERM');
}

console.log('\n[suite] kernel relay — per-request elevation (T9)');
{
    const A = new TestKernel({ id: 'A' });
    const B = new TestKernel({
        id: 'B',
        files: {},
        perm: { permissions: { fs: { read: true /* no standing write */ } } }
    });
    await wireMount({ parent: A, child: B, mountId: 'm-b', prefix: 'mounts/b/', ref: 'b' });

    // First write WITH credential → ok (one-shot)
    const w1 = await A.handleVfs('write', {
        path: 'mounts/b/data/once.bin', data: PNG, credential: { token: 'write-token-A' }
    });
    ok('T9.a first write with inline credential → ok', w1 && w1.ok === true);

    // Second write without credential → EPERM (token not retained)
    const err = await tryCatch(() => A.handleVfs('write', { path: 'mounts/b/data/twice.bin', data: PNG }));
    ok('T9.b second write without credential → EPERM (token not retained)', err && err.code === 'EPERM');
}

console.log('\n[suite] kernel relay — directional rule (T3 / review B1)');
{
    const A = new TestKernel({ id: 'A' });
    const B = new TestKernel({ id: 'B', files: {}, perm: null });
    const { aSide, bSide } = await wireMount({ parent: A, child: B, mountId: 'm-b', prefix: 'mounts/b/', ref: 'b' });

    // T3.a — responder cannot initiate a request
    const err = await tryCatch(() => bSide.request('echo', {}));
    ok('T3.a responder.request throws directional error', err && /responder cannot initiate/.test(err.message));

    // T3.b — responder.send('ready') reaches initiator.on('ready')
    let saw = null;
    aSide.on('ready', (p) => { saw = p; });
    await bSide.send('ready', { kernelId: 'B' });
    await new Promise(r => setTimeout(r, 20));
    ok('T3.b responder.send(event) reaches initiator (review B1 — Phase 2 spawn handshake path)', saw && saw.kernelId === 'B');
}

console.log('\n[suite] kernel relay — non-transitive reach (T4)');
{
    // A ↔ B and B ↔ C. A has no mount for C; A has no port to C.
    const A = new TestKernel({ id: 'A' });
    const B = new TestKernel({ id: 'B', files: { 'x': 'B-local' }, perm: { permissions: { fs: { read: true } } } });
    const C = new TestKernel({ id: 'C', files: { 'cx': 'C-local' }, perm: { permissions: { fs: { read: true } } } });
    await wireMount({ parent: A, child: B, mountId: 'm-b', prefix: 'mounts/b/', ref: 'b' });
    await wireMount({ parent: B, child: C, mountId: 'm-c', prefix: 'mounts/c/', ref: 'c' });

    // A asking for 'mounts/c/cx' is a LOCAL path on A (no mount) → falls through to A's serve.
    const err = await tryCatch(() => A.handleVfs('read', { path: 'mounts/c/cx' }));
    ok('T4 A has no implicit reach into C (mounts/c/cx is local-not-found / EPERM on A)',
        err && (err.code === 'EPERM' || err.code === 'ENOENT'));
    ok('T4 A.broker has no entry for C', A._broker.log({ mountId: 'm-c' }).length === 0);

    // A can reach C only by going through B (via 'mounts/b/mounts/c/...' if B exposed it).
    // (B's relay machinery would forward into its mount of C — that's the recursive case.)
    // For the no-transitive proof, just confirm A doesn't have a channel to C.
    ok('T4 A has no channel mapped to C', A._mounts.get('m-c') === null);
}

console.log('\n[suite] kernel relay — broker mediation log shape');
{
    const A = new TestKernel({ id: 'A' });
    const B = new TestKernel({ id: 'B', files: { 'notes.md': 'x' }, perm: { permissions: { fs: { read: true, write: ['data/'] } } } });
    await wireMount({ parent: A, child: B, mountId: 'm-acme', prefix: 'mounts/acme/', ref: 'acme' });

    await A.handleVfs('read',  { path: 'mounts/acme/notes.md' });
    await A.handleVfs('write', { path: 'mounts/acme/data/r.json', data: new TextEncoder().encode('{}') });
    const log = A._broker.log({ mountId: 'm-acme' });
    ok('R12 broker log includes op + path + result for each relay',
        log.some(e => e.op === 'read'  && e.path === 'notes.md'         && e.result === 'ok')
     && log.some(e => e.op === 'write' && e.path === 'data/r.json'      && e.result === 'ok'));
    ok('R12 broker entries carry edge label A▶m-acme',
        log.every(e => e.edge === 'A▶m-acme'));
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);    // open MessagePorts keep the loop alive — explicit exit
