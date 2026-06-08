/* =================================================================================
   SGraph Send — Crypto Library
   v0.1.0 — AES-256-GCM encryption + PBKDF2 key derivation via Web Crypto API

   Extends the proven SendCrypto pattern from send.sgraph.ai v0.1.0.
   Adds PBKDF2 key derivation for vault passphrase → AES key.

   Wire format: [12 bytes IV][ciphertext + 16-byte auth tag]
   Key export:  base64url (44 chars for 256-bit key)
   KDF:         PBKDF2-SHA256, 600,000 iterations
   ================================================================================= */

class SGSendCrypto {

    static ALGORITHM    = 'AES-GCM'
    static KEY_LENGTH   = 256
    static IV_LENGTH    = 12
    static KDF_ITERATIONS = 600000

    // --- Availability Check ---------------------------------------------------

    static isAvailable() {
        return !!(globalThis.crypto && globalThis.crypto.subtle)
    }

    static requireSecureContext() {
        if (!this.isAvailable()) {
            throw new Error(
                'Web Crypto API is not available. ' +
                'It requires a secure context (HTTPS or localhost). ' +
                'If running locally, use "localhost" instead of "127.0.0.1".'
            )
        }
    }

    // --- Key Generation -------------------------------------------------------

    static async generateKey() {
        this.requireSecureContext()
        return crypto.subtle.generateKey(
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,
            ['encrypt', 'decrypt']
        )
    }

    // --- Key Export / Import --------------------------------------------------

    static async exportKey(key) {
        this.requireSecureContext()
        const raw   = await crypto.subtle.exportKey('raw', key)
        const bytes = new Uint8Array(raw)
        return this.bytesToBase64url(bytes)
    }

    static async importKey(keyString) {
        this.requireSecureContext()
        const bytes = this.base64urlToBytes(keyString)
        return crypto.subtle.importKey(
            'raw',
            bytes,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,
            ['encrypt', 'decrypt']
        )
    }

    // --- Key Derivation (PBKDF2) ---------------------------------------------

    static async deriveKey(passphrase, salt) {
        this.requireSecureContext()
        const enc         = new TextEncoder()
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        )
        return crypto.subtle.deriveKey(
            {
                name:       'PBKDF2',
                salt:       enc.encode(salt),
                iterations: this.KDF_ITERATIONS,
                hash:       'SHA-256'
            },
            keyMaterial,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,
            ['encrypt', 'decrypt']
        )
    }

    // --- Encrypt / Decrypt ----------------------------------------------------

    static async encrypt(data, key) {
        this.requireSecureContext()
        const iv         = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH))
        const ciphertext = await crypto.subtle.encrypt(
            { name: this.ALGORITHM, iv },
            key,
            data
        )
        const result = new Uint8Array(iv.byteLength + ciphertext.byteLength)
        result.set(iv, 0)
        result.set(new Uint8Array(ciphertext), iv.byteLength)
        return result.buffer
    }

    static async decrypt(data, key) {
        this.requireSecureContext()
        const bytes      = new Uint8Array(data)
        const iv         = bytes.slice(0, this.IV_LENGTH)
        const ciphertext = bytes.slice(this.IV_LENGTH)
        try {
            return await crypto.subtle.decrypt(
                { name: this.ALGORITHM, iv },
                key,
                ciphertext
            )
        } catch {
            throw new Error('Decryption failed. Wrong key or corrupted data.')
        }
    }

    // --- Base64url Helpers ----------------------------------------------------

    static bytesToBase64url(bytes) {
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
    }

    static base64urlToBytes(str) {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4 !== 0) {
            base64 += '='
        }
        const binary = atob(base64)
        const bytes  = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    }
}
