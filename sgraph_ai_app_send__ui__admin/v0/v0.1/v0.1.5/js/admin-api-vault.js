/* =============================================================================
   SGraph Send Admin Console — Vault API Extension
   v0.1.5 — Extends adminAPI with vault endpoints

   Endpoints:
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

(function() {
    'use strict';

    // --- Vault Lifecycle ---

    adminAPI.vaultCreate = function(vaultCacheKey, keyFingerprint) {
        return this._post('/vault/create', {
            vault_cache_key : vaultCacheKey,
            key_fingerprint : keyFingerprint || ''
        });
    };

    adminAPI.vaultLookup = function(vaultCacheKey) {
        return this._get(`/vault/lookup/${encodeURIComponent(vaultCacheKey)}`);
    };

    adminAPI.vaultExists = function(vaultCacheKey) {
        return this._get(`/vault/exists/${encodeURIComponent(vaultCacheKey)}`);
    };

    // --- Folder Operations ---

    adminAPI.vaultStoreFolder = function(vaultCacheKey, folderGuid, folderData) {
        return this._post('/vault/folder', {
            vault_cache_key : vaultCacheKey,
            folder_guid     : folderGuid,
            folder_data     : folderData
        });
    };

    adminAPI.vaultGetFolder = function(vaultCacheKey, folderGuid) {
        return this._get(`/vault/folder/${encodeURIComponent(vaultCacheKey)}/${encodeURIComponent(folderGuid)}`);
    };

    adminAPI.vaultListFolders = function(vaultCacheKey) {
        return this._get(`/vault/folders/${encodeURIComponent(vaultCacheKey)}`);
    };

    // --- File Operations ---

    adminAPI.vaultStoreFile = function(vaultCacheKey, fileGuid, encryptedDataB64) {
        return this._post('/vault/file', {
            vault_cache_key : vaultCacheKey,
            file_guid       : fileGuid,
            encrypted_data  : encryptedDataB64
        });
    };

    adminAPI.vaultGetFile = function(vaultCacheKey, fileGuid) {
        return this._get(`/vault/file/${encodeURIComponent(vaultCacheKey)}/${encodeURIComponent(fileGuid)}`);
    };

    adminAPI.vaultListFiles = function(vaultCacheKey) {
        return this._get(`/vault/files/${encodeURIComponent(vaultCacheKey)}`);
    };

    // --- Chunked File Upload (for files > ~4MB) ---

    /**
     * Upload a single chunk of an encrypted file.
     * @param {string} vaultCacheKey
     * @param {string} fileGuid
     * @param {number} chunkIndex   — 0-based
     * @param {number} totalChunks
     * @param {string} chunkDataB64 — base64-encoded encrypted chunk
     */
    adminAPI.vaultStoreFileChunk = function(vaultCacheKey, fileGuid, chunkIndex, totalChunks, chunkDataB64) {
        return this._post('/vault/file-chunk', {
            vault_cache_key : vaultCacheKey,
            file_guid       : fileGuid,
            chunk_index     : chunkIndex,
            total_chunks    : totalChunks,
            chunk_data      : chunkDataB64
        });
    };

    /**
     * Assemble previously uploaded chunks into a single file.
     * @param {string} vaultCacheKey
     * @param {string} fileGuid
     * @param {number} totalChunks
     */
    adminAPI.vaultAssembleFile = function(vaultCacheKey, fileGuid, totalChunks) {
        return this._post('/vault/file-assemble', {
            vault_cache_key : vaultCacheKey,
            file_guid       : fileGuid,
            total_chunks    : totalChunks
        });
    };

    // --- Index Operations ---

    adminAPI.vaultStoreIndex = function(vaultCacheKey, encryptedIndexB64) {
        return this._post('/vault/index', {
            vault_cache_key  : vaultCacheKey,
            encrypted_index  : encryptedIndexB64
        });
    };

    adminAPI.vaultGetIndex = function(vaultCacheKey) {
        return this._get(`/vault/index/${encodeURIComponent(vaultCacheKey)}`);
    };

    // --- Bulk Operations ---

    adminAPI.vaultListAll = function(vaultCacheKey) {
        return this._get(`/vault/list-all/${encodeURIComponent(vaultCacheKey)}`);
    };

    // --- ACL Operations ---

    adminAPI.vaultShare = function(vaultCacheKey, userId, permission) {
        return this._post(`/vault/share/${encodeURIComponent(vaultCacheKey)}`, {
            user_id    : userId,
            permission : permission || 'viewer'
        });
    };

    adminAPI.vaultUnshare = function(vaultCacheKey, userId) {
        return this._delete(`/vault/unshare/${encodeURIComponent(vaultCacheKey)}/${encodeURIComponent(userId)}`);
    };

    adminAPI.vaultPermissions = function(vaultCacheKey) {
        return this._get(`/vault/permissions/${encodeURIComponent(vaultCacheKey)}`);
    };

})();
