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

        // ─── Transparency Panel ─────────────────────────────────────
        'transparency.title':               'What we stored about this transfer',
        'transparency.footer':              "That's everything. Nothing else is captured.",
        'transparency.ip_address':          'Your IP address',
        'transparency.upload_time':         'Upload time',
        'transparency.download_time':       'Download time',
        'transparency.file_size':           'File size',
        'transparency.label.file_name':     'File name',
        'transparency.label.file_content':  'File content',
        'transparency.label.decryption_key':'Decryption key',
        'transparency.label.raw_ip':        'Raw IP address',
        'transparency.not_stored':          'NOT stored',
        'transparency.encrypted':           'Encrypted (we cannot read it)',
        'transparency.key_not_stored':      'NOT stored (only you have it)',
    };

    // Merge into English strings
    Object.assign(I18n.strings.en, newKeys);

    console.log('[v0.1.6] i18n patched: brand tagline + design strings');
})();
