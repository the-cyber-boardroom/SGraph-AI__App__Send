/* =============================================================================
   SGraph Send — Upload Component
   v0.2.13 — Surgical overlay on v0.2.12

   Changes:
     - Phase 2: PDF thumbnails via pdf.js (first page rendered to canvas)
     - Phase 2: Markdown thumbnails via MarkdownParser + SVG foreignObject → canvas
     - "Generating thumbnails" progress indicator during zip creation
     - Content-hashed _preview folder: _preview.{hash} with enriched manifest
     - Video frame capture thumbnails (first frame)
     - Audio metadata extraction (duration)
     - SVG pass-through (already handled in v0.2.12, confirmed)
     - Tick alignment fix for upload progress rows

   Loads AFTER v0.2.12 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0213] SendUpload not found — skipping');
    return;
}

// ─── Constants ──────────────────────────────────────────────────────────────
var THUMB_MAX_WIDTH  = 200;
var THUMB_HEIGHT     = 260;   // Max height for non-image thumbnails (MD, PDF)
var THUMB_QUALITY    = 0.75;
var THUMB_FORMAT     = 'image/jpeg';

var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
var PDF_EXTS   = ['pdf'];
var MD_EXTS    = ['md', 'markdown'];
var VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
var AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];

function getExt(name) { return (name || '').split('.').pop().toLowerCase(); }

function getFileCategory(name) {
    var ext = getExt(name);
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (PDF_EXTS.indexOf(ext)   !== -1) return 'pdf';
    if (MD_EXTS.indexOf(ext)    !== -1) return 'markdown';
    if (VIDEO_EXTS.indexOf(ext) !== -1) return 'video';
    if (AUDIO_EXTS.indexOf(ext) !== -1) return 'audio';
    return 'other';
}

function fileId(index) {
    var num = String(index + 1);
    while (num.length < 3) num = '0' + num;
    return 'file-' + num;
}

// ─── PDF.js lazy loader ─────────────────────────────────────────────────────
var _pdfJsLoaded = false;
var _pdfJsLoading = null;

function loadPdfJs() {
    if (_pdfJsLoaded && window.pdfjsLib) return Promise.resolve();
    if (_pdfJsLoading) return _pdfJsLoading;

    _pdfJsLoading = new Promise(function(resolve, reject) {
        // Check if already available (vendored)
        if (window.pdfjsLib) {
            _pdfJsLoaded = true;
            resolve();
            return;
        }

        // Try to load from vendor path first
        var vendorPath = '../_common/js/vendor/pdf.min.mjs';
        var script = document.createElement('script');
        script.src = vendorPath;
        script.onload = function() {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../_common/js/vendor/pdf.worker.min.mjs';
                _pdfJsLoaded = true;
                resolve();
            } else {
                // Vendored not found, try CDN as fallback for development
                var cdnScript = document.createElement('script');
                cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
                cdnScript.type = 'module';
                cdnScript.onload = function() {
                    if (window.pdfjsLib) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
                        _pdfJsLoaded = true;
                        resolve();
                    } else {
                        reject(new Error('pdf.js loaded but pdfjsLib not available'));
                    }
                };
                cdnScript.onerror = function() {
                    reject(new Error('Failed to load pdf.js from CDN'));
                };
                document.head.appendChild(cdnScript);
            }
        };
        script.onerror = function() {
            // Vendored script not found — try legacy-style script tag with CDN
            var cdnScript = document.createElement('script');
            cdnScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            cdnScript.onload = function() {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    _pdfJsLoaded = true;
                    resolve();
                } else {
                    reject(new Error('pdf.js loaded but pdfjsLib not available'));
                }
            };
            cdnScript.onerror = function() {
                reject(new Error('Failed to load pdf.js'));
            };
            document.head.appendChild(cdnScript);
        };
        document.head.appendChild(script);
    });

    return _pdfJsLoading;
}

// ─── PDF thumbnail: render page 1 to canvas → JPEG ─────────────────────────
function generatePdfThumbnail(file) {
    return loadPdfJs().then(function() {
        return file.arrayBuffer();
    }).then(function(buf) {
        var loadingTask = window.pdfjsLib.getDocument({ data: buf });
        return loadingTask.promise;
    }).then(function(pdfDoc) {
        var pageCount = pdfDoc.numPages;
        return pdfDoc.getPage(1).then(function(page) {
            // Scale to fit THUMB_MAX_WIDTH
            var viewport = page.getViewport({ scale: 1.0 });
            var scale = THUMB_MAX_WIDTH / viewport.width;
            var scaledViewport = page.getViewport({ scale: scale });

            var canvas = document.createElement('canvas');
            canvas.width  = Math.round(scaledViewport.width);
            canvas.height = Math.round(scaledViewport.height);
            var ctx = canvas.getContext('2d');

            // White background (PDFs can have transparent areas)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            return page.render({ canvasContext: ctx, viewport: scaledViewport }).promise.then(function() {
                return new Promise(function(resolve, reject) {
                    canvas.toBlob(function(blob) {
                        if (!blob) {
                            reject(new Error('PDF canvas toBlob failed'));
                            return;
                        }
                        blob.arrayBuffer().then(function(thumbBuf) {
                            resolve({
                                buffer:     thumbBuf,
                                width:      canvas.width,
                                height:     canvas.height,
                                format:     THUMB_FORMAT,
                                pageCount:  pageCount
                            });
                        }).catch(reject);
                    }, THUMB_FORMAT, THUMB_QUALITY);
                });
            });
        });
    });
}

// ─── Markdown thumbnail: render → SVG foreignObject → canvas → JPEG ─────────
function generateMarkdownThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
            var text = reader.result || '';

            // Parse markdown using existing MarkdownParser
            var html;
            if (typeof MarkdownParser !== 'undefined' && MarkdownParser.parse) {
                html = MarkdownParser.parse(text);
            } else {
                // Fallback: basic text rendering
                html = '<pre style="margin:0;font-size:11px;line-height:1.4;color:#333;white-space:pre-wrap;word-break:break-word;">' +
                    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
            }

            // Build a self-contained HTML document for the foreignObject
            var styledHtml =
                '<div xmlns="http://www.w3.org/1999/xhtml" style="' +
                    'width:' + THUMB_MAX_WIDTH + 'px;' +
                    'height:' + THUMB_HEIGHT + 'px;' +
                    'overflow:hidden;' +
                    'background:#ffffff;' +
                    'padding:12px 14px;' +
                    'font-family:system-ui,-apple-system,sans-serif;' +
                    'font-size:8px;' +
                    'line-height:1.4;' +
                    'color:#1a1a2e;' +
                    'box-sizing:border-box;' +
                '">' +
                    '<style xmlns="http://www.w3.org/1999/xhtml">' +
                        'h1{font-size:13px;margin:0 0 4px 0;color:#111;border-bottom:1px solid #eee;padding-bottom:3px;}' +
                        'h2{font-size:11px;margin:6px 0 3px 0;color:#111;}' +
                        'h3{font-size:10px;margin:5px 0 2px 0;color:#222;}' +
                        'p{margin:3px 0;font-size:8px;}' +
                        'strong{color:#111;}' +
                        'pre{background:#f5f5f5;padding:4px;border-radius:2px;font-size:7px;overflow:hidden;}' +
                        'code{font-size:7px;color:#d63384;}' +
                        'pre code{color:#333;}' +
                        'blockquote{border-left:2px solid #ddd;padding-left:6px;margin:3px 0;color:#555;}' +
                        'hr{border:none;border-top:1px solid #e0e0e0;margin:4px 0;}' +
                        'table{border-collapse:collapse;width:100%;font-size:7px;}' +
                        'th,td{border:1px solid #ddd;padding:2px 4px;text-align:left;}' +
                        'th{background:#f5f5f5;font-weight:600;}' +
                        'a{color:#0969da;text-decoration:none;}' +
                        'ul,ol{margin:3px 0;padding-left:14px;}' +
                        'li{margin:1px 0;}' +
                    '</style>' +
                    html +
                '</div>';

            var svgData =
                '<svg xmlns="http://www.w3.org/2000/svg" width="' + THUMB_MAX_WIDTH + '" height="' + THUMB_HEIGHT + '">' +
                    '<foreignObject width="100%" height="100%">' +
                        styledHtml +
                    '</foreignObject>' +
                '</svg>';

            var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            var url = URL.createObjectURL(svgBlob);
            var img = new Image();

            img.onload = function() {
                var canvas = document.createElement('canvas');
                canvas.width  = THUMB_MAX_WIDTH;
                canvas.height = THUMB_HEIGHT;
                var ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                URL.revokeObjectURL(url);

                canvas.toBlob(function(blob) {
                    if (!blob) {
                        reject(new Error('Markdown canvas toBlob failed'));
                        return;
                    }
                    blob.arrayBuffer().then(function(thumbBuf) {
                        resolve({
                            buffer:   thumbBuf,
                            width:    THUMB_MAX_WIDTH,
                            height:   THUMB_HEIGHT,
                            format:   THUMB_FORMAT,
                            textLen:  text.length
                        });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };

            img.onerror = function() {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to render markdown SVG to image'));
            };

            img.src = url;
        };
        reader.onerror = function() { reject(new Error('Failed to read markdown file')); };
        reader.readAsText(file);
    });
}

// ─── Video thumbnail: capture first frame → JPEG ────────────────────────────
function generateVideoThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;

        // Timeout: if video doesn't load in 10s, skip
        var timeout = setTimeout(function() {
            URL.revokeObjectURL(url);
            reject(new Error('Video thumbnail timeout'));
        }, 10000);

        video.onloadeddata = function() {
            // Seek to 1 second (or 0 if shorter)
            video.currentTime = Math.min(1, video.duration / 4);
        };

        video.onseeked = function() {
            clearTimeout(timeout);
            var origW = video.videoWidth;
            var origH = video.videoHeight;
            var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
            var thumbW = Math.round(origW * scale);
            var thumbH = Math.round(origH * scale);

            var canvas = document.createElement('canvas');
            canvas.width  = thumbW;
            canvas.height = thumbH;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, thumbW, thumbH);

            URL.revokeObjectURL(url);

            canvas.toBlob(function(blob) {
                if (!blob) {
                    reject(new Error('Video canvas toBlob failed'));
                    return;
                }
                blob.arrayBuffer().then(function(buf) {
                    resolve({
                        buffer:    buf,
                        width:     thumbW,
                        height:    thumbH,
                        format:    THUMB_FORMAT,
                        duration:  video.duration,
                        videoW:    origW,
                        videoH:    origH
                    });
                }).catch(reject);
            }, THUMB_FORMAT, THUMB_QUALITY);
        };

        video.onerror = function() {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video: ' + file.name));
        };

        video.src = url;
    });
}

// ─── Audio metadata extraction ──────────────────────────────────────────────
function extractAudioMetadata(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file);
        var audio = document.createElement('audio');
        audio.preload = 'metadata';

        var timeout = setTimeout(function() {
            URL.revokeObjectURL(url);
            reject(new Error('Audio metadata timeout'));
        }, 5000);

        audio.onloadedmetadata = function() {
            clearTimeout(timeout);
            var duration = audio.duration;
            URL.revokeObjectURL(url);
            resolve({
                duration: duration,
                durationFormatted: formatDuration(duration)
            });
        };

        audio.onerror = function() {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load audio: ' + file.name));
        };

        audio.src = url;
    });
}

function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

// ─── Content hash: SHA-256 of file contents → 8-char hex ────────────────────
function computeFileHash(file) {
    return file.arrayBuffer().then(function(buf) {
        return crypto.subtle.digest('SHA-256', buf);
    }).then(function(hashBuf) {
        var arr = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
            hex += ('0' + arr[i].toString(16)).slice(-2);
        }
        return hex;
    });
}

function computeFolderHash(fileHashes) {
    // Hash of all hashes concatenated → deterministic folder hash
    var combined = fileHashes.join('');
    var encoder = new TextEncoder();
    var data = encoder.encode(combined);
    return crypto.subtle.digest('SHA-256', data).then(function(hashBuf) {
        var arr = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < 8; i++) {
            hex += ('0' + arr[i].toString(16)).slice(-2);
        }
        return hex; // 16-char hex (8 bytes)
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Override: _startFolderZip — add progress indicators + content hash
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_startFolderZip = SendUpload.prototype._startFolderZip;

SendUpload.prototype._startFolderZip = async function() {
    var levelSelect      = this.querySelector('#folder-compression');
    var includeEmptyChk  = this.querySelector('#folder-include-empty');
    var includeHiddenChk = this.querySelector('#folder-include-hidden');

    this._folderOptions = {
        level:         levelSelect      ? parseInt(levelSelect.value, 10) : 4,
        includeEmpty:  includeEmptyChk  ? includeEmptyChk.checked : false,
        includeHidden: includeHiddenChk ? includeHiddenChk.checked : false
    };

    var totalSize = this._folderScan.totalSize;
    if (totalSize > SendUpload.MAX_FILE_SIZE) {
        this.errorMessage = this.t('upload.folder.error_too_large', {
            limit: this.formatBytes(SendUpload.MAX_FILE_SIZE)
        });
        this.state = 'error'; this.render(); this.setupEventListeners();
        return;
    }

    try {
        this.state = 'zipping'; this.render();

        // Lazy-load JSZip
        await this._loadJSZip();

        var opts    = this._folderOptions;
        var entries = this._folderScan.entries.filter(function(e) {
            if (!opts.includeHidden && e.name.startsWith('.')) return false;
            if (e.isDir && !opts.includeEmpty) return false;
            return true;
        });

        var zip = new JSZip();

        // Add original files
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isDir) {
                zip.folder(entry.path);
            } else {
                var buffer = await entry.file.arrayBuffer();
                zip.file(entry.path, buffer);
            }
        }

        // ═══ v0.2.13: Generate _preview.{hash}/ folder with all thumbnails ═══
        await this._v0213_addPreviewToZip(zip, entries);

        var compression = opts.level === 0 ? 'STORE' : 'DEFLATE';
        var zipBlob = await zip.generateAsync({
            type:               'blob',
            compression:        compression,
            compressionOptions: { level: opts.level }
        });

        this.selectedFile = new File(
            [zipBlob],
            this._folderName + '.zip',
            { type: 'application/zip' }
        );

        this._folderScan = null;
        this.state = 'idle';
        this.startUpload();
    } catch (err) {
        this.errorMessage = err.message || this.t('upload.folder.error_zip_failed');
        this.state = 'error'; this.render(); this.setupEventListeners();
    }
};

// ─── Core: generate _preview.{hash}/ folder ─────────────────────────────────
SendUpload.prototype._v0213_addPreviewToZip = async function(zip, entries) {
    var files = entries.filter(function(e) { return !e.isDir && e.file; });
    if (files.length === 0) return;

    var self = this;

    // Show thumbnail progress
    this._v0213_updateProgress('Computing file hashes...', 0, files.length);

    // Step 1: Compute file hashes for content-addressed folder name
    var fileHashes = [];
    for (var h = 0; h < files.length; h++) {
        try {
            var hash = await computeFileHash(files[h].file);
            fileHashes.push(hash);
        } catch (e) {
            fileHashes.push('0000000000000000');
        }
    }
    var folderHash = await computeFolderHash(fileHashes);
    var previewDir = '_preview.' + folderHash;

    // Step 2: Check if PDF.js is needed and preload it
    var hasPdfs = files.some(function(e) { return getFileCategory(e.name) === 'pdf'; });
    if (hasPdfs) {
        this._v0213_updateProgress('Loading PDF renderer...', 0, files.length);
        try {
            await loadPdfJs();
        } catch (e) {
            console.warn('[v0213] pdf.js not available — PDF thumbnails will be skipped:', e.message);
            hasPdfs = false;
        }
    }

    // Step 3: Generate thumbnails + metadata for each file
    var manifest = {
        version:             '0.2',
        preview_enabled:     true,
        generated_at:        new Date().toISOString(),
        folder_hash:         folderHash,
        thumbnail_max_width: THUMB_MAX_WIDTH,
        thumbnail_format:    THUMB_FORMAT,
        thumbnail_quality:   THUMB_QUALITY,
        total_files:         files.length,
        file_hashes:         {},
        files:               []
    };

    var thumbnailsGenerated = 0;
    var startTime = performance.now();

    for (var i = 0; i < files.length; i++) {
        var entry    = files[i];
        var id       = fileId(i);
        var category = getFileCategory(entry.name);
        var ext      = getExt(entry.name);

        this._v0213_updateProgress('Generating thumbnails...', i, files.length);

        // Base metadata
        var meta = {
            id:        id,
            name:      entry.name,
            path:      entry.path,
            type:      category,
            extension: ext,
            size:      entry.file.size,
            mime:      entry.file.type || 'application/octet-stream',
            hash:      fileHashes[i]
        };

        // Manifest entry
        var manifestEntry = {
            id:        id,
            name:      entry.name,
            path:      entry.path,
            type:      category,
            size:      entry.file.size,
            hash:      fileHashes[i],
            thumbnail: null,
            metadata:  previewDir + '/metadata/' + id + '.meta.json'
        };

        manifest.file_hashes[id] = fileHashes[i];

        // ── Image thumbnails (from v0.2.12, enhanced) ──
        if (category === 'image') {
            try {
                var imgResult = await self._v0212_generateImageThumbnail(entry.file);
                var thumbExt = ext === 'svg' ? 'svg' : 'jpg';
                var thumbPath = previewDir + '/thumbnails/' + id + '.thumb.' + thumbExt;
                zip.file(thumbPath, imgResult.buffer);

                meta.dimensions = { width: imgResult.originalWidth, height: imgResult.originalHeight };
                meta.thumbnail  = { path: thumbPath, width: imgResult.width, height: imgResult.height, format: imgResult.format, size: imgResult.buffer.byteLength };
                manifestEntry.thumbnail = thumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] Image thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── PDF thumbnails (Phase 2 — NEW) ──
        else if (category === 'pdf' && hasPdfs) {
            try {
                var pdfResult = await generatePdfThumbnail(entry.file);
                var pdfThumbPath = previewDir + '/thumbnails/' + id + '.thumb.jpg';
                zip.file(pdfThumbPath, pdfResult.buffer);

                meta.pageCount = pdfResult.pageCount;
                meta.thumbnail = { path: pdfThumbPath, width: pdfResult.width, height: pdfResult.height, format: THUMB_FORMAT, size: pdfResult.buffer.byteLength };
                manifestEntry.thumbnail = pdfThumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] PDF thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── Markdown thumbnails (Phase 2 — NEW) ──
        else if (category === 'markdown') {
            try {
                var mdResult = await generateMarkdownThumbnail(entry.file);
                var mdThumbPath = previewDir + '/thumbnails/' + id + '.thumb.jpg';
                zip.file(mdThumbPath, mdResult.buffer);

                meta.textLength = mdResult.textLen;
                meta.thumbnail  = { path: mdThumbPath, width: mdResult.width, height: mdResult.height, format: THUMB_FORMAT, size: mdResult.buffer.byteLength };
                manifestEntry.thumbnail = mdThumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] Markdown thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── Video thumbnails (first frame) ──
        else if (category === 'video') {
            try {
                var vidResult = await generateVideoThumbnail(entry.file);
                var vidThumbPath = previewDir + '/thumbnails/' + id + '.thumb.jpg';
                zip.file(vidThumbPath, vidResult.buffer);

                meta.duration = vidResult.duration;
                meta.durationFormatted = formatDuration(vidResult.duration);
                meta.dimensions = { width: vidResult.videoW, height: vidResult.videoH };
                meta.thumbnail  = { path: vidThumbPath, width: vidResult.width, height: vidResult.height, format: THUMB_FORMAT, size: vidResult.buffer.byteLength };
                manifestEntry.thumbnail = vidThumbPath;
                thumbnailsGenerated++;
            } catch (e) {
                console.warn('[v0213] Video thumbnail failed for ' + entry.name + ':', e.message);
            }
        }

        // ── Audio metadata (duration — no visual thumbnail yet) ──
        else if (category === 'audio') {
            try {
                var audioMeta = await extractAudioMetadata(entry.file);
                meta.duration = audioMeta.duration;
                meta.durationFormatted = audioMeta.durationFormatted;
            } catch (e) {
                console.warn('[v0213] Audio metadata failed for ' + entry.name + ':', e.message);
            }
        }

        // Write metadata JSON
        zip.file(previewDir + '/metadata/' + id + '.meta.json', JSON.stringify(meta, null, 2));
        manifest.files.push(manifestEntry);
    }

    var elapsed = Math.round(performance.now() - startTime);

    // Count files by type
    var typeCounts = {};
    manifest.files.forEach(function(e) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    });
    manifest.type_counts = typeCounts;
    manifest.thumbnails_generated = thumbnailsGenerated;
    manifest.generation_time_ms   = elapsed;

    // Write manifest
    zip.file(previewDir + '/_manifest.json', JSON.stringify(manifest, null, 2));

    this._v0213_updateProgress('Thumbnails ready', files.length, files.length);

    console.log('[v0213] Preview generated in ' + elapsed + 'ms: ' +
        thumbnailsGenerated + ' thumbnails for ' + files.length + ' files → ' + previewDir);
};

// ─── Helper: access v0.2.12's image thumbnail generator ─────────────────────
// Reuse the existing generateImageThumbnail from v0.2.12's scope
// We need to expose it. If not available, re-implement inline.
if (!SendUpload.prototype._v0212_generateImageThumbnail) {
    SendUpload.prototype._v0212_generateImageThumbnail = function(file) {
        return new Promise(function(resolve, reject) {
            var ext = getExt(file.name);
            if (ext === 'svg') {
                file.arrayBuffer().then(function(buf) {
                    resolve({ buffer: buf, width: 0, height: 0, originalWidth: 0, originalHeight: 0, format: 'image/svg+xml' });
                }).catch(reject);
                return;
            }

            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function() {
                var origW = img.naturalWidth;
                var origH = img.naturalHeight;
                var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
                var thumbW = Math.round(origW * scale);
                var thumbH = Math.round(origH * scale);

                var canvas = document.createElement('canvas');
                canvas.width = thumbW; canvas.height = thumbH;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, thumbW, thumbH);

                canvas.toBlob(function(blob) {
                    URL.revokeObjectURL(url);
                    if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
                    blob.arrayBuffer().then(function(buf) {
                        resolve({ buffer: buf, width: thumbW, height: thumbH, originalWidth: origW, originalHeight: origH, format: THUMB_FORMAT });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };
            img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
            img.src = url;
        });
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Progress indicator for thumbnail generation
// ═══════════════════════════════════════════════════════════════════════════

SendUpload.prototype._v0213_updateProgress = function(label, current, total) {
    var el = this.querySelector('#v0213-thumb-progress');
    if (!el) {
        // Inject progress element into the zipping state UI
        var container = this.querySelector('.v023-processing') || this.querySelector('.step-content');
        if (container) {
            var div = document.createElement('div');
            div.id = 'v0213-thumb-progress';
            div.className = 'v0213-thumb-progress';
            container.appendChild(div);
        } else {
            return;
        }
        el = this.querySelector('#v0213-thumb-progress');
        if (!el) return;
    }

    var pct = total > 0 ? Math.round((current / total) * 100) : 0;
    el.innerHTML =
        '<div class="v0213-tp__label">' + label + '</div>' +
        '<div class="v0213-tp__bar">' +
            '<div class="v0213-tp__fill" style="width:' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v0213-tp__count">' + current + ' / ' + total + '</div>';
};

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0213-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0213-styles';
    style.textContent = '\
        /* ── Thumbnail generation progress ── */\
        .v0213-thumb-progress {\
            margin-top: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem);\
            background: rgba(77, 208, 225, 0.06);\
            border: 1px solid rgba(77, 208, 225, 0.12);\
            border-radius: var(--radius-md, 8px);\
        }\
        .v0213-tp__label {\
            font-size: 0.8rem;\
            color: rgba(255,255,255,0.7);\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v0213-tp__bar {\
            height: 4px;\
            background: rgba(255,255,255,0.06);\
            border-radius: 2px;\
            overflow: hidden;\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v0213-tp__fill {\
            height: 100%;\
            background: var(--color-primary, #4DD0E1);\
            border-radius: 2px;\
            transition: width 0.2s ease;\
        }\
        .v0213-tp__count {\
            font-size: 0.7rem;\
            color: rgba(255,255,255,0.4);\
            text-align: right;\
            font-family: var(--font-mono, monospace);\
        }\
        \
        /* ── Tick alignment fix for upload progress rows ── */\
        .v028-live-timing__row {\
            display: flex !important;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v028-live-timing__label {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-live-timing__check {\
            flex-shrink: 0;\
            width: 16px;\
            text-align: center;\
        }\
        .v028-live-timing__ms {\
            flex-shrink: 0;\
            min-width: 70px;\
            text-align: right;\
            margin-left: 0 !important;\
        }\
    ';
    document.head.appendChild(style);
})();

// NOTE: Gallery delivery card language ("Gallery mode") and dot-file filtering
// are now handled at the source in v0.2.3 (detectDeliveryOptions) and v0.2.12
// (_v0212_renderGalleryPreview / _v0212_loadGalleryThumbnails).

console.log('[send-upload-v0213] Phase 2: PDF + markdown + video thumbnails, content-hashed preview, progress, gallery mode labels');

})();
