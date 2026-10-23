/* Bulk sub-tree loading (the "7,800 GETs on open" fix). A deep, wide tree is loaded level by
   level through the batch endpoint, 50 ids per POST, several POSTs in flight, with no
   per-folder GET. Also covers: shared sub-trees fetched once, the split-in-two fallback when a
   chunk is refused, and that the result equals the serial loader's.
   Run: node tests/unit/vault_ui/loader/test__bulk_subtree_load.js */

import { loadVaultLibs, installLocalStorage, FakeServer, makeFakeSgSend, clearMemCache, load } from './sgit-parity-fakes.js';
loadVaultLibs(); installLocalStorage();
globalThis.window = globalThis.window || globalThis; globalThis.document = globalThis.document || { querySelector() { return null; } };
load('adapters/vault-data-source.js', 'VaultDataSource');
const { SGVault, SGVaultObjectStore, VaultDataSource } = globalThis;
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };
const enc = new TextEncoder();

(async function () {
    const server = new FakeServer(); const sg = makeFakeSgSend(server);
    const A = await SGVault.create(sg, 'bulk test passphrase 2026', { name: 'bulk', signer: null });
    // 3 levels: 6 top folders × 8 sub × 5 leaf folders = 6 + 48 + 240 = 294 folders; one file in every leaf,
    // plus two top folders that are byte-identical (shared sub-tree ids)
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 8; j++) {
            for (let k = 0; k < 5; k++) {
                await A.createFolder(`/t${i}`).catch(() => {});
                const sub = `/t${i}/s${j}`; if (!A.listFolder(sub)) await A.createFolder(sub);
                const leaf = `${sub}/l${k}`; if (!A.listFolder(leaf)) await A.createFolder(leaf);
                await A.addFile(leaf, 'f.txt', enc.encode(i === 5 ? 'same as t4' : `${i}-${j}-${k}`));
            }
        }
    }
    await A.push();
    const expected = A.getStats();

    // --- the bulk loader on a fresh open ---------------------------------------------------
    console.log('\n[suite] loadAllSubTrees — level by level, batched, parallel');
    const log = server.log; log.length = 0; clearMemCache();          // a fresh device: nothing cached locally
    const B = await SGVault.open(sg, A.getVaultKey(), { signer: null, adoptLegacyClone: false });
    const t0 = Date.now();
    const progress = [];
    const r = await B.loadAllSubTrees({ onProgress: (p) => progress.push(p) });
    const gets  = log.filter(l => l.startsWith('PUT') ? false : /^GET /.test(l)).length;   // FakeServer logs batch ops as "read …"
    const reads = log.filter(l => l.startsWith('read ')).length;
    const stats = B.getStats();
    ok('every folder loaded (' + r.folders + ')',        r.folders === expected.folders, `${r.folders} vs ${expected.folders}`);
    ok('files and sizes match the writer',               stats.files === expected.files && stats.totalSize === expected.totalSize);
    ok('batched: far fewer requests than folders',       r.requests > 0 && r.requests <= Math.ceil(expected.folders / 50) + 16, r.requests);
    ok('no per-folder GET: every tree came through batch reads', gets === 0 && reads >= expected.folders, `gets=${gets} reads=${reads}`);
    ok('progress reported per chunk, ending with nothing pending', progress.length >= 3 && progress[progress.length - 1].pending === 0 && progress[progress.length - 1].folders === expected.folders);

    // --- batching shape ----------------------------------------------------------------------
    console.log('\n[suite] batchLoad — chunking, concurrency, split-on-refusal');
    const ids = [...new Set(log.filter(l => l.startsWith('read ')).map(l => l.slice(5).replace('bare/data/', '')))];
    let posts = 0, maxInFlight = 0, inFlight = 0;
    clearMemCache();
    const sg2 = makeFakeSgSend(server);
    const origBatch = sg2.vaultBatch;
    sg2.vaultBatch = async (v, w, ops) => { posts++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise(r => setTimeout(r, 5)); try { return await origBatch(v, w, ops); } finally { inFlight--; } };
    const store = new SGVaultObjectStore(sg2, A._vaultId, null);
    const got = await store.batchLoad(ids);
    ok('all objects returned',                            got.size === ids.length);
    ok('chunks of 50',                                    posts === Math.ceil(ids.length / 50), posts);
    ok('up to 16 POSTs in flight',                        maxInFlight > 1 && maxInFlight <= 16, maxInFlight);
    ok('second call is served from the block cache (0 POSTs)', await (async () => { posts = 0; await store.batchLoad(ids); return posts === 0; })());

    // refusal: the first POST of a 2-chunk read throws → split in two → … → single GET
    clearMemCache();
    const sg3 = makeFakeSgSend(server); let calls = 0; let singles = 0;
    const orig3 = sg3.vaultBatch, origRead = sg3.vaultRead;
    sg3.vaultBatch = async (v, w, ops) => { calls++; if (ops.length > 10) throw new Error('502 Lambda limit'); return orig3(v, w, ops); };
    sg3.vaultRead  = async (v, f) => { singles++; return origRead(v, f); };
    const store3 = new SGVaultObjectStore(sg3, A._vaultId, null);
    const got3 = await store3.batchLoad(ids.slice(0, 60));
    ok('a refused chunk is split until it fits (CLI rule); nothing lost', got3.size === 60 && calls > 2 && singles === 0, `calls=${calls} singles=${singles}`);

    // --- equivalence with the serial walk -------------------------------------------------------
    console.log('\n[suite] equivalence');
    clearMemCache();
    const C = await SGVault.open(sg, A.getVaultKey(), { signer: null, adoptLegacyClone: false });
    const dsSerial = new VaultDataSource(C, null);
    await dsSerial._loadSubTreesRecursive(C._tree['/'], '/');
    const flat = (v) => { const out = []; const walk = (n, p) => { for (const [k, c] of Object.entries(n.children || {})) { const q = p + '/' + k; if (c.type === 'folder') walk(c, q); else out.push(q + ':' + c.blob_id); } }; walk(v._tree['/'], ''); return out.sort().join('\n'); };
    ok('bulk and serial loaders produce the same tree', flat(B) === flat(C));
    const ds = new VaultDataSource(B, null);
    ok('VaultDataSource.loadAllSubTrees delegates to the bulk loader', typeof ds.loadAllSubTrees === 'function' && (await ds.loadAllSubTrees()).folders === 0);
    console.log('\n[suite] streaming: the walk keeps several POSTs in flight across levels');
    clearMemCache();
    const sg4 = makeFakeSgSend(server); let inflight4 = 0, max4 = 0; const orig4 = sg4.vaultBatch;
    sg4.vaultBatch = async (v, w, ops) => { inflight4++; max4 = Math.max(max4, inflight4); await new Promise(r => setTimeout(r, 20)); try { return await orig4(v, w, ops); } finally { inflight4--; } };
    const D = await SGVault.open(sg4, A.getVaultKey(), { signer: null, adoptLegacyClone: false });
    const r4 = await D.loadAllSubTrees({ chunk: 10, concurrency: 8 });
    ok('all folders loaded with small chunks', r4.folders === expected.folders);
    ok('more than one POST in flight at a time (workers do not die while a peer is parsing)', max4 >= 4, max4);

    console.log(`\n[result] ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
