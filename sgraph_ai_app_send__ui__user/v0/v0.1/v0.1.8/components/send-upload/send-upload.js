/* =============================================================================
   SG/Send — Upload Component Override
   v0.1.8 — IFD surgical override (download URLs only)

   Changes from v0.1.6:
     - Download URLs point to v0.1.8/download.html (preview window)
   ============================================================================= */

(function() {
    'use strict';

    // ─── Update download URLs to v0.1.8 (preview-enabled download page) ─

    SendUpload.prototype.buildCombinedUrl = function(tid, key) {
        return `${window.location.origin}/send/v0/v0.1/v0.1.8/download.html#${tid}/${key}`;
    };

    SendUpload.prototype.buildLinkOnlyUrl = function(tid) {
        return `${window.location.origin}/send/v0/v0.1/v0.1.8/download.html#${tid}`;
    };

    console.log('[v0.1.8] SendUpload patched: download URLs → v0.1.8 (preview window)');
})();
