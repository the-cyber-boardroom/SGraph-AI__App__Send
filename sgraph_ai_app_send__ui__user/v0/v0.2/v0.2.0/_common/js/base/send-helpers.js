/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Utility Helpers
   v0.2.0 — Shared formatting, validation, and display utilities
   ═══════════════════════════════════════════════════════════════════════════════ */

const SendHelpers = {

    // ─── Text Safety ──────────────────────────────────────────────────────

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // ─── Number Formatting ────────────────────────────────────────────────

    formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    },

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = bytes / Math.pow(1024, i);
        return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    },

    // ─── Timestamp Formatting ─────────────────────────────────────────────

    formatTimestamp(ts) {
        try {
            return new Date(ts).toUTCString();
        } catch (e) {
            return ts;
        }
    },

    // ─── URL Validation ──────────────────────────────────────────────────

    isValidUrl(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    },

    // ─── Clipboard ───────────────────────────────────────────────────────

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        }
    },

    // ─── Event Throttling ────────────────────────────────────────────────

    debounce(fn, wait) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    },

    // ─── SGraph Send Domain Helpers ──────────────────────────────────────

    /** Format a 12-char transfer ID for display: "abc1...f456" */
    formatTransferId(id) {
        if (!id || id.length < 8) return id || '';
        return `${id.slice(0, 4)}...${id.slice(-4)}`;
    },

    /** Format a base64 encryption key for display (truncated) */
    formatKey(key) {
        if (!key) return '';
        return key.length > 24 ? `${key.slice(0, 24)}...` : key;
    },

    /** Validate a transfer ID (12 alphanumeric chars) */
    validateTransferId(id) {
        return /^[a-zA-Z0-9_-]{12}$/.test(id);
    },

    /** Build a locale-aware download URL */
    buildDownloadUrl(transferId, key, locale) {
        const loc = locale || 'en-gb';
        const fragment = key ? `${transferId}/${key}` : transferId;
        return `${window.location.origin}/${loc}/download/#${fragment}`;
    }
};
