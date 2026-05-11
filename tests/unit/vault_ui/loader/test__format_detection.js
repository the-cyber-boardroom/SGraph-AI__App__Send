/* =================================================================================
   VaultLoader — Format Detection Unit Tests
   Verifies VaultLoaderFormat.detectFormat() for all 5 formats + error cases.
   Run: node tests/unit/vault_ui/loader/test__format_detection.js
   ================================================================================= */

import { suite, assert } from './helpers.js';
import './load-loader.js';

// ---------------------------------------------------------------------------
// Format 1 — Simple token: word-word-NNNN
// ---------------------------------------------------------------------------
suite('detectFormat — Format 1: simple token', ({ test }) => {

    test('canonical simple token', () => {
        const r = VaultLoader.detectFormat('apple-river-1234');
        assert.equal(r.format, 1);
        assert.equal(r.kind,   'simple-token');
        assert.equal(r.parts.passphrase, 'apple-river-1234');
        assert.equal(r.parts.vaultId,    null);
        assert.equal(r.parts.raw,        'apple-river-1234');
    });

    test('trims leading/trailing whitespace', () => {
        const r = VaultLoader.detectFormat('  apple-river-1234  ');
        assert.equal(r.format, 1);
    });

    test('four-digit numbers at boundary: 1000', () => {
        assert.equal(VaultLoader.detectFormat('abc-def-1000').format, 1);
    });

    test('four-digit numbers at boundary: 9999', () => {
        assert.equal(VaultLoader.detectFormat('abc-def-9999').format, 1);
    });

    test('longer words are accepted', () => {
        assert.equal(VaultLoader.detectFormat('wonderful-mountain-5678').format, 1);
    });
});

// ---------------------------------------------------------------------------
// Format 2 — Passphrase + exactly-12-hex vault_id
// ---------------------------------------------------------------------------
suite('detectFormat — Format 2: passphrase:hex_id (12 chars)', ({ test }) => {

    test('simple token as passphrase + 12-hex id', () => {
        const r = VaultLoader.detectFormat('apple-river-1234:abcdef012345');
        assert.equal(r.format, 2);
        assert.equal(r.kind, 'passphrase-hex-id');
        assert.equal(r.parts.passphrase, 'apple-river-1234');
        assert.equal(r.parts.vaultId,   'abcdef012345');
    });

    test('plain passphrase + 12-hex id', () => {
        const r = VaultLoader.detectFormat('mysecretpass:abcdef012345');
        assert.equal(r.format, 2);
        assert.equal(r.parts.passphrase, 'mysecretpass');
        assert.equal(r.parts.vaultId,   'abcdef012345');
    });

    test('passphrase with colons + 12-hex id (last colon is separator)', () => {
        const r = VaultLoader.detectFormat('pass:with:colons:aabbccddeeff');
        assert.equal(r.format, 2);
        assert.equal(r.parts.passphrase, 'pass:with:colons');
        assert.equal(r.parts.vaultId,   'aabbccddeeff');
    });

    test('all-lowercase hex digits: all [0-9a-f] accepted', () => {
        const r = VaultLoader.detectFormat('pass:0123456789ab');
        assert.equal(r.format, 2);
    });

    test('13-char hex is NOT format 2 (falls through to format 3)', () => {
        const r = VaultLoader.detectFormat('pass:abcdef0123456');
        assert.equal(r.format, 3, '13-char hex should be format 3 (alnum)');
    });
});

// ---------------------------------------------------------------------------
// Format 3 — Passphrase + 4–24 alnum vault_id
// ---------------------------------------------------------------------------
suite('detectFormat — Format 3: passphrase:alnum_id', ({ test }) => {

    test('4-char alnum id', () => {
        assert.equal(VaultLoader.detectFormat('foo:abcd').format, 3);
    });

    test('24-char alnum id (max)', () => {
        const r = VaultLoader.detectFormat('foo:' + 'a'.repeat(24));
        assert.equal(r.format, 3);
        assert.equal(r.parts.vaultId, 'a'.repeat(24));
    });

    test('mixed letters+digits in id', () => {
        const r = VaultLoader.detectFormat('foo:short01');
        assert.equal(r.format, 3);
    });

    test('longer alnum vault id from server', () => {
        const r = VaultLoader.detectFormat('mylongpassphrase:mylongerservervaultid01');
        assert.equal(r.format, 3);
        assert.equal(r.parts.passphrase, 'mylongpassphrase');
        assert.equal(r.parts.vaultId,   'mylongerservervaultid01');
    });
});

// ---------------------------------------------------------------------------
// Format 4 — Read-only credential: vault_id<whitespace>64-hex-read-key
// ---------------------------------------------------------------------------
suite('detectFormat — Format 4: read-only credential', ({ test }) => {

    const VAULT_ID = 'abcdef012345';
    const READ_KEY = '0'.repeat(64);

    test('canonical: vault_id space 64-hex', () => {
        const r = VaultLoader.detectFormat(`${VAULT_ID} ${READ_KEY}`);
        assert.equal(r.format, 4);
        assert.equal(r.kind,   'read-only');
        assert.equal(r.parts.vaultId,    VAULT_ID);
        assert.equal(r.parts.readKeyHex, READ_KEY);
        assert.equal(r.parts.passphrase, null);
    });

    test('multiple spaces between id and key', () => {
        const r = VaultLoader.detectFormat(`${VAULT_ID}   ${READ_KEY}`);
        assert.equal(r.format, 4);
    });

    test('tab as separator', () => {
        const r = VaultLoader.detectFormat(`${VAULT_ID}\t${READ_KEY}`);
        assert.equal(r.format, 4);
    });

    test('full 64-hex read key with all valid chars', () => {
        const key = 'abcdef0123456789'.repeat(4);  // 64 chars
        const r   = VaultLoader.detectFormat(`${VAULT_ID} ${key}`);
        assert.equal(r.format, 4);
        assert.equal(r.parts.readKeyHex, key);
    });
});

// ---------------------------------------------------------------------------
// Error cases — unrecognised formats
// ---------------------------------------------------------------------------
suite('detectFormat — error cases', ({ test }) => {

    test('empty string throws', () => {
        assert.throws(() => VaultLoader.detectFormat(''));
    });

    test('whitespace-only throws', () => {
        assert.throws(() => VaultLoader.detectFormat('   '));
    });

    test('two words only (apple-river) throws', () => {
        assert.throws(() => VaultLoader.detectFormat('apple-river'));
    });

    test('three segments without number (abc-def-ghi) throws', () => {
        assert.throws(() => VaultLoader.detectFormat('abc-def-ghi'));
    });

    test('three-digit suffix is not a simple token', () => {
        assert.throws(() => VaultLoader.detectFormat('abc-def-123'));
    });

    test('passphrase:UPPER-HEX rejected (hex must be lowercase)', () => {
        assert.throws(() => VaultLoader.detectFormat('pass:ABCDEF012345'));
    });

    test('passphrase:25-char alnum rejected (exceeds 24)', () => {
        assert.throws(() => VaultLoader.detectFormat('pass:' + 'a'.repeat(25)));
    });

    test('63-char read key rejected (not 64)', () => {
        assert.throws(() => VaultLoader.detectFormat('abcdef012345 ' + '0'.repeat(63)));
    });

    test('read-only without space between id and key throws', () => {
        // This looks like a very long alnum passphrase+id — but it won't match
        // any pattern because vaultId+readKey in one string has no separator.
        assert.throws(() => VaultLoader.detectFormat('abcdef012345' + '0'.repeat(64)));
    });
});
