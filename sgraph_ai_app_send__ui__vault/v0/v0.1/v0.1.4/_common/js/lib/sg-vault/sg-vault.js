/* =================================================================================
   SGraph Vault — Client-Side Encrypted Vault Logic
   v0.1.3 — Self-describing IDs, bare/ paths, on-demand sub-tree loading

   A vault is a collection of encrypted files stored via the vault pointer API.
   The server sees only encrypted blobs — it has no concept of folders or file names.

   v3 data model:
     - Objects use self-describing IDs: obj-cas-imm-{hash}
     - Refs use deterministic HMAC IDs: ref-pid-muw-{hmac} (HEAD), ref-pid-snw-{hmac} (clone)
     - All file paths include bare/ prefix: bare/refs/ref-pid-muw-xxx, bare/data/obj-cas-imm-xxx
     - Sub-tree model: one tree object per directory level
     - Encrypted-only metadata: no plaintext name/size/content_hash in tree entries

   In-memory tree:
     The nested folder structure { '/': { type: 'folder', children: {} } } is
     maintained in memory for UI convenience. It is derived from the tree
     entries stored in commits, and serialized back to entries on save.

   Vault key format: {passphrase}:{vault_id}
   Key derivation: SGVaultCrypto.deriveKeys() → readKey, writeKey, refFileId, branchIndexFileId

   Compatible with sg-send-cli v0.5.x (same tree format, same crypto, same API).

   Depends on: SGSend, SGSendCrypto, SGVaultCrypto, SGVaultObjectStore,
               SGVaultRefManager, SGVaultCommit
   ================================================================================= */

class SGVault {

    constructor(sgSend) {
        this._sgSend            = sgSend
        this._passphrase        = null
        this._readKey           = null                                         // AES-256-GCM CryptoKey
        this._writeKey          = null                                         // Hex string for server auth
        this._hmacKey           = null                                         // For per-branch ref derivation
        this._vaultId           = null
        this._refFileId         = null                                         // ref-pid-muw-{HMAC[:12]}
        this._branchIndexFileId = null                                         // idx-pid-muw-{HMAC[:12]}
        this._settings          = null                                         // Vault metadata
        this._tree              = null                                         // Nested in-memory tree
        this._headCommitId      = null                                         // Current HEAD commit
        this._objectStore       = null                                         // SGVaultObjectStore
        this._refManager        = null                                         // SGVaultRefManager
        this._commitManager     = null                                         // SGVaultCommit
    }

    // --- Vault Lifecycle --------------------------------------------------------

    static async create(sgSend, passphrase, options = {}) {
        const vault = new SGVault(sgSend)
        vault._passphrase = passphrase

        // 1. Generate vault ID (8 lowercase alphanumeric chars — matches sg-send-cli format)
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
        const bytes    = crypto.getRandomValues(new Uint8Array(8))
        vault._vaultId = Array.from(bytes).map(b => alphabet[b % alphabet.length]).join('')

        // 2. Derive all keys and deterministic file IDs
        const keys = await SGVaultCrypto.deriveKeys(passphrase, vault._vaultId)
        vault._readKey           = keys.readKey
        vault._writeKey          = keys.writeKey
        vault._hmacKey           = keys.hmacKey
        vault._refFileId         = keys.refFileId
        vault._branchIndexFileId = keys.branchIndexFileId

        // 3. Initialize component managers
        vault._initManagers()

        // 4. Create settings (stored as a blob in the initial commit's tree)
        vault._settings = {
            vault_name:  options.name || 'Untitled Vault',
            vault_id:    vault._vaultId,
            created:     new Date().toISOString(),
            version:     3,
            description: options.description || ''
        }

        // 5. Create initial empty tree (in-memory)
        vault._tree = { '/': { type: 'folder', children: {} } }

        // 6. Create initial commit with empty tree + settings
        await vault._commit('Initial vault creation')

        return vault
    }

