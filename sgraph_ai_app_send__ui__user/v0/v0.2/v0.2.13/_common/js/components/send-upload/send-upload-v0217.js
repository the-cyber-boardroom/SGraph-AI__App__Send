/* =============================================================================
   SGraph Send — Upload Component
   v0.2.17 — Surgical overlay on v0.2.16

   Changes:
     - Gallery delivery for single files: when user selects Gallery for a
       single file upload, wrap it in a zip with _gallery.{hash}/ folder
       containing thumbnail + manifest. The share link opens Gallery view
       with the single file displayed with its thumbnail.
     - Previously, gallery was only generated for folder uploads (via
       _v023_compressFolder). Single file uploads skipped the zip step
       entirely, so the gallery URL pointed to raw content with no
       _gallery folder.

   Loads AFTER v0.2.16 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0217] SendUpload not found — skipping');
    return;
}

// ─── Override: _v023_startProcessing — wrap single file in zip for gallery ──
//
// The v0.2.3 startProcessing only zips when _folderScan exists (folder upload).
// For single file + gallery delivery, we need to:
//   1. Create a JSZip with the single file
//   2. Call _v0213_addPreviewToZip to generate _gallery.{hash}/ with thumbnails
//   3. Replace this.selectedFile with the zip
//   4. Continue with the normal processing chain
//
// We intercept at the v0.2.3 level by synthesising a _folderScan so the
// existing _v023_compressFolder → _v0213_addPreviewToZip pipeline works.

var _v0216_startProcessing = SendUpload.prototype._v023_startProcessing;

SendUpload.prototype._v023_startProcessing = async function() {
    var delivery = this._v023_selectedDelivery || 'download';
    var isSingleFile = !this._folderScan && this.selectedFile;

    if (delivery === 'gallery' && isSingleFile) {
        // Synthesise a minimal _folderScan so the existing pipeline works.
        // The _v023_compressFolder → _v0213_addPreviewToZip pipeline will:
        //   1. Create a zip with the single file
        //   2. Generate _gallery.{hash}/ folder with thumbnail + manifest
        //   3. Replace this.selectedFile with the zip
        var file = this.selectedFile;
        this._folderScan = {
            entries:   [{ name: file.name, path: file.name, isDir: false, file: file }],
            totalSize: file.size,
            fileCount: 1
        };
        this._folderName = file.name.replace(/\.[^.]+$/, '') || 'file';
        this._folderOptions = this._folderOptions || { level: 4, includeEmpty: false, includeHidden: false };
        this._v0217_singleFileGallery = true;

        console.log('[v0217] Single file gallery: wrapping "' + file.name + '" in zip with gallery folder');
    }

    await _v0216_startProcessing.call(this);
};

console.log('[send-upload-v0217] Single file gallery delivery support');

})();
