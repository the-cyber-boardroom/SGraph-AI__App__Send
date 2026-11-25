/* Regression tests for the independent review of 2026-11-25 (claude/sleepy-einstein-s0z2ix).
   Each suite is one finding, written as the failure scenario the reviewer described.
   Run: node tests/unit/vault_ui/loader/test__review_findings_11_25.js */

import { loadVaultLibs, installLocalStorage, FakeServer, makeFakeSgSend, makeSigner, readJson, clearMemCache } from './sgit-parity-fakes.js';
loadVaultLibs(); installLocalStorage();
const { SGVault, SGVaultObjectStore, SGVaultCommit, SGVaultCrypto, SGSendCrypto } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info !== undefined ? ' — ' + info : '')); } };
async function codeOf(fn) { try { await fn(); return null; } catch (e) { return e && (e.code || e.message); } }
const PASS = 'review findings passphrase 2026';
const enc  = new TextEncoder();
const names = (v, p = '/') => (v.listFolder(p) || []).map(e => e.name).sort();
async function published(server, vault) { const sg = makeFakeSgSend(server); return SGVault.open(sg, vault.getVaultKey(), { signer: null, cloneBranch: 'web-ui:probe-' + Math.random().toString(16).slice(2, 8), adoptLegacyClone: false }); }

