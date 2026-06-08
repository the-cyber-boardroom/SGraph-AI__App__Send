/**
 * vault-hkdf.js
 *
 * HKDF-SHA256 key derivation and AES-256-GCM inner encryption layer for
 * owner-only files under .vault/owner/*.
 *
 * Phase 2 will move this to _common/js/lib/crypto/.
 *
 * All functions are exported as named exports from this ES module.
 */

const HKDF_INFO = new TextEncoder().encode('sgraph-vault-secret-v1');

/**
 * Derive a deterministic 32-byte vault_secret_key from a vault key + vaultId.
 *
 * HKDF-SHA256 parameters:
 *   input  = vault_key (the passphrase portion, UTF-8 bytes)
 *   salt   = vault_id (UTF-8 bytes, vault-bound)
 *   info   = "sgraph-vault-secret-v1"
 *   length = 32
 *
 * Returns a CryptoKey (non-extractable, usable for AES-GCM encrypt/decrypt).
 */
export async function deriveVaultSecretKey(vaultKey, vaultId) {
    const passphrase = vaultKey.includes(':') ? vaultKey.split(':')[0] : vaultKey;
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode(vaultId),
            info: HKDF_INFO
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,   // extractable — needed for first-8-hex display in Crypto Lab
        ['encrypt', 'decrypt']
    );
}

/**
 * Export the raw bytes of a derived key (for display purposes only).
 * Returns Uint8Array (32 bytes).
 */
export async function exportKeyBytes(cryptoKey) {
    const raw = await crypto.subtle.exportKey('raw', cryptoKey);
    return new Uint8Array(raw);
}

/**
 * Encrypt plaintext (Uint8Array or string) with vault_secret_key.
 * Returns base64-encoded ciphertext (AES-256-GCM, 12-byte random IV prepended).
 */
export async function ownerEncrypt(vaultKey, vaultId, plaintext) {
    const key = await deriveVaultSecretKey(vaultKey, vaultId);
    const data = typeof plaintext === 'string'
        ? new TextEncoder().encode(plaintext)
        : plaintext;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const combined = new Uint8Array(12 + cipherBytes.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBytes), 12);
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ciphertext produced by ownerEncrypt.
 * ciphertextBase64: base64-encoded string with 12-byte IV prepended.
 * Returns Uint8Array of decrypted bytes.
 */
export async function ownerDecrypt(vaultKey, vaultId, ciphertextBase64) {
    const key = await deriveVaultSecretKey(vaultKey, vaultId);
    const raw = typeof ciphertextBase64 === 'string'
        ? Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0))
        : new Uint8Array(ciphertextBase64);
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const plainBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new Uint8Array(plainBytes);
}
