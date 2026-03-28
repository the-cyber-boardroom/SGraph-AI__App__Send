/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for send-browse.js

   Fixes:
     1. File names in folder tree show basename only (not full zip path)
     2. PDF Present mode button in file action bar (opens in new window)
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
//
// v0.3.0 gap: gallery lightbox has a "Present" button for PDFs (opens in new
// window with #toolbar=1&navpanes=0&view=Fit). Browse view does not.
// This override adds a Present button to the file action bar for PDFs.

SendBrowse.prototype._renderFileContent = (function(original) {
    return function(container, bytes, fileName, type) {
        // Call original to render the base content
        original.call(this, container, bytes, fileName, type);

        // If this is a PDF, add a Present button to the action bar
        if (type === 'pdf') {
            const bar = container.querySelector('.sb-file__actions');
            if (bar) {
                const presentBtn = document.createElement('button');
                presentBtn.className = 'sb-action-btn sb-file__present';
                presentBtn.innerHTML = '&#x26F6; Present';
                presentBtn.title = 'Open PDF in fullscreen presentation mode';
                bar.appendChild(presentBtn);

                // Find the iframe that was just created
                const iframe = container.querySelector('.sb-file__pdf');
                if (iframe) {
                    presentBtn.addEventListener('click', () => {
                        const pdfUrl = iframe.src;
                        const win = window.open(pdfUrl + '#toolbar=1&navpanes=0&view=Fit', '_blank');
                        if (!win && iframe.requestFullscreen) {
                            iframe.requestFullscreen();
                        }
                    });
                }
            }
        }
    };
})(SendBrowse.prototype._renderFileContent);