    static async open(sgSend, fullVaultKey) {
        const { passphrase, vaultId } = SGVaultCrypto.parseVaultKey(fullVaultKey)

        const vault = new SGVault(sgSend)
        vault._passphrase = passphrase
        vault._vaultId    = vaultId

        // Derive all keys
        const keys = await SGVaultCrypto.deriveKeys(passphrase, vaultId)
        vault._readKey           = keys.readKey
        vault._writeKey          = keys.writeKey
        vault._hmacKey           = keys.hmacKey
        vault._refFileId         = keys.refFileId
        vault._branchIndexFileId = keys.branchIndexFileId

        // Initialize component managers
        vault._initManagers()

        // Read HEAD ref to get latest commit
        const commitId = await vault._refManager.readRef(vault._refFileId)
        if (!commitId) throw new Error('Vault not found: HEAD ref missing')

        vault._headCommitId = commitId

        // Load commit → load tree → build nested structure
        const commit = await vault._commitManager.loadCommit(commitId)
        const tree   = await vault._commitManager.loadTree(commit.tree_id)

        // Reconstruct nested tree and settings from flat entries
        vault._tree     = { '/': { type: 'folder', children: {} } }
        vault._settings = null

        for (const entry of tree.entries) {
            if (entry.name === '.vault-settings') {
                // Settings stored as a special blob in the tree
                const settingsBlob = await vault._objectStore.load(entry.blob_id)
                const decrypted    = await SGSendCrypto.decrypt(settingsBlob, vault._readKey)
                vault._settings    = JSON.parse(new TextDecoder().decode(decrypted))
            } else {
                vault._insertEntry(entry)
            }
        }

        if (!vault._settings) {
            vault._settings = {
                vault_name: 'Untitled Vault',
                vault_id:   vaultId,
                created:    new Date().toISOString(),
                version:    2
            }
        }

        return vault
    }

    // --- Vault Key & Properties -------------------------------------------------

    getVaultKey() {
        return `${this._passphrase}:${this._vaultId}`
    }

    get vaultId()   { return this._vaultId              }
    get name()      { return this._settings?.vault_name }
    get created()   { return this._settings?.created    }

    // --- File Operations --------------------------------------------------------

    async addFile(folderPath, fileName, fileData) {
        const data = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData

        // Encrypt and store as content-addressed blob
        const encrypted   = await this._sgSend.encrypt(data, this._readKey)
        const blobId      = await this._objectStore.store(encrypted)
        const contentHash = await this._commitManager.computeContentHash(data)

        // Update in-memory tree
        const folder = this._findNode(folderPath)
        if (!folder || folder.type !== 'folder') {
            throw new Error(`Folder not found: ${folderPath}`)
        }

        folder.children[fileName] = {
            type:         'file',
            blob_id:      blobId,
            size:         data.byteLength || data.length,
            content_hash: contentHash
        }

        // Create new commit
        await this._commit(`Add ${fileName}`)
        return { blobId, fileName, folderPath }
    }

    async getFile(folderPath, fileName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)
        const entry = folder.children[fileName]
        if (!entry || entry.type !== 'file') throw new Error(`File not found: ${fileName}`)

