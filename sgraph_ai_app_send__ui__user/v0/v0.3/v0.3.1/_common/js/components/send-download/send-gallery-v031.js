/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for send-gallery.js

   Fixes:
     1. Gallery manifest/file filtering handles both _gallery. and __gallery__
     2. Image thumbnails use original file (full resolution) not pre-generated thumb
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
        await origBuild.call(this);

        // Re-filter _entries to also exclude __gallery__ (original only excludes _gallery.)
        if (this._entries) {
            this._entries = this._entries.filter(function(e) {
                return !e.path.startsWith('__gallery__');
            });
        }
    };
})();


// ─── Fix: Use original images instead of thumbnails ──────────────────────────
//
// v0.3.0: gallery thumbnails use pre-generated thumbs from _gallery.{hash}/
// even for images — these are ~24KB vs 600KB+ originals, causing pixelation.
//
// v0.3.1: For image files, skip the thumbnail and use the original file bytes
// directly. Thumbnails are only used for non-image types (PDF, markdown, video)
// where a pre-generated preview is genuinely needed.

(function() {
    var origLoadThumbnails = SendGallery.prototype._loadThumbnails;

    SendGallery.prototype._loadThumbnails = async function() {
        var grid = this.$('#sg-grid');
        if (!grid) return;

        for (var i = 0; i < this._entries.length; i++) {
            var entry = this._entries[i];
            var card = document.createElement('div');
            card.className = 'sg-thumb';
            card.dataset.index = i;

            var type = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.detect(entry.name, null) : null;
            var ext = (entry.name.split('.').pop() || '').toUpperCase();

            var imgDiv = document.createElement('div');
            imgDiv.className = 'sg-thumb__img';

            // Type badge
            var badge = document.createElement('span');
            badge.className = 'sg-thumb__badge';
            badge.textContent = ext;
            badge.style.background = SendIcons.BADGE_COLORS[type] || 'rgba(0,0,0,0.6)';
            imgDiv.appendChild(badge);

            // Thumbnail strategy:
            // - Images: ALWAYS use original file (full resolution, no pixelation)
            // - Other types: use pre-generated thumbnail if available, else icon
            if (type === 'image') {
                try {
                    var bytes = await entry.entry.async('arraybuffer');
                    var mime = FileTypeDetect.getImageMime(entry.name) || 'image/jpeg';
                    var blob = new Blob([bytes], { type: mime });
                    var url = URL.createObjectURL(blob);
                    this._thumbUrls.push(url);
                    imgDiv.style.backgroundImage = 'url(' + url + ')';
                } catch (_) {
                    imgDiv.innerHTML += SendIcons.TYPE_ICONS.image;
                }
            } else {
                // Non-image: try pre-generated thumbnail from manifest
                var thumbPath = this._thumbMap[entry.path];
                var thumbZipEntry = thumbPath
                    ? this.zipTree.find(function(e) { return e.path === thumbPath; })
                    : null;

                if (thumbZipEntry) {
                    try {
                        var thumbBytes = await thumbZipEntry.entry.async('arraybuffer');
                        var thumbBlob = new Blob([thumbBytes], { type: 'image/jpeg' });
                        var thumbUrl = URL.createObjectURL(thumbBlob);
                        this._thumbUrls.push(thumbUrl);
                        imgDiv.style.backgroundImage = 'url(' + thumbUrl + ')';
                    } catch (_) {
                        imgDiv.innerHTML += (SendIcons.TYPE_ICONS[type] || SendIcons.TYPE_ICONS.other);
                    }
                } else if (type === 'markdown') {
                    // Markdown text preview
                    try {
                        var text = await entry.entry.async('string');
                        var preview = document.createElement('div');
                        preview.className = 'sg-thumb__md-preview';
                        var clean = text
                            .replace(/^#+\s*/gm, '')
                            .replace(/[*_`~\[\]]/g, '')
                            .replace(/^\|.*\|$/gm, '')
                            .replace(/^[-:|]+$/gm, '')
                            .replace(/!\[.*?\]\(.*?\)/g, '')
                            .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
                            .replace(/\n{2,}/g, '\n')
                            .trim();
                        preview.textContent = clean.substring(0, 200);
                        imgDiv.appendChild(preview);
                    } catch (_) {
                        imgDiv.innerHTML += (SendIcons.TYPE_ICONS[type] || SendIcons.TYPE_ICONS.other);
                    }
                } else {
                    imgDiv.innerHTML += (SendIcons.TYPE_ICONS[type] || SendIcons.TYPE_ICONS.other);
                }
            }

            var label = document.createElement('div');
            label.className = 'sg-thumb__label';
            label.textContent = entry.name;

            card.appendChild(imgDiv);
            card.appendChild(label);
            grid.appendChild(card);

            var self = this;
            (function(idx) {
                card.addEventListener('click', function() { self._openLightbox(idx); });
            })(i);
        }
    };
})();
