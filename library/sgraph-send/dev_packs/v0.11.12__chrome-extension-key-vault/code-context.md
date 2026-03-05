# Code Context: Source Code to Reference and Interoperate With

**Version:** v0.11.12

The extension must interoperate with existing SG/Send crypto. This document shows the exact source code the extension's crypto module must match.

---

## 1. Vault Crypto — PBKDF2 Key Derivation (sg-vault-crypto.js)

**Path:** `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault-crypto.js`

This is the source of truth for vault key derivation. The extension must use identical parameters.

```javascript
class SGVaultCrypto {

    static KDF_ITERATIONS = 600000
    static KEY_LENGTH     = 256
    static FILE_ID_LENGTH = 12                                                 // 12 hex chars = 6 bytes

    // --- Vault Key Parsing ------------------------------------------------------

    static parseVaultKey(fullVaultKey) {
        const parts = fullVaultKey.split(':')
        if (parts.length < 2) {
            throw new Error('Invalid vault key format. Expected {passphrase}:{vault_id}')
        }
        const vaultId    = parts.pop()                                         // Last segment is vault_id
        const passphrase = parts.join(':')                                     // Everything before (may contain colons)
        if (!passphrase) {
            throw new Error('Passphrase cannot be empty')
        }
        if (!/^[0-9a-f]{8}$/.test(vaultId)) {
            throw new Error('vault_id must be 8 hex characters')
        }
        return { passphrase, vaultId }
    }

    // --- Full Key Derivation ----------------------------------------------------

    static async deriveKeys(passphrase, vaultId) {
        if (!crypto?.subtle) {
            throw new Error('Web Crypto API not available. Requires secure context (HTTPS or localhost).')
        }

        const encoder        = new TextEncoder()
        const passphraseBytes = encoder.encode(passphrase)

        // Import passphrase as PBKDF2 key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw', passphraseBytes, 'PBKDF2', false, ['deriveBits']
        )

        // Parallel PBKDF2: read_key + write_key
        const readSalt  = encoder.encode(`sg-vault-v1:${vaultId}`)
        const writeSalt = encoder.encode(`sg-vault-v1:write:${vaultId}`)

        const [readBits, writeBits] = await Promise.all([
            crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: readSalt, iterations: this.KDF_ITERATIONS, hash: 'SHA-256' },
                keyMaterial, this.KEY_LENGTH
            ),
            crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: writeSalt, iterations: this.KDF_ITERATIONS, hash: 'SHA-256' },
                keyMaterial, this.KEY_LENGTH
            )
        ])

        // read_key → AES-GCM CryptoKey
        const readKey = await crypto.subtle.importKey(
            'raw', readBits, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
        )

        // write_key → hex string
        const writeKey = this._bytesToHex(new Uint8Array(writeBits))

        // Derive deterministic file IDs via HMAC
        const hmacKey = await crypto.subtle.importKey(
            'raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        )

        const [treeFileId, settingsFileId] = await Promise.all([
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:tree:${vaultId}`),
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:settings:${vaultId}`)
        ])

        return { readKey, writeKey, treeFileId, settingsFileId }
    }

    static async _deriveFileId(hmacKey, input) {
        const buf = await crypto.subtle.sign(
            'HMAC', hmacKey, new TextEncoder().encode(input)
        )
        return this._bytesToHex(new Uint8Array(buf)).slice(0, this.FILE_ID_LENGTH)
    }

    static _bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
    }
}
```

### Key Parameters to Match

| Parameter | Value |
|-----------|-------|
| `KDF_ITERATIONS` | 600,000 |
| `KEY_LENGTH` | 256 bits |
| Read salt | `sg-vault-v1:{vault_id}` (UTF-8) |
| Write salt | `sg-vault-v1:write:{vault_id}` (UTF-8) |
| Tree file ID salt | `sg-vault-v1:file-id:tree:{vault_id}` |
| Settings file ID salt | `sg-vault-v1:file-id:settings:{vault_id}` |
| File ID | First 12 hex chars of HMAC-SHA256 |

---

## 2. Send Crypto — AES-256-GCM Encrypt/Decrypt (crypto.js)

**Path:** `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`

This is the encrypt/decrypt used for transfers. The extension's bundle encryption uses the same algorithm but with its own key derivation (user's master passphrase, not a vault key).

