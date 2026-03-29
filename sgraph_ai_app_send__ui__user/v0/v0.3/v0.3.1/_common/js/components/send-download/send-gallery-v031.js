/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for send-gallery.js

   Fix: Gallery manifest and file filtering handles both _gallery. and
        __gallery__ folder prefixes (backward compatible with v0.3.0 uploads).
   ═══════════════════════════════════════════════════════════════════════════════ */

// Reuse the shared helper from send-browse-v031.js (loaded before this file)
// _isGalleryMetaPath(path) → true if path starts with _gallery. or __gallery__

// Override _loadManifest to find manifest in either folder format
(function() {
    var origLoadManifest = SendGallery.prototype._loadManifest;

    SendGallery.prototype._loadManifest = async function() {
        // Try both folder name patterns
        var manifestEntry = this.zipTree.find(function(e) {
            return (e.path.startsWith('_gallery.') || e.path.startsWith('__gallery__')) &&
                   e.path.endsWith('/_manifest.json');
        });

        if (!manifestEntry) return {};

        try {
            var text = await manifestEntry.entry.async('string');
            var manifest = JSON.parse(text);

            // Build thumbnail path map
            var thumbMap = {};
            if (manifest.files) {
                for (var i = 0; i < manifest.files.length; i++) {
                    var f = manifest.files[i];
                    if (f.thumbnail && typeof f.thumbnail === 'object' && f.thumbnail.path) {
                        thumbMap[f.path] = f.thumbnail.path;
                    } else if (f.thumbnail && typeof f.thumbnail === 'string') {
                        thumbMap[f.path] = f.thumbnail;
                    }
                }
            }
            return thumbMap;
        } catch (_) {
            return {};
        }
    };
})();

// Override _build's file filter to exclude both folder formats
(function() {
    var origBuild = SendGallery.prototype._build;

    SendGallery.prototype._build = async function() {
        // Patch zipTree filter before calling original
        var origFilter = Array.prototype.filter;
        var self = this;

        // The original _build does: this.zipTree.filter(e => !e.dir && !e.path.startsWith('_gallery.'))
        // We need it to also exclude __gallery__
        // Simplest: just fix _entries before and after
        await origBuild.call(this);

        // Re-filter _entries to also exclude __gallery__ (original only excludes _gallery.)
        if (this._entries) {
            this._entries = this._entries.filter(function(e) {
                return !e.path.startsWith('__gallery__');
            });
        }
    };
})();
