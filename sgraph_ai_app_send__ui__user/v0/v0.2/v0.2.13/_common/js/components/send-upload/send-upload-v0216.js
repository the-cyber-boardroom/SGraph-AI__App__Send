/* =============================================================================
   SGraph Send — Upload Component
   v0.2.16 — Surgical overlay on v0.2.15

   Changes:
     - Fix: clicking "Upload" step resets file selection so user can drop
       a new file. Other step links (Delivery, Share mode, Confirm) still
       preserve state for back-navigation.

   Loads AFTER v0.2.15 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0216] SendUpload not found — skipping');
    return;
}

// ─── Override navigateToStep: reset file state when going back to Upload ──

var _v0215_navigateToStep = SendUpload.prototype._v0214_navigateToStep;

SendUpload.prototype._v0214_navigateToStep = function(step) {
    if (step === 1) {
        // Reset file-related state so user can drop a new file
        this.selectedFile       = null;
        this._folderScan        = null;
        this._v023_deliveryOptions     = null;
        this._v023_selectedDelivery    = null;
        this._v023_recommendedDelivery = null;
        this._v026_friendlyParts       = null;
        this._v026_friendlyKey         = null;

        // Reset the file input so the same file can be re-selected
        var fileInput = this.querySelector('#file-input');
        if (fileInput) fileInput.value = '';
        var folderInput = this.querySelector('#folder-input');
        if (folderInput) folderInput.value = '';
    }

    _v0215_navigateToStep.call(this, step);
};

console.log('[send-upload-v0216] Upload step resets file selection');

})();
