/* =================================================================================
   SGit Performance Harness — Optimised Vault Client

   SGVaultFast composes an SGVault instance and applies whichever optimisations
   are toggled on. It mirrors the public SGVault surface (open, push, pull,
   addFile, getFile, listFolder, …) and delegates to the underlying vault for
   everything not being optimised.

   Zero modifications to _common/. All composition via prototype patching on the
   specific vault instance created here.
   ================================================================================= */

class SGVaultFast {

    constructor(sendClient, opts = {}) {
        this._send    = sendClient   // InstrumentedSGSend
        this._opts    = opts         // { localCloneRef, singleBranch, refTTLCache, batchPush, subtreeFanout, lcaCache }
        this._vault   = null
        this._ttlCache = new RefTTLCache({ ttlMs: opts.refTTLCacheTTL || 3000 })
        this._lcaCache = new LCACache()
    }

    // ── Open ───────────────────────────────────────────────────────────────────
    // Custom open: mirrors SGVault.open() but skips toggled reads.

    async open(vaultKey) {
        const v   = new SGVault(this._send)
        v.__client = this._send._client   // carry client label for cache-hit events

        // Key derivation (identical to SGVault.open)
        const isSimpleToken = /^[a-z]+-[a-z]+-\d{4}$/.test(vaultKey)
        let keys, passphrase, vaultId

        if (isSimpleToken) {
            keys       = await SGVaultCrypto.deriveKeysFromSimpleToken(vaultKey)
            passphrase = vaultKey
            vaultId    = keys.vaultId
        } else {
            const parsed = SGVaultCrypto.parseVaultKey(vaultKey)
            passphrase   = parsed.passphrase
            vaultId      = parsed.vaultId
            if (/^[a-z]+-[a-z]+-\d{4}$/.test(passphrase)) {
                keys = await SGVaultCrypto.deriveKeysFromSimpleToken(passphrase)
            } else {
                keys = await SGVaultCrypto.deriveKeys(passphrase, vaultId)
            }
        }

        v._passphrase        = passphrase
        v._vaultId           = vaultId
        v._readKey           = keys.readKey
        v._writeKey          = keys.writeKey
        v._hmacKey           = keys.hmacKey
        v._refFileId         = keys.refFileId
        v._branchIndexFileId = keys.branchIndexFileId
        v._cloneRefFileId    = await SGVaultCrypto.deriveBranchRefFileId(keys.hmacKey, vaultId, 'web-ui')
        v._initManagers()

        // Opt: skip branch-index read (single-branch vaults only need the named ref)
        if (!this._opts.singleBranch) {
            try {
                const idx = await v._refManager.readBranchIndex(v._branchIndexFileId)
                if (idx?.branches) {
                    v._branchIndex = idx
                    const named = idx.branches.find(b => b.branch_type === 'named')
                    if (named?.head_ref_id) v._refFileId = named.head_ref_id
                }
            } catch (_) {}
        }

        // Always read named HEAD (required)
        const namedCommitId = await v._refManager.readRef(v._refFileId)
        if (!namedCommitId) throw new Error('Vault not found: named HEAD ref missing')
        v._namedHeadId = namedCommitId

        // Opt: skip clone-ref server read — derive locally (matches CLI behaviour)
        if (!this._opts.localCloneRef) {
            const cloneCommitId = await v._refManager.readRef(v._cloneRefFileId)
            v._headCommitId = cloneCommitId || namedCommitId
        } else {
            v._headCommitId = namedCommitId  // local derivation: no 404 round-trip
        }

        await v._loadTreeFromCommit(v._headCommitId)

        // Apply post-open patching
        if (this._opts.refTTLCache)    applyRefTTLCache(v, this._ttlCache)
        if (this._opts.batchPush)      applyBatchPush(v)
        if (this._opts.subtreeFanout)  applySubtreeFanout(v)
        if (this._opts.lcaCache)       applyLCACache(v, this._lcaCache)

        this._vault = v
        return this
    }

    // ── Delegate everything to the underlying vault ────────────────────────────

    get vaultId()  { return this._vault?._vaultId           }
    get name()     { return this._vault?.name                }
    get writable() { return this._vault?.writable            }

    addFile(fp, fn, data)      { return this._vault.addFile(fp, fn, data) }
    updateFile(fp, fn, data)   { return this._vault.updateFile(fp, fn, data) }
    getFile(fp, fn)            { return this._vault.getFile(fp, fn) }
    listFolder(fp)             { return this._vault.listFolder(fp) }
    createFolder(fp)           { return this._vault.createFolder(fp) }
    loadSubTreeOnDemand(fp)    { return this._vault.loadSubTreeOnDemand(fp) }
    push()                     { return this._vault.push() }
    pull()                     { return this._vault.pull() }
    getStats()                 { return this._vault.getStats() }
    getBehindCount()           { return this._vault.getBehindCount() }
    getAheadCount()            { return this._vault.getAheadCount() }
}
