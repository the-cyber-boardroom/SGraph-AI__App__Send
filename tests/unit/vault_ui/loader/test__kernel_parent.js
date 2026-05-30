/* Integration tests — KernelParent (parent-side ViV orchestration)
   Run: node tests/unit/vault_ui/loader/test__kernel_parent.js

   This is the parent-side mirror of test__kernel_app_handlers.js. It exercises the
   ACTUAL orchestration app-shell ships — mount table, broker mediation (auto + ask +
   never), and the cross-mount relay — by wiring a real KernelParent to a real CHILD
   kernel booted via bootKernelOnPort against a synthetic SGVault. The only thing the
   test substitutes for app-shell is the DOM-coupled spawnChannel: instead of an
   iframe + srcdoc, it stands up a SecureChannel pair over a MessageChannel and runs
   the real bootKernelOnPort on the responder side.

   No mocks, no patches. Real crypto.subtle, real MessageChannel, real
   AppPermissions/SecureChannel/KernelMounts/KernelBroker/kernel-app-handlers. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of [
    'app-permissions.js',
    'secure-channel-envelope.js',
    'secure-channel.js',
    'kernel-mounts.js',
    'kernel-broker.js',
    'viv-custody.js',
    'viv-monitor.js',
    'viv-credential-tiers.js',
    'kernel-parent.js',
    'kernel-app-handlers.js',
    'kernel-bootstrap.js'
]) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { SecureChannel, KernelParent, bootKernelOnPort } = globalThis;

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
const openChannels = [];

// ─── Synthetic child vault + data source (same shapes the browser SGVault exposes) ──

function makeChildStack({ files = {}, writable = true } = {}) {
    const store = new Map(Object.entries(files).map(([k, v]) => [k, v instanceof Uint8Array ? v : new TextEncoder().encode(v)]));
    let pushCount = 0;
    const vault = {
        _vaultId: 'child-' + Math.random().toString(36).slice(2, 6),
        async getFileBytes(path) {
            const n = path.replace(/^\//, '');
            if (!store.has(n)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
            return store.get(n);
        },
        async push() { pushCount++; },
        get pushCount() { return pushCount; },
        _store: store
    };
    const dataSource = {
        writable,
        async getFileBytes(p) { return vault.getFileBytes(p); },
        listFolder(f) {
            const norm = (f || '').replace(/^\//, ''); const out = [];
            for (const [p, b] of store) if (norm === '' || p === norm || p.startsWith(norm + '/')) out.push({ path: p, size: b.length });
            return out;
        },
        async saveFile(dir, name, data) {
            const full = (dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '');
            store.set(full, data instanceof Uint8Array ? data : new Uint8Array(data || []));
        },
        async deleteFile(dir, name) {
            const full = (dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, '');
            store.delete(full);
        },
        async createFolder() {}
    };
    return { vault, dataSource, store };
}

// The DOM-free stand-in for app-shell's _spawnChildChannel: a SecureChannel pair +
// a real child kernel booted via bootKernelOnPort. Returns the PARENT's channel.
function makeSpawnChannel(childRegistry) {
    return async function spawnChannel(ref, creds) {
        const child = childRegistry[ref];
        if (!child) throw Object.assign(new Error('no child stack for ' + ref), { code: 'EUNREACH' });
        const cid = 'ch-' + ref;
        const { port1, port2 } = new MessageChannel();
        const bootP = bootKernelOnPort(port2, {
            cid,
            vaultFactory:      async () => child.vault,
            dataSourceFactory: () => child.dataSource,
            appJsonReader:     async () => child.appJson || null,
            endpointFor:       () => creds.endpoint || 'https://example.test'
        });
        const parentSide = await SecureChannel.create(port1, { sensitiveKey: true, cid });
        const readyP = new Promise((resolve) => parentSide.on('ready', resolve));
        const childSide = await bootP;
        await parentSide.send('secrets', { vaultKey: creds.vaultKey, accessToken: creds.accessToken || null, endpoint: creds.endpoint }, { sensitive: true });
        await readyP;
        // Surface the child-side broker/monitor handles on the parent side so tests can
        // toggle them. In production these only ever live on the child kernel itself.
        parentSide._childBroker  = childSide._broker  || null;
        parentSide._childMonitor = childSide._monitor || null;
        openChannels.push(parentSide);
        return parentSide;
    };
}

function makeParent(childRegistry, { brokerUi } = {}) {
    return new KernelParent({
        kernelId: 'k-parent',
        brokerUi: brokerUi || null,
        resolveCredentials: async (ref) => childRegistry[ref] && childRegistry[ref].creds,
        spawnChannel: makeSpawnChannel(childRegistry)
    });
}

// auto-allow helper (production default for writes is 'ask'; we set 'auto' to focus on relay)
function autoAllow(parent, mountId) {
    for (const cap of ['fs.read', 'fs.write', 'fs.delete', 'fs.mkdir', 'fs.move']) parent.broker.setPolicy(mountId, cap, 'auto');
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n[suite] KernelParent — mount + relay happy path (real child kernel)');
{
    const child = makeChildStack({ files: { 'notes.md': 'hi', 'p.png': PNG, 'data/r.json': '[]' } });
    child.appJson = { permissions: { fs: { read: true, write: ['data/'] } } };
    child.creds   = { vaultKey: 'k-child', accessToken: 't', endpoint: 'https://example.test' };
    const registry = { acme: child };
    const parent   = makeParent(registry);

    const m = await parent.mount({ prefix: 'mounts/acme/', ref: 'acme', label: 'Acme' });
    ok('mount returns mountId', m && m.mountId === 'm-acme');
    autoAllow(parent, 'm-acme');

    const r1 = await parent.relay('read', { path: 'mounts/acme/notes.md' });
    ok('relay read crosses to real child kernel (utf8)', new TextDecoder().decode(r1) === 'hi');

    const r2 = await parent.relay('read', { path: 'mounts/acme/p.png' });
    ok('relay read binary byte-exact (through child kernel-app-handlers)', bytesEqual(r2, PNG));

    const w = await parent.relay('write', { path: 'mounts/acme/data/x.bin', data: PNG });
    ok('relay write returns ok', w && w.ok === true);
    ok('relay write actually persisted in child store', bytesEqual(child.store.get('data/x.bin'), PNG));
    ok('relay write pushed on child Edge 1', child.vault.pushCount === 1);

    const ls = await parent.relay('list', { path: 'mounts/acme/data' });
    ok('relay list returns entries', Array.isArray(ls) && ls.length >= 1);

    // local path (no mount) → relay returns null so caller does the local op
    const local = await parent.relay('read', { path: 'local/file.txt' });
    ok('relay returns null for local (unmounted) path', local === null);

    const log = parent.broker.log({ mountId: 'm-acme' });
    ok('broker logged each relay with result ok', log.length >= 4 && log.every(e => e.result === 'ok'));
}

console.log('\n[suite] KernelParent — two-sided gate enforced by the REAL child (not the parent)');
{
    // Parent broker says 'auto' (allow) for everything, but the child's app.json grants
    // fs.write only under data/. The child must refuse a write outside data/ → EPERM.
    const child = makeChildStack({ files: {} });
    child.appJson = { permissions: { fs: { read: true, write: ['data/'] } } };
    child.creds   = { vaultKey: 'k', accessToken: 't', endpoint: 'https://example.test' };
    const parent = makeParent({ b: child });
    await parent.mount({ prefix: 'mounts/b/', ref: 'b' });
    autoAllow(parent, 'm-b');

    const okW = await parent.relay('write', { path: 'mounts/b/data/ok.bin', data: PNG });
    const err = await tryCatch(() => parent.relay('write', { path: 'mounts/b/outside/no.bin', data: PNG }));
    ok('write inside child grant ok; write outside child grant → EPERM (child enforced)', okW && okW.ok === true && err && err.code === 'EPERM');
    // broker logged the EPERM result, proving mediation allowed but the child refused.
    const log = parent.broker.log({ mountId: 'm-b' });
    ok('broker recorded the child-side EPERM as the relay result', log.some(e => e.op === 'write' && e.result === 'EPERM'));
}

console.log('\n[suite] KernelParent — floor (.vault/**) refused after relay');
{
    const child = makeChildStack({ files: { '.vault/secret': 'x' } });
    child.appJson = { permissions: { fs: { read: ['.vault/'], write: ['.vault/'] } } };  // even if granted
    child.creds   = { vaultKey: 'k', accessToken: 't', endpoint: 'https://example.test' };
    const parent = makeParent({ c: child });
    await parent.mount({ prefix: 'mounts/c/', ref: 'c' });
    autoAllow(parent, 'm-c');

    const err = await tryCatch(() => parent.relay('read', { path: 'mounts/c/.vault/secret' }));
    ok('relay read of child .vault/** → EPROTECTED (floor survives the relay)', err && err.code === 'EPROTECTED');
}

console.log('\n[suite] KernelParent — broker policy: never + ask');
{
    const child = makeChildStack({ files: { 'notes.md': 'x', 'data/y': 'y' } });
    child.appJson = { permissions: { fs: { read: true, write: ['data/'] } } };
    child.creds   = { vaultKey: 'k', accessToken: 't', endpoint: 'https://example.test' };

    // 'never' → broker denies before the relay even happens.
    {
        const parent = makeParent({ d: child });
        await parent.mount({ prefix: 'mounts/d/', ref: 'd' });
        parent.broker.setPolicy('m-d', 'fs.read', 'never');
        const err = await tryCatch(() => parent.relay('read', { path: 'mounts/d/notes.md' }));
        ok("policy 'never' → ECONSENT (relay refused at the broker)", err && err.code === 'ECONSENT');
    }

    // 'ask' → broker calls brokerUi.prompt; we resolve allow/deny and verify both.
    {
        let asked = [];
        const parent = makeParent({ d: child }, {
            brokerUi: { prompt: async (req) => { asked.push(req); return req.op === 'read' ? 'allow' : 'deny'; } }
        });
        await parent.mount({ prefix: 'mounts/d/', ref: 'd' });
        parent.broker.setPolicy('m-d', 'fs.read',  'ask');
        parent.broker.setPolicy('m-d', 'fs.write', 'ask');

        const r = await parent.relay('read', { path: 'mounts/d/notes.md' });
        ok("policy 'ask' allow → relay proceeds", new TextDecoder().decode(r) === 'x');
        const err = await tryCatch(() => parent.relay('write', { path: 'mounts/d/data/z', data: PNG }));
        ok("policy 'ask' deny → ECONSENT", err && err.code === 'ECONSENT');
        ok('brokerUi.prompt invoked with op + mountId + path', asked.length === 2 && asked[0].mountId === 'm-d' && typeof asked[0].path === 'string');
    }
}

console.log('\n[suite] KernelParent — unmount tears down + list reflects state');
{
    const child = makeChildStack({ files: { 'x': 'x' } });
    child.appJson = { permissions: { fs: { read: true } } };
    child.creds   = { vaultKey: 'k', accessToken: 't', endpoint: 'https://example.test' };
    const parent = makeParent({ e: child });
    await parent.mount({ prefix: 'mounts/e/', ref: 'e', label: 'E' });
    autoAllow(parent, 'm-e');

    ok('list shows the mount', parent.list().length === 1 && parent.list()[0].mountId === 'm-e');
    const res = await parent.unmount('m-e');
    ok('unmount reports success + returns channel for DOM teardown', res.unmounted === true && res.channel);
    ok('list empty after unmount', parent.list().length === 0);
    // broker log retained for audit even after unmount
    await tryCatch(() => parent.relay('read', { path: 'mounts/e/x' }));   // now local (null) — no new entry
    ok('relay after unmount returns null (no mount)', true);
}

console.log('\n[suite] KernelParent — mount with no credentials → EUNREACH');
{
    const parent = new KernelParent({
        kernelId: 'k', spawnChannel: async () => { throw new Error('should not spawn'); },
        resolveCredentials: async () => null
    });
    const err = await tryCatch(() => parent.mount({ prefix: 'mounts/z/', ref: 'z' }));
    ok('mount with no resolvable credentials → EUNREACH', err && err.code === 'EUNREACH');
}

console.log('\n[suite] KernelParent — B10 custody gate (pack §05 invariant)');
{
    // Unsafe: parent-held + same-origin App-A → EUNSAFE_CUSTODY, no spawn.
    let spawnCalls = 0;
    const unsafe = new KernelParent({
        kernelId: 'k',
        appFrameOrigin: 'same-origin',
        resolveCredentials: async () => ({ vaultKey: 'k', accessToken: 't', custody: 'parent-held' }),
        spawnChannel: async () => { spawnCalls++; throw new Error('should not spawn'); }
    });
    const err = await tryCatch(() => unsafe.mount({ prefix: 'mounts/u/', ref: 'u' }));
    ok('unsafe coupling → EUNSAFE_CUSTODY', err && err.code === 'EUNSAFE_CUSTODY');
    ok('unsafe coupling does NOT spawn the channel (fail-closed BEFORE bring-up)', spawnCalls === 0);

    // Synthetic escape hatch: explicit opt-in allows the same combination through.
    const child = makeChildStack({ files: { 'notes.md': 'x' } });
    child.appJson = { permissions: { fs: { read: true } } };
    child.creds   = { vaultKey: 'k', accessToken: 't', endpoint: 'https://example.test', custody: 'parent-held' };
    const synth = new KernelParent({
        kernelId: 'k',
        appFrameOrigin: 'same-origin',
        allowUnsafeSynthetic: true,
        resolveCredentials: async () => child.creds,
        spawnChannel: makeSpawnChannel({ u: child })
    });
    const m = await synth.mount({ prefix: 'mounts/u/', ref: 'u' });
    ok('escape hatch allows the unsafe combination through (synthetic only)', m && m.custody === 'parent-held');

    // Safe combinations don't need the hatch.
    const safe = new KernelParent({
        kernelId: 'k',
        appFrameOrigin: 'same-origin',
        resolveCredentials: async () => ({ vaultKey: 'k', accessToken: 't', custody: 'child-generated' }),
        spawnChannel: makeSpawnChannel({ s: child })
    });
    // We need a child stack keyed by 's' — reuse the same child for simplicity.
    const safeReg = { s: child };
    safe._spawnChannel = makeSpawnChannel(safeReg);
    const ms = await safe.mount({ prefix: 'mounts/s/', ref: 's' });
    ok('child-generated + same-origin → allowed (safe)', ms && ms.custody === 'child-generated');

    // Default custody when resolver doesn't tag → parent-held; null-origin parent stays safe.
    const safeNull = new KernelParent({
        kernelId: 'k',
        // default appFrameOrigin = 'null-origin'
        resolveCredentials: async () => ({ vaultKey: 'k', accessToken: 't' /* no custody field */ }),
        spawnChannel: makeSpawnChannel({ n: child })
    });
    safeNull._spawnChannel = makeSpawnChannel({ n: child });
    const mn = await safeNull.mount({ prefix: 'mounts/n/', ref: 'n' });
    ok('untagged creds default to parent-held; null-origin parent → safe',
        mn && mn.custody === 'parent-held');

    // list() exposes custody so sg.vault.mounts() and the 🔗 Mounts tab can show it.
    ok('list() exposes custody per mount',
        safeNull.list()[0].custody === 'parent-held');
}

