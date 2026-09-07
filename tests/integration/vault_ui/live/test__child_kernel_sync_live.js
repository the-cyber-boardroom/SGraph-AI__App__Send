/* =================================================================================
   LIVE integration — child-kernel sync discipline against the REAL API server
   Run: node tests/integration/vault_ui/live/test__child_kernel_sync_live.js

   Boots the real SGraph Send API (in-memory storage, random port), then drives the
   SHIPPED kernel vfs handlers (kernel-app-handlers.js) over a real SGVault opened the
   way a declared-mount child kernel opens it (per-parent clone branch). A second
   writer — a plain SGVault on its own clone branch, i.e. what `sgit push` or another
   browser tab is to the server — publishes in between, so every path of the
   reconcile-before-write design (07 Sep) is exercised with real refs and real CAS:

     1. status shape on a clean kernel
     2. write → CAS push → published (and the Via-Mount trailer lands on the commit)
     3. other writer publishes first → write reconciles (fast-forward) then publishes
     4. other writer publishes BETWEEN our commit and our push → ECAS → merge → retry
     5. read-only child: refresh-before-read sees the new tip; writes → EREADONLY
     6. vfs.sync reports changed:true and notifies '/'
     7. refresh throttle: a stale-by-design read, then vfs.sync catches up
     8. vault-level CAS: pushIfMatch ECAS / ENOMATCH

   No mocks, no patches: real server, real crypto, real handlers.
   ================================================================================= */

import { startApiServer } from '../../../e2e/vault_ui/fixtures/api-server.js';
import { loadVaultLibs, sgSend, putFile, readFile, json, enc, dec, randomWord, credentialsOf }
    from '../../../e2e/vault_ui/fixtures/sg-vault-node.js';

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? ' — ' + info : '')); } }
async function errOf(fn) { try { await fn(); return null; } catch (e) { return e; } }
function suite(n) { console.log('\n[suite] ' + n); }

function makeChannel() {
    const h = {};
    return { handle(n, f) { h[n] = f; }, request(n, p) { if (!h[n]) throw new Error('no handler ' + n); return h[n](p || {}); } };
}

// Build a child kernel exactly like kernel-bootstrap does for a declared mount.
async function bootKernel(api, key, { cloneBranch, readOnly = false, label = 'Clinic Data' } = {}) {
    const sg = sgSend(api);
    let vault;
    if (readOnly) {
        const creds = SGVaultCrypto.parseReadOnlyCredential(key);
        const ro    = await SGVaultCrypto.deriveReadOnlyCreds(creds.vaultId, creds.readKeyHex);
        vault = await SGVault.openReadOnly(sg, creds.vaultId, ro.readKeyB64, ro.refFileId);
    } else {
        vault = await SGVault.open(sg, SGVaultCrypto.stripKeyPrefix(key), { cloneBranch });
        vault._commitTrailer = 'Via-Mount: ' + label + ' (declared)';
    }
    const token = vault.writable !== false ? await vault.readEmbeddedAccessToken() : null;
    if (token) vault._sgSend.token = token;
    const ds = new VaultDataSource(vault, token);
    await ds.loadAllSubTrees();
    const appJson = JSON.parse(dec(await ds.getFileBytes('.vault/app.json')));
    const perm    = AppPermissions.parsePermissions(appJson);
    const updates = [];
    const ch      = makeChannel();
    registerKernelVfsHandlers(ch, { dataSource: ds, perm, vault, onUpdated: (p) => updates.push(p) });
    return { vault, ds, ch, updates };
}

async function freshOpen(api, key) {
    const sg = sgSend(api);
    const v  = await SGVault.open(sg, SGVaultCrypto.stripKeyPrefix(key), { cloneBranch: 'verify-' + randomWord('x').slice(2) });
    const ds = new VaultDataSource(v, api.token);
    await ds.loadAllSubTrees();
    return { vault: v, ds, files: ds.getFileList().filter(e => !e.dir).map(e => e.path).sort() };
}

