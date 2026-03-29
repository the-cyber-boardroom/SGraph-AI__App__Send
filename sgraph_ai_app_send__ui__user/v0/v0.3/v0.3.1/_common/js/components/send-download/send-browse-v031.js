/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for send-browse.js

   Fixes:
     1. File names in folder tree show basename only (not full zip path)
     2. PDF Present mode button in file action bar (opens in new window)
     3. Auto-open first file uses sorted order (not zip iteration order)
     4. Markdown internal links open as tabs + images resolved from zip
     5. Markdown view source toggle (rendered ↔ raw source)
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── Fix 1: File names in tree show only basename ────────────────────────────
//
// v0.3.0 bug: file.name from JSZip is the full path (e.g. "folder/sub/file.pdf").
// The tree node already places files into the correct folder via _buildFolderTree,
// so the display name should be just the basename.

SendBrowse.prototype._renderFolderNode = (function(original) {
    return function(node, prefix) {
        let html = '';

        // Folders (sorted — same as v0.3.0)
        const folders = Object.keys(node.children).sort();
        for (const name of folders) {
            const child = node.children[name];
            const childPath = prefix ? `${prefix}/${name}` : name;
            const fileCount = this._countFiles(child);
            html += `
                <div class="sb-tree__folder" data-path="${SendHelpers.escapeHtml(childPath)}">
                    <div class="sb-tree__folder-header">
                        <span class="sb-tree__toggle">&#9656;</span>
                        <span class="sb-tree__folder-icon">${SendIcons.FOLDER_SM}</span>
                        <span class="sb-tree__folder-name">${SendHelpers.escapeHtml(name)}</span>
                        <span class="sb-tree__count">${fileCount}</span>
                    </div>
                    <div class="sb-tree__folder-content" style="display: none;">
                        ${this._renderFolderNode(child, childPath)}
                    </div>
                </div>
            `;
        }

        // Files — use basename (last segment of path), sorted alphanumerically
        const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        for (const file of sortedFiles) {
            const basename = file.name.includes('/') ? file.name.split('/').pop() : file.name;
            const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(basename, null) : null;
            const icon = SendBrowse.FILE_ICONS[type] || SendBrowse.FILE_ICONS.other;
            html += `
                <div class="sb-tree__file" data-path="${SendHelpers.escapeHtml(file.path)}">
                    <span class="sb-tree__file-icon">${icon}</span>
                    <span class="sb-tree__file-name">${SendHelpers.escapeHtml(basename)}</span>
                </div>
            `;
        }

        return html;
    };
})(SendBrowse.prototype._renderFolderNode);


// ─── Fix 2: PDF Present mode in browse view ──────────────────────────────────
// ─── Fix 4: Markdown internal links + images from zip ────────────────────────
//
// Fix 2: Adds a Present button to the file action bar for PDFs.
// Fix 4: After rendering markdown, intercepts relative links so clicking them
//         opens the target file as a tab (instead of navigating to a 404).
//         Also resolves <img src="..."> to blob URLs extracted from the zip,
//         enabling embedded images in markdown documents.

