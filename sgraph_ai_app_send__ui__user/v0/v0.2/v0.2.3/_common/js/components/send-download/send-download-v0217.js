/* =============================================================================
   SGraph Send — Download Component
   v0.2.17 — Surgical overlay on v0.2.16

   Gallery view fixes:
     1. Type badges (WEBP, JPG, MD, PDF) escaping to page top-right.
        Root cause: .v025-thumb__img lacks position:relative, so
        position:absolute badges float to nearest positioned ancestor.
     2. Grid view overflow — thumbnails bleed past card boundaries.
        Root cause: grid children need min-width:0 to respect column bounds.
     3. Large view — images way too large, overlap and clip at edges.
        Fix: constrain max column width and enforce proper containment.
     4. Print view — gaps between thumbnails, images not properly sized.
        Fix: tighter print grid, force aspect-ratio, proper containment.

   Loads AFTER v0.2.16 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0217] SendDownload not found — skipping');
    return;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES — Gallery layout fixes
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0217-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0217-download-styles';
    s.textContent = '\
        /* ═══ FIX 1: Badge containment ═══ */\
        /* .v025-thumb__img needs position:relative so position:absolute */\
        /* badges stay inside the image container, not float to page */\
        .v025-thumb__img {\
            position: relative;\
        }\
        \
        /* ═══ FIX 2: Grid item overflow containment ═══ */\
        /* Grid children need min-width:0 to respect column bounds */\
        .v025-thumb {\
            min-width: 0;\
            max-width: 100%;\
        }\
        \
        /* Ensure the grid container clips horizontally */\
        .v025-grid {\
            overflow-x: hidden;\
        }\
        \
        /* ═══ FIX 3: Large view — constrain column width ═══ */\
        .v025-grid--large {\
            grid-template-columns: repeat(auto-fill, minmax(280px, 480px)) !important;\
            justify-content: center;\
        }\
        .v025-grid--large .v025-thumb {\
            overflow: hidden;\
        }\
        .v025-grid--large .v025-thumb__img {\
            aspect-ratio: 4/3;\
            overflow: hidden;\
        }\
        \
        /* ═══ FIX 4: Grid view — tighter containment ═══ */\
        .v025-grid--grid .v025-thumb {\
            overflow: hidden;\
        }\
        .v025-grid--grid .v025-thumb__img {\
            overflow: hidden;\
        }\
        \
        /* ═══ FIX 5: Print styles — better gallery layout ═══ */\
        @media print {\
            /* Hide UI chrome */\
            .v025-view-modes,\
            .v026-share-group,\
            .v025-gallery__header-right,\
            .v027-mode-switch {\
                display: none !important;\
            }\
            \
            /* Gallery container */\
            .v025-gallery {\
                background: none !important;\
                border: none !important;\
                box-shadow: none !important;\
            }\
            \
            /* Grid: 3-column, tight, no overflow */\
            .v025-grid {\
                display: grid !important;\
                grid-template-columns: repeat(3, 1fr) !important;\
                gap: 6px !important;\
                padding: 6px 0 !important;\
                overflow: visible !important;\
                page-break-inside: auto;\
            }\
            \
            /* Thumbnail cards */\
            .v025-thumb {\
                break-inside: avoid;\
                page-break-inside: avoid;\
                border: 1px solid #ccc !important;\
                border-radius: 4px !important;\
                background: #f5f5f5 !important;\
                overflow: hidden !important;\
            }\
            \
            /* Thumbnail images: force aspect ratio */\
            .v025-thumb__img {\
                aspect-ratio: 4/3 !important;\
                background-size: cover !important;\
                background-position: center !important;\
                print-color-adjust: exact !important;\
                -webkit-print-color-adjust: exact !important;\
            }\
            \
            /* Labels */\
            .v025-thumb__label {\
                color: #333 !important;\
                font-size: 0.65rem !important;\
                padding: 3px 6px !important;\
                white-space: nowrap;\
                overflow: hidden;\
                text-overflow: ellipsis;\
            }\
            \
            /* Type badges in print */\
            .v026-thumb__type-badge {\
                background: #eee !important;\
                color: #555 !important;\
                border: 1px solid #ccc !important;\
                print-color-adjust: exact !important;\
                -webkit-print-color-adjust: exact !important;\
            }\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v0217] Gallery fixes: badge containment, grid overflow, large view, print');

})();
