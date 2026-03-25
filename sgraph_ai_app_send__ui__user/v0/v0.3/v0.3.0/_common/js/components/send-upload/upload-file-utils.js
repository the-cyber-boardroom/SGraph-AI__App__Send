/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload File Utilities
   v0.3.0 — File type detection, delivery options, folder breakdown

   Shared by: upload-step-select, upload-step-delivery, upload-step-confirm,
              upload-step-done, send-upload orchestrator
   ═══════════════════════════════════════════════════════════════════════════════ */

var UploadFileUtils = (function() {
    'use strict';

    // ─── File type icon mapping ─────────────────────────────────────────────
    var TYPE_ICONS = {
        'image':    '\uD83D\uDDBC\uFE0F',   // 🖼️
        'pdf':      '\uD83D\uDCC4',          // 📄
        'markdown': '\uD83D\uDCDD',          // 📝
        'video':    '\uD83C\uDFA5',          // 🎥
        'audio':    '\uD83C\uDFB5',          // 🎵
        'code':     '\uD83D\uDCBB',          // 💻
        'zip':      '\uD83D\uDCE6',          // 📦
        'text':     '\uD83D\uDCC3',          // 📃
        'folder':   '\uD83D\uDCC1',          // 📁
        'default':  '\uD83D\uDCC4',          // 📄
    };

    var TYPE_LABELS = {
        'image':    'Image',
        'pdf':      'Document',
        'markdown': 'Document',
        'video':    'Video',
        'audio':    'Audio',
        'code':     'Code',
        'zip':      'Archive',
        'text':     'Text',
    };

    var VIEWABLE_EXTENSIONS = new Set([
        'pdf', 'md', 'txt', 'html', 'htm', 'json', 'csv', 'xml',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
    ]);

    var IMAGE_EXTENSIONS = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
    ]);

    function getFileExtension(filename) {
        if (!filename) return '';
        var dot = filename.lastIndexOf('.');
        if (dot < 0 || dot === filename.length - 1) return '';
        return filename.substring(dot + 1).toUpperCase();
    }

    function getFileTypeInfo(file) {
        if (!file) return { icon: TYPE_ICONS['default'], label: '', ext: '' };
        var ext = getFileExtension(file.name);
        var type = (typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.detect(file.name, file.type)
            : null;
        var icon  = TYPE_ICONS[type] || TYPE_ICONS['default'];
        var label = TYPE_LABELS[type] || '';
        return { icon: icon, label: label, ext: ext, type: type };
    }

    function isImageFile(file) {
        if (!file) return false;
        var type = (typeof FileTypeDetect !== 'undefined')
            ? FileTypeDetect.detect(file.name, file.type)
            : null;
        return type === 'image';
    }

    function getFolderBreakdown(folderScan) {
        if (!folderScan || !folderScan.entries) return '';
        var counts = {};
        folderScan.entries
            .filter(function(e) { return !e.isDir; })
            .forEach(function(e) {
                var ext  = '.' + (e.name.split('.').pop() || '').toLowerCase();
                var type = (typeof FileTypeDetect !== 'undefined')
                    ? (FileTypeDetect._extMap[ext] || 'other')
                    : 'other';
                var label = TYPE_LABELS[type] || 'other';
                counts[label] = (counts[label] || 0) + 1;
            });

        var parts = Object.entries(counts)
            .sort(function(a, b) { return b[1] - a[1]; })
            .map(function(entry) { return entry[1] + ' ' + entry[0].toLowerCase() + (entry[1] > 1 ? 's' : ''); })
            .slice(0, 3);

        return parts.length > 0 ? parts.join(', ') : '';
    }

    // ─── Viewable extensions for smart defaults ───────────────────────────
    var SMART_VIEWABLE_EXTS = new Set([
        'md', 'markdown', 'txt', 'json', 'html', 'htm', 'css', 'js', 'ts',
        'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash',
        'xml', 'yaml', 'yml', 'csv', 'log', 'toml', 'ini', 'cfg',
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
        'pdf', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov'
    ]);

    function detectDeliveryOptions(file, folderScan) {
        var isFolder = !!folderScan;
        var downloadTitle = isFolder ? 'Download zip mode' : 'Download mode';
        var downloadDesc  = isFolder ? 'Recipient downloads a single zip file' : 'Recipient gets a file to save to their device';

        // Always show all 3 options (v0.2.15): browse/viewer → gallery → download
        return [
            {
                id: 'browse',
                icon: '\uD83D\uDCC2',
                title: isFolder ? 'Folder view mode' : 'File viewer mode',
                desc: isFolder
                    ? 'Recipient sees files in a browsable view with inline preview'
                    : 'Recipient reads/views the file directly with inline preview',
                hint: 'Best for: documents, reports, code files'
            },
            {
                id: 'gallery',
                icon: '\uD83D\uDDBC\uFE0F',
                title: 'Gallery mode',
                desc: isFolder
                    ? 'Recipient browses files with thumbnails and preview. Metadata will be generated.'
                    : 'Recipient views the file in a gallery-style layout with metadata.',
                hint: 'Best for: photo sets, documents, mixed files'
            },
            {
                id: 'download',
                icon: '\uD83D\uDCE5',
                title: downloadTitle,
                desc: downloadDesc,
                hint: 'Best for: large archives, backups, binary files'
            }
        ];
    }

    function getRecommendedDelivery(options, folderScan) {
        if (folderScan) return 'gallery';  // folders → gallery (best with thumbnails)

        // Single file: check extension
        // (options is unused here — smart default is based on file context passed via folderScan)
        return 'browse';  // default for single files — caller can override
    }

    // Extended version: takes the file directly for smart defaults
    function getSmartDefault(file, folderScan) {
        if (folderScan) return 'gallery';
        if (!file) return 'download';

        var ext = (file.name || '').split('.').pop().toLowerCase();
        if (SMART_VIEWABLE_EXTS.has(ext)) return 'browse';
        if (ext === 'zip') return 'browse';
        return 'download';
    }

    function buildFileSummary(file, folderScan, folderName, formatBytes, escapeHtml) {
        var icon, name, meta;
        var isFolder = !!folderScan;

        if (isFolder) {
            icon = TYPE_ICONS['folder'];
            name = (folderName || 'folder') + '/';
            var breakdown = getFolderBreakdown(folderScan);
            meta = folderScan.fileCount + ' files &middot; ' + formatBytes(folderScan.totalSize);
            if (breakdown) {
                meta += '<div class="file-breakdown">' + escapeHtml(breakdown) + '</div>';
            }
        } else if (file) {
            var info = getFileTypeInfo(file);
            icon = info.icon;
            name = file.name;
            var typeParts = [];
            if (info.label) typeParts.push(info.label);
            if (info.ext)   typeParts.push(escapeHtml(info.ext));
            var typeLabel = typeParts.length > 0 ? typeParts.join(' \u00B7 ') + ' \u00B7 ' : '';
            meta = typeLabel + formatBytes(file.size);
        } else {
            icon = TYPE_ICONS['default'];
            name = '';
            meta = '';
        }

        return { icon: icon, name: name, meta: meta, isFolder: isFolder };
    }

    return {
        TYPE_ICONS:             TYPE_ICONS,
        TYPE_LABELS:            TYPE_LABELS,
        VIEWABLE_EXTENSIONS:    VIEWABLE_EXTENSIONS,
        IMAGE_EXTENSIONS:       IMAGE_EXTENSIONS,
        getFileExtension:       getFileExtension,
        getFileTypeInfo:        getFileTypeInfo,
        isImageFile:            isImageFile,
        getFolderBreakdown:     getFolderBreakdown,
        detectDeliveryOptions:  detectDeliveryOptions,
        getRecommendedDelivery: getRecommendedDelivery,
        getSmartDefault:        getSmartDefault,
        buildFileSummary:       buildFileSummary
    };
})();