```javascript
const SendCrypto = {

    ALGORITHM: 'AES-GCM',
    KEY_LENGTH: 256,
    IV_LENGTH: 12,

    async generateKey() {
        return await window.crypto.subtle.generateKey(
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,
            ['encrypt', 'decrypt']
        );
    },

    async exportKey(key) {
        const raw = await window.crypto.subtle.exportKey('raw', key);
        return this.bufferToBase64Url(raw);
    },

    async importKey(base64Key) {
        const raw = this.base64UrlToBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'raw', raw,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            false,
            ['decrypt']
        );
    },

    async encryptFile(key, plaintext) {
        const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: this.ALGORITHM, iv },
            key,
            plaintext
        );
        const result = new Uint8Array(iv.length + ciphertext.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(ciphertext), iv.length);
        return result.buffer;
    },

    async decryptFile(key, encrypted) {
        const data = new Uint8Array(encrypted);
        const iv = data.slice(0, this.IV_LENGTH);
        const ciphertext = data.slice(this.IV_LENGTH);
        return await window.crypto.subtle.decrypt(
            { name: this.ALGORITHM, iv },
            key,
            ciphertext
        );
    },

    bufferToBase64Url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    },

    base64UrlToBuffer(base64url) {
        let base64 = base64url
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
};
```

### Wire Format

```
[12 bytes IV/nonce][ciphertext bytes][16 bytes GCM auth tag]
```

GCM appends the auth tag automatically. Total overhead: 12 + 16 = 28 bytes per encryption.

---

## 3. Extension's Own Crypto (New — to be built)

The extension needs three crypto modules:

### 3.1 Bundle Crypto (`bundle-crypto.js`)

```javascript
// Encrypt/decrypt the key bundle with user's master passphrase
// Same AES-256-GCM + PBKDF2 pattern, but with per-bundle random salt

export async function deriveMasterKey(passphrase, salt) {
    // PBKDF2-HMAC-SHA256, 600k iterations
    // salt: random 32 bytes (NOT sg-vault-v1:xxx)
}

export async function encryptBundle(masterKey, plaintextJson) {
    // AES-256-GCM with random 12-byte nonce
    // Returns: { salt, kdfParams, nonce, ciphertext }
}

export async function decryptBundle(masterKey, ciphertextObj) {
    // Decrypt → JSON string → parse
    // Returns: KeyBundlePlaintext
}
```

### 3.2 Vault Crypto (`vault-crypto.js`)

```javascript
// Interop with SGVaultCrypto — same parameters exactly
// Used when the extension needs to derive a vault's read/write keys

export async function deriveVaultKeys(passphrase, vaultId) {
    // Identical to SGVaultCrypto.deriveKeys()
    // Returns: { readKey, writeKey, treeFileId, settingsFileId }
}

export function parseVaultKey(fullVaultKey) {
    // Identical to SGVaultCrypto.parseVaultKey()
    // Returns: { passphrase, vaultId }
}
```

### 3.3 Identity Crypto (`identity-crypto.js`)

```javascript
// Ed25519 for signing and PKI
// Web Crypto API supports Ed25519 in Chrome 113+

export async function generateIdentityKeys() {
    // Returns: { publicKey (base64url), privateKey (base64url) }
}

export async function sign(privateKey, data) {
    // Ed25519 signature
    // Returns: base64url signature
}

export async function verify(publicKey, signature, data) {
    // Verify Ed25519 signature
    // Returns: boolean
}
```

---

## 4. Interop Test Strategy

**The first test must verify:** vault key derivation in the extension produces identical output to `SGVaultCrypto.deriveKeys()`.

Test vectors:
```javascript
const TEST_PASSPHRASE = 'test-passphrase-123'
const TEST_VAULT_ID   = 'a1b2c3d4'

// Derive keys using SGVaultCrypto (browser), record outputs:
// - readKey (exported as hex)
// - writeKey (hex string)
// - treeFileId (12 hex chars)
// - settingsFileId (12 hex chars)

// Then verify the extension's vault-crypto.js produces identical values
```

**The second test must verify:** bundle encrypt/decrypt round-trip.

```javascript
const bundle = { version: 1, identityKeys: {...}, rooms: {...} }
const encrypted = await encryptBundle(masterKey, JSON.stringify(bundle))
const decrypted = await decryptBundle(masterKey, encrypted)
assert(JSON.stringify(decrypted) === JSON.stringify(bundle))
```
