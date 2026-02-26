/* =============================================================================
   SG/Send — File Type Detection Utility
   v0.1.8 — Detects renderable file types from SGMETA filename + content_type_hint

   Used after decryption to route content to the appropriate inline renderer
   instead of auto-downloading. All detection is client-side (zero-knowledge).

   Supported render types:
     'markdown'  — .md files
     'image'     — .png, .jpg, .jpeg, .gif, .webp, .svg
     'pdf'       — .pdf
     'code'      — .js, .ts, .py, .json, .yaml, .yml, .xml, .html, .css, .sh,
                   .sql, .go, .rs, .java, .c, .cpp, .rb, .php
     'text'      — text/* content type (existing behaviour)
     null        — binary/unknown (auto-download)
   ============================================================================= */

const FileTypeDetect = {

    // Extension → render type mapping
    _extMap: {
        // Markdown
        '.md':       'markdown',
        '.markdown': 'markdown',
        '.mdown':    'markdown',

        // Images
        '.png':  'image',
        '.jpg':  'image',
        '.jpeg': 'image',
        '.gif':  'image',
        '.webp': 'image',
        '.svg':  'image',

        // PDF
        '.pdf': 'pdf',

        // Code / structured text
        '.js':   'code', '.mjs':  'code', '.cjs': 'code',
        '.ts':   'code', '.tsx':  'code', '.jsx': 'code',
        '.py':   'code',
        '.json': 'code',
        '.yaml': 'code', '.yml':  'code',
        '.xml':  'code',
        '.html': 'code', '.htm':  'code',
        '.css':  'code',
        '.sh':   'code', '.bash': 'code',
        '.sql':  'code',
        '.go':   'code',
        '.rs':   'code',
        '.java': 'code',
        '.c':    'code', '.h':    'code',
        '.cpp':  'code', '.hpp':  'code', '.cc': 'code',
        '.rb':   'code',
        '.php':  'code',
        '.toml': 'code',
        '.ini':  'code',
        '.env':  'code',
        '.dockerfile': 'code',
    },

    // Content-type prefix → render type
    _contentTypeMap: {
        'image/':          'image',
        'application/pdf': 'pdf',
        'text/markdown':   'markdown',
        'text/x-markdown': 'markdown',
    },

    // Extension → language name for syntax highlighting
    _langMap: {
        '.js':   'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
        '.jsx':  'javascript',
        '.ts':   'typescript', '.tsx': 'typescript',
        '.py':   'python',
        '.json': 'json',
        '.yaml': 'yaml',  '.yml': 'yaml',
        '.xml':  'xml',    '.html': 'html', '.htm': 'html',
        '.css':  'css',
        '.sh':   'bash',   '.bash': 'bash',
        '.sql':  'sql',
        '.go':   'go',
        '.rs':   'rust',
        '.java': 'java',
        '.c':    'c',      '.h': 'c',
        '.cpp':  'cpp',    '.hpp': 'cpp', '.cc': 'cpp',
        '.rb':   'ruby',
        '.php':  'php',
        '.toml': 'toml',
        '.ini':  'ini',
        '.md':   'markdown', '.markdown': 'markdown',
    },

    // Extension → MIME type for images
    _imageMimeMap: {
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif':  'image/gif',
        '.webp': 'image/webp',
        '.svg':  'image/svg+xml',
    },

    /**
     * Detect render type from filename and/or content_type_hint.
     * @param {string|null} filename     - From SGMETA metadata
     * @param {string|null} contentType  - From transferInfo.content_type_hint
     * @returns {string|null} render type or null for auto-download
     */
    detect(filename, contentType) {
        // 1. Try filename extension first (most reliable after decryption)
        if (filename) {
            const ext = this._getExtension(filename);
            if (ext && this._extMap[ext]) {
                return this._extMap[ext];
            }
        }

        // 2. Try content_type_hint
        if (contentType) {
            const ct = contentType.toLowerCase().trim();
            for (const [prefix, type] of Object.entries(this._contentTypeMap)) {
                if (ct === prefix || ct.startsWith(prefix)) {
                    return type;
                }
            }
            // Fallback: text/* → 'text' (existing behaviour)
            if (ct.startsWith('text/')) {
                return 'text';
            }
        }

        return null;
    },

    /**
     * Get the language identifier for syntax highlighting.
     * @param {string|null} filename
     * @returns {string} language name or 'text'
     */
    getLanguage(filename) {
        if (!filename) return 'text';
        const ext = this._getExtension(filename);
        return (ext && this._langMap[ext]) || 'text';
    },

    /**
     * Get MIME type for an image filename.
     * @param {string} filename
     * @returns {string} MIME type
     */
    getImageMime(filename) {
        if (!filename) return 'application/octet-stream';
        const ext = this._getExtension(filename);
        return (ext && this._imageMimeMap[ext]) || 'application/octet-stream';
    },

    /**
     * Check if a filename is an SVG (needs special security handling).
     * @param {string|null} filename
     * @returns {boolean}
     */
    isSvg(filename) {
        if (!filename) return false;
        return this._getExtension(filename) === '.svg';
    },

    /**
     * Extract lowercase file extension including the dot.
     * @param {string} filename
     * @returns {string|null}
     */
    _getExtension(filename) {
        const dot = filename.lastIndexOf('.');
        if (dot < 0 || dot === filename.length - 1) return null;
        return filename.substring(dot).toLowerCase();
    }
};
