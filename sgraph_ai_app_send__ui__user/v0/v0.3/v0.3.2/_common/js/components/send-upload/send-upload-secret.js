/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — SendUpload Secret Mode Patch (v0.3.2)

   Adds the secret fast-path to the SendUpload orchestrator:
   1. Listens for 'step-secret-submit' on already-connected elements.
   2. Patches _startProcessing to compute deleteAuth before the engine run.
   3. Patches _resetForNew to clear secret mode state.

   When 'step-secret-submit' fires:
   - Text is wrapped in a File blob (secret.txt)
   - _secretConfig is set with max_downloads, auto_delete, expires_at (int ms)
   - _isSecretMode = true
   - Calls _startProcessing() — skipping steps 2-4 entirely

   NOTE: expires_at is sent as int milliseconds (Timestamp_Now convention).
   The backend Schema__Transfer currently declares expires_at: str (ISO-8601).
   This mismatch must be fixed in Schema__Transfer and Transfer__Service._is_expired().
   The fix: change str → int, replace datetime.fromisoformat() with
   time.time()*1000 > expires_at comparison. Tracked as a separate backend task.

   Load AFTER send-upload.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── 1. Wire 'step-secret-submit' on already-connected send-upload elements ──

(function() {
    document.querySelectorAll('send-upload').forEach(function(el) {
        _wireSecretEvents(el);
    });

    function _wireSecretEvents(el) {
        var c = el.querySelector('.step-content');
        if (!c || c._secretWired) return;
        c._secretWired = true;

        c.addEventListener('step-secret-submit', function(e) {
            _handleSecretSubmit(el, e.detail);
        });
    }

    function _handleSecretSubmit(el, detail) {
        var text   = detail.text;
        var config = detail.config;  // { maxDownloads, expiresInHours }

        // Convert text to a File blob — same content pipeline as regular upload
        var blob = new Blob([text], { type: 'text/plain' });
        var file = new File([blob], 'secret.txt', { type: 'text/plain' });
        el.selectedFile = file;

        // expires_at: Timestamp_Now format (int milliseconds since epoch)
        // The # fragment key never touches the server — zero-knowledge preserved
        el._secretConfig = {
            max_downloads: config.maxDownloads,
            auto_delete:   config.maxDownloads > 0,
            expires_at:    config.expiresInHours > 0
                           ? Date.now() + (config.expiresInHours * 3600000)
                           : 0
        };
        el._shareMode        = 'combined'; // Key always embedded in URL fragment
        el._selectedDelivery = 'download';
        el._isSecretMode     = true;

        // Land on the Confirm step (matches the file flow). User clicks
        // "Encrypt & Upload" there to start processing.
        el.state = 'confirming';
    }
})();

// ─── 2. Patch _wireEvents to also wire secret events for future instances ────

var _origWireEvents = SendUpload.prototype._wireEvents;
SendUpload.prototype._wireEvents = function() {
    _origWireEvents.call(this);
    var self = this;
    var c    = this.querySelector('.step-content');
    if (!c || c._secretWired) return;
    c._secretWired = true;
    c.addEventListener('step-secret-submit', function(e) {
        var text   = e.detail.text;
        var config = e.detail.config;
        var blob   = new Blob([text], { type: 'text/plain' });
        var file   = new File([blob], 'secret.txt', { type: 'text/plain' });
        self.selectedFile = file;
        self._secretConfig = {
            max_downloads: config.maxDownloads,
            auto_delete:   config.maxDownloads > 0,
            expires_at:    config.expiresInHours > 0
                           ? Date.now() + (config.expiresInHours * 3600000)
                           : 0
        };
        self._shareMode        = 'combined';
        self._selectedDelivery = 'download';
        self._isSecretMode     = true;
        self.state             = 'confirming';
    });
};

// ─── 3. Patch _startProcessing to compute deleteAuth before engine run ───────
//
//     deleteAuth is a cryptographically random 32-byte token.
//     The server stores sha256(deleteAuth) and validates it on DELETE.
//     The kill URL carries the raw deleteAuth in the fragment — the fragment is
//     never sent in HTTP requests (zero-knowledge guarantee).

var _origStartProcessing = SendUpload.prototype._startProcessing;
SendUpload.prototype._startProcessing = async function() {
    if (this._isSecretMode && this._secretConfig && !this._secretConfig.delete_auth_hash) {
        // Generate a random delete auth token
        var deleteAuthBytes = new Uint8Array(32);
        crypto.getRandomValues(deleteAuthBytes);
        var deleteAuth = Array.from(deleteAuthBytes)
            .map(function(b) { return b.toString(16).padStart(2, '0'); })
            .join('');
        this._deleteAuth = deleteAuth;

        // Hash it for server storage
        var enc     = new TextEncoder();
        var hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(deleteAuth));
        this._secretConfig.delete_auth_hash = Array.from(new Uint8Array(hashBuf))
            .map(function(b) { return b.toString(16).padStart(2, '0'); })
            .join('');

        // Signal engine patch to intercept createTransfer (via pending context)
        UploadEngine._pendingSecretConfig = this._secretConfig;
        UploadEngine._pendingDeleteAuth   = this._deleteAuth;
    }
    try {
        return await _origStartProcessing.call(this);
    } finally {
        UploadEngine._pendingSecretConfig = null;
        UploadEngine._pendingDeleteAuth   = null;
    }
};

// ─── 4. Patch _resetForNew to clear secret state ─────────────────────────────

var _origResetForNew = SendUpload.prototype._resetForNew;
SendUpload.prototype._resetForNew = function() {
    _origResetForNew.call(this);
    this._secretConfig = null;
    this._isSecretMode = false;
    this._deleteAuth   = null;
};
