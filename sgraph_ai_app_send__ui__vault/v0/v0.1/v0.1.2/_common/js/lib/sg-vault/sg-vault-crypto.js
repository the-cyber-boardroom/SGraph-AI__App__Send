/* =================================================================================
   SGraph Vault — Deterministic Key Derivation
   v0.1.2 — Parallel PBKDF2 read/write key derivation + HMAC file ID generation

   From a vault key ({passphrase}:{vault_id}), derives:
     - read_key:          AES-256-GCM key for encrypting/decrypting all content
     - write_key:         hex string submitted to server for write authorization
     - tree_file_id:      deterministic 12-char hex ID for the vault tree
     - settings_file_id:  deterministic 12-char hex ID for the vault settings
     - ref_file_id:       deterministic 12-char hex ID for the vault HEAD ref

   Read and write keys are derived in PARALLEL via PBKDF2 with different salts.
   Knowing read_key does NOT reveal write_key (and vice versa).

   Compatible with sg-send-cli v0.5.x key derivation (same salts, iterations, HMAC domains).

   Depends on: Web Crypto API (secure context required)
   ================================================================================= */

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

        // Import passphrase as PBKDF2 key material (shared for both derivations)
        const keyMaterial = await crypto.subtle.importKey(
            'raw', passphraseBytes, 'PBKDF2', false, ['deriveBits']
        )

        // --- Parallel PBKDF2: read_key + write_key ---
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

        // read_key → AES-GCM CryptoKey (for encrypt/decrypt)
        const readKey = await crypto.subtle.importKey(
            'raw', readBits, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
        )

        // write_key → hex string (submitted to server as authorization header)
        const writeKey = this._bytesToHex(new Uint8Array(writeBits))

        // --- Derive deterministic file IDs via HMAC from read_key ---
        const hmacKey = await crypto.subtle.importKey(
            'raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        )

        const [treeFileId, settingsFileId, refFileId] = await Promise.all([
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:tree:${vaultId}`),
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:settings:${vaultId}`),
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:ref:${vaultId}`)
        ])

        return { readKey, writeKey, treeFileId, settingsFileId, refFileId }
    }

    // --- Internal Helpers -------------------------------------------------------

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
