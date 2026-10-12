/* sgit-ai 0.21 parity, end to end on the REAL vault libraries over an in-memory server
   that mirrors Service__Vault__Pointer (CAS conflicts inside HTTP 200, batch stops on
   conflict). Covers the five items of the 10/12 architect review:
     1. format gate read on open; 32-hex ids on a format-2 vault; unknown format refused
     2. branch index as a shared document: CLI entries, gate and tags survive web pushes
     3. signed commit_v1 (ten members, JCS, author_key_id), key registration, verification
        statuses, 'signatures-required' refusing unsigned pushes and pulls
     4. rewind detection (EREWOUND, acceptRewind) and compare-and-swap push with reconcile
     5. deterministic trees: same content → same tree id; CLI vector reproduced via createTree
   Run: node tests/unit/vault_ui/loader/test__sgit_parity.js */

import { readFileSync }  from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadVaultLibs, installLocalStorage, FakeServer, makeFakeSgSend, makeSigner, readJson } from './sgit-parity-fakes.js';

loadVaultLibs(); installLocalStorage();
const { SGVault, SGVaultSigning, SGVaultBranchIndex, SGVaultCommit, SGVaultObjectStore, SGSendCrypto } = globalThis;
const V = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sgit_interop_vectors.json', import.meta.url)), 'utf8'));

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + String(info) : '')); } }
async function throwsCode(fn, code) { try { await fn(); return false; } catch (e) { return e && e.code === code ? true : 'threw ' + (e && (e.code || e.message)); } }
const PASS = 'parity test passphrase 2026';   // not word-word-NNNN: that shape is a legacy simple token in open()
const enc  = new TextEncoder();
const hex  = (u8) => Array.from(new Uint8Array(u8)).map(b => b.toString(16).padStart(2, '0')).join('');

