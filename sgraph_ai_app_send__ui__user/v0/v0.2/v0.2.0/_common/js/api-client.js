/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — API Client
   v0.2.0 — CloudFront-ready with /api/* prefix

   All API routes use /api/* prefix for CloudFront separation:
     CloudFront behaviour: /api/* → Lambda origin, /* → S3 static files

   Routes:
     /api/transfers/create                    POST  — create transfer
     /api/transfers/upload/{id}               POST  — upload encrypted payload
     /api/transfers/complete/{id}             POST  — complete transfer
     /api/transfers/info/{id}                 GET   — transfer info
     /api/transfers/download/{id}             GET   — download encrypted payload
     /api/transfers/check-token/{name}        GET   — check token (no usage consumed)
     /api/transfers/validate-token/{name}     POST  — validate token (consumes a use)
     /api/presigned/capabilities              GET   — check upload capabilities
     /api/presigned/initiate                  POST  — start multipart upload
     /api/presigned/complete                  POST  — complete multipart upload
     /api/presigned/cancel/{id}/{upload_id}   POST  — cancel multipart upload
     /api/presigned/download-url/{id}         GET   — presigned download URL

   Auth: Access token sent via x-sgraph-access-token header.
   Token management uses localStorage.
   ═══════════════════════════════════════════════════════════════════════════════ */

const ApiClient = {

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
        if (!token) return {};
        // Defence in depth — reject any token that would cause a fetch header violation
        if (!/^[a-z0-9_-]+$/i.test(token)) {
            this.clearAccessToken();
            document.dispatchEvent(new CustomEvent('access-token-invalid'));
            return {};
        }
        return { 'x-sgraph-access-token': token };
    },

    // ─── Transfer Lifecycle ──────────────────────────────────────────────

    async createTransfer(fileSize, contentType) {
        const res = await fetch('/api/transfers/create', {
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
        const res = await fetch(`/api/transfers/upload/${transferId}`, {
            method: 'POST',
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
        const res = await fetch(`/api/transfers/complete/${transferId}`, {
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
        const res = await fetch(`/api/transfers/check-token/${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error(`Token check failed: ${res.status}`);
        return res.json();
    },

    async validateToken(tokenName) {
        const res = await fetch(`/api/transfers/validate-token/${encodeURIComponent(tokenName)}`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error(`Token validate failed: ${res.status}`);
        return res.json();
    },

    // ─── Transfer Info & Download ────────────────────────────────────────

    async getTransferInfo(transferId) {
        const res = await fetch(`/api/transfers/info/${transferId}`, {
            headers: this._authHeaders()
        });
        if (!res.ok) throw new Error(`Transfer info failed: ${res.status}`);
        return res.json();
    },

    async downloadPayload(transferId) {
        const res = await fetch(`/api/transfers/download/${transferId}`, {
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
        const res = await fetch(`/api/presigned/download-url/${transferId}`, {
            headers: this._authHeaders()
        });
        if (!res.ok) throw new Error(`Presigned download URL failed: ${res.status}`);
        return res.json();
    },

    async getCapabilities() {
        const res = await fetch('/api/presigned/capabilities', {
            headers: this._authHeaders()
        });
        if (!res.ok) throw new Error(`Capabilities failed: ${res.status}`);
        return res.json();
    },

    // ─── Multipart Upload ────────────────────────────────────────────────

    async initiateMultipart(transferId, totalSize, numParts) {
        const res = await fetch('/api/presigned/initiate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._authHeaders()
            },
            body: JSON.stringify({
                transfer_id: transferId,
                file_size_bytes: totalSize,
                num_parts: numParts
            })
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
        const res = await fetch('/api/presigned/complete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this._authHeaders()
            },
            body: JSON.stringify({
                transfer_id: transferId,
                upload_id: uploadId,
                parts
            })
        });
        if (!res.ok) throw new Error(`Multipart complete failed: ${res.status}`);
        return res.json();
    },

    async cancelMultipart(transferId, uploadId) {
        try {
            await fetch(`/api/presigned/cancel/${transferId}/${uploadId}`, {
                method: 'POST',
                headers: this._authHeaders()
            });
        } catch (e) { /* best effort */ }
    }
};
