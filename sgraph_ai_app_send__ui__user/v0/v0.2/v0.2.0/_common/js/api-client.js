/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — API Client
   v0.2.0 — Consolidated from v0.1.0 with /api/ prefix for CloudFront routing

   All transfer operations (create, upload, complete, download) go through
   this module. The base URL is /api — CloudFront routes /api/* to Lambda.

   Token management uses localStorage for access tokens.
   ═══════════════════════════════════════════════════════════════════════════════ */

const ApiClient = {

    baseUrl: '/api',

    // ─── Token Management ────────────────────────────────────────────────

    getAccessToken() {
        return localStorage.getItem('sgraph-send-token');
    },

    setAccessToken(token) {
        localStorage.setItem('sgraph-send-token', token);
    },

    clearAccessToken() {
        localStorage.removeItem('sgraph-send-token');
    },

    hasAccessToken() {
        return !!localStorage.getItem('sgraph-send-token');
    },

    _authHeaders() {
        const token = this.getAccessToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    // ─── Transfer Lifecycle ──────────────────────────────────────────────

    async createTransfer(fileSize, contentType) {
        const res = await fetch(`${this.baseUrl}/transfers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._authHeaders()
            },
            body: JSON.stringify({
                file_size_bytes:    fileSize,
                content_type_hint:  contentType || 'application/octet-stream'
            })
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
            throw new Error(`Create transfer failed: ${res.status}`);
        }
        return res.json();
    },

    async uploadPayload(transferId, encrypted) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}/payload`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                ...this._authHeaders()
            },
            body: encrypted
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
            throw new Error(`Upload failed: ${res.status}`);
        }
        return res.json();
    },

    async completeTransfer(transferId) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}/complete`, {
            method: 'POST',
            headers: this._authHeaders()
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
            throw new Error(`Complete failed: ${res.status}`);
        }
        return res.json();
    },

    // ─── Token Validation ────────────────────────────────────────────────

    async checkToken(token) {
        const res = await fetch(`${this.baseUrl}/tokens/${encodeURIComponent(token)}/check`);
        if (!res.ok) throw new Error(`Token check failed: ${res.status}`);
        return res.json();
    },

    async validateToken(tokenName) {
        const res = await fetch(`${this.baseUrl}/tokens/${encodeURIComponent(tokenName)}/validate`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error(`Token validate failed: ${res.status}`);
        return res.json();
    },

    // ─── Transfer Info & Download ────────────────────────────────────────

    async getTransferInfo(transferId) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}`, {
            headers: this._authHeaders()
        });
        if (!res.ok) throw new Error(`Transfer info failed: ${res.status}`);
        return res.json();
    },

    async downloadPayload(transferId) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}/payload`, {
            headers: this._authHeaders()
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
            throw new Error(`Download failed: ${res.status}`);
        }
        return res.arrayBuffer();
    },

    // ─── Presigned URLs (S3) ─────────────────────────────────────────────

    async getPresignedDownloadUrl(transferId) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}/download-url`, {
            headers: this._authHeaders()
        });
        if (!res.ok) throw new Error(`Presigned download URL failed: ${res.status}`);
        return res.json();
    },

    async getCapabilities() {
        const res = await fetch(`${this.baseUrl}/capabilities`, {
            headers: this._authHeaders()
        });
        if (!res.ok) throw new Error(`Capabilities failed: ${res.status}`);
        return res.json();
    },

    // ─── Multipart Upload ────────────────────────────────────────────────

    async initiateMultipart(transferId, totalSize, numParts) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}/multipart/initiate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._authHeaders()
            },
            body: JSON.stringify({ total_size: totalSize, num_parts: numParts })
        });
        if (!res.ok) throw new Error(`Multipart initiate failed: ${res.status}`);
        return res.json();
    },

    async uploadPart(url, data) {
        const res = await fetch(url, {
            method: 'PUT',
            body: data
        });
        if (!res.ok) throw new Error(`Part upload failed: ${res.status}`);
        return res.headers.get('ETag');
    },

    async completeMultipart(transferId, uploadId, parts) {
        const res = await fetch(`${this.baseUrl}/transfers/${transferId}/multipart/complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._authHeaders()
            },
            body: JSON.stringify({ upload_id: uploadId, parts })
        });
        if (!res.ok) throw new Error(`Multipart complete failed: ${res.status}`);
        return res.json();
    },

    async abortMultipart(transferId, uploadId) {
        try {
            await fetch(`${this.baseUrl}/transfers/${transferId}/multipart/abort`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this._authHeaders()
                },
                body: JSON.stringify({ upload_id: uploadId })
            });
        } catch (e) { /* best effort */ }
    }
};
