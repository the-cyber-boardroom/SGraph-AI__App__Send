/* =================================================================================
   SGraph Vault — Client-Side Encrypted Vault Logic
   v0.1.0 — Vault operations on top of sg-send.js transfer API

   A vault is a collection of encrypted transfers. The server sees only encrypted
   blobs with hex IDs — it has no concept of vaults, folders, or file names.

   Vault structure (all encrypted, stored as transfers):
     - settings: vault metadata (name, id, created, tree pointer)
     - tree:     folder/file hierarchy with transfer ID references

   Vault key format (shareable): {passphrase}:{vault_id}:{settings_transfer_id}
   KDF salt: sg-vault-v1:{vault_id}

   Depends on: SGSend (sg-send.js), SGSendCrypto (sg-send-crypto.js)
   ================================================================================= */

class SGVault {

    constructor(sgSend) {
        this._sgSend             = sgSend
        this._derivedKey         = null
        this._vaultId            = null
        this._settings           = null
        this._tree               = null
        this._settingsTransferId = null
        this._treeTransferId     = null
    }

    // --- Vault Lifecycle ------------------------------------------------------

    static async create(sgSend, passphrase, options = {}) {
        const vault = new SGVault(sgSend)

        // 1. Generate vault ID (8 hex chars)
        vault._vaultId = Array.from(crypto.getRandomValues(new Uint8Array(4)))
            .map(b => b.toString(16).padStart(2, '0')).join('')

        // 2. Derive AES key from passphrase + vault ID
        vault._derivedKey = await sgSend.deriveKey(
            passphrase,
            `sg-vault-v1:${vault._vaultId}`
        )

        // 3. Create settings
        vault._settings = {
            vault_name:        options.name || 'Untitled Vault',
            vault_id:          vault._vaultId,
            created:           new Date().toISOString(),
            version:           1,
            description:       options.description || '',
            _tree_transfer_id: null
        }

        // 4. Create initial empty tree
        vault._tree = {
            version: 1,
            updated: new Date().toISOString(),
            tree: { '/': { type: 'folder', children: {} } }
        }

        // 5. Encrypt and upload tree
        const treeData      = new TextEncoder().encode(JSON.stringify(vault._tree))
        const encryptedTree = await sgSend.encrypt(treeData, vault._derivedKey)
        const treeResult    = await sgSend.upload(new Uint8Array(encryptedTree))
        vault._treeTransferId = treeResult.transferId

        // 6. Store tree pointer in settings, encrypt and upload settings
        vault._settings._tree_transfer_id = vault._treeTransferId
        const settingsData      = new TextEncoder().encode(JSON.stringify(vault._settings))
        const encryptedSettings = await sgSend.encrypt(settingsData, vault._derivedKey)
        const settingsResult    = await sgSend.upload(new Uint8Array(encryptedSettings))
        vault._settingsTransferId = settingsResult.transferId

        return vault
    }

    static async open(sgSend, fullVaultKey) {
        // Parse vault key: "passphrase:vaultId:settingsTransferId"
        const parts = fullVaultKey.split(':')
        if (parts.length < 3) {
            throw new Error('Invalid vault key format. Expected passphrase:vaultId:settingsTransferId')
        }
        const settingsId = parts.pop()
        const vaultId    = parts.pop()
        const passphrase = parts.join(':')   // passphrase may contain colons

        const vault = new SGVault(sgSend)
        vault._vaultId            = vaultId
        vault._settingsTransferId = settingsId

        // Derive AES key
        vault._derivedKey = await sgSend.deriveKey(
            passphrase,
            `sg-vault-v1:${vaultId}`
        )

        // Download and decrypt settings
        const encSettings   = await sgSend.download(settingsId)
        const settingsPlain = await sgSend.decrypt(encSettings, vault._derivedKey)
        vault._settings     = JSON.parse(new TextDecoder().decode(settingsPlain))

        // Download and decrypt tree
        vault._treeTransferId = vault._settings._tree_transfer_id
        await vault._loadTree()

        return vault
    }

    // --- Vault Key ------------------------------------------------------------

    getVaultKey(passphrase) {
        return `${passphrase}:${this._vaultId}:${this._settingsTransferId}`
    }

    get vaultId()   { return this._vaultId                  }
    get name()      { return this._settings?.vault_name     }
    get created()   { return this._settings?.created        }

    // --- File Operations ------------------------------------------------------

    async addFile(folderPath, fileName, fileData) {
        const encrypted = await this._sgSend.encrypt(
            fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData,
            this._derivedKey
        )
        const result = await this._sgSend.upload(new Uint8Array(encrypted))
        const fileId = result.transferId

        const folder = this._findNode(folderPath)
        if (!folder || folder.type !== 'folder') {
            throw new Error(`Folder not found: ${folderPath}`)
        }

        folder.children[fileName] = {
            type:     'file',
            file_id:  fileId,
            size:     fileData.byteLength || fileData.length,
            uploaded: new Date().toISOString()
        }

        await this._saveTree()
        return { fileId, fileName, folderPath }
    }

    async getFile(folderPath, fileName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)
        const entry = folder.children[fileName]
        if (!entry || entry.type !== 'file') throw new Error(`File not found: ${fileName}`)

