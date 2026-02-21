/* =============================================================================
   SGraph Send Admin Console — API Client
   v0.1.0 — Base major version

   Fetch-based client for the SGraph Send Admin API.
   All endpoints are relative to the current origin (same-origin).
   Cookie-based auth (set by Routes__Set_Cookie) — credentials: 'include'.

   Endpoints:
     Token Management:
       POST /tokens/create          — create a new token
       GET  /tokens/lookup/{name}   — lookup token by name
       POST /tokens/use/{name}      — record a token usage
       POST /tokens/revoke/{name}   — revoke a token
       GET  /tokens/list            — list all tokens

     Analytics:
       GET  /health/pulse           — real-time traffic pulse

     System Info:
       GET  /info/status             — service info (name, version)
       GET  /info/health            — health check
   ============================================================================= */

class AdminAPI {

    constructor() {
        this.baseUrl = '';  // Same origin — no prefix needed
    }

    // --- Internal Helpers ---------------------------------------------------

    async _request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const config = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Remove Content-Type for GET requests (no body)
        if (!config.method || config.method === 'GET') {
            delete config.headers['Content-Type'];
        }

        let response;
        try {
            response = await fetch(url, config);
        } catch (err) {
            throw new Error(`Network error: ${err.message}`);
        }

        if (!response.ok) {
            let detail = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                detail = body.detail || body.message || detail;
            } catch (_) {
                // Response body not JSON — use status text
            }
            throw new Error(detail);
        }

        return response.json();
    }

    _get(path) {
        return this._request(path, { method: 'GET' });
    }

    _post(path, body) {
        return this._request(path, {
            method: 'POST',
            body:   body !== undefined ? JSON.stringify(body) : undefined
        });
    }

    // --- Token Management ---------------------------------------------------

    /**
     * Create a new token.
     * @param {string}  tokenName   — human-friendly name (e.g. 'community-x')
     * @param {number}  usageLimit  — max uses (default 50, 0 = unlimited)
     * @param {string}  createdBy   — admin identifier (default 'admin')
     * @param {object}  metadata    — optional key/value metadata
     * @returns {Promise<{cache_id: string, token_name: string}>}
     */
    createToken(tokenName, usageLimit = 50, createdBy = 'admin', metadata = {}) {
        return this._post('/tokens/create', {
            token_name:  tokenName,
            usage_limit: usageLimit,
            created_by:  createdBy,
            metadata:    metadata
        });
    }

    /**
     * Lookup a token by name.
     * @param {string} tokenName
     * @returns {Promise<{token_name, usage_limit, usage_count, status, created_by, metadata}>}
     */
    lookupToken(tokenName) {
        return this._get(`/tokens/lookup/${encodeURIComponent(tokenName)}`);
    }

    /**
     * Record a token usage event.
     * @param {string} tokenName
     * @param {object} body — { ip_hash, action, transfer_id }
     * @returns {Promise<{success: boolean, usage_count?: number, remaining?: number, reason?: string}>}
     */
    useToken(tokenName, body = {}) {
        return this._post(`/tokens/use/${encodeURIComponent(tokenName)}`, body);
    }

    /**
     * Revoke a token.
     * @param {string} tokenName
     * @returns {Promise<{status: 'revoked', token_name: string}>}
     */
    revokeToken(tokenName) {
        return this._post(`/tokens/revoke/${encodeURIComponent(tokenName)}`);
    }

    /**
     * List all tokens.
     * @returns {Promise<{token_names: Array}>}
     */
    listTokens() {
        return this._get('/tokens/list');
    }

    /**
     * List all tokens with full details (bulk endpoint).
     * Single call replaces list + N lookups.
     * @returns {Promise<{tokens: Array}>}
     */
    listTokenDetails() {
        return this._get('/tokens/list-details');
    }

    // --- Analytics ----------------------------------------------------------

    /**
     * Get real-time traffic pulse.
     * @param {number} windowMinutes — rolling window size (default 5)
     * @returns {Promise<{window_minutes, active_requests, active_visitors, active_transfers}>}
     */
    getPulse(windowMinutes = 5) {
        return this._get(`/health/pulse?window_minutes=${windowMinutes}`);
    }

    // --- System Info --------------------------------------------------------

    /**
     * Get service info (name, version, etc.).
     * @returns {Promise<object>}
     */
    getInfo() {
        return this._get('/info/status');
    }

    /**
     * Health check.
     * @returns {Promise<object>}
     */
    getHealth() {
        return this._get('/info/health');
    }
}

// Singleton instance
const adminAPI = new AdminAPI();
