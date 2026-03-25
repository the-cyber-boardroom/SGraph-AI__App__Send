/* =================================================================================
   SGraph Send — API Client Library
   v0.1.2 — Transfer API + Vault Pointer API abstraction for send.sgraph.ai

   Provides upload, download, encrypt+upload, download+decrypt convenience methods.
   Uses the 3-step transfer flow: create → upload → complete.
   Vault pointer methods use PUT write / GET read / DELETE endpoints.
   Auth via x-sgraph-access-token header.

   Depends on: SGSendCrypto (sg-send-crypto.js)
   ================================================================================= */

class SGSend {

    constructor({ endpoint, token } = {}) {
        this.endpoint = (endpoint || '').replace(/\/$/, '')
        this.token    = token || ''
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

        // Step 1: Create transfer
        const createRes = await this._fetch('POST', '/api/transfers/create', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_size_bytes:   sizeBytes,
                content_type_hint: contentType
            })
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
        const response = await fetch(url, { method: 'GET', mode: 'cors' })     // No auth required (zero-knowledge)
        if (response.status === 404) return null
        if (!response.ok) {
            const detail = await response.text().catch(() => response.statusText)
            throw new Error(`GET /api/vault/read/${vaultId}/${fileId} failed (${response.status}): ${detail}`)
        }
        return response.arrayBuffer()
    }

    async vaultDelete(vaultId, fileId, writeKey) {
        const response = await this._fetch('DELETE', `/api/vault/delete/${vaultId}/${fileId}`, {
            headers: { 'x-sgraph-vault-write-key': writeKey }
        })
        return response.json()
    }

    // --- Vault Batch Read API ---------------------------------------------------

    async vaultBatchRead(vaultId, fileIds) {
        const operations = fileIds.map(file_id => ({ op: 'read', file_id }))
        const response = await this._fetch('POST', `/api/vault/batch/${vaultId}`, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations })
        })
        const result = await response.json()
        return result.results || []
    }
}
