/* =============================================================================
   SGraph Send — Upload Component
   v0.2.9 — Surgical overlay on v0.2.8

   Changes:
     - Friendly token now derives BOTH:
       1. Transfer ID (SHA-256 → 12 hex chars) — passed to server at create time
       2. AES-256 key (PBKDF2) — used for encryption
     - Uses shared FriendlyCrypto module (friendly-crypto.js)
     - Replaces v0.2.6's inline PBKDF2 derivation with FriendlyCrypto.deriveKey
     - Adds FriendlyCrypto.deriveTransferId call during transfer creation

   Loads AFTER v0.2.8 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v029] SendUpload not found — skipping v0.2.9 overrides');
    return;
}
if (typeof FriendlyCrypto === 'undefined') {
    console.warn('[send-upload-v029] FriendlyCrypto not found — skipping v0.2.9 overrides');
    return;
}

// ─── Store the method we override ───────────────────────────────────────────
var _v028_startProcessing = SendUpload.prototype._v023_startProcessing;

// ─── Override: startProcessing — derive transfer ID + key from friendly token ──
SendUpload.prototype._v023_startProcessing = async function() {
    var self = this;

    if (this._v026_shareMode === 'token' && this._v026_friendlyKey) {
        // Derive deterministic transfer ID from friendly key
        var derivedTransferId = await FriendlyCrypto.deriveTransferId(this._v026_friendlyKey);

        // Swap key generation to use PBKDF2 from friendly key
        var origGenKey = SendCrypto.generateKey;
        SendCrypto.generateKey = function() {
            return FriendlyCrypto.deriveKey(self._v026_friendlyKey);
        };

        // Swap createTransfer to pass derived transfer ID
        var origCreateTransfer = ApiClient.createTransfer.bind(ApiClient);
        var boundCreateTransfer = function(fileSize, contentType) {
            return origCreateTransfer(fileSize, contentType, derivedTransferId);
        };
        ApiClient.createTransfer = boundCreateTransfer;

        try {
            await _v028_startProcessing.call(this);
        } finally {
            SendCrypto.generateKey = origGenKey;
            ApiClient.createTransfer = origCreateTransfer;
        }

        // Store friendly key in result and re-render
        if (this.result) {
            this.result.friendlyKey = this._v026_friendlyKey;
            this.render();
            this.setupDynamicListeners();
        }
    } else {
        await _v028_startProcessing.call(this);
    }
};

console.log('[send-upload-v029] Friendly token derives transfer ID + AES key');

})();
