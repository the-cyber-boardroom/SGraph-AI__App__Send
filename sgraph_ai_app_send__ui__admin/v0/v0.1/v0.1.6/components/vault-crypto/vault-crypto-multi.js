/* =============================================================================
   SGraph Send — Multi-Recipient Vault Encryption
   Phase 1: Support N wrapped AES keys per encrypted blob

   Format v2 (multi-recipient):
   [1 byte version = 0x02]
   [2 bytes num_recipients (uint16 big-endian)]
   For each recipient:
     [2 bytes fingerprint_length (uint16 big-endian)]
     [fingerprint_length bytes fingerprint (UTF-8)]
     [2 bytes wrapped_key_length (uint16 big-endian)]
     [wrapped_key_length bytes wrapped_key]
   [12 bytes IV]
   [remaining bytes = ciphertext]

   Format v1 (legacy single-recipient — existing format):
   [4 bytes wrappedKey length (uint32 LE)][wrappedKey][12 bytes IV][ciphertext]

   The decryptMulti function auto-detects v1 vs v2 by checking the version byte.
   If byte[0] is 0x02, it's v2 multi-recipient. Otherwise it's v1 legacy.
   (v1 first byte is a uint32 LE length, which for RSA-4096 wrapped keys is
   always 0x00 0x02 0x00 0x00 = 512 bytes, so byte[0] = 0x00 not 0x02)
   ============================================================================= */

