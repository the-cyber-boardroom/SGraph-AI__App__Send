/* =================================================================================
   SGraph Vault — History (read past commits / trees / blobs)
   v0.1.0 — read-only access to historical versions

   Extends SGVault.prototype. Must load after sg-vault.js and sg-vault--sync.js
   (reuses _flattenCommitTree). All methods are READ-ONLY and use the read key, so
   they work on read-only opens (and read-only sub-vaults) too.

   Powers the iframe `window.sg.history.*` API (see app-shell VFS bridge):
     logCommits({limit, from})        → [{ id, parents[], tree_id, timestamp_ms, message }]
     listTreeAt(commitId, path)       → [{ path, name, dir, size }]   (one level under path)
     readFileAt(commitId, path)       → ArrayBuffer (file bytes at that commit)
     readBlob(blobId)                 → ArrayBuffer (a content-addressed object by id)
   ================================================================================= */

(function () {
    'use strict';

    function _toArrayBuffer(plain) {
        if (plain instanceof ArrayBuffer) return plain;
        if (plain && plain.buffer)        return plain.buffer;
        return new Uint8Array(plain).buffer;
    }

    Object.assign(SGVault.prototype, {

        // --- Commit log: walk the first-parent chain from a starting commit ---------
        async logCommits(opts) {
            opts = opts || {};
            const limit = Math.max(1, Math.min(opts.limit || 50, 500));
            let cursor  = opts.from || this._headCommitId;
            const out   = [];
            let n = 0;
            while (cursor && n < limit) {
                let c;
                try { c = await this._commitManager.loadCommit(cursor); }
                catch (_) { break; }
                out.push({
                    id:           cursor,
                    parents:      c.parents || [],
                    tree_id:      c.tree_id || null,
                    timestamp_ms: c.timestamp_ms || null,
                    message:      c.message || ''
                });
                cursor = (c.parents && c.parents[0]) || null;
                n++;
            }
            return out;
        },

        // --- List a folder one level deep, as it was at a given commit --------------
        async listTreeAt(commitId, path) {
            const files  = await this._flattenCommitTree(commitId);   // Map<fullPath,{blob_id,size,content_hash}>
            const prefix = String(path || '').replace(/^\/+|\/+$/g, '');
            const seen   = new Set();
            const out    = [];
            for (const [p, meta] of files) {
                if (prefix && !(p === prefix || p.startsWith(prefix + '/'))) continue;
                const rel = prefix ? p.slice(prefix.length + 1) : p;
                if (!rel) continue;
                const slash = rel.indexOf('/');
                if (slash === -1) {
                    out.push({ path: p, name: rel, dir: false, size: meta.size | 0 });
                } else {
                    const dirName = rel.slice(0, slash);
                    const dirPath = prefix ? prefix + '/' + dirName : dirName;
                    if (!seen.has(dirPath)) { seen.add(dirPath); out.push({ path: dirPath + '/', name: dirName, dir: true, size: 0 }); }
                }
            }
            return out;
        },

        // --- Read a file's bytes as they were at a given commit ---------------------
        async readFileAt(commitId, path) {
            const files = await this._flattenCommitTree(commitId);
            const norm  = String(path || '').replace(/^\/+/, '');
            const meta  = files.get(norm);
            if (!meta || !meta.blob_id) { const e = new Error('ENOENT'); e.path = norm; throw e; }
            return this.readBlob(meta.blob_id);
        },

        // --- Read a content-addressed object (blob) by id ---------------------------
        async readBlob(blobId) {
            const cipher = await this._objectStore.load(blobId);
            const plain  = await SGSendCrypto.decrypt(cipher, this._readKey);
            return _toArrayBuffer(plain);
        }
    });
})();
