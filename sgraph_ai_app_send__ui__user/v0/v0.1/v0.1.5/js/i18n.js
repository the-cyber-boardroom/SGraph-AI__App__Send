/* =============================================================================
   SGraph Send — i18n Override
   v0.1.5 — IFD surgical override: adds new i18n keys for token usage + timings

   Changes from v0.1.4:
     - #14: Token usage strings (unlimited, remaining)
     - #8:  Timing section titles (upload + download)
   ============================================================================= */

(function() {
    'use strict';

    const newKeys = {
        // ─── #14: Token Usage Counter ─────────────────────────────────
        'upload.token.unlimited':       'Unlimited uses remaining',
        'upload.token.remaining':       '{remaining} uses remaining',

        // ─── #8: Workflow Timings ─────────────────────────────────────
        'upload.timing.title':          'Upload completed in',
        'download.timing.title':        'Download completed in',
    };

    // Merge into English strings
    Object.assign(I18n.strings.en, newKeys);

    console.log('[v0.1.5] i18n patched: token usage + timing keys');
})();
