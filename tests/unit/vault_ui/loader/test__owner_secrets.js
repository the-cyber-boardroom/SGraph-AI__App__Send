/* Unit tests — SGVaultOwnerSecrets (owner-tier seal/open over the parent vault's write_key)
   Run: node tests/unit/vault_ui/loader/test__owner_secrets.js
   No deps beyond Node's global Web Crypto (Node 20+). Sources the browser global-scope module
   via runInThisContext. Pure crypto — no DOM, no vault I/O. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault-owner-secrets.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'sg-vault-owner-secrets.js', displayErrors: true });
const OS = globalThis.SGVaultOwnerSecrets;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

const WK_A = 'a1b2c3d4e5f6'.repeat(8);   // 96 hex chars — a plausible write_key
const WK_B = 'ffeeddccbbaa'.repeat(8);   // a different write_key

(async function () {
    console.log('\n[suite] SGVaultOwnerSecrets — seal/open round-trip');
    const keyA = await OS.deriveKey(WK_A);
    const secret = { vault_id: 'ab12cd34', key: 'k9xq2:ab12cd34', label: 'Patient — Jane', created: 1717800000000 };
    const rec = await OS.seal(keyA, secret);
    ok('seal returns base64 iv + ct', typeof rec.iv === 'string' && typeof rec.ct === 'string' && rec.iv.length > 0 && rec.ct.length > 0);
    const out = await OS.open(keyA, rec);
    ok('round-trips vault_id', out.vault_id === secret.vault_id);
    ok('round-trips composed key', out.key === secret.key);
    ok('round-trips label', out.label === secret.label);

    console.log('\n[suite] determinism + tier separation');
    const keyA2 = await OS.deriveKey(WK_A);
    const out2  = await OS.open(keyA2, rec);   // re-derived key from same write_key opens it
    ok('re-derived key (same write_key) opens', out2.key === secret.key);

    const keyB = await OS.deriveKey(WK_B);     // a different owner (different write_key) cannot open
    let denied = false;
    try { await OS.open(keyB, rec); } catch (_) { denied = true; }
    ok('different write_key cannot open (AES-GCM auth fail)', denied);

    console.log('\n[suite] fresh IV per seal');
    const rec2 = await OS.seal(keyA, secret);
    ok('two seals of same plaintext differ (fresh IV)', rec2.ct !== rec.ct || rec2.iv !== rec.iv);

    console.log('\n[suite] guards');
    let roThrew = false;
    try { await OS.deriveKey(null); } catch (e) { roThrew = (e && e.code === 'EREADONLY'); }
    ok('deriveKey(null) → EREADONLY (RO session)', roThrew);
    let malformed = false;
    try { await OS.open(keyA, { iv: 'x' }); } catch (_) { malformed = true; }
    ok('open(malformed) throws', malformed);

    console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
    process.exit(fail ? 1 : 0);
})();
