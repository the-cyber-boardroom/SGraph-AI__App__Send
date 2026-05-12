// SGraph Send — Performance Tool — API Client
// Wraps the public /api/* endpoints. All requests carry x-sgraph-access-token
// when one is configured. Every method returns { status, ok, json, bytes, duration_ms }.

(function (global) {
  'use strict';

  const TOKEN_KEY = 'sg-perf:access-token';

  function nowMs() { return performance.now(); }

  function randomHex(byteCount) {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function randomId(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  async function readResponse(r) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const text = await r.text();
      const bytes = new Blob([text]).size;
      try { return { json: JSON.parse(text), bytes }; }
      catch { return { json: null, text, bytes }; }
    }
    if (ct.startsWith('text/')) {
      const text = await r.text();
      return { json: null, text, bytes: new Blob([text]).size };
    }
    const buf = await r.arrayBuffer();
    return { json: null, bytes: buf.byteLength, buffer: buf };
  }

  async function timedFetch(url, opts) {
    const t0 = nowMs();
    const sentBytes = opts && opts.body
      ? (opts.body instanceof ArrayBuffer ? opts.body.byteLength
         : opts.body instanceof Uint8Array ? opts.body.byteLength
         : new Blob([opts.body]).size)
      : 0;
    let r, payload = { json: null, bytes: 0 };
    let error = null;
    try {
      r = await fetch(url, opts);
      payload = await readResponse(r);
    } catch (e) {
      error = String(e && e.message || e);
    }
    const duration_ms = nowMs() - t0;
    return {
      url,
      method: (opts && opts.method) || 'GET',
      status: r ? r.status : 0,
      ok: r ? r.ok : false,
      duration_ms,
      bytes_sent: sentBytes,
      bytes_received: payload.bytes,
      json: payload.json,
      text: payload.text,
      buffer: payload.buffer,
      error,
    };
  }

  const ApiClient = {

    baseUrl() {
      const params = new URLSearchParams(location.search);
      return (params.get('api') || '').replace(/\/$/, '');
    },

    getToken() {
      try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
    },

    setToken(t) {
      try { localStorage.setItem(TOKEN_KEY, t || ''); } catch {}
    },

    clearToken() {
      try { localStorage.removeItem(TOKEN_KEY); } catch {}
    },

    authHeaders() {
      const t = this.getToken();
      return t ? { 'x-sgraph-access-token': t } : {};
    },

    url(path) {
      return this.baseUrl() + path;
    },

    // --- generic ---
    get(path, extraHeaders) {
      return timedFetch(this.url(path), {
        method: 'GET',
        headers: { ...this.authHeaders(), ...(extraHeaders || {}) },
        cache: 'no-store',
      });
    },

    // --- transfers ---
    transferCreate(fileSizeBytes, contentType, opts) {
      const body = {
        file_size_bytes:   fileSizeBytes,
        content_type_hint: contentType || 'application/octet-stream',
        max_downloads:     0,
        auto_delete:       false,
        expires_at:        0,
        delete_auth_hash: '',
        ...(opts || {})
      };
      return timedFetch(this.url('/api/transfers/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify(body),
      });
    },

    transferUpload(transferId, bytes) {
      return timedFetch(this.url(`/api/transfers/upload/${encodeURIComponent(transferId)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...this.authHeaders() },
        body: bytes,
      });
    },

    transferComplete(transferId) {
      return timedFetch(this.url(`/api/transfers/complete/${encodeURIComponent(transferId)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: '{}',
      });
    },

    transferInfo(transferId) {
      return this.get(`/api/transfers/info/${encodeURIComponent(transferId)}`);
    },

    transferDownload(transferId) {
      return this.get(`/api/transfers/download/${encodeURIComponent(transferId)}`);
    },

    transferDelete(transferId, deleteAuth) {
      const headers = { ...this.authHeaders() };
      if (deleteAuth) headers['x-sgraph-transfer-delete-auth'] = deleteAuth;
      return timedFetch(this.url(`/api/transfers/delete/${encodeURIComponent(transferId)}`), {
        method: 'DELETE', headers,
      });
    },

    checkToken(tokenName) {
      return this.get(`/api/transfers/check-token/${encodeURIComponent(tokenName)}`);
    },

    validateToken(tokenName) {
      return timedFetch(this.url(`/api/transfers/validate-token/${encodeURIComponent(tokenName)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: '{}',
      });
    },

    // --- vault ---
    vaultWrite(vaultId, fileId, writeKeyHex, bytes) {
      return timedFetch(this.url(`/api/vault/write/${encodeURIComponent(vaultId)}/${fileId.split('/').map(encodeURIComponent).join('/')}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-sgraph-vault-write-key': writeKeyHex,
          ...this.authHeaders(),
        },
        body: bytes,
      });
    },

    vaultRead(vaultId, fileId) {
      return this.get(`/api/vault/read/${encodeURIComponent(vaultId)}/${fileId.split('/').map(encodeURIComponent).join('/')}`);
    },

    vaultDeleteFile(vaultId, fileId, writeKeyHex) {
      return timedFetch(this.url(`/api/vault/delete/${encodeURIComponent(vaultId)}/${fileId.split('/').map(encodeURIComponent).join('/')}`), {
        method: 'DELETE',
        headers: {
          'x-sgraph-vault-write-key': writeKeyHex,
          ...this.authHeaders(),
        },
      });
    },

    vaultList(vaultId, prefix) {
      const q = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
      return this.get(`/api/vault/list/${encodeURIComponent(vaultId)}${q}`);
    },

    vaultHealth(vaultId) {
      return this.get(`/api/vault/health/${encodeURIComponent(vaultId)}`);
    },

    vaultBatch(vaultId, operations, writeKeyHex) {
      const headers = { 'Content-Type': 'application/json', ...this.authHeaders() };
      if (writeKeyHex) headers['x-sgraph-vault-write-key'] = writeKeyHex;
      return timedFetch(this.url(`/api/vault/batch/${encodeURIComponent(vaultId)}`), {
        method: 'POST', headers,
        body: JSON.stringify({ operations }),
      });
    },

    // purge=true → backend skips deleted.json tombstone; vault_id becomes fully reusable.
    vaultDestroy(vaultId, writeKeyHex, { purge = false } = {}) {
      return timedFetch(this.url(`/api/vault/destroy/${encodeURIComponent(vaultId)}`), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-sgraph-vault-write-key': writeKeyHex,
          ...this.authHeaders(),
        },
        body: JSON.stringify({ vault_id: vaultId, ...(purge ? { purge: true } : {}) }),
      });
    },

    // --- meta ---
    openApiJson()  { return this.get('/api/openapi.json'); },
    apiDocsHtml()  { return this.get('/api/docs'); },

    // --- helpers ---
    randomHex,
    randomId,
    randomBytes(n) {
      const a = new Uint8Array(n);
      crypto.getRandomValues(a);
      return a;
    },
    async sha256Hex(input) {
      const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    },
  };

  global.ApiClient = ApiClient;
})(window);
