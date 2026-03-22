/* =============================================================================
   SGraph Send — Upload Component
   v0.2.9 — Surgical overlay on v0.2.8

   Originally added friendly token → transfer ID derivation here, but this
   logic has been moved to v0.2.6 (where friendly tokens originate) so that
   ALL versions loading v0.2.6 get correct transfer ID derivation.

   This overlay is now a no-op — kept for script loading compatibility.

   Loads AFTER v0.2.8 — no overrides needed.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v029] SendUpload not found — skipping');
    return;
}

console.log('[send-upload-v029] Friendly token transfer ID derivation (handled by v0.2.6)');

})();
