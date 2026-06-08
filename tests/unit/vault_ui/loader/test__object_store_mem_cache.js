/* Unit tests — SGVaultObjectStore in-memory imm-block cache (null-origin safe tier)
   Run: node tests/unit/vault_ui/loader/test__object_store_mem_cache.js

   Node has no global `caches`, so the Cache API tier is skipped — this faithfully
   simulates a null-origin sandboxed iframe, where the in-memory Map is the ONLY working
   cache tier. A fake SGSend counts vaultRead/vaultBatch hits so we can prove dedup. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault-object-store.js';
runInThisContext(readFileSync(fileURLToPath(new URL(MOD, import.meta.url)), 'utf8'), { filename: 'sg-vault-object-store.js', displayErrors: true });
runInThisContext('globalThis.SGVaultObjectStore = SGVaultObjectStore;');
const { SGVaultObjectStore } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

// Fake SGSend that counts reads and serves fixed bytes.
function fakeSgSend() {
    return {
        reads: 0, batches: 0,
        async vaultRead(vaultId, filePath) { this.reads++; return new Uint8Array([1,2,3,4]).buffer; },
        async vaultBatch(vaultId, wk, ops) {
            this.batches++;
            return ops.map(() => ({ status: 'ok', data: btoa('abcd') }));   // base64 of 4 bytes
        }
    };
}

(async function () {
    // sanity: Node really has no Cache API → we're exercising the in-memory tier only
    ok('environment has no Cache API (null-origin sim)', typeof caches === 'undefined');

    console.log('\n[suite] load() — imm object cached in memory after first fetch');
    const sg = fakeSgSend();
    const os = new SGVaultObjectStore(sg, 'vaultAAA', 'wk');
    const IMM = 'obj-cas-imm-aaaaaaaaaaaa';
    await os.load(IMM);
    await os.load(IMM);
    await os.load(IMM);
    ok('3 loads of same imm object → 1 network read', sg.reads === 1);

    console.log('\n[suite] mutable (-muw-) objects are NOT cached');
    const sg2 = fakeSgSend();
    const os2 = new SGVaultObjectStore(sg2, 'vaultBBB', 'wk');
    const MUT = 'ref-pid-muw-bbbbbbbbbbbb';
    await os2.load(MUT);
    await os2.load(MUT);
    ok('2 loads of a -muw- object → 2 network reads (never cached)', sg2.reads === 2);

    console.log('\n[suite] cache is per (vault, object)');
    const sg3 = fakeSgSend();
    const a = new SGVaultObjectStore(sg3, 'vaultCCC', 'wk');
    const b = new SGVaultObjectStore(sg3, 'vaultDDD', 'wk');   // different vault, same objectId
    const SAME = 'obj-cas-imm-cccccccccccc';
    await a.load(SAME);
    await b.load(SAME);   // different vault → not a hit on A's entry
    await a.load(SAME);   // hit
    ok('same objectId in two vaults keyed separately', sg3.reads === 2);

    console.log('\n[suite] batchLoad() dedups via the same in-memory tier');
    const sg4 = fakeSgSend();
    const os4 = new SGVaultObjectStore(sg4, 'vaultEEE', 'wk');
    const ids = ['obj-cas-imm-d11111111111', 'obj-cas-imm-d22222222222'];
    await os4.batchLoad(ids);          // one batch fetches both
    await os4.batchLoad(ids);          // fully served from memory → no second batch
    ok('repeat batchLoad of cached imm ids → 1 batch call', sg4.batches === 1);

    console.log('\n[suite] returned buffers are independent copies (detach-safe)');
    const sg5 = fakeSgSend();
    const os5 = new SGVaultObjectStore(sg5, 'vaultFFF', 'wk');
    const ID5 = 'obj-cas-imm-eeeeeeeeeeee';
    const buf1 = await os5.load(ID5);
    const buf2 = await os5.load(ID5);
    ok('two hits return distinct ArrayBuffers', buf1 !== buf2 && buf1.byteLength === 4 && buf2.byteLength === 4);

    console.log('\n[suite] _memStats reflects cached entries');
    const stats = SGVaultObjectStore._memStats();
    ok('mem cache has entries + bytes', stats.entries > 0 && stats.bytes > 0);

    console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
    process.exit(fail ? 1 : 0);
})();
