/* =================================================================================
   SGit Performance Harness — Optimisation Modules

   Six independently-toggleable optimisations. Each is a pure module; SGVaultFast
   applies whichever are enabled at vault-open time.

   Optimisations:
     localCloneRef   — skip the 404 clone-ref read on open
     singleBranch    — skip the branch-index read for single-branch vaults
     refTTLCache     — 2–5s in-memory cache on readRef calls
     batchPush       — fuse both ref writes into one vaultBatch call
     subtreeFanout   — prefetch direct children in parallel on folder expand
     lcaCache        — cache common-ancestor results keyed by (headA, headB)
   ================================================================================= */

// ── RefTTLCache ────────────────────────────────────────────────────────────────
// Wraps a ref-manager's readRef with a short-lived in-memory TTL.
// Invalidate whenever a write to that ref happens.

class RefTTLCache {
    constructor({ ttlMs = 3000 } = {}) {
        this._ttlMs  = ttlMs
        this._store  = new Map()   // refId → { value, expiresAt }
    }

    get(refId) {
        const entry = this._store.get(refId)
        if (!entry || Date.now() > entry.expiresAt) { this._store.delete(refId); return null }
        return entry.value
    }

    set(refId, value) {
        this._store.set(refId, { value, expiresAt: Date.now() + this._ttlMs })
    }

    invalidate(refId) { this._store.delete(refId) }
    invalidateAll()   { this._store.clear() }

    setTTL(ms)        { this._ttlMs = ms }
}

// ── LCACache ───────────────────────────────────────────────────────────────────
// Caches common-ancestor results. The answer is deterministic — if neither head
// has moved, the answer is the same. Keyed by sorted pair of commit IDs.

class LCACache {
    constructor() {
        this._store = new Map()
    }

    key(a, b)         { return a < b ? `${a}:${b}` : `${b}:${a}` }
    get(a, b)         { return this._store.get(this.key(a, b)) || null }
    set(a, b, lca)    { this._store.set(this.key(a, b), lca) }

    // When a head moves, invalidate all entries that mention the old commit
    invalidateHead(commitId) {
        for (const [k] of this._store) {
            if (k.includes(commitId)) this._store.delete(k)
        }
    }

    clear() { this._store.clear() }
}

// ── BatchOps builder ───────────────────────────────────────────────────────────
// Encodes an encrypted ArrayBuffer to base64 for inclusion in a JSON batch
// payload. The vaultBatch endpoint accepts {op:'write', file_id, data}.

function ab2b64(ab) {
    const bytes = new Uint8Array(ab)
    let   bin   = ''
    // Chunked to avoid call-stack limit on large blobs
    for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
    }
    return btoa(bin)
}

async function buildRefWriteOp(refFileId, commitId, readKey) {
    const payload   = new TextEncoder().encode(JSON.stringify({ commit_id: commitId }))
    const encrypted = await SGSendCrypto.encrypt(payload, readKey)
    return { op: 'write', file_id: `bare/refs/${refFileId}`, data: ab2b64(encrypted) }
}

// ── applyRefTTLCache ───────────────────────────────────────────────────────────
// Wraps an existing SGVaultRefManager's readRef in-place.

function applyRefTTLCache(vault, ttlCache) {
    const mgr         = vault._refManager
    const origRead    = mgr.readRef.bind(mgr)
    const origWrite   = mgr.writeRef.bind(mgr)

    mgr.readRef = async (refFileId) => {
        const cached = ttlCache.get(refFileId)
        if (cached) {
            document.dispatchEvent(new CustomEvent('sg-vault-ref:cache-hit', {
                bubbles: true, composed: true,
                detail: { client: vault.__client, refFileId: refFileId.slice(0, 14) + '…' }
            }))
            return cached
        }
        const result = await origRead(refFileId)
        if (result) ttlCache.set(refFileId, result)
        return result
    }

    mgr.writeRef = async (refFileId, commitId) => {
        ttlCache.invalidate(refFileId)   // stale on write
        return origWrite(refFileId, commitId)
    }
}

// ── applyBatchPush ─────────────────────────────────────────────────────────────
// Replaces vault.push() so both ref writes go in one vaultBatch call.
// Baseline: 2 serial vaultWrite (one clone-ref, one named-ref)
// Optimised: 1 vaultBatch with both ops

function applyBatchPush(vault) {
    vault.push = async function() {
        if (!this._cloneRefFileId) throw new Error('No clone branch initialised')
        if (!this.writable)        throw new Error('Read-only: no write key')

        const [namedOp, cloneOp] = await Promise.all([
            buildRefWriteOp(this._refFileId,      this._headCommitId, this._readKey),
            buildRefWriteOp(this._cloneRefFileId, this._headCommitId, this._readKey)
        ])

        await this._sgSend.vaultBatch(this._vaultId, this._writeKey, [namedOp, cloneOp])
        this._namedHeadId = this._headCommitId
    }
}

// ── applySubtreeFanout ─────────────────────────────────────────────────────────
// When loadSubTreeOnDemand is called, also prefetch sibling lazy sub-trees that
// share the same parent. Parallel fetches vs serial.

function applySubtreeFanout(vault) {
    const orig = vault.loadSubTreeOnDemand.bind(vault)
    vault.loadSubTreeOnDemand = async function(folderPath) {
        // Load the requested folder first
        await orig(folderPath)

        // Find sibling lazy folders in the same parent and prefetch in parallel
        const parts    = folderPath.split('/').filter(Boolean)
        parts.pop()
        const parentPath = '/' + parts.join('/')
        const parent     = vault._findNode(parentPath)
        if (!parent?.children) return

        const siblings = Object.entries(parent.children)
            .filter(([, entry]) => entry.type === 'folder' && entry._loaded === false)
            .map(([name]) => (parentPath === '/' ? `/${name}` : `${parentPath}/${name}`))

        if (siblings.length) {
            await Promise.all(siblings.map(p => orig(p).catch(() => {})))
        }
    }
}

// ── applyLCACache ──────────────────────────────────────────────────────────────
// Wraps _findCommonAncestor to cache deterministic results.

function applyLCACache(vault, lcaCache) {
    const orig = vault._findCommonAncestor.bind(vault)
    vault._findCommonAncestor = async function(idA, idB) {
        const cached = lcaCache.get(idA, idB)
        if (cached !== null) return cached
        const result = await orig(idA, idB)
        lcaCache.set(idA, idB, result)
        return result
    }
}
