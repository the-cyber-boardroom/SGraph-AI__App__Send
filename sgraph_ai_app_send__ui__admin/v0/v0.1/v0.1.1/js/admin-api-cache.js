/* =============================================================================
   SGraph Send Admin Console — API Client: Cache Browser Extension
   v0.1.1 — IFD surgical override: adds cache browsing methods to AdminAPI

   Endpoints:
     GET /cache/namespaces                    — list cache namespaces
     GET /cache/folders/{path}                — list subfolders at path
     GET /cache/files/{path}                  — list files at path
     GET /cache/entry/{namespace}/{cache_id}  — retrieve a single cache entry
   ============================================================================= */

AdminAPI.prototype.getCacheNamespaces = function() {
    return this._get('/cache/namespaces');
};

AdminAPI.prototype.getCacheFolders = function(path) {
    return this._get(`/cache/folders/${encodeURIComponent(path)}`);
};

AdminAPI.prototype.getCacheFiles = function(path) {
    return this._get(`/cache/files/${encodeURIComponent(path)}`);
};

AdminAPI.prototype.getCacheEntry = function(namespace, cacheId) {
    return this._get(`/cache/entry/${encodeURIComponent(namespace)}/${encodeURIComponent(cacheId)}`);
};
