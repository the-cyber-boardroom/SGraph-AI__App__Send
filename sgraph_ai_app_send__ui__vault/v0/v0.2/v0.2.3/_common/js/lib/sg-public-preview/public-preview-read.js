/* =================================================================================
   SGraph Public Vault Previews — Read path (public, light, no vault deps)
   v0.1.0

   fetchPreview(apiBase, publicId):
     derive transfer-id + read-only key → GET /api/transfers/download/{tid}
     (tokenless) → AES-GCM decrypt → JSON.parse → validatePreview.

   Returns { status, preview?, transferId, reason? } where status is one of:
     'ok' | 'not-found' | 'expired' | 'exhausted' | 'invalid' | 'error'

   Depends on: PublicPreviewCrypto (public-preview-crypto.js),
               PublicPreviewSchema (public-preview-schema.js).
   ================================================================================= */

const PublicPreviewRead = {

    async fetchPreview(apiBase, publicId) {
        const base       = String(apiBase || '').replace(/\/$/, '')
        const transferId = await PublicPreviewCrypto.deriveTransferId(publicId)
        const url        = `${base}/api/transfers/download/${transferId}`

        let response
        try {
            response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' })
        } catch (err) {
            return { status: 'error', transferId, reason: err.message }
        }

        if (response.status === 404) return { status: 'not-found', transferId }
        if (response.status === 410) {
            const detail = await response.text().catch(() => '')
            const kind   = /exhaust/i.test(detail) ? 'exhausted' : 'expired'
            return { status: kind, transferId }
        }
        if (!response.ok) return { status: 'error', transferId, reason: `HTTP ${response.status}` }

        try {
            const cipher    = await response.arrayBuffer()
            const readKeyRO = await PublicPreviewCrypto.deriveReadKeyRO(publicId)
            const plain     = await PublicPreviewCrypto.decrypt(cipher, readKeyRO)
            const json      = JSON.parse(new TextDecoder().decode(plain))
            const valid     = PublicPreviewSchema.validatePreview(json)
            if (!valid.ok) return { status: 'invalid', transferId, reason: valid.reason }
            // client-side expiry hint (server is authoritative via 410; this avoids a flash)
            if (json.expiry && json.expiry.expires_at_ms && Date.now() > json.expiry.expires_at_ms) {
                return { status: 'expired', transferId }
            }
            return { status: 'ok', transferId, preview: json }
        } catch (err) {
            // wrong/corrupt key/data, or non-JSON — indistinguishable to the public page by design
            return { status: 'invalid', transferId, reason: err.message }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PublicPreviewRead }
