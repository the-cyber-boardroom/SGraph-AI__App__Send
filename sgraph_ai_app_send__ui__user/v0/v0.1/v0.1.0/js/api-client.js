/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — API Client
   v0.1.0 — Base major version

   Simple fetch-based client for the SGraph Send backend API.
   All endpoints are relative to the current origin (same-origin).

   Protected endpoints (create, upload, complete) require an access token
   sent via the x-sgraph-access-token header. The token is read from
   localStorage under the key 'sgraph-send-access-token'.
   ═══════════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY__ACCESS_TOKEN = 'sgraph-send-access-token';
const HEADER__ACCESS_TOKEN      = 'x-sgraph-access-token';

const ApiClient = {

    baseUrl: '',   // Same origin — no prefix needed

    // ─── Access Token ────────────────────────────────────────────────────

    getAccessToken() {
        return localStorage.getItem(STORAGE_KEY__ACCESS_TOKEN) || '';
    },

    setAccessToken(token) {
        localStorage.setItem(STORAGE_KEY__ACCESS_TOKEN, token);
    },

    clearAccessToken() {
        localStorage.removeItem(STORAGE_KEY__ACCESS_TOKEN);
    },

    hasAccessToken() {
        return !!this.getAccessToken();
    },

    authHeaders() {
        const token = this.getAccessToken();
        return token ? { [HEADER__ACCESS_TOKEN]: token } : {};
    },

    // ─── Transfer Lifecycle (protected — require access token) ───────────

    /**
     * Create a new transfer. Returns transfer_id and upload_url.
     * @param {number} fileSizeBytes
     * @param {string} contentTypeHint — e.g. 'application/pdf'
     * @returns {Promise<{transfer_id: string, upload_url: string}>}
     */
    async createTransfer(fileSizeBytes, contentTypeHint) {
        const response = await fetch(`${this.baseUrl}/transfers/create`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json',
                       ...this.authHeaders() },
            body:    JSON.stringify({
                file_size_bytes:   fileSizeBytes,
                content_type_hint: contentTypeHint || 'application/octet-stream'
            })
        });
        if (response.status === 401) {
            this.clearAccessToken();
            throw new Error('ACCESS_TOKEN_INVALID');
        }
        if (!response.ok) {
            throw new Error(`Create transfer failed: ${response.status}`);
        }
        return response.json();
    },

    /**
     * Upload the encrypted payload for a transfer.
     * @param {string} transferId
     * @param {ArrayBuffer|Blob} encryptedBlob — the encrypted file data
     * @returns {Promise<{status: string}>}
     */
    async uploadPayload(transferId, encryptedBlob) {
        const response = await fetch(`${this.baseUrl}/transfers/upload/${transferId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/octet-stream',
                       ...this.authHeaders() },
            body:    encryptedBlob
        });
        if (response.status === 401) {
            this.clearAccessToken();
            throw new Error('ACCESS_TOKEN_INVALID');
        }
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        return response.json();
    },

    /**
     * Mark a transfer as complete.
     * @param {string} transferId
     * @returns {Promise<{transfer_id: string, download_url: string, transparency: object}>}
     */
    async completeTransfer(transferId) {
        const response = await fetch(`${this.baseUrl}/transfers/complete/${transferId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json',
                       ...this.authHeaders() }
        });
        if (response.status === 401) {
            this.clearAccessToken();
            throw new Error('ACCESS_TOKEN_INVALID');
        }
        if (!response.ok) {
            throw new Error(`Complete transfer failed: ${response.status}`);
        }
        return response.json();
    },

    // ─── Token Validation ────────────────────────────────────────────────

    /**
     * Check if a token is valid (lookup only — no usage consumed).
     * Used by the access gate to validate before storing.
     * @param {string} tokenName
     * @returns {Promise<{valid: boolean, status?: string, remaining?: number, reason?: string}>}
     */
    async checkToken(tokenName) {
        const response = await fetch(`${this.baseUrl}/transfers/check-token/${encodeURIComponent(tokenName)}`);
        if (!response.ok) {
            throw new Error(`Token check failed: ${response.status}`);
        }
        return response.json();
    },

    /**
     * Validate a token and consume one use (for download page).
     * Records the page view against the token's usage limit.
     * @param {string} tokenName
     * @returns {Promise<{success: boolean, usage_count?: number, remaining?: number, reason?: string}>}
     */
    async validateToken(tokenName) {
        const response = await fetch(`${this.baseUrl}/transfers/validate-token/${encodeURIComponent(tokenName)}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            throw new Error(`Token validation failed: ${response.status}`);
        }
        return response.json();
    },

    // ─── Transfer Info & Download (public — no auth needed) ──────────────

    /**
     * Get transfer metadata (status, size, created date, download count).
     * @param {string} transferId
     * @returns {Promise<{transfer_id: string, status: string, file_size_bytes: number, created_at: string, download_count: number}>}
     */
    async getTransferInfo(transferId) {
        const response = await fetch(`${this.baseUrl}/transfers/info/${transferId}`);
        if (!response.ok) {
            throw new Error(`Get transfer info failed: ${response.status}`);
        }
        return response.json();
    },

    /**
     * Download the encrypted payload as an ArrayBuffer.
     * @param {string} transferId
     * @returns {Promise<ArrayBuffer>}
     */
    async downloadPayload(transferId) {
        const response = await fetch(`${this.baseUrl}/transfers/download/${transferId}`);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }
        return response.arrayBuffer();
    },

    // ─── Presigned URLs (large file transfer via S3) ───────────────────

    /** @type {object|null} Cached capabilities response */
    _capabilities: null,

    /**
     * Check what upload modes the backend supports.
     * Cached after first call.
     * @returns {Promise<{presigned_upload: boolean, multipart_upload: boolean, direct_upload: boolean, max_part_size: number, min_part_size: number, max_parts: number}>}
     */
    async getCapabilities() {
        if (this._capabilities) return this._capabilities;
        try {
            const response = await fetch(`${this.baseUrl}/presigned/capabilities`);
            if (!response.ok) return { presigned_upload: false, multipart_upload: false, direct_upload: true, max_part_size: 0, min_part_size: 0, max_parts: 0 };
            this._capabilities = await response.json();
            return this._capabilities;
        } catch (e) {
            return { presigned_upload: false, multipart_upload: false, direct_upload: true, max_part_size: 0, min_part_size: 0, max_parts: 0 };
        }
    },

    /**
     * Initiate a multipart upload via presigned URLs.
     * @param {string} transferId
     * @param {number} fileSizeBytes
     * @param {number} [numParts]
     * @returns {Promise<{transfer_id: string, upload_id: string, part_urls: Array<{part_number: number, upload_url: string}>, part_size: number}>}
     */
    async initiateMultipart(transferId, fileSizeBytes, numParts) {
        const body = { transfer_id: transferId, file_size_bytes: fileSizeBytes };
        if (numParts) body.num_parts = numParts;
        const response = await fetch(`${this.baseUrl}/presigned/initiate`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body:    JSON.stringify(body)
        });
        if (response.status === 401) { this.clearAccessToken(); throw new Error('ACCESS_TOKEN_INVALID'); }
        if (!response.ok) throw new Error(`Initiate multipart failed: ${response.status}`);
        return response.json();
    },

    /**
     * Upload a single part to S3 via presigned URL.
     * @param {string} presignedUrl
     * @param {ArrayBuffer|Blob} partData
     * @returns {Promise<string>} ETag from S3
     */
    async uploadPart(presignedUrl, partData) {
        const response = await fetch(presignedUrl, {
            method:  'PUT',
            body:    partData
        });
        if (!response.ok) throw new Error(`Part upload failed: ${response.status}`);
        return response.headers.get('ETag') || '';
    },

    /**
     * Complete a multipart upload after all parts are uploaded.
     * @param {string} transferId
     * @param {string} uploadId
     * @param {Array<{part_number: number, etag: string}>} parts
     * @returns {Promise<{transfer_id: string, status: string, etag: string}>}
     */
    async completeMultipart(transferId, uploadId, parts) {
        const response = await fetch(`${this.baseUrl}/presigned/complete`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body:    JSON.stringify({ transfer_id: transferId, upload_id: uploadId, parts })
        });
        if (response.status === 401) { this.clearAccessToken(); throw new Error('ACCESS_TOKEN_INVALID'); }
        if (!response.ok) throw new Error(`Complete multipart failed: ${response.status}`);
        return response.json();
    },

    /**
     * Cancel a multipart upload (cleanup on failure).
     * @param {string} transferId
     * @param {string} uploadId
     */
    async cancelMultipart(transferId, uploadId) {
        try {
            await fetch(`${this.baseUrl}/presigned/cancel/${transferId}/${uploadId}`, {
                method:  'POST',
                headers: { ...this.authHeaders() }
            });
        } catch (e) { /* best-effort cleanup */ }
    },

    /**
     * Get a presigned download URL for a transfer.
     * @param {string} transferId
     * @returns {Promise<{transfer_id: string, download_url: string, expires_in: number}>}
     */
    async getPresignedDownloadUrl(transferId) {
        const response = await fetch(`${this.baseUrl}/presigned/download-url/${transferId}`);
        if (!response.ok) throw new Error(`Get download URL failed: ${response.status}`);
        return response.json();
    }
};
