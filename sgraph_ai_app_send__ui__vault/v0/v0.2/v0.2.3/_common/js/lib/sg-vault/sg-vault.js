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

   Compatible with sgit-ai 0.21.0: format gate, shared branch index, signed commit_v1,
   deterministic trees, rewind detection (see sg-vault-interop.js for the byte contract).

   Depends on: SGSend, SGSendCrypto, SGVaultCrypto, SGVaultObjectStore,
               SGVaultRefManager, SGVaultCommit
   ================================================================================= */

class SGVault {

    static LARGE_BLOB_THRESHOLD = 4 * 1024 * 1024        // sgit-ai Vault__Sub_Tree.LARGE_BLOB_THRESHOLD (encrypted bytes)

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
        this._signer            = null                                         // SGVaultSigner (per-device key) — null = unsigned commits
        this._format            = 1                                            // sgit-ai format gate (1: 12-hex ids, 2: 32-hex ids)
        this._features          = []                                           // gate features, e.g. 'signatures-required'
        this._minClient         = ''                                           // gate min_client (a sgit-ai version; informational here)
        this._lastAcceptedHead  = null                                         // the named head this device last accepted (rewind detection)
        this._remoteHeadStatus  = 'forward'                                    // 'forward' | 'rewound' | 'unknown' after the last named-ref read
        this._publicKeyCache    = new Map()                                    // key id → CryptoKey | null
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
        vault._signer            = await SGVault._signerFor(vault._vaultId, options)
        vault._cloneBranch       = SGVault._cloneBranchName(options, vault._signer)
        vault._cloneRefFileId    = await SGVaultCrypto.deriveBranchRefFileId(keys.hmacKey, vault._vaultId, vault._cloneBranch)

        // 3. Initialize component managers
        vault._initManagers()

