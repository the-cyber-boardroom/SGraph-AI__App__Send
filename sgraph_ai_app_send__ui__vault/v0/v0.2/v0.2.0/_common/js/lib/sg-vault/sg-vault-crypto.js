/* =================================================================================
   SGraph Vault — Deterministic Key Derivation
   v0.1.3 — Self-describing four-segment IDs + HMAC file ID generation

   From a vault key ({passphrase}:{vault_id}), derives:
     - read_key:              AES-256-GCM key for encrypting/decrypting all content
     - write_key:             hex string submitted to server for write authorization
     - refFileId:             ref-pid-muw-{HMAC[:12]} for the vault HEAD ref
     - branchIndexFileId:     idx-pid-muw-{HMAC[:12]} for the branch index

   ID format: {type}-{derivation}-{mutability}-{hex_id}
     type:       obj | ref | idx | key | pkg
     derivation: pid (HMAC) | cas (SHA256) | rnd (random)
     mutability: imm | snw | muw

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
        // Simple token: word-word-NNNN (no colon) — token is both passphrase and vault_id
        if (/^[a-z]+-[a-z]+-\d{4}$/.test(fullVaultKey)) {
            return { passphrase: fullVaultKey, vaultId: fullVaultKey }
        }

        const parts = fullVaultKey.split(':')
        if (parts.length < 2) {
            throw new Error('Invalid vault key format. Expected {passphrase}:{vault_id} or a simple token (word-word-NNNN)')
        }
        const vaultId    = parts.pop()                                         // Last segment is vault_id
        const passphrase = parts.join(':')                                     // Everything before (may contain colons)
        if (!passphrase) {
            throw new Error('Passphrase cannot be empty')
        }
        if (!/^[a-z0-9]{4,24}$/.test(vaultId)) {
            throw new Error('vault_id must be 4-24 lowercase alphanumeric characters')
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

        const [refHex, branchIndexHex] = await Promise.all([
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:ref:${vaultId}`),
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:branch-index:${vaultId}`)
        ])

        return {
            readKey,
            writeKey,
            hmacKey,                                                             // Exposed for per-branch ref derivation
            refFileId:         'ref-pid-muw-' + refHex,                          // Named HEAD: deterministic, multi-writer
            branchIndexFileId: 'idx-pid-muw-' + branchIndexHex                   // Branch index: deterministic, multi-writer
        }
    }

    // --- Simple Token Key Derivation (different from standard vault keys) ---------
    //
    // Simple tokens use a 4-step derivation that differs from standard vault keys:
    //   1. PBKDF2 with FIXED salt "sgraph-send-v1" (no vault_id) -> aes_key
    //   2. HKDF(aes_key, info="vault-read-key") -> read_key
    //   3. HKDF(aes_key, info="vault-write-key") -> write_key
    //   4. vault_id = SHA-256(token)[:12 hex chars]
    // Then ref_file_id is derived via HMAC(read_key, domain) as usual.

    static async deriveKeysFromSimpleToken(token) {
        if (!crypto?.subtle) {
            throw new Error('Web Crypto API not available. Requires secure context (HTTPS or localhost).')
        }

        const encoder = new TextEncoder()

        // Step 1: PBKDF2 with fixed salt "sgraph-send-v1" -> intermediate aes_key
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(token), 'PBKDF2', false, ['deriveBits']
        )
        const aesKeyBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: encoder.encode('sgraph-send-v1'), iterations: this.KDF_ITERATIONS, hash: 'SHA-256' },
            keyMaterial, this.KEY_LENGTH
        )

        // Step 2: HKDF(aes_key, info="vault-read-key") -> read_key
        const hkdfKey = await crypto.subtle.importKey(
            'raw', aesKeyBits, 'HKDF', false, ['deriveBits']
        )
        const readBits = await crypto.subtle.deriveBits(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode('vault-read-key') },
            hkdfKey, this.KEY_LENGTH
        )

        // Step 3: HKDF(aes_key, info="vault-write-key") -> write_key
        const writeBits = await crypto.subtle.deriveBits(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode('vault-write-key') },
            hkdfKey, this.KEY_LENGTH
        )

        // Step 4: vault_id = SHA-256(token)[:12 hex chars]
        const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(token))
        const hashBytes = new Uint8Array(hashBuf)
        let vaultId = ''
        for (let i = 0; i < 6; i++) {
            vaultId += hashBytes[i].toString(16).padStart(2, '0')
        }

        // read_key as AES-GCM CryptoKey
        const readKey = await crypto.subtle.importKey(
            'raw', readBits, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
        )

        // write_key as hex string
        const writeKey = this._bytesToHex(new Uint8Array(writeBits))

        // Derive ref_file_id and branch_index_file_id via HMAC (same as standard path)
        const hmacKey = await crypto.subtle.importKey(
            'raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        )

        const [refHex, branchIndexHex] = await Promise.all([
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:ref:${vaultId}`),
            this._deriveFileId(hmacKey, `sg-vault-v1:file-id:branch-index:${vaultId}`)
        ])

        return {
            readKey,
            writeKey,
            hmacKey,
            vaultId,
            refFileId:         'ref-pid-muw-' + refHex,
            branchIndexFileId: 'idx-pid-muw-' + branchIndexHex
        }
    }

    // --- Per-Branch Ref Derivation -----------------------------------------------

    static async deriveBranchRefFileId(hmacKey, vaultId, branchName) {
        const hex = await this._deriveFileId(hmacKey, `sg-vault-v1:file-id:branch-ref:${vaultId}:${branchName}`)
        return 'ref-pid-snw-' + hex                                              // Clone branch: deterministic, single-writer
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
