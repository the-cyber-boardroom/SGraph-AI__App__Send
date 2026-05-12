/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Thumbnails
   v0.3.0 — Client-side thumbnail generation for gallery preview

   Generates thumbnails for: images (canvas resize), PDFs (pdf.js first page),
   markdown (canvas text render), video (first frame capture).
   Also extracts audio duration metadata.
   All processing is client-side — nothing leaves the browser unencrypted.
   ═══════════════════════════════════════════════════════════════════════════════ */

var UploadThumbnails = (function() {
    'use strict';

    var THUMB_MAX_WIDTH = 400;
    var THUMB_HEIGHT    = 520;
    var THUMB_QUALITY   = 0.75;
    var THUMB_FORMAT    = 'image/jpeg';

    var IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','bmp','svg'];
    var PDF_EXTS   = ['pdf'];
    var MD_EXTS    = ['md','markdown'];
    var VIDEO_EXTS = ['mp4','webm','mov','avi','mkv'];
    var AUDIO_EXTS = ['mp3','wav','ogg','flac','aac','m4a'];

    function getExt(name)  { return (name || '').split('.').pop().toLowerCase(); }
    function fileId(index) { var n = String(index+1); while(n.length<3) n='0'+n; return 'file-'+n; }

    function getFileCategory(name) {
        var ext = getExt(name);
        if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
        if (PDF_EXTS.indexOf(ext)   !== -1) return 'pdf';
        if (MD_EXTS.indexOf(ext)    !== -1) return 'markdown';
        if (VIDEO_EXTS.indexOf(ext) !== -1) return 'video';
        if (AUDIO_EXTS.indexOf(ext) !== -1) return 'audio';
        return 'other';
    }

    // ─── PDF.js lazy loader ─────────────────────────────────────────────
    var _pdfJsLoaded = false, _pdfJsLoading = null;
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
            if (window.pdfjsLib) { _pdfJsLoaded = true; resolve(); return; }
            function tryLoad(urls, idx) {
                if (idx >= urls.length) { reject(new Error('Failed to load pdf.js')); return; }
                var entry = urls[idx], script = document.createElement('script');
                script.src = entry.js;
                script.onload = function() {
                    if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = entry.worker; _pdfJsLoaded = true; resolve(); }
                    else tryLoad(urls, idx + 1);
                };
                script.onerror = function() { tryLoad(urls, idx + 1); };
                document.head.appendChild(script);
            }
            tryLoad(PDF_JS_CDNS, 0);
        });
        return _pdfJsLoading;
    }

    // ─── Content hashing ────────────────────────────────────────────────

    function computeFileHash(file) {
        return file.arrayBuffer().then(function(buf) {
            return crypto.subtle.digest('SHA-256', buf);
        }).then(function(hashBuf) {
            var arr = new Uint8Array(hashBuf), hex = '';
            for (var i = 0; i < arr.length; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
            return hex;
        });
    }

    function computeFolderHash(fileHashes) {
        var data = new TextEncoder().encode(fileHashes.join(''));
        return crypto.subtle.digest('SHA-256', data).then(function(hashBuf) {
            var arr = new Uint8Array(hashBuf), hex = '';
            for (var i = 0; i < 8; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
            return hex;
        });
    }

    // ─── Image thumbnail ────────────────────────────────────────────────

    function generateImageThumbnail(file) {
        return new Promise(function(resolve, reject) {
            if (getExt(file.name) === 'svg') {
                file.arrayBuffer().then(function(buf) {
                    resolve({ buffer: buf, width: THUMB_MAX_WIDTH, height: THUMB_MAX_WIDTH,
                              format: 'image/svg+xml', originalWidth: 0, originalHeight: 0 });
                }).catch(reject);
                return;
            }
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function() {
                var origW = img.naturalWidth, origH = img.naturalHeight;
                var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
                var w = Math.round(origW * scale), h = Math.round(origH * scale);
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                canvas.toBlob(function(blob) {
                    if (!blob) { reject(new Error('toBlob failed')); return; }
                    blob.arrayBuffer().then(function(buf) {
                        resolve({ buffer: buf, width: w, height: h, format: THUMB_FORMAT,
                                  originalWidth: origW, originalHeight: origH });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };
            img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
            img.src = url;
        });
    }

    // ─── PDF thumbnail ──────────────────────────────────────────────────

    function generatePdfThumbnail(file) {
        return loadPdfJs().then(function() { return file.arrayBuffer(); })
        .then(function(buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
        .then(function(pdfDoc) {
            var pageCount = pdfDoc.numPages;
            return pdfDoc.getPage(1).then(function(page) {
                var vp = page.getViewport({ scale: 1.0 });
                var scale = THUMB_MAX_WIDTH / vp.width;
                var svp = page.getViewport({ scale: scale });
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(svp.width); canvas.height = Math.round(svp.height);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                return page.render({ canvasContext: ctx, viewport: svp }).promise.then(function() {
                    return new Promise(function(resolve, reject) {
                        canvas.toBlob(function(blob) {
                            if (!blob) { reject(new Error('PDF toBlob failed')); return; }
                            blob.arrayBuffer().then(function(buf) {
                                resolve({ buffer: buf, width: canvas.width, height: canvas.height,
                                          format: THUMB_FORMAT, pageCount: pageCount });
                            }).catch(reject);
                        }, THUMB_FORMAT, THUMB_QUALITY);
                    });
                });
            });
        });
    }

    // ─── Markdown thumbnail ─────────────────────────────────────────────

    function generateMarkdownThumbnail(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                var text = reader.result || '';
                var canvas = document.createElement('canvas');
                canvas.width = THUMB_MAX_WIDTH; canvas.height = THUMB_HEIGHT;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                var padding = 12, y = padding, maxWidth = canvas.width - padding * 2, maxY = canvas.height - 20;
                var lines = text.split('\n');
                for (var li = 0; li < lines.length && y < maxY; li++) {
                    var line = lines[li];
                    if (line.match(/^#{1,3}\s/)) {
                        ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillStyle = '#1a1a2e';
                        ctx.fillText(line.replace(/^#+\s*/, ''), padding, y); y += 14;
                    } else if (line.trim()) {
                        var clean = line.replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
                        ctx.font = '7px system-ui, sans-serif'; ctx.fillStyle = '#1a1a2e';
                        var words = clean.split(' '), cur = '';
                        for (var wi = 0; wi < words.length && y < maxY; wi++) {
                            var test = cur ? cur + ' ' + words[wi] : words[wi];
                            if (ctx.measureText(test).width > maxWidth && cur) {
                                ctx.fillText(cur, padding, y); y += 10; cur = words[wi];
                            } else { cur = test; }
                        }
                        if (cur && y < maxY) { ctx.fillText(cur, padding, y); y += 10; }
                        y += 2;
                    }
                }
                if (y >= maxY) {
                    var grad = ctx.createLinearGradient(0, THUMB_HEIGHT - 30, 0, THUMB_HEIGHT);
                    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
                    ctx.fillStyle = grad; ctx.fillRect(0, THUMB_HEIGHT - 30, THUMB_MAX_WIDTH, 30);
                }
                canvas.toBlob(function(blob) {
                    if (!blob) { reject(new Error('MD toBlob failed')); return; }
                    blob.arrayBuffer().then(function(buf) {
                        resolve({ buffer: buf, width: THUMB_MAX_WIDTH, height: THUMB_HEIGHT,
                                  format: THUMB_FORMAT, textLen: text.length });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };
            reader.onerror = function() { reject(new Error('Failed to read markdown')); };
            reader.readAsText(file);
        });
    }

    // ─── Video thumbnail ────────────────────────────────────────────────

    function generateVideoThumbnail(file) {
        return new Promise(function(resolve, reject) {
            var url = URL.createObjectURL(file), video = document.createElement('video');
            video.preload = 'metadata'; video.muted = true;
            var timeout = setTimeout(function() { URL.revokeObjectURL(url); reject(new Error('Video timeout')); }, 10000);
            video.onloadeddata = function() { video.currentTime = Math.min(1, video.duration / 4); };
            video.onseeked = function() {
                clearTimeout(timeout);
                var origW = video.videoWidth, origH = video.videoHeight;
                var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
                var w = Math.round(origW * scale), h = Math.round(origH * scale);
                var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                URL.revokeObjectURL(url);
                canvas.toBlob(function(blob) {
                    if (!blob) { reject(new Error('Video toBlob failed')); return; }
                    blob.arrayBuffer().then(function(buf) {
                        resolve({ buffer: buf, width: w, height: h, format: THUMB_FORMAT,
                                  duration: video.duration, videoW: origW, videoH: origH });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };
            video.onerror = function() { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('Video load failed')); };
            video.src = url;
        });
    }

    // ─── Audio metadata ─────────────────────────────────────────────────

    function extractAudioMetadata(file) {
        return new Promise(function(resolve, reject) {
            var url = URL.createObjectURL(file), audio = document.createElement('audio');
            audio.preload = 'metadata';
            var timeout = setTimeout(function() { URL.revokeObjectURL(url); reject(new Error('Audio timeout')); }, 5000);
            audio.onloadedmetadata = function() {
                clearTimeout(timeout); var d = audio.duration; URL.revokeObjectURL(url);
                var m = Math.floor(d / 60), s = Math.floor(d % 60);
                resolve({ duration: d, durationFormatted: m + ':' + (s < 10 ? '0' : '') + s });
            };
            audio.onerror = function() { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('Audio load failed')); };
            audio.src = url;
        });
    }

    // ─── Public API ─────────────────────────────────────────────────────
    return {
        THUMB_MAX_WIDTH:            THUMB_MAX_WIDTH,
        THUMB_HEIGHT:               THUMB_HEIGHT,
        THUMB_QUALITY:              THUMB_QUALITY,
        THUMB_FORMAT:               THUMB_FORMAT,
        getExt:                     getExt,
        fileId:                     fileId,
        getFileCategory:            getFileCategory,
        computeFileHash:            computeFileHash,
        computeFolderHash:          computeFolderHash,
        generateImageThumbnail:     generateImageThumbnail,
        generatePdfThumbnail:       generatePdfThumbnail,
        generateMarkdownThumbnail:  generateMarkdownThumbnail,
        generateVideoThumbnail:     generateVideoThumbnail,
        extractAudioMetadata:       extractAudioMetadata
    };
})();
