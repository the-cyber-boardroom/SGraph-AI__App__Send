/* Integration tests — declared mounts on the kernel lane (07 Sep analysis §5–§6)
   Run: node tests/unit/vault_ui/loader/test__kernel_declared_mounts.js

   Same harness as test__kernel_parent.js: a REAL KernelParent wired to a REAL child kernel
   (bootKernelOnPort over a MessageChannel), no mocks. Pins:
     • register-eager / spawn-lazy: a lazy mount resolves paths immediately, spawns the child
       on FIRST relay only, and concurrent first relays share ONE spawn
     • an app cannot unmount a DECLARED mount (EPERM); force can; runtime mounts unmount as
       before — and a runtime mount coexists with a declared one (the no-impact proof, test B)
     • an ro credential mounts read-only: list() says 'ro' and the CHILD refuses the write
     • the default vault factory opens a READ credential read-only, strips sgit prefixes,
       threads cloneBranch through, reads the child's OWN embedded token only when the vault
       holds a write key (a read-credential child is never marked writable — test G), and
       stamps the Via-Mount commit trailer
     • the custody gate accepts a function-valued appFrameOrigin (evaluated at gate time)
     • the child kernel never auto-mounts (no cycle can form) */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const src  = (rel) => readFileSync(fileURLToPath(new URL(ROOT + rel, import.meta.url)), 'utf8');
for (const f of ['components/app-shell/app-permissions.js', 'components/app-shell/secure-channel-envelope.js',
                 'components/app-shell/secure-channel.js', 'components/app-shell/kernel-mounts.js',
                 'components/app-shell/kernel-broker.js', 'components/app-shell/viv-custody.js',
                 'components/app-shell/viv-monitor.js', 'components/app-shell/viv-credential-tiers.js',
                 'components/app-shell/kernel-parent.js', 'components/app-shell/kernel-app-handlers.js',
                 'components/app-shell/kernel-bootstrap.js', 'lib/sg-vault/sg-vault-crypto.js']) {
    runInThisContext(src(f), { filename: f, displayErrors: true });
}
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');
const { SecureChannel, KernelParent, bootKernelOnPort, SGVaultCrypto } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };
const tryCatch = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const openChannels = [];

