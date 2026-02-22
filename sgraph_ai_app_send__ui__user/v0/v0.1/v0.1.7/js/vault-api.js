/* =============================================================================
   SGraph Send — Vault API Client
   v0.1.7 — User-facing vault operations

   Fetch-based client for vault endpoints on the admin API.
   The admin API URL is auto-detected from the current origin or can be
   set explicitly via VaultAPI.adminUrl.

   Endpoints (on admin API):
     POST /vault/create                              — create a new vault
     GET  /vault/lookup/{vault_cache_key}            — get vault manifest
     GET  /vault/exists/{vault_cache_key}            — check vault exists
     POST /vault/folder                              — store a folder
     GET  /vault/folder/{vault_cache_key}/{guid}     — get a folder
     GET  /vault/folders/{vault_cache_key}           — list folders
     POST /vault/file                                — store encrypted file
     GET  /vault/file/{vault_cache_key}/{guid}       — get encrypted file
     GET  /vault/files/{vault_cache_key}             — list files
     POST /vault/index                               — store encrypted index
     GET  /vault/index/{vault_cache_key}             — get encrypted index
     GET  /vault/list-all/{vault_cache_key}          — list all vault items
   ============================================================================= */

const VaultAPI = {

    adminUrl: '',   // Same origin by default; set for cross-origin admin

    // --- Internal Helpers ---------------------------------------------------

    async _get(path) {
        const url = `${this.adminUrl}${path}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return null;
        return response.json();
    },

    async _post(path, body) {
        const url = `${this.adminUrl}${path}`;
        const response = await fetch(url, {
            method:      'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json',
                       'Accept': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) return null;
        return response.json();
    },

    // --- Vault Lifecycle ----------------------------------------------------

    create(vaultCacheKey, keyFingerprint) {
        return this._post('/vault/create', {
            vault_cache_key : vaultCacheKey,
            key_fingerprint : keyFingerprint || ''
        });
    },

    lookup(vaultCacheKey) {
        return this._get(`/vault/lookup/${encodeURIComponent(vaultCacheKey)}`);
    },

    exists(vaultCacheKey) {
        return this._get(`/vault/exists/${encodeURIComponent(vaultCacheKey)}`);
    },

    // --- Folder Operations --------------------------------------------------

    storeFolder(vaultCacheKey, folderGuid, folderData) {
        return this._post('/vault/folder', {
            vault_cache_key : vaultCacheKey,
            folder_guid     : folderGuid,
            folder_data     : folderData
        });
    },

    async getFolder(vaultCacheKey, folderGuid) {
        const resp = await this._get(`/vault/folder/${encodeURIComponent(vaultCacheKey)}/${encodeURIComponent(folderGuid)}`);
        return resp ? resp.data : null;
    },

    listFolders(vaultCacheKey) {
        return this._get(`/vault/folders/${encodeURIComponent(vaultCacheKey)}`);
    },

    // --- File Operations ----------------------------------------------------

    storeFile(vaultCacheKey, fileGuid, encryptedDataB64) {
        return this._post('/vault/file', {
            vault_cache_key : vaultCacheKey,
            file_guid       : fileGuid,
            encrypted_data  : encryptedDataB64
        });
    },

    getFile(vaultCacheKey, fileGuid) {
        return this._get(`/vault/file/${encodeURIComponent(vaultCacheKey)}/${encodeURIComponent(fileGuid)}`);
    },

    listFiles(vaultCacheKey) {
        return this._get(`/vault/files/${encodeURIComponent(vaultCacheKey)}`);
    },

    // --- Index Operations ---------------------------------------------------

    storeIndex(vaultCacheKey, encryptedIndexB64) {
        return this._post('/vault/index', {
            vault_cache_key  : vaultCacheKey,
            encrypted_index  : encryptedIndexB64
        });
    },

    getIndex(vaultCacheKey) {
        return this._get(`/vault/index/${encodeURIComponent(vaultCacheKey)}`);
    },

    // --- Bulk Operations ----------------------------------------------------

    listAll(vaultCacheKey) {
        return this._get(`/vault/list-all/${encodeURIComponent(vaultCacheKey)}`);
    }
};
