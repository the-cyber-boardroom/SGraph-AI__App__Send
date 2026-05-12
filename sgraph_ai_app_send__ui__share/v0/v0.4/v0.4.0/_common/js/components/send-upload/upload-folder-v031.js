/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for upload-folder.js

   Fix: Rename gallery metadata folder from _gallery.{16-char-hash}
        to __gallery__{8-char-hash}. Double underscore prefix + separator,
        shorter hash for readability in the file tree.
   ═══════════════════════════════════════════════════════════════════════════════ */

// Override computeFolderHash to return 8 hex chars (was 16)
(function() {
    UploadThumbnails.computeFolderHash = function(fileHashes) {
        var data = new TextEncoder().encode(fileHashes.join(''));
        return crypto.subtle.digest('SHA-256', data).then(function(hashBuf) {
            var arr = new Uint8Array(hashBuf), hex = '';
            for (var i = 0; i < 4; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
            return hex;  // 8 hex chars (4 bytes)
        });
    };
})();

// Patch UploadFolder.GALLERY_PREFIX used to build the folder name
// v0.3.0: '_gallery.' + hash → _gallery.1d6b94eb07927c1d
// v0.3.1: '__gallery__' + hash → __gallery__1d6b94eb
(function() {
    var origAddPreview = UploadFolder.addPreviewToZip;

    UploadFolder.addPreviewToZip = async function(zip, entries, options) {
        // Run original — it creates _gallery.{hash}/ in the zip
        await origAddPreview.call(this, zip, entries, options);

        // Rename _gallery.* → __gallery__* in the zip
        var toRename = [];
        zip.forEach(function(path) {
            if (path.startsWith('_gallery.')) toRename.push(path);
        });

        for (var i = 0; i < toRename.length; i++) {
            var oldPath = toRename[i];
            var entry   = zip.file(oldPath);
            if (!entry) continue;  // skip directories

            // Build new path: _gallery.{hash}/... → __gallery__{shortHash}/...
            var newPath = oldPath.replace(/^_gallery\.([a-f0-9]+)/, function(_, hash) {
                return '__gallery__' + hash.substring(0, 8);
            });

            if (newPath !== oldPath) {
                var content = await entry.async('arraybuffer');
                zip.file(newPath, content);
                zip.remove(oldPath);
            }
        }
    };
})();
