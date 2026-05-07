/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Engine Secret Patch (v0.3.2)

   Wraps UploadEngine.run to:
   1. If _pendingSecretConfig is set (by send-upload-secret.js), transiently
      patches ApiClient.createTransfer to pass secret params.
   2. Builds the /en-gb/s/{transferId}#{keyString} receive URL and sets it as
      result.combinedUrl (used by upload-step-done-secret.js).
   3. Returns deleteAuth in the result so the done state can build the kill URL.

   The transient ApiClient patch approach ensures only this one createTransfer
   call gets the secret params. The original is restored immediately after.

   Load AFTER upload-engine.js and send-upload-secret.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

var _origEngineRun = UploadEngine.run;

UploadEngine.run = async function(opts) {
    var secretConfig = UploadEngine._pendingSecretConfig;
    var deleteAuth   = UploadEngine._pendingDeleteAuth;

    if (secretConfig) {
        // Transiently patch createTransfer to include secretConfig for this call
        var _origCreate = ApiClient.createTransfer.bind(ApiClient);
        ApiClient.createTransfer = async function(fileSize, contentType) {
            // Restore immediately so only this one call gets the secret params
            ApiClient.createTransfer = _origCreate;
            return _origCreate(fileSize, contentType, secretConfig);
        };
    }

    var result = await _origEngineRun.call(this, opts);

    if (secretConfig) {
        // Override combinedUrl with the secret receive URL: /en-gb/s/{id}#{key}
        var locale             = UploadEngine.detectLocalePrefix();
        result.combinedUrl     = window.location.origin + '/' + locale +
                                 '/s/' + result.transferId + '#' + result.keyString;
        result.deleteAuth      = deleteAuth;
        result.isSecretMode    = true;
    }

    return result;
};
