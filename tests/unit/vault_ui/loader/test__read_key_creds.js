/* Guards SGVaultCrypto.deriveReadOnlyCreds — the whole cryptographic content of the
   read-key open feature (architect brief 08/15 §3.1 / §6.1).

   THE invariant: for any vault key, deriveReadOnlyCreds(vaultId, hex(readKey)) must
   return the SAME refFileId (and branchIndexFileId) as deriveKeys(passphrase, vaultId).
   One test kills the whole class of derivation-drift bugs: if this holds, a read key
   exported from Settings (or `sgit vault derive-keys`) opens the vault the owner sees.

   Also guards stripKeyPrefix (sgit_vk1_/sgit_rk1_ — CLI key-prefix design contract
   08/14) and deriveReadOnlyCreds input validation.

   Run: node tests/unit/vault_ui/loader/test__read_key_creds.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault-crypto.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-vault-crypto.js', displayErrors: true });
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');
const { SGVaultCrypto } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

function hex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }

(async () => {
    console.log('\n[suite] deriveReadOnlyCreds — invariant vs deriveKeys (standard vault key)');
    {
        const passphrase = 'apple-river-1234', vaultId = 'abcd1234';
        const keys         = await SGVaultCrypto.deriveKeys(passphrase, vaultId);
        const readKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keys.readKey));
        const creds        = await SGVaultCrypto.deriveReadOnlyCreds(vaultId, hex(readKeyBytes));

        ok('refFileId matches deriveKeys',         creds.refFileId         === keys.refFileId);
        ok('branchIndexFileId matches deriveKeys', creds.branchIndexFileId === keys.branchIndexFileId);
        ok('readKeyB64 round-trips the input',     creds.readKeyB64        === b64(readKeyBytes));
        ok('vaultId passed through',               creds.vaultId           === vaultId);
        ok('refFileId shape ref-pid-muw-<12hex>',  /^ref-pid-muw-[0-9a-f]{12}$/.test(creds.refFileId));
        ok('branchIndexFileId shape idx-pid-muw-<12hex>', /^idx-pid-muw-[0-9a-f]{12}$/.test(creds.branchIndexFileId));
    }

    console.log('\n[suite] deriveReadOnlyCreds — invariant vs deriveKeysFromSimpleToken');
    {
        // Simple-token vaults derive read_key differently (PBKDF2+HKDF) but the
        // file-id derivation is the same HMAC-from-read-key — so a read key exported
        // from a simple-token vault must ALSO open via deriveReadOnlyCreds.
        const keys         = await SGVaultCrypto.deriveKeysFromSimpleToken('apple-river-1234');
        const readKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keys.readKey));
        const creds        = await SGVaultCrypto.deriveReadOnlyCreds(keys.vaultId, hex(readKeyBytes));

        ok('refFileId matches (simple-token vault)',         creds.refFileId         === keys.refFileId);
        ok('branchIndexFileId matches (simple-token vault)', creds.branchIndexFileId === keys.branchIndexFileId);
    }

    console.log('\n[suite] deriveReadOnlyCreds — input validation');
    {
        let threw = false;
        try { await SGVaultCrypto.deriveReadOnlyCreds('abcd1234', 'ff'.repeat(31)); } catch (_) { threw = true; }
        ok('62-hex read key rejected', threw);

        threw = false;
        try { await SGVaultCrypto.deriveReadOnlyCreds('abcd1234', 'F'.repeat(64)); } catch (_) { threw = true; }
        ok('uppercase hex rejected', threw);
    }

    console.log('\n[suite] parseReadOnlyCredential — ONE matcher for both read-key forms');
    {
        const RK = 'ab'.repeat(32), VID = 'abcd1234';
        const f6 = SGVaultCrypto.parseReadOnlyCredential(RK + ':' + VID);
        ok('format 6 (colon) parses',         f6 && f6.vaultId === VID && f6.readKeyHex === RK);
        const f4 = SGVaultCrypto.parseReadOnlyCredential(VID + '  ' + RK);
        ok('format 4 (space) parses',         f4 && f4.vaultId === VID && f4.readKeyHex === RK);
        const pf = SGVaultCrypto.parseReadOnlyCredential('sgit_rk1_' + RK + ':' + VID);
        ok('sgit_rk1_ prefixed form parses',  pf && pf.vaultId === VID && pf.readKeyHex === RK);
        ok('passphrase key → null',           SGVaultCrypto.parseReadOnlyCredential('my-pass:' + VID) === null);
        ok('simple token → null',             SGVaultCrypto.parseReadOnlyCredential('apple-river-1234') === null);
        ok('ro-token → null',                 SGVaultCrypto.parseReadOnlyCredential('ro-apple-river-1234') === null);
        ok('63-hex → null',                   SGVaultCrypto.parseReadOnlyCredential(RK.slice(1) + ':' + VID) === null);
        ok('uppercase hex → null',            SGVaultCrypto.parseReadOnlyCredential(RK.toUpperCase() + ':' + VID) === null);
        ok('empty/null safe',                 SGVaultCrypto.parseReadOnlyCredential(null) === null);
    }

    console.log('\n[suite] stripKeyPrefix — sgit canonical key prefixes');
    {
        const RK = 'ab'.repeat(32);
        ok('sgit_rk1_ stripped',            SGVaultCrypto.stripKeyPrefix('sgit_rk1_' + RK + ':abcd1234') === RK + ':abcd1234');
        ok('sgit_vk1_ stripped',            SGVaultCrypto.stripKeyPrefix('sgit_vk1_pass:abcd1234')       === 'pass:abcd1234');
        ok('bare key unchanged',            SGVaultCrypto.stripKeyPrefix('pass:abcd1234')                === 'pass:abcd1234');
        ok('whitespace trimmed',            SGVaultCrypto.stripKeyPrefix('  pass:abcd1234  ')            === 'pass:abcd1234');
        ok('prefix only at HEAD is stripped', SGVaultCrypto.stripKeyPrefix('xsgit_rk1_abc')              === 'xsgit_rk1_abc');
        ok('empty/null safe',               SGVaultCrypto.stripKeyPrefix(null)                           === '');
    }

    console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
