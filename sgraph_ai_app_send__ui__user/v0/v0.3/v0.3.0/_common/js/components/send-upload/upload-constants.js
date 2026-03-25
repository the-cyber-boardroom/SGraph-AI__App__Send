/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Constants
   v0.3.0 — Shared configuration for the upload workflow

   Step labels, state-to-step mapping, carousel messages, size limits, SGMETA.
   ═══════════════════════════════════════════════════════════════════════════════ */

var UploadConstants = (function() {
    'use strict';

    // ─── Six-step wizard (v0.2.8+) ──────────────────────────────────────
    var STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];
    var TOTAL_STEPS = 6;

    var STATE_TO_STEP = {
        'idle': 1, 'folder-options': 1, 'file-ready': 1,
        'choosing-delivery': 2,
        'choosing-share': 3,
        'confirming': 4,
        'zipping': 5, 'reading': 5, 'encrypting': 5,
        'creating': 5, 'uploading': 5, 'completing': 5,
        'complete': 6,
        'error': 1
    };

    var PROCESSING_STATES = ['zipping','reading','encrypting','creating','uploading','completing'];

    // ─── Size limits ────────────────────────────────────────────────────
    var MAX_FILE_SIZE_DIRECT    = 5 * 1024 * 1024;           //   5 MB
    var MAX_FILE_SIZE_PRESIGNED = 10 * 1024 * 1024 * 1024;   //  10 GB
    var MAX_FILE_SIZE           = MAX_FILE_SIZE_DIRECT;       // updated at runtime
    var PARALLEL_UPLOADS        = 5;

    // ─── SGMETA envelope ────────────────────────────────────────────────
    var SGMETA_MAGIC = new Uint8Array([0x53, 0x47, 0x4D, 0x45, 0x54, 0x41]);

    // ─── Carousel messages (trust-building, shown during processing) ────
    var CAROUSEL_MESSAGES = [
        { icon: '\uD83D\uDD12',       text: 'Your file is encrypted with AES-256-GCM. The key never leaves your device.' },
        { icon: '\uD83D\uDEE1\uFE0F', text: "Even we can't read what you're uploading. That's the point." },
        { icon: '\uD83C\uDF6A',       text: 'Zero cookies. Zero tracking. Verify: open DevTools \u2192 Application \u2192 Cookies.' },
        { icon: '\uD83C\uDFD4\uFE0F', text: 'Tip: Share the code by voice, the link by text \u2014 different channels, maximum security.' },
        { icon: '\uD83D\uDCDC',       text: 'Our privacy policy is six sentences. No lawyers needed.' },
        { icon: '\uD83D\uDD11',       text: 'The decryption key is only in your browser. We never see it, store it, or transmit it.' },
        { icon: '\u2705',             text: 'No account required. No email collected. Just encrypted file sharing.' },
        { icon: '\uD83D\uDD2C',       text: "Don't trust us \u2014 verify. Open the Network tab and inspect every request we make." },
        { icon: '\uD83C\uDF0D',       text: 'Available in 17 languages. Same zero-knowledge encryption everywhere.' },
        { icon: '\uD83D\uDCE6',       text: 'Files are split into encrypted chunks. Each chunk is meaningless without your key.' }
    ];
    var CAROUSEL_INTERVAL_MS = 4000;

    // ─── Public API ─────────────────────────────────────────────────────
    return {
        STEP_LABELS:            STEP_LABELS,
        TOTAL_STEPS:            TOTAL_STEPS,
        STATE_TO_STEP:          STATE_TO_STEP,
        PROCESSING_STATES:      PROCESSING_STATES,
        MAX_FILE_SIZE_DIRECT:   MAX_FILE_SIZE_DIRECT,
        MAX_FILE_SIZE_PRESIGNED:MAX_FILE_SIZE_PRESIGNED,
        MAX_FILE_SIZE:          MAX_FILE_SIZE,
        PARALLEL_UPLOADS:       PARALLEL_UPLOADS,
        SGMETA_MAGIC:           SGMETA_MAGIC,
        CAROUSEL_MESSAGES:      CAROUSEL_MESSAGES,
        CAROUSEL_INTERVAL_MS:   CAROUSEL_INTERVAL_MS,

        setMaxFileSize: function(v) { this.MAX_FILE_SIZE = v; },

        isProcessing: function(state) {
            return PROCESSING_STATES.indexOf(state) !== -1;
        },

        stepForState: function(state) {
            return STATE_TO_STEP[state] || 1;
        },

        packageWithMetadata: function(contentBuffer, metadata) {
            var magic     = SGMETA_MAGIC;
            var metaBytes = new TextEncoder().encode(JSON.stringify(metadata));
            var metaLen   = metaBytes.length;
            var result    = new Uint8Array(magic.length + 4 + metaLen + contentBuffer.byteLength);
            result.set(magic, 0);
            result[magic.length]     = (metaLen >> 24) & 0xFF;
            result[magic.length + 1] = (metaLen >> 16) & 0xFF;
            result[magic.length + 2] = (metaLen >> 8) & 0xFF;
            result[magic.length + 3] = metaLen & 0xFF;
            result.set(metaBytes, magic.length + 4);
            result.set(new Uint8Array(contentBuffer), magic.length + 4 + metaLen);
            return result.buffer;
        }
    };
})();
