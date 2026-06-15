/* =================================================================================
   SGraph Vault Inbox — Transport Client  (Phase C1 — v0.33.5)

   A thin, secret-aware HTTP client for the six append-only endpoints under
   `/api/vault/append/*` (see Routes__Vault__Append.py). One method per endpoint.

   NOTE (v0.32.7 rename): the server renamed inbox → append. URL paths and the
   purge folder value are updated here. The CLASS name (SGInbox), file/dir name,
   the `inbox` body field (intentionally retained server-side — it identifies the
   token folder), and the host-event names are unchanged in this pass and are
   tracked as a separate, app-contract-affecting rename increment.

   This module is the L1.5 (Vault Native) transport. It holds the gate credentials
   the server expects and attaches the right header per verb:

     | verb           | endpoint                     | gate header(s)                              |
     |----------------|------------------------------|---------------------------------------------|
     | configure      | POST /configure/{vault_id}   | x-sgraph-vault-write-key + x-sgraph-access-token; body carries enum_key_hash |
     | append         | POST /write/{vault_id}       | (none — append_token is in the body)        |
     | list           | POST /list/{vault_id}        | x-sgraph-vault-enum-key                      |
     | fetch          | POST /fetch/{vault_id}       | x-sgraph-vault-enum-key                      |
     | markProcessed  | POST /mark-processed/{vid}   | x-sgraph-vault-enum-key                      |
     | purge          | POST /purge/{vault_id}       | x-sgraph-vault-write-key + x-sgraph-access-token |

   enum_key derivation (Q1, recommended form — locked here):
     enum_key      = SHA256("sg-inbox-enum:" || read_key_bytes).hex()   (sent in the header)
     enum_key_hash = SHA256(enum_key_utf8).hex()                        (stored by configure;
                       the server re-hashes the presented enum_key and compares — see
                       Service__Vault__Inbox._check_enum_key)

   Design notes:
     - No DOM, no framework, no vault internals. Constructed with primitive inputs
       (endpoint, vaultId, enumKey, writeKeyHex, accessToken) + an optional fetchImpl,
       so it is fully Node-testable with a fake fetch (no mocks of our own code).
     - Errors carry a `.code` (EINVAL / EPERM / E2BIG / ENOSPC / EUNREACH / EHTTP) and,
       for HTTP failures, an `.http` status — the checker maps these onto inbox.error.
     - Batch verbs (fetch / markProcessed / purge-by-id) enforce the server's ≤100
       file_ids cap client-side (DoS guard mirror — INBOX_BATCH_MAX_FILE_IDS).

   Depends on: Web Crypto (crypto.subtle.digest) — global in browsers and Node 18+.
   ================================================================================= */

class SGInbox {

    constructor({ endpoint     = ''   ,
                  vaultId      = null ,
                  enumKey      = null ,                                          // hex string — raw value sent in x-sgraph-vault-enum-key
                  writeKeyHex  = null ,                                          // owner write key (configure / purge)
                  accessToken  = null ,                                          // x-sgraph-access-token (configure / purge)
                  fetchImpl    = null } = {}) {
        this.endpoint    = String(endpoint || '').replace(/\/$/, '')
        this.vaultId     = vaultId
        this.enumKey     = enumKey
        this.writeKeyHex = writeKeyHex
        this.accessToken = accessToken
        this._fetch      = fetchImpl || ((...a) => fetch(...a))
    }

    // --- Key derivation (static, pure, Node-testable) ---------------------------

    static async deriveEnumKey(readKeyBytes) {                                   // readKeyBytes: Uint8Array (raw read_key)
        if (!readKeyBytes || !readKeyBytes.length) {
            throw SGInbox._err('EINVAL', 'read_key bytes required for enum_key derivation')
        }
        const prefix = new TextEncoder().encode('sg-inbox-enum:')
        const input  = new Uint8Array(prefix.length + readKeyBytes.length)
        input.set(prefix, 0)
        input.set(readKeyBytes, prefix.length)
        const buf = await crypto.subtle.digest('SHA-256', input)
        return SGInbox._hex(new Uint8Array(buf))
    }