function makeChildStack({ files = {}, writable = true } = {}) {
    const store = new Map(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)]));
    const vault = { _vaultId: 'child-' + Math.random().toString(36).slice(2, 6),
                    async getFileBytes(p) { const n = p.replace(/^\//, ''); if (!store.has(n)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return store.get(n); },
                    async push() {} };
    const dataSource = { writable, async getFileBytes(p) { return vault.getFileBytes(p); },
        listFolder(f) { const norm = (f || '').replace(/^\//, ''); const out = []; for (const [p, b] of store) if (norm === '' || p === norm || p.startsWith(norm + '/')) out.push({ path: p, size: b.length }); return out; },
        async saveFile(dir, name, data) { store.set((dir.replace(/^\//, '').replace(/\/$/, '') + '/' + name).replace(/^\//, ''), new Uint8Array(data || [])); },
        async deleteFile() {}, async createFolder() {} };
    // Two-sided gate: the CHILD must grant the write too (the parent's broker is never enough).
    const appJson = { permissions: { fs: { read: true, write: true } } };
    return { vault, dataSource, store, appJson };
}
// Spawn stand-in — RECORDS calls so laziness is observable.
function makeSpawn(children, log) {
    return async function spawnChannel(ref, creds) {
        log.push({ ref, kind: creds.kind, label: creds.label });
        const child = children[ref]; if (!child) throw Object.assign(new Error('no child ' + ref), { code: 'EUNREACH' });
        const cid = 'ch-' + ref + '-' + log.length;
        const { port1, port2 } = new MessageChannel();
        const bootP = bootKernelOnPort(port2, { cid, vaultFactory: async () => child.vault, dataSourceFactory: () => child.dataSource, appJsonReader: async () => child.appJson, endpointFor: () => 'https://example.test' });
        const parentSide = await SecureChannel.create(port1, { sensitiveKey: true, cid });
        const readyP = new Promise((r) => parentSide.on('ready', r));
        await bootP;
        await parentSide.send('secrets', { vaultKey: creds.vaultKey, accessToken: null, endpoint: 'https://example.test' }, { sensitive: true });
        await readyP; openChannels.push(parentSide); return parentSide;
    };
}
const autoAllow = (kp, id) => { for (const c of ['fs.read', 'fs.write', 'fs.delete', 'fs.mkdir', 'fs.move']) kp.broker.setPolicy(id, c, 'auto'); };

(async () => {
    console.log('\n[suite] register eager, spawn lazy');
    {
        const log = [], children = { data: makeChildStack({ files: { 'report.md': 'from child' } }) };
        const kp  = new KernelParent({ kernelId: 'k-top', spawnChannel: makeSpawn(children, log),
                                       resolveCredentials: async () => ({ vaultKey: 'pass:childvault', custody: 'parent-held', access: 'rw' }) });
        const res = await kp.mount({ prefix: 'data', ref: 'data', label: 'Data', lazy: true, meta: { declared: true } });
        ok('lazy mount registers without spawning',       log.length === 0 && res.lazy === true && res.mountId === 'm-data');
        ok('path resolves immediately',                    !!kp.mounts.resolve('data/report.md'));
        ok('list() reports declared, access, spawned:false', (() => { const m = kp.list()[0]; return m.declared === true && m.access === 'rw' && m.spawned === false; })());
        ok('listForApps() is the projection only (prefix/access/declared/state/at), state idle before spawn', (() => {
            const a = kp.listForApps()[0];
            return Object.keys(a).sort().join(',') === 'access,at,declared,prefix,state' && a.state === 'idle' && a.at === null && a.declared === true && a.access === 'rw';
        })());
        autoAllow(kp, 'm-data');
        const [a, b] = await Promise.all([kp.relay('read', { path: 'data/report.md' }), kp.relay('read', { path: 'data/report.md' })]);
        ok('first relay spawns the child ONCE for two concurrent callers', log.length === 1);
        ok('both concurrent reads get the child bytes',     new TextDecoder().decode(a) === 'from child' && new TextDecoder().decode(b) === 'from child');
        ok('spawn saw kind=declared + label',               log[0].kind === 'declared' && log[0].label === 'Data');
        ok('list() now spawned:true',                       kp.list()[0].spawned === true);
        await kp.relay('write', { path: 'data/out.txt', data: new TextEncoder().encode('x') });
        ok('write through the lazy mount lands in the CHILD store', children.data.store.has('out.txt'));
        ok('…and still only one spawn',                     log.length === 1);
    }

    console.log('\n[suite] declared mounts cannot be unmounted by the app; runtime mounts can (no-impact)');
    {
        const log = [], children = { d: makeChildStack(), r: makeChildStack() };
        const kp  = new KernelParent({ kernelId: 'k-top', spawnChannel: makeSpawn(children, log),
                                       resolveCredentials: async (ref) => ({ vaultKey: 'pass:' + ref + 'vault', custody: 'parent-held' }) });
        await kp.mount({ prefix: 'd', ref: 'd', lazy: true, meta: { declared: true } });
        await kp.mount({ prefix: 'r', ref: 'r' });                       // runtime mount, exactly as sg.vault.mount does
        ok('declared + runtime coexist (2 mounts, 1 spawn for the eager one)', kp.list().length === 2 && log.length === 1);
        const err = await tryCatch(() => kp.unmount('m-d', { byApp: true }));
        ok('app unmount of a declared mount → EPERM',       err && err.code === 'EPERM');
        ok('…and it is still mounted',                      !!kp.mounts.resolve('d/x'));
        const rt = await kp.unmount('m-r', { byApp: true });
        ok('app unmount of a RUNTIME mount still works',    rt.unmounted === true && !kp.mounts.resolve('r/x'));
        const forced = await kp.unmount('m-d', { force: true });
        ok('shell force-unmount of a declared mount works (never-spawned: no channel to close)', forced.unmounted === true && !kp.mounts.resolve('d/x'));
    }

    console.log('\n[suite] one mount per child per kernel — EEXIST instead of a silent overwrite');
    {
        const log = [], children = { c: makeChildStack() };
        const kp  = new KernelParent({ kernelId: 'k-top', spawnChannel: makeSpawn(children, log),
                                       resolveCredentials: async () => ({ vaultKey: 'pass:childvault', custody: 'parent-held' }) });
        await kp.mount({ prefix: 'first', ref: 'c', lazy: true, meta: { declared: true } });
        const e1 = await tryCatch(() => kp.mount({ prefix: 'second', ref: 'c', lazy: true }));
        ok('same ref at another prefix → EEXIST',                    e1 && e1.code === 'EEXIST');
        ok('…and the FIRST prefix is still mounted (no overwrite)',  !!kp.mounts.resolve('first/x') && !kp.mounts.resolve('second/x'));
        const e2 = await tryCatch(() => kp.mount({ prefix: 'first', ref: 'other', lazy: true }));
        ok('same prefix for a different ref → EEXIST',               e2 && e2.code === 'EEXIST');
        ok('exactly one mount in the table',                         kp.list().length === 1);
    }

    console.log('\n[suite] an ro credential mounts read-only — the CHILD refuses the write');
    {
        const log = [], children = { ro: makeChildStack({ files: { 'a.md': 'x' }, writable: false }) };
        const kp  = new KernelParent({ kernelId: 'k-top', spawnChannel: makeSpawn(children, log),
                                       resolveCredentials: async () => ({ vaultKey: 'ab'.repeat(32) + ':childvault', custody: 'parent-held', access: 'ro' }) });
        await kp.mount({ prefix: 'ro', ref: 'ro', lazy: true, meta: { declared: true } });
        ok('list() access = ro',                            kp.list()[0].access === 'ro');
        autoAllow(kp, 'm-ro');
        ok('reads work',                                    new TextDecoder().decode(await kp.relay('read', { path: 'ro/a.md' })) === 'x');
        const err = await tryCatch(() => kp.relay('write', { path: 'ro/b.md', data: new Uint8Array([1]) }));
        ok('write → EREADONLY from the child, not the parent', err && err.code === 'EREADONLY');
    }

    console.log('\n[suite] default vault factory — read credential, prefixes, cloneBranch, embedded token, trailer');
    {
        // Stub SGVault/SGSend so the DEFAULT factory path in kernel-bootstrap is exercised.
        const calls = [];
        globalThis.SGSend = function (o) { this.endpoint = o.endpoint; this.token = null; };
        const mkVault = (writable, token) => ({ _vaultId: 'v', writable, _sgSend: null,
            async readEmbeddedAccessToken() { return token; }, async getFileBytes() { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); } });
        globalThis.SGVault = {
            async open(sgSend, key, opts)      { calls.push({ fn: 'open', key, opts }); const v = mkVault(true, 'embedded-tok'); v._sgSend = sgSend; return v; },
            async openReadOnly(sgSend, id, b64, ref) { calls.push({ fn: 'openReadOnly', id, ref }); const v = mkVault(false, 'embedded-tok'); v._sgSend = sgSend; return v; }
        };
        const dsTokens = [];
        globalThis.VaultDataSource = function (v, tok) { dsTokens.push(tok); this.writable = !!tok; this.getFileBytes = async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }; this.listFolder = () => []; };
        async function bootWith(secrets) {
            const { port1, port2 } = new MessageChannel(); const cid = 'ch-' + Math.random().toString(36).slice(2);
            const bootP  = bootKernelOnPort(port2, { cid });                       // NO factory overrides → defaults
            const parent = await SecureChannel.create(port1, { sensitiveKey: true, cid });
            const readyP = new Promise((r) => parent.on('ready', r));
            const child  = await bootP;
            await parent.send('secrets', Object.assign({ endpoint: 'https://example.test' }, secrets), { sensitive: true });
            await readyP; openChannels.push(parent); return child;
        }
        const RK = 'cd'.repeat(32);
        // (1) full key with sgit prefix + cloneBranch + mount label
        calls.length = 0; dsTokens.length = 0;
        await bootWith({ vaultKey: 'sgit_private_vault_pass:childvault', cloneBranch: 'viv:parent01', mountLabel: 'reports', mountKind: 'declared' });
        ok('full key: prefix stripped before SGVault.open',   calls[0] && calls[0].fn === 'open' && calls[0].key === 'pass:childvault');
        ok('cloneBranch threaded into SGVault.open',          calls[0].opts && calls[0].opts.cloneBranch === 'viv:parent01');
        ok('embedded token read → data source writable',      dsTokens[0] === 'embedded-tok');
        // (2) read credential (prefixed, sgit_public_read_) → openReadOnly, never writable
        calls.length = 0; dsTokens.length = 0;
        const expected = await SGVaultCrypto.deriveReadOnlyCreds('childvault', RK);
        await bootWith({ vaultKey: 'sgit_public_read_' + RK + ':childvault', mountLabel: 'pub', mountKind: 'runtime' });
        ok('read credential → SGVault.openReadOnly with the DERIVED ref id', calls[0] && calls[0].fn === 'openReadOnly' && calls[0].id === 'childvault' && calls[0].ref === expected.refFileId);
        ok('read-credential child NEVER writable even with an embedded token present (test G)', dsTokens[0] === null);
        // (3) parent-supplied token wins; no trailer without a label
        calls.length = 0; dsTokens.length = 0;
        await bootWith({ vaultKey: 'pass:childvault', accessToken: 'parent-tok' });
        ok('parent-supplied token is used as-is',             dsTokens[0] === 'parent-tok');
        ok('default clone branch is web-ui',                  calls[0].opts.cloneBranch === 'web-ui');
    }

    console.log('\n[suite] commit trailer + custody gate origin function + child never auto-mounts');
    {
        // Trailer: the factory-created vault object carries the trailer the bootstrap stamps.
        let stamped = null;
        globalThis.SGVault.open = async () => { const v = { _vaultId: 'v', writable: true, async readEmbeddedAccessToken() { return null; } }; stamped = v; return v; };
        const { port1, port2 } = new MessageChannel(); const cid = 'ch-t';
        const bootP = bootKernelOnPort(port2, { cid }); const parent = await SecureChannel.create(port1, { sensitiveKey: true, cid });
        const readyP = new Promise((r) => parent.on('ready', r)); await bootP;
        await parent.send('secrets', { vaultKey: 'p:childvault', endpoint: 'https://example.test', mountLabel: 'reports\nX', mountKind: 'declared' }, { sensitive: true });
        await readyP; openChannels.push(parent);
        ok('Via-Mount trailer stamped on the child vault (label sanitised, kind declared)', stamped && stamped._commitTrailer === 'Via-Mount: reports X (declared)');

        // Gate: function-valued appFrameOrigin is evaluated at mount time.
        const creds = async () => ({ vaultKey: 'pass:childvault', custody: 'parent-held' });
        const unsafe = new KernelParent({ kernelId: 'k', spawnChannel: async () => { throw new Error('should not spawn'); }, resolveCredentials: creds, appFrameOrigin: () => 'same-origin' });
        const gerr = await tryCatch(() => unsafe.mount({ prefix: 'x', ref: 'x', lazy: true }));
        ok('parent-held creds + same-origin frame (function) → EUNSAFE_CUSTODY', gerr && gerr.code === 'EUNSAFE_CUSTODY');
        const safe = new KernelParent({ kernelId: 'k', spawnChannel: async () => { throw new Error('lazy: not spawned'); }, resolveCredentials: creds, appFrameOrigin: () => 'null-origin' });
        ok('…null-origin (function) → mount registered',    !!(await safe.mount({ prefix: 'x', ref: 'x', lazy: true })).mountId);

        // A child kernel never auto-mounts: bootstrap has no mount path at all.
        const boot = src('components/app-shell/kernel-bootstrap.js');
        ok('kernel-bootstrap references no KernelParent / DeclaredMounts / .mount(', !/KernelParent|DeclaredMounts|\.mount\(/.test(boot));
    }

    for (const c of openChannels) { try { c.close(); } catch (_) {} }
    console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
