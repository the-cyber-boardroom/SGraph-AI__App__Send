/* =================================================================================
   SGraph Vault — Core Class
   v0.2.1 — Lifecycle, key management, tree helpers, internal commit machinery

   Companion modules (must load after this file):
     sg-vault--file-ops.js    addFile, updateFile, getFile, removeFile, renameFile, moveFile
     sg-vault--folder-ops.js  createFolder, listFolder, removeFolder, renameFolder,
                               moveFolder, loadSubTreeOnDemand, needsLoading
     sg-vault--sync.js        push, pull, getAheadCount, getBehindCount
     sg-vault--branches.js    getBranches, getCurrentBranchName, switchBranch

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
        this._refFileId         = null                                         // ref-pid-muw-{HMAC[:12]}  (named branch)
        this._cloneRefFileId    = null                                         // ref-pid-snw-{HMAC[:12]}  (clone branch)
        this._branchIndexFileId = null                                         // idx-pid-muw-{HMAC[:12]}
        this._branchIndex       = null                                         // Parsed branch index (populated on open)
        this._settings          = null                                         // Vault metadata
        this._tree              = null                                         // Nested in-memory tree
        this._namedHeadId       = null                                         // Named branch HEAD (last pushed state)
        this._headCommitId      = null                                         // Clone branch HEAD (working tip)
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
        vault._cloneRefFileId    = await SGVaultCrypto.deriveBranchRefFileId(keys.hmacKey, vault._vaultId, 'web-ui')

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

        // 6. Create initial commit + both refs + branch index as ONE POST /batch.
        //    _commit nests inside this batch (won't flush), the named ref + index stage, and the
        //    outer _withBatch flushes everything together → a brand-new vault is one request.
        await vault._withBatch(async () => {
            await vault._commit('Initial vault creation')                         // tree + commit + clone-ref (staged)
            await vault._refManager.writeRef(vault._refFileId, vault._headCommitId)   // named ref → ahead count starts at 0
            vault._namedHeadId = vault._headCommitId
            // Single-branch index so the vault is immediately clonable by the sgit CLI.
            try { await vault._refManager.writeBranchIndex(vault._branchIndexFileId, vault._refFileId) } catch (_) {}
        })

        return vault
    }

    // --- Read-Only Vault Open (Phase 2) -----------------------------------------
    // Opens a vault using a pre-derived read key (from an RO token payload).
    // vault._passphrase = null, vault._writeKey = null → vault.writable = false.
    // refFileId is the named-branch ref path on the server (stored in the token
    // payload by the owner; derived from HMAC which RO recipients don't have).

    static async openReadOnly(sgSend, vaultId, readKeyBase64, refFileId) {
        const vault = new SGVault(sgSend)
        vault._vaultId    = vaultId
        vault._passphrase = null
        vault._writeKey   = null
        vault._hmacKey    = null
        vault._readKey    = await crypto.subtle.importKey(
            'raw',
            Uint8Array.from(atob(readKeyBase64), c => c.charCodeAt(0)),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        )
        vault._refFileId = refFileId
        vault._initManagers()

        const namedCommitId = await vault._refManager.readRef(vault._refFileId)
        if (!namedCommitId) throw new Error('Vault not found: HEAD ref missing')
        vault._namedHeadId  = namedCommitId
        vault._headCommitId = namedCommitId

        await vault._loadTreeFromCommit(vault._headCommitId)
        return vault
    }

    static async open(sgSend, fullVaultKey) {
        const isSimpleToken = /^[a-z]+-[a-z]+-\d{4}$/.test(fullVaultKey)

        let passphrase, vaultId, keys

        if (isSimpleToken) {
            keys       = await SGVaultCrypto.deriveKeysFromSimpleToken(fullVaultKey)
            passphrase = fullVaultKey
            vaultId    = keys.vaultId
        } else {
            const parsed = SGVaultCrypto.parseVaultKey(fullVaultKey)
            passphrase   = parsed.passphrase
            vaultId      = parsed.vaultId

            if (/^[a-z]+-[a-z]+-\d{4}$/.test(passphrase)) {
                keys = await SGVaultCrypto.deriveKeysFromSimpleToken(passphrase)
            } else {
                keys = await SGVaultCrypto.deriveKeys(passphrase, vaultId)
            }
        }

        const vault = new SGVault(sgSend)
        vault._passphrase = passphrase
        vault._vaultId    = vaultId

        vault._readKey           = keys.readKey
        vault._writeKey          = keys.writeKey
        vault._hmacKey           = keys.hmacKey
        vault._refFileId         = keys.refFileId
        vault._branchIndexFileId = keys.branchIndexFileId
        vault._cloneRefFileId    = await SGVaultCrypto.deriveBranchRefFileId(keys.hmacKey, vaultId, 'web-ui')

        vault._initManagers()

        // Step 1: Read branch index — store it for branch operations, use it to find named ref
        try {
            const idx = await vault._refManager.readBranchIndex(vault._branchIndexFileId)
            if (idx?.branches) {
                vault._branchIndex = idx
                const named = idx.branches.find(b => b.branch_type === 'named')
                if (named?.head_ref_id) {
                    vault._refFileId = named.head_ref_id
                }
            }
        } catch (_) { /* branch index unavailable — use derived refFileId */ }

        // Step 2: Read named HEAD ref LIVE (never use a cached commit ID)
        const namedCommitId = await vault._refManager.readRef(vault._refFileId)
        if (!namedCommitId) throw new Error('Vault not found: HEAD ref missing')
        vault._namedHeadId = namedCommitId

        // Clone ref created lazily on first commit; 404 is expected on read-only open
        const cloneCommitId = await vault._refManager.readRef(vault._cloneRefFileId)

        // Reconcile-on-open (CLI interop): the named ref is canonical. If the clone branch is
        // CLEANLY BEHIND the named head (clone is a strict ancestor of named — e.g. the CLI or
        // another session published while this clone sat still), load the NAMED head, not the
        // stale clone. This is the bug the CLI team flagged: `cloneCommitId || namedCommitId`
        // pinned every web open to the clone branch once any web commit existed, silently
        // shadowing CLI pushes. We only fast-forward the VIEW — we do NOT rewrite the clone ref
        // here (no access token yet at open time; the next commit naturally advances it from the
        // named head). Diverged / clone-ahead cases keep the clone head so unpushed web edits are
        // never lost — the shell surfaces the divergence.
        let head = cloneCommitId || namedCommitId
        if (cloneCommitId && namedCommitId && cloneCommitId !== namedCommitId) {
            let cleanBehind = false
            try { cleanBehind = await vault._isAncestor(cloneCommitId, namedCommitId) } catch (_) {}
            if (cleanBehind) head = namedCommitId
        }
        vault._headCommitId = head

        await vault._loadTreeFromCommit(vault._headCommitId)

        return vault
    }

    // --- Vault Key & Properties -------------------------------------------------

    getVaultKey() {
        return `${this._passphrase}:${this._vaultId}`
    }

    get vaultId()   { return this._vaultId              }
    get name()      { return this._settings?.vault_name }
    get created()   { return this._settings?.created    }
    get writable()  { return !!this._writeKey           }
    get writeKeyHex() { return this._writeKey || null   }   // hex string (owner-secret store input); null in RO sessions
    get aheadOf()   { return this._namedHeadId          }

    async setName(newName) {
        if (!this._settings) throw new Error('Vault not initialized')
        if (this._settings.vault_name === newName) return     // no-op rename
        this._settings.vault_name = newName
        this._settingsDirty = true
        await this._commit(`Rename vault to "${newName}"`)
    }

    // --- Stats ------------------------------------------------------------------

    getStats() {
        let files = 0, folders = 0, totalSize = 0
        const walk = (node) => {
            for (const [, entry] of Object.entries(node.children || {})) {
                if (entry.type === 'folder') { folders++; walk(entry); }
                else { files++; totalSize += entry.size || 0; }
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

    // --- Dirty-path marking: flags root + every folder along path as modified ---
    //     Must be called after any in-memory mutation before the next _commit().

    _markDirty(folderPath) {
        const parts = (folderPath || '/').split('/').filter(Boolean)
        let node    = this._tree['/']
        node._dirty = true
        for (const part of parts) {
            if (!node.children || !node.children[part]) break
            node = node.children[part]
            if (node.type === 'folder') node._dirty = true
        }
    }

    // --- Component Initialization -----------------------------------------------

    _initManagers() {
        this._objectStore   = new SGVaultObjectStore(this._sgSend, this._vaultId, this._writeKey)
        this._refManager    = new SGVaultRefManager(this._sgSend, this._vaultId, this._writeKey, this._readKey, this._objectStore)
        this._commitManager = new SGVaultCommit(this._objectStore, this._readKey)
    }

    // Run `fn` with the object-store write-batch open, flushing all staged writes (objects +
    // refs + index) as ONE POST /batch at the end. Re-entrant: if a batch is already open
    // (e.g. addFile opened it, then _commit calls this), just run inline and let the OUTERMOST
    // scope flush — so a file write and the commit it triggers collapse into a single request.
    async _withBatch(fn) {
        if (this._objectStore.batching) return fn()       // nested — the outermost scope owns flush + rollback
        this._objectStore.beginBatch()
        // Snapshot the head pointers BEFORE running fn. _commit advances _headCommitId (and clears
        // _settingsDirty / sets _currentSettingsEntry) inside fn, but the writes don't land until
        // flushBatch() below. If the flush throws (network drop — the waterfall showed a 9.77s
        // write), the staged writes are discarded yet the client would otherwise be left AHEAD of
        // the server, and the next commit would build on a phantom parent → a dangling pointer on
        // the next push. Restoring these on failure preserves the pre-batch semantics (head only
        // advances on a durable write), so a retry re-stages from the correct parent and self-heals.
        // (The in-memory tree mutation is intentionally NOT rolled back — that was already the
        // pre-batch behaviour and self-corrects once head is restored.)
        const snap = {
            head:          this._headCommitId,
            namedHead:     this._namedHeadId,
            settingsDirty: this._settingsDirty,
            settingsEntry: this._currentSettingsEntry
        }
        try {
            const result = await fn()
            await this._objectStore.flushBatch()
            return result
        } catch (err) {
            this._objectStore.discardBatch()
            this._headCommitId         = snap.head
            this._namedHeadId          = snap.namedHead
            this._settingsDirty        = snap.settingsDirty
            this._currentSettingsEntry = snap.settingsEntry
            throw err
        }
    }

    // --- Commit: serialize tree → create tree object → create commit → update ref

    async _commit(message) {
      return this._withBatch(async () => {
        const entries = await this._buildTreeEntries(this._tree['/'])

        // .vault-settings.json: write it on the initial commit, and on subsequent commits
        // ONLY when settings actually changed (`_settingsDirty`) — rewriting it on every commit
        // makes it appear in the file browser as "auto-added orphan" content. Track the dirty
        // flag via setName/setDescription/setSettings; clear it after a successful commit.
        const isInitial    = !this._headCommitId
        const settingsDirty = !!this._settingsDirty
        let writeSettings  = isInitial || settingsDirty

        // Honour an existing settings entry from the parent tree if we're not rewriting:
        // if a previous commit wrote one, carry it forward (re-emit the same blob ref).
        if (!writeSettings && this._currentSettingsEntry) {
            entries.push(this._currentSettingsEntry)
        } else if (writeSettings) {
            const settingsPlain     = new TextEncoder().encode(JSON.stringify(this._settings))
            const settingsEncrypted = await this._sgSend.encrypt(settingsPlain, this._readKey)
            const settingsBlobId    = await this._objectStore.store(settingsEncrypted)
            const settingsHash      = await this._commitManager.computeContentHash(settingsPlain)
            const settingsEntry = {
                name:         '.vault-settings.json',
                size:         settingsPlain.byteLength,
                content_hash: settingsHash,
                blob_id:      settingsBlobId,
                tree_id:      null
            }
            entries.push(settingsEntry)
            this._currentSettingsEntry = settingsEntry
        }

        const treeId    = await this._commitManager.createTree(entries)
        const parentIds = this._headCommitId ? [this._headCommitId] : []
        const commitId  = await this._commitManager.createCommit({
            parentIds, treeId, message, branchId: null
        })

        const targetRef = this._cloneRefFileId || this._refFileId
        await this._refManager.writeRef(targetRef, commitId)
        this._headCommitId = commitId
        this._settingsDirty = false        // committed → no longer dirty
      })
    }

    // --- Build tree entries with sub-tree objects for folders -------------------
    //     Three cases for a folder child:
    //       1. Lazy (never opened):       _loaded === false && _tree_id  → reuse _tree_id
    //       2. Loaded, clean:             _loaded === true  && !_dirty && _cleanTreeId → reuse _cleanTreeId
    //       3. Loaded, dirty (or new):    rebuild recursively, cache result in _cleanTreeId

    async _buildTreeEntries(node) {
        const entries = []
        for (const [name, entry] of Object.entries(node.children || {})) {
            if (entry.type === 'folder') {
                if (entry._loaded === false && entry._tree_id) {
                    // Lazy sub-tree: never opened by the user, nothing could have changed
                    entries.push({ name, size: 0, content_hash: null, blob_id: null, tree_id: entry._tree_id })
                } else if (!entry._dirty && entry._cleanTreeId) {
                    // Loaded but unmodified: reuse the tree object saved when it was loaded
                    entries.push({ name, size: 0, content_hash: null, blob_id: null, tree_id: entry._cleanTreeId })
                } else {
                    // New or dirty: rebuild and cache the resulting tree ID
                    const childEntries    = await this._buildTreeEntries(entry)
                    const childTreeId     = await this._commitManager.createTree(childEntries)
                    entry._cleanTreeId    = childTreeId
                    entry._dirty         = false
                    entries.push({ name, size: 0, content_hash: null, blob_id: null, tree_id: childTreeId })
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

    // --- Load tree from a specific commit ID ------------------------------------

    async _loadTreeFromCommit(commitId) {
        const commit = await this._commitManager.loadCommit(commitId)
        const tree   = await this._commitManager.loadTree(commit.tree_id)

        this._tree     = { '/': { type: 'folder', children: {} } }
        this._settings = null
        this._currentSettingsEntry = null
        this._settingsDirty        = false

        for (const entry of tree.entries) {
            if (entry.name === '.vault-settings.json' || entry.name === '.vault-settings') {
                const blob      = await this._objectStore.load(entry.blob_id)
                const decrypted = await SGSendCrypto.decrypt(blob, this._readKey)
                this._settings  = JSON.parse(new TextDecoder().decode(decrypted))
                // Capture the original entry so subsequent commits can carry it forward
                // un-rewritten (avoid producing a new blob_id when nothing changed).
                this._currentSettingsEntry = entry
            } else if (entry.tree_id) {
                this._tree['/'].children[entry.name] = {
                    type: 'folder', children: {}, _tree_id: entry.tree_id, _loaded: false
                }
            } else {
                this._insertEntry(entry)
            }
        }

        if (!this._settings) {
            this._settings = {
                vault_name: 'Untitled Vault', vault_id: this._vaultId,
                created: new Date().toISOString(), version: 2
            }
        }
    }

    // --- Flatten nested tree into flat entry list (for UI display) --------------

    _flattenTree() {
        const entries = []
        const walk = (node, prefix) => {
            for (const [name, entry] of Object.entries(node.children || {})) {
                const fullPath = prefix ? `${prefix}/${name}` : name
                if (entry.type === 'folder') {
                    const childKeys = Object.keys(entry.children || {})
                    if (childKeys.length === 0) {
                        entries.push({ name: fullPath + '/', size: 0, content_hash: null, blob_id: null, tree_id: null })
                    } else {
                        walk(entry, fullPath)
                    }
                } else {
                    entries.push({
                        name: fullPath,
                        size: entry.size || 0,
                        content_hash: entry.content_hash || null,
                        blob_id: entry.blob_id || null,
                        tree_id: null
                    })
                }
            }
        }
        walk(this._tree['/'], '')
        return entries
    }

    // --- Insert a flat entry into the nested in-memory tree --------------------

    _insertEntry(entry) {
        if (entry.name.endsWith('/')) {
            const parts = entry.name.slice(0, -1).split('/').filter(Boolean)
            let node = this._tree['/']
            for (const part of parts) {
                if (!node.children[part]) node.children[part] = { type: 'folder', children: {} }
                node = node.children[part]
            }
            return
        }

        if (!entry.blob_id) {
            const parts = entry.name.split('/').filter(Boolean)
            let node = this._tree['/']
            for (const part of parts) {
                if (!node.children[part]) node.children[part] = { type: 'folder', children: {} }
                node = node.children[part]
            }
            return
        }

        const parts    = entry.name.split('/')
        const fileName = parts.pop()
        let node       = this._tree['/']
        for (const part of parts) {
            if (!node.children[part]) node.children[part] = { type: 'folder', children: {} }
            node = node.children[part]
        }
        node.children[fileName] = {
            type: 'file', blob_id: entry.blob_id,
            size: entry.size | 0, content_hash: entry.content_hash || null
        }
    }

    // --- Load a sub-tree object into the in-memory tree (used on full reload) --

    async _loadSubTree(folderName, treeId, parentPath = '') {
        const subTree  = await this._commitManager.loadTree(treeId)
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName

        const parts = fullPath.split('/').filter(Boolean)
        let node = this._tree['/']
        for (const part of parts) {
            if (!node.children[part]) node.children[part] = { type: 'folder', children: {} }
            node = node.children[part]
        }

        node._loaded = true
        delete node._tree_id

        for (const entry of subTree.entries) {
            if (entry.tree_id) {
                node.children[entry.name] = {
                    type: 'folder', children: {}, _tree_id: entry.tree_id, _loaded: false
                }
            } else {
                this._insertEntry({ ...entry, name: `${fullPath}/${entry.name}` })
            }
        }
    }
}
