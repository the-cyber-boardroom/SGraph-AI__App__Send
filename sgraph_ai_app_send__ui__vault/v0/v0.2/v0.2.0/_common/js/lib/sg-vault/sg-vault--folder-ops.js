/* =================================================================================
   SGraph Vault — Folder Operations
   v0.2.0 — createFolder, listFolder, removeFolder, renameFolder, moveFolder,
             loadSubTreeOnDemand, needsLoading

   Extends SGVault.prototype. Must load after sg-vault.js.
   ================================================================================= */

(function() {
    'use strict';

    Object.assign(SGVault.prototype, {

        async createFolder(folderPath) {
            const parts  = folderPath.split('/').filter(Boolean)
            const name   = parts.pop()
            const parent = this._findNode('/' + parts.join('/'))
            if (!parent || parent.type !== 'folder') {
                throw new Error(`Parent folder not found: /${parts.join('/')}`)
            }
            if (parent.children[name]) throw new Error(`Already exists: ${name}`)
            parent.children[name] = { type: 'folder', children: {} }
            await this._commit(`Create folder ${name}`)
        },

        listFolder(folderPath) {
            const node = this._findNode(folderPath)
            if (!node || node.type !== 'folder') return null
            return Object.entries(node.children).map(([name, entry]) => ({
                name,
                type:         entry.type,
                size:         entry.size || 0,
                content_hash: entry.content_hash || null
            }))
        },

        async removeFolder(folderPath) {
            const parts  = folderPath.split('/').filter(Boolean)
            const name   = parts.pop()
            const parent = this._findNode('/' + parts.join('/'))
            if (!parent || parent.type !== 'folder') throw new Error(`Parent folder not found`)
            if (!parent.children[name]) throw new Error(`Folder not found: ${name}`)
            delete parent.children[name]
            await this._commit(`Remove folder ${name}`)
        },

        async renameFolder(folderPath, newName) {
            const parts   = folderPath.split('/').filter(Boolean)
            const oldName = parts.pop()
            const parent  = this._findNode('/' + parts.join('/'))
            if (!parent || parent.type !== 'folder') throw new Error(`Parent folder not found`)
            if (!parent.children[oldName]) throw new Error(`Folder not found: ${oldName}`)
            if (parent.children[newName]) throw new Error(`Already exists: ${newName}`)
            parent.children[newName] = parent.children[oldName]
            delete parent.children[oldName]
            await this._commit(`Rename folder ${oldName} to ${newName}`)
        },

        async moveFolder(srcPath, destParentPath) {
            const srcParts      = srcPath.split('/').filter(Boolean)
            const folderName    = srcParts.pop()
            const srcParentPath = '/' + srcParts.join('/')
            if (srcParentPath === destParentPath) return

            const srcParent  = this._findNode(srcParentPath)
            if (!srcParent || srcParent.type !== 'folder') throw new Error(`Source parent not found`)
            const folderNode = srcParent.children[folderName]
            if (!folderNode || folderNode.type !== 'folder') throw new Error(`Folder not found: ${folderName}`)

            if (destParentPath === srcPath || destParentPath.startsWith(srcPath + '/')) {
                throw new Error(`Cannot move folder into itself`)
            }

            const destParent = this._findNode(destParentPath)
            if (!destParent || destParent.type !== 'folder') throw new Error(`Destination folder not found: ${destParentPath}`)
            if (destParent.children[folderName]) throw new Error(`Already exists in destination: ${folderName}`)

            destParent.children[folderName] = folderNode
            delete srcParent.children[folderName]
            await this._commit(`Move folder ${folderName}`)
        },

        // --- Lazy Sub-Tree Loading (called by UI when folder is expanded) --------

        async loadSubTreeOnDemand(folderPath) {
            const node = this._findNode(folderPath)
            if (!node || node.type !== 'folder') return false
            if (node._loaded !== false || !node._tree_id) return false

            const subTree = await this._commitManager.loadTree(node._tree_id)
            for (const entry of subTree.entries) {
                if (entry.tree_id) {
                    node.children[entry.name] = {
                        type: 'folder', children: {}, _tree_id: entry.tree_id, _loaded: false
                    }
                } else {
                    node.children[entry.name] = {
                        type: 'file', blob_id: entry.blob_id,
                        size: entry.size || 0, content_hash: entry.content_hash || null
                    }
                }
            }

            node._loaded = true
            delete node._tree_id
            return true
        },

        needsLoading(folderPath) {
            const node = this._findNode(folderPath)
            return node && node.type === 'folder' && node._loaded === false && !!node._tree_id
        }

    });
})();
