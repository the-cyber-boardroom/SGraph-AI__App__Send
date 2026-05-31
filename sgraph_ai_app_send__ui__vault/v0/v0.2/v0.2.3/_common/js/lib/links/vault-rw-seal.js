/* =================================================================================
   SGraph Vault — rw-links key sealing (owner-secret tier)
   v0.1.0

   Seals/unseals a child vault's FULL key with the PARENT owner's write secret, so the
   sealed blob can live in the parent's `.vault/owner/rw-links.json` (see vault-links.js,
   which is key-blind and only ever stores/returns the opaque output of `seal` here).

   Security shape (05/31 rw-sub-vaults scoping, D1 ACCEPTED):
     - The rw-links file is a normal vault file → the parent's read_key already encrypts
       it at rest. Any holder of parent READ access can open the file.
     - This module ADDITIONALLY seals the child key with a symmetric key derived from the
       parent's WRITE secret (the hex write_key only an owner holds). So a parent READER
       can open the file yet still cannot recover a child full key — only a parent OWNER
       (write-secret holder) can unseal.
     - Sealing key = SHA-256(utf8("sg-vault-rw-seal:v1:" + parentWriteKeyHex)) → AES-256-GCM.
       The domain-separation prefix keeps this derivation distinct from any other use of
       write_key. write_key is never stored; only the sealed blob is.

   Output (`seal`) is a base64 string of: [12-byte IV][AES-256-GCM ciphertext] — the same
   IV-prepended convention used by public-preview-crypto. Pure logic; no DOM. Exposed as
   window.VaultRwSeal (browser) and module.exports (node). Needs WebCrypto (crypto.subtle).
   ================================================================================= */

const VaultRwSeal = {

    IV_LENGTH:  12,
    DOMAIN:     'sg-vault-rw-seal:v1:',

    // derive the AES-256-GCM sealing key from the parent owner's hex write secret
    async _sealingKey(parentWriteKeyHex) {
        if (!parentWriteKeyHex || typeof parentWriteKeyHex !== 'string') {
            throw new Error('VaultRwSeal: parent write secret required to seal/unseal');
        }
        if (!crypto || !crypto.subtle) throw new Error('VaultRwSeal: WebCrypto unavailable');
        const material = new TextEncoder().encode(this.DOMAIN + parentWriteKeyHex);
        const digest   = await crypto.subtle.digest('SHA-256', material);   // 32 bytes → AES-256
        return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    },

    // seal a child full key (string) → base64( IV || ciphertext )
    async seal(childFullKey, parentWriteKeyHex) {
        if (typeof childFullKey !== 'string' || !childFullKey) {
            throw new Error('VaultRwSeal.seal: childFullKey (non-empty string) required');
        }
        const key = await this._sealingKey(parentWriteKeyHex);
        const iv  = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(childFullKey));
        const out = new Uint8Array(iv.byteLength + ct.byteLength);
        out.set(iv, 0);
        out.set(new Uint8Array(ct), iv.byteLength);
        return this._b64encode(out);
    },

    // unseal a sealed blob (base64) back to the child full key (string).
    // Throws on a wrong parent write secret (GCM auth failure) — fail-closed.
    async unseal(sealedB64, parentWriteKeyHex) {
        if (typeof sealedB64 !== 'string' || !sealedB64) {
            throw new Error('VaultRwSeal.unseal: sealed blob (base64 string) required');
        }
        const key   = await this._sealingKey(parentWriteKeyHex);
        const bytes = this._b64decode(sealedB64);
        if (bytes.length <= this.IV_LENGTH) throw new Error('VaultRwSeal.unseal: blob too short');
        const iv = bytes.slice(0, this.IV_LENGTH);
        const ct = bytes.slice(this.IV_LENGTH);
        let pt;
        try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct); }
        catch (_) { throw new Error('VaultRwSeal.unseal: decrypt failed (wrong parent write secret or corrupt blob)'); }
        return new TextDecoder().decode(new Uint8Array(pt));
    },

    // --- base64 helpers (work in browser + node) --------------------------------
    _b64encode(u8) {
        if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
        let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return btoa(s);
    },
    _b64decode(b64) {
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
        const s = atob(b64); const u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
        return u8;
    }
};

if (typeof window !== 'undefined') window.VaultRwSeal = VaultRwSeal;
if (typeof module !== 'undefined' && module.exports) module.exports = { VaultRwSeal };
