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

    function detectDeliveryOptions(file, folderScan) {
        var ext = (file && file.name ? file.name : '').split('.').pop().toLowerCase();
        var isFolder = !!folderScan;
        var downloadTitle = isFolder ? 'Download zip mode' : 'Download mode';
        var downloadDesc  = isFolder ? 'Recipient downloads a single zip file' : 'Recipient gets a file to save to their device';
        var options = [{ id: 'download', icon: '\uD83D\uDCE5', title: downloadTitle, desc: downloadDesc, hint: 'Best for: large archives, backups' }];

        if (folderScan) {
            options.push({ id: 'browse', icon: '\uD83D\uDCC2', title: 'Folder view mode', desc: 'Recipient sees files in a browsable view with inline preview', hint: 'Best for: sharing documents, reports' });
            var hasImages = folderScan.entries
                .filter(function(e) { return !e.isDir; })
                .some(function(e) { return IMAGE_EXTENSIONS.has(e.name.split('.').pop().toLowerCase()); });
            if (hasImages) {
                options.push({ id: 'gallery', icon: '\uD83D\uDDBC\uFE0F', title: 'Gallery mode', desc: 'Recipient browses files with preview. Thumbnails and metadata will be generated.', hint: 'Best for: photo sets, documents, mixed files' });
            }
        } else if (VIEWABLE_EXTENSIONS.has(ext)) {
            options.push({ id: 'view', icon: '\uD83D\uDC41\uFE0F', title: 'View mode', desc: 'Recipient reads/views directly, no download needed', hint: 'Best for: documents, reports' });
        } else if (ext === 'zip') {
            options.push({ id: 'browse', icon: '\uD83D\uDCC2', title: 'Folder view mode', desc: 'Recipient sees files in a browsable view with inline preview', hint: 'Best for: sharing documents, reports' });
        }

        return options;
    }

    function getRecommendedDelivery(options, folderScan) {
        if (folderScan) return 'browse';
        if (options.find(function(o) { return o.id === 'view'; }))    return 'view';
        if (options.find(function(o) { return o.id === 'gallery'; })) return 'gallery';
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
            if (info.ext)   typeParts.push(info.ext);
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
        buildFileSummary:       buildFileSummary
    };
})();
