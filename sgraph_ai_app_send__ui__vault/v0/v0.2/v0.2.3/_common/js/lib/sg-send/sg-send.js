/* =================================================================================
   SGraph Send — API Client Library
   v0.1.3 — Transfer API + Vault Pointer API abstraction for send.sgraph.ai

   Provides upload, download, encrypt+upload, download+decrypt convenience methods.
   Uses the 3-step transfer flow: create → upload → complete.
   Vault pointer methods use PUT write / GET read / DELETE endpoints.
   Auth via x-sgraph-access-token header.

   Depends on: SGSendCrypto (sg-send-crypto.js)
   ================================================================================= */

class SGSend {

    constructor({ endpoint, token, staticMode } = {}) {
        this.endpoint = (endpoint || '').replace(/\/$/, '')
        this.token    = token || ''
        // Static mode: the backend is a plain static file host (GitHub Pages / S3), not the
        // FastAPI. Reads are GETs to the same paths; there is no /batch POST and no write
        // endpoint. So batchLoad fans out to individual GET reads, and writes reject cleanly
        // with EREADONLY instead of an opaque 405/404. Opt in per-instance via
        // {staticMode:true}, or globally via window.SG_STATIC=true (so a statically-hosted
        // page enables it once without threading a flag through every construction site).
        // Default OFF → behaviour is byte-identical to before.
        this.staticMode = (staticMode != null)
            ? !!staticMode
            : (typeof window !== 'undefined' && window.SG_STATIC === true)
    }

    _readOnly(what) {
        return Object.assign(
            new Error('Static host is read-only: ' + what + ' needs the API backend.'),
            { code: 'EREADONLY', staticMode: true }
        )
    }

    // --- Auth Headers ---------------------------------------------------------

    _authHeaders() {
        const headers = {}
        if (this.token) {
            headers['x-sgraph-access-token'] = this.token
        }
        return headers
    }

    // --- Internal Fetch -------------------------------------------------------

    async _fetch(method, path, options = {}) {
        const url      = `${this.endpoint}${path}`
        const response = await fetch(url, {
            method,
            mode: 'cors',
            headers: { ...this._authHeaders(), ...(options.headers || {}) },
            body: options.body
        })
        if (!response.ok) {
            const detail = await response.text().catch(() => response.statusText)
            throw new Error(`${method} ${path} failed (${response.status}): ${detail}`)
        }
        return response
    }

    // --- Transfer Lifecycle ---------------------------------------------------

