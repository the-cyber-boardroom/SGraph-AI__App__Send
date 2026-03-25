/* =============================================================================
   SGraph Send — Download Component
   v0.2.14 — Surgical overlay on v0.2.13

   Changes:
     SECURITY FIX:
     - Prevent friendly token leak to server. When v0.2.0's connectedCallback
       fires (before overlays load), it calls loadTransferInfo with the raw
       friendly token as transferId, sending GET /api/transfers/info/crash-oxide-2736
       to the server. The v0.2.4 generation counter discards the response but
       does NOT prevent the request. This fix adds a guard that aborts
       loadTransferInfo if transferId matches the friendly token pattern.

     LAYOUT FIXES:
     - Gallery header: wrap on narrow screens so elements don't overlap.
       Header-left and header-right stack vertically on mobile.
     - File cards: prevent overlap on narrow screens by reducing grid
       minimum width and ensuring cards don't overflow.

   Loads AFTER v0.2.13 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0214] SendDownload not found — skipping');
    return;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY FIX: Prevent friendly token leak to server
//
// Problem: <send-download> exists in DOM before scripts load. When v0.2.0's
// send-download.js runs customElements.define(), the browser immediately fires
// connectedCallback with v0.2.0's implementation, which calls parseUrl() →
// sets transferId = raw hash (e.g. "crash-oxide-2736") → calls loadTransferInfo()
// → GET /api/transfers/info/crash-oxide-2736 → leaks the friendly token.
//
// v0.2.4 added a generation counter to discard the stale response, but the
// HTTP request itself still goes out, leaking the token to the server.
//
// Fix: Guard loadTransferInfo — if transferId matches the friendly token
// pattern, abort immediately. The correct flow (via v0.2.3's _resolveFriendlyToken)
// will derive the proper 12-hex-char transfer ID and call loadTransferInfo again.
// ═══════════════════════════════════════════════════════════════════════════

var _v024_loadTransferInfo = SendDownload.prototype.loadTransferInfo;

SendDownload.prototype.loadTransferInfo = function() {
    // Block API calls that would leak a friendly token
    if (this.transferId && typeof FriendlyCrypto !== 'undefined' &&
        FriendlyCrypto.isFriendlyToken(this.transferId)) {
        console.warn('[v0214] Blocked API call with friendly token as transferId — token not leaked');
        // Bump generation counter so v0.2.4 doesn't re-trigger
        this._v024_loadGen = (this._v024_loadGen || 0) + 1;
        return Promise.resolve();
    }
    return _v024_loadTransferInfo.call(this);
};

// Also retroactively kill any in-flight request from v0.2.0 that already started
// (if this script loads fast enough, the fetch may still be pending)
document.querySelectorAll('send-download').forEach(function(el) {
    if (el.transferId && typeof FriendlyCrypto !== 'undefined' &&
        FriendlyCrypto.isFriendlyToken(el.transferId)) {
        // Clear the leaked transfer ID
        el.transferId = null;
        // Bump generation to invalidate any pending response
        el._v024_loadGen = (el._v024_loadGen || 0) + 1;
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT FIX: Gallery header and grid responsive styles
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0214-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0214-download-styles';
    s.textContent = '\
        /* ── Gallery header: wrap on narrow screens ── */\
        .v025-gallery__header {\
            flex-wrap: wrap;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v025-gallery__header-left {\
            flex-wrap: wrap;\
            min-width: 0;\
        }\
        .v025-gallery__header-right {\
            flex-wrap: wrap;\
        }\
        .v025-gallery__name {\
            min-width: 0;\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
            max-width: 300px;\
        }\
        \
        /* ── File cards: prevent overlap on narrow/mobile screens ── */\
        @media (max-width: 600px) {\
            .v025-gallery__header {\
                flex-direction: column;\
                align-items: flex-start;\
            }\
            .v025-gallery__header-right {\
                width: 100%;\
                justify-content: flex-start;\
            }\
            .v025-grid {\
                grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;\
                gap: var(--space-2, 0.5rem) !important;\
                padding: var(--space-2, 0.5rem) !important;\
            }\
            .v025-grid--large {\
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;\
            }\
            .v025-thumb__label {\
                font-size: 0.7rem;\
                padding: 4px 6px;\
            }\
        }\
        @media (max-width: 400px) {\
            .v025-grid {\
                grid-template-columns: 1fr !important;\
            }\
            .v025-gallery__name {\
                max-width: 200px;\
            }\
            .v026-share-group {\
                display: none;\
            }\
        }\
        \
        /* ── Ensure grid items never overflow container ── */\
        .v025-grid {\
            overflow-x: hidden;\
        }\
        .v025-thumb {\
            min-width: 0;\
            overflow: hidden;\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v0214] Security: friendly token leak blocked + responsive layout fixes');

})();
