/* =================================================================================
   SGit Performance Harness — Vault Setup & Ephemeral Vault Management

   Provides helpers to bring a test vault into a known state for each scenario.
   The recommended pattern is an ephemeral vault (created at session start, deleted
   at session end) so write scenarios leave zero permanent server traces.
   ================================================================================= */

class VaultSetup {

    constructor({ endpoint, token } = {}) {
        this._endpoint    = endpoint || 'https://dev.send.sgraph.ai'
        this._token       = token    || ''
        this._vaultKey    = null
        this._deleteKey   = null   // if we created it via the transfer API, may have a delete handle
        this._isEphemeral = false
    }

    get vaultKey()  { return this._vaultKey  }
    get isLoaded()  { return !!this._vaultKey }

    // ── Load an existing vault key ─────────────────────────────────────────────

    loadKey(key) {
        this._vaultKey    = key.trim()
        this._isEphemeral = false
    }

    // ── Create an ephemeral vault (deleted on cleanup) ─────────────────────────

    async createEphemeral(name = 'sgit-perf-harness') {
        const send  = this._makeSend()
        const vault = await SGVault.create(send, null, { name })
        this._vaultKey    = vault.getVaultKey()
        this._isEphemeral = true
        return this._vaultKey
    }

    _makeSend() {
        return new SGSend({ endpoint: this._endpoint, token: this._token })
    }

    // ── Populate with N small test files ──────────────────────────────────────

    async addTestFiles(vault, count = 5, label = 'test') {
        for (let i = 0; i < count; i++) {
            const content = new TextEncoder().encode(`${label}-content-${i}-${'x'.repeat(64)}`)
            await vault.addFile('/', `${label}-${i}.txt`, content)
        }
        await vault.push()
    }

    // ── Create a 3-level deep tree for subtree-expand benchmarks ──────────────

    async createDeepTree(vault) {
        for (const lvl1 of ['alpha', 'beta']) {
            await vault.createFolder(`/${lvl1}`)
            await vault.createFolder(`/${lvl1}/sub`)
            await vault.createFolder(`/${lvl1}/sub/deep`)
            const data = new TextEncoder().encode(`leaf-content-${lvl1}`)
            await vault.addFile(`/${lvl1}/sub/deep`, 'leaf.txt', data)
        }
        await vault.push()
    }

    // ── Open baseline + optimised pair ────────────────────────────────────────

    async openPair(opts = {}) {
        if (!this._vaultKey) throw new Error('No vault key loaded')
        const ep = this._endpoint, tok = this._token

        const bSend   = new InstrumentedSGSend({ endpoint: ep, token: tok }, { client: 'baseline' })
        const oSend   = new InstrumentedSGSend({ endpoint: ep, token: tok }, { client: 'optimised' })
        const fastOpts = window.__vsHarness?.opts || {}

        const bVault  = await SGVault.open(bSend, this._vaultKey)
        const oFast   = new SGVaultFast(oSend, fastOpts)
        await oFast.open(this._vaultKey)

        return { baseline: { vault: bVault, send: bSend }, optimised: { vault: oFast, send: oSend } }
    }

    // ── Delete the ephemeral vault (best-effort) ───────────────────────────────

    async deleteVault() {
        if (!this._vaultKey || !this._isEphemeral) return false
        try {
            const send = this._makeSend()
            const v    = await SGVault.open(send, this._vaultKey)
            // Walk and delete every vault object — there is no "nuke vault" endpoint,
            // so we delete each tracked file then the refs.
            // Best-effort: we call vaultDelete for the two ref files.
            // CAS objects are content-addressed and may be shared; leave them.
            await send.vaultDelete(v._vaultId, `bare/refs/${v._refFileId}`,      v._writeKey)
            await send.vaultDelete(v._vaultId, `bare/refs/${v._cloneRefFileId}`, v._writeKey)
            return true
        } catch (e) {
            console.warn('[VaultSetup] delete failed:', e)
            return false
        }
    }
}
