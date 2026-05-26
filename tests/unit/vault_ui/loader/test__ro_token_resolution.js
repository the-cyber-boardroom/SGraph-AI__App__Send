/* Guards the ro-token deterministic-transfer-id wiring: a recipient holding only
   `ro-word-word-NNNN` must be able to FIND + DECRYPT the creds the token writer
   uploaded. Run: node tests/unit/vault_ui/loader/test__ro_token_resolution.js

   Sources sg-vault-crypto.js (the single source of truth for the derivation, used
   by vault-token-manager [write], app-shell + vault-loader [read]) and exercises the
   encrypt→wire-bytes→decrypt round-trip with the salt/iterations both sides use. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault-crypto.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-vault-crypto.js', displayErrors: true });
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');
const { SGVaultCrypto } = globalThis;

// Independent copy of the documented derivation (drift guard against SGVaultCrypto).
async function deriveExpected(bare) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ro-token-transfer-v1:' + bare));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

// Mirrors vault-token-manager._encryptWithPassphrase (write side): iv(12) || AES-GCM(ct).
async function encryptWithToken(token, dataBytes) {
    const enc = new TextEncoder();
    const km  = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'PBKDF2' }, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('sgraph-ro-token-v1'), iterations: 100000 },
        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataBytes));
    const out = new Uint8Array(12 + ct.byteLength); out.set(iv, 0); out.set(ct, 12);
    return out;
}

// Mirrors the read side (app-shell._resolveROToken / vault-loader._decryptROPayload).
async function decryptWithToken(token, wireBytes) {
    const enc = new TextEncoder();
    const km  = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'PBKDF2' }, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('sgraph-ro-token-v1'), iterations: 100000 },
        km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const iv = wireBytes.slice(0, 12), ct = wireBytes.slice(12);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
    console.log('\n[suite] ro-token resolution — deterministic id + creds round-trip');

    const bare = 'coral-stamp-5678';

    const tid = await SGVaultCrypto.deriveRoTokenTransferId(bare);
    ok('transfer-id is 12 lowercase hex', /^[a-f0-9]{12}$/.test(tid));
    ok('transfer-id matches the documented derivation', tid === await deriveExpected(bare));
    ok('prefix-insensitive (ro- stripped before derivation)', tid === await SGVaultCrypto.deriveRoTokenTransferId('ro-' + bare));
    ok('different tokens → different ids', tid !== await SGVaultCrypto.deriveRoTokenTransferId('other-token-0001'));

    // Round-trip: writer encrypts the creds; reader recovers them from the wire bytes.
    const creds = { vault_id: 'abcd1234', read_key: 'AAAA'.repeat(11), ref_file_id: 'ref-pid-muw-0123456789ab' };
    const wire  = await encryptWithToken(bare, new TextEncoder().encode(JSON.stringify(creds)));
    ok('wire format is iv(12) + ciphertext', wire.length > 12);
    const back  = JSON.parse(new TextDecoder().decode(await decryptWithToken(bare, wire)));
    ok('reader recovers vault_id / read_key / ref_file_id',
        back.vault_id === creds.vault_id && back.read_key === creds.read_key && back.ref_file_id === creds.ref_file_id);
    await decryptWithToken('wrong-token-9999', wire).then(
        () => ok('wrong token cannot decrypt', false),
        () => ok('wrong token cannot decrypt', true));

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
