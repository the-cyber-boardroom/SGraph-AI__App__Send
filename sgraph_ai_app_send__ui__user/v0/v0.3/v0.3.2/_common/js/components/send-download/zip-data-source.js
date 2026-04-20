/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — ZipDataSource
   v0.3.2 — Adapter that wraps JSZip data into the BrowseDataSource interface.

   Interface contract (3 required methods):
     getTree()              → { name, children: { name: TreeNode }, files: [{ path, name, size }] }
     getFileBytes(path)     → Promise<ArrayBuffer>
     getFileList()          → [{ path, name, dir, size }]

   Plus zip-specific extras:
     getZipBlob()           → Promise<Blob>  (re-generates clean zip for Save)
     getOrigName()          → string
     writable               → false (zips are read-only)
   ═══════════════════════════════════════════════════════════════════════════════ */

class ZipDataSource {

    constructor(zipInstance, zipTree, zipOrigBytes, zipOrigName) {
        this._zip       = zipInstance;
        this._tree      = zipTree;
        this._origBytes = zipOrigBytes;
        this._origName  = zipOrigName;
        this.writable   = false;
    }

    // ─── Required: hierarchical tree ─────────────────────────────────────

    getTree() {
        var root  = { name: '', children: {}, files: [] };
        var files = this._tree.filter(function(e) {
            return !e.dir && !ZipDataSource._isGalleryMeta(e.path);
        });

        for (var i = 0; i < files.length; i++) {
            var file  = files[i];
            var parts = file.path.split('/');
            var node  = root;
            for (var j = 0; j < parts.length - 1; j++) {
                if (!node.children[parts[j]]) {
                    node.children[parts[j]] = { name: parts[j], children: {}, files: [] };
                }
                node = node.children[parts[j]];
            }
            node.files.push(file);
        }
        return root;
    }

    // ─── Required: file bytes ────────────────────────────────────────────

    async getFileBytes(path) {
        var entry = this._tree.find(function(e) { return e.path === path && !e.dir; });
        if (!entry) throw new Error('File not found: ' + path);
        return entry.entry.async('arraybuffer');
    }

    // ─── Required: flat file list ────────────────────────────────────────

    getFileList() {
        return this._tree.filter(function(e) { return !e.dir; });
    }

    // ─── Zip-specific: re-generate clean zip for Save ────────────────────

    async getZipBlob() {
        if (!this._zip) throw new Error('No zip instance');
        return this._zip.generateAsync({
            type: 'blob',
            mimeType: 'application/zip',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
    }

    getOrigName() {
        return this._origName || 'archive.zip';
    }

    getOrigSize() {
        return this._origBytes ? this._origBytes.byteLength : 0;
    }

    // ─── Static helper ───────────────────────────────────────────────────

    static _isGalleryMeta(path) {
        return path.startsWith('_gallery.') || path.startsWith('__gallery__');
    }
}

window.ZipDataSource = ZipDataSource;
