/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Folder Handler
   v0.3.0 — Folder scanning, compression, and gallery preview generation

   Handles: directory tree reading (from drag-drop or input), JSZip lazy loading,
   folder-to-zip compression with configurable options, gallery thumbnail
   generation via UploadThumbnails.
   ═══════════════════════════════════════════════════════════════════════════════ */

var UploadFolder = (function() {
    'use strict';

    // ─── Read directory tree from FileSystemDirectoryEntry ───────────────

    async function readDirectoryTree(dirEntry) {
        var results = [];

        async function readEntries(dir, path) {
            return new Promise(function(resolve, reject) {
                var reader = dir.createReader();
                var all    = [];
                var readBatch = function() {
                    reader.readEntries(async function(entries) {
                        if (entries.length === 0) {
                            for (var i = 0; i < all.length; i++) {
                                var e = all[i];
                                if (e.isFile) {
                                    try {
                                        var file = await new Promise(function(res, rej) { e.file(res, rej); });
                                        results.push({ path: path + e.name, file: file, isDir: false, name: e.name });
                                    } catch (err) { /* skip unreadable */ }
                                } else if (e.isDirectory) {
                                    results.push({ path: path + e.name + '/', file: null, isDir: true, name: e.name });
                                    await readEntries(e, path + e.name + '/');
                                }
                            }
                            resolve();
                        } else {
                            all.push.apply(all, entries);
                            readBatch();
                        }
                    }, reject);
                };
                readBatch();
            });
        }

        await readEntries(dirEntry, '');
        return results;
    }

    // ─── Build folder scan from input[webkitdirectory] files ────────────

    function buildFolderScan(files) {
        var entries = [];
        var folderName = '';
        for (var i = 0; i < files.length; i++) {
            var f    = files[i];
            var path = f.webkitRelativePath || f.name;
            if (!folderName && path.indexOf('/') > 0) folderName = path.split('/')[0];
            entries.push({ path: path, file: f, isDir: false, name: f.name });
        }
        return {
            folderName: folderName || 'folder',
            scan: {
                entries:     entries,
                fileCount:   entries.length,
                folderCount: 0,
                totalSize:   entries.reduce(function(s, e) { return s + (e.file ? e.file.size : 0); }, 0)
            }
        };
    }

    // ─── Build folder scan from directory entry (drag-drop) ─────────────

    async function scanDirectoryEntry(directoryEntry) {
        var entries = await readDirectoryTree(directoryEntry);
        return {
            folderName: directoryEntry.name,
            scan: {
                entries:     entries,
                fileCount:   entries.filter(function(e) { return !e.isDir; }).length,
                folderCount: entries.filter(function(e) { return e.isDir; }).length,
                totalSize:   entries.reduce(function(s, e) { return s + (e.file ? e.file.size : 0); }, 0)
            }
        };
    }

    // ─── Lazy-load JSZip ────────────────────────────────────────────────

    function loadJSZip() {
        if (typeof JSZip !== 'undefined') return Promise.resolve();
        return new Promise(function(resolve, reject) {
            var script   = document.createElement('script');
            var basePath = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.base) || '../_common';
            script.src   = basePath + '/js/vendor/jszip.min.js';
            script.onload  = resolve;
            script.onerror = function() { reject(new Error('Failed to load JSZip')); };
            document.head.appendChild(script);
        });
    }

    // ─── Compress folder to zip File ────────────────────────────────────
    // Returns a File object ready for the upload engine.

    async function compressToZip(folderScan, folderName, options, delivery) {
        await loadJSZip();
        var opts    = options || { level: 4, includeEmpty: false, includeHidden: false };
        var entries = folderScan.entries.filter(function(e) {
            if (!opts.includeHidden && e.name.startsWith('.')) return false;
            if (e.isDir && !opts.includeEmpty) return false;
            return true;
        });

        var zip = new JSZip();
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isDir) {
                zip.folder(entry.path);
            } else if (entry.file) {
                var buf = await entry.file.arrayBuffer();
                zip.file(entry.path, buf, {
                    compression: (opts.level || 4) > 0 ? 'DEFLATE' : 'STORE',
                    compressionOptions: { level: opts.level || 4 }
                });
            }
        }

        // Gallery preview generation
        if (delivery === 'gallery') {
            await _addPreviewToZip(zip, entries.filter(function(e) { return !e.isDir && e.file; }));
        }

        var blob    = await zip.generateAsync({ type: 'blob' });
        var zipName = (folderName || 'folder') + '.zip';
        return new File([blob], zipName, { type: 'application/zip' });
    }

    // ─── Gallery preview: thumbnails + manifest ─────────────────────────

    async function _addPreviewToZip(zip, fileEntries) {
        if (fileEntries.length === 0) return;

        // Compute content hashes
        var fileHashes = [];
        for (var h = 0; h < fileEntries.length; h++) {
            try   { fileHashes.push(await UploadThumbnails.computeFileHash(fileEntries[h].file)); }
            catch (e) { fileHashes.push('0000000000000000'); }
        }
        var folderHash = await UploadThumbnails.computeFolderHash(fileHashes);
        var previewDir = '_gallery.' + folderHash;

        // Load PDF.js if needed
        var hasPdfs = fileEntries.some(function(e) { return UploadThumbnails.getFileCategory(e.name) === 'pdf'; });
        // Note: PDF.js loading is handled inside generatePdfThumbnail

        // Build manifest
        var manifest = {
            version: '0.2', preview_enabled: true, generated_at: new Date().toISOString(),
            folder_hash: folderHash,
            thumbnail_max_width: UploadThumbnails.THUMB_MAX_WIDTH,
            thumbnail_format:    UploadThumbnails.THUMB_FORMAT,
            thumbnail_quality:   UploadThumbnails.THUMB_QUALITY,
            total_files: fileEntries.length, file_hashes: {}, files: []
        };
        var thumbnailsGenerated = 0;

        for (var i = 0; i < fileEntries.length; i++) {
            var entry    = fileEntries[i];
            var id       = UploadThumbnails.fileId(i);
            var category = UploadThumbnails.getFileCategory(entry.name);
            var meta = {
                id: id, name: entry.name, path: entry.path, type: category,
                extension: UploadThumbnails.getExt(entry.name), size: entry.file.size,
                mime: entry.file.type || 'application/octet-stream', hash: fileHashes[i]
            };
            var manifestEntry = {
                id: id, name: entry.name, path: entry.path, type: category,
                size: entry.file.size, hash: fileHashes[i], thumbnail: null,
                metadata: previewDir + '/metadata/' + id + '.meta.json'
            };
            manifest.file_hashes[id] = fileHashes[i];

            try {
                var thumbResult = null, thumbExt = 'jpg';
                if (category === 'image') {
                    thumbResult = await UploadThumbnails.generateImageThumbnail(entry.file);
                    thumbExt = UploadThumbnails.getExt(entry.name) === 'svg' ? 'svg' : 'jpg';
                    meta.dimensions = { width: thumbResult.originalWidth, height: thumbResult.originalHeight };
                } else if (category === 'pdf') {
                    thumbResult = await UploadThumbnails.generatePdfThumbnail(entry.file);
                    meta.pageCount = thumbResult.pageCount;
                } else if (category === 'markdown') {
                    thumbResult = await UploadThumbnails.generateMarkdownThumbnail(entry.file);
                    meta.textLength = thumbResult.textLen;
                } else if (category === 'video') {
                    thumbResult = await UploadThumbnails.generateVideoThumbnail(entry.file);
                    meta.duration = thumbResult.duration;
                    meta.dimensions = { width: thumbResult.videoW, height: thumbResult.videoH };
                } else if (category === 'audio') {
                    var audioMeta = await UploadThumbnails.extractAudioMetadata(entry.file);
                    meta.duration = audioMeta.duration;
                }
                if (thumbResult && thumbResult.buffer) {
                    var thumbPath = previewDir + '/thumbnails/' + id + '.thumb.' + thumbExt;
                    zip.file(thumbPath, thumbResult.buffer);
                    meta.thumbnail = { path: thumbPath, width: thumbResult.width, height: thumbResult.height,
                                       format: UploadThumbnails.THUMB_FORMAT, size: thumbResult.buffer.byteLength };
                    manifestEntry.thumbnail = thumbPath;
                    thumbnailsGenerated++;
                }
            } catch (e) { /* skip failed thumbnails */ }

            zip.file(previewDir + '/metadata/' + id + '.meta.json', JSON.stringify(meta, null, 2));
            manifest.files.push(manifestEntry);
        }

        manifest.thumbnails_generated = thumbnailsGenerated;
        zip.file(previewDir + '/_manifest.json', JSON.stringify(manifest, null, 2));
    }

    // ─── Public API ─────────────────────────────────────────────────────
    return {
        readDirectoryTree:   readDirectoryTree,
        buildFolderScan:     buildFolderScan,
        scanDirectoryEntry:  scanDirectoryEntry,
        compressToZip:       compressToZip
    };
})();
