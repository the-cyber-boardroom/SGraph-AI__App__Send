/* Unit tests — vault write-batch (collapse a commit's PUTs into one POST /batch)
   Run: node tests/unit/vault_ui/loader/test__write_batch.js

   Exercises the object-store batch buffer + ref-manager staging directly, with a fake SGSend
   that counts vaultWrite (PUT) vs vaultBatch (POST) and captures the ops. No DOM. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const VAULT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (rel) => runInThisContext(readFileSync(fileURLToPath(new URL(VAULT + rel, import.meta.url)), 'utf8'), { filename: rel, displayErrors: true });
load('lib/sg-send/sg-send-crypto.js');
load('lib/sg-send/sg-send.js');
load('lib/sg-vault/sg-vault-interop.js');
load('lib/sg-vault/sg-vault-object-store.js');
load('lib/sg-vault/sg-vault-ref-manager.js');
load('lib/sg-vault/sg-vault-commit.js');
load('lib/sg-vault/sg-vault.js');
runInThisContext('globalThis.SGVaultObjectStore = SGVaultObjectStore; globalThis.SGVaultRefManager = SGVaultRefManager; globalThis.SGSendCrypto = SGSendCrypto; globalThis.SGVault = SGVault;');
const { SGVaultObjectStore, SGVaultRefManager, SGVault } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

function fakeSgSend() {
    return {
        puts: 0, batches: 0, lastBatchOps: null,
        async vaultWrite(vaultId, filePath, wk, bytes) { this.puts++; return { ok: true }; },
        async vaultRead(vaultId, filePath) { return null; },     // the index upsert reads the server copy first (absent here)
        async vaultBatch(vaultId, wk, ops) { this.batches++; this.lastBatchOps = ops; return ops.map(o => ({ op: o.op, file_id: o.file_id, status: 'ok' })); }
    };
}
const buf = (s) => new TextEncoder().encode(s).buffer;

(async function () {
    const readKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

    console.log('\n[suite] non-batch mode (unchanged) — store() is a direct PUT');
    const sgA = fakeSgSend();
    const osA = new SGVaultObjectStore(sgA, 'vaultA', 'wk');
    await osA.store(buf('blob-1'));
    await osA.store(buf('blob-2'));
    ok('2 stores → 2 PUTs, 0 batch', sgA.puts === 2 && sgA.batches === 0);
    ok('not batching by default', osA.batching === false);

    console.log('\n[suite] batch mode — stores stage, one flush = one POST');
    const sgB = fakeSgSend();
    const osB = new SGVaultObjectStore(sgB, 'vaultB', 'wk');
    const rmB = new SGVaultRefManager(sgB, 'vaultB', 'wk', readKey, osB);
    osB.beginBatch();
    ok('batching active', osB.batching === true);
    const id1 = await osB.store(buf('the blob'));
    const id2 = await osB.store(buf('the tree'));
    const id3 = await osB.store(buf('the commit'));
    await rmB.writeRef('ref-pid-snw-clone0000', id3);
    await rmB.writeRef('ref-pid-muw-named00000', id3);
    ok('no PUTs while staging',          sgB.puts === 0);
    ok('no POST until flush',            sgB.batches === 0);
    ok('store() returns content id',     id1.startsWith('obj-cas-imm-'));
    await osB.flushBatch();
    ok('exactly ONE POST /batch on flush', sgB.batches === 1 && sgB.puts === 0);
    ok('all 5 writes in the one batch',  sgB.lastBatchOps.length === 5);
    ok('not batching after flush',       osB.batching === false);

    // The branch index is a SHARED document (sgit-ai 0.19+): it is never staged into the commit
    // batch. It is read, merged and written with compare-and-swap as its own request, after the
    // objects and refs have landed — a CAS conflict inside the commit batch would abort the ref
    // writes that follow it (the server stops a batch at the first conflict).
    osB.beginBatch();
    await rmB.writeBranchIndex('idx-pid-muw-index0000', 'ref-pid-muw-named00000');
    ok('index upsert is its own POST, not staged', sgB.batches === 2 && sgB.lastBatchOps.length === 1 && sgB.lastBatchOps[0].file_id === 'bare/indexes/idx-pid-muw-index0000');
    ok('absent on the server → plain write op',   sgB.lastBatchOps[0].op === 'write');
    osB.discardBatch();

    console.log('\n[suite] ordering — objects before refs (indexes never in the batch)');
    const first = await (async () => { const sg = fakeSgSend(); const os = new SGVaultObjectStore(sg, 'v', 'wk'); const rm = new SGVaultRefManager(sg, 'v', 'wk', readKey, os);
        os.beginBatch(); await rm.writeRef('ref-pid-muw-named00000', 'obj-cas-imm-aaaaaaaaaaaa'); await os.store(buf('x')); await os.store(buf('y')); await os.flushBatch(); return sg.lastBatchOps; })();
    const ranks = first.map(o => o.file_id.startsWith('bare/data/') ? 0 : (o.file_id.startsWith('bare/indexes/') ? 1 : 2));
    ok('ops sorted data → refs',   ranks.every((r, i) => i === 0 || ranks[i - 1] <= r));
    ok('2 data ops first',         ranks.slice(0, 2).every(r => r === 0));
    ok('refs are last',            ranks[ranks.length - 1] === 2);

    console.log('\n[suite] batch ops carry base64 data + write op');
    ok('every op is a write with base64 data', sgB.lastBatchOps.every(o => o.op === 'write' && typeof o.data === 'string' && o.data.length > 0));

    console.log('\n[suite] discardBatch — drops staged writes, nothing sent');
    const sgC = fakeSgSend();
    const osC = new SGVaultObjectStore(sgC, 'vaultC', 'wk');
    osC.beginBatch();
    await osC.store(buf('orphan'));
    osC.discardBatch();
    await osC.flushBatch();   // nothing staged → no-op
    ok('discard → 0 PUT, 0 POST', sgC.puts === 0 && sgC.batches === 0);

    console.log('\n[suite] ref manager outside a batch still PUTs directly');
    const sgD = fakeSgSend();
    const osD = new SGVaultObjectStore(sgD, 'vaultD', 'wk');
    const rmD = new SGVaultRefManager(sgD, 'vaultD', 'wk', readKey, osD);   // not batching
    await rmD.writeRef('ref-pid-muw-solo000000', 'obj-cas-imm-aaaaaaaaaaaa');
    ok('ref write → 1 PUT, 0 batch', sgD.puts === 1 && sgD.batches === 0);

    // --- flush-failure rollback (the SG/API team's blocking issue) ---
    // _commit advances _headCommitId inside fn(), but the write lands only at flushBatch().
    // If flush throws, _withBatch must restore the head pointers so the client is never left
    // ahead of the server (which would build the next commit on a phantom parent).
    console.log('\n[suite] flush failure → head pointers rolled back (no phantom parent)');
    const failingStore = {
        _on: false,
        get batching() { return this._on; },
        beginBatch() { this._on = true; },
        discardBatch() { this._on = false; },
        async flushBatch() { this._on = false; throw new Error('network drop during flush'); }
    };
    const vault = {
        _objectStore: failingStore,
        _headCommitId: 'commit-OLD', _namedHeadId: 'named-OLD',
        _settingsDirty: false, _currentSettingsEntry: { blob_id: 'settings-OLD' },
        _withBatch: SGVault.prototype._withBatch
    };
    let threw = false;
    try {
        await vault._withBatch(async () => {           // simulate _commit's in-fn mutations
            vault._headCommitId        = 'commit-NEW';
            vault._settingsDirty       = true;
            vault._currentSettingsEntry = { blob_id: 'settings-NEW' };
        });
    } catch (_) { threw = true; }
    ok('flush failure propagates (throws)',          threw === true);
    ok('head rolled back to OLD',                     vault._headCommitId === 'commit-OLD');
    ok('namedHead rolled back to OLD',               vault._namedHeadId === 'named-OLD');
    ok('settingsDirty rolled back',                  vault._settingsDirty === false);
    ok('currentSettingsEntry rolled back',           vault._currentSettingsEntry.blob_id === 'settings-OLD');
    ok('batch discarded (not batching)',             failingStore.batching === false);

    console.log('\n[suite] success path leaves advanced head intact');
    const okStore = { _on:false, get batching(){return this._on;}, beginBatch(){this._on=true;}, discardBatch(){this._on=false;}, async flushBatch(){ this._on=false; } };
    const vault2 = { _objectStore: okStore, _headCommitId:'OLD', _namedHeadId:'OLD', _settingsDirty:false, _currentSettingsEntry:null, _withBatch: SGVault.prototype._withBatch };
    await vault2._withBatch(async () => { vault2._headCommitId = 'NEW'; });
    ok('head advanced after successful flush', vault2._headCommitId === 'NEW');

    console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
    process.exit(fail ? 1 : 0);
})();