        const encrypted = await this._objectStore.load(entry.blob_id)
        return SGSendCrypto.decrypt(encrypted, this._readKey)
    }

    async removeFile(folderPath, fileName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)

        delete folder.children[fileName]
        await this._commit(`Remove ${fileName}`)
    }

    async renameFile(folderPath, oldName, newName) {
        const folder = this._findNode(folderPath)
        if (!folder) throw new Error(`Folder not found: ${folderPath}`)
        if (!folder.children[oldName]) throw new Error(`File not found: ${oldName}`)
        if (folder.children[newName]) throw new Error(`Already exists: ${newName}`)
        folder.children[newName] = folder.children[oldName]
        delete folder.children[oldName]
        await this._commit(`Rename ${oldName} to ${newName}`)
    }

    // --- Folder Operations ------------------------------------------------------

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
        await this._commit(`Create folder ${name}`)
    }

    listFolder(folderPath) {
        const node = this._findNode(folderPath)
        if (!node || node.type !== 'folder') return null
        return Object.entries(node.children).map(([name, entry]) => ({
            name,
            type:         entry.type,
            size:         entry.size || 0,
            content_hash: entry.content_hash || null
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
        await this._commit(`Remove folder ${name}`)
    }

    async renameFolder(folderPath, newName) {
        const parts   = folderPath.split('/').filter(Boolean)
        const oldName = parts.pop()
        const parent  = this._findNode('/' + parts.join('/'))
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
        await this._commit(`Rename folder ${oldName} to ${newName}`)
    }

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
        await this._commit(`Move ${fileName}`)
    }

    async moveFolder(srcPath, destParentPath) {
        const srcParts    = srcPath.split('/').filter(Boolean)
        const folderName  = srcParts.pop()
        const srcParentPath = '/' + srcParts.join('/')
        if (srcParentPath === destParentPath) return

        const srcParent = this._findNode(srcParentPath)
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
    }

    // --- Stats ------------------------------------------------------------------

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
        walk(this._tree['/'])
        return { files, folders, totalSize }
    }

    // --- Tree Navigation (internal) ---------------------------------------------

    _findNode(path) {
        const parts = path.split('/').filter(Boolean)
        let node    = this._tree['/']
        for (const part of parts) {
            if (!node || node.type !== 'folder' || !node.children[part]) return null
            node = node.children[part]
        }
        return node
    }

    // --- Component Initialization -----------------------------------------------

    _initManagers() {
        this._objectStore    = new SGVaultObjectStore(this._sgSend, this._vaultId, this._writeKey)
        this._refManager     = new SGVaultRefManager(this._sgSend, this._vaultId, this._writeKey, this._readKey)
        this._commitManager  = new SGVaultCommit(this._objectStore, this._readKey)
    }

    // --- Commit: serialize tree → create tree object → create commit → update ref

    async _commit(message) {
        // 1. Flatten nested tree to entry list
        const entries = this._flattenTree()

        // 2. Add settings as a special entry
        const settingsPlain     = new TextEncoder().encode(JSON.stringify(this._settings))
        const settingsEncrypted = await this._sgSend.encrypt(settingsPlain, this._readKey)
        const settingsBlobId    = await this._objectStore.store(settingsEncrypted)
        const settingsHash      = await this._commitManager.computeContentHash(settingsPlain)

        entries.push({
            name:         '.vault-settings',
            size:         settingsPlain.byteLength,
            content_hash: settingsHash,
            blob_id:      settingsBlobId,
            tree_id:      null
        })

        // 3. Create tree object
        const treeId = await this._commitManager.createTree(entries)

        // 4. Create commit
        const parentIds = this._headCommitId ? [this._headCommitId] : []
        const commitId  = await this._commitManager.createCommit({
            parentIds,
            treeId,
            message
        })

        // 5. Update HEAD ref
        await this._refManager.writeRef(this._refFileId, commitId)
        this._headCommitId = commitId
    }

    // --- Flatten nested tree into flat entry list --------------------------------

    _flattenTree() {
        const entries = []

        const walk = (node, prefix) => {
            for (const [name, entry] of Object.entries(node.children || {})) {
                const fullPath = prefix ? `${prefix}/${name}` : name

                if (entry.type === 'folder') {
                    const childKeys = Object.keys(entry.children || {})
                    if (childKeys.length === 0) {
                        // Persist empty folders as entries with trailing /
                        entries.push({
                            name:         fullPath + '/',
                            size:         0,
                            content_hash: null,
                            blob_id:      null,
                            tree_id:      null
                        })
                    } else {
                        walk(entry, fullPath)
                    }
                } else {
                    entries.push({
                        name:         fullPath,
                        size:         entry.size || 0,
                        content_hash: entry.content_hash || null,
                        blob_id:      entry.blob_id || null,
                        tree_id:      null
                    })
                }
            }
        }

        walk(this._tree['/'], '')
        return entries
    }

    // --- Insert a flat entry into the nested in-memory tree ----------------------

    _insertEntry(entry) {
        // Empty folder entries have trailing / (e.g. "folder-a/")
        if (entry.name.endsWith('/')) {
            const folderPath = entry.name.slice(0, -1)
            const parts = folderPath.split('/').filter(Boolean)
            let node = this._tree['/']
            for (const part of parts) {
                if (!node.children[part]) {
                    node.children[part] = { type: 'folder', children: {} }
                }
                node = node.children[part]
            }
            return
        }

        // Entries with no blob_id are folders (v2 compat — older vaults may store
        // empty folders without trailing /)
        if (!entry.blob_id) {
            const parts = entry.name.split('/').filter(Boolean)
            let node = this._tree['/']
            for (const part of parts) {
                if (!node.children[part]) {
                    node.children[part] = { type: 'folder', children: {} }
                }
                node = node.children[part]
            }
            return
        }

        const parts    = entry.name.split('/')
        const fileName = parts.pop()
        let node       = this._tree['/']

        // Create intermediate folders as needed
        for (const part of parts) {
            if (!node.children[part]) {
                node.children[part] = { type: 'folder', children: {} }
            }
            node = node.children[part]
        }

        node.children[fileName] = {
            type:         'file',
            blob_id:      entry.blob_id,
            size:         entry.size | 0,
            content_hash: entry.content_hash || null
        }
    }
}
