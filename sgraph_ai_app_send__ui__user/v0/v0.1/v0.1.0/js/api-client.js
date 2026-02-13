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
    }
};
