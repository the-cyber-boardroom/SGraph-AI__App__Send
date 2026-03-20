/* =============================================================================
   SGraph Send — Upload Component
   v0.2.14 — Surgical overlay on v0.2.13

   Changes:
     - Remove gallery preview from Step 2 (Delivery) entirely.
       Thumbnails aren't calculated until zip creation, so showing a
       preview at this stage is misleading. The gallery card in Step 2
       now goes straight to Step 3 (share mode) like other delivery options.

   Loads AFTER v0.2.13 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0214] SendUpload not found — skipping');
    return;
}

// ─── Override: skip gallery preview entirely ────────────────────────────────
// v0.2.12 intercepts the gallery card click to show a preview.
// We override setupEventListeners to let the gallery card work like
// any other delivery card — just select it and move on.

var _v0213_setupListeners = SendUpload.prototype.setupEventListeners;

SendUpload.prototype.setupEventListeners = function() {
    // Always suppress the gallery preview flag
    this._v0212_galleryPreview = false;
    _v0213_setupListeners.call(this);
};

// ─── Override: Step 2 render never shows gallery preview ────────────────────
var _v0213_renderStep2 = SendUpload.prototype._v023_renderStep2;

SendUpload.prototype._v023_renderStep2 = function() {
    // Force-suppress gallery preview — always render normal Step 2
    this._v0212_galleryPreview = false;
    this._v0212_suppressPreview = true;
    var html = _v0213_renderStep2.call(this);
    this._v0212_suppressPreview = false;
    return html;
};

console.log('[send-upload-v0214] Removed gallery preview from Step 2 (Delivery)');

})();
