/* Cross-implementation guard: our key handling vs the REAL sgit CLI.

   The expected values below are literal output of `sgit vault derive-keys` from
   sgit-ai 0.16.0 (captured 2026-08-24) — a known-answer test, not a restatement
   of our own code. If sgit's derivation or prefix list moves again, this fails
   here instead of failing as "Vault not found: HEAD ref missing" in a user's
   browser (the exact symptom the graphs.sgit.ai interop brief reported).

   Prefix contract (sgit Vault__Crypto.KEY_PREFIXES, naming revised 08/17):
     sgit_private_vault_  vault key (read+write)   sgit_private_read_  read key (secret)
     sgit_public_read_    read key (published)     sgit_vk1_/sgit_rk1_ legacy, input-only

   Run: node tests/unit/vault_ui/loader/test__sgit_key_prefixes.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const BASE = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
function load(rel, expose) {
    runInThisContext(readFileSync(fileURLToPath(new URL(BASE + rel, import.meta.url)), 'utf8'), { filename: rel });
    if (expose) runInThisContext(`globalThis.${expose}=${expose};`);
}
load('lib/sg-vault/sg-vault-crypto.js', 'SGVaultCrypto');
load('vault-loader/vault-loader-format.js');
const { SGVaultCrypto, VaultLoaderFormat } = globalThis;

// --- Known answers: verbatim `sgit vault derive-keys` output, sgit-ai 0.16.0 -------
const KAT = [
    { key:       'apple-river-1234:abcd1234',
      vault_id:  'abcd1234',
      read_key:  '719f712b292c6cf9784c34596fb30c1677589259a7d88735f834b6b42964cda6',
      write_key: 'c784da9fb5203935fbc6ca85bf37651b7f7bd8f2a1bca65b35bf1adcc0f4c0f9',
      ref:       'ref-pid-muw-a62441e077c3',
      idx:       'idx-pid-muw-6875db68139b' },
    // Real vault minted by `sgit init` (0.16.0) — note the sgit_private_vault_ prefix.
    { key:       'sgit_private_vault_5or4absok59sflgzc5531vxe:q70gfzsy',
      vault_id:  'q70gfzsy',
      read_key:  'ad173882fff54f4c1c9299817f2726d03292d6e9e64956367628ee77c34528ed',
      write_key: 'c6caef22b4e9699de94cf72ee35ff246a82697f08d16cddc128d3f0aa89fd451',
      ref:       'ref-pid-muw-74c12d6ae9d1',
      idx:       'idx-pid-muw-493f0e73a4ee' }
];

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');

(async () => {
    console.log('\n[suite] derivation matches sgit-ai 0.16.0 (known-answer)');
    for (const t of KAT) {
        const bare = SGVaultCrypto.stripKeyPrefix(t.key);
        const { passphrase, vaultId } = SGVaultCrypto.parseVaultKey(bare);
        const k = await SGVaultCrypto.deriveKeys(passphrase, vaultId);
        const label = t.key.slice(0, 34) + (t.key.length > 34 ? '…' : '');
        ok(`${label} → vault_id`,  vaultId === t.vault_id);
        ok(`${label} → read_key`,  hex(await crypto.subtle.exportKey('raw', k.readKey)) === t.read_key);
        ok(`${label} → write_key`, k.writeKey === t.write_key);
        ok(`${label} → ref id`,    k.refFileId === t.ref);
        ok(`${label} → index id`,  k.branchIndexFileId === t.idx);
    }

    console.log('\n[suite] stripKeyPrefix — every current + legacy sgit prefix');
    {
        const PASS = '5or4absok59sflgzc5531vxe:q70gfzsy';
        const RK   = 'ab'.repeat(32) + ':q70gfzsy';
        ok('sgit_private_vault_ stripped', SGVaultCrypto.stripKeyPrefix('sgit_private_vault_' + PASS) === PASS);
        ok('sgit_private_read_ stripped',  SGVaultCrypto.stripKeyPrefix('sgit_private_read_'  + RK)   === RK);
        ok('sgit_public_read_ stripped',   SGVaultCrypto.stripKeyPrefix('sgit_public_read_'   + RK)   === RK);
        ok('legacy sgit_vk1_ stripped',    SGVaultCrypto.stripKeyPrefix('sgit_vk1_' + PASS) === PASS);
        ok('legacy sgit_rk1_ stripped',    SGVaultCrypto.stripKeyPrefix('sgit_rk1_' + RK)   === RK);
        ok('bare key untouched',           SGVaultCrypto.stripKeyPrefix(PASS) === PASS);
        // sgit_private_vault_ and sgit_private_read_ share a stem: only the FULL
        // prefix may be removed, or the residual passphrase derives a different vault.
        ok('partial stem NOT stripped',    SGVaultCrypto.stripKeyPrefix('sgit_private_' + PASS) === 'sgit_private_' + PASS);
    }

    console.log('\n[suite] classifyKey — intent by declaration, never by shape');
    {
        ok('sgit_public_read_  → read-public',  SGVaultCrypto.classifyKey('sgit_public_read_abc')   === 'read-public');
        ok('sgit_private_read_ → read-private', SGVaultCrypto.classifyKey('sgit_private_read_abc')  === 'read-private');
        ok('sgit_rk1_          → read-private', SGVaultCrypto.classifyKey('sgit_rk1_abc')           === 'read-private');
        ok('sgit_private_vault_→ vault',        SGVaultCrypto.classifyKey('sgit_private_vault_abc') === 'vault');
        ok('sgit_vk1_          → vault',        SGVaultCrypto.classifyKey('sgit_vk1_abc')           === 'vault');
        ok('bare key           → unknown',      SGVaultCrypto.classifyKey('pass:abcd1234')          === 'unknown');
    }

    console.log('\n[suite] format detection accepts prefixed keys (loader twin agrees)');
    {
        const RK = 'ab'.repeat(32);
        ok('sgit_private_vault_{pass}:{id} → format 3',
           VaultLoaderFormat.detectFormat('sgit_private_vault_5or4absok59sflgzc5531vxe:q70gfzsy').format === 3);
        ok('sgit_public_read_{64hex}:{id} → format 6',
           VaultLoaderFormat.detectFormat('sgit_public_read_' + RK + ':q70gfzsy').format === 6);
        ok('sgit_private_read_{64hex}:{id} → format 6',
           VaultLoaderFormat.detectFormat('sgit_private_read_' + RK + ':q70gfzsy').format === 6);
        ok('parts.raw is the STRIPPED key',
           VaultLoaderFormat.detectFormat('sgit_private_vault_p:q70gfzsy').parts.raw === 'p:q70gfzsy');
        // Drift guard: the loader keeps its own dep-free copy of the prefix list.
        const CASES = ['sgit_private_vault_p:q70gfzsy', 'sgit_public_read_' + RK + ':q70gfzsy',
                       'sgit_private_read_' + RK + ':q70gfzsy', 'sgit_vk1_p:q70gfzsy',
                       'sgit_rk1_' + RK + ':q70gfzsy', 'sgit_private_p:q70gfzsy', 'p:q70gfzsy'];
        ok('loader twin ≡ SGVaultCrypto.stripKeyPrefix on every prefix',
           CASES.every(c => VaultLoaderFormat.detectFormat(c).parts.raw === SGVaultCrypto.stripKeyPrefix(c)));
    }

    console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
