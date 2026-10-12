/* ═══════════════════════════════════════════════════════════════════════════════
   send-browse — path resolution + VFS path validation (pure)
   Extracted from send-browse--v0.3.3.js (2026-08-03) with NO behaviour change: the
   bodies below are byte-identical to the region they came from.

   Why the split: the original was 1841 lines mixing a UI component with parsers, path
   maths and DOM helpers. The base64 chunk bug (chunk=8192) survived in there for months
   precisely because none of it could be reached by a unit test. These files are plain
   globals loaded before the component — same no-build, load-order contract as the rest
   of the tree — so extracting them costs nothing at runtime and makes them testable.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── Resolve relative path against a base directory ──────────────────────────
function _resolvePath(base, relative) {
    if (relative.startsWith('/')) return relative.substring(1);
    var combined = base + relative;
    var parts    = combined.split('/');
    var resolved = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '..') { resolved.pop(); }
        else if (parts[i] !== '.' && parts[i] !== '') { resolved.push(parts[i]); }
    }
    return resolved.join('/');
}

// ─── Find entry by resolved path (BRW-011: URL decode, fuzzy matching) ──────
function _findEntry(fileList, resolved) {
    try { resolved = decodeURIComponent(resolved); } catch (_) {}

    var match = fileList.find(function(e) { return !e.dir && e.path === resolved; });
    if (match) return match;

    match = fileList.find(function(e) { return !e.dir && e.path.endsWith('/' + resolved); });
    if (match) return match;

    if (resolved.indexOf('.') === -1) {
        var exts = ['.md', '.pdf', '.txt', '.html', '.jpg', '.jpeg', '.png', '.webp'];
        for (var i = 0; i < exts.length; i++) {
            match = fileList.find(function(e) { return !e.dir && e.path === resolved + exts[i]; });
            if (match) return match;
            match = fileList.find(function(e) { return !e.dir && e.path.endsWith('/' + resolved + exts[i]); });
            if (match) return match;
        }
    }

    var filename = resolved.split('/').pop();
    if (filename) {
        match = fileList.find(function(e) {
            if (e.dir) return false;
            return e.path.split('/').pop() === filename;
        });
    }
    return match || null;
}

// ─── Change 5: VFS path validation ───────────────────────────────────────────────
// Applied symmetrically to read, navigation, AND write paths — defence in depth.
// Returns a non-empty error string if invalid, null if OK.
function _validateVfsPath(rawPath, htmlDir) {
    if (!rawPath || typeof rawPath !== 'string') return 'Empty path';
    if (rawPath.length > 1024)                   return 'Path too long';
    if (rawPath.indexOf('\0') !== -1)             return 'Null byte in path';
    // URL-decode to catch %2e%2e/ traversal before the string checks
    var decoded;
    try { decoded = decodeURIComponent(rawPath); } catch (_) { decoded = rawPath; }
    if (decoded.indexOf('\0') !== -1)             return 'Null byte in path';
    // Resolve: leading slash = vault-rooted (strip it); relative = resolve against htmlDir
    var resolved = decoded.startsWith('/')
        ? decoded.slice(1)
        : _resolvePath(htmlDir, decoded);
    if (!resolved)                                return 'Cannot resolve path';
    // Traversal guard (post-resolution)
    if (resolved.startsWith('../') || resolved.indexOf('/../') !== -1 || resolved === '..')
                                                  return 'Path traversal';
    // Protect vault internals
    if (resolved === '.vault-settings.json' ||
        resolved === '.vault-settings'       ||
        resolved.startsWith('.vault-')       ||
        resolved.startsWith('.vault/'))           return 'Protected path';
    return null; // valid
}

// ─── Change 5: ensure all folder segments of a vault path exist ──────────────────
// Creates any missing parent folders one by one (each is a vault commit).
// Suppresses errors for already-existing folders.
async function _ensureVaultFolder(dataSource, folderPath) {
    if (!folderPath || folderPath === '/') return;
    var parts = folderPath.replace(/^\//, '').split('/').filter(Boolean);
    var current = '/';
    for (var i = 0; i < parts.length; i++) {
        var next = current === '/' ? '/' + parts[i] : current + '/' + parts[i];
        try {
            if (!dataSource._vault || !dataSource._vault._findNode(next)) {
                await dataSource.createFolder(next);
            }
        } catch (_) {} // already exists — fine
        current = next;
    }
}
