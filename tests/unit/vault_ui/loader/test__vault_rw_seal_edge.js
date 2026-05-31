/* Edge-case tests — VaultRwSeal (adversarial crypto, tamper, encoding)
   Run: node tests/unit/vault_ui/loader/test__vault_rw_seal_edge.js
   Real WebCrypto, no mocks. Complements test__vault_rw_seal.js. */

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
async function throws(fn) { try { await fn(); return false; } catch (_) { return true; } }

console.log('\n[suite] VaultRwSeal — edge cases');

(async () => {
    const WK = 'a1b2c3d4'.repeat(8);

    // ── value fidelity across exotic key contents ──
    const exotic = [
        'apple-river-1234:abcd1234',
        'pass:with:many:colons:vaultid',                 // passphrases may contain colons
        'ünïcödé-pa55:vaultÅ',                            // non-ASCII
        '🔐-emoji-key:v🗝',                                // multi-byte emoji
        ' leading-and-trailing-space ',                  // whitespace must survive
        'x'.repeat(4096),                                // long key
        'a',                                             // 1-char
        '{"looks":"like-json"}:v'                        // JSON-ish (must not be parsed)
    ];
    for (const k of exotic) {
        const sealed = await VaultRwSeal.seal(k, WK);
        const back = await VaultRwSeal.unseal(sealed, WK);
        ok('round-trips exotic key: ' + JSON.stringify(k.length > 24 ? k.slice(0, 21) + '…' : k), back === k);
    }

    // ── tamper: flipping any byte of the blob fails closed (GCM integrity) ──
    {
        const sealed = await VaultRwSeal.seal('apple-river-1234:v', WK);
        const bytes = VaultRwSeal._b64decode(sealed);
        // flip a byte in the ciphertext region (after the 12-byte IV)
        const tampered = bytes.slice(); tampered[bytes.length - 1] ^= 0xff;
        const tamperedB64 = VaultRwSeal._b64encode(tampered);
        ok('tampered ciphertext byte → unseal throws', await throws(() => VaultRwSeal.unseal(tamperedB64, WK)));
        // flip a byte in the IV → also fails
        const ivFlip = bytes.slice(); ivFlip[0] ^= 0x01;
        ok('tampered IV byte → unseal throws', await throws(() => VaultRwSeal.unseal(VaultRwSeal._b64encode(ivFlip), WK)));
        // truncating the ciphertext fails
        ok('truncated blob → unseal throws', await throws(() => VaultRwSeal.unseal(VaultRwSeal._b64encode(bytes.slice(0, 16)), WK)));
    }

    // ── exactly IV_LENGTH bytes (no ciphertext) → too short ──
    {
        const justIv = VaultRwSeal._b64encode(new Uint8Array(VaultRwSeal.IV_LENGTH));
        ok('blob == IV length only → throws (no ciphertext)', await throws(() => VaultRwSeal.unseal(justIv, WK)));
    }

    // ── key-sensitivity: a single-char difference in the write secret fails ──
    {
        const sealed = await VaultRwSeal.seal('apple-river-1234:v', WK);
        const wk2 = WK.slice(0, -1) + (WK.slice(-1) === 'f' ? 'e' : 'f');
        ok('one-char-different write secret → unseal throws', await throws(() => VaultRwSeal.unseal(sealed, wk2)));
    }

    // ── domain separation: the seal key is NOT just the raw write secret ──
    //     (two different secrets that would collide only if domain prefix were absent still differ)
    {
        const s1 = await VaultRwSeal.seal('k:v', 'deadbeef'.repeat(8));
        ok('seal under secret A cannot unseal under secret B', await throws(() => VaultRwSeal.unseal(s1, 'feedface'.repeat(8))));
    }

    // ── bad inputs to seal/unseal ──
    ok('seal(null key) throws',        await throws(() => VaultRwSeal.seal(null, WK)));
    ok('seal(number key) throws',      await throws(() => VaultRwSeal.seal(12345, WK)));
    ok('seal(undefined secret) throws',await throws(() => VaultRwSeal.seal('k:v', undefined)));
    ok('seal(non-string secret) throws',await throws(() => VaultRwSeal.seal('k:v', 123)));
    ok('unseal(null blob) throws',     await throws(() => VaultRwSeal.unseal(null, WK)));
    ok('unseal(number blob) throws',   await throws(() => VaultRwSeal.unseal(42, WK)));
    ok('unseal(empty string) throws',  await throws(() => VaultRwSeal.unseal('', WK)));
    ok('unseal(garbage base64) throws',await throws(() => VaultRwSeal.unseal('!!!!not base64!!!!', WK)));

    // ── IV uniqueness across many seals (no reuse) ──
    {
        const ivs = new Set();
        let collide = false;
        for (let i = 0; i < 200; i++) {
            const sealed = await VaultRwSeal.seal('apple-river-1234:v', WK);
            const iv = VaultRwSeal._b64decode(sealed).slice(0, VaultRwSeal.IV_LENGTH).join(',');
            if (ivs.has(iv)) collide = true;
            ivs.add(iv);
        }
        ok('200 seals produce 200 distinct IVs (no reuse)', !collide && ivs.size === 200);
    }

    // ── base64 helpers round-trip arbitrary bytes ──
    {
        const r = crypto.getRandomValues(new Uint8Array(257));
        const back = VaultRwSeal._b64decode(VaultRwSeal._b64encode(r));
        let same = back.length === r.length; for (let i = 0; i < r.length; i++) if (back[i] !== r[i]) same = false;
        ok('_b64 round-trips 257 random bytes', same);
    }

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