(function() {
    'use strict';

    const VERSION_MULTI = 0x02;

    // =========================================================================
    // Multi-recipient encrypt
    // =========================================================================

    /**
     * Encrypt data for multiple recipients.
     * @param {Array<{publicKey: CryptoKey, fingerprint: string}>} recipients
     * @param {ArrayBuffer|Uint8Array} data - plaintext to encrypt
     * @returns {Promise<Uint8Array>} packed multi-recipient ciphertext
     */
    async function encryptMulti(recipients, data) {
        if (!recipients || recipients.length === 0) {
            throw new Error('At least one recipient required');
        }

        // Generate a single AES-256-GCM key for the content
        const aesKey    = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const iv        = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
        const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

        // Wrap the AES key once per recipient
        const wrappedEntries = [];
        for (const { publicKey, fingerprint } of recipients) {
            const wrappedKey      = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
            const fingerprintBytes = new TextEncoder().encode(fingerprint);
            wrappedEntries.push({ fingerprintBytes, wrappedKey: new Uint8Array(wrappedKey) });
        }

        // Calculate total packed size
        let headerSize = 1 + 2; // version + num_recipients
        for (const { fingerprintBytes, wrappedKey } of wrappedEntries) {
            headerSize += 2 + fingerprintBytes.length + 2 + wrappedKey.length;
        }
        const totalSize = headerSize + 12 + encrypted.byteLength;

        // Pack
        const packed = new Uint8Array(totalSize);
        let offset = 0;

        // Version byte
        packed[offset++] = VERSION_MULTI;

        // Num recipients (uint16 big-endian)
        packed[offset++] = (recipients.length >> 8) & 0xFF;
        packed[offset++] = recipients.length & 0xFF;

        // Each recipient entry
        for (const { fingerprintBytes, wrappedKey } of wrappedEntries) {
            // Fingerprint length (uint16 big-endian)
            packed[offset++] = (fingerprintBytes.length >> 8) & 0xFF;
            packed[offset++] = fingerprintBytes.length & 0xFF;
            packed.set(fingerprintBytes, offset);
            offset += fingerprintBytes.length;

            // Wrapped key length (uint16 big-endian)
            packed[offset++] = (wrappedKey.length >> 8) & 0xFF;
            packed[offset++] = wrappedKey.length & 0xFF;
            packed.set(wrappedKey, offset);
            offset += wrappedKey.length;
        }

        // IV + ciphertext
        packed.set(iv, offset);
        offset += 12;
        packed.set(new Uint8Array(encrypted), offset);

        return packed;
    }

    // =========================================================================
    // Multi-recipient decrypt (auto-detects v1 vs v2)
    // =========================================================================

    /**
     * Decrypt a packed blob. Auto-detects v1 (single) vs v2 (multi) format.
     * @param {CryptoKey} privateKey - RSA-OAEP private key
     * @param {ArrayBuffer|Uint8Array} packed - encrypted blob
     * @param {string} [myFingerprint] - optional fingerprint to find the right wrapped key in v2
     * @returns {Promise<ArrayBuffer>} decrypted plaintext
     */
    async function decryptMulti(privateKey, packed, myFingerprint) {
        const bytes = new Uint8Array(packed);

        if (bytes[0] === VERSION_MULTI) {
            return _decryptV2(privateKey, bytes, myFingerprint);
        }
        return _decryptV1(privateKey, bytes);
    }

    /**
     * Decrypt v1 format (legacy single-recipient).
     * Format: [4 bytes wkLen LE][wrappedKey][12 bytes IV][ciphertext]
     */
    async function _decryptV1(privateKey, bytes) {
        const wkLen      = new Uint32Array(bytes.slice(0, 4).buffer)[0];
        const wrappedKey = bytes.slice(4, 4 + wkLen);
        const iv         = bytes.slice(4 + wkLen, 4 + wkLen + 12);
        const ciphertext = bytes.slice(4 + wkLen + 12);
        const rawAesKey  = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);
        const aesKey     = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    }

    /**
     * Decrypt v2 format (multi-recipient).
     * Tries myFingerprint first, then brute-forces all entries.
     */
    async function _decryptV2(privateKey, bytes, myFingerprint) {
        let offset = 1; // skip version byte

        // Num recipients
        const numRecipients = (bytes[offset] << 8) | bytes[offset + 1];
        offset += 2;

        // Parse all recipient entries
        const entries = [];
        for (let i = 0; i < numRecipients; i++) {
            const fpLen = (bytes[offset] << 8) | bytes[offset + 1];
            offset += 2;
            const fpBytes = bytes.slice(offset, offset + fpLen);
            const fingerprint = new TextDecoder().decode(fpBytes);
            offset += fpLen;

            const wkLen = (bytes[offset] << 8) | bytes[offset + 1];
            offset += 2;
            const wrappedKey = bytes.slice(offset, offset + wkLen);
            offset += wkLen;

            entries.push({ fingerprint, wrappedKey });
        }

        // IV + ciphertext
        const iv         = bytes.slice(offset, offset + 12);
        const ciphertext = bytes.slice(offset + 12);

        // Try matching fingerprint first (fast path)
        if (myFingerprint) {
            const match = entries.find(e => e.fingerprint === myFingerprint);
            if (match) {
                return _unwrapAndDecrypt(privateKey, match.wrappedKey, iv, ciphertext);
            }
        }

        // Brute-force: try each entry until one works
        for (const entry of entries) {
            try {
                return await _unwrapAndDecrypt(privateKey, entry.wrappedKey, iv, ciphertext);
            } catch {
                continue; // wrong key, try next
            }
        }

        throw new Error('No matching recipient key found');
    }

    async function _unwrapAndDecrypt(privateKey, wrappedKey, iv, ciphertext) {
        const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);
        const aesKey    = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    }

    // =========================================================================
    // Re-key: add a recipient to an existing encrypted blob
    // =========================================================================

    /**
     * Add a new recipient to an existing v2 blob without re-encrypting the content.
     * The caller must have the private key to unwrap the AES key.
     * @param {CryptoKey} myPrivateKey - to unwrap the existing AES key
     * @param {ArrayBuffer|Uint8Array} packed - existing v2 blob
     * @param {string} myFingerprint - to find the right wrapped key
     * @param {CryptoKey} newPublicKey - new recipient's public key
     * @param {string} newFingerprint - new recipient's fingerprint
     * @returns {Promise<Uint8Array>} new packed blob with added recipient
     */
    async function addRecipient(myPrivateKey, packed, myFingerprint, newPublicKey, newFingerprint) {
        const bytes = new Uint8Array(packed);
        if (bytes[0] !== VERSION_MULTI) {
            throw new Error('addRecipient only works with v2 format');
        }

        let offset = 1;
        const numRecipients = (bytes[offset] << 8) | bytes[offset + 1];
        offset += 2;

        // Parse existing entries
        const entries = [];
        for (let i = 0; i < numRecipients; i++) {
            const fpLen = (bytes[offset] << 8) | bytes[offset + 1];
            offset += 2;
            const fpBytes = bytes.slice(offset, offset + fpLen);
            offset += fpLen;
            const wkLen = (bytes[offset] << 8) | bytes[offset + 1];
            offset += 2;
            const wrappedKey = bytes.slice(offset, offset + wkLen);
            offset += wkLen;
            entries.push({ fingerprintBytes: fpBytes, wrappedKey });
        }

        const ivAndCiphertext = bytes.slice(offset);

        // Unwrap the AES key using our private key
        const myEntry = entries.find((e, idx) => {
            const fp = new TextDecoder().decode(e.fingerprintBytes);
            return fp === myFingerprint;
        });
        if (!myEntry) throw new Error('Own fingerprint not found in blob');

        const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, myPrivateKey, myEntry.wrappedKey);

        // Wrap for new recipient
        const newWrappedKey      = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, newPublicKey, rawAesKey);
        const newFpBytes         = new TextEncoder().encode(newFingerprint);
        const newWrappedKeyBytes = new Uint8Array(newWrappedKey);

        // Rebuild packed blob with extra recipient
        let headerSize = 1 + 2;
        for (const e of entries) {
            headerSize += 2 + e.fingerprintBytes.length + 2 + e.wrappedKey.length;
        }
        headerSize += 2 + newFpBytes.length + 2 + newWrappedKeyBytes.length;

        const newPacked = new Uint8Array(headerSize + ivAndCiphertext.length);
        let pos = 0;

        newPacked[pos++] = VERSION_MULTI;
        const newCount = numRecipients + 1;
        newPacked[pos++] = (newCount >> 8) & 0xFF;
        newPacked[pos++] = newCount & 0xFF;

        // Existing entries
        for (const e of entries) {
            newPacked[pos++] = (e.fingerprintBytes.length >> 8) & 0xFF;
            newPacked[pos++] = e.fingerprintBytes.length & 0xFF;
            newPacked.set(e.fingerprintBytes, pos);
            pos += e.fingerprintBytes.length;
            newPacked[pos++] = (e.wrappedKey.length >> 8) & 0xFF;
            newPacked[pos++] = e.wrappedKey.length & 0xFF;
            newPacked.set(e.wrappedKey, pos);
            pos += e.wrappedKey.length;
        }

        // New entry
        newPacked[pos++] = (newFpBytes.length >> 8) & 0xFF;
        newPacked[pos++] = newFpBytes.length & 0xFF;
        newPacked.set(newFpBytes, pos);
        pos += newFpBytes.length;
        newPacked[pos++] = (newWrappedKeyBytes.length >> 8) & 0xFF;
        newPacked[pos++] = newWrappedKeyBytes.length & 0xFF;
        newPacked.set(newWrappedKeyBytes, pos);
        pos += newWrappedKeyBytes.length;

        // IV + ciphertext (unchanged)
        newPacked.set(ivAndCiphertext, pos);

        return newPacked;
    }

    // =========================================================================
    // Migrate: convert v1 blob to v2 with single recipient
    // =========================================================================

    /**
     * Convert a v1 single-recipient blob to v2 format.
     * Does NOT re-encrypt — just repackages the wrapped key with fingerprint.
     * @param {ArrayBuffer|Uint8Array} packed - v1 blob
     * @param {string} fingerprint - owner's fingerprint
     * @returns {Uint8Array} v2 blob with one recipient
     */
    function migrateV1toV2(packed, fingerprint) {
        const bytes = new Uint8Array(packed);
        const wkLen      = new Uint32Array(bytes.slice(0, 4).buffer)[0];
        const wrappedKey = bytes.slice(4, 4 + wkLen);
        const ivAndCt    = bytes.slice(4 + wkLen); // IV + ciphertext

        const fpBytes = new TextEncoder().encode(fingerprint);

        const headerSize = 1 + 2 + 2 + fpBytes.length + 2 + wrappedKey.length;
        const result     = new Uint8Array(headerSize + ivAndCt.length);
        let pos = 0;

        result[pos++] = VERSION_MULTI;
        result[pos++] = 0; result[pos++] = 1; // 1 recipient

        result[pos++] = (fpBytes.length >> 8) & 0xFF;
        result[pos++] = fpBytes.length & 0xFF;
        result.set(fpBytes, pos);
        pos += fpBytes.length;

        result[pos++] = (wrappedKey.length >> 8) & 0xFF;
        result[pos++] = wrappedKey.length & 0xFF;
        result.set(wrappedKey, pos);
        pos += wrappedKey.length;

        result.set(ivAndCt, pos);

        return result;
    }

    // =========================================================================
    // Export
    // =========================================================================

    window.sgraphAdmin = window.sgraphAdmin || {};
    window.sgraphAdmin.vaultCryptoMulti = {
        encryptMulti,
        decryptMulti,
        addRecipient,
        migrateV1toV2,
        VERSION_MULTI
    };

})();
