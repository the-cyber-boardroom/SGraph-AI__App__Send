/* Unit tests — VaultRwSeal (rw-links child-key sealing with the parent write secret)
   Run: node tests/unit/vault_ui/loader/test__vault_rw_seal.js
   No deps. Uses Node's global WebCrypto (crypto.subtle). Sources the browser global-scope
   module via runInThisContext (same pattern as test__vault_links.js). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';
import { webcrypto }        from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const LIB = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/links/vault-rw-seal.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(LIB), 'utf8'), { filename: 'vault-rw-seal.js', displayErrors: true });
runInThisContext('globalThis.VaultRwSeal = VaultRwSeal;');
const { VaultRwSeal } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

console.log('\n[suite] VaultRwSeal — rw-links child-key sealing');

(async () => {
    const PARENT_WK = 'a1b2c3d4e5f6'.repeat(8);            // a plausible hex write_key
    const CHILD     = 'apple-river-1234:childvaultid01';   // a full child vault key

    // 1. round-trip
    const sealed = await VaultRwSeal.seal(CHILD, PARENT_WK);
    ok('seal returns a non-empty base64 string', typeof sealed === 'string' && sealed.length > 0);
    ok('sealed blob does NOT contain the plaintext child key', sealed.indexOf(CHILD) === -1);
    const back = await VaultRwSeal.unseal(sealed, PARENT_WK);
    ok('unseal with the right parent secret recovers the child key', back === CHILD);

    // 2. non-deterministic IV → two seals differ, both decrypt
    const sealed2 = await VaultRwSeal.seal(CHILD, PARENT_WK);
    ok('two seals of the same input differ (random IV)', sealed !== sealed2);
    ok('second seal also round-trips', (await VaultRwSeal.unseal(sealed2, PARENT_WK)) === CHILD);

    // 3. wrong parent write secret fails closed (does NOT return garbage)
    let threw = false;
    try { await VaultRwSeal.unseal(sealed, 'deadbeef'.repeat(8)); } catch (_) { threw = true; }
    ok('unseal with a wrong parent secret throws (GCM auth fail)', threw);

    // 4. a parent READER (no write secret) cannot unseal — modelled as empty/absent secret
    let threwNoSecret = false;
    try { await VaultRwSeal.unseal(sealed, ''); } catch (_) { threwNoSecret = true; }
    ok('unseal without a parent write secret throws', threwNoSecret);
    let threwSealNoSecret = false;
    try { await VaultRwSeal.seal(CHILD, null); } catch (_) { threwSealNoSecret = true; }
    ok('seal without a parent write secret throws', threwSealNoSecret);

    // 5. bad inputs fail closed
    let threwEmpty = false;
    try { await VaultRwSeal.seal('', PARENT_WK); } catch (_) { threwEmpty = true; }
    ok('seal of empty child key throws', threwEmpty);
    let threwShort = false;
    try { await VaultRwSeal.unseal('AAAA', PARENT_WK); } catch (_) { threwShort = true; }
    ok('unseal of too-short blob throws', threwShort);

    // 6. different parent secrets produce non-interchangeable seals
    const OTHER_WK = 'feedface'.repeat(8);
    const sealedOther = await VaultRwSeal.seal(CHILD, OTHER_WK);
    let crossThrew = false;
    try { await VaultRwSeal.unseal(sealedOther, PARENT_WK); } catch (_) { crossThrew = true; }
    ok('a seal under parent B cannot be unsealed by parent A', crossThrew);
    ok('but parent B can unseal its own', (await VaultRwSeal.unseal(sealedOther, OTHER_WK)) === CHILD);

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
