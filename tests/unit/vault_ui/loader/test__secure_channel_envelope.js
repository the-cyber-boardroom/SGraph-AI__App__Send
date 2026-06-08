/* Unit tests — Envelope (SecureChannel Phase 1 — the pure WebCrypto module)
   Run: node tests/unit/vault_ui/loader/test__secure_channel_envelope.js
   No deps; pattern from test__app_permissions.js. Uses real crypto.subtle. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/secure-channel-envelope.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'secure-channel-envelope.js', displayErrors: true });
const E = globalThis.Envelope;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? '  — ' + info : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function bytesEqual(a, b) {
    a = E._toU8(a); b = E._toU8(b);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}
async function tryCatch(fn) {
    try { await fn(); return null; } catch (err) { return err; }
}

// PNG signature — the load-bearing fixture from review B2
const PNG = Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);

console.log('\n[suite] Envelope — pack/unpack (signed-only)');
{
    const sk = await E.generateSignKeypair();
    const meta = { v: 1, cid: 'ch-test', dir: 'down', id: 'req-1', type: 'echo', nonce: E.randNonce() };

    // E1.a — pack shape
    const env = await E.pack({ ...meta, payload: { x: 1 }, enc: false, signKey: sk.privateKey });
    ok('E1.a pack returns envelope object with required fields',
        env && env.v === 1 && env.cid === 'ch-test' && env.dir === 'down'
            && env.id === 'req-1' && env.type === 'echo' && env.nonce === meta.nonce
            && typeof env.ts === 'number' && env.enc === false
            && env.payload && env.payload.kind === 'json'
            && env.sig instanceof Uint8Array);

    // E1.b — round-trip JSON object payload
    const out = await E.unpack(env, { peerSignKey: sk.publicKey });
    ok('E1.b round-trip JSON payload (deep-equal)', JSON.stringify(out.payload) === JSON.stringify({ x: 1 }));

    // E1.c — metadata fields preserved
    eq('E1.c cid preserved',   out.cid, env.cid);
    eq('E1.c dir preserved',   out.dir, env.dir);
    eq('E1.c id preserved',    out.id,  env.id);
    eq('E1.c type preserved',  out.type, env.type);
    eq('E1.c nonce preserved', out.nonce, env.nonce);
    eq('E1.c ts preserved',    out.ts,    env.ts);
}

console.log('\n[suite] Envelope — pack/unpack (encrypted)');
{
    const sk         = await E.generateSignKeypair();
    const senderEcdh = await E.generateEcdhKeypair();
    const recipEcdh  = await E.generateEcdhKeypair();
    const encKey     = await E.deriveEncKey(senderEcdh.privateKey, recipEcdh.publicKey);
    const decKey     = await E.deriveEncKey(recipEcdh.privateKey, senderEcdh.publicKey);
    const meta = { v: 1, cid: 'ch-enc', dir: 'down', type: 'secrets', nonce: E.randNonce() };

    // E2.a — pack with enc:true
    const payload = { vaultKey: 'apple-river-1234:abc12345', accessToken: 'tok-789' };
    const env = await E.pack({ ...meta, payload, enc: true, signKey: sk.privateKey, encKey });
    ok('E2.a enc:true → payload has iv+ct, no plaintext data field',
        env.enc === true && env.payload.kind === 'json'
            && env.payload.iv instanceof Uint8Array && env.payload.ct instanceof Uint8Array
            && env.payload.data === undefined);

    // E2.b — unpack with recipient decKey
    const out = await E.unpack(env, { peerSignKey: sk.publicKey, decKey });
    ok('E2.b decrypts to the original JSON payload', JSON.stringify(out.payload) === JSON.stringify(payload));
}

console.log('\n[suite] Envelope — adversarial: tamper / wrong key (T5 misroute)');
{
    const sk     = await E.generateSignKeypair();
    const sk2    = await E.generateSignKeypair();
    const env    = await E.pack({ v: 1, cid: 'c', dir: 'down', type: 'x', nonce: E.randNonce(), payload: { a: 1 }, signKey: sk.privateKey });

    // E3 — tamper the payload data byte
    const tampered = { ...env, payload: { ...env.payload, data: new Uint8Array(env.payload.data) } };
    tampered.payload.data[0] ^= 0xFF;
    const err3 = await tryCatch(() => E.unpack(tampered, { peerSignKey: sk.publicKey }));
    ok('E3 tampered payload → EPROTO', err3 && err3.code === 'EPROTO');

    // E4 — wrong peer sign key
    const err4 = await tryCatch(() => E.unpack(env, { peerSignKey: sk2.publicKey }));
    ok('E4 wrong peerSignKey → EPROTO', err4 && err4.code === 'EPROTO');
}

console.log('\n[suite] Envelope — ReplayGuard (T6)');
{
    const guard = new E.ReplayGuard(60000);
    const now = Date.now();

    // E5.a — first call succeeds
    const err5a = await tryCatch(() => guard.check({ cid: 'c1', dir: 'down', nonce: 'n1', ts: now }));
    ok('E5.a unique nonce accepted', err5a === null);

    // E5.b — replay rejected
    const err5b = await tryCatch(() => guard.check({ cid: 'c1', dir: 'down', nonce: 'n1', ts: now }));
    ok('E5.b nonce reuse → EPROTO', err5b && err5b.code === 'EPROTO');

    // E5.c — different dir same nonce → no throw (per-(cid,dir) keying)
    const err5c = await tryCatch(() => guard.check({ cid: 'c1', dir: 'up', nonce: 'n1', ts: now }));
    ok('E5.c different dir same nonce → accepted', err5c === null);

    // E6 — ts outside window
    const err6 = await tryCatch(() => guard.check({ cid: 'c2', dir: 'down', nonce: 'n2', ts: now - 5 * 60000 }));
    ok('E6 ts out of window → EPROTO', err6 && err6.code === 'EPROTO');
}

console.log('\n[suite] Envelope — BINARY round-trip (review B2)');
{
    const sk = await E.generateSignKeypair();

    // E7.a — bytes payload, signed-only
    const env1 = await E.pack({ v: 1, cid: 'c', dir: 'down', type: 'vfs.read.result', nonce: E.randNonce(),
                                payload: PNG, signKey: sk.privateKey });
    ok('E7.a env.payload.kind === bytes', env1.payload.kind === 'bytes');
    const out1 = await E.unpack(env1, { peerSignKey: sk.publicKey });
    ok('E7.a unpack returns a Uint8Array', out1.payload instanceof Uint8Array);
    ok('E7.a PNG bytes round-trip byte-exact (signed only)', bytesEqual(out1.payload, PNG));

    // E7.b — bytes payload, encrypted
    const s = await E.generateEcdhKeypair();
    const r = await E.generateEcdhKeypair();
    const encKey = await E.deriveEncKey(s.privateKey, r.publicKey);
    const decKey = await E.deriveEncKey(r.privateKey, s.publicKey);
    const env2 = await E.pack({ v: 1, cid: 'c', dir: 'down', type: 'vfs.read.result', nonce: E.randNonce(),
                                payload: PNG, enc: true, signKey: sk.privateKey, encKey });
    const out2 = await E.unpack(env2, { peerSignKey: sk.publicKey, decKey });
    ok('E7.b PNG bytes round-trip byte-exact (encrypted)', bytesEqual(out2.payload, PNG));
}

console.log('\n[suite] Envelope — encryptBytes/decryptBytes direct (review B2)');
{
    const s = await E.generateEcdhKeypair();
    const r = await E.generateEcdhKeypair();
    const k = await E.deriveEncKey(s.privateKey, r.publicKey);
    const k2 = await E.deriveEncKey(r.privateKey, s.publicKey);

    // E8.a — direct round-trip
    const { iv, ct } = await E.encryptBytes(PNG, k);
    const pt = await E.decryptBytes({ iv, ct }, k2);
    ok('E8.a encryptBytes/decryptBytes round-trip', bytesEqual(pt, PNG));

    // E8.b — tampered ct → EPROTO
    const ctBad = new Uint8Array(ct);
    ctBad[0] ^= 0xFF;
    const err = await tryCatch(() => E.decryptBytes({ iv, ct: ctBad }, k2));
    ok('E8.b tampered ct → EPROTO', err && err.code === 'EPROTO');
}

console.log('\n[suite] Envelope — payload size edges');
{
    const sk = await E.generateSignKeypair();
    const meta = (n) => ({ v:1, cid:'c', dir:'down', type:'t', nonce:E.randNonce() });

    // E9.a — empty bytes
    const env0 = await E.pack({ ...meta(), payload: new Uint8Array(0), signKey: sk.privateKey });
    const out0 = await E.unpack(env0, { peerSignKey: sk.publicKey });
    ok('E9.a empty-bytes payload round-trip', out0.payload instanceof Uint8Array && out0.payload.length === 0);

    // E9.b — 1 byte
    const env1 = await E.pack({ ...meta(), payload: Uint8Array.of(42), signKey: sk.privateKey });
    const out1 = await E.unpack(env1, { peerSignKey: sk.publicKey });
    ok('E9.b 1-byte payload round-trip', bytesEqual(out1.payload, Uint8Array.of(42)));

    // E9.c — 1 MiB random (slow but bounded). getRandomValues caps at 64KB per call, so chunk.
    const big = new Uint8Array(1024 * 1024);
    for (let off = 0; off < big.length; off += 65536) crypto.getRandomValues(big.subarray(off, off + 65536));
    const envB = await E.pack({ ...meta(), payload: big, signKey: sk.privateKey });
    const outB = await E.unpack(envB, { peerSignKey: sk.publicKey });
    ok('E9.c 1MiB payload round-trip byte-exact', bytesEqual(outB.payload, big));
}

console.log('\n[suite] Envelope — misc adversarial + sanity');
{
    const sk = await E.generateSignKeypair();

    // E11 — same payload, different nonce → different envelopes, both verify
    const env1 = await E.pack({ v:1, cid:'c', dir:'down', type:'t', nonce: E.randNonce(), payload: { a: 1 }, signKey: sk.privateKey });
    const env2 = await E.pack({ v:1, cid:'c', dir:'down', type:'t', nonce: E.randNonce(), payload: { a: 1 }, signKey: sk.privateKey });
    ok('E11 different nonces → different signatures', !bytesEqual(env1.sig, env2.sig));
    const a = await E.unpack(env1, { peerSignKey: sk.publicKey });
    const b = await E.unpack(env2, { peerSignKey: sk.publicKey });
    ok('E11 both envelopes verify cleanly', a.payload.a === 1 && b.payload.a === 1);

    // E12 — 1000 nonces distinct
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(E.randNonce());
    eq('E12 1000 random nonces all unique', set.size, 1000);

    // E13 — Unicode JSON round-trip
    ok('E13 jsonToBytes/bytesToJson round-trip Unicode', E.bytesToJson(E.jsonToBytes({ s: 'héllo 🌐' })).s === 'héllo 🌐');
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