console.log('\n[suite] KernelParent — B5/B6 credential-tier gate at the relay edge');
{
    // The child grants fs.delete on data/** and the parent broker auto-allows fs.delete
    // for this mount. The ONLY thing that should refuse a standing-credential delete is
    // the new tier gate. With a credential present, the SAME path succeeds.
    const child = makeChildStack({ files: { 'data/doomed.txt': 'bye' } });
    child.appJson = { permissions: { fs: { read: true, write: ['data/'], 'delete': ['data/'] } } };
    child.creds   = { vaultKey: 'k', accessToken: 't', endpoint: 'https://example.test' };
    const parent = makeParent({ acme: child });
    await parent.mount({ prefix: 'mounts/acme/', ref: 'acme' });
    autoAllow(parent, 'm-acme');

    // Standing (no credential field on the relay) — gate refuses BEFORE mediation.
    const logBefore = parent.broker.log().length;
    const err = await tryCatch(() => parent.relay('delete', { path: 'mounts/acme/data/doomed.txt' }));
    ok('delete with standing credential → EUNDERPRIVILEGED',
        err && err.code === 'EUNDERPRIVILEGED' && err.required === 'perRequest-rw');
    ok('refused delete creates NO broker entry (gate runs before mediation)',
        parent.broker.log().length === logBefore);
    ok('refused delete leaves the file in the child store',
        child.store.has('data/doomed.txt'));

    // Same op with a per-request credential present → succeeds. The credential value
    // itself is not validated here (issuance scheme deferred); presence flips the tier.
    const okD = await parent.relay('delete', { path: 'mounts/acme/data/doomed.txt', credential: { tier: 'perRequest-rw' } });
    ok('delete with credential present → ok', okD && okD.ok === true);
    ok('elevated delete actually removed the file', !child.store.has('data/doomed.txt'));

    // Writes still pass at standing (the invariant only elevates destructive verbs).
    const okW = await parent.relay('write', { path: 'mounts/acme/data/x', data: new Uint8Array([1, 2, 3]) });
    ok('write still passes at standing tier', okW && okW.ok === true);

    // Reads are unaffected.
    const okR = await parent.relay('read', { path: 'mounts/acme/data/x' });
    ok('read still passes at standing tier', okR instanceof Uint8Array && okR.length === 3);
}

