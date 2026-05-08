/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — API Client Patch (v0.3.2)

   Patches:
   1. createTransfer() — accepts optional third argument secretConfig to send
      max_downloads, auto_delete, expires_at, delete_auth_hash.
   2. downloadBase64() — new method: GET /api/transfers/download-base64/{id}
      Returns { data: "<base64>" }. Used by the secret receive page.
   3. deleteTransfer() — new method: DELETE /api/transfers/delete/{id}
      Requires x-sgraph-transfer-delete-auth header (the raw deleteAuth token,
      not its hash — the server hashes on receipt).

   NOTE: The backend Schema__Transfer currently declares expires_at as str
   (ISO-8601). The project convention is Timestamp_Now — int milliseconds since
   epoch (Date.now() format). We send an int. If the backend rejects it, the
   error will surface in the upload pipeline. A backend fix to Schema__Transfer
   and Transfer__Service._is_expired() is tracked separately.

   Load AFTER api-client.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── Patch 1: createTransfer with optional secretConfig ─────────────────────

ApiClient.createTransfer = async function(fileSize, contentType, secretConfig) {
    var body = {
        file_size_bytes:   fileSize,
        content_type_hint: contentType || 'application/octet-stream'
    };
    if (secretConfig) {
        if (secretConfig.max_downloads)    body.max_downloads    = secretConfig.max_downloads;
        if (secretConfig.auto_delete)      body.auto_delete      = secretConfig.auto_delete;
        if (secretConfig.expires_at)       body.expires_at       = secretConfig.expires_at;
        if (secretConfig.delete_auth_hash) body.delete_auth_hash = secretConfig.delete_auth_hash;
    }
    var res = await this._fetch('/api/transfers/create', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, this._authHeaders()),
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
        throw new Error('Create transfer failed: ' + res.status);
    }
    return res.json();
};

// ─── Patch 2: downloadBase64 ─────────────────────────────────────────────────

ApiClient.downloadBase64 = async function(transferId) {
    var res = await this._fetch('/api/transfers/download-base64/' + transferId, {
        headers: this._authHeaders()
    });
    if (!res.ok) {
        if (res.status === 403 || res.status === 410) throw new Error('download:exhausted');
        if (res.status === 404)                        throw new Error('download:not-found');
        throw new Error('download:' + res.status);
    }
    return res.json();
};

// ─── Patch 3: deleteTransfer ─────────────────────────────────────────────────

ApiClient.deleteTransfer = async function(transferId, deleteAuth) {
    var res = await this._fetch('/api/transfers/delete/' + transferId, {
        method: 'DELETE',
        headers: Object.assign({ 'x-sgraph-transfer-delete-auth': deleteAuth }, this._authHeaders())
    });
    if (!res.ok) {
        if (res.status === 404) throw new Error('delete:not-found');
        if (res.status === 403) throw new Error('delete:forbidden');
        throw new Error('delete:' + res.status);
    }
    return res.json();
};
