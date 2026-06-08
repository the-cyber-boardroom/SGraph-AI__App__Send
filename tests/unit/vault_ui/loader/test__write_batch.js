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
load('lib/sg-vault/sg-vault-object-store.js');
load('lib/sg-vault/sg-vault-ref-manager.js');
runInThisContext('globalThis.SGVaultObjectStore = SGVaultObjectStore; globalThis.SGVaultRefManager = SGVaultRefManager; globalThis.SGSendCrypto = SGSendCrypto;');
const { SGVaultObjectStore, SGVaultRefManager } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

function fakeSgSend() {
    return {
        puts: 0, batches: 0, lastBatchOps: null,
        async vaultWrite(vaultId, filePath, wk, bytes) { this.puts++; return { ok: true }; },
        async vaultBatch(vaultId, wk, ops) { this.batches++; this.lastBatchOps = ops; return ops.map(o => ({ op: 'write', file_id: o.file_id, status: 'ok' })); }
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
    await rmB.writeBranchIndex('idx-pid-muw-index0000', 'ref-pid-muw-named00000');
    ok('no PUTs while staging',          sgB.puts === 0);
    ok('no POST until flush',            sgB.batches === 0);
    ok('store() returns content id',     id1.startsWith('obj-cas-imm-'));
    await osB.flushBatch();
    ok('exactly ONE POST /batch on flush', sgB.batches === 1 && sgB.puts === 0);
    ok('all 6 writes in the one batch',  sgB.lastBatchOps.length === 6);
    ok('not batching after flush',       osB.batching === false);

    console.log('\n[suite] ordering — objects before indexes before refs');
    const ranks = sgB.lastBatchOps.map(o =>
        o.file_id.startsWith('bare/data/') ? 0 : (o.file_id.startsWith('bare/indexes/') ? 1 : 2));
    ok('ops sorted data → indexes → refs', ranks.every((r, i) => i === 0 || ranks[i - 1] <= r));
    ok('3 data ops first',  ranks.slice(0, 3).every(r => r === 0));
    ok('refs are last',     ranks[ranks.length - 1] === 2);

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

    console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
    process.exit(fail ? 1 : 0);
})();