const api = await startApiServer();
loadVaultLibs();
try {
    // ── seed: one child vault with its own policy + embedded token ─────────────────
    const seedSg = sgSend(api);
    const seed   = await SGVault.create(seedSg, randomWord('child'), { name: 'Clinic Data' });
    await putFile(seed, '/.vault/app.json', json({ permissions: { fs: { read: true, write: true, delete: true, mkdir: true } } }));
    await putFile(seed, '/.vault/access-token.json', json({ token: api.token }));
    await putFile(seed, '/records/seed.json', json([{ id: 1 }]));
    await seed.push();
    const creds = await credentialsOf(seed);
    const KEY   = creds.key;

    // "the other writer": what sgit push / another tab is to the server. Blind push().
    const other = await SGVault.open(sgSend(api), KEY, { cloneBranch: 'other-writer' });
    async function otherPublishes(path, text) {
        await other.merge(await other._refManager.readRef(other._refFileId), { publish: false }).catch(() => {});
        await putFile(other, path, enc(text));
        await other.push();
        return other._headCommitId;
    }

    // ── 1. status on a clean kernel ─────────────────────────────────────────────────
    suite('1. vfs.status on a clean child kernel');
    const k = await bootKernel(api, KEY, { cloneBranch: 'viv:parent-a' });
    let st = await k.ch.request('vfs.status');
    ok('syncable', st.syncable === true);
    ok('writable', st.writable === true);
    ok('state clean', st.state === 'clean', st.state);
    ok('head === named === serverHead', st.head && st.head === st.named && st.named === st.serverHead);
    ok('ahead/behind 0', st.ahead === 0 && st.behind === 0 && st.diverged === false);
    ok('no push yet', st.lastPush === null);

    // ── 2. write → CAS push → published ────────────────────────────────────────────
    suite('2. write publishes through CAS push');
    const w1 = await k.ch.request('vfs.write', { path: 'report.json', data: enc('{"v":1}') });
    ok('write ok', w1 && w1.ok === true);
    let v = await freshOpen(api, KEY);
    ok('fresh open sees report.json', v.files.includes('report.json'), v.files.join(','));
    ok('content v1', dec(await readFile(v.vault, '/report.json')) === '{"v":1}');
    const c1 = await v.vault._commitManager.loadCommit(v.vault._headCommitId);
    ok('Via-Mount trailer on the published commit', /Via-Mount: Clinic Data \(declared\)/.test(c1.message || ''), c1.message);
    st = await k.ch.request('vfs.status');
    ok('status clean after write', st.state === 'clean' && st.lastPush && st.lastPush.head === st.head);

    // ── 3. other writer published first → reconcile (FF) before write ──────────────
    suite('3. reconcile-before-write: fast-forward onto the other writer\'s publish');
    const otherHead1 = await otherPublishes('/notes/other.md', 'from the other writer');
    st = await k.ch.request('vfs.status');
    ok('status sees behind before we write', st.state === 'behind' && st.behind >= 1, JSON.stringify(st));
    const w2 = await k.ch.request('vfs.write', { path: 'report.json', data: enc('{"v":2}') });
    ok('write ok', w2 && w2.ok === true);
    v = await freshOpen(api, KEY);
    ok('published tree has BOTH files', v.files.includes('report.json') && v.files.includes('notes/other.md'), v.files.join(','));
    ok('content v2', dec(await readFile(v.vault, '/report.json')) === '{"v":2}');
    const c2 = await v.vault._commitManager.loadCommit(v.vault._headCommitId);
    ok('our commit descends from the other writer\'s commit (FF, not overwrite)', c2.parents[0] === otherHead1, c2.parents.join(','));
    ok('kernel can read the other writer\'s file immediately', dec(await k.ch.request('vfs.read', { path: 'notes/other.md' })) === 'from the other writer');
    st = await k.ch.request('vfs.status');
    ok('lastMerge was a fast-forward', st.lastMerge && st.lastMerge.fastForward === true);
    ok('status clean', st.state === 'clean');

    // ── 3b. nested write AFTER a reconcile must keep the folder's other files ─────
    suite('3b. write into a nested folder after reconcile keeps siblings');
    await otherPublishes('/notes/second.md', 'second');
    const w2b = await k.ch.request('vfs.write', { path: 'notes/mine.md', data: enc('mine') });
    ok('write ok', w2b && w2b.ok === true);
    v = await freshOpen(api, KEY);
    ok('notes/ keeps other.md + second.md and gains mine.md',
       ['notes/other.md', 'notes/second.md', 'notes/mine.md'].every(f => v.files.includes(f)), v.files.join(','));

    // ── 4. race: publish lands BETWEEN our commit and our push → ECAS → merge → retry
    suite('4. CAS conflict: other writer publishes between our commit and our push');
    const origSave = k.ds.saveFile.bind(k.ds);
    let raced = false;
    k.ds.saveFile = async function (dir, name, bytes) {
        await origSave(dir, name, bytes);                         // our commit exists locally (clone ref)
        if (!raced) { raced = true; await otherPublishes('/notes/race.md', 'landed mid-write'); }
    };
    const w3 = await k.ch.request('vfs.write', { path: 'report.json', data: enc('{"v":3}') });
    k.ds.saveFile = origSave;
    ok('write still ok (ECAS handled by merge + retry)', w3 && w3.ok === true);
    v = await freshOpen(api, KEY);
    ok('published tree has report v3 AND race.md', v.files.includes('notes/race.md') && dec(await readFile(v.vault, '/report.json')) === '{"v":3}', v.files.join(','));
    const c3 = await v.vault._commitManager.loadCommit(v.vault._headCommitId);
    ok('published head is a MERGE commit (2 parents)', Array.isArray(c3.parents) && c3.parents.length === 2, JSON.stringify(c3.parents));
    st = await k.ch.request('vfs.status');
    ok('lastMerge was three-way', st.lastMerge && st.lastMerge.fastForward === false && st.lastMerge.conflicts.length === 0, JSON.stringify(st.lastMerge));
    ok('status clean', st.state === 'clean' && st.ahead === 0 && st.behind === 0, JSON.stringify(st));

    // ── 5. read-only child kernel ───────────────────────────────────────────────────
    suite('5. read-only child: refresh-before-read, writes refused');
    registerKernelVfsHandlers.REFRESH_MS = 0;
    const ro = await bootKernel(api, creds.readCredential, { readOnly: true });
    ok('vault not writable', ro.vault.writable === false);
    ok('reads v3', dec(await ro.ch.request('vfs.read', { path: 'report.json' })) === '{"v":3}');
    await otherPublishes('/report.json', '{"v":4}');
    ok('refresh-before-read sees v4', dec(await ro.ch.request('vfs.read', { path: 'report.json' })) === '{"v":4}');
    ok('onUpdated("/") fired on refresh', ro.updates.includes('/'));
    const e5 = await errOf(() => ro.ch.request('vfs.write', { path: 'report.json', data: enc('x') }));
    ok('write → EREADONLY', e5 && e5.code === 'EREADONLY', e5 && e5.code);
    const rst = await ro.ch.request('vfs.status');
    ok('status: syncable, not writable, clean', rst.syncable === true && rst.writable === false && rst.state === 'clean', JSON.stringify(rst));

    // ── 6. vfs.sync ─────────────────────────────────────────────────────────────────
    suite('6. vfs.sync');
    registerKernelVfsHandlers.REFRESH_MS = undefined;             // default throttle back on
    k.updates.length = 0;
    await otherPublishes('/notes/synced.md', 'sync me');
    const s6 = await k.ch.request('vfs.sync');
    ok('changed:true', s6.changed === true, JSON.stringify(s6));
    ok('state clean after sync', s6.state === 'clean');
    ok('notified "/"', k.updates.includes('/'));
    ok('kernel reads the synced file', dec(await k.ch.request('vfs.read', { path: 'notes/synced.md' })) === 'sync me');
    const s6b = await k.ch.request('vfs.sync');
    ok('second sync: changed:false', s6b.changed === false);

    // ── 7. throttle ─────────────────────────────────────────────────────────────────
    suite('7. refresh throttle (stale by design inside the window)');
    registerKernelVfsHandlers.REFRESH_MS = 60_000;
    await k.ch.request('vfs.read', { path: 'report.json' });      // arms the window
    await otherPublishes('/notes/late.md', 'after the window opened');
    const l7 = await k.ch.request('vfs.list', { path: 'notes' });
    ok('list inside the window does NOT see late.md', !l7.some(e => /late\.md$/.test(e.path || e.name || '')), JSON.stringify(l7.map(e => e.path || e.name)));
    const s7 = await k.ch.request('vfs.sync');
    ok('sync catches up', s7.changed === true);
    const l7b = await k.ch.request('vfs.list', { path: 'notes' });
    ok('list now sees late.md', l7b.some(e => /late\.md$/.test(e.path || e.name || '')));
    registerKernelVfsHandlers.REFRESH_MS = undefined;

    // ── 8. vault-level CAS ──────────────────────────────────────────────────────────
    suite('8. SGVault.pushIfMatch: ECAS on a moved ref, ENOMATCH when never read');
    const a = await SGVault.open(sgSend(api), KEY, { cloneBranch: 'cas-a' });
    await otherPublishes('/notes/moved.md', 'moved');
    await putFile(a, '/from-a.md', enc('a'));
    const e8 = await errOf(() => a.pushIfMatch());
    ok('pushIfMatch → ECAS', e8 && e8.code === 'ECAS', e8 && (e8.code || e8.message));
    const serverHead = await a._refManager.readRef(a._refFileId);
    const m8 = await a.merge(serverHead, { publish: false });
    ok('merge (three-way, unpublished)', m8.merged && !m8.fastForward && m8.published === false, JSON.stringify(m8));
    const e8b = await errOf(() => a.pushIfMatch());
    ok('pushIfMatch after merge → ok', e8b === null, e8b && e8b.message);
    v = await freshOpen(api, KEY);
    ok('published tree has from-a.md and moved.md', v.files.includes('from-a.md') && v.files.includes('notes/moved.md'));
    const fresh = await SGVault.create(sgSend(api), randomWord('fresh'), { name: 'Fresh' });
    const e8c = await errOf(() => fresh.pushIfMatch());
    ok('never-read ref → ENOMATCH', e8c && e8c.code === 'ENOMATCH', e8c && e8c.code);

} finally {
    await api.stop();
}

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
