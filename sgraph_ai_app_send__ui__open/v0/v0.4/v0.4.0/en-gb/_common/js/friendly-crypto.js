/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Friendly Token Crypto
   Shared module for deriving transfer IDs and AES keys from friendly tokens.

   A friendly token (e.g., "apple-mango-5623") deterministically derives:
     1. Transfer ID  — SHA-256(token) → first 12 hex chars
     2. AES-256 key  — PBKDF2(token, salt='sgraph-send-v1', iterations=600000)

   This means the friendly token is ALL the recipient needs. No server-side
   token→transferId mapping required — both sides derive the same values.

   Usage:
     FriendlyCrypto.isFriendlyToken('apple-mango-5623')  → true
     FriendlyCrypto.deriveTransferId('apple-mango-5623')  → '3a7f2b...' (12 hex)
     FriendlyCrypto.deriveKey('apple-mango-5623')         → CryptoKey
   ═══════════════════════════════════════════════════════════════════════════════ */

const FriendlyCrypto = {

    SALT: 'sgraph-send-v1',
    ITERATIONS: 600000,

    // ─── Detection ────────────────────────────────────────────────────────

    /** Check if a string looks like a friendly token (word-word-NNNN) */
    isFriendlyToken(str) {
        if (!str) return false;
        return /^[a-z]+-[a-z]+-\d{4}$/.test(str);
    },

    // ─── Transfer ID Derivation ───────────────────────────────────────────

    /** Derive a deterministic 12-char hex transfer ID from a friendly token.
     *  Uses SHA-256(token) → first 12 hex chars.
     *  Must match on both upload and download sides. */
    async deriveTransferId(friendlyToken) {
        const enc = new TextEncoder();
        const hash = await crypto.subtle.digest('SHA-256', enc.encode(friendlyToken));
        const bytes = new Uint8Array(hash);
        let hex = '';
        for (let i = 0; i < 6; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    },

    // ─── AES Key Derivation ───────────────────────────────────────────────

    /** Derive an AES-256-GCM key from a friendly token via PBKDF2.
     *  Salt: 'sgraph-send-v1', iterations: 600000, hash: SHA-256.
     *  Must match the key derivation used during upload (v0.2.6). */
    async deriveKey(friendlyToken) {
        const enc = new TextEncoder();
        const material = await crypto.subtle.importKey(
            'raw', enc.encode(friendlyToken), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode(this.SALT), iterations: this.ITERATIONS, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    },

    /** Export a CryptoKey as a base64url string (for compatibility with SendCrypto) */
    async exportKey(key) {
        return SendCrypto.exportKey(key);
    }
};
