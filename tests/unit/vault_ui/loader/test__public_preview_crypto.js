/* =================================================================================
   Unit/KAT — Public Vault Previews derivation + schema.
   Run: node tests/unit/vault_ui/loader/test__public_preview_crypto.js

   No third-party deps. Sources the browser global-scope modules via
   runInThisContext (crypto.subtle / btoa / TextEncoder are global in Node 18+).
   ================================================================================= */

import { readFileSync }       from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runInThisContext }   from 'node:vm';
import { strict as assert }   from 'node:assert';

const LIB = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-public-preview/',
    import.meta.url
);

function source(file) {
    const path = fileURLToPath(new URL(file, LIB));
    runInThisContext(readFileSync(path, 'utf8'), { filename: file, displayErrors: true });
}
source('public-preview-crypto.js');
source('public-preview-schema.js');
source('public-preview-read.js');
// Lift the const bindings onto globalThis for this ESM module to read.
runInThisContext('globalThis.PublicPreviewCrypto = PublicPreviewCrypto; globalThis.PublicPreviewSchema = PublicPreviewSchema; globalThis.PublicPreviewRead = PublicPreviewRead;');
const { PublicPreviewCrypto: PPC, PublicPreviewSchema: PPS, PublicPreviewRead: PPR } = globalThis;

// --- tiny async runner -----------------------------------------------------------
const tests = [];
const test  = (label, body) => tests.push({ label, body });

// PBKDF2 helper to independently compute key bytes for a given salt (for R3).
async function pbkdf2Bytes(input, salt) {
    const enc = new TextEncoder();
    const km  = await crypto.subtle.importKey('raw', enc.encode(input), 'PBKDF2', false, ['deriveBits']);
    const b   = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 600000, hash: 'SHA-256' }, km, 256);
    return Buffer.from(new Uint8Array(b)).toString('hex');
}
async function sha256First12(input) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Buffer.from(new Uint8Array(h)).toString('hex').slice(0, 12);
}

// --- R3: namespace separation (the security gate) --------------------------------
test('R3 — read-key bytes differ across the three namespaces for the same input', async () => {
    const input = 'x';
    const pub   = Buffer.from(await PPC._deriveReadKeyBytes(input)).toString('hex');
    const send  = await pbkdf2Bytes(input, 'sgraph-send-v1');        // Simple Token salt
    const vault = await pbkdf2Bytes(input, 'sg-vault-v1:x');          // vault read-key salt
    const self  = await pbkdf2Bytes(input, 'sgraph-public-preview-v1');
    assert.equal(pub, self, 'public-preview derive must equal PBKDF2 with its own salt');
    assert.notEqual(pub, send,  'must differ from Simple Token namespace');
    assert.notEqual(pub, vault, 'must differ from vault-key namespace');
});

test('transfer-id is 12 lowercase hex and domain-separated from FriendlyCrypto', async () => {
    const tid = await PPC.deriveTransferId('vault-demo-health-data');
    assert.match(tid, /^[a-f0-9]{12}$/, 'must match ^[a-f0-9]{12}$');
    const bare = await sha256First12('vault-demo-health-data');      // FriendlyCrypto-style (bare)
    assert.notEqual(tid, bare, 'must differ from a bare SHA-256(token)[:12]');
});

test('normalization — case/whitespace insensitive', async () => {
    assert.equal(await PPC.deriveTransferId('  Vault-Demo  '), await PPC.deriveTransferId('vault-demo'));
});

test('read key is non-extractable (export throws)', async () => {
    const k = await PPC.deriveReadKeyRO('vault-demo');
    await assert.rejects(() => crypto.subtle.exportKey('raw', k), 'non-extractable key must not export');
});

test('round-trip — encrypt(write) then decrypt(read) recovers the JSON', async () => {
    const id      = 'mvp-demo-x';
    const writeK  = await PPC.deriveWriteKey(id);
    const readK   = await PPC.deriveReadKeyRO(id);
    const preview = { schema: 'sgraph-public-preview/v1', title: 'Demo', description: 'hi' };
    const bytes   = new TextEncoder().encode(JSON.stringify(preview));
    const cipher  = await PPC.encrypt(bytes.buffer, writeK);
    const plain   = await PPC.decrypt(cipher, readK);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)), preview);
});

test('delete_auth is random (two calls differ) and 43-char base64url', () => {
    const a = PPC.randomDeleteAuth(), b = PPC.randomDeleteAuth();
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
});

// --- schema validation -----------------------------------------------------------
test('validatePreview — accepts minimal, rejects unknown schema / banned field / big thumb', () => {
    assert.equal(PPS.validatePreview({ schema: 'sgraph-public-preview/v1', title: 'T' }).ok, true);
    assert.equal(PPS.validatePreview({ schema: 'nope', title: 'T' }).ok, false);
    assert.equal(PPS.validatePreview({ schema: 'sgraph-public-preview/v1', title: 'T', extra: { write_key: 'x' } }).ok, false);
    const big = { schema: 'sgraph-public-preview/v1', title: 'T', thumbnail: { mode: 'inline', data: 'a'.repeat(400000) } };  // > 300 KB cap
    assert.equal(PPS.validatePreview(big).ok, false);
});

test('validatePublicId — rules + Simple-Token rejection', () => {
    assert.equal(PPS.validatePublicId('vault-demo-health-data').ok, true);
    assert.equal(PPS.validatePublicId('ab').ok, false);              // too short
    assert.equal(PPS.validatePublicId('-bad').ok, false);            // leading hyphen
    assert.equal(PPS.validatePublicId('a--b-cd').ok, false);         // double hyphen
    assert.equal(PPS.validatePublicId('Bad_Id!').ok, false);         // charset
    assert.equal(PPS.validatePublicId('apple-mango-5623').ok, false);// Simple Token shape
    assert.match(PPS.randomPublicId(), /^[a-z0-9]{16}$/);
});

// --- read path (fetchPreview) against real ciphertext + a stubbed fetch ----------
test('fetchPreview — ok against real ciphertext; 404 -> not-found', async () => {
    const id      = 'vault-demo-health-data';
    const preview = { schema: 'sgraph-public-preview/v1', title: 'Health Data Demo', description: 'public demo' };
    const wk      = await PPC.deriveWriteKey(id);
    const cipher  = await PPC.encrypt(new TextEncoder().encode(JSON.stringify(preview)).buffer, wk);
    const tid     = await PPC.deriveTransferId(id);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => url.endsWith('/download/' + tid)
        ? { ok: true,  status: 200, arrayBuffer: async () => cipher }
        : { ok: false, status: 404, text: async () => 'not found' };
    try {
        const ok = await PPR.fetchPreview('https://send.sgraph.ai', id);
        assert.equal(ok.status, 'ok');
        assert.deepEqual(ok.preview, preview);
        const nf = await PPR.fetchPreview('https://send.sgraph.ai', 'missing-one');
        assert.equal(nf.status, 'not-found');
    } finally { globalThis.fetch = realFetch; }
});

// --- run -------------------------------------------------------------------------
(async () => {
    console.log('\n[suite] Public Vault Previews — crypto + schema');
    let pass = 0, fail = 0;
    for (const { label, body } of tests) {
        try { await body(); console.log(`  ✓ ${label}`); pass++; }
        catch (err) { console.log(`  ✗ ${label}\n      ${err.message}`); fail++; }
    }
    console.log(`  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
})();
