/* =================================================================================
   SGraph Vault — Client-Side Encrypted Vault Logic
   v0.1.4 — Lazy sub-tree loading: folders load on demand when expanded

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
            } else if (entry.tree_id) {
                // Sub-tree: store lazy placeholder (loaded on demand when folder is expanded)
                vault._tree['/'].children[entry.name] = {
                    type:     'folder',
                    children: {},
                    _tree_id: entry.tree_id,
                    _loaded:  false
                }
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

    async setName(newName) {
        if (!this._settings) throw new Error('Vault not initialized')
        this._settings.vault_name = newName
        await this._commit(`Rename vault to "${newName}"`)
    }

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

    async updateFile(folderPath, fileName, fileData) {
        const data = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData

        const folder = this._findNode(folderPath)
        if (!folder || folder.type !== 'folder') throw new Error(`Folder not found: ${folderPath}`)
        if (!folder.children[fileName] || folder.children[fileName].type !== 'file') {
            throw new Error(`File not found: ${fileName}`)
        }

        // Encrypt and store new blob (content-addressed — old blob is still valid for history)
        const encrypted   = await this._sgSend.encrypt(data, this._readKey)
        const blobId      = await this._objectStore.store(encrypted)
        const contentHash = await this._commitManager.computeContentHash(data)

        // Update in-memory tree entry
        folder.children[fileName] = {
            type:         'file',
            blob_id:      blobId,
            size:         data.byteLength || data.length,
            content_hash: contentHash
        }

        await this._commit(`Edit ${fileName}`)
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

    // --- Lazy Sub-Tree Loading (called by UI when folder is expanded) -----------

    async loadSubTreeOnDemand(folderPath) {
        const node = this._findNode(folderPath)
        if (!node || node.type !== 'folder') return false
        if (node._loaded !== false || !node._tree_id) return false  // already loaded or no tree_id

        // Load one level: fetch the sub-tree entries
        const subTree = await this._commitManager.loadTree(node._tree_id)
        for (const entry of subTree.entries) {
            if (entry.tree_id) {
                // Nested folder: store lazy placeholder (will load when expanded)
                node.children[entry.name] = {
                    type:     'folder',
                    children: {},
                    _tree_id: entry.tree_id,
                    _loaded:  false
                }
            } else {
                // File entry
                node.children[entry.name] = {
                    type:         'file',
                    blob_id:      entry.blob_id,
                    size:         entry.size || 0,
                    content_hash: entry.content_hash || null
                }
            }
        }

        node._loaded = true
        delete node._tree_id
        return true
    }

    // Check if a folder needs loading (for UI to show loading indicator)
    needsLoading(folderPath) {
        const node = this._findNode(folderPath)
        return node && node.type === 'folder' && node._loaded === false && !!node._tree_id
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
        // 1. Build tree entries with sub-tree objects for folders (matches CLI format)
        const entries = await this._buildTreeEntries(this._tree['/'])

        // 2. Add settings as a special entry in the root tree
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

        // 3. Create root tree object
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

    // --- Build tree entries with sub-tree objects for folders (matches CLI format)

    async _buildTreeEntries(node) {
        const entries = []
        for (const [name, entry] of Object.entries(node.children || {})) {
            if (entry.type === 'folder') {
                // If folder was never loaded (lazy), reuse its existing tree_id
                // This is critical: without this, committing would create an empty
                // tree object and destroy all the folder's contents on the server
                if (entry._loaded === false && entry._tree_id) {
                    entries.push({
                        name,
                        size:         0,
                        content_hash: null,
                        blob_id:      null,
                        tree_id:      entry._tree_id
                    })
                } else {
                    // Loaded folder: recursively create sub-tree object
                    const childEntries = await this._buildTreeEntries(entry)
                    const childTreeId  = await this._commitManager.createTree(childEntries)
                    entries.push({
                        name,
                        size:         0,
                        content_hash: null,
                        blob_id:      null,
                        tree_id:      childTreeId
                    })
                }
            } else {
                entries.push({
                    name,
                    size:         entry.size || 0,
                    content_hash: entry.content_hash || null,
                    blob_id:      entry.blob_id || null,
                    tree_id:      null
                })
            }
        }
        return entries
    }

    // --- Flatten nested tree into flat entry list (for UI display) ----------------

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

    // --- Load a sub-tree object and insert its entries into the in-memory tree ----
    //     Used during full vault reload (e.g. refresh from server).
    //     Nested folders get lazy placeholders — they load on demand when expanded.

    async _loadSubTree(folderName, treeId, parentPath = '') {
        const subTree  = await this._commitManager.loadTree(treeId)
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName

        // Ensure the folder exists in the in-memory tree
        const parts = fullPath.split('/').filter(Boolean)
        let node = this._tree['/']
        for (const part of parts) {
            if (!node.children[part]) {
                node.children[part] = { type: 'folder', children: {} }
            }
            node = node.children[part]
        }

        // Mark this level as loaded
        node._loaded = true
        delete node._tree_id

        // Process entries in the sub-tree
        for (const entry of subTree.entries) {
            if (entry.tree_id) {
                // Nested sub-tree: store lazy placeholder instead of recursing
                node.children[entry.name] = {
                    type:     'folder',
                    children: {},
                    _tree_id: entry.tree_id,
                    _loaded:  false
                }
            } else {
                // File entry — insert with full path prefix
                this._insertEntry({
                    ...entry,
                    name: `${fullPath}/${entry.name}`
                })
            }
        }
    }
}
