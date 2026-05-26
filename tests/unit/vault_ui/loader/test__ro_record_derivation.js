/* Guards the SUB-VAULTS-AND-LINKS.md ro-links derivation snippet against the real code.
   Run: node tests/unit/vault_ui/loader/test__ro_record_derivation.js
   Sources sg-vault-crypto.js (the authority) and checks the documented derivation of
   read_key (b64) + ref_file_id from a child vault key matches SGVaultCrypto.deriveKeys. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault-crypto.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-vault-crypto.js', displayErrors: true });
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');
const { SGVaultCrypto } = globalThis;

// The exact snippet documented in SUB-VAULTS-AND-LINKS.md §4
async function deriveRoRecordFields(childKey) {
    const enc = new TextEncoder();
    const [passphrase, vaultId] = (() => { const p = childKey.split(':'); const id = p.pop(); return [p.join(':'), id]; })();
    const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const readBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(`sg-vault-v1:${vaultId}`), iterations: 600000, hash: 'SHA-256' }, km, 256);
    const read_key = btoa(String.fromCharCode(...new Uint8Array(readBits)));
    const hmacKey = await crypto.subtle.importKey('raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(`sg-vault-v1:file-id:ref:${vaultId}`)));
    const hex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
    return { vault_id: vaultId, read_key, ref_file_id: 'ref-pid-muw-' + hex };
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

(async () => {
    console.log('\n[suite] ro-links derivation (doc snippet vs SGVaultCrypto)');

    const passphrase = 'apple-river-1234', vaultId = 'abcd1234';
    const childKey = passphrase + ':' + vaultId;

    // authority
    const keys = await SGVaultCrypto.deriveKeys(passphrase, vaultId);
    const realReadKeyB64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', keys.readKey))));

    // doc snippet
    const doc = await deriveRoRecordFields(childKey);

    ok('vault_id', doc.vault_id === vaultId);
    ok('read_key (b64) matches SGVaultCrypto.deriveKeys', doc.read_key === realReadKeyB64);
    ok('ref_file_id matches SGVaultCrypto.deriveKeys', doc.ref_file_id === keys.refFileId);
    ok('read_key is 44-char base64 (32 bytes)', doc.read_key.length === 44);
    ok('ref_file_id shape ref-pid-muw-<12hex>', /^ref-pid-muw-[0-9a-f]{12}$/.test(doc.ref_file_id));

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
