/* =============================================================================
   SGraph Send — Room Crypto Utilities
   v0.1.8 — Shared AES-256-GCM key for data room encryption

   Data rooms use a shared symmetric key (unlike personal vaults which use
   per-user RSA key pairs). The room key is:
     1. Generated when the room is created
     2. Shared via the invite URL hash (like send links share the decryption key)
     3. Never sent to the server

   Binary format: [12B IV][ciphertext+tag]
   (simpler than vault hybrid format — no RSA wrapping needed)
   ============================================================================= */

const RoomCrypto = {

    // --- Key Derivation from Passphrase -------------------------------------

    async deriveKey(passphrase) {
        const enc       = new TextEncoder().encode(passphrase);
        const hash      = await crypto.subtle.digest('SHA-256', enc);
        return crypto.subtle.importKey(
            'raw', hash,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    },

    // --- Generate a random room key (hex string for URL sharing) ------------

    generateRoomKey() {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // --- Import a hex key string to CryptoKey --------------------------------

    async importKey(hexKey) {
        const bytes = new Uint8Array(hexKey.match(/.{2}/g).map(h => parseInt(h, 16)));
        return crypto.subtle.importKey(
            'raw', bytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    },

    // --- Encrypt (returns Uint8Array) ----------------------------------------

    async encrypt(key, data) {
        const iv         = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        // Pack: [12B IV][ciphertext]
        const packed = new Uint8Array(12 + ciphertext.byteLength);
        packed.set(iv, 0);
        packed.set(new Uint8Array(ciphertext), 12);
        return packed;
    },

    // --- Decrypt (returns Uint8Array) ----------------------------------------

    async decrypt(key, packed) {
        const iv = packed.slice(0, 12);
        const ct = packed.slice(12);
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ct
        );
        return new Uint8Array(plaintext);
    },

    // --- Base64 codec --------------------------------------------------------

    arrayBufToB64(buf) {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    },

    b64ToArrayBuf(b64) {
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
};