SendBrowse.prototype._renderFileContent = (function(original) {
    return function(container, bytes, fileName, type) {
        // Call original to render the base content
        original.call(this, container, bytes, fileName, type);

        // ── PDF Present button ──────────────────────────────────────────
        if (type === 'pdf') {
            var bar = container.querySelector('.sb-file__actions');
            if (bar) {
                var presentBtn = document.createElement('button');
                presentBtn.className = 'sb-action-btn sb-file__present';
                presentBtn.innerHTML = '&#x26F6; Present';
                presentBtn.title = 'Open PDF in fullscreen presentation mode';
                bar.appendChild(presentBtn);

                var iframe = container.querySelector('.sb-file__pdf');
                if (iframe) {
                    presentBtn.addEventListener('click', function() {
                        var pdfUrl = iframe.src;
                        var win = window.open(pdfUrl + '#toolbar=1&navpanes=0&view=Fit', '_blank');
                        if (!win && iframe.requestFullscreen) {
                            iframe.requestFullscreen();
                        }
                    });
                }
            }
        }

        // ── Markdown: view source toggle + resolve links + images ──────
        if (type === 'markdown') {
            var mdContainer = container.querySelector('.sb-file__markdown');
            if (!mdContainer || !this.zipTree) return;

            // ── BRW-006: View Source / Rendered toggle ──────────────────
            var bar = container.querySelector('.sb-file__actions');
            if (bar) {
                var rawText    = new TextDecoder().decode(bytes);
                var isSource   = false;
                var renderedEl = mdContainer;

                var sourceBtn = document.createElement('button');
                sourceBtn.className = 'sb-action-btn sb-file__view-source';
                sourceBtn.innerHTML = '&lt;/&gt; Source';
                sourceBtn.title = 'Toggle between rendered markdown and raw source';
                bar.appendChild(sourceBtn);

                // Create source view (hidden initially)
                var sourceEl = document.createElement('pre');
                sourceEl.className = 'sb-file__code sb-file__md-source';
                sourceEl.textContent = rawText;
                sourceEl.style.display = 'none';
                renderedEl.parentNode.insertBefore(sourceEl, renderedEl.nextSibling);

                sourceBtn.addEventListener('click', function() {
                    isSource = !isSource;
                    renderedEl.style.display = isSource ? 'none' : '';
                    sourceEl.style.display   = isSource ? ''     : 'none';
                    sourceBtn.innerHTML      = isSource ? '&#9998; Rendered' : '&lt;/&gt; Source';
                });
            }

            // Determine the directory of the current file within the zip
            var currentDir = '';
            if (fileName.includes('/')) {
                currentDir = fileName.substring(0, fileName.lastIndexOf('/') + 1);
            }

            var self    = this;
            var zipTree = this.zipTree;

            // ── Intercept relative link clicks → open as tab ────────────
            mdContainer.querySelectorAll('a[href]').forEach(function(a) {
                var href = a.getAttribute('href');
                // Skip external links, anchors, mailto
                if (!href || href.startsWith('http://') || href.startsWith('https://') ||
                    href.startsWith('mailto:') || href.startsWith('#')) return;

                a.addEventListener('click', function(e) {
                    e.preventDefault();
                    var resolved = _resolvePath(currentDir, href);
                    // Try exact match first, then fuzzy (path ending)
                    var match = _findZipEntry(zipTree, resolved);
                    if (match) {
                        self._openFileTab(match.path);
                    }
                });
                // Visual cue: pointer cursor (link is actionable)
                a.style.cursor = 'pointer';
            });

            // ── Resolve image src from zip → blob URLs ──────────────────
            mdContainer.querySelectorAll('img[src]').forEach(function(img) {
                var src = img.getAttribute('src');
                // Skip absolute URLs and data/blob URIs
                if (!src || src.startsWith('http://') || src.startsWith('https://') ||
                    src.startsWith('data:') || src.startsWith('blob:')) return;

                var resolved = _resolvePath(currentDir, src);
                var match    = _findZipEntry(zipTree, resolved);
                if (match) {
                    // Replace src with blob URL from zip
                    match.entry.async('arraybuffer').then(function(imgBytes) {
                        var mime = typeof FileTypeDetect !== 'undefined'
                            ? FileTypeDetect.getImageMime(match.name) || 'image/png'
                            : 'image/png';
                        var blob = new Blob([imgBytes], { type: mime });
                        var url  = URL.createObjectURL(blob);
                        img.src  = url;
                        // Track for cleanup
                        if (self._objectUrls) self._objectUrls.push(url);
                    });
                }
            });
        }
    };
})(SendBrowse.prototype._renderFileContent);


// ─── Helper: resolve relative path against a base directory ──────────────────
//
// resolvePath('folder/sub/', '../other/file.md') → 'folder/other/file.md'
// resolvePath('',            '01-review/doc.md') → '01-review/doc.md'
// resolvePath('root/',       './img/pic.png')    → 'root/img/pic.png'

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


// ─── Helper: find a zip entry by resolved path ──────────────────────────────
//
// Tries exact match first, then checks if any entry's path ends with the
// resolved path (handles cases where the zip has a root folder wrapper).
// Also tries with/without common extensions (.md, .pdf, .jpg, .png).

function _findZipEntry(zipTree, resolved) {
    // Exact match
    var match = zipTree.find(function(e) { return !e.dir && e.path === resolved; });
    if (match) return match;

    // Ends-with match (zip may have a root folder wrapper)
    match = zipTree.find(function(e) { return !e.dir && e.path.endsWith('/' + resolved); });
    if (match) return match;

    // Try common extensions if the path has no extension
    if (resolved.indexOf('.') === -1) {
        var exts = ['.md', '.pdf', '.txt', '.html', '.jpg', '.jpeg', '.png', '.webp'];
        for (var i = 0; i < exts.length; i++) {
            match = zipTree.find(function(e) { return !e.dir && e.path === resolved + exts[i]; });
            if (match) return match;
            match = zipTree.find(function(e) { return !e.dir && e.path.endsWith('/' + resolved + exts[i]); });
            if (match) return match;
        }
    }

    // Try matching just the last path segment (filename) if nothing else worked
    var filename = resolved.split('/').pop();
    if (filename) {
        match = zipTree.find(function(e) {
            if (e.dir) return false;
            var entryName = e.path.split('/').pop();
            return entryName === filename;
        });
    }

    return match || null;
}


// ─── Fix 3: Auto-open first file respects sort order ─────────────────────────
//
// v0.3.0 bug: _autoOpenFirstFile picks files[0] from the unsorted zipTree array.
// The zip iteration order depends on how the archive was created, so the "first"
// file is arbitrary — often NOT the alphabetically first file.
//
// Fix: sort files alphanumerically before picking. This means numbered files
// (0.a, 0.b, 1, 2, 3) open in the expected order, and "Start_Here.md" opens
// before "Zzz_appendix.txt".

SendBrowse.prototype._autoOpenFirstFile = function() {
    const files = this.zipTree.filter(function(e) { return !e.dir; });

    // Sort all files alphanumerically by path (natural number ordering)
    files.sort(function(a, b) {
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Prefer first root-level non-metadata file (same heuristic as v0.3.0, but sorted)
    var root = files.find(function(f) {
        return !f.path.includes('/') && !f.name.startsWith('_') && !f.name.startsWith('.');
    });
    var first = root || files[0];
    if (first) this._openFileTab(first.path);
};
