/* =================================================================================
   SGraph Public Vault Previews — Deterministic Derivation
   v0.1.0 — public-vault-about-key → transfer-id + read-only key

   From a single public string (the "public-vault-about-key") this derives:
     1. Transfer ID    — SHA-256('pvp-transfer-v1:' + id) → first 12 hex chars
                         (domain-separated from FriendlyCrypto's bare SHA-256(token))
     2. Read-only key  — PBKDF2(id, salt='sgraph-public-preview-v1', 600000, SHA-256)
                         → AES-256-GCM, imported DECRYPT-ONLY + non-extractable

   The salt 'sgraph-public-preview-v1' is a namespace provably distinct from
   Simple Tokens ('sgraph-send-v1') and vault keys ('sg-vault-v1:<id>'), so the
   public string can never reach the real vault's contents or keys.

   It produces NO write key and NO delete_auth. The writer re-imports the same
   raw bytes with ['encrypt']; delete_auth is a separate RANDOM owner-held secret.

   Wire format (matches SGSendCrypto): [12-byte IV][AES-256-GCM ciphertext].
   ================================================================================= */

const PublicPreviewCrypto = {

    PBKDF2_SALT:     'sgraph-public-preview-v1',   // distinct from 'sgraph-send-v1' / 'sg-vault-v1:*'
    TRANSFER_PREFIX: 'pvp-transfer-v1:',           // domain-separates the id namespace
    ITERATIONS:      600000,
    IV_LENGTH:       12,

    normalize(publicId) {
        return String(publicId || '').toLowerCase().trim()
    },

    // --- Transfer ID: SHA-256('pvp-transfer-v1:'+id) → first 12 hex chars -------
    async deriveTransferId(publicId) {
        const enc  = new TextEncoder()
        const hash = await crypto.subtle.digest('SHA-256', enc.encode(this.TRANSFER_PREFIX + this.normalize(publicId)))
        const bytes = new Uint8Array(hash)
        let hex = ''
        for (let i = 0; i < 6; i++) hex += bytes[i].toString(16).padStart(2, '0')
        return hex   // 12 lowercase hex chars — matches Transfer__Service ^[a-f0-9]{12}$
    },

    // --- Raw read-key bytes: PBKDF2(id, PBKDF2_SALT) → 256 bits ------------------
    async _deriveReadKeyBytes(publicId) {
        const enc      = new TextEncoder()
        const material = await crypto.subtle.importKey('raw', enc.encode(this.normalize(publicId)), 'PBKDF2', false, ['deriveBits'])
        const bits     = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: enc.encode(this.PBKDF2_SALT), iterations: this.ITERATIONS, hash: 'SHA-256' },
            material, 256)
        return new Uint8Array(bits)
    },

    // --- Read-only key (decrypt-only, non-extractable) — the PUBLIC read path ----
    async deriveReadKeyRO(publicId) {
        const bytes = await this._deriveReadKeyBytes(publicId)
        return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['decrypt']) // non-extractable, decrypt-only
    },

    // --- Write key (encrypt) — OWNER publish path only --------------------------
    async deriveWriteKey(publicId) {
        const bytes = await this._deriveReadKeyBytes(publicId)
        return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt'])
    },

    // --- Full bundle (read path) ------------------------------------------------
    async derivePublicPreviewKeys(publicId) {
        const [transferId, readKeyRO] = await Promise.all([
            this.deriveTransferId(publicId),
            this.deriveReadKeyRO(publicId)
        ])
        return { transferId, readKeyRO }
    },

    // --- base64url of the read key — for the transparency disclosure / open link -
    //     (the key is public-derivable anyway; this is display-only)
    async readKeyBase64url(publicId) {
        const bytes = await this._deriveReadKeyBytes(publicId)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    },

    // --- AES-256-GCM decrypt (IV-prepended) — used by the read path -------------
    async decrypt(arrayBuffer, key) {
        const bytes      = new Uint8Array(arrayBuffer)
        const iv         = bytes.slice(0, this.IV_LENGTH)
        const ciphertext = bytes.slice(this.IV_LENGTH)
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    },

    // --- AES-256-GCM encrypt (IV-prepended) — used by the owner write path ------
    async encrypt(arrayBufferOrBytes, key) {
        const data = arrayBufferOrBytes instanceof ArrayBuffer ? arrayBufferOrBytes : arrayBufferOrBytes
        const iv   = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH))
        const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
        const out  = new Uint8Array(iv.byteLength + ct.byteLength)
        out.set(iv, 0)
        out.set(new Uint8Array(ct), iv.byteLength)
        return out.buffer
    },

    // --- A random delete_auth (owner-held secret; NEVER derived from publicId) ---
    randomDeleteAuth() {
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    },

    async sha256Hex(str) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PublicPreviewCrypto } // node tests; ignored in browser
