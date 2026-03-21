/* =============================================================================
   SGraph Send — Upload Component
   v0.2.15 — Surgical overlay on v0.2.14

   Changes:
     - Make auto-rotating carousel message area taller (more vertical space)
       The trust-building messages during encrypt/upload now use more of the
       available space with larger padding and min-height.

   Loads AFTER v0.2.14 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0215] SendUpload not found — skipping');
    return;
}

// ─── Styles: taller carousel message area ────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0215-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0215-styles';
    style.textContent = '\
        /* ── Taller processing columns — use more vertical space ── */\
        .v028-process-columns {\
            min-height: 160px !important;\
            margin-top: var(--space-5, 1.25rem) !important;\
        }\
        \
        /* ── Taller carousel message box ── */\
        .v028-process-col--messages .v027-carousel__message {\
            padding: var(--space-5, 1.25rem) var(--space-5, 1.25rem) !important;\
            min-height: 100px !important;\
        }\
        \
        /* ── Larger icon and text in carousel ── */\
        .v028-process-col--messages .v027-carousel__icon {\
            font-size: 1.5rem !important;\
        }\
        .v028-process-col--messages .v027-carousel__text {\
            font-size: var(--text-base, 1rem) !important;\
            line-height: 1.6 !important;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0215] Taller carousel message area');

})();
