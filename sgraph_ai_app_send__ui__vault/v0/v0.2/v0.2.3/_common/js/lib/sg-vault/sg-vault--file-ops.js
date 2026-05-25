/* =================================================================================
   SGraph Vault — File Operations
   v0.2.0 — addFile, updateFile, getFile, removeFile, renameFile, moveFile

   Extends SGVault.prototype. Must load after sg-vault.js.
   ================================================================================= */

(function() {
    'use strict';

    Object.assign(SGVault.prototype, {

        async addFile(folderPath, fileName, fileData) {
            const data = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData

            const encrypted   = await this._sgSend.encrypt(data, this._readKey)
            const blobId      = await this._objectStore.store(encrypted)
            const contentHash = await this._commitManager.computeContentHash(data)

            const folder = this._findNode(folderPath)
            if (!folder || folder.type !== 'folder') throw new Error(`Folder not found: ${folderPath}`)

            folder.children[fileName] = {
                type: 'file', blob_id: blobId,
                size: data.byteLength || data.length, content_hash: contentHash
            }

            this._markDirty(folderPath)
            await this._commit(`Add ${fileName}`)
            return { blobId, fileName, folderPath }
        },

        // --- Batch add: encrypt+store all files, then commit once -----------------
        // items: Array<{ folderPath, fileName, fileData }>
        // Returns: Array<{ blobId, fileName, folderPath }>

        async addFiles(items) {
            if (!items || items.length === 0) return []

            const results = []

            // Encrypt and store all blobs, then mutate the in-memory tree
            for (const item of items) {
                const data = item.fileData instanceof ArrayBuffer
                    ? new Uint8Array(item.fileData) : item.fileData

                const encrypted   = await this._sgSend.encrypt(data, this._readKey)
                const blobId      = await this._objectStore.store(encrypted)
                const contentHash = await this._commitManager.computeContentHash(data)

                const folder = this._findNode(item.folderPath)
                if (!folder || folder.type !== 'folder') {
                    throw new Error(`Folder not found: ${item.folderPath}`)
                }

                folder.children[item.fileName] = {
                    type: 'file', blob_id: blobId,
                    size: data.byteLength || data.length, content_hash: contentHash
                }

                this._markDirty(item.folderPath)
                results.push({ blobId, fileName: item.fileName, folderPath: item.folderPath })
            }

            // Single commit for all files
            const names = items.map(i => i.fileName)
            const message = names.length === 1
                ? `Add ${names[0]}`
                : `Add ${names.length} files: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`
            await this._commit(message)

            return results
        },

        async updateFile(folderPath, fileName, fileData) {
            const data   = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData
            const folder = this._findNode(folderPath)
            if (!folder || folder.type !== 'folder') throw new Error(`Folder not found: ${folderPath}`)
            if (!folder.children[fileName] || folder.children[fileName].type !== 'file') {
                throw new Error(`File not found: ${fileName}`)
            }

            const encrypted   = await this._sgSend.encrypt(data, this._readKey)
            const blobId      = await this._objectStore.store(encrypted)
            const contentHash = await this._commitManager.computeContentHash(data)

            folder.children[fileName] = {
                type: 'file', blob_id: blobId,
                size: data.byteLength || data.length, content_hash: contentHash
            }

            this._markDirty(folderPath)
            await this._commit(`Edit ${fileName}`)
            return { blobId, fileName, folderPath }
        },

        async getFile(folderPath, fileName) {
            const folder = this._findNode(folderPath)
            if (!folder) throw new Error(`Folder not found: ${folderPath}`)
            const entry = folder.children[fileName]
            if (!entry || entry.type !== 'file') throw new Error(`File not found: ${fileName}`)

            const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024
            const encrypted = (entry.size || 0) > LARGE_FILE_THRESHOLD
                ? await this._objectStore.loadLarge(entry.blob_id)
                : await this._objectStore.load(entry.blob_id)
            return SGSendCrypto.decrypt(encrypted, this._readKey)
        },

        async removeFile(folderPath, fileName) {
            const folder = this._findNode(folderPath)
            if (!folder) throw new Error(`Folder not found: ${folderPath}`)
            delete folder.children[fileName]
            this._markDirty(folderPath)
            await this._commit(`Remove ${fileName}`)
        },

        async renameFile(folderPath, oldName, newName) {
            const folder = this._findNode(folderPath)
            if (!folder) throw new Error(`Folder not found: ${folderPath}`)
            if (!folder.children[oldName]) throw new Error(`File not found: ${oldName}`)
            if (folder.children[newName]) throw new Error(`Already exists: ${newName}`)
            folder.children[newName] = folder.children[oldName]
            delete folder.children[oldName]
            this._markDirty(folderPath)
            await this._commit(`Rename ${oldName} to ${newName}`)
        },

        async moveFile(srcFolderPath, fileName, destFolderPath) {
            if (srcFolderPath === destFolderPath) return
            const srcFolder = this._findNode(srcFolderPath)
            if (!srcFolder || srcFolder.type !== 'folder') throw new Error(`Source folder not found: ${srcFolderPath}`)
            const entry = srcFolder.children[fileName]
            if (!entry || entry.type !== 'file') throw new Error(`File not found: ${fileName}`)

            const destFolder = this._findNode(destFolderPath)
            if (!destFolder || destFolder.type !== 'folder') throw new Error(`Destination folder not found: ${destFolderPath}`)
            if (destFolder.children[fileName]) throw new Error(`Already exists in destination: ${fileName}`)

            destFolder.children[fileName] = entry
            delete srcFolder.children[fileName]
            this._markDirty(srcFolderPath)
            this._markDirty(destFolderPath)
            await this._commit(`Move ${fileName}`)
        }

    });
})();