(async function () {
    // ── 1. A diverged push must merge, even when the session read the current ref ──────────
    console.log('\n[suite] 1. diverged push after reading the current ref keeps the published commits');
    {
        const server = new FakeServer();
        const A = await SGVault.create(makeFakeSgSend(server), PASS, { name: 'r1', signer: await makeSigner('aaaa') });
        const B = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: await makeSigner('bbbb') });
        await A.addFile('/', 'n1.txt', enc.encode('published by A')); await A.push();            // "the CLI pushed N1"
        await B.addFile('/', 'c.txt', enc.encode('unpushed on B'));                                 // B has C, diverged
        await B.getBehindCount();                                                                   // the sync-state check reads the CURRENT ref bytes
        await B.push();                                                                             // old code: CAS succeeded → N1 dropped
        const P = await published(server, A);
        ok('the published tree still has N1', names(P).includes('n1.txt'), names(P).join(','));
        ok('…and B\'s C', names(P).includes('c.txt'));
        const head = await P._commitManager.loadCommit(P._namedHeadId);
        ok('the published head is a merge that keeps A\'s commit as a parent', head.parents.length === 2);
        // pushIfMatch (child kernels) refuses a non-fast-forward instead of overwriting
        await A.merge(await A._refManager.readRef(A._refFileId));
        await A.addFile('/', 'n2.txt', enc.encode('A again')); await A.push();
        await B.addFile('/', 'd.txt', enc.encode('B again'));
        await B._refManager.readRef(B._refFileId);                                                  // baseline = current bytes
        ok('pushIfMatch on a diverged head → ECAS (caller merges and retries)', await codeOf(() => B.pushIfMatch()) === 'ECAS');
        ok('…and nothing was overwritten', names(await published(server, A)).includes('n2.txt'));
    }

    // ── 2. A rewound branch: auto-sync's push() must refuse, not republish ────────────────
    console.log('\n[suite] 2. push() refuses a rewound published branch');
    {
        const server = new FakeServer();
        const A = await SGVault.create(makeFakeSgSend(server), PASS, { name: 'r2', signer: await makeSigner('aaaa') });
        await A.addFile('/', 'ok.txt', enc.encode('fine')); await A.push();
        const R = A._headCommitId;
        await A.addFile('/', 'secret.txt', enc.encode('leaked')); await A.push();
        const X = A._headCommitId;
        const W = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: await makeSigner('cccc') });   // device W accepted X
        ok('device W starts at X', W._headCommitId === X && W.lastAcceptedHead === X);
        await A._refManager.writeRef(A._refFileId, R);                                              // owner force-pushes back to R
        await W.addFile('/', 'mine.txt', enc.encode('W work'));                                     // W is "ahead"
        ok('push() → EREWOUND (the auto-sync path)', await codeOf(() => W.push()) === 'EREWOUND');
        ok('the secret was NOT republished', !names(await published(server, A)).includes('secret.txt'));

        // ── 4. Accept rewind moves the device; own work re-applied on top; removed commits stay removed
        console.log('\n[suite] 4. accepting a rewind drops the removed commits and keeps own work');
        const r = await W.merge(R, { acceptRewind: true });
        ok('merge reports the rewind accepted', r && r.rewindAccepted === true, JSON.stringify(r));
        const head = await W._commitManager.loadCommit(W._headCommitId);
        ok('own changes re-applied as one commit whose only parent is R', head.parents.length === 1 && head.parents[0] === R);
        ok('working tree: own file kept, removed file gone', names(W).includes('mine.txt') && !names(W).includes('secret.txt'), names(W).join(','));
        ok('the banner clears: the remote head is forward again', (await W.getBehindCount(), W.remoteHeadStatus) === 'forward');
        await W.push();
        const P = await published(server, A);
        ok('after push: mine.txt published, secret.txt still not', names(P).includes('mine.txt') && !names(P).includes('secret.txt'), names(P).join(','));
        // a device with NO own work just moves to R
        const V = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: await makeSigner('dddd') });
        const newHead = V._namedHeadId;
        await A._refManager.writeRef(A._refFileId, R);
        await V.merge(R, { acceptRewind: true });
        ok('a device with no own commits moves straight to R', V._headCommitId === R && V.lastAcceptedHead === R, newHead);
    }

    // ── 5. A read-only token keeps the ref it names ───────────────────────────────────────
    console.log('\n[suite] 5. read-only open keeps the token\'s ref');
    {
        const server = new FakeServer();
        const A = await SGVault.create(makeFakeSgSend(server), PASS, { name: 'r5', signer: await makeSigner('aaaa') });
        await A.addFile('/', 'x.txt', enc.encode('x')); await A.push();
        const raw = new Uint8Array(await crypto.subtle.exportKey('raw', A._readKey));
        const b64 = btoa(String.fromCharCode(...raw));
        const RO  = await SGVault.openReadOnly(makeFakeSgSend(server), A._vaultId, b64, A._cloneRefFileId);   // a token naming a non-'current' ref
        ok('the ref is the token\'s, not the index\'s current', RO._refFileId === A._cloneRefFileId);
    }

    // ── 6/7. Unloaded folders: merges refuse, writes load first ─────────────────────────────
    console.log('\n[suite] 6. a merge refuses when a folder could not be loaded');
    {
        const server = new FakeServer();
        const A = await SGVault.create(makeFakeSgSend(server), PASS, { name: 'r6', signer: null });
        await A.createFolder('/docs'); await A.addFile('/docs', 'a.md', enc.encode('a')); await A.push();
        const B = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: null, cloneBranch: 'web-ui:b6' });
        await A.addFile('/', 'top.txt', enc.encode('t')); await A.push();
        await B.addFile('/', 'other.txt', enc.encode('o'));
        B.loadAllSubTrees = async () => ({ folders: 0, failed: [{ tree_id: 'obj-cas-imm-000000000000', reason: 'network down' }] });
        ok('merge → EINCOMPLETE', await codeOf(() => B.merge(A._headCommitId)) === 'EINCOMPLETE');
        delete B.loadAllSubTrees;

        console.log('\n[suite] 7. a write into an unloaded folder loads it first (nothing dropped)');
        clearMemCache();
        const C = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: null, cloneBranch: 'web-ui:c7' });
        ok('docs starts lazy', C.needsLoading('/docs'));
        await C.addFile('/docs', 'b.md', enc.encode('b')); await C.push();
        const P = await published(server, A); await P.loadAllSubTrees();
        ok('the new file AND the existing one are in the published folder', names(P, '/docs').join(',') === 'a.md,b.md', names(P, '/docs').join(','));
        // the guard: a hand-made write into a lazy node is refused at commit time, not dropped
        const D = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: null, cloneBranch: 'web-ui:d7' });
        D._findNode('/docs').children['sneaky.md'] = { type: 'file', blob_id: 'obj-cas-imm-000000000000', size: 1, content_hash: 'x' };
        D._markDirty('/docs');
        ok('commit over a dirty lazy folder → EUNLOADED', await codeOf(() => D._commit('sneaky')) === 'EUNLOADED');
    }

    // ── 8. A walk that started on an older tree does not satisfy a caller of the new tree ───
    console.log('\n[suite] 8. concurrent loadAllSubTrees calls share a walk only over the same tree');
    {
        const server = new FakeServer();
        const A = await SGVault.create(makeFakeSgSend(server), PASS, { name: 'r8', signer: null });
        await A.createFolder('/f'); await A.addFile('/f', 'x', enc.encode('x')); await A.push();
        clearMemCache();
        const B = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: null, cloneBranch: 'web-ui:b8' });
        const first = B.loadAllSubTrees();
        await B._loadTreeFromCommit(B._headCommitId);                                                // a pull replaces the tree mid-walk
        const second = await B.loadAllSubTrees();
        await first;
        ok('the second call ran its own walk on the new tree', second.folders === 1 && !B.needsLoading('/f'));
    }

    // ── 9. Per-object non-ok results are retried with a plain GET ──────────────────────────
    console.log('\n[suite] 9. batchLoad retries per-object errors instead of reporting them missing');
    {
        const server = new FakeServer(); const sg = makeFakeSgSend(server);
        server.put('vault9xx', 'bare/data/obj-cas-imm-aaaaaaaaaaaa', enc.encode('A'));
        server.put('vault9xx', 'bare/data/obj-cas-imm-bbbbbbbbbbbb', enc.encode('B'));
        const orig = sg.vaultBatch;
        sg.vaultBatch = async (v, w, ops) => (await orig(v, w, ops)).map(r => r.file_id.endsWith('b') ? { file_id: r.file_id, status: 'error' } : r);
        const failures = new Map(); clearMemCache();
        const got = await new SGVaultObjectStore(sg, 'vault9xx', null).batchLoad(['obj-cas-imm-aaaaaaaaaaaa', 'obj-cas-imm-bbbbbbbbbbbb', 'obj-cas-imm-cccccccccccc'], { failures });
        ok('the errored object was fetched by GET', got.size === 2 && new TextDecoder().decode(got.get('obj-cas-imm-bbbbbbbbbbbb')) === 'B');
        ok('only the truly absent one is reported, as not_found', failures.size === 1 && failures.get('obj-cas-imm-cccccccccccc') === 'not_found');
    }

    // ── 10. Under signatures-required a key that could not be registered refuses the push ───
    console.log('\n[suite] 10. signing key registration failure refuses the push under signatures-required');
    {
        const server = new FakeServer();
        const A = await SGVault.create(makeFakeSgSend(server), PASS, { name: 'r10', signer: await makeSigner('aaaa') });
        const { raw, index } = await A._refManager.readBranchIndexRaw(A._branchIndexFileId);
        await A._refManager.writeBranchIndexIfMatch(A._branchIndexFileId, Object.assign({}, index, { features: ['signatures-required'] }), raw);
        const N = await SGVault.open(makeFakeSgSend(server), A.getVaultKey(), { signer: await makeSigner('eeee') });
        N._refManager.writePublicKey = async () => { throw new Error('503 from the server'); };
        await N.addFile('/', 'n.txt', enc.encode('n'));
        ok('push → ESIGNATURE, nothing published', await codeOf(() => N.push()) === 'ESIGNATURE' && !names(await published(server, A)).includes('n.txt'));
        // a key missing at first and registered later is found (no cached null)
        const fake = { signature: 'AA==', author_key_id: 'key-rnd-imm-1111111111111111', tree_id: 'obj-cas-imm-000000000000', parents: [] };
        ok('unknown key → no-key', await A.verifyCommit('x', fake) === 'no-key');
        ok('…and not cached: the cache holds no entry for it', !A._publicKeyCache.has('key-rnd-imm-1111111111111111'));
    }

    // ── 13. Sizes ≥ 2 GiB survive the tree round trip ──────────────────────────────────────
    console.log('\n[suite] 13. file sizes are not truncated to 32 bits');
    {
        const server = new FakeServer(); const sg = makeFakeSgSend(server);
        const A = await SGVault.create(sg, PASS, { name: 'r13', signer: null });
        const big = 3 * 1024 * 1024 * 1024 + 7;
        const id  = await A._commitManager.createTree([{ name: 'huge.bin', size: big, content_hash: 'abcdefabcdef', blob_id: 'obj-cas-imm-1abfd21f1430', tree_id: null, large: true }]);
        const t   = await A._commitManager.loadTree(id);
        ok('3 GiB + 7 round-trips exactly', t.entries[0].size === big, t.entries[0].size);
    }

    console.log(`\n[result] ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
