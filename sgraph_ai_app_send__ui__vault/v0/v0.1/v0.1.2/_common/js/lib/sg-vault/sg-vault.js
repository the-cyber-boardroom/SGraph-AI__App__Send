/* =================================================================================
   SGraph Vault — Client-Side Encrypted Vault Logic
   v0.1.2 — Deterministic vault pointers with read/write key separation

   A vault is a collection of encrypted files stored via the vault pointer API.
   The server sees only encrypted blobs — it has no concept of folders or file names.

   Vault structure (all encrypted, stored as vault pointer files):
     - settings: vault metadata (name, id, created, tree pointer)
     - tree:     folder/file hierarchy with file ID references

   Vault key format: {passphrase}:{vault_id}
   Key derivation: SGVaultCrypto.deriveKeys() → read_key, write_key, file IDs

   Compatible with sg-send-cli v0.5.x (same tree format, same crypto, same API).

   Depends on: SGSend (sg-send.js), SGSendCrypto (sg-send-crypto.js),
               SGVaultCrypto (sg-vault-crypto.js)
   ================================================================================= */

class SGVault {

    constructor(sgSend) {
        this._sgSend             = sgSend
        this._passphrase         = null
        this._readKey            = null                                         // AES-256-GCM CryptoKey
        this._writeKey           = null                                         // Hex string for server auth
        this._vaultId            = null
        this._settings           = null
        this._tree               = null
        this._treeFileId         = null                                         // Deterministic (from HMAC)
        this._settingsFileId     = null                                         // Deterministic (from HMAC)
        this._refFileId          = null                                         // Deterministic (from HMAC)
    }

    // --- Vault Lifecycle ------------------------------------------------------

    static async create(sgSend, passphrase, options = {}) {
        const vault = new SGVault(sgSend)
        vault._passphrase = passphrase

        // 1. Generate vault ID (8 lowercase alphanumeric chars — matches sg-send-cli format)
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
        const bytes    = crypto.getRandomValues(new Uint8Array(8))
        vault._vaultId = Array.from(bytes).map(b => alphabet[b % alphabet.length]).join('')

        // 2. Derive all keys and deterministic file IDs
        const keys = await SGVaultCrypto.deriveKeys(passphrase, vault._vaultId)
        vault._readKey        = keys.readKey
        vault._writeKey       = keys.writeKey
        vault._treeFileId     = keys.treeFileId
        vault._settingsFileId = keys.settingsFileId
        vault._refFileId      = keys.refFileId

        // 3. Create settings
        vault._settings = {
            vault_name:  options.name || 'Untitled Vault',
            vault_id:    vault._vaultId,
            created:     new Date().toISOString(),
            version:     1,
            description: options.description || ''
        }

        // 4. Create initial empty tree
        vault._tree = {
            version: 1,
            updated: new Date().toISOString(),
            tree: { '/': { type: 'folder', children: {} } }
        }

        // 5. Save tree and settings via vault pointer API (overwrite in-place)
        await vault._saveTree()

        return vault
    }

    static async open(sgSend, fullVaultKey) {
        // Parse vault key: "{passphrase}:{vault_id}"
        const { passphrase, vaultId } = SGVaultCrypto.parseVaultKey(fullVaultKey)

        const vault = new SGVault(sgSend)
        vault._passphrase = passphrase
        vault._vaultId    = vaultId

        // Derive all keys and deterministic file IDs
        const keys = await SGVaultCrypto.deriveKeys(passphrase, vaultId)
        vault._readKey        = keys.readKey
        vault._writeKey       = keys.writeKey
        vault._treeFileId     = keys.treeFileId
        vault._settingsFileId = keys.settingsFileId
        vault._refFileId      = keys.refFileId

        // Download and decrypt settings + tree in parallel
        const [encSettings, encTree] = await Promise.all([
            sgSend.vaultRead(vaultId, vault._settingsFileId),
            sgSend.vaultRead(vaultId, vault._treeFileId)
        ])

        if (!encSettings) throw new Error('Vault not found: settings file missing')
        if (!encTree)     throw new Error('Vault not found: tree file missing')

        const settingsPlain = await sgSend.decrypt(encSettings, vault._readKey)
        vault._settings     = JSON.parse(new TextDecoder().decode(settingsPlain))

        const treePlain = await sgSend.decrypt(encTree, vault._readKey)
        vault._tree     = JSON.parse(new TextDecoder().decode(treePlain))

        return vault
    }

    // --- Vault Key ------------------------------------------------------------

    getVaultKey() {
        return `${this._passphrase}:${this._vaultId}`
    }

    get vaultId()   { return this._vaultId                  }
    get name()      { return this._settings?.vault_name     }
    get created()   { return this._settings?.created        }

    // --- File Operations ------------------------------------------------------

    async addFile(folderPath, fileName, fileData) {
        const data = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData
        const encrypted = await this._sgSend.encrypt(data, this._readKey)

        // Generate a random file ID for user files (not deterministic)
        const fileId = Array.from(crypto.getRandomValues(new Uint8Array(6)))
            .map(b => b.toString(16).padStart(2, '0')).join('')

        await this._sgSend.vaultWrite(this._vaultId, fileId, this._writeKey, new Uint8Array(encrypted))

        const folder = this._findNode(folderPath)
        if (!folder || folder.type !== 'folder') {
            throw new Error(`Folder not found: ${folderPath}`)
        }

        folder.children[fileName] = {
            type:     'file',
            file_id:  fileId,
            size:     data.byteLength || data.length,
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

        const encrypted = await this._sgSend.vaultRead(this._vaultId, entry.file_id)
        if (!encrypted) throw new Error(`File data not found on server: ${entry.file_id}`)
        return this._sgSend.decrypt(encrypted, this._readKey)
    }

    async removeFile(folderPath, fileName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)
        const entry = folder.children[fileName]

        // Delete from server if file_id is present
        if (entry?.file_id) {
            await this._sgSend.vaultDelete(this._vaultId, entry.file_id, this._writeKey)
        }

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

    async _saveTree() {
        this._tree.version = (this._tree.version || 0) + 1
        this._tree.updated = new Date().toISOString()

        // Encrypt tree and overwrite in-place (no new transfer IDs, no orphans)
        const treeData      = new TextEncoder().encode(JSON.stringify(this._tree))
        const encryptedTree = await this._sgSend.encrypt(treeData, this._readKey)
        await this._sgSend.vaultWrite(this._vaultId, this._treeFileId, this._writeKey, new Uint8Array(encryptedTree))

        // Encrypt settings and overwrite in-place
        const settingsData      = new TextEncoder().encode(JSON.stringify(this._settings))
        const encryptedSettings = await this._sgSend.encrypt(settingsData, this._readKey)
        await this._sgSend.vaultWrite(this._vaultId, this._settingsFileId, this._writeKey, new Uint8Array(encryptedSettings))
    }
}
