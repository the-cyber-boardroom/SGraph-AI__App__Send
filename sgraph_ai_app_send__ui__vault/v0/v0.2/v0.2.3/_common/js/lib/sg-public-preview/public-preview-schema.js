/* =================================================================================
   SGraph Public Vault Previews — Convention JSON schema + validation
   v0.1.0

   The public preview is a single known JSON file: { schema, title, description,
   thumbnail, disclaimer, support, expiry, created_at_ms, owner_hint }.

   validatePreview() is defence-in-depth: it rejects an unknown schema, an
   oversized inline thumbnail, and ANY field literally named write_key / read_key
   / passphrase anywhere in the object (so an owner can never accidentally publish
   a secret). Required: schema, title.
   ================================================================================= */

const PublicPreviewSchema = {

    SCHEMA_ID:        'sgraph-public-preview/v1',
    VERSION:          1,
    BANNED_KEYS:      ['write_key', 'read_key', 'passphrase', 'delete_auth', 'vault_key'],
    INLINE_THUMB_MAX: 64 * 1024,              // ~64 KB encoded data-URL ceiling
    ID_RE:            /^[a-z0-9]([a-z0-9-]{2,61})[a-z0-9]$/,   // 4–63 chars, no leading/trailing/double hyphen handled below
    SIMPLE_TOKEN_RE:  /^[a-z]+-[a-z]+-\d{4}$/,                  // reserved — Simple Token shape

    DISCLAIMER_VARIANTS: ['danger', 'warning', 'info', 'neutral'],

    emptyPreview() {
        return { schema: this.SCHEMA_ID, title: '', description: '', thumbnail: null,
                 disclaimer: '', disclaimer_label: 'Confidential', disclaimer_variant: 'danger',
                 show_footer: true, footer_text: '',
                 support: null, expiry: null, created_at_ms: Date.now() }
    },

    // --- public-id format ------------------------------------------------------
    validatePublicId(id) {
        const s = String(id || '').toLowerCase().trim()
        if (s.length < 4 || s.length > 63)        return { ok: false, reason: 'Use 4–63 characters.' }
        if (!/^[a-z0-9-]+$/.test(s))               return { ok: false, reason: 'Use lowercase letters, numbers, and hyphens only.' }
        if (s.startsWith('-') || s.endsWith('-'))  return { ok: false, reason: 'Cannot start or end with a hyphen.' }
        if (s.includes('--'))                      return { ok: false, reason: 'No double hyphens.' }
        if (this.SIMPLE_TOKEN_RE.test(s))          return { ok: false, reason: 'That looks like a share token (word-word-1234). Choose a different shape.' }
        return { ok: true, id: s }
    },

    randomPublicId() {
        const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'   // 32 symbols, no ambiguous chars
        const rnd = crypto.getRandomValues(new Uint8Array(16))
        let out = ''
        for (let i = 0; i < 16; i++) out += alphabet[rnd[i] & 31]
        return out   // 16 chars, ~80 bits
    },

    // --- recursive banned-key scan (defence-in-depth) --------------------------
    _containsBannedKey(value) {
        if (value === null || typeof value !== 'object') return null
        for (const key of Object.keys(value)) {
            if (this.BANNED_KEYS.includes(key.toLowerCase())) return key
            const nested = this._containsBannedKey(value[key])
            if (nested) return nested
        }
        return null
    },

    // --- preview object validation ---------------------------------------------
    validatePreview(obj) {
        if (!obj || typeof obj !== 'object')  return { ok: false, reason: 'not-an-object' }
        if (obj.schema !== this.SCHEMA_ID)     return { ok: false, reason: 'unknown-schema' }
        if (!obj.title || typeof obj.title !== 'string') return { ok: false, reason: 'missing-title' }

        const banned = this._containsBannedKey(obj)
        if (banned) return { ok: false, reason: `banned-field:${banned}` }

        if (obj.thumbnail && obj.thumbnail.mode === 'inline') {
            const data = obj.thumbnail.data || ''
            if (data.length > this.INLINE_THUMB_MAX) return { ok: false, reason: 'thumbnail-too-large' }
        }
        if (obj.support && obj.support.href) {
            if (!/^(mailto:|https:)/i.test(obj.support.href)) return { ok: false, reason: 'bad-support-href' }
        }
        return { ok: true, preview: obj }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PublicPreviewSchema }
