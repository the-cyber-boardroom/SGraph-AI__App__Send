/* =================================================================================
   SGraph Vault — Utility Helpers
   v0.1.0 — Shared formatting, validation, and display utilities
   ================================================================================= */

const VaultHelpers = {

    escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    },

    formatNumber(num) {
        return new Intl.NumberFormat().format(num)
    },

    formatBytes(bytes) {
        if (bytes === 0) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(1024))
        const value = bytes / Math.pow(1024, i)
        return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
    },

    formatTimestamp(ts) {
        try {
            return new Intl.DateTimeFormat(VaultI18n.locale, {
                year: 'numeric', month: 'short', day: 'numeric'
            }).format(new Date(ts))
        } catch {
            return ts
        }
    },

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text)
            return true
        } catch {
            const textarea = document.createElement('textarea')
            textarea.value = text
            textarea.style.position = 'fixed'
            textarea.style.opacity  = '0'
            document.body.appendChild(textarea)
            textarea.select()
            const ok = document.execCommand('copy')
            document.body.removeChild(textarea)
            return ok
        }
    }
}
