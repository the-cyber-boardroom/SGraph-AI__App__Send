/* =============================================================================
   SGraph Vault — SGit View: Tree Tab
   v0.2.0 — Interactive tree explorer + flat entries table

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        _renderTree(container) {
            const vault = this._vault;
            container.innerHTML = `
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Vault Tree</h3>
                    <div class="sgit-interactive-tree"></div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Flat Entries</h3>
                    <div class="sgit-entries"></div>
                </div>
            `;

            const treeEl = container.querySelector('.sgit-interactive-tree');
            if (treeEl && vault._tree) {
                this._buildTreeDOM(treeEl, vault._tree['/'], '/', 0);
            }

            const entriesEl = container.querySelector('.sgit-entries');
            if (entriesEl && vault._flattenTree) {
                const entries = vault._flattenTree();
                if (entries.length === 0) {
                    entriesEl.innerHTML = '<div class="sgit-empty">No entries</div>';
                } else {
                    entriesEl.innerHTML = `
                        <table class="sgit-table">
                            <thead><tr><th>Name</th><th>Size</th><th>Blob ID</th></tr></thead>
                            <tbody>${entries.map(e => `
                                <tr>
                                    <td>${this._esc(e.name)}</td>
                                    <td>${typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(e.size || 0) : (e.size || 0) + ' B'}</td>
                                    <td class="sgit-mono sgit-truncate">${e.blob_id ? `<a class="sgit-obj-link" href="#" data-id="${this._esc(e.blob_id)}">${this._esc(e.blob_id)}</a>` : '--'}</td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    `;
                }
            }
        },

        _buildTreeDOM(parentEl, node, path, depth) {
            if (!node || !node.children) return;

            const isFolder = (e) => e.type === 'folder' || (e.children !== undefined && e.children !== null);
            const entries  = Object.entries(node.children);
            entries.sort(([a, ae], [b, be]) => {
                if (isFolder(ae) && !isFolder(be)) return -1;
                if (!isFolder(ae) && isFolder(be)) return 1;
                return a.localeCompare(b);
            });

            for (const [name, entry] of entries) {
                if (isFolder(entry)) {
                    const childCount = Object.keys(entry.children || {}).length;
                    const row = document.createElement('div');
                    row.className = 'sgit-tree-row';
                    row.style.paddingLeft = (depth * 20 + 8) + 'px';
                    row.style.cursor = 'pointer';
                    row.innerHTML = `<span class="sgit-tree-chevron">\u25B6</span> <span class="sgit-tree-icon" style="font-size:1rem;">\uD83D\uDCC1</span> <span class="sgit-tree-name">${this._esc(name)}/</span> <span class="sgit-tree-meta">(${childCount})</span>`;

                    const childContainer = document.createElement('div');
                    childContainer.style.display = 'none';

                    row.addEventListener('click', () => {
                        const open = childContainer.style.display !== 'none';
                        childContainer.style.display = open ? 'none' : '';
                        row.querySelector('.sgit-tree-chevron').textContent = open ? '\u25B6' : '\u25BC';
                        row.querySelector('.sgit-tree-icon').textContent = open ? '\uD83D\uDCC1' : '\uD83D\uDCC2';
                    });

                    parentEl.appendChild(row);
                    if (childCount > 0) {
                        this._buildTreeDOM(childContainer, entry, path === '/' ? '/' + name : path + '/' + name, depth + 1);
                    } else {
                        const empty = document.createElement('div');
                        empty.className = 'sgit-tree-row';
                        empty.style.paddingLeft = ((depth + 1) * 20 + 8) + 'px';
                        empty.innerHTML = '<span class="sgit-tree-meta">(empty)</span>';
                        childContainer.appendChild(empty);
                    }
                    parentEl.appendChild(childContainer);
                } else {
                    const row = document.createElement('div');
                    row.className = 'sgit-tree-row';
                    row.style.paddingLeft = (depth * 20 + 8) + 'px';
                    const size    = typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(entry.size || 0) : (entry.size || 0) + ' B';
                    const blobLink = entry.blob_id
                        ? `<a class="sgit-obj-link" href="#" data-id="${this._esc(entry.blob_id)}">blob</a>`
                        : '';
                    row.innerHTML = `<span class="sgit-tree-chevron">\u00A0\u00A0</span> <span class="sgit-tree-icon">\uD83D\uDCC4</span> <span class="sgit-tree-name">${this._esc(name)}</span> <span class="sgit-tree-meta">${size}</span> ${blobLink}`;
                    parentEl.appendChild(row);
                }
            }
        }

    });
})();