        // 4. Create settings (stored as a blob in the initial commit's tree)
        vault._settingsDefaulted = !options.name         // placeholder name → display may fall back to app.json title
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
        })
        vault._recordAcceptedHead(vault._headCommitId)
        // Branch index (named entry + this device's clone entry + its public key) so the vault is
        // immediately clonable by the sgit CLI and its signatures verifiable. Its own request:
        // the index is a shared document written with compare-and-swap, never staged blind.
        try { await vault._registerClone() } catch (err) { vault._lastRegisterError = err }

        return vault
    }

    // --- Clone branch per device -------------------------------------------------------
    // The CLI gives every clone its own branch and ref. Web sessions used to share ONE clone
    // ref ('web-ui') across every browser, so one device's unpushed commit became every
    // device's working head. With a per-device signer the clone ref is per device too
    // ('web-ui:<branch id>'); sessions without a signer keep the shared legacy name, and a
    // caller-supplied name (child kernels: 'viv:<parent>') always wins.
    static _cloneBranchName(options, signer) {
        if (options && options.cloneBranch) return String(options.cloneBranch)
        return signer ? 'web-ui:' + signer.branchId : 'web-ui'
    }

    // --- Per-device signer -------------------------------------------------------------
    // Shells and the /app page get a durable key (IndexedDB). A child kernel (cloneBranch
    // 'viv:…', null-origin sandbox) has no key store: it may be handed a signer by its parent
    // via options.signer; otherwise its commits stay unsigned, as before. options.signer === null
    // explicitly disables signing (tests, read-only surfaces).
    static async _signerFor(vaultId, options) {
        if (options && 'signer' in options) return options.signer || null
        if (options && options.cloneBranch && String(options.cloneBranch).startsWith('viv:')) return null
        if (typeof SGVaultSigner === 'undefined') return null
        try { return await SGVaultSigner.forVault(vaultId) } catch (_) { return null }
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

        // The format gate lives in the branch index, whose id is HMAC(read_key, …): derivable
        // here, so a read-only open of a raised (format-2) vault knows the id width too.
        try {
            const raw = Uint8Array.from(atob(readKeyBase64), c => c.charCodeAt(0))
            const hmacKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
            const hex = await SGVaultCrypto._deriveFileId(hmacKey, `sg-vault-v1:file-id:branch-index:${vaultId}`)
            vault._branchIndexFileId = 'idx-pid-muw-' + hex
            await vault._refreshBranchIndex()
        } catch (err) { if (err && err.code === 'EFORMAT') throw err }

        const namedCommitId = await vault._refManager.readRef(vault._refFileId)
        if (!namedCommitId) throw new Error('Vault not found: HEAD ref missing')
        vault._namedHeadId  = namedCommitId
        vault._headCommitId = namedCommitId

        await vault._loadTreeFromCommit(vault._headCommitId)
        return vault
    }

    // options.cloneBranch — name of THIS client's private clone branch (default 'web-ui').
    // A headless child kernel mounted by a parent passes 'viv:<parent vault id>' so two
    // parents mounting the same child never share a clone ref (07 Sep analysis §6.3);
    // the named ref stays the single published branch either way.
    static async open(sgSend, fullVaultKey, options = {}) {
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
        vault._signer            = await SGVault._signerFor(vaultId, options)
        vault._cloneBranch       = SGVault._cloneBranchName(options, vault._signer)
        vault._cloneRefFileId    = await SGVaultCrypto.deriveBranchRefFileId(keys.hmacKey, vaultId, vault._cloneBranch)

        vault._initManagers()

        // Step 1: Read branch index — the format gate, the branches, the tags; use it to find
        // the named ref. A format this version does not know refuses the open (EFORMAT).
        try {
            await vault._refreshBranchIndex()
        } catch (err) { if (err && err.code === 'EFORMAT') throw err /* else: index unavailable — derived refFileId */ }

        // Step 2: Read named HEAD ref LIVE (never use a cached commit ID)
        const namedCommitId = await vault._refManager.readRef(vault._refFileId)
        if (!namedCommitId) throw new Error('Vault not found: HEAD ref missing')
        vault._namedHeadId = namedCommitId
        vault._loadAcceptedHead()
        if (!vault._lastAcceptedHead) vault._recordAcceptedHead(namedCommitId)        // a fresh clone: nothing to compare with
        else await vault._classifyRemoteHead(namedCommitId)                           // a rewind is reported, never auto-applied

        // Clone ref created lazily on first commit; 404 is expected on read-only open
        let cloneCommitId = await vault._refManager.readRef(vault._cloneRefFileId)

        // Migration from the shared legacy clone ref: a device opening with its own (new) clone
        // ref for the first time adopts unpublished work left on the old shared 'web-ui' ref, so
        // nothing a user typed before this version is lost. View only; the next commit lands on
        // this device's ref. Skipped when the legacy head is already published.
        if (!cloneCommitId && vault._signer && !(options && options.cloneBranch) && !(options && options.adoptLegacyClone === false)) {
            try {
                const legacyRef  = await SGVaultCrypto.deriveBranchRefFileId(keys.hmacKey, vaultId, 'web-ui')
                const legacyHead = await vault._refManager.readRef(legacyRef)
                if (legacyHead && legacyHead !== namedCommitId && !(await vault._isAncestor(legacyHead, namedCommitId))) {
                    cloneCommitId = legacyHead
                    vault._adoptedLegacyClone = legacyRef
                }
            } catch (_) {}
        }

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

    // True when the vault carries a REAL name (a .vault-settings.json existed, or the
    // owner set one) — false when _settings was synthesized with the 'Untitled Vault'
    // placeholder. Display surfaces use this to fall back to app.json's title instead
    // of showing the placeholder.
    get hasCustomName() { return !!this._settings?.vault_name && !this._settingsDefaulted }

    // --- Embedded access token (.vault/access-token.json) -----------------------------
    // ONE implementation shared by /app, /vault and the child kernel. The token lives
    // INSIDE the vault, read_key-encrypted and beneath the .vault/** floor (no app can reach
    // it through the bridge); it upgrades the ACCOUNT tier only. `.vault` is a lazy sub-tree
    // after open, so expand it first or the file is never found. Never throws.
    async readEmbeddedAccessToken() {
        try {
            if (this.needsLoading && this.needsLoading('/.vault')) await this.loadSubTreeOnDemand('/.vault')
            const listed = this.listFolder('/.vault') || []
            if (!listed.some(e => e.name === 'access-token.json')) return null
            const bytes = await this.getFile('/.vault', 'access-token.json')
            const obj   = JSON.parse(new TextDecoder().decode(bytes))
            return (obj && obj.token) ? String(obj.token) : null
        } catch (_) { return null }
    }
    get created()   { return this._settings?.created    }
    get format()    { return this._format               }   // sgit-ai format gate: 1 or 2
    get features()  { return this._features.slice()     }   // gate features ('signatures-required', 'ids-128', 'signed-since-…')
    get minClient() { return this._minClient            }   // gate min_client (a sgit-ai version; the web does not compare it)
    get signer()    { return this._signer               }   // this device's SGVaultSigner, or null (unsigned commits)
    get remoteHeadStatus() { return this._remoteHeadStatus }   // 'forward' | 'rewound' | 'unknown' (see _classifyRemoteHead)
    get lastAcceptedHead() { return this._lastAcceptedHead }
    hasFeature(name) { return this._features.includes(name) }
    get requiresSignatures() { return this.hasFeature(SGVaultBranchIndex.FEATURE_SIG_REQUIRED) }
    // Live tags from the branch index: { name: tag_id } (0.21 signed tags; tombstones excluded)
    getTags() { return SGVaultBranchIndex.liveTags(this._branchIndex) }
    get writable()  { return !!this._writeKey           }
    get writeKeyHex() { return this._writeKey || null   }   // hex string (owner-secret store input); null in RO sessions
    get aheadOf()   { return this._namedHeadId          }

    // Raw bytes of the read_key — needed to derive the inbox enum_key
    // (enum_key = SHA256("sg-inbox-enum:" || read_key_bytes)). The read_key is
    // imported extractable in the owner paths (deriveKeys / deriveKeysFromSimpleToken),
    // so export succeeds; RO opens import it non-extractable, so this returns null and
    // inbox enumeration is owner-only until an RO derivation path is added.
    async readKeyRawBytes() {
        if (!this._readKey) return null
        try {
            const raw = await crypto.subtle.exportKey('raw', this._readKey)
            return new Uint8Array(raw)                                            // a fresh copy — callers may not mutate the key
        } catch (_) {
            return null                                                           // non-extractable (RO session)
        }
    }

    async setName(newName) {
        if (!this._settings) throw new Error('Vault not initialized')
        if (this._settings.vault_name === newName) return     // no-op rename
        this._settings.vault_name = newName
        this._settingsDefaulted = false                       // explicit name — no more fallback
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
        this._commitManager = new SGVaultCommit(this._objectStore, this._readKey, this._hmacKey)
        this._objectStore.setFormat(this._format)
    }

    // --- Branch index / format gate ----------------------------------------------------
    // Re-read the server's copy (one small read), apply the gate (id width, features) and keep
    // the parsed index for branches / tags. Called on open and before every sync, as the CLI's
    // pull and status do, so a vault raised while a tab is open is honoured on the next sync.
    async _refreshBranchIndex() {
        if (!this._branchIndexFileId) return null
        const { raw, index } = await this._refManager.readBranchIndexRaw(this._branchIndexFileId)
        if (raw && !index) return null                           // present but unreadable: keep what we had
        this._applyBranchIndex(index)
        return index
    }

    _applyBranchIndex(idx) {
        if (!idx || typeof idx !== 'object') return
        SGVaultBranchIndex.checkFormat(idx)                      // throws EFORMAT on a format this version cannot read
        this._branchIndex = idx
        this._format      = SGVaultBranchIndex.formatOf(idx)
        this._features    = SGVaultBranchIndex.features(idx)
        this._minClient   = SGVaultBranchIndex.minClient(idx)
        if (this._objectStore) this._objectStore.setFormat(this._format)
        if (Array.isArray(idx.branches)) {
            const named = idx.branches.find(b => b.branch_type === 'named' && b.name === 'current')
                       || idx.branches.find(b => b.branch_type === 'named')
            if (named?.head_ref_id && !this._refPinned) this._refFileId = named.head_ref_id
        }
    }

    // --- Rewind detection (sgit-ai Vault__Ref_Guard) ---------------------------------
    // Each device records the last named head it ACCEPTED (open, pull, merge, push). A remote
    // head that does not descend from it is a rewind: a rollback, a rewritten history, or a
    // host replaying an old ref. Reported as remoteHeadStatus; pull/merge refuse it unless
    // { acceptRewind: true }; nothing is ever applied silently.
    _acceptedHeadKey() { return `sg-vault-remote-head:${this._vaultId}:${this._refFileId}` }
    _loadAcceptedHead() {
        try { this._lastAcceptedHead = localStorage.getItem(this._acceptedHeadKey()) || null } catch (_) { this._lastAcceptedHead = this._lastAcceptedHead || null }
    }
    _recordAcceptedHead(commitId) {
        if (!commitId) return
        this._lastAcceptedHead = commitId
        this._remoteHeadStatus = 'forward'
        try { localStorage.setItem(this._acceptedHeadKey(), commitId) } catch (_) {}
    }
    // 'forward' when remoteHead equals or descends from the last accepted head (or none is
    // recorded); 'rewound' when it is an ancestor of it, or a complete unrelated lineage;
    // 'unknown' when the walk hit its limit before deciding.
    async _classifyRemoteHead(remoteHead) {
        const known = this._lastAcceptedHead
        let status = 'forward'
        if (known && remoteHead && remoteHead !== known) {
            const fwd = await this._walkReaches(remoteHead, known, 2000)
            if (fwd.reached) status = 'forward'
            else {
                const back = await this._walkReaches(known, remoteHead, 2000)
                status = back.reached ? 'rewound' : (fwd.complete ? 'rewound' : 'unknown')
            }
        }
        this._remoteHeadStatus = status
        return status
    }
    // BFS over all parents from `from`: { reached: target met, complete: walk exhausted under max }
    async _walkReaches(from, target, max) {
        if (!from || !target) return { reached: false, complete: true }
        if (from === target) return { reached: true, complete: true }
        const seen = new Set([from]); let wave = [from]
        while (wave.length) {
            if (seen.size > max) return { reached: false, complete: false }
            const commits = await this._batchLoadCommits(wave)
            const next = []
            for (const id of wave) {
                const c = commits.get(id)
                if (!c) return { reached: false, complete: false }          // missing object: cannot decide
                for (const p of (c.parents || [])) {
                    if (p === target) return { reached: true, complete: true }
                    if (!seen.has(p)) { seen.add(p); next.push(p) }
                }
            }
            wave = next
        }
        return { reached: false, complete: true }
    }
    rewindMessage(remoteHead) {
        return `the published branch was rewound or rewritten: it pointed at ${this._lastAcceptedHead} the last time this device saw it and now points at ${remoteHead}, which does not descend from it. If the owner force-pushed on purpose, accept the rewind; otherwise treat it as tampering and check with the vault owner. Nothing was changed.`
    }

    // --- Signature verification (sgit-ai Vault__Signatures) ---------------------------
    // Status per commit: 'verified' | 'bad' | 'unsigned' | 'no-key' | 'missing'. The key comes
    // from the commit's own author_key_id, else from the index's branch → public_key_id mapping;
    // key files are fetched from bare/keys/ (read_key-encrypted, so the host cannot substitute).
    async _publicKeyFor(commit) {
        let kid = commit.author_key_id ? String(commit.author_key_id) : ''
        if (!kid && commit.branch_id && this._branchIndex?.branches) {
            const meta = this._branchIndex.branches.find(b => String(b.branch_id) === String(commit.branch_id))
            if (meta?.public_key_id) kid = String(meta.public_key_id)
        }
        if (!kid) return null
        if (this._publicKeyCache.has(kid)) return this._publicKeyCache.get(kid)
        let key = null
        if (this._signer && kid === this._signer.keyId) {                 // our own key: no network needed
            try { key = await SGVaultSigning.importPublicKeyPem(this._signer.publicPem) } catch (_) { key = null }
            this._publicKeyCache.set(kid, key)
            return key
        }
        try {
            const pem = await this._refManager.readPublicKeyPem(kid)
            if (pem) key = await SGVaultSigning.importPublicKeyPem(pem)
        } catch (_) { key = null }
        this._publicKeyCache.set(kid, key)
        return key
    }
    async verifyCommit(commitId, commit = null) {
        if (!commit) {
            try { commit = await this._commitManager.loadCommit(commitId) } catch (_) { return 'missing' }
        }
        if (!commit.signature) return 'unsigned'
        const key = await this._publicKeyFor(commit)
        if (!key) return 'no-key'
        return (await SGVaultSigning.verifyCommit(commit, key)) ? 'verified' : 'bad'
    }
    // Walk from head (all parents), classify every commit reached. stopAt: ids not classified
    // nor expanded (what we already hold / the policy start). limit 0 = all.
    // Returns { total, counts, byStatus, firstFailure: [id, status] | null }
    async verifyChain(head, opts = {}) {
        const stop = new Set(opts.stopAt || []), limit = opts.limit || 0, anchor = opts.anchorPrefix || ''
        const seen = new Set(); const queue = head ? [head] : []
        const by = { verified: [], bad: [], unsigned: [], 'no-key': [], missing: [] }
        let firstFailure = null
        while (queue.length) {
            const cid = queue.shift()
            if (!cid || seen.has(cid) || stop.has(cid)) continue
            if (anchor && cid.startsWith('obj-cas-imm-' + anchor)) continue     // the policy's start and its history: not held against anyone
            seen.add(cid)
            if (limit && seen.size > limit) break
            let commit = null
            try { commit = await this._commitManager.loadCommit(cid) } catch (_) {}
            const status = commit ? await this.verifyCommit(cid, commit) : 'missing'
            by[status].push(cid)
            if (status !== 'verified' && !firstFailure) firstFailure = [cid, status]
            if (commit) for (const p of (commit.parents || [])) if (p && !seen.has(p)) queue.push(p)
        }
        const counts = {}; for (const k of Object.keys(by)) counts[k] = by[k].length
        return { total: seen.size, counts, byStatus: by, firstFailure }
    }
    // Under 'signatures-required': every commit from incomingHead down to what this device
    // already holds (everything reachable from heldHead) must verify (Vault__Incoming_Check).
    async _requireSignatures(incomingHead, heldHead) {
        if (!this.requiresSignatures || !incomingHead || incomingHead === heldHead) return
        const held = await this._localHistory(heldHead)
        if (held.has(incomingHead)) return
        const report = await this.verifyChain(incomingHead, { stopAt: held, anchorPrefix: SGVaultBranchIndex.sigAnchor(this._branchIndex) })
        if (report.firstFailure) {
            const [cid, status] = report.firstFailure
            const e = new Error(`this vault requires signed commits and commit ${cid} is ${status}; it was refused before anything was changed. Ask the vault owner; if the owner relaxes the policy (sgit vault format --remove-feature signatures-required), try again.`)
            e.code = 'ESIGNATURE'; e.commitId = cid; e.status = status; throw e
        }
    }
    async _localHistory(head) {
        const seen = new Set(); let wave = head ? [head] : []
        while (wave.length && seen.size < 5000) {
            const commits = await this._batchLoadCommits(wave); const next = []
            for (const id of wave) {
                if (seen.has(id)) continue
                seen.add(id)
                for (const p of (commits.get(id)?.parents || [])) if (p && !seen.has(p)) next.push(p)
            }
            wave = next
        }
        return seen
    }

    // --- Clone registration (sgit-ai _register_pending_branch / _ensure_public_key) -----
    // Publish this device's public key at bare/keys/<id> (once) and upsert our clone entry +
    // the named entry into the shared index. Called after every successful push and on create.
    // Publish this device's public key file once (bare/keys/<id>); before the first push so
    // every verifier, including this one's pre-push policy check, can find it.
    async _ensurePublicKey() {
        if (!this.writable || !this._signer || this._publicKeyRegistered) return
        const s = this._signer
        if (!(await this._refManager.publicKeyExists(s.keyId))) await this._refManager.writePublicKey(s.keyId, s.publicKeyFilePlain())
        this._publicKeyRegistered = true
    }

    async _registerClone() {
        if (!this.writable || !this._branchIndexFileId) return
        const entries = []
        if (this._signer) {
            const s = this._signer
            await this._ensurePublicKey()
            const named = this._branchIndex?.branches?.find(b => b.branch_type === 'named')
            // `name` must satisfy the CLI's Safe_Str__Branch_Name (^[a-zA-Z0-9_-]{1,64}$): one bad
            // entry makes the CLI's parse of the WHOLE index fail, and its next push then
            // overwrites the index from its single-branch fallback (verified against 0.21.0).
            // The ref-derivation name ('web-ui:<branch id>') is internal and never written here.
            entries.push({ branch_id: s.branchId, name: 'web-ui', branch_type: 'clone',
                           head_ref_id: this._cloneRefFileId, public_key_id: s.keyId, private_key_id: null,
                           created_at: Number(s.createdAt) || Date.now(), creator_branch: named ? named.branch_id : null,
                           display_name: 'web-ui' })
        }
        const { index } = await this._refManager.upsertBranchIndex(this._branchIndexFileId, entries, { namedRefId: this._refFileId })
        if (index) this._applyBranchIndex(index)
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
            if (this._refManager) this._refManager.commitPendingRaw()
            return result
        } catch (err) {
            this._objectStore.discardBatch()
            if (this._refManager) this._refManager.discardPendingRaw()
            this._headCommitId         = snap.head
            this._namedHeadId          = snap.namedHead
            this._settingsDirty        = snap.settingsDirty
            this._currentSettingsEntry = snap.settingsEntry
            throw err
        }
    }

    // --- Commit: serialize tree → create tree object → create commit → update ref

    async _commit(message) {
      // Provenance trailer (07 Sep analysis §7): a kernel writing on behalf of ANOTHER vault
      // sets _commitTrailer ('Via-Mount: <label> (declared|runtime)') so the child's own
      // history records which door the write came through — without naming the vault
      // behind the door. Messages are read_key-encrypted like every commit message.
      if (this._commitTrailer) message = String(message || '') + '\n\n' + this._commitTrailer
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
                content_type: 'application/json',
                large:        false,
                blob_id:      settingsBlobId,
                tree_id:      null
            }
            entries.push(settingsEntry)
            this._currentSettingsEntry = settingsEntry
        }

        const treeId    = await this._commitManager.createTree(entries)
        const parentIds = this._headCommitId ? [this._headCommitId] : []
        const commitId  = await this._commitManager.createCommit({
            parentIds, treeId, message, branchId: null, signer: this._signer
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
                    content_type: entry.content_type || undefined,     // undefined → createTree guesses as the CLI does
                    large:        !!entry.large,
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
                this._settingsDefaulted = false          // real settings record found
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
            this._settingsDefaulted = true               // no settings record — placeholder name
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
            size: entry.size | 0, content_hash: entry.content_hash || null,
            content_type: entry.content_type || null, large: !!entry.large
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
