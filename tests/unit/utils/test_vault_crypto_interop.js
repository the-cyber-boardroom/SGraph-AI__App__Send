/* =================================================================================
   SGraph Send — Cross-Language Interop Test for Vault Crypto
   Verifies that JavaScript SGVaultCrypto produces identical output to Python Vault__Crypto

   Run with: node tests/unit/utils/test_vault_crypto_interop.js

   Exit code 0 = all tests pass, 1 = failure
   ================================================================================= */

const { subtle } = globalThis.crypto

// --- Inline SGVaultCrypto (same as sg-vault-crypto.js) ---
// Duplicated here so the test is self-contained and can run with Node.js

class SGVaultCrypto {
    static KDF_ITERATIONS = 600000
    static KEY_LENGTH     = 256
    static FILE_ID_LENGTH = 12

    static parseVaultKey(fullVaultKey) {
        const parts = fullVaultKey.split(':')
        if (parts.length < 2) throw new Error('Invalid vault key format')
        const vaultId    = parts.pop()
        const passphrase = parts.join(':')
        if (!passphrase)                    throw new Error('Passphrase cannot be empty')
        if (!/^[0-9a-f]{8}$/.test(vaultId)) throw new Error('vault_id must be 8 hex characters')
        return { passphrase, vaultId }
    }

    static async deriveKeys(passphrase, vaultId) {
        const encoder         = new TextEncoder()
        const passphraseBytes = encoder.encode(passphrase)
        const keyMaterial     = await subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, ['deriveBits'])

        const readSalt  = encoder.encode(`sg-vault-v1:${vaultId}`)
        const writeSalt = encoder.encode(`sg-vault-v1:write:${vaultId}`)

        const [readBits, writeBits] = await Promise.all([
            subtle.deriveBits({ name: 'PBKDF2', salt: readSalt,  iterations: this.KDF_ITERATIONS, hash: 'SHA-256' }, keyMaterial, this.KEY_LENGTH),
            subtle.deriveBits({ name: 'PBKDF2', salt: writeSalt, iterations: this.KDF_ITERATIONS, hash: 'SHA-256' }, keyMaterial, this.KEY_LENGTH)
        ])

        const readKey  = await subtle.importKey('raw', readBits, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
        const writeKey = this._bytesToHex(new Uint8Array(writeBits))

        const hmacKey = await subtle.importKey('raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        const [treeFileId, settingsFileId] = await Promise.all([
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:tree:${vaultId}`),
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:settings:${vaultId}`)
        ])

        return { readKey, writeKey, treeFileId, settingsFileId, _readBits: readBits }
    }

    static async _deriveFileId(hmacKey, input) {
        const buf = await subtle.sign('HMAC', hmacKey, new TextEncoder().encode(input))
        return this._bytesToHex(new Uint8Array(buf)).slice(0, this.FILE_ID_LENGTH)
    }

    static _bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    }
}

// --- Cross-Language Test Vectors (from Python Vault__Crypto) ---

const VECTORS = [
    {
        passphrase:       'my-secret-passphrase',
        vault_id:         'a1b2c3d4',
        read_key_hex:     'a9cbcf15b4719384a732594405f138a2a42895fe56710dcfbd1324369f735124',
        write_key:        '3181d6650958b51fd00f913f6290eca22e6b09da661c8e831fc89fe659df378e',
        tree_file_id:     '4bc7e18f0779',
        settings_file_id: '591414eaaa88'
    },
    {
        passphrase:       'pass:with:colons',
        vault_id:         'deadbeef',
        read_key_hex:     'a903fc429b2806e6c05ba0d21271d982f451bd3c78e4899a8ee6e0fbed3d9b3f',
        write_key:        '3da59de516555d963eaf4c5d3179893acd9045bb0df69f3c89c0bed915a77f96',
        tree_file_id:     '220ae644906a',
        settings_file_id: '5398a4d71d8d'
    }
]

// --- Test Runner ---

let passed = 0
let failed = 0

