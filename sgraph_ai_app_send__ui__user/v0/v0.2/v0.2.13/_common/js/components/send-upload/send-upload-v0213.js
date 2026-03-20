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
var THUMB_MAX_WIDTH  = 400;
var THUMB_HEIGHT     = 520;   // Max height for non-image thumbnails (MD, PDF)
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
// Uses non-module CDN (pdf.min.js, not .mjs) to reliably set window.pdfjsLib.
// ES module versions don't expose globals on window and fail silently.
var _pdfJsLoaded = false;
var _pdfJsLoading = null;

// CDN URLs — non-module versions that set window.pdfjsLib
var PDF_JS_CDNS = [
    { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
    { js: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
];

function loadPdfJs() {
    if (_pdfJsLoaded && window.pdfjsLib) return Promise.resolve();
    if (_pdfJsLoading) return _pdfJsLoading;

    _pdfJsLoading = new Promise(function(resolve, reject) {
        // Check if already available
        if (window.pdfjsLib) {
            _pdfJsLoaded = true;
            resolve();
            return;
        }

        // Try vendor path first (non-module)
        var vendorPath = '../_common/js/vendor/pdf.min.js';

        function tryLoad(urls, idx) {
            if (idx >= urls.length) {
                reject(new Error('Failed to load pdf.js from all sources'));
                return;
            }
            var entry = urls[idx];
            var script = document.createElement('script');
            script.src = entry.js;
            script.onload = function() {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = entry.worker;
                    _pdfJsLoaded = true;
                    console.log('[v0213] pdf.js loaded from: ' + entry.js);
                    resolve();
                } else {
                    console.warn('[v0213] pdf.js loaded but pdfjsLib not on window, trying next...');
                    tryLoad(urls, idx + 1);
                }
            };
            script.onerror = function() {
                console.warn('[v0213] Failed to load pdf.js from: ' + entry.js);
                tryLoad(urls, idx + 1);
            };
            document.head.appendChild(script);
        }

        // Build URL list: vendor first, then CDN fallbacks
        var urls = [
            { js: vendorPath, worker: '../_common/js/vendor/pdf.worker.min.js' }
        ].concat(PDF_JS_CDNS);

        tryLoad(urls, 0);
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

// ─── Markdown thumbnail: render text directly to canvas → JPEG ──────────────
// Uses direct canvas text drawing — reliable across all browsers
// (SVG foreignObject approach is fragile due to security/tainted canvas)
function generateMarkdownThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
            var text = reader.result || '';

            var canvas = document.createElement('canvas');
            canvas.width  = THUMB_MAX_WIDTH;
            canvas.height = THUMB_HEIGHT;
            var ctx = canvas.getContext('2d');

            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Parse markdown into lines with basic formatting
            var lines = text.split('\n');
            var y = 14;
            var padding = 12;
            var maxWidth = THUMB_MAX_WIDTH - (padding * 2);
            var lineHeight;
            var maxY = THUMB_HEIGHT - 10;

            for (var i = 0; i < lines.length && y < maxY; i++) {
                var line = lines[i];
                var trimmed = line.trim();

                if (!trimmed) {
                    y += 6; // Empty line spacing
                    continue;
                }

                // Heading detection
                if (trimmed.match(/^#{1,2}\s/)) {
                    var headingText = trimmed.replace(/^#+\s*/, '');
                    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#111111';
                    lineHeight = 13;

                    // Draw heading underline for H1
                    if (trimmed.match(/^#\s/)) {
                        var wrappedH = wrapText(ctx, headingText, maxWidth);
                        for (var wh = 0; wh < wrappedH.length && y < maxY; wh++) {
                            ctx.fillText(wrappedH[wh], padding, y);
                            y += lineHeight;
                        }
                        ctx.strokeStyle = '#e0e0e0';
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(padding, y - 2);
                        ctx.lineTo(THUMB_MAX_WIDTH - padding, y - 2);
                        ctx.stroke();
                        y += 4;
                    } else {
                        var wrappedH2 = wrapText(ctx, headingText, maxWidth);
                        for (var wh2 = 0; wh2 < wrappedH2.length && y < maxY; wh2++) {
                            ctx.fillText(wrappedH2[wh2], padding, y);
                            y += lineHeight;
                        }
                        y += 3;
                    }
                }
                else if (trimmed.match(/^#{3,6}\s/)) {
                    var h3Text = trimmed.replace(/^#+\s*/, '');
                    ctx.font = 'bold 8px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#222222';
                    lineHeight = 11;
                    var wrappedH3 = wrapText(ctx, h3Text, maxWidth);
                    for (var wh3 = 0; wh3 < wrappedH3.length && y < maxY; wh3++) {
                        ctx.fillText(wrappedH3[wh3], padding, y);
                        y += lineHeight;
                    }
                    y += 2;
                }
                // Code block
                else if (trimmed.match(/^```/)) {
                    ctx.fillStyle = '#f5f5f5';
                    var codeY = y - 8;
                    var codeLines = 0;
                    i++;
                    var codeStart = y;
                    ctx.font = '7px monospace';
                    while (i < lines.length && !lines[i].trim().match(/^```/) && y < maxY) {
                        codeLines++;
                        y += 9;
                        i++;
                    }
                    // Draw code block background
                    if (codeLines > 0) {
                        ctx.fillStyle = '#f5f5f5';
                        ctx.fillRect(padding - 2, codeY, maxWidth + 4, y - codeY + 2);
                        // Re-draw code text
                        ctx.fillStyle = '#333333';
                        var cy = codeStart;
                        for (var ci = 0; ci < codeLines && ci < 8; ci++) {
                            var codeLine = lines[i - codeLines + ci] || '';
                            ctx.fillText(codeLine.substring(0, 40), padding + 2, cy);
                            cy += 9;
                        }
                    }
                    y += 3;
                }
                // Blockquote
                else if (trimmed.match(/^>/)) {
                    var quoteText = trimmed.replace(/^>\s*/, '');
                    ctx.font = 'italic 7px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#555555';
                    lineHeight = 10;
                    // Draw quote bar
                    ctx.fillStyle = '#dddddd';
                    ctx.fillRect(padding, y - 8, 2, 12);
                    ctx.fillStyle = '#555555';
                    var wrappedQ = wrapText(ctx, quoteText, maxWidth - 10);
                    for (var wq = 0; wq < wrappedQ.length && y < maxY; wq++) {
                        ctx.fillText(wrappedQ[wq], padding + 8, y);
                        y += lineHeight;
                    }
                    y += 2;
                }
                // Horizontal rule
                else if (trimmed.match(/^[-*_]{3,}$/)) {
                    ctx.strokeStyle = '#e0e0e0';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(padding, y);
                    ctx.lineTo(THUMB_MAX_WIDTH - padding, y);
                    ctx.stroke();
                    y += 6;
                }
                // List items
                else if (trimmed.match(/^[-*+]\s/) || trimmed.match(/^\d+\.\s/)) {
                    var listText = trimmed.replace(/^[-*+]\s*/, '').replace(/^\d+\.\s*/, '');
                    ctx.font = '7px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#1a1a2e';
                    lineHeight = 10;
                    ctx.fillText('\u2022', padding, y);
                    var wrappedL = wrapText(ctx, listText, maxWidth - 10);
                    for (var wl = 0; wl < wrappedL.length && y < maxY; wl++) {
                        ctx.fillText(wrappedL[wl], padding + 10, y);
                        y += lineHeight;
                    }
                }
                // Regular text
                else {
                    // Strip inline markdown formatting
                    var cleanText = trimmed
                        .replace(/\*\*([^*]+)\*\*/g, '$1')
                        .replace(/__([^_]+)__/g, '$1')
                        .replace(/\*([^*]+)\*/g, '$1')
                        .replace(/_([^_]+)_/g, '$1')
                        .replace(/`([^`]+)`/g, '$1')
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

                    ctx.font = '7px system-ui, -apple-system, sans-serif';
                    ctx.fillStyle = '#1a1a2e';
                    lineHeight = 10;
                    var wrapped = wrapText(ctx, cleanText, maxWidth);
                    for (var w = 0; w < wrapped.length && y < maxY; w++) {
                        ctx.fillText(wrapped[w], padding, y);
                        y += lineHeight;
                    }
                    y += 2;
                }
            }

            // Fade-out at bottom if content was truncated
            if (y >= maxY) {
                var gradient = ctx.createLinearGradient(0, THUMB_HEIGHT - 30, 0, THUMB_HEIGHT);
                gradient.addColorStop(0, 'rgba(255,255,255,0)');
                gradient.addColorStop(1, 'rgba(255,255,255,1)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, THUMB_HEIGHT - 30, THUMB_MAX_WIDTH, 30);
            }

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
        reader.onerror = function() { reject(new Error('Failed to read markdown file')); };
        reader.readAsText(file);
    });
}

// ─── Helper: wrap text to fit within maxWidth ───────────────────────────────
function wrapText(ctx, text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var currentLine = '';

    for (var i = 0; i < words.length; i++) {
        var testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
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
// Override: _v023_compressFolder — replace v0.2.12's preview with enhanced version
//
// NOTE: v0.2.3 replaced _startFolderZip with a no-op and uses
// _v023_compressFolder as the actual zip path (called from _v023_startProcessing).
// We must override _v023_compressFolder (not _startFolderZip) to inject
// PDF/MD/video thumbnail generation.
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_compressFolder = SendUpload.prototype._v023_compressFolder;

SendUpload.prototype._v023_compressFolder = async function() {
    await this._loadJSZip();

    var zip     = new JSZip();
    var entries = this._folderScan.entries.filter(function(e) { return !e.isDir; });
    var opts    = this._folderOptions || {};

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!opts.includeHidden && entry.name.startsWith('.')) continue;
        if (entry.file) {
            zip.file(entry.path, entry.file, {
                compression: (opts.level || 4) > 0 ? 'DEFLATE' : 'STORE',
                compressionOptions: { level: opts.level || 4 }
            });
        }
    }

    // ═══ v0.2.13: Generate _preview/ folder with PDF + MD + video thumbnails ═══
    await this._v0213_addPreviewToZip(zip, entries);

    var blob    = await zip.generateAsync({ type: 'blob' });
    var zipName = (this._folderName || 'folder') + '.zip';
    this.selectedFile = new File([blob], zipName, { type: 'application/zip' });
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
    var previewDir = '_preview';  // Use simple name for compatibility with gallery renderer

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