    static async deriveEnumKeyHash(enumKey) {                                    // what configure stores; server re-hashes header value to match
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(enumKey || '')))
        return SGInbox._hex(new Uint8Array(buf))
    }

    // --- Transport verbs (1:1 with server endpoints) ----------------------------

    async configure({ append_anchors } = {}) {                                  // owner: set anchors and/or (re)publish enum_key_hash
        const body = {}
        if (append_anchors !== undefined) body.append_anchors = append_anchors
        if (this.enumKey) body.enum_key_hash = await SGInbox.deriveEnumKeyHash(this.enumKey)
        return this._post(`/configure/${this.vaultId}`, body, this._ownerHeaders())
    }

    async append({ vault_id, append_token, payload } = {}) {                    // outbound: deliver to a REMOTE vault's inbox
        if (!vault_id)     throw SGInbox._err('EINVAL', 'vault_id (target) required')
        if (!append_token) throw SGInbox._err('EINVAL', 'append_token required')
        const payload_b64 = (typeof payload === 'string') ? payload : SGInbox._b64(payload)
        if (!payload_b64)  throw SGInbox._err('EINVAL', 'payload required')
        return this._post(`/write/${vault_id}`, { append_token, payload: payload_b64 }, {})    // v0.32.7: /append/ → /write/
    }

    async list({ inbox, after_file_id, limit, include_content } = {}) {         // metadata-only by default (cheap; the checker's hot path)
        const body = {}
        if (inbox         != null) body.inbox           = inbox
        if (after_file_id != null) body.after_file_id   = after_file_id
        if (limit         != null) body.limit           = limit
        if (include_content)       body.include_content = true
        return this._post(`/list/${this.vaultId}`, body, this._enumHeaders())
    }

    async fetch({ inbox, file_ids } = {}) {                                     // pull ciphertext for a batch of file_ids
        if (!inbox) throw SGInbox._err('EINVAL', 'inbox required')
        SGInbox._assertBatch(file_ids)
        return this._post(`/fetch/${this.vaultId}`, { inbox, file_ids }, this._enumHeaders())
    }

    async markProcessed({ inbox, file_ids } = {}) {                            // move inbox/ → processed/
        if (!inbox) throw SGInbox._err('EINVAL', 'inbox required')
        SGInbox._assertBatch(file_ids)
        return this._post(`/mark-processed/${this.vaultId}`, { inbox, file_ids }, this._enumHeaders())
    }

    async purge({ folder = 'processed', inbox, file_ids } = {}) {              // owner: delete; empty file_ids + processed = bulk purge
        if (!inbox) throw SGInbox._err('EINVAL', 'inbox required')
        if (folder !== 'pending' && folder !== 'processed') {                  // v0.32.7: 'inbox' folder value → 'pending'
            throw SGInbox._err('EINVAL', "folder must be 'pending' or 'processed'")
        }
        if (file_ids) SGInbox._assertBatch(file_ids)
        const body = { folder, inbox }
        if (file_ids) body.file_ids = file_ids
        return this._post(`/purge/${this.vaultId}`, body, this._ownerHeaders())
    }

    // --- Header builders --------------------------------------------------------

    _enumHeaders() {
        if (!this.enumKey) throw SGInbox._err('ENOAUTH', 'enum_key required for this verb')
        return { 'x-sgraph-vault-enum-key': this.enumKey }
    }

    _ownerHeaders() {
        if (!this.writeKeyHex) throw SGInbox._err('ENOAUTH', 'write_key required for this verb (owner session)')
        const h = { 'x-sgraph-vault-write-key': this.writeKeyHex }
        if (this.accessToken) h['x-sgraph-access-token'] = this.accessToken     // server validates the access token on configure/purge
        return h
    }

    // --- Internal POST ----------------------------------------------------------

    async _post(path, body, extraHeaders) {
        const url = `${this.endpoint}/api/vault/append${path}`                  // v0.32.7: /api/vault/inbox → /api/vault/append
        let res
        try {
            res = await this._fetch(url, {
                method : 'POST',
                mode   : 'cors',
                headers: { 'Content-Type': 'application/json', ...extraHeaders },
                body   : JSON.stringify(body)
            })
        } catch (e) {
            throw SGInbox._err('EUNREACH', 'network: ' + String((e && e.message) || e))
        }
        if (!res.ok) {
            const detail = await res.text().catch(() => '')
            throw SGInbox._err(SGInbox._codeForStatus(res.status), `${res.status}: ${detail}`, res.status)
        }
        return res.json()
    }

    // --- Static helpers ---------------------------------------------------------

    static _codeForStatus(s) {
        if (s === 400) return 'EINVAL'                                          // invalid input
        if (s === 403) return 'EPERM'                                           // gate failed (token/key mismatch)
        if (s === 413) return 'E2BIG'                                           // payload / content too large
        if (s === 507) return 'ENOSPC'                                          // append lane at capacity
        return 'EHTTP'
    }

    static _assertBatch(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw SGInbox._err('EINVAL', 'file_ids must be a non-empty array')
        }
        if (ids.length > 100) {                                                 // INBOX_BATCH_MAX_FILE_IDS — server rejects; fail fast client-side
            throw SGInbox._err('E2BIG', `file_ids exceeds batch cap of 100 (got ${ids.length})`)
        }
    }

    static _err(code, message, http) {
        const e = new Error(message)
        e.code = code
        if (http != null) e.http = http
        return e
    }

    static _hex(bytes) {
        let s = ''
        for (const b of bytes) s += b.toString(16).padStart(2, '0')
        return s
    }

    static _b64(bytes) {                                                        // Uint8Array → base64 (btoa is global in browsers and Node 16+)
        if (!bytes || !bytes.length) return ''
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
        let bin = ''
        const CHUNK = 0x8000                                                    // avoid arg-count blowups on large payloads
        for (let i = 0; i < u8.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK))
        }
        return btoa(bin)
    }
}

if (typeof globalThis !== 'undefined') globalThis.SGInbox = SGInbox