function assert(condition, message) {
    if (condition) {
        passed++
        console.log(`  PASS: ${message}`)
    } else {
        failed++
        console.error(`  FAIL: ${message}`)
    }
}

function assertEqual(actual, expected, label) {
    if (actual === expected) {
        passed++
        console.log(`  PASS: ${label}`)
    } else {
        failed++
        console.error(`  FAIL: ${label}`)
        console.error(`    expected: ${expected}`)
        console.error(`    actual:   ${actual}`)
    }
}

async function runTests() {
    console.log('=== SGVaultCrypto Cross-Language Interop Tests ===\n')

    // --- Test vectors ---
    for (let i = 0; i < VECTORS.length; i++) {
        const v = VECTORS[i]
        console.log(`--- Vector ${i + 1}: passphrase="${v.passphrase}", vault_id="${v.vault_id}" ---`)

        const result    = await SGVaultCrypto.deriveKeys(v.passphrase, v.vault_id)
        const readKeyHex = SGVaultCrypto._bytesToHex(new Uint8Array(result._readBits))

        assertEqual(readKeyHex,           v.read_key_hex,     'read_key matches Python')
        assertEqual(result.writeKey,      v.write_key,        'write_key matches Python')
        assertEqual(result.treeFileId,    v.tree_file_id,     'tree_file_id matches Python')
        assertEqual(result.settingsFileId, v.settings_file_id, 'settings_file_id matches Python')
        console.log()
    }

    // --- parseVaultKey ---
    console.log('--- parseVaultKey tests ---')
    const p1 = SGVaultCrypto.parseVaultKey('my-passphrase:aabbccdd')
    assertEqual(p1.passphrase, 'my-passphrase', 'parse simple key: passphrase')
    assertEqual(p1.vaultId,    'aabbccdd',       'parse simple key: vaultId')

    const p2 = SGVaultCrypto.parseVaultKey('a:b:c:deadbeef')
    assertEqual(p2.passphrase, 'a:b:c',    'parse colons key: passphrase')
    assertEqual(p2.vaultId,    'deadbeef',  'parse colons key: vaultId')

    let threw = false
    try { SGVaultCrypto.parseVaultKey('no-colon-here') } catch { threw = true }
    assert(threw, 'parseVaultKey rejects no-colon input')

    threw = false
    try { SGVaultCrypto.parseVaultKey(':aabbccdd') } catch { threw = true }
    assert(threw, 'parseVaultKey rejects empty passphrase')

    threw = false
    try { SGVaultCrypto.parseVaultKey('pass:XXXXXXXX') } catch { threw = true }
    assert(threw, 'parseVaultKey rejects non-hex vault_id')

    // --- Key properties ---
    console.log('\n--- Key property tests ---')
    const r = await SGVaultCrypto.deriveKeys('test', 'aabbccdd')
    const readHex  = SGVaultCrypto._bytesToHex(new Uint8Array(r._readBits))
    assertEqual(readHex.length,          64, 'read_key is 32 bytes (64 hex chars)')
    assertEqual(r.writeKey.length,       64, 'write_key is 64 hex chars')
    assertEqual(r.treeFileId.length,     12, 'tree_file_id is 12 hex chars')
    assertEqual(r.settingsFileId.length, 12, 'settings_file_id is 12 hex chars')
    assert(readHex !== r.writeKey, 'read_key != write_key (independent)')

    // --- Determinism ---
    console.log('\n--- Determinism tests ---')
    const r2 = await SGVaultCrypto.deriveKeys('test', 'aabbccdd')
    assertEqual(r.writeKey,      r2.writeKey,      'same input → same write_key')
    assertEqual(r.treeFileId,    r2.treeFileId,    'same input → same tree_file_id')
    assertEqual(r.settingsFileId, r2.settingsFileId, 'same input → same settings_file_id')

    // --- Summary ---
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
    process.exit(failed > 0 ? 1 : 0)
}

runTests().catch(err => {
    console.error('Test runner error:', err)
    process.exit(1)
})