(async function () {
    const server = new FakeServer();
    const sgA = makeFakeSgSend(server), sgB = makeFakeSgSend(server), sgC = makeFakeSgSend(server);
    const signerA = await makeSigner('aaaa'), signerB = await makeSigner('bbbb');

    // ---------------------------------------------------------------- 3. signed create
    console.log('\n[suite] create: signed commit_v1, key registered, index with named + clone entry');
    const A = await SGVault.create(sgA, PASS, { name: 'parity', signer: signerA });
    const key = A.getVaultKey();
    const c0 = await readJson(A, 'bare/data/' + A._headCommitId);
    ok('schema commit_v1', c0.schema === 'commit_v1');
    ok('exactly the ten CLI members', Object.keys(c0).sort().join(',') === SGVaultSigning.COMMIT_MEMBERS.slice().sort().join(','));
    ok('author_key_id is the signer key', c0.author_key_id === signerA.keyId);
    ok('branch_id is the signer clone branch', c0.branch_id === signerA.branchId && SGVaultSigning.BRANCH_ID_RE.test(c0.branch_id));
    ok('attestations [] / author_signature null', Array.isArray(c0.attestations) && c0.attestations.length === 0 && c0.author_signature === null);
    const pubPem = await A._refManager.readPublicKeyPem(signerA.keyId);
    ok('bare/keys/<keyId> holds {"type":"public","pem"}', !!pubPem && pubPem.includes('BEGIN PUBLIC KEY'));
    ok('signature verifies under the registered key', await SGVaultSigning.verifyCommit(c0, await SGVaultSigning.importPublicKeyPem(pubPem)));
    ok('verifyCommit → verified', await A.verifyCommit(A._headCommitId) === 'verified');
    const idx0 = await readJson(A, 'bare/indexes/' + A._branchIndexFileId);
    ok('index has a named entry "current"', idx0.branches.some(b => b.branch_type === 'named' && b.name === 'current' && b.head_ref_id === A._refFileId));
    const cloneA = idx0.branches.find(b => b.branch_id === signerA.branchId);
    ok('index has our clone entry with public_key_id', !!cloneA && cloneA.branch_type === 'clone' && cloneA.public_key_id === signerA.keyId && cloneA.head_ref_id === A._cloneRefFileId);
    ok('a never-raised vault carries no format field', !('format' in idx0));
    ok('no blind PUT of the index (CAS batch only)', !server.log.some(l => l.startsWith('PUT bare/indexes/')));

    // ---------------------------------------------------------------- 5. deterministic trees
    console.log('\n[suite] deterministic trees');
    await A.addFile('/', 'hello.txt', enc.encode('hello'));
    const t1 = (await A._commitManager.loadCommit(A._headCommitId)).tree_id;
    await A.updateFile('/', 'hello.txt', enc.encode('hello'));           // same bytes again
    const t2 = (await A._commitManager.loadCommit(A._headCommitId)).tree_id;
    ok('same content → same tree id (HMAC IV, sorted entries, Python separators)', t1 === t2);
    const tree = await readJson(A, 'bare/data/' + t1);
    ok('entry has the seven CLI members in CLI order', Object.keys(tree.entries[0]).join(',') === 'blob_id,tree_id,name_enc,size_enc,content_hash_enc,content_type_enc,large');
    const loaded = await A._commitManager.loadTree(t1);
    const helloEntry = loaded.entries.find(e => e.name === 'hello.txt');
    ok('content_type guessed like Python mimetypes', helloEntry.content_type === 'text/plain');
    ok('.vault-settings.json entry is application/json', loaded.entries.find(e => e.name === '.vault-settings.json').content_type === 'application/json');
    ok('files sorted by name', loaded.entries.map(e => e.name).join(',') === '.vault-settings.json,hello.txt');
    // CLI vector through the real createTree
    {
        const rk      = Uint8Array.from(V.tree_deterministic.read_key_hex.match(/../g).map(x => parseInt(x, 16)));
        const aesKey  = await crypto.subtle.importKey('raw', rk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        const hmacKey = await crypto.subtle.importKey('raw', rk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const stored  = {};
        const store   = { store: async (ct) => { const id = await new SGVaultObjectStore({}, 'v', null).computeObjectId(ct); stored[id] = ct; return id; } };
        const cm      = new SGVaultCommit(store, aesKey, hmacKey);
        const ve      = JSON.parse(V.tree_deterministic.plaintext_utf8).entries[0];
        const dec     = async (b64) => new TextDecoder().decode(await SGSendCrypto.decrypt(SGVaultCommit._base64ToArrayBuffer(b64), aesKey));
        const id = await cm.createTree([{ name: V.tree_deterministic.name_plain, size: Number(await dec(ve.size_enc)), content_hash: await dec(ve.content_hash_enc),
                                           content_type: null, large: false, blob_id: ve.blob_id, tree_id: null }]);
        ok('createTree reproduces the CLI tree vector id', id === V.tree_deterministic.object_id, id);
        ok('…and its ciphertext byte for byte', hex(stored[id]) === V.tree_deterministic.ciphertext_hex);
    }

    // ---------------------------------------------------------------- 2+3. second device
    console.log('\n[suite] second device: verification, index union, CAS push');
    await A.push();
    const B = await SGVault.open(sgB, key, { signer: signerB });
    ok('B sees the published head', B._headCommitId === A._headCommitId);
    const rep = await B.verifyChain(B._headCommitId);
    ok('B verifies A\'s whole history (' + rep.total + ' commits)', rep.counts.verified === rep.total && rep.total >= 3, JSON.stringify(rep.counts));
    await B.addFile('/', 'b.md', enc.encode('# b'));
    await B.push();
    const idx1 = await readJson(A, 'bare/indexes/' + A._branchIndexFileId);
    ok('index now holds A\'s and B\'s clone entries plus the named one', idx1.branches.length === 3 && idx1.branches.some(b => b.branch_id === signerA.branchId) && idx1.branches.some(b => b.branch_id === signerB.branchId));
    ok('B\'s commit verifies on A (key fetched from bare/keys)', await A.verifyCommit(B._headCommitId) === 'verified');

    // CAS: A and B both commit; A publishes first; B's push reconciles instead of overwriting
    await A.merge(await A._refManager.readRef(A._refFileId));      // A catches up with B
    await A.addFile('/', 'a2.txt', enc.encode('a2'));
    await B.addFile('/', 'b2.txt', enc.encode('b2'));
    await A.push();
    const headBeforeB = await A._refManager.readRef(A._refFileId);
    await B.push();
    const headAfterB  = await A._refManager.readRef(A._refFileId);
    ok('B\'s push did not overwrite A\'s publish (CAS miss → merge → push)', headAfterB !== headBeforeB && headAfterB === B._headCommitId);
    const mergeCommit = await B._commitManager.loadCommit(headAfterB);
    ok('the published head is a merge of both', mergeCommit.parents.length === 2 && mergeCommit.parents.includes(headBeforeB));
    ok('merge commit is signed by B', await A.verifyCommit(headAfterB) === 'verified');
    await A.merge(headAfterB);
    ok('A has both files after merging', A.listFolder('/').map(e => e.name).includes('a2.txt') && A.listFolder('/').map(e => e.name).includes('b2.txt'));

    // ---------------------------------------------------------------- 4. rewinds
    console.log('\n[suite] rewind detection');
    const goodHead = await A._refManager.readRef(A._refFileId);
    const old      = mergeCommit.parents[0];                        // an ancestor of the published head
    await A._refManager.writeRef(A._refFileId, old);               // the host (or a forced push) moves the branch back
    ok('B classifies the moved ref as rewound', (await B.getBehindCount(), B.remoteHeadStatus) === 'rewound');
    ok('B.pull() refuses with EREWOUND', await throwsCode(() => B.pull(), 'EREWOUND') === true);
    ok('B.merge(old) refuses with EREWOUND', await throwsCode(() => B.merge(old), 'EREWOUND') === true);
    ok('nothing changed on B', B._headCommitId === headAfterB);
    const res = await B.merge(old, { acceptRewind: true });
    ok('merge with acceptRewind proceeds (their head is behind us: up to date)', !!res && res.upToDate === true);
    await A._refManager.writeRef(A._refFileId, goodHead);          // restore
    ok('forward move is forward again', (await B.getBehindCount(), B.remoteHeadStatus) === 'forward');

    // ---------------------------------------------------------------- 1. format gate
    console.log('\n[suite] format gate (owner raises to format 2 + signatures-required, as `sgit vault format` writes it)');
    {
        const { raw, index } = await A._refManager.readBranchIndexRaw(A._branchIndexFileId);
        const raised = Object.assign({}, index, {
            format: 2, min_client: '0.21.0',
            features: ['ids-128', 'signatures-required', 'signed-since-' + goodHead.slice('obj-cas-imm-'.length, 'obj-cas-imm-'.length + 12)],
            tags: [{ name: 'v1', tag_id: 'obj-cas-imm-0123456789ab', timestamp_ms: 1700000000000, deleted: false }],
            branches: index.branches.concat([{ branch_id: 'branch-clone-cafecafecafecafe', name: 'local', branch_type: 'clone', head_ref_id: 'ref-pid-snw-cafecafecafe',
                                               public_key_id: 'key-rnd-imm-cafecafecafecafe', private_key_id: null, created_at: 1700000000000, creator_branch: null, future_field: 'kept' }]),
            some_future_member: { x: 1 }
        });
        await A._refManager.writeBranchIndexIfMatch(A._branchIndexFileId, raised, raw);
    }
    const A2 = await SGVault.open(sgA, key, { signer: signerA });
    ok('format 2 read on open', A2.format === 2 && A2._objectStore.idHexLen === 32);
    ok('features read on open', A2.hasFeature('signatures-required') && A2.minClient === '0.21.0');
    ok('tags readable', A2.getTags().v1 === 'obj-cas-imm-0123456789ab');
    await A2.addFile('/', 'wide.txt', enc.encode('wide'));
    const wideEntry = A2.listFolder('/').find(e => e.name === 'wide.txt');
    ok('new blob id is 44 characters (32 hex)', wideEntry.blob_id.length === 44 && /^obj-cas-imm-[0-9a-f]{32}$/.test(wideEntry.blob_id), wideEntry.blob_id);
    ok('new commit id is 32 hex too', /^obj-cas-imm-[0-9a-f]{32}$/.test(A2._headCommitId));
    ok('old 12-hex objects still load', (await A2.getFile('/', 'hello.txt')).byteLength === 5);
    await A2.push();
    const idx2 = await readJson(A2, 'bare/indexes/' + A2._branchIndexFileId);
    ok('gate survives a web push', idx2.format === 2 && idx2.min_client === '0.21.0' && idx2.features.includes('signatures-required') && idx2.features.includes('ids-128'));
    ok('CLI clone entry survives, unknown entry field kept', idx2.branches.some(b => b.branch_id === 'branch-clone-cafecafecafecafe' && b.future_field === 'kept'));
    ok('tags survive', Array.isArray(idx2.tags) && idx2.tags[0].name === 'v1');
    ok('unknown top-level member kept', idx2.some_future_member && idx2.some_future_member.x === 1);
    ok('A, B and the CLI entries all present', idx2.branches.length === 4);
    ok('an unknown format refuses the open (EFORMAT)', await (async () => {
        const { raw, index } = await A2._refManager.readBranchIndexRaw(A2._branchIndexFileId);
        await A2._refManager.writeBranchIndexIfMatch(A2._branchIndexFileId, Object.assign({}, index, { format: 9 }), raw);
        const r = await throwsCode(() => SGVault.open(sgA, key, { signer: signerA }), 'EFORMAT');
        const again = await A2._refManager.readBranchIndexRaw(A2._branchIndexFileId);
        await A2._refManager.writeBranchIndexIfMatch(A2._branchIndexFileId, Object.assign({}, again.index, { format: 2 }), again.raw);
        return r === true;
    })());

    // ---------------------------------------------------------------- 3. signatures-required
    console.log('\n[suite] signatures-required');
    const C = await SGVault.open(sgC, key, { signer: null, cloneBranch: 'web-ui:nokey' });   // a session with no key (sandbox / private mode)
    await C.addFile('/', 'c.txt', enc.encode('c'));
    const cUnsigned = await readJson(C, 'bare/data/' + C._headCommitId);
    ok('an unsigned commit still has the ten members, signature null, branch_id null', cUnsigned.signature === null && cUnsigned.author_key_id === null && cUnsigned.branch_id === null && Object.keys(cUnsigned).length === 10);
    ok('C.push() is refused with ESIGNATURE before anything is sent', await throwsCode(() => C.push(), 'ESIGNATURE') === true);
    const B2 = await SGVault.open(sgB, key, { signer: signerB });
    await B2.addFile('/', 'b3.txt', enc.encode('b3'));
    ok('B (signed) pushes under the policy', await B2.push().then(() => true, e => e.message));
    ok('push({force:true}) is still refused under the policy (the check runs before anything is sent)', await throwsCode(() => C.push({ force: true }), 'ESIGNATURE') === true);
    // the host moves the ref to C's unsigned commit (what a tampering host or an old client could do): readers refuse it
    await C._refManager.writeRef(C._refFileId, C._headCommitId);
    const unsignedHead = await B2._refManager.readRef(B2._refFileId);
    ok('B refuses to pull an unsigned published commit (ESIGNATURE)', await throwsCode(() => B2.merge(unsignedHead, { acceptRewind: true }), 'ESIGNATURE') === true);
    ok('status of the unsigned commit is "unsigned"', await B2.verifyCommit(C._headCommitId) === 'unsigned');
    ok('a commit with an unknown key is "no-key"', await (async () => {
        const fake = Object.assign({}, c0, { author_key_id: 'key-rnd-imm-0000000000000000' });
        return (await B2.verifyCommit('x', fake)) === 'no-key';
    })());
    ok('a tampered commit is "bad"', await (async () => {
        const fake = Object.assign({}, c0, { tree_id: 'obj-cas-imm-000000000000' });
        return (await B2.verifyCommit('x', fake)) === 'bad';
    })());

    // ---------------------------------------------------------------- legacy forms
    console.log('\n[suite] legacy forms');
    ok('verifyCommit on an old web commit_v2 (7 members, unsigned) → unsigned', await B2.verifyCommit('x', { schema: 'commit_v2', parents: [], tree_id: t1, timestamp_ms: 1, message_enc: null, branch_id: null, signature: null }) === 'unsigned');
    {   // a pre-0.19 CLI commit: author_key_id null, signed over the legacy bytes; key via the index's branch mapping
        const priv = await crypto.subtle.importKey('pkcs8', SGVaultSigning.pemBody(V.commit_signing.test_private_key_pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const legacy = { schema: 'commit_v1', tree_id: t1, message_enc: null, branch_id: 'branch-clone-cafecafecafecafe', signature: null, author_key_id: null, author_signature: null, parents: [], timestamp_ms: 1759795200000, attestations: [] };
        legacy.signature = await SGVaultSigning.sign(priv, SGVaultSigning.legacySigningBytes(legacy));
        // register the vector's public key under the CLI entry's key id
        await A2._refManager.writePublicKey('key-rnd-imm-cafecafecafecafe', enc.encode(JSON.stringify({ type: 'public', pem: V.commit_signing.test_public_key_pem })));
        const fresh = await SGVault.open(sgB, key, { signer: signerB }).catch(() => null);   // may refuse: unsigned head published above
        const v = fresh || B2;
        v._publicKeyCache.clear();
        ok('legacy-signed CLI commit verifies through branch → public_key_id (legacy bytes)', await v.verifyCommit('x', legacy) === 'verified');
    }

    // ---------------------------------------------------------------- legacy shared clone ref
    console.log('\n[suite] migration: unpublished work on the old shared clone ref is adopted by a signed device');
    {
        const server2 = new FakeServer(); const sg1 = makeFakeSgSend(server2), sg2 = makeFakeSgSend(server2), sg3 = makeFakeSgSend(server2);
        const L = await SGVault.create(sg1, PASS, { name: 'legacy', signer: null });        // pre-signing session: shared 'web-ui' ref
        ok('an unsigned session still uses the shared legacy clone ref name', L._cloneBranch === 'web-ui');
        await L.addFile('/', 'draft.txt', enc.encode('unpublished'));                        // committed, never pushed
        const S = await SGVault.open(sg2, L.getVaultKey(), { signer: await makeSigner('cccc') });
        ok('a signed device has its own clone ref', S._cloneBranch.startsWith('web-ui:branch-clone-') && S._cloneRefFileId !== L._cloneRefFileId);
        ok('…and adopts the legacy unpublished head (nothing lost)', S._headCommitId === L._headCommitId && !!S._adoptedLegacyClone);
        await S.addFile('/', 'mine.txt', enc.encode('m'));
        ok('its commit lands on its own ref', await S._refManager.readRef(S._cloneRefFileId) === S._headCommitId);
        await S.push();
        const T = await SGVault.open(sg3, L.getVaultKey(), { signer: await makeSigner('dddd') });
        ok('once published, a later device does not adopt the legacy ref', !T._adoptedLegacyClone && T._headCommitId === S._headCommitId);
        ok('adoptLegacyClone:false opts out', !(await SGVault.open(sg3, L.getVaultKey(), { signer: await makeSigner('eeee'), adoptLegacyClone: false }))._adoptedLegacyClone);
    }

    console.log(`\n[result] ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