    async upload(data, options = {}) {
        const contentType = options.contentType || 'application/octet-stream'
        const sizeBytes   = data.byteLength || data.length || 0

        // Step 1: Create transfer. Optional fields (deterministic id, delete auth,
        // expiry) are passed through when supplied — used by public vault previews.
        const createBody = {
            file_size_bytes:   sizeBytes,
            content_type_hint: contentType
        }
        if (options.transferId)              createBody.transfer_id      = options.transferId
        if (options.deleteAuthHash)          createBody.delete_auth_hash = options.deleteAuthHash
        if (options.expiresAt != null)       createBody.expires_at       = options.expiresAt
        if (options.maxDownloads != null)    createBody.max_downloads    = options.maxDownloads
        if (options.autoDelete != null)      createBody.auto_delete      = options.autoDelete
        if (options.allowRecreate != null)   createBody.allow_recreate   = options.allowRecreate

        const createRes = await this._fetch('POST', '/api/transfers/create', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createBody)
        })
        const { transfer_id: transferId } = await createRes.json()

        // Step 2: Upload payload
        await this._fetch('POST', `/api/transfers/upload/${transferId}`, {
            headers: { 'Content-Type': 'application/octet-stream' },
            body: data
        })

        // Step 3: Complete
        const completeRes = await this._fetch('POST', `/api/transfers/complete/${transferId}`)
        const completeData = await completeRes.json()

        return { transferId, ...completeData }
    }

    async download(transferId) {
        const response = await this._fetch('GET', `/api/transfers/download/${transferId}`)
        return response.arrayBuffer()
    }

    async info(transferId) {
        const response = await this._fetch('GET', `/api/transfers/info/${transferId}`)
        return response.json()
    }

    // Sender-controlled hard delete. delete_auth is the secret whose SHA-256 was
    // supplied as delete_auth_hash at create time (see public vault previews).
    async deleteTransfer(transferId, deleteAuth) {
        const response = await this._fetch('DELETE', `/api/transfers/delete/${transferId}`, {
            headers: { 'x-sgraph-transfer-delete-auth': deleteAuth }
        })
        return response.json()
    }

    // --- Encryption Delegates -------------------------------------------------

    async generateKey()              { return SGSendCrypto.generateKey()              }
    async encrypt(data, key)         { return SGSendCrypto.encrypt(data, key)         }
    async decrypt(data, key)         { return SGSendCrypto.decrypt(data, key)         }
    async exportKey(key)             { return SGSendCrypto.exportKey(key)             }
    async importKey(str)             { return SGSendCrypto.importKey(str)             }
    async deriveKey(passphrase, salt) { return SGSendCrypto.deriveKey(passphrase, salt) }

    // --- Convenience: Encrypt + Upload ----------------------------------------

    async encryptAndUpload(plainData, key) {
        if (!key) key = await this.generateKey()
        const encrypted  = await this.encrypt(plainData, key)
        const result     = await this.upload(encrypted)
        return { ...result, key }
    }

    async downloadAndDecrypt(transferId, key) {
        const encrypted = await this.download(transferId)
        return this.decrypt(encrypted, key)
    }

    // --- Vault Pointer API ------------------------------------------------------

    async vaultWrite(vaultId, fileId, writeKey, data) {
        if (this.staticMode) throw this._readOnly('writing')
        const response = await this._fetch('PUT', `/api/vault/write/${vaultId}/${fileId}`, {
            headers: {
                'Content-Type':              'application/octet-stream',
                'x-sgraph-vault-write-key':  writeKey
            },
            body: data
        })
        return response.json()
    }

    async vaultRead(vaultId, fileId) {
        const url      = `${this.endpoint}/api/vault/read/${vaultId}/${fileId}`
        // Immutable objects (obj-cas-imm-*, key-rnd-imm-*) never change → allow the browser HTTP
        // cache (use the default mode). This persists across reloads EVEN in null-origin sandboxed
        // iframes, where the Cache API / localStorage / IndexedDB are all unavailable — the HTTP
        // cache is browser-managed and not gated by origin-storage permissions. Needs the server to
        // send a cacheable response for these paths (recommended: `Cache-Control: public, max-age=
        // 31536000, immutable`); without it the browser may still heuristically cache.
        // Everything else (mutable refs ref-pid-*, indexes idx-pid-*) MUST stay no-store, or a
        // Cmd-R reload would render a previous commit's tree from a stale ref ciphertext.
        const isImmutable = typeof fileId === 'string' && fileId.includes('-imm-')
        const fetchOpts   = isImmutable ? { method: 'GET', mode: 'cors' }
                                        : { method: 'GET', mode: 'cors', cache: 'no-store' }
        const response = await fetch(url, fetchOpts)     // No auth required (zero-knowledge)
        if (response.status === 404) return null
        if (!response.ok) {
            const detail = await response.text().catch(() => response.statusText)
            throw new Error(`GET /api/vault/read/${vaultId}/${fileId} failed (${response.status}): ${detail}`)
        }
        return response.arrayBuffer()
    }

    // --- Large file read: uses S3 presigned URL to bypass Lambda response limit ---
    //     Calls GET /api/vault/presigned/read-url/{vaultId}/{filePath}.
    //     On success (S3 mode): fetches encrypted blob directly from S3.
    //     On 400 (memory mode / presigned not available): falls back to vaultRead().

    async vaultReadLarge(vaultId, filePath) {
        // Static host: no presigned endpoint — go straight to the GET read (avoids a 404).
        if (this.staticMode) return this.vaultRead(vaultId, filePath)
        try {
            const presignResp = await fetch(
                `${this.endpoint}/api/vault/presigned/read-url/${vaultId}/${filePath}`,
                { method: 'GET', mode: 'cors' }
            )
            if (presignResp.ok) {
                const { url } = await presignResp.json()
                if (url) {
                    const s3Resp = await fetch(url)
                    if (s3Resp.ok) return s3Resp.arrayBuffer()
                }
            }
        } catch (_) { /* fall through to direct read */ }
        // Fallback: direct read (works in memory/local-dev mode regardless of size)
        return this.vaultRead(vaultId, filePath)
    }

    async vaultDelete(vaultId, fileId, writeKey) {
        if (this.staticMode) throw this._readOnly('deleting')
        const response = await this._fetch('DELETE', `/api/vault/delete/${vaultId}/${fileId}`, {
            headers: { 'x-sgraph-vault-write-key': writeKey }
        })
        return response.json()
    }

    // --- Vault Batch API ----------------------------------------------------------
    // POST /api/vault/batch/{vaultId}
    // ops: [{op:'read',file_id}, {op:'write',file_id,data}, {op:'write-if-match',file_id,data,match}, ...]
    // Returns flat array of result objects from all chunks.
    // Read-only batches need no write key. Write batches need writeKey + access token.
    // Auto-chunks at 50 ops (server hard limit is 100).

    async vaultBatch(vaultId, writeKey, ops) {
        // Static host: there is no /batch POST endpoint. Read-only batches (op:'read') fan out
        // to individual GET reads and return the SAME result shape ([{status,file_id,data}])
        // so callers (e.g. SGVaultObjectStore.batchLoad) need zero changes. Any write op
        // rejects cleanly. Reads run in parallel — same net effect, just N GETs not one POST.
        if (this.staticMode) {
            ops = ops || []
            for (var oi = 0; oi < ops.length; oi++) {
                if (ops[oi] && ops[oi].op !== 'read') throw this._readOnly('batch writes')
            }
            return Promise.all(ops.map((o) => {
                return this.vaultRead(vaultId, o.file_id).then((buf) => {
                    return (buf == null)
                        ? { status: 'not_found', file_id: o.file_id }
                        : { status: 'ok', file_id: o.file_id, data: SGSend._abToB64(buf) }
                }).catch(() => ({ status: 'error', file_id: o.file_id }))
            }))
        }

        const CHUNK      = 50
        const allResults = []
        for (let i = 0; i < ops.length; i += CHUNK) {
            const chunk   = ops.slice(i, i + CHUNK)
            const headers = { 'Content-Type': 'application/json' }
            if (writeKey) headers['x-sgraph-vault-write-key'] = writeKey
            const resp = await this._fetch('POST', `/api/vault/batch/${vaultId}`, {
                headers,
                body: JSON.stringify({ operations: chunk })
            })
            const data = await resp.json()
            allResults.push(...(data.results || []))
        }
        return allResults
    }

    // ArrayBuffer/Uint8Array → base64 (chunked to avoid call-stack overflow on large blobs).
    // Used by the static-mode batch fan-out to match the API batch result shape ({data:<b64>}).
    static _abToB64(buf) {
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
        let binary = ''
        const CH = 8192
        for (let i = 0; i < bytes.length; i += CH) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
        }
        return btoa(binary)
    }
}
