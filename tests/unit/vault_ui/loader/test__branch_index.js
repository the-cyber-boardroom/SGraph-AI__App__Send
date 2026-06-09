/* Unit tests — SGVaultRefManager.writeBranchIndex / readBranchIndex (sgit CLI interop)
   Run: node tests/unit/vault_ui/loader/test__branch_index.js
   No deps beyond Node's global Web Crypto. Sources the browser global-scope modules via
   runInThisContext with a fake SGSend (captures vaultWrite, serves vaultRead). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const VAULT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
function load(rel) {
    const p = fileURLToPath(new URL(VAULT + rel, import.meta.url));
    runInThisContext(readFileSync(p, 'utf8'), { filename: rel, displayErrors: true });
}
load('lib/sg-send/sg-send-crypto.js');
load('lib/sg-vault/sg-vault-ref-manager.js');
runInThisContext('globalThis.SGVaultRefManager = SGVaultRefManager; globalThis.SGSendCrypto = SGSendCrypto;');
const { SGVaultRefManager } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

// Fake SGSend: an in-memory bare/ store. writeBranchIndex calls vaultWrite; readBranchIndex calls vaultRead.
function fakeSgSend() {
    const store = {};
    return {
        _store: store,
        async vaultWrite(vaultId, filePath, writeKey, data) { store[filePath] = data; return { ok: true }; },
        async vaultRead(vaultId, filePath) { return store[filePath] ? store[filePath] : null; }
    };
}

(async function () {
    const readKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const sg = fakeSgSend();
    const rm = new SGVaultRefManager(sg, 'vault123', 'writekeyhex', readKey);
    const IDX = 'idx-pid-muw-abc123def456';
    const REF = 'ref-pid-muw-def456abc123';

    console.log('\n[suite] writeBranchIndex — single-branch index for CLI clone');
    await rm.writeBranchIndex(IDX, REF);
    ok('writes to bare/indexes/<idx>', !!sg._store['bare/indexes/' + IDX]);
    ok('does NOT write to bare/idx/ (path is bare/indexes/)', !sg._store['bare/idx/' + IDX]);

    console.log('\n[suite] round-trips via readBranchIndex (the path open() uses)');
    const idx = await rm.readBranchIndex(IDX);
    ok('schema is branch_index_v1',          idx && idx.schema === 'branch_index_v1');
    ok('one branch entry',                   idx && Array.isArray(idx.branches) && idx.branches.length === 1);
    ok('branch_type is "named"',             idx && idx.branches[0].branch_type === 'named');
    ok('head_ref_id points at the named ref',idx && idx.branches[0].head_ref_id === REF);
    ok('no timestamp in plaintext (stable)', idx && idx.branches[0].created_at === undefined);

    console.log('\n[suite] open()-style lookup finds the named ref from the index');
    const named = idx.branches.find(b => b.branch_type === 'named');
    ok('named branch resolvable',            !!(named && named.head_ref_id === REF));

    // --- CLI wire contract (sgit Schema__Branch_Index — round 2 review) -------------
    // branch_id must match the CLI's Safe_Str__Branch_Id regex; name must be "current"
    // (hardcoded in 10+ CLI workflow steps). A malformed index is strictly worse than
    // no index — it bypasses the CLI's absent-index fallback and crashes parse.
    console.log('\n[suite] CLI wire contract — branch_id regex + name == "current"');
    const BRANCH_ID_RE = /^branch-(named|clone)-[0-9a-f]{8,64}$/;
    ok('branch_id matches CLI regex',        BRANCH_ID_RE.test(idx.branches[0].branch_id));
    ok('branch_id is NOT "branch-named-main" (would fail regex)',
                                              idx.branches[0].branch_id !== 'branch-named-main');
    ok('name is "current" (CLI hardcode)',   idx.branches[0].name === 'current');
    ok('name is NOT "main" (would fail lookup)', idx.branches[0].name !== 'main');

    console.log('\n[suite] branch_id is deterministic + opaque (per-vault)');
    const sg2 = fakeSgSend();
    const rm2 = new SGVaultRefManager(sg2, 'vaultB', 'wk2', readKey);
    await rm2.writeBranchIndex(IDX, REF);
    const idx2 = await rm2.readBranchIndex(IDX);
    ok('same idx → same branch_id (deterministic)',
                                              idx.branches[0].branch_id === idx2.branches[0].branch_id);
    const IDX_OTHER = 'idx-pid-muw-ffffffffffff';
    await rm.writeBranchIndex(IDX_OTHER, REF);
    const idxOther = await rm.readBranchIndex(IDX_OTHER);
    ok('different idx → different branch_id (per-vault)',
                                              idx.branches[0].branch_id !== idxOther.branches[0].branch_id);

    console.log('\n[suite] guards');
    const before = Object.keys(sg._store).length;
    await rm.writeBranchIndex('', REF);          // missing idx → no-op
    await rm.writeBranchIndex(IDX, '');          // missing ref → no-op
    ok('no-op on missing id/ref',            Object.keys(sg._store).length === before);

    console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
    process.exit(fail ? 1 : 0);
})();
