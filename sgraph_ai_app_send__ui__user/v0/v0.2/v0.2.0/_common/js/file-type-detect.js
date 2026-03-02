/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — File Type Detection Utility
   v0.2.0 — Consolidated from v0.1.8 (unchanged logic)

   Detects renderable file types from SGMETA filename + content_type_hint.
   All detection is client-side (zero-knowledge).

   Supported render types:
     'markdown'  — .md files
     'image'     — .png, .jpg, .jpeg, .gif, .webp, .svg
     'pdf'       — .pdf
     'audio'     — .wav, .mp3, .ogg, .flac, .aac, .m4a, .wma, .webm (audio)
     'video'     — .mp4, .webm, .ogv, .mov, .avi, .mkv
     'docx'      — .docx, .doc (Word — rendered via mammoth.js from CDN)
     'xlsx'      — .xlsx, .xls (Excel — rendered via SheetJS from CDN)
     'pptx'      — .pptx, .ppt (PowerPoint — download-to-view)
     'code'      — .js, .ts, .py, .json, .yaml, .yml, .xml, .html, .css, .sh, etc.
     'zip'       — .zip (browsable archive viewer)
     'text'      — text/* content type (existing behaviour)
     null        — binary/unknown (auto-download)
   ═══════════════════════════════════════════════════════════════════════════════ */

const FileTypeDetect = {

    _extMap: {
        '.md': 'markdown', '.markdown': 'markdown', '.mdown': 'markdown',
        '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
        '.webp': 'image', '.svg': 'image',
        '.pdf': 'pdf',
        '.wav': 'audio', '.mp3': 'audio', '.ogg': 'audio', '.flac': 'audio',
        '.aac': 'audio', '.m4a': 'audio', '.wma': 'audio',
        '.mp4': 'video', '.webm': 'video', '.ogv': 'video', '.mov': 'video',
        '.avi': 'video', '.mkv': 'video',
        '.docx': 'docx', '.doc': 'docx',
        '.xlsx': 'xlsx', '.xls': 'xlsx',
        '.pptx': 'pptx', '.ppt': 'pptx',
        '.zip': 'zip',
        '.js': 'code', '.mjs': 'code', '.cjs': 'code', '.ts': 'code',
        '.tsx': 'code', '.jsx': 'code', '.py': 'code', '.json': 'code',
        '.yaml': 'code', '.yml': 'code', '.xml': 'code', '.html': 'code',
        '.htm': 'code', '.css': 'code', '.sh': 'code', '.bash': 'code',
        '.sql': 'code', '.go': 'code', '.rs': 'code', '.java': 'code',
        '.c': 'code', '.h': 'code', '.cpp': 'code', '.hpp': 'code',
        '.cc': 'code', '.rb': 'code', '.php': 'code', '.toml': 'code',
        '.ini': 'code', '.env': 'code', '.dockerfile': 'code',
    },

    _contentTypeMap: {
        'image/': 'image',
        'audio/': 'audio',
        'video/': 'video',
        'application/pdf': 'pdf',
        'application/zip': 'zip',
        'application/x-zip-compressed': 'zip',
        'text/markdown': 'markdown',
        'text/x-markdown': 'markdown',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-excel': 'xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/vnd.ms-powerpoint': 'pptx',
    },

    _audioMimeMap: {
        '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
        '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
        '.wma': 'audio/x-ms-wma', '.webm': 'audio/webm',
    },

    _videoMimeMap: {
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
        '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
    },

    _langMap: {
        '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
        '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
        '.py': 'python', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
        '.xml': 'xml', '.html': 'html', '.htm': 'html', '.css': 'css',
        '.sh': 'bash', '.bash': 'bash', '.sql': 'sql', '.go': 'go',
        '.rs': 'rust', '.java': 'java', '.c': 'c', '.h': 'c',
        '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp', '.rb': 'ruby',
        '.php': 'php', '.toml': 'toml', '.ini': 'ini',
        '.md': 'markdown', '.markdown': 'markdown',
    },

    _imageMimeMap: {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    },

    detect(filename, contentType) {
        if (filename) {
            const ext = this._getExtension(filename);
            if (ext && this._extMap[ext]) return this._extMap[ext];
        }
        if (contentType) {
            const ct = contentType.toLowerCase().trim();
            for (const [prefix, type] of Object.entries(this._contentTypeMap)) {
                if (ct === prefix || ct.startsWith(prefix)) return type;
            }
            if (ct.startsWith('text/')) return 'text';
        }
        return null;
    },

    getLanguage(filename) {
        if (!filename) return 'text';
        const ext = this._getExtension(filename);
        return (ext && this._langMap[ext]) || 'text';
    },

    getImageMime(filename) {
        if (!filename) return 'application/octet-stream';
        const ext = this._getExtension(filename);
        return (ext && this._imageMimeMap[ext]) || 'application/octet-stream';
    },

    getAudioMime(filename) {
        if (!filename) return 'audio/mpeg';
        const ext = this._getExtension(filename);
        return (ext && this._audioMimeMap[ext]) || 'audio/mpeg';
    },

    getVideoMime(filename) {
        if (!filename) return 'video/mp4';
        const ext = this._getExtension(filename);
        return (ext && this._videoMimeMap[ext]) || 'video/mp4';
    },

    isSvg(filename) {
        if (!filename) return false;
        return this._getExtension(filename) === '.svg';
    },

    _getExtension(filename) {
        const dot = filename.lastIndexOf('.');
        if (dot < 0 || dot === filename.length - 1) return null;
        return filename.substring(dot).toLowerCase();
    }
};
