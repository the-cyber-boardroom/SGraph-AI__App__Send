/* ════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.x: remove the "Secret" option (lock the selector to File)

   The secret-share flow is incomplete in v0.3.x (the /en-gb/s/ recipient page
   404s). Until secret is delivered properly as part of the v0.4.x launch, the
   upload selector is locked to File mode and the Secret/Text mode buttons are
   hidden so users only see the file uploader.

   Load LAST — after upload-step-select.js and upload-step-select-secret.js.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    if (typeof UploadStepSelect === 'undefined') return;

    var _origRenderIdle = UploadStepSelect.prototype._renderIdle;
    UploadStepSelect.prototype._renderIdle = function () {
        this._inputMode = 'file';                       // never 'secret' or 'text'
        _origRenderIdle.call(this);
        var sr = this.shadowRoot;
        if (sr && !sr.getElementById('sg-file-only-styles')) {
            var style = document.createElement('style');
            style.id = 'sg-file-only-styles';
            style.textContent = '#mode-secret,#mode-text{display:none !important;}';
            sr.appendChild(style);
        }
    };
})();