        const encrypted = await this._sgSend.download(entry.file_id)
        return this._sgSend.decrypt(encrypted, this._derivedKey)
    }

    async removeFile(folderPath, fileName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)
        delete folder.children[fileName]
        await this._saveTree()
    }

    async renameFile(folderPath, oldName, newName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)
        if (!folder.children[oldName]) throw new Error(`File not found: ${oldName}`)
        if (folder.children[newName]) throw new Error(`Already exists: ${newName}`)
        folder.children[newName] = folder.children[oldName]
        delete folder.children[oldName]
        await this._saveTree()
    }

    // --- Folder Operations ----------------------------------------------------

    async createFolder(folderPath) {
        const parts  = folderPath.split('/').filter(Boolean)
        const name   = parts.pop()
        const parent = this._findNode('/' + parts.join('/'))
        if (!parent || parent.type !== 'folder') {
            throw new Error(`Parent folder not found: /${parts.join('/')}`)
        }
        if (parent.children[name]) {
            throw new Error(`Already exists: ${name}`)
        }
        parent.children[name] = { type: 'folder', children: {} }
        await this._saveTree()
    }

    listFolder(folderPath) {
        const node = this._findNode(folderPath)
        if (!node || node.type !== 'folder') return null
        return Object.entries(node.children).map(([name, entry]) => ({
            name,
            type:     entry.type,
            size:     entry.size || 0,
            uploaded: entry.uploaded || null
        }))
    }

    async removeFolder(folderPath) {
        const parts  = folderPath.split('/').filter(Boolean)
        const name   = parts.pop()
        const parent = this._findNode('/' + parts.join('/'))
        if (!parent || parent.type !== 'folder') {
            throw new Error(`Parent folder not found`)
        }
        if (!parent.children[name]) {
            throw new Error(`Folder not found: ${name}`)
        }
        delete parent.children[name]
        await this._saveTree()
    }

    async renameFolder(folderPath, newName) {
        const parts  = folderPath.split('/').filter(Boolean)
        const oldName = parts.pop()
        const parent = this._findNode('/' + parts.join('/'))
        if (!parent || parent.type !== 'folder') {
            throw new Error(`Parent folder not found`)
        }
        if (!parent.children[oldName]) {
            throw new Error(`Folder not found: ${oldName}`)
        }
        if (parent.children[newName]) {
            throw new Error(`Already exists: ${newName}`)
        }
        parent.children[newName] = parent.children[oldName]
        delete parent.children[oldName]
        await this._saveTree()
    }

    async moveFile(srcFolderPath, fileName, destFolderPath) {
        if (srcFolderPath === destFolderPath) return
        const srcFolder  = this._findNode(srcFolderPath)
        if (!srcFolder || srcFolder.type !== 'folder') throw new Error(`Source folder not found: ${srcFolderPath}`)
        const entry = srcFolder.children[fileName]
        if (!entry || entry.type !== 'file') throw new Error(`File not found: ${fileName}`)

        const destFolder = this._findNode(destFolderPath)
        if (!destFolder || destFolder.type !== 'folder') throw new Error(`Destination folder not found: ${destFolderPath}`)
        if (destFolder.children[fileName]) throw new Error(`Already exists in destination: ${fileName}`)

        destFolder.children[fileName] = entry
        delete srcFolder.children[fileName]
        await this._saveTree()
    }

    async moveFolder(srcPath, destParentPath) {
        const srcParts  = srcPath.split('/').filter(Boolean)
        const folderName = srcParts.pop()
        const srcParentPath = '/' + srcParts.join('/')
        if (srcParentPath === destParentPath) return

        const srcParent = this._findNode(srcParentPath)
        if (!srcParent || srcParent.type !== 'folder') throw new Error(`Source parent not found`)
        const folderNode = srcParent.children[folderName]
        if (!folderNode || folderNode.type !== 'folder') throw new Error(`Folder not found: ${folderName}`)

        // Prevent moving a folder into itself or its descendants
        if (destParentPath === srcPath || destParentPath.startsWith(srcPath + '/')) {
            throw new Error(`Cannot move folder into itself`)
        }

        const destParent = this._findNode(destParentPath)
        if (!destParent || destParent.type !== 'folder') throw new Error(`Destination folder not found: ${destParentPath}`)
        if (destParent.children[folderName]) throw new Error(`Already exists in destination: ${folderName}`)

        destParent.children[folderName] = folderNode
        delete srcParent.children[folderName]
        await this._saveTree()
    }

    // --- Stats ----------------------------------------------------------------

    getStats() {
        let files = 0, folders = 0, totalSize = 0
        const walk = (node) => {
            for (const [, entry] of Object.entries(node.children || {})) {
                if (entry.type === 'folder') {
                    folders++
                    walk(entry)
                } else {
                    files++
                    totalSize += entry.size || 0
                }
            }
        }
        walk(this._tree.tree['/'])
        return { files, folders, totalSize }
    }

    // --- Tree Management (internal) -------------------------------------------

    _findNode(path) {
        const parts = path.split('/').filter(Boolean)
        let node    = this._tree.tree['/']
        for (const part of parts) {
            if (!node || node.type !== 'folder' || !node.children[part]) return null
            node = node.children[part]
        }
        return node
    }

    async _loadTree() {
        const encrypted = await this._sgSend.download(this._treeTransferId)
        const plain     = await this._sgSend.decrypt(encrypted, this._derivedKey)
        this._tree      = JSON.parse(new TextDecoder().decode(plain))
    }

    async _saveTree() {
        this._tree.version = (this._tree.version || 0) + 1
        this._tree.updated = new Date().toISOString()

        const treeData      = new TextEncoder().encode(JSON.stringify(this._tree))
        const encrypted     = await this._sgSend.encrypt(treeData, this._derivedKey)
        const result        = await this._sgSend.upload(new Uint8Array(encrypted))
        this._treeTransferId = result.transferId

        // Update settings to point to new tree, re-upload
        this._settings._tree_transfer_id = this._treeTransferId
        const settingsData  = new TextEncoder().encode(JSON.stringify(this._settings))
        const encSettings   = await this._sgSend.encrypt(settingsData, this._derivedKey)
        const settingsResult = await this._sgSend.upload(new Uint8Array(encSettings))
        this._settingsTransferId = settingsResult.transferId
    }
}
