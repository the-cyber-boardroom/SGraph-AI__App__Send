/* =================================================================================
   SGit Performance Harness — Instrumented SGSend
   Wraps SGSend method-by-method to fire sg-vault-*:* CustomEvents and accumulate
   per-scenario metrics. Two instances (baseline + optimised) share the same
   document event bus so <sg-vault-trace> captures both.

   Event naming mirrors the tools-team vault-embed taxonomy so existing tooling
   listens without modification. We extend it with write/ref/batch namespaces.
   ================================================================================= */

class InstrumentedSGSend extends SGSend {

    constructor(opts, { client /* 'baseline' | 'optimised' */ }) {
        super(opts)
        this._client  = client
        this._metrics = { requests: 0, totalReqBytes: 0, totalResBytes: 0, totalMs: 0, log: [] }
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    getMetrics()  { return { ...this._metrics, log: [...this._metrics.log] } }
    resetMetrics() { this._metrics = { requests: 0, totalReqBytes: 0, totalResBytes: 0, totalMs: 0, log: [] } }

    // ── Event helper ───────────────────────────────────────────────────────────

    _fire(name, detail) {
        document.dispatchEvent(new CustomEvent(name, {
            bubbles: true, composed: true,
            detail: { client: this._client, ts: performance.now(), ...detail }
        }))
    }

    _record(type, detail) {
        this._metrics.requests++
        this._metrics.totalMs        += detail.durationMs || 0
        this._metrics.totalReqBytes  += detail.reqBytes   || 0
        this._metrics.totalResBytes  += detail.resBytes   || 0
        this._metrics.log.push({ type, client: this._client, ts: performance.now(), ...detail })
    }

    // ── Vault reads ─────────────────────────────────────────────────────────────

    async vaultRead(vaultId, fileId) {
        const typeHint = fileId.startsWith('bare/refs/') ? 'ref' : 'fetch'
        this._fire(`sg-vault-${typeHint}:fetch-started`, { vaultId, fileId: _mask(fileId), fileIdFull: fileId })
        const t0  = performance.now()
        const res = await super.vaultRead(vaultId, fileId)
        const ms  = performance.now() - t0
        const resBytes = res?.byteLength || 0
        this._fire(`sg-vault-${typeHint}:fetch-completed`, {
            vaultId, fileId: _mask(fileId), fileIdFull: fileId,
            bytesReceived: resBytes, fetchMs: ms,
            cacheHit: false, status: res ? 200 : 404
        })
        this._record(typeHint + '-read', { fileId: _mask(fileId), fileIdFull: fileId, resBytes, durationMs: ms, status: res ? 200 : 404 })
        return res
    }

    async vaultReadLarge(vaultId, filePath) {
        this._fire('sg-vault-fetch:fetch-started', { vaultId, fileId: _mask(filePath), fileIdFull: filePath, large: true })
        const t0  = performance.now()
        const res = await super.vaultReadLarge(vaultId, filePath)
        const ms  = performance.now() - t0
        const resBytes = res?.byteLength || 0
        this._fire('sg-vault-fetch:fetch-completed', {
            vaultId, fileId: _mask(filePath), fileIdFull: filePath, bytesReceived: resBytes, fetchMs: ms, large: true
        })
        this._record('fetch-read-large', { fileId: _mask(filePath), fileIdFull: filePath, resBytes, durationMs: ms })
        return res
    }

    // ── Vault writes ────────────────────────────────────────────────────────────

    async vaultWrite(vaultId, fileId, writeKey, data) {
        const typeHint  = fileId.startsWith('bare/refs/') ? 'ref' : 'write'
        const reqBytes  = data?.byteLength || data?.length || 0
        this._fire(`sg-vault-${typeHint}:write-started`, { vaultId, fileId: _mask(fileId), fileIdFull: fileId, reqBytes })
        const t0  = performance.now()
        const res = await super.vaultWrite(vaultId, fileId, writeKey, data)
        const ms  = performance.now() - t0
        this._fire(`sg-vault-${typeHint}:write-completed`, {
            vaultId, fileId: _mask(fileId), fileIdFull: fileId, writeMs: ms, status: 200
        })
        this._record(typeHint + '-write', { fileId: _mask(fileId), fileIdFull: fileId, reqBytes, durationMs: ms })
        return res
    }

    // ── Vault batch ─────────────────────────────────────────────────────────────

    async vaultBatch(vaultId, writeKey, ops) {
        const opCount  = ops?.length || 0
        const reqBytes = JSON.stringify(ops).length
        const opFileIds = (ops || []).map(o => o.file_id).filter(Boolean)
        this._fire('sg-vault-batch:batch-started', { vaultId, opCount, reqBytes, opFileIds })
        const t0  = performance.now()
        const res = await super.vaultBatch(vaultId, writeKey, ops)
        const ms  = performance.now() - t0
        this._fire('sg-vault-batch:batch-completed', {
            vaultId, opCount, batchMs: ms, status: 200, resBytes: JSON.stringify(res).length, opFileIds
        })
        this._record('batch', { opCount, reqBytes, resBytes: JSON.stringify(res).length, durationMs: ms, opFileIds })
        return res
    }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function _mask(fileId) {
    if (!fileId) return fileId
    // Keep prefix (e.g. "bare/refs/ref-pid-muw-") and last 4 chars, mask middle
    const parts = fileId.split('/')
    const last  = parts[parts.length - 1]
    if (last.length > 16) {
        parts[parts.length - 1] = last.slice(0, 14) + '…'
    }
    return parts.join('/')
}
