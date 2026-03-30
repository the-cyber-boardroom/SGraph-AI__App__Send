/* =================================================================================
   SGraph Vault — VaultDataSource
   v0.2.0 — Adapter that bridges SGVault into the BrowseDataSource interface.

   Implements the 3-method contract required by send-browse--v0.3.2.js:
     getTree()              → { name, children: { name: TreeNode }, files: [{ path, name, size }] }
     getFileBytes(path)     → Promise<ArrayBuffer>
     getFileList()          → [{ path, name, dir, size }]

   Plus vault-specific extras:
     writable               → true if accessKey is set
     saveFile(path, bytes)  → encrypts + commits
     renameFile(path, old, new) → commits rename
     deleteFile(path, name) → commits delete
     onTreeChanged          → callback for tree refresh after mutations

   Handles lazy sub-tree loading: if a folder hasn't been loaded yet,
   getFileBytes() and getFileList() will load it on demand.
   ================================================================================= */

class VaultDataSource {

    constructor(vaultInstance, accessKey) {
        this._vault     = vaultInstance;
        this._accessKey = accessKey;
        this.writable   = !!accessKey;

        // Callback for vault-shell to refresh UI after mutations
        this.onTreeChanged = null;
    }

    // ─── Required: hierarchical tree ─────────────────────────────────────

    getTree() {
        const root = this._vault._tree['/'];
        return this._convertNode(root, '');
    }

    _convertNode(vaultNode, prefix) {
        const result = { name: vaultNode.name || prefix.split('/').pop() || '', children: {}, files: [] };

        for (const [name, child] of Object.entries(vaultNode.children || {})) {
            const childPath = prefix ? prefix + '/' + name : name;

            if (child.type === 'folder') {
                // If folder is lazy (not yet loaded), still show it as a folder
                // with empty contents — Browse will render it as expandable
                result.children[name] = this._convertNode(child, childPath);

                // Mark lazy folders so Browse can show a loading indicator
                if (child._loaded === false && child._tree_id) {
                    result.children[name]._lazy = true;
                    result.children[name]._folderPath = '/' + childPath;
                }
            } else {
                result.files.push({
                    path: childPath,
                    name: childPath,
                    size: child.size || 0
                });
            }
        }
        return result;
    }

    // ─── Required: file bytes (fetch + decrypt on demand) ────────────────

    async getFileBytes(path) {
        const parts      = path.split('/');
        const fileName   = parts.pop();
        const folderPath = '/' + parts.join('/');

        // Ensure the folder is loaded (lazy sub-tree)
        await this._ensureLoaded(folderPath);

        // getFile returns Uint8Array (decrypted)
        const data = await this._vault.getFile(folderPath === '/' ? '/' : folderPath, fileName);

        // Convert to ArrayBuffer (Browse expects ArrayBuffer)
        if (data instanceof ArrayBuffer) return data;
        if (data.buffer) return data.buffer;
        return new Uint8Array(data).buffer;
    }

    // ─── Required: flat file list ────────────────────────────────────────

    getFileList() {
        const list = [];
        this._flatten(this._vault._tree['/'], '', list);
        return list;
    }

    _flatten(node, prefix, list) {
        for (const [name, child] of Object.entries(node.children || {})) {
            const path = prefix ? prefix + '/' + name : name;
            if (child.type === 'folder') {
                list.push({ path: path + '/', name: path + '/', dir: true, size: 0 });
                this._flatten(child, path, list);
            } else {
                list.push({ path: path, name: path, dir: false, size: child.size || 0 });
            }
        }
    }

    // ─── Lazy sub-tree loading ───────────────────────────────────────────

    async _ensureLoaded(folderPath) {
        if (this._vault.needsLoading(folderPath)) {
            await this._vault.loadSubTreeOnDemand(folderPath);
        }

        // Also ensure all ancestors are loaded
        const parts = folderPath.split('/').filter(Boolean);
        let current = '/';
        for (const part of parts) {
            current = current === '/' ? '/' + part : current + '/' + part;
            if (this._vault.needsLoading(current)) {
                await this._vault.loadSubTreeOnDemand(current);
            }
        }
    }

    // Load a specific folder's children (called by vault-shell when folder is expanded in tree)
    async loadFolder(folderPath) {
        await this._ensureLoaded(folderPath);
    }

    // ─── Optional: vault metadata ────────────────────────────────────────

    getOrigName() {
        return this._vault.name || 'vault';
    }

    getOrigSize() {
        const stats = this._vault.getStats();
        return stats.totalSize || 0;
    }

    // ─── Write operations (vault-specific) ───────────────────────────────

    async saveFile(folderPath, fileName, bytes) {
        if (!this.writable) throw new Error('Read-only: no access key');
        const data = new Uint8Array(bytes);

        // Check if file exists → update, else → add
        const folder = this._vault._findNode(folderPath);
        if (folder && folder.children && folder.children[fileName]) {
            await this._vault.updateFile(folderPath, fileName, data);
        } else {
            await this._vault.addFile(folderPath, fileName, data);
        }

        if (this.onTreeChanged) this.onTreeChanged();
    }

    async renameFile(folderPath, oldName, newName) {
        if (!this.writable) throw new Error('Read-only: no access key');
        await this._vault.renameFile(folderPath, oldName, newName);
        if (this.onTreeChanged) this.onTreeChanged();
    }

    async deleteFile(folderPath, fileName) {
        if (!this.writable) throw new Error('Read-only: no access key');
        await this._vault.removeFile(folderPath, fileName);
        if (this.onTreeChanged) this.onTreeChanged();
    }

    async createFolder(folderPath) {
        if (!this.writable) throw new Error('Read-only: no access key');
        await this._vault.createFolder(folderPath);
        if (this.onTreeChanged) this.onTreeChanged();
    }

    async deleteFolder(folderPath) {
        if (!this.writable) throw new Error('Read-only: no access key');
        await this._vault.removeFolder(folderPath);
        if (this.onTreeChanged) this.onTreeChanged();
    }

    async renameFolder(folderPath, newName) {
        if (!this.writable) throw new Error('Read-only: no access key');
        await this._vault.renameFolder(folderPath, newName);
        if (this.onTreeChanged) this.onTreeChanged();
    }
}

window.VaultDataSource = VaultDataSource;
