/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Web Crypto API Wrapper
   v0.1.0 — Base major version

   AES-256-GCM encryption/decryption using the Web Crypto API.
   The server never sees plaintext. Keys never leave the browser.

   Format: [12 bytes IV][ciphertext + auth tag]
   ═══════════════════════════════════════════════════════════════════════════ */

const SendCrypto = {

    ALGORITHM: 'AES-GCM',
    KEY_LENGTH: 256,
    IV_LENGTH: 12,

    // ─── Key Generation ────────────────────────────────────────────────────

    /**
     * Generate a new AES-256-GCM CryptoKey.
     * @returns {Promise<CryptoKey>}
     */
    async generateKey() {
        return window.crypto.subtle.generateKey(
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,       // extractable — needed for export
            ['encrypt', 'decrypt']
        );
    },

    // ─── Key Export / Import ───────────────────────────────────────────────

    /**
     * Export a CryptoKey to a base64url string.
     * @param {CryptoKey} key
     * @returns {Promise<string>} base64url-encoded key (44 chars for 256-bit)
     */
    async exportKey(key) {
        const raw    = await window.crypto.subtle.exportKey('raw', key);
        const bytes  = new Uint8Array(raw);
        return this.bytesToBase64url(bytes);
    },

    /**
     * Import a base64url string back into a CryptoKey.
     * @param {string} keyString — base64url-encoded key
     * @returns {Promise<CryptoKey>}
     */
    async importKey(keyString) {
        const bytes = this.base64urlToBytes(keyString);
        return window.crypto.subtle.importKey(
            'raw',
            bytes,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true,
            ['encrypt', 'decrypt']
        );
    },

    // ─── Encrypt / Decrypt ─────────────────────────────────────────────────

    /**
     * Encrypt file data with AES-256-GCM.
     * Returns ArrayBuffer in format: [12-byte IV][ciphertext + auth tag]
     *
     * @param {CryptoKey} key
     * @param {ArrayBuffer|Uint8Array} fileData
     * @returns {Promise<ArrayBuffer>}
     */
    async encryptFile(key, fileData) {
        const iv         = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: this.ALGORITHM, iv: iv },
            key,
            fileData
        );

        // Bundle: [IV][ciphertext + auth tag]
        const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(ciphertext), iv.byteLength);
        return result.buffer;
    },

    /**
     * Decrypt data that was encrypted with encryptFile().
     * Expects format: [12-byte IV][ciphertext + auth tag]
     *
     * @param {CryptoKey} key
     * @param {ArrayBuffer|Uint8Array} encryptedData
     * @returns {Promise<ArrayBuffer>}
     * @throws {Error} "Wrong decryption key" on authentication failure
     */
    async decryptFile(key, encryptedData) {
        const data       = new Uint8Array(encryptedData);
        const iv         = data.slice(0, this.IV_LENGTH);
        const ciphertext = data.slice(this.IV_LENGTH);

        try {
            return await window.crypto.subtle.decrypt(
                { name: this.ALGORITHM, iv: iv },
                key,
                ciphertext
            );
        } catch (e) {
            throw new Error('Wrong decryption key. Please check and try again.');
        }
    },

    // ─── Base64url Helpers ─────────────────────────────────────────────────

    /**
     * Convert a Uint8Array to a base64url string (no padding).
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    bytesToBase64url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    },

    /**
     * Convert a base64url string back to Uint8Array.
     * @param {string} str — base64url (padding optional)
     * @returns {Uint8Array}
     */
    base64urlToBytes(str) {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }
        const binary = atob(base64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
};
