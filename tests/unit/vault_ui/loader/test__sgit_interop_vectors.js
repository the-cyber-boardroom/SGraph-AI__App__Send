/* Known-answer test: the sgit-ai 0.19+ interop vectors against THIS repo's vault code.

   The fixture is a verbatim copy of `tests/_fixtures/interop_vectors.json` from the
   SGit-AI__CLI repo (0.21.0, commit bc8016d). It pins three cross-client rules:
     - object ids:        'obj-cas-imm-' + sha256(ciphertext)[:12]  (format 1)  /  [:32] (format 2)
     - deterministic tree: IV = HMAC-SHA256(read_key, plaintext)[:12]; AES-256-GCM, no AAD
     - commit signing:     ECDSA P-256 / SHA-256 over RFC 8785 (JCS) of the stored commit
                           JSON minus `signature`; raw r||s (64 bytes), base64

   What this proves today (v0.2.3):
     1. SGVaultObjectStore.computeObjectId reproduces the format-1 id      (EXISTS)
     2. SGSendCrypto.decrypt opens the CLI's deterministic ciphertext        (wire format shared)
     3. Web Crypto alone (no library) reproduces the format-2 id, the deterministic IV and
        ciphertext, the JCS signing bytes, verifies the CLI's signature and produces one the
        CLI's verifier accepts — i.e. every gap in the 10/12 architect review is closable
        without a dependency.
   What it does NOT claim: that the web writes format-2 ids, deterministic trees or signed
   commits — those are PROPOSED (see team/roles/architect/reviews/10/12/).

   Run: node tests/unit/vault_ui/loader/test__sgit_interop_vectors.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const BASE = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
function load(rel, expose) {
    runInThisContext(readFileSync(fileURLToPath(new URL(BASE + rel, import.meta.url)), 'utf8'), { filename: rel });
    if (expose) runInThisContext(`globalThis.${expose}=${expose};`);
}
load('lib/sg-send/sg-send-crypto.js',          'SGSendCrypto');
load('lib/sg-vault/sg-vault-object-store.js',  'SGVaultObjectStore');
const { SGSendCrypto, SGVaultObjectStore } = globalThis;

const V = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/sgit_interop_vectors.json', import.meta.url)), 'utf8'));

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

const enc     = new TextEncoder();
const hex     = (u8) => Array.from(new Uint8Array(u8)).map(b => b.toString(16).padStart(2, '0')).join('');
const unhex   = (h)  => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const b64     = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64   = (s)  => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const pemBody = (pem) => unb64(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
const sha256  = async (u8) => hex(await crypto.subtle.digest('SHA-256', u8));

// Minimal RFC 8785 for the value types a commit holds (strings, integers, null, arrays, objects).
function jcs(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
}

(async function () {
    // --- 1. object ids -----------------------------------------------------------------
    console.log('\n[suite] object ids — format 1 (today) and format 2 (PROPOSED)');
    const O  = V.object_id;
    const ct = enc.encode(O.ciphertext_ascii);
    ok('sha256 of the vector ciphertext', await sha256(ct) === O.sha256);
    const store = new SGVaultObjectStore({}, 'vault123', null);
    ok('SGVaultObjectStore.computeObjectId == format-1 vector', await store.computeObjectId(ct) === O.format_1);
    ok('format-2 id is the same hash cut at 32 hex', 'obj-cas-imm-' + (await sha256(ct)).slice(0, 32) === O.format_2);
    ok('format-2 file name is 44 characters', O.format_2.length === 44);

    // --- 2. deterministic tree encryption ---------------------------------------------
    console.log('\n[suite] deterministic tree encryption (CLI rule; web uses random IVs today)');
    const T       = V.tree_deterministic;
    const rk      = unhex(T.read_key_hex);
    const hmacKey = await crypto.subtle.importKey('raw', rk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const aesKey  = await crypto.subtle.importKey('raw', rk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    async function encryptDeterministic(plain) {
        const iv  = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, plain)).slice(0, 12);
        const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plain));
        const all = new Uint8Array(12 + out.length); all.set(iv); all.set(out, 12); return all;
    }
    const pt  = enc.encode(T.plaintext_utf8);
    ok('tree plaintext sha256', await sha256(pt) === T.plaintext_sha256);
    const tct = await encryptDeterministic(pt);
    ok('IV = HMAC-SHA256(read_key, plaintext)[:12]', hex(tct.slice(0, 12)) === T.iv_hex);
    ok('ciphertext byte-identical to the CLI', hex(tct) === T.ciphertext_hex);
    ok('tree object id (format 1) via computeObjectId', await store.computeObjectId(tct) === T.object_id);
    ok('entry field name_enc is deterministic too', b64(await encryptDeterministic(enc.encode(T.name_plain))) === T.name_enc);
    // The wire format [12-byte IV][ct+tag] is what SGSendCrypto already reads:
    const opened = await SGSendCrypto.decrypt(unhex(T.ciphertext_hex), aesKey);
    ok('SGSendCrypto.decrypt opens the CLI ciphertext', new TextDecoder().decode(opened) === T.plaintext_utf8);
    // ...and today's SGSendCrypto.encrypt is NOT deterministic (documents the gap, not a failure):
    const a = hex(await SGSendCrypto.encrypt(pt, aesKey)), b = hex(await SGSendCrypto.encrypt(pt, aesKey));
    ok('SGSendCrypto.encrypt uses a random IV (gap: item 5 of the 10/12 review)', a !== b);

    // --- 3. commit signing -------------------------------------------------------------
    console.log('\n[suite] commit signing — JCS bytes, ECDSA P-256 raw r||s, Web Crypto only');
    const C    = V.commit_signing;
    const body = { ...C.stored_commit_json }; delete body.signature;
    const signing = jcs(body);
    ok('JCS of stored commit minus `signature` == CLI signing bytes', signing === C.signing_bytes_utf8);
    ok('sha256 of signing bytes', await sha256(enc.encode(signing)) === C.signing_bytes_sha256);
    const pub = await crypto.subtle.importKey('spki',  pemBody(C.test_public_key_pem),  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
    const prv = await crypto.subtle.importKey('pkcs8', pemBody(C.test_private_key_pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = unb64(C.signature_b64);
    ok('CLI signature is raw r||s (64 bytes)', sig.length === 64 && hex(sig) === C.signature_r_s_hex);
    ok('CLI signature verifies under Web Crypto', await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, enc.encode(signing)));
    const ours = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, prv, enc.encode(signing));
    ok('a Web Crypto signature is 64 bytes (the CLI decodes r||s)', ours.byteLength === 64);
    ok('a Web Crypto signature verifies under the vector public key', await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, ours, enc.encode(signing)));
    ok('key fingerprint = sha256(DER SPKI)[:16]', 'sha256:' + (await sha256(pemBody(C.test_public_key_pem))).slice(0, 16) === C.key_fingerprint);
    // A commit the CLI would re-serialise differently signs different bytes: the ten-member set is the contract.
    const members = Object.keys(C.stored_commit_json).sort().join(',');
    ok('commit_v1 has exactly the ten members the web must write',
       members === 'attestations,author_key_id,author_signature,branch_id,message_enc,parents,schema,signature,timestamp_ms,tree_id');
    // Tampering is detected:
    const tampered = { ...body, tree_id: 'obj-cas-imm-000000000000' };
    ok('a changed tree_id no longer verifies', !(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, enc.encode(jcs(tampered)))));
    // Legacy (pre-canonical) bytes, still accepted by the CLI for author_key_id == null commits:
    const L = V.legacy_signing_bytes_example;
    ok('legacy bytes keep `"signature": null` and Python separators', L.bytes_utf8.includes('"signature": null') && L.bytes_utf8.includes('": "'));

    console.log(`\n[result] ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
