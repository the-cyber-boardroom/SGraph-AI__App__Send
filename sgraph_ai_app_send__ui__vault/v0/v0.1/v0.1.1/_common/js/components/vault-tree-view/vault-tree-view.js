/* =============================================================================
   SGraph Vault — Tree View Component
   v0.1.1 — Hierarchical folder tree with file selection

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
        }

        refresh() {
            if (!this._vault) return;
            const treeEl = this.querySelector('.vt-tree');
            if (!treeEl) return;

            const root = this._vault._tree?.tree?.['/'];
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

                if (isFolder) {
                    const hasChildren = Object.keys(entry.children || {}).length > 0;
                    const chevron = hasChildren ? (isExpanded ? '\u25BE' : '\u25B8') : '\u00A0\u00A0';
                    row.innerHTML = `<span class="vt-chevron">${chevron}</span><span class="vt-icon">\uD83D\uDCC1</span><span class="vt-name">${this._escapeHtml(name)}</span>`;

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

                    // Double-click to rename folder
                    row.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        this._startInlineRename(row, name, fullPath, 'folder');
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

                    // Double-click to rename file
                    row.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        this._startInlineRename(row, name, path, 'file');
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
            const name = prompt('Folder name:');
            if (!name || !name.trim()) return;

            const currentPath = this._selectedPath || '/';
            // Determine the target parent folder
            let targetPath = currentPath;
            // If selected path is a file, use its parent
            const node = this._vault._findNode(currentPath);
            if (node && node.type !== 'folder') {
                const parts = currentPath.split('/').filter(Boolean);
                parts.pop();
                targetPath = '/' + parts.join('/');
            }

            const folderPath = targetPath === '/' ? '/' + name.trim() : targetPath + '/' + name.trim();
            try {
                await this._vault.createFolder(folderPath);
                this._expandedPaths.add(targetPath);
                this.refresh();
                window.sgraphVault.messages.success(`Folder "${name.trim()}" created`);
                // Emit key change since tree was saved
                this.dispatchEvent(new CustomEvent('vault-key-changed', { bubbles: true, composed: true }));
            } catch (err) {
                window.sgraphVault.messages.error(err.message);
            }
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
            `;
        }
    }

    customElements.define('vault-tree-view', VaultTreeView);
})();
