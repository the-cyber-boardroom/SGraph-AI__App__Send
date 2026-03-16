/* =============================================================================
   SGraph Vault — Tree View Component
   v0.1.2 — Hierarchical folder tree with file selection

   Light DOM component for the left sidebar. Renders a collapsible folder tree
   from the vault's tree structure. Clicking a file emits 'tree-file-selected',
   clicking a folder emits 'tree-folder-selected'.
   ============================================================================= */

(function() {
    'use strict';

    class VaultTreeView extends HTMLElement {

        constructor() {
            super();
            this._vault       = null;
            this._expandedPaths = new Set(['/']);
            this._selectedPath  = null;
            this._dragging      = null;  // { path, name, type, parentPath }
        }

        set vault(v) {
            this._vault = v;
        }

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vt-container">
                    <div class="vt-header">
                        <span class="vt-title">Files</span>
                        <button class="vt-new-folder-btn" title="New Folder">+</button>
                    </div>
                    <div class="vt-tree"></div>
                </div>
            `;

            this.querySelector('.vt-new-folder-btn').addEventListener('click', () => {
                this._onNewFolder();
            });

            // Inject context menu styles into document head (once)
            if (!document.getElementById('vt-context-styles')) {
                const style = document.createElement('style');
                style.id = 'vt-context-styles';
                style.textContent = VaultTreeView.contextMenuStyles;
                document.head.appendChild(style);
            }

            // Close context menu on any outside click
            document.addEventListener('click', () => this._closeContextMenu());
            document.addEventListener('contextmenu', () => this._closeContextMenu());

            // Root folder is a drop target (drop items to move to /)
            const treeEl = this.querySelector('.vt-tree');
            treeEl.addEventListener('dragover', (e) => {
                if (!this._dragging) return;
                // Only handle drops on the tree container itself (not on child rows)
                if (e.target !== treeEl) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            treeEl.addEventListener('drop', (e) => {
                if (!this._dragging || e.target !== treeEl) return;
                e.preventDefault();
                this._handleDrop('/');
            });
        }

        refresh() {
            if (!this._vault) return;
            const treeEl = this.querySelector('.vt-tree');
            if (!treeEl) return;

            const root = this._vault._tree?.['/'];
            if (!root) {
                treeEl.innerHTML = '<div class="vt-empty">Empty vault</div>';
                return;
            }

            treeEl.innerHTML = '';
            this._renderNode(treeEl, root, '/', 0);
        }

        _renderNode(parentEl, node, path, depth) {
            if (!node || node.type !== 'folder') return;

            const entries = Object.entries(node.children || {});

            // Sort: folders first, then alphabetical
            entries.sort(([aName, aEntry], [bName, bEntry]) => {
                if (aEntry.type === 'folder' && bEntry.type !== 'folder') return -1;
                if (aEntry.type !== 'folder' && bEntry.type === 'folder') return 1;
                return aName.localeCompare(bName);
            });

            for (const [name, entry] of entries) {
                const fullPath = path === '/' ? '/' + name : path + '/' + name;
                const isFolder = entry.type === 'folder';
                const isExpanded = this._expandedPaths.has(fullPath);
                const isSelected = this._selectedPath === fullPath;

                const row = document.createElement('div');
                row.className = `vt-row ${isSelected ? 'vt-row--selected' : ''}`;
                row.style.paddingLeft = (depth * 16 + 8) + 'px';
                row.dataset.path = fullPath;
                row.dataset.type = entry.type;
                row.dataset.name = name;
                row.setAttribute('draggable', 'true');

                // --- Drag source (all items) ---
                row.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    this._dragging = {
                        path:       fullPath,
                        name:       name,
                        type:       entry.type,
                        parentPath: path
                    };
                    row.classList.add('vt-row--dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', fullPath);
                });
                row.addEventListener('dragend', () => {
                    row.classList.remove('vt-row--dragging');
                    this._dragging = null;
                    this.querySelectorAll('.vt-row--drop-target').forEach(n =>
                        n.classList.remove('vt-row--drop-target')
                    );
                });

                if (isFolder) {
                    const hasChildren = Object.keys(entry.children || {}).length > 0;
                    const chevron = hasChildren ? (isExpanded ? '\u25BE' : '\u25B8') : '\u00A0\u00A0';
                    row.innerHTML = `<span class="vt-chevron">${chevron}</span><span class="vt-icon">\uD83D\uDCC1</span><span class="vt-name">${this._escapeHtml(name)}</span>`;

                    // --- Drop target (folders only) ---
                    row.addEventListener('dragover', (e) => {
                        if (!this._dragging) return;
                        if (this._dragging.path === fullPath) return;  // can't drop on self
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        row.classList.add('vt-row--drop-target');
                    });
                    row.addEventListener('dragleave', () => {
                        row.classList.remove('vt-row--drop-target');
                    });
                    row.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        row.classList.remove('vt-row--drop-target');
                        this._handleDrop(fullPath);
                    });

                    // Single click: toggle expand + select folder
                    row.addEventListener('click', () => {
                        if (isExpanded) {
                            this._expandedPaths.delete(fullPath);
                        } else {
                            this._expandedPaths.add(fullPath);
                        }
                        this._selectedPath = fullPath;
                        this.refresh();
                        this.dispatchEvent(new CustomEvent('tree-folder-selected', {
                            detail: { path: fullPath },
                            bubbles: true, composed: true
                        }));
                    });

                    // Right-click: context menu with rename/delete
                    row.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._showContextMenu(e.pageX, e.pageY, name, fullPath, 'folder');
                    });
                } else {
                    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
                    const icon = this._getFileIcon(ext);
                    row.innerHTML = `<span class="vt-chevron">\u00A0\u00A0</span><span class="vt-icon">${icon}</span><span class="vt-name">${this._escapeHtml(name)}</span>`;

                    row.addEventListener('click', () => {
                        this._selectedPath = fullPath;
                        this.refresh();
                        this.dispatchEvent(new CustomEvent('tree-file-selected', {
                            detail: {
                                folderPath: path,
                                fileName: name,
                                fileEntry: entry
                            },
                            bubbles: true, composed: true
                        }));
                    });

                    // Right-click: context menu with rename/delete
                    row.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._showContextMenu(e.pageX, e.pageY, name, path, 'file');
                    });
                }

                parentEl.appendChild(row);

                // Recurse into expanded folders
                if (isFolder && isExpanded) {
                    this._renderNode(parentEl, entry, fullPath, depth + 1);
                }
            }
        }

        _getFileIcon(ext) {
            const iconMap = {
                'md': '\uD83D\uDCDD', 'markdown': '\uD83D\uDCDD',
                'png': '\uD83D\uDDBC', 'jpg': '\uD83D\uDDBC', 'jpeg': '\uD83D\uDDBC', 'gif': '\uD83D\uDDBC', 'svg': '\uD83D\uDDBC', 'webp': '\uD83D\uDDBC',
                'pdf': '\uD83D\uDCC4',
                'js': '\uD83D\uDCBB', 'ts': '\uD83D\uDCBB', 'py': '\uD83D\uDCBB', 'json': '\uD83D\uDCBB', 'html': '\uD83D\uDCBB', 'css': '\uD83D\uDCBB',
                'mp3': '\uD83C\uDFB5', 'wav': '\uD83C\uDFB5', 'ogg': '\uD83C\uDFB5',
                'mp4': '\uD83C\uDFA5', 'webm': '\uD83C\uDFA5', 'mov': '\uD83C\uDFA5',
                'zip': '\uD83D\uDCE6',
            };
            return iconMap[ext] || '\uD83D\uDCC4';
        }

        async _onNewFolder() {
            if (!this._vault) return;

            const currentPath = this._selectedPath || '/';
            // Determine the target parent folder
            let targetPath = currentPath;
            const node = this._vault._findNode(currentPath);
            if (node && node.type !== 'folder') {
                const parts = currentPath.split('/').filter(Boolean);
                parts.pop();
                targetPath = '/' + parts.join('/');
            }

            // Expand parent so the new inline row is visible
            this._expandedPaths.add(targetPath);
            this.refresh();

            // Find the container where child rows live
            const treeEl = this.querySelector('.vt-tree');
            if (!treeEl) return;

            // Find the insert position: after the parent folder row, or at end
            let insertBefore = null;
            if (targetPath !== '/') {
                const parentRow = treeEl.querySelector(`[data-path="${CSS.escape(targetPath)}"]`);
                if (parentRow) {
                    // Skip over all children of this parent to find the insert spot
                    let sibling = parentRow.nextElementSibling;
                    while (sibling && sibling.classList.contains('vt-row')) {
                        const siblingPath = sibling.dataset.path || '';
                        if (!siblingPath.startsWith(targetPath + '/') && siblingPath !== targetPath) break;
                        sibling = sibling.nextElementSibling;
                    }
                    insertBefore = sibling;
                }
            }

            // Calculate depth
            const depth = targetPath === '/' ? 0 : targetPath.split('/').filter(Boolean).length;

            // Create inline input row
            const row = document.createElement('div');
            row.className = 'vt-row vt-row--new-folder';
            row.style.paddingLeft = (depth * 16 + 8) + 'px';
            row.innerHTML = `<span class="vt-chevron">\u00A0\u00A0</span><span class="vt-icon">\uD83D\uDCC1</span>`;

            const input = document.createElement('input');
            input.className = 'vt-rename-input';
            input.placeholder = 'folder name';
            input.style.cssText = 'flex:1; padding:1px 4px; font-size:inherit; font-family:inherit; background:var(--bg-primary); border:1px solid var(--color-primary); border-radius:3px; color:var(--color-text); outline:none;';
            row.appendChild(input);

            if (insertBefore) {
                treeEl.insertBefore(row, insertBefore);
            } else {
                treeEl.appendChild(row);
            }

            input.focus();

            const commit = async () => {
                const name = input.value.trim();
                row.remove();
                if (!name) return;

                const folderPath = targetPath === '/' ? '/' + name : targetPath + '/' + name;
                try {
                    await this._vault.createFolder(folderPath);
                    this._expandedPaths.add(targetPath);
                    this.refresh();
                    window.sgraphVault.messages.success(`Folder "${name}" created`);
                    this.dispatchEvent(new CustomEvent('vault-key-changed', { bubbles: true, composed: true }));
                } catch (err) {
                    window.sgraphVault.messages.error(err.message);
                }
            };

            const cancel = () => { row.remove(); };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.stopPropagation(); commit(); }
                if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
            });
            input.addEventListener('blur', () => commit());
            input.addEventListener('click', (e) => e.stopPropagation());
        }

        _startInlineRename(row, currentName, parentPath, type) {
            const nameEl = row.querySelector('.vt-name');
            if (!nameEl) return;

            const input = document.createElement('input');
            input.className = 'vt-rename-input';
            input.value = currentName;
            input.style.cssText = 'flex:1; padding:1px 4px; font-size:inherit; font-family:inherit; background:var(--bg-primary); border:1px solid var(--color-primary); border-radius:3px; color:var(--color-text); outline:none;';

            nameEl.style.display = 'none';
            nameEl.parentNode.insertBefore(input, nameEl.nextSibling);
            input.focus();

            if (type === 'file') {
                const dotIndex = currentName.lastIndexOf('.');
                input.setSelectionRange(0, dotIndex > 0 ? dotIndex : currentName.length);
            } else {
                input.select();
            }

            const commit = () => {
                const newName = input.value.trim();
                input.remove();
                nameEl.style.display = '';
                if (!newName || newName === currentName) return;

                if (type === 'folder') {
                    this.dispatchEvent(new CustomEvent('folder-rename-request', {
                        detail: { oldPath: parentPath, newName },
                        bubbles: true, composed: true
                    }));
                } else {
                    this.dispatchEvent(new CustomEvent('file-rename-request', {
                        detail: { oldName: currentName, newName, folderPath: parentPath },
                        bubbles: true, composed: true
                    }));
                }
            };

            const cancel = () => {
                input.remove();
                nameEl.style.display = '';
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.stopPropagation(); commit(); }
                if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
            });
            input.addEventListener('blur', () => commit());
            input.addEventListener('click', (e) => e.stopPropagation());
        }

        // --- Context Menu --------------------------------------------------------

        _showContextMenu(x, y, name, pathOrParent, type) {
            this._closeContextMenu();

            const menu = document.createElement('div');
            menu.className = 'vt-context-menu';
            menu.style.left = x + 'px';
            menu.style.top  = y + 'px';

            const renameBtn = document.createElement('div');
            renameBtn.className = 'vt-context-item';
            renameBtn.textContent = 'Rename';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeContextMenu();
                // Find the row and start inline rename
                const fullPath = type === 'folder' ? pathOrParent : pathOrParent + (pathOrParent === '/' ? '' : '/') + name;
                const selector = type === 'folder'
                    ? `[data-path="${CSS.escape(pathOrParent)}"]`
                    : `[data-path="${CSS.escape(fullPath)}"]`;
                const row = this.querySelector(selector);
                if (row) this._startInlineRename(row, name, pathOrParent, type);
            });

            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'vt-context-item vt-context-item--danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeContextMenu();
                if (type === 'folder') {
                    this.dispatchEvent(new CustomEvent('folder-delete-request', {
                        detail: { folderPath: pathOrParent },
                        bubbles: true, composed: true
                    }));
                } else {
                    this.dispatchEvent(new CustomEvent('file-delete-request', {
                        detail: { fileName: name, folderPath: pathOrParent },
                        bubbles: true, composed: true
                    }));
                }
            });

            menu.appendChild(renameBtn);
            menu.appendChild(deleteBtn);
            document.body.appendChild(menu);
            this._contextMenu = menu;

            // Adjust if menu goes off-screen
            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
                if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
            });
        }

        _closeContextMenu() {
            if (this._contextMenu) {
                this._contextMenu.remove();
                this._contextMenu = null;
            }
        }

        _handleDrop(destFolderPath) {
            if (!this._dragging) return;
            const { path, name, type, parentPath } = this._dragging;
            this._dragging = null;

            if (type === 'file') {
                this.dispatchEvent(new CustomEvent('file-move-request', {
                    detail: { fileName: name, srcFolderPath: parentPath, destFolderPath },
                    bubbles: true, composed: true
                }));
            } else {
                this.dispatchEvent(new CustomEvent('folder-move-request', {
                    detail: { srcPath: path, destParentPath: destFolderPath },
                    bubbles: true, composed: true
                }));
            }
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        getStyles() {
            return `
                .vt-container { height: 100%; display: flex; flex-direction: column; }
                .vt-header { display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0.75rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
                .vt-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
                .vt-new-folder-btn { font-size: var(--text-body); padding: 0 0.375rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; line-height: 1.4; }
                .vt-new-folder-btn:hover { background: var(--bg-secondary); color: var(--color-primary); }
                .vt-tree { flex: 1; overflow-y: auto; padding: 0.375rem 0; }
                .vt-empty { padding: 1rem; text-align: center; color: var(--color-text-secondary); font-size: var(--text-small); }
                .vt-row { display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; cursor: pointer; font-size: var(--text-sm); color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 2px solid transparent; }
                .vt-row:hover { background: var(--bg-secondary); }
                .vt-row--selected { background: rgba(78, 205, 196, 0.08); border-left-color: var(--color-primary); color: var(--color-primary); }
                .vt-chevron { font-size: 0.6rem; flex-shrink: 0; width: 0.75rem; text-align: center; color: var(--color-text-secondary); }
                .vt-icon { flex-shrink: 0; font-size: 0.875rem; }
                .vt-name { overflow: hidden; text-overflow: ellipsis; }
                .vt-row[draggable="true"] { cursor: grab; }
                .vt-row[draggable="true"]:active { cursor: grabbing; }
                .vt-row--dragging { opacity: 0.4; }
                .vt-row--drop-target { outline: 2px dashed var(--color-primary, #4ECDC4); outline-offset: -2px; background: rgba(78, 205, 196, 0.08); border-radius: 3px; }
            `;
        }

        static get contextMenuStyles() {
            // Injected once into document head for the context menu (which lives in document.body)
            return `
                .vt-context-menu { position: fixed; z-index: 9999; min-width: 120px; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15)); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); padding: 4px 0; font-size: 0.8125rem; font-family: inherit; }
                .vt-context-item { padding: 6px 12px; cursor: pointer; color: var(--color-text, #E0E0E0); white-space: nowrap; }
                .vt-context-item:hover { background: var(--accent-subtle, rgba(78, 205, 196, 0.12)); color: var(--accent, #4ECDC4); }
                .vt-context-item--danger:hover { background: rgba(233, 69, 96, 0.1); color: var(--danger, #E94560); }
            `;
        }
    }

    customElements.define('vault-tree-view', VaultTreeView);
})();
