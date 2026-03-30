/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for send-browse.js

   Fixes:
     1. File names in folder tree show basename only (not full zip path)
     2. PDF Present mode button in file action bar (opens in new window)
     3. Auto-open first file uses sorted order (not zip iteration order)
     4. Markdown internal links open as tabs + images resolved from zip
     5. Markdown view source toggle (rendered ↔ raw source)
     6. Save locally downloads valid zip (correct MIME type + re-generated)
     7. Gallery folder filter handles both _gallery. and __gallery__ prefixes
     8. URL-decoded link matching (%20 → space) for zip entry lookup
     9. CSV viewer — renders as styled table with source toggle
    10. HTML viewer — sandboxed iframe with allow-scripts (no allow-same-origin)
    11. Folder links expand tree, scroll to folder, open first file
    12. Tab bar scrollable when many tabs open + new tab scrolled into view
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── Fix 7: Gallery metadata folder detection (both old + new format) ────────
//
// v0.3.0: folders named _gallery.{hash} (e.g. _gallery.1d6b94eb07927c1d)
// v0.3.1: folders named __gallery__{hash} (e.g. __gallery__1d6b94eb)
// Both should be filtered from the user-visible file tree.

function _isGalleryMetaPath(path) {
    return path.startsWith('_gallery.') || path.startsWith('__gallery__');
}

