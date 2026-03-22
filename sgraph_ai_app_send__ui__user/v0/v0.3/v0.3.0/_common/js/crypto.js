/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Client-Side Encryption Module
   v0.2.0 — Consolidated from v0.1.0 (unchanged logic)

   AES-256-GCM via Web Crypto API. All encryption and decryption happens
   in the browser. The key never leaves the user's device.

   Usage:
     const key = await SendCrypto.generateKey();
     const keyStr = await SendCrypto.exportKey(key);
     const encrypted = await SendCrypto.encryptFile(key, plaintext);
     const decrypted = await SendCrypto.decryptFile(key, encrypted);
   ═══════════════════════════════════════════════════════════════════════════════ */

const SendCrypto = {

    ALGORITHM: 'AES-GCM',
    KEY_LENGTH: 256,
    IV_LENGTH: 12,

    isAvailable() {
        return !!(window.crypto && window.crypto.subtle);
    },

    requireSecureContext() {
        if (!this.isAvailable()) {
            throw new Error(
                'Web Crypto API is not available. ' +
                'It requires a secure context (HTTPS or localhost). ' +
                'If running locally, use "localhost" instead of "127.0.0.1".'
            );
        }
    },

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