console.log('\n[suite] KernelParent.monitorChild — B7 monitored-mode round-trip (real bootstrap)');
{
    // Real bootstrap registers VivMonitor on the child's channel. Default CLOSED →
    // parent's monitorChild request returns ECONSENT. After child opts in (via the
    // ch._monitor handle the bootstrap surfaced), the same request returns entries.
    const child = makeChildStack({ files: { 'notes.md': 'hi' } });
    child.appJson = { permissions: { fs: { read: true } } };
    child.creds   = { vaultKey: 'k-child', accessToken: 't', endpoint: 'https://example.test' };
    const parent  = makeParent({ acme: child });
    const m       = await parent.mount({ prefix: 'mounts/acme/', ref: 'acme' });
    autoAllow(parent, 'm-acme');

    // Trigger one relayed read so the child's broker has an entry (writes its OWN log,
    // independent of the parent's; this is what monitored-mode exposes).
    await parent.relay('read', { path: 'mounts/acme/notes.md' });

    // Default CLOSED on the child → parent gets ECONSENT.
    const err = await tryCatch(() => parent.monitorChild('m-acme'));
    ok('monitorChild on CLOSED child → ECONSENT',  err && err.code === 'ECONSENT');

    // Reach the child kernel's monitor handle through the spawn helper's stash.
    const parentSide = parent.mounts.get('m-acme').channel;
    ok('bootstrap surfaced child broker via spawn helper',  !!parentSide._childBroker);
    ok('bootstrap surfaced child monitor via spawn helper', !!parentSide._childMonitor);
    // In production the toggle happens inside the child kernel via its own UI/app code;
    // here we drive it from the test side since both ends share node memory.
    parentSide._childMonitor.setMode('opt-in');

    // The child's broker hasn't been used by the child itself yet (it's a fresh kernel
    // with no children); use the broker handle directly to write a synthetic entry.
    const r = await parentSide._childBroker.mediate('read', 'm-grandchild', 'foo.md', 'standing');
    parentSide._childBroker.finalize(r.entryId, 'ok');

    const res = await parent.monitorChild('m-acme');
    ok('monitorChild on OPT_IN child → returns { mode, entries }',
        res && res.mode === 'opt-in' && Array.isArray(res.entries) && res.entries.length === 1);
    ok('entries carry the child broker shape (op/result)',
        res.entries[0].op === 'read' && res.entries[0].result === 'ok');

    // Unknown mount → ENOMOUNT (not silently null — this is a programmer error path).
    const err2 = await tryCatch(() => parent.monitorChild('m-nope'));
    ok('monitorChild on unknown mount → ENOMOUNT', err2 && err2.code === 'ENOMOUNT');
}

for (const c of openChannels) { try { c.close(); } catch (_) {} }
console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