// Patch _buildFolderTree to filter both formats
var _origBuildFolderTree = SendBrowse.prototype._buildFolderTree;
SendBrowse.prototype._buildFolderTree = function() {
    var root = { name: '', children: {}, files: [] };
    var files = this.zipTree.filter(function(e) { return !e.dir && !_isGalleryMetaPath(e.path); });

    for (var i = 0; i < files.length; i++) {
        var file  = files[i];
        var parts = file.path.split('/');
        var node  = root;
        for (var j = 0; j < parts.length - 1; j++) {
            if (!node.children[parts[j]]) {
                node.children[parts[j]] = { name: parts[j], children: {}, files: [] };
            }
            node = node.children[parts[j]];
        }
        node.files.push(file);
    }
    return root;
};


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
        var ext = (fileName || '').split('.').pop().toLowerCase();

        // ── BRW-012: CSV viewer — render as styled table ────────────────
        if (ext === 'csv') {
            // Render action bar manually (original would render as plain text)
            container.innerHTML = '';
            this._currentFileName = fileName;

            var bar = document.createElement('div');
            bar.className = 'sb-file__actions';
            bar.innerHTML =
                '<span class="sb-file__name">' + SendHelpers.escapeHtml(fileName) + '</span>' +
                '<span class="sb-file__size">' + SendHelpers.formatBytes(bytes.byteLength) + '</span>' +
                '<button class="sb-action-btn sb-file__save">' + SendIcons.DOWNLOAD_SM + ' Save</button>';
            container.appendChild(bar);

            bar.querySelector('.sb-file__save').addEventListener('click', function() {
                var blob = new Blob([bytes]);
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = fileName;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            var rawText = new TextDecoder().decode(bytes);
            var content = document.createElement('div');
            content.className = 'sb-file__content';
            container.appendChild(content);

            // Parse CSV and build table
            var tableHtml = _csvToTable(rawText);
            var tableEl = document.createElement('div');
            tableEl.className = 'sb-file__csv';
            tableEl.innerHTML = tableHtml;
            content.appendChild(tableEl);

            // Source view (hidden)
            var sourceEl = document.createElement('pre');
            sourceEl.className = 'sb-file__code sb-file__csv-source';
            sourceEl.textContent = rawText;
            sourceEl.style.display = 'none';
            content.appendChild(sourceEl);

            // Source toggle button
            var sourceBtn = document.createElement('button');
            sourceBtn.className = 'sb-action-btn sb-file__view-source';
            sourceBtn.innerHTML = '&lt;/&gt; Source';
            var isSource = false;
            sourceBtn.addEventListener('click', function() {
                isSource = !isSource;
                tableEl.style.display  = isSource ? 'none' : '';
                sourceEl.style.display = isSource ? ''     : 'none';
                sourceBtn.innerHTML    = isSource ? '&#9998; Table' : '&lt;/&gt; Source';
            });
            bar.appendChild(sourceBtn);
            return;  // skip original render
        }

        // ── BRW-013: HTML viewer — sandboxed iframe + source toggle ─────
        if (ext === 'html' || ext === 'htm') {
            container.innerHTML = '';
            this._currentFileName = fileName;

            var bar = document.createElement('div');
            bar.className = 'sb-file__actions';
            bar.innerHTML =
                '<span class="sb-file__name">' + SendHelpers.escapeHtml(fileName) + '</span>' +
                '<span class="sb-file__size">' + SendHelpers.formatBytes(bytes.byteLength) + '</span>' +
                '<button class="sb-action-btn sb-file__save">' + SendIcons.DOWNLOAD_SM + ' Save</button>';
            container.appendChild(bar);

            bar.querySelector('.sb-file__save').addEventListener('click', function() {
                var blob = new Blob([bytes], { type: 'text/html' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = fileName;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            var rawText = new TextDecoder().decode(bytes);
            var content = document.createElement('div');
            content.className = 'sb-file__content';
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.height = '100%';
            container.appendChild(content);

            // Sandboxed iframe (no scripts, no external resources by default)
            var blob = new Blob([rawText], { type: 'text/html' });
            var blobUrl = URL.createObjectURL(blob);
            if (this._objectUrls) this._objectUrls.push(blobUrl);
            var iframeEl = document.createElement('iframe');
            iframeEl.className = 'sb-file__html-frame';
            iframeEl.sandbox = 'allow-scripts';  // scripts OK, but NO allow-same-origin — cannot access parent DOM/localStorage
            iframeEl.src = blobUrl;
            iframeEl.style.flex = '1';
            content.appendChild(iframeEl);

            // Source view (hidden)
            var sourceEl = document.createElement('pre');
            sourceEl.className = 'sb-file__code';
            sourceEl.textContent = rawText;
            sourceEl.style.display = 'none';
            sourceEl.style.flex = '1';
            content.appendChild(sourceEl);

            // Source toggle
            var isSource = false;
            var sourceBtn = document.createElement('button');
            sourceBtn.className = 'sb-action-btn sb-file__view-source';
            sourceBtn.innerHTML = '&lt;/&gt; Source';
            sourceBtn.addEventListener('click', function() {
                isSource = !isSource;
                iframeEl.style.display = isSource ? 'none' : '';
                sourceEl.style.display = isSource ? ''     : 'none';
                sourceBtn.innerHTML    = isSource ? '&#127912; Rendered' : '&lt;/&gt; Source';
            });
            bar.appendChild(sourceBtn);
            return;  // skip original render
        }

        // ── All other types: call original ──────────────────────────────
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

            // ── Intercept relative link clicks → open as tab or folder ──
            mdContainer.querySelectorAll('a[href]').forEach(function(a) {
                var href = a.getAttribute('href');
                // Skip external links, anchors, mailto
                if (!href || href.startsWith('http://') || href.startsWith('https://') ||
                    href.startsWith('mailto:') || href.startsWith('#')) return;

                a.addEventListener('click', function(e) {
                    e.preventDefault();
                    var resolved = _resolvePath(currentDir, href);

                    // Try file match first
                    var match = _findZipEntry(zipTree, resolved);
                    if (match) {
                        self._openFileTab(match.path);
                        return;
                    }

                    // BRW-014: Try folder match — expand tree + open first file
                    var folderPath = resolved.replace(/\/$/, '');  // strip trailing slash
                    _navigateToFolder(self, zipTree, folderPath);
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
    // BRW-011: Decode URL-encoded characters (%20 → space, etc.)
    try { resolved = decodeURIComponent(resolved); } catch (_) {}

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


// ─── Fix 6: Save locally produces a valid zip ────────────────────────────────
//
// BRW-009: The "Save locally" button saves zipOrigBytes (the raw decrypted
// content) as a Blob with no MIME type. macOS Archive Utility rejects files
// without a valid zip signature or correct Content-Type.
//
// The root issue: zipOrigBytes comes from the SGMETA-unwrapped content, which
// is the raw bytes that were encrypted. If the original upload was a folder
// (zipped client-side by JSZip), these bytes should be a valid zip. But the
// Blob needs the correct MIME type, and as a safety measure we re-generate
// the zip from the parsed JSZip instance to guarantee a clean archive.

SendBrowse.prototype._setupHeaderListeners = (function(original) {
    return function() {
        // Call original for all other header listeners (copy, email, print, etc.)
        original.call(this);

        // Override the save button handler
        var saveBtn = this.querySelector('#sb-save-zip');
        if (saveBtn) {
            var self = this;
            // Remove existing listeners by replacing the element
            var newBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newBtn, saveBtn);

            newBtn.addEventListener('click', async function() {
                // Re-generate a clean zip from the parsed JSZip instance
                if (self.zipInstance) {
                    try {
                        var zipBlob = await self.zipInstance.generateAsync({
                            type: 'blob',
                            mimeType: 'application/zip',
                            compression: 'DEFLATE',
                            compressionOptions: { level: 6 }
                        });
                        var url = URL.createObjectURL(zipBlob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = self.zipOrigName || 'archive.zip';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        return;
                    } catch (_) { /* fall through to raw bytes */ }
                }

                // Fallback: save raw bytes with correct MIME type
                if (self.zipOrigBytes) {
                    var blob = new Blob([self.zipOrigBytes], { type: 'application/zip' });
                    var url2 = URL.createObjectURL(blob);
                    var a2 = document.createElement('a');
                    a2.href = url2;
                    a2.download = self.zipOrigName || 'archive.zip';
                    document.body.appendChild(a2);
                    a2.click();
                    document.body.removeChild(a2);
                    URL.revokeObjectURL(url2);
                }
            });
        }
    };
})(SendBrowse.prototype._setupHeaderListeners);


// ─── Fix 12: Scrollable tab bar + auto-scroll to new tab ─────────────────────
//
// BRW-015: When many tabs are open, the tab bar overflows and new tabs are
// off-screen. The user can't see, click, or close them.
//
// Fix: Inject CSS into sg-layout's Shadow DOM to make the tab bar scrollable,
// and after opening a new tab, scroll it into view.

(function() {
    var origOpenFileTab = SendBrowse.prototype._openFileTab;

    SendBrowse.prototype._openFileTab = async function(path) {
        // Inject scrollable tab bar CSS (once)
        _injectTabBarScrollCSS(this._sgLayout);

        // Call original
        await origOpenFileTab.call(this, path);

        // Scroll the new tab into view
        var self = this;
        requestAnimationFrame(function() {
            if (!self._sgLayout || !self._sgLayout.shadowRoot) return;

            var tabId = self._openTabs.get(path);
            if (!tabId) return;

            var tabEl = self._sgLayout.shadowRoot.querySelector('.sgl-tab[data-tab-id="' + tabId + '"]');
            if (tabEl) {
                tabEl.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' });
            }
        });
    };
})();

var _tabBarCSSInjected = false;
function _injectTabBarScrollCSS(sgLayout) {
    if (_tabBarCSSInjected || !sgLayout || !sgLayout.shadowRoot) return;

    var style = document.createElement('style');
    style.textContent = [
        '/* v0.3.1: scrollable tab bar */',
        '.sgl-tab-bar {',
        '    overflow-x: auto !important;',
        '    overflow-y: hidden !important;',
        '    flex-wrap: nowrap !important;',
        '    scrollbar-width: thin;',
        '    scrollbar-color: rgba(78,205,196,0.3) transparent;',
        '}',
        '.sgl-tab-bar::-webkit-scrollbar { height: 4px; }',
        '.sgl-tab-bar::-webkit-scrollbar-track { background: transparent; }',
        '.sgl-tab-bar::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.3); border-radius: 2px; }',
        '.sgl-tab-bar::-webkit-scrollbar-thumb:hover { background: rgba(78,205,196,0.5); }',
        '.sgl-tab { flex-shrink: 0 !important; }'
    ].join('\n');

    sgLayout.shadowRoot.appendChild(style);
    _tabBarCSSInjected = true;
}


// ─── BRW-014: Navigate to folder ─────────────────────────────────────────────
//
// When a markdown link points to a folder (e.g. "statements/mbna/"):
// 1. Find the folder in the sidebar tree
// 2. Expand all parent folders
// 3. Scroll the folder into view
// 4. Open the first file in that folder as a tab

function _navigateToFolder(browseInstance, zipTree, folderPath) {
    try { folderPath = decodeURIComponent(folderPath); } catch (_) {}

    // Find files inside this folder
    var folderFiles = zipTree.filter(function(e) {
        if (e.dir) return false;
        if (_isGalleryMetaPath(e.path)) return false;
        return e.path.startsWith(folderPath + '/');
    });

    // Also try ends-with match (zip may have root wrapper)
    if (folderFiles.length === 0) {
        folderFiles = zipTree.filter(function(e) {
            if (e.dir) return false;
            if (_isGalleryMetaPath(e.path)) return false;
            return e.path.includes('/' + folderPath + '/');
        });
    }

    if (folderFiles.length === 0) return;

    // Expand parent folders in the tree by finding and clicking them
    var treeRoot = browseInstance.querySelector('.sb-tree');
    if (treeRoot) {
        // Build the chain of folder paths to expand
        var parts = folderPath.split('/');
        var pathSoFar = '';
        for (var i = 0; i < parts.length; i++) {
            pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i];
            var folderEl = treeRoot.querySelector('.sb-tree__folder[data-path="' + pathSoFar + '"]');

            // Also try ends-with for wrapped zips
            if (!folderEl) {
                var allFolders = treeRoot.querySelectorAll('.sb-tree__folder');
                for (var f = 0; f < allFolders.length; f++) {
                    var dp = allFolders[f].getAttribute('data-path') || '';
                    if (dp === pathSoFar || dp.endsWith('/' + pathSoFar)) {
                        folderEl = allFolders[f];
                        break;
                    }
                }
            }

            if (folderEl) {
                // Expand this folder
                var content = folderEl.querySelector('.sb-tree__folder-content');
                var toggle  = folderEl.querySelector('.sb-tree__toggle');
                if (content && content.style.display === 'none') {
                    content.style.display = '';
                    if (toggle) toggle.textContent = '\u25BE';  // ▾
                    folderEl.classList.add('sb-tree__folder--open');
                }
            }
        }

        // Scroll the deepest folder into view
        var deepest = treeRoot.querySelector('.sb-tree__folder[data-path="' + folderPath + '"]');
        if (!deepest) {
            var all = treeRoot.querySelectorAll('.sb-tree__folder');
            for (var j = 0; j < all.length; j++) {
                var dp2 = all[j].getAttribute('data-path') || '';
                if (dp2 === folderPath || dp2.endsWith('/' + folderPath)) {
                    deepest = all[j];
                    break;
                }
            }
        }
        if (deepest) deepest.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Open the first file in the folder (sorted)
    folderFiles.sort(function(a, b) {
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    });
    browseInstance._openFileTab(folderFiles[0].path);
}


// ─── CSV Parser ──────────────────────────────────────────────────────────────
// Handles quoted fields with commas and newlines inside quotes.

function _csvToTable(text) {
    var rows = _parseCsv(text);
    if (rows.length === 0) return '<p>Empty CSV</p>';

    var html = '<table><thead><tr>';
    var headers = rows[0];
    for (var h = 0; h < headers.length; h++) {
        html += '<th>' + _escHtml(headers[h]) + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var r = 1; r < rows.length; r++) {
        html += '<tr>';
        for (var c = 0; c < headers.length; c++) {
            var val = (c < rows[r].length) ? rows[r][c] : '';
            html += '<td>' + _escHtml(val) + '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function _parseCsv(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;

    while (i < text.length) {
        var ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i += 2;
            } else if (ch === '"') {
                inQuotes = false;
                i++;
            } else {
                field += ch;
                i++;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
                i++;
            } else if (ch === ',') {
                row.push(field.trim());
                field = '';
                i++;
            } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
                row.push(field.trim());
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
                field = '';
                i += (ch === '\r') ? 2 : 1;
            } else {
                field += ch;
                i++;
            }
        }
    }
    // Last field/row
    row.push(field.trim());
    if (row.length > 1 || row[0] !== '') rows.push(row);

    return rows;
}

function _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
