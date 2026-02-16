/* =============================================================================
   SG/Send — i18n Override
   v0.1.6 — IFD surgical override: brand + design-aware strings

   Changes from v0.1.5:
     - Brand tagline: "Your files, your keys, your privacy"
     - Brand name updates
   ============================================================================= */

(function() {
    'use strict';

    const newKeys = {
        // ─── Brand ──────────────────────────────────────────────────
        'app.title':            'SG/Send',
        'app.tagline':          'Your files, your keys, your privacy',
        'app.subtitle':         'Zero-knowledge encrypted file sharing',
    };

    // Merge into English strings
    Object.assign(I18n.strings.en, newKeys);

    console.log('[v0.1.6] i18n patched: brand tagline + design strings');
})();
