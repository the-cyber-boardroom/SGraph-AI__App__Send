/* =================================================================================
   PinnedVaultDataSource — a vault as it was at ONE commit, read-only

   The whole "release channels" feature rests on this ~small adapter. Every mount path
   in app-shell talks only to the data-source contract — `getFileList()`,
   `getFileBytes(path)`, `writable` — so serving those three from a historical commit
   instead of the working tree pins the ENTIRE app (its `app.json`, its resources, every
   `sg.vfs.read`) to that version with no changes downstream.

   Nothing is copied. SGit objects are content-addressed and immutable, so an old release
   IS the same objects, not a restored duplicate that might have drifted.

   `writable` is ALWAYS false, and that is a safety rule rather than a missing feature:
   committing on top of an old tree would fork the branch. Pinned means read-only, for
   the owner too — "switch to Live to edit" is a far better experience than a silent
   divergence discovered later.

   Mirrors the surface of VaultDataSource (vault-data-source.js) closely enough for
   app-shell; mutating methods reject with EPINNED rather than failing obscurely.

   Requires: an open SGVault (uses its history primitives: _flattenCommitTree/readFileAt).
   ================================================================================= */

(function () {
    'use strict';

    function _err(code, message) {
        var e = new Error(message);
        e.code = code;
        return e;
    }

    class PinnedVaultDataSource {

        constructor(vault, commitId, meta) {
            this._vault    = vault;
            this._commitId = commitId;
            this._files    = null;              // Map<path,{blob_id,size,content_hash}>
            this._list     = null;              // materialised [{path,name,dir,size}]
            this.writable  = false;             // never writable — see header
            this.release   = meta || null;      // {name,label} — for the HUD badge
            this.pinned    = true;              // lets callers branch without instanceof
        }

        // Pre-load the commit's flattened tree. Called ONCE before the data source is
        // handed to a mount, so getFileList() can stay SYNCHRONOUS — every existing
        // caller of the contract assumes that, and making it async would ripple.
        async warm() {
            if (this._files) return this;
            this._files = await this._vault._flattenCommitTree(this._commitId);
            var list = [], dirs = {};
            this._files.forEach(function (meta, path) {
                list.push({ path: path, name: path.split('/').pop(), dir: false, size: (meta && meta.size) | 0 });
                // Synthesise the folder entries a flat file map does not carry, so tree
                // views and folder-relative lookups behave as they do on the live source.
                var parts = path.split('/');
                for (var i = 1; i < parts.length; i++) {
                    var d = parts.slice(0, i).join('/');
                    if (d && !dirs[d]) {
                        dirs[d] = 1;
                        list.push({ path: d + '/', name: parts[i - 1], dir: true, size: 0 });
                    }
                }
            });
            this._list = list;
            return this;
        }

        getFileList() { return this._list || []; }

        async getFileBytes(path) {
            var p = String(path || '').replace(/^\/+/, '');
            return this._vault.readFileAt(this._commitId, p);
        }

        // ── Surface parity with VaultDataSource ──────────────────────────────────
        // The tree is fully materialised by warm(), so the lazy-load hooks are no-ops
        // rather than errors: callers that politely ask to load a folder should get
        // "already loaded", not an exception.
        async loadAllSubTrees() { return this; }
        async loadFolder()      { return this; }
        async _ensureLoaded()   { return this; }
        getTree()               { return null; }
        getOrigName()           { return (this._vault && this._vault.name) || 'Vault'; }
        getOrigSize()           { return 0; }

        // ── Mutations: refused, loudly and specifically ──────────────────────────
        // EPINNED (not EREADONLY) so the UI can say WHY: you are viewing a published
        // release, not a vault you lack the key for. Different problem, different fix.
        async saveFile()   { throw _err('EPINNED', 'This is a published release (read-only). Switch to Live to make changes.'); }
        async renameFile() { throw _err('EPINNED', 'This is a published release (read-only). Switch to Live to make changes.'); }
        async deleteFile() { throw _err('EPINNED', 'This is a published release (read-only). Switch to Live to make changes.'); }
        async createFolder(){ throw _err('EPINNED', 'This is a published release (read-only). Switch to Live to make changes.'); }
        async deleteFolder(){ throw _err('EPINNED', 'This is a published release (read-only). Switch to Live to make changes.'); }
    }

    globalThis.PinnedVaultDataSource = PinnedVaultDataSource;
    if (typeof module !== 'undefined' && module.exports) module.exports = { PinnedVaultDataSource };  // node tests
})();
