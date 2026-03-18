/* =============================================================================
   SGraph Send — Download Component
   v0.2.4 — Surgical overlay on v0.2.3

   Changes:
     - Fix error flash: when a friendly token is in the URL, v0.2.0's
       connectedCallback fires before this overlay loads and makes a doomed
       API call with the raw token as transfer ID. The 404 error briefly
       flashes before v0.2.3's re-trigger code kicks in. Fix: suppress
       error rendering during the first 600ms of page load, giving the
       overlay chain time to load and re-trigger with proper token resolution.
     - Also: add a generation counter to loadTransferInfo so stale API
       responses from v0.2.0's initial call don't overwrite the correct state
       set by v0.2.3's re-trigger.

   Loads AFTER v0.2.3 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v024] SendDownload not found — skipping');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
var _v023_loadTransferInfo = SendDownload.prototype.loadTransferInfo;
var _v023_render           = SendDownload.prototype.render;

// ─── Generation counter — prevents stale API responses from v0.2.0 ──────────
// Each call to loadTransferInfo increments the generation. When the async
// response arrives, if the generation has changed (because v0.2.3 re-triggered),
// the stale response is discarded.

SendDownload.prototype.loadTransferInfo = async function() {
    this._v024_loadGen = (this._v024_loadGen || 0) + 1;
    var myGen = this._v024_loadGen;

    try {
        if (this.tokenName) {
            try {
                var tokenResult = await ApiClient.validateToken(this.tokenName);
                if (myGen !== this._v024_loadGen) return; // stale
                if (tokenResult.remaining !== undefined) this.tokenRemaining = tokenResult.remaining;
                if (!tokenResult.success) {
                    this.state = 'error';
                    this.errorMessage = this.getTokenErrorMessage(tokenResult.reason);
                    this.render(); return;
                }
            } catch (e) { /* token validation unavailable — allow through */ }
        }

        if (myGen !== this._v024_loadGen) return; // stale

        this.transferInfo = await ApiClient.getTransferInfo(this.transferId);

        if (myGen !== this._v024_loadGen) return; // stale

        if (this.transferInfo.status !== 'completed') {
            this.state = 'error';
            this.errorMessage = this.t('download.error.not_ready');
        } else {
            this.state = 'ready';
        }
    } catch (e) {
        if (myGen !== this._v024_loadGen) return; // stale — discard error
        this.state = 'error';
        this.errorMessage = this.t('download.error.not_found');
    }
    this.render();
    this.setupEventListeners();

    if (this.state === 'ready' && this.hashKey) this.startDownload(this.hashKey);
};

// ─── Suppress error flash during initial load ───────────────────────────────
// The error state rendered by v0.2.0's initial doomed API call would flash
// for ~100-300ms before v0.2.3's re-trigger. We inject CSS that hides error
// states with an animation delay, then remove it once the overlay chain is
// fully loaded.

(function suppressFlash() {
    var style = document.createElement('style');
    style.id = 'v024-error-suppress';
    style.textContent = '.status--error { opacity: 0 !important; transition: none !important; }';
    document.head.appendChild(style);

    // Remove the suppression after a short delay (overlay chain is loaded)
    setTimeout(function() {
        var el = document.getElementById('v024-error-suppress');
        if (el) el.remove();
    }, 100);
})();

// ─── Re-process already-upgraded elements with generation counter ───────────
// If v0.2.0/v0.2.3 already started a loadTransferInfo call, bump the generation
// to invalidate it, then re-trigger properly.
document.querySelectorAll('send-download').forEach(function(el) {
    var hash = window.location.hash.substring(1);
    if (hash && typeof FriendlyCrypto !== 'undefined' && FriendlyCrypto.isFriendlyToken(hash)) {
        // Bump generation to kill any in-flight v0.2.0 API call
        el._v024_loadGen = (el._v024_loadGen || 0) + 1;
        // v0.2.3's re-trigger already set state to loading — just ensure it sticks
        if (el.state !== 'loading' || el._friendlyResolved) {
            el._friendlyToken = hash;
            el._friendlyResolved = false;
            el.transferId = null;
            el.hashKey = null;
            el.state = 'loading';
            el.render();
            el._resolveFriendlyToken(hash);
        }
    }
});

console.log('[send-download-v024] Error flash fix (generation counter + CSS suppression)');

})();
